import * as React from "react"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { db, storage } from "@/lib/firebase"
import { useAuth, randomInviteCode } from "@/lib/firebase-auth-context"
import { BASE_TASKS } from "@/lib/tasks"
import type { AppUser, Business, ChatMessage, Invoice, Property, ServiceJob } from "@/types"

interface AddCustomerInput {
  name: string
  address: string
  phone?: string
  email?: string
  gateCode?: string
  hasSpa?: boolean
  monthlyRate?: number
  smsConsent?: boolean
}

interface UpdateCustomerInput {
  name: string
  address: string
  phone?: string
  email?: string
  gateCode?: string
  hasSpa?: boolean
  monthlyRate?: number
  smsConsent?: boolean
}

interface CreateInvoiceInput {
  propertyId: string
  amount: number
  period: string
  notes?: string
  /** Optional future "YYYY-MM-DD" date - when set, the PDF invoice email
   * doesn't go out immediately; the daily sendScheduledInvoices Cloud
   * Function sends it once that date arrives. */
  scheduledSendAt?: string
}

// Deliberately narrower than CreateInvoiceInput: no propertyId (an
// invoice never moves to a different customer) and callers should only
// ever pass this for an invoice that isn't "paid" yet - BillingPage
// enforces that in the UI, this type doesn't need to.
interface UpdateInvoiceInput {
  amount: number
  period: string
  notes?: string
  scheduledSendAt?: string
}

interface JobsStoreValue {
  jobs: ServiceJob[]
  properties: Property[]
  business: Business | null
  businessUsers: AppUser[]
  messages: ChatMessage[]
  invoices: Invoice[]
  loading: boolean
  updateJob: (id: string, patch: Partial<ServiceJob>) => Promise<void>
  addJob: (job: ServiceJob) => Promise<void>
  addCustomer: (input: AddCustomerInput) => Promise<{ propertyId: string; code: string }>
  updateCustomer: (propertyId: string, input: UpdateCustomerInput) => Promise<void>
  deleteCustomer: (propertyId: string) => Promise<void>
  uploadJobPhoto: (jobId: string, file: File) => Promise<string>
  uploadBusinessLogo: (file: File) => Promise<string>
  addMessage: (message: ChatMessage) => Promise<void>
  uploadChatPhoto: (propertyId: string, file: File) => Promise<void>
  markThreadRead: (propertyId: string) => Promise<void>
  getProperty: (id: string | null | undefined) => Property | undefined
  getUser: (id: string | null | undefined) => AppUser | undefined
  createInvoice: (input: CreateInvoiceInput) => Promise<string>
  updateInvoice: (invoiceId: string, patch: UpdateInvoiceInput) => Promise<void>
  markInvoicePaid: (invoiceId: string, paid: boolean) => Promise<void>
  deleteInvoice: (invoiceId: string) => Promise<void>
  /** Admin-only in the UI (firestore.rules allow a business admin to delete). */
  deleteJob: (jobId: string) => Promise<void>
  updateCustomerSentiment: (propertyId: string, sentiment: number) => Promise<void>
  updateBusiness: (patch: Partial<Business>) => Promise<void>
}

const JobsStoreContext = React.createContext<JobsStoreValue | undefined>(
  undefined
)

// Firestore's addDoc/updateDoc reject any field whose value is literally
// `undefined` (e.g. an optional field cleared to "" and passed through
// `value || undefined`) - it has to be omitted from the object entirely
// instead. Every write in this file that could carry an optional field
// goes through this first so that pattern can never reach Firestore.
function stripUndefined<T extends object>(obj: T): T {
  const result = { ...obj }
  for (const key of Object.keys(result) as (keyof T)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

function nextOccurrenceDate(dateStr: string, rule: ServiceJob["recurrence"]) {
  // dateStr is a plain "YYYY-MM-DD" string. Parsing it bare gives UTC
  // midnight, but .setDate/.setMonth below operate in LOCAL time - mixing
  // the two, then formatting the result back out with toISOString() (which
  // converts to UTC again), could shift the computed next-visit date by a
  // day depending on the technician's timezone. Parsing as local midnight
  // and formatting the result back out in local time too keeps this
  // consistent end to end.
  const date = new Date(`${dateStr}T00:00:00`)
  if (rule === "weekly") date.setDate(date.getDate() + 7)
  else if (rule === "biweekly") date.setDate(date.getDate() + 14)
  else if (rule === "monthly") date.setMonth(date.getMonth() + 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function JobsStoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const businessId = user?.businessId
  const isProvider = user?.role === "provider"

  const [jobs, setJobs] = React.useState<ServiceJob[]>([])
  const [properties, setProperties] = React.useState<Property[]>([])
  const [business, setBusiness] = React.useState<Business | null>(null)
  const [businessUsers, setBusinessUsers] = React.useState<AppUser[]>([])
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!businessId || !user) {
      setJobs([])
      setProperties([])
      setBusiness(null)
      setBusinessUsers([])
      setMessages([])
      setInvoices([])
      setLoading(false)
      return
    }
    setLoading(true)

    // Providers see every job/property in their business; owners (customers)
    // only ever see the single property/jobs linked to their own account -
    // both client-side here and enforced by Firestore rules.
    const jobsQuery = isProvider
      ? query(collection(db, "jobs"), where("businessId", "==", businessId))
      : query(collection(db, "jobs"), where("propertyId", "==", user.propertyId ?? "__none__"))

    const unsubJobs = onSnapshot(jobsQuery, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceJob))
      setLoading(false)
    })

    let unsubProperties: () => void
    if (isProvider) {
      unsubProperties = onSnapshot(
        query(collection(db, "properties"), where("businessId", "==", businessId)),
        (snap) => {
          setProperties(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property))
        }
      )
    } else if (user.propertyId) {
      unsubProperties = onSnapshot(doc(db, "properties", user.propertyId), (snap) => {
        setProperties(snap.exists() ? [{ id: snap.id, ...snap.data() } as Property] : [])
      })
    } else {
      setProperties([])
      unsubProperties = () => {}
    }

    const unsubBusiness = onSnapshot(doc(db, "businesses", businessId), (snap) => {
      setBusiness(snap.exists() ? ({ id: snap.id, ...snap.data() } as Business) : null)
    })

    // Customers may only read their provider's staff profiles (security
    // rules in firestore.rules), never other customers' - so the owner-side
    // query has to filter to providers or Firestore rejects it outright.
    const unsubUsers = onSnapshot(
      isProvider
        ? query(collection(db, "users"), where("businessId", "==", businessId))
        : query(
            collection(db, "users"),
            where("businessId", "==", businessId),
            where("role", "==", "provider")
          ),
      (snap) => {
        setBusinessUsers(
          snap.docs.map(
            (d) =>
              ({
                id: d.id,
                businessId: d.data().businessId,
                role: d.data().role,
                businessRole: d.data().businessRole ?? undefined,
                name: d.data().name,
                email: d.data().email,
                phone: d.data().phone ?? undefined,
              }) as AppUser
          )
        )
      }
    )

    // Providers see every conversation in their business; owners only see
    // the single conversation tied to their own property.
    const messagesQuery = isProvider
      ? query(
          collection(db, "messages"),
          where("businessId", "==", businessId),
          orderBy("createdAt", "asc")
        )
      : query(
          collection(db, "messages"),
          where("propertyId", "==", user.propertyId ?? "__none__"),
          orderBy("createdAt", "asc")
        )
    const unsubMessages = onSnapshot(messagesQuery, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage))
    })

    // Same provider-sees-all / owner-sees-own-property split as jobs.
    const invoicesQuery = isProvider
      ? query(collection(db, "invoices"), where("businessId", "==", businessId))
      : query(collection(db, "invoices"), where("propertyId", "==", user.propertyId ?? "__none__"))
    const unsubInvoices = onSnapshot(invoicesQuery, (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice))
    })

    return () => {
      unsubJobs()
      unsubProperties()
      unsubBusiness()
      unsubUsers()
      unsubMessages()
      unsubInvoices()
    }
    // Deliberately NOT depending on the whole `user` object (only
    // user?.id/user?.propertyId, the only fields this effect actually
    // reads) - this was the real cause of chat feeling slow. `user` comes
    // from a live onSnapshot on the user's own users/{uid} doc in
    // firebase-auth-context.tsx, which produces a brand-new object on
    // EVERY write to that doc - including markThreadRead's lastReadAt
    // update, which fires every time a new message arrives in an open
    // conversation (see ChatThreadPage.tsx). With `user` in this
    // dependency array, receiving a chat message was tearing down and
    // re-subscribing ALL SIX of this store's listeners (jobs, properties,
    // business, businessUsers, messages, invoices) every single time -
    // trading a live, low-latency Firestore update for a full
    // re-fetch-from-scratch, on every message. Keying on the two fields
    // that actually change what gets queried fixes that without losing
    // the "re-run when the signed-in user or their property changes"
    // behavior this effect needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isProvider, user?.id, user?.propertyId])

  const updateJob = React.useCallback(
    async (id: string, patch: Partial<ServiceJob>) => {
      await updateDoc(doc(db, "jobs", id), stripUndefined(patch))

      if (patch.status === "completed" && businessId) {
        const job = jobs.find((j) => j.id === id)
        if (job && job.recurrence !== "none") {
          const alreadyHasNext = jobs.some(
            (j) =>
              j.propertyId === job.propertyId &&
              j.status !== "completed" &&
              j.scheduledDate > job.scheduledDate
          )
          if (!alreadyHasNext) {
            await addDoc(collection(db, "jobs"), {
              businessId: job.businessId,
              propertyId: job.propertyId,
              ownerId: job.ownerId,
              technicianId: job.technicianId,
              status: "scheduled",
              serviceType: job.serviceType,
              scheduledDate: nextOccurrenceDate(
                job.scheduledDate,
                job.recurrence
              ),
              scheduledTime: job.scheduledTime,
              estMinutes: job.estMinutes,
              // Reseed from the base checklist only - not job.tasks. Any
              // extra items a provider added to this specific visit (algae
              // treatment, spa treatment, etc.) were for this visit alone
              // and should never automatically carry forward onto every
              // future recurring job.
              tasks: BASE_TASKS.map((t) => ({ ...t, done: false })),
              recurrence: job.recurrence,
              createdAt: new Date().toISOString(),
            })
          }
        }
      }
    },
    [jobs, businessId]
  )

  const addJob = React.useCallback(async (job: ServiceJob) => {
    const { id: _id, ...rest } = job
    void _id
    await addDoc(collection(db, "jobs"), stripUndefined(rest))
  }, [])

  const addCustomer = React.useCallback(
    async (input: AddCustomerInput) => {
      if (!businessId) throw new Error("No business found for this account.")
      const propertyRef = await addDoc(collection(db, "properties"), {
        businessId,
        customerName: input.name,
        address: input.address,
        phone: input.phone || null,
        email: input.email || null,
        gateCode: input.gateCode || null,
        hasSpa: input.hasSpa ?? false,
        monthlyRate: input.monthlyRate ?? null,
        smsConsent: input.smsConsent ?? false,
        ownerId: null,
        claimed: false,
        inviteCode: "",
        createdAt: new Date().toISOString(),
      })

      const code = randomInviteCode()
      await updateDoc(propertyRef, { inviteCode: code })
      await setDoc(doc(db, "inviteCodes", code), {
        businessId,
        propertyId: propertyRef.id,
        used: false,
        createdAt: serverTimestamp(),
      })

      return { propertyId: propertyRef.id, code }
    },
    [businessId]
  )

  const updateCustomer = React.useCallback(
    async (propertyId: string, input: UpdateCustomerInput) => {
      await updateDoc(doc(db, "properties", propertyId), {
        customerName: input.name,
        address: input.address,
        phone: input.phone || null,
        email: input.email || null,
        gateCode: input.gateCode || null,
        hasSpa: input.hasSpa ?? false,
        monthlyRate: input.monthlyRate ?? null,
        smsConsent: input.smsConsent ?? false,
      })
    },
    []
  )

  const deleteCustomer = React.useCallback(async (propertyId: string) => {
    await deleteDoc(doc(db, "properties", propertyId))
  }, [])

  const uploadJobPhoto = React.useCallback(
    async (jobId: string, file: File) => {
      if (!businessId) throw new Error("No business found for this account.")
      const ext = file.type === "image/png" ? "png" : "jpg"
      const path = `jobs/${businessId}/${jobId}/photo-${Date.now()}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, "jobs", jobId), { photoUrl: url })
      return url
    },
    [businessId]
  )

  // Business logo - same upload-then-write-URL pattern as uploadJobPhoto
  // above, but there's only ever one logo per business (no jobId), so
  // the Storage path is keyed on businessId alone, and the download URL
  // is written onto the business doc instead of a job doc.
  const uploadBusinessLogo = React.useCallback(
    async (file: File) => {
      if (!businessId) throw new Error("No business found for this account.")
      const ext = file.type === "image/png" ? "png" : "jpg"
      const path = `logos/${businessId}/logo-${Date.now()}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, "businesses", businessId), { logoUrl: url })
      return url
    },
    [businessId]
  )

  const addMessage = React.useCallback(async (message: ChatMessage) => {
    const { id: _id, ...rest } = message
    void _id
    // Stored as a plain ISO string (like every other createdAt in this app)
    // rather than serverTimestamp() - the UI sorts/compares createdAt with
    // string methods, and a Firestore Timestamp object breaks that.
    await addDoc(collection(db, "messages"), {
      ...rest,
      createdAt: new Date().toISOString(),
    })
  }, [])

  const uploadChatPhoto = React.useCallback(
    async (propertyId: string, file: File) => {
      if (!businessId || !user) throw new Error("No business found for this account.")
      const ext = file.type === "image/png" ? "png" : "jpg"
      const path = `chat/${businessId}/${propertyId}/${Date.now()}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await addDoc(collection(db, "messages"), {
        propertyId,
        businessId,
        senderId: user.id,
        photoUrl: url,
        createdAt: new Date().toISOString(),
      })
    },
    [businessId, user]
  )

  const markThreadRead = React.useCallback(
    async (propertyId: string) => {
      if (!user) return
      try {
        await updateDoc(doc(db, "users", user.id), {
          [`lastReadAt.${propertyId}`]: new Date().toISOString(),
        })
      } catch {
        // Best-effort - an unread badge that doesn't clear immediately
        // isn't worth surfacing an error for.
      }
    },
    [user]
  )

  // Snapshots customer/business/payment details onto the invoice at
  // creation time - same reasoning as the ServiceJob reportXxx fields: the
  // public invoice page must never read the property/business docs
  // directly, and the payment info shown shouldn't silently change later
  // if the provider edits their Venmo/Zelle settings after sending it.
  const createInvoice = React.useCallback(
    async (input: CreateInvoiceInput) => {
      if (!businessId || !business) throw new Error("No business found for this account.")
      const property = properties.find((p) => p.id === input.propertyId)
      if (!property) throw new Error("Customer not found.")

      // Assigned inside a transaction so two invoices created back-to-back
      // (or from two devices) can never collide on the same number - each
      // read-then-write of nextInvoiceNumber is atomic.
      const businessRef = doc(db, "businesses", businessId)
      const invoiceNumber = await runTransaction(db, async (tx) => {
        const snap = await tx.get(businessRef)
        const current = (snap.data()?.nextInvoiceNumber as number | undefined) ?? 1000
        tx.update(businessRef, { nextInvoiceNumber: current + 1 })
        return current
      })

      const ref = await addDoc(
        collection(db, "invoices"),
        stripUndefined({
          businessId,
          propertyId: property.id,
          ownerId: property.ownerId,
          invoiceNumber,
          amount: input.amount,
          period: input.period,
          notes: input.notes || undefined,
          status: "unpaid" as const,
          createdAt: new Date().toISOString(),
          scheduledSendAt: input.scheduledSendAt || undefined,
          sentByUid: user?.id ?? null,
          sentByName: user?.name ?? null,
          snapCustomerName: property.customerName,
          // Lets the onInvoiceCreatedSendEmail Cloud Function auto-email
          // this invoice the moment it's created - see functions/invoices.js.
          snapCustomerEmail: property.email,
          // Same idea, for onInvoiceCreatedSendSms (functions/sms.js) - only
          // ever texted when the customer has actually consented.
          snapCustomerPhone: property.phone,
          snapSmsConsent: property.smsConsent ?? false,
          snapAddress: property.address,
          snapBusinessName: business.name,
          snapBusinessPhone: business.phone,
          snapBusinessAddress: business.address,
          snapVenmoUsername: business.venmoUsername,
          snapZelleContact: business.zelleContact,
          snapBusinessLogoUrl: business.logoUrl,
        })
      )
      return ref.id
    },
    [businessId, business, properties, user]
  )

  // Edits an existing invoice in place - amount, period, notes, and/or
  // its scheduled send date. Intentionally does NOT touch invoiceNumber,
  // status, paidAt, sentAt, or any of the snapXxx fields: those are
  // either immutable record-keeping (the invoice number) or state this
  // function has no business changing. If the invoice already went out
  // (sentAt is set), the customer may still be holding the old PDF/
  // amount - BillingPage surfaces that as a warning in the edit form,
  // this function doesn't re-send anything automatically.
  const updateInvoice = React.useCallback(
    async (invoiceId: string, patch: UpdateInvoiceInput) => {
      await updateDoc(
        doc(db, "invoices", invoiceId),
        stripUndefined({
          amount: patch.amount,
          period: patch.period,
          notes: patch.notes || undefined,
          scheduledSendAt: patch.scheduledSendAt || undefined,
        })
      )
    },
    []
  )

  const markInvoicePaid = React.useCallback(async (invoiceId: string, paid: boolean) => {
    await updateDoc(
      doc(db, "invoices", invoiceId),
      stripUndefined({
        status: paid ? "paid" : "unpaid",
        paidAt: paid ? new Date().toISOString() : undefined,
      })
    )
  }, [])

  const deleteInvoice = React.useCallback(async (invoiceId: string) => {
    await deleteDoc(doc(db, "invoices", invoiceId))
  }, [])

  const deleteJob = React.useCallback(async (jobId: string) => {
    await deleteDoc(doc(db, "jobs", jobId))
  }, [])

  // Manual sentiment marker (0-100) an admin sets from the customer's
  // profile page - see the Property.sentiment doc comment in types.
  const updateCustomerSentiment = React.useCallback(
    async (propertyId: string, sentiment: number) => {
      await updateDoc(doc(db, "properties", propertyId), { sentiment })
    },
    []
  )

  const updateBusiness = React.useCallback(
    async (patch: Partial<Business>) => {
      if (!businessId) throw new Error("No business found for this account.")
      const { id: _id, ...rest } = patch
      void _id
      await updateDoc(doc(db, "businesses", businessId), stripUndefined(rest))
    },
    [businessId]
  )

  const getProperty = React.useCallback(
    (id: string | null | undefined) => (id ? properties.find((p) => p.id === id) : undefined),
    [properties]
  )

  const getUser = React.useCallback(
    (id: string | null | undefined) =>
      id ? businessUsers.find((u) => u.id === id) : undefined,
    [businessUsers]
  )

  const value = React.useMemo(
    () => ({
      jobs,
      properties,
      business,
      businessUsers,
      messages,
      invoices,
      loading,
      updateJob,
      addJob,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      uploadJobPhoto,
      uploadBusinessLogo,
      addMessage,
      uploadChatPhoto,
      markThreadRead,
      getProperty,
      getUser,
      createInvoice,
      updateInvoice,
      markInvoicePaid,
      deleteInvoice,
      deleteJob,
      updateCustomerSentiment,
      updateBusiness,
    }),
    [
      jobs,
      properties,
      business,
      businessUsers,
      messages,
      invoices,
      loading,
      updateJob,
      addJob,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      uploadJobPhoto,
      uploadBusinessLogo,
      addMessage,
      uploadChatPhoto,
      markThreadRead,
      getProperty,
      getUser,
      createInvoice,
      updateInvoice,
      markInvoicePaid,
      deleteInvoice,
      deleteJob,
      updateCustomerSentiment,
      updateBusiness,
    ]
  )

  return (
    <JobsStoreContext.Provider value={value}>
      {children}
    </JobsStoreContext.Provider>
  )
}

export function useJobsStore() {
  const ctx = React.useContext(JobsStoreContext)
  if (!ctx) throw new Error("useJobsStore must be used within JobsStoreProvider")
  return ctx
}
