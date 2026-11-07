import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { useEffect, useState } from 'react'
import { db, storage } from './firebase'
import type { ChatMessage, CustomerEntry, CustomerRecord, Job, JobPhoto, Lang, PhotoTag, Profile, TaskKey } from './types'

export function threadIdFor(providerId: string, customerId: string) {
  return `${providerId}_${customerId}`
}

/** All jobs the signed-in person can see (provider: theirs; customer: theirs). */
export function useJobs(role: 'provider' | 'customer' | undefined, uid: string | undefined) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  useEffect(() => {
    if (!role || !uid) return
    const field = role === 'provider' ? 'providerId' : 'customerId'
    const q = query(collection(db, 'jobs'), where(field, '==', uid), orderBy('date', role === 'provider' ? 'asc' : 'desc'))
    return onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Job).sort(byDateTime(role === 'customer')))
    }, () => setJobs([]))
  }, [role, uid])
  return jobs
}

function byDateTime(desc: boolean) {
  return (a: Job, b: Job) => {
    const x = `${a.date} ${a.startTime}`
    const y = `${b.date} ${b.startTime}`
    return desc ? y.localeCompare(x) : x.localeCompare(y)
  }
}

export function useJob(id: string | undefined) {
  const [job, setJob] = useState<Job | null | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, 'jobs', id), (snap) => {
      setJob(snap.exists() ? ({ id: snap.id, ...snap.data() } as Job) : null)
    }, () => setJob(null))
  }, [id])
  return job
}

export function useCustomers(providerId: string | undefined) {
  const [customers, setCustomers] = useState<Profile[] | null>(null)
  useEffect(() => {
    if (!providerId) return
    const q = query(collection(db, 'users'), where('providerId', '==', providerId))
    return onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as Profile).sort((a, b) => a.name.localeCompare(b.name)))
    }, () => setCustomers([]))
  }, [providerId])
  return customers
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

/** Linked customers (signed-up accounts) plus customers the gardener added by hand. */
export function useCustomerBook(providerId: string | undefined) {
  const linked = useCustomers(providerId)
  const [records, setRecords] = useState<CustomerRecord[] | null>(null)
  useEffect(() => {
    if (!providerId) return
    const q = query(collection(db, 'providerCustomers'), where('providerId', '==', providerId))
    return onSnapshot(q, (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerRecord))
    }, () => setRecords([]))
  }, [providerId])
  if (linked === null || records === null) return null
  const entries: CustomerEntry[] = [
    ...linked.map((u) => ({ id: u.uid, name: u.name, phone: u.phone, address: u.address, language: u.language, linked: true })),
    ...records
      .filter((r) => !r.claimedBy)
      .map((r) => ({ id: r.id, name: r.name, phone: r.phone, address: r.address, language: r.language, linked: false, code: r.code })),
  ]
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function addCustomer(input: { providerId: string; name: string; phone: string; address: string; language: Lang }): Promise<string> {
  const ref = await addDoc(collection(db, 'providerCustomers'), {
    providerId: input.providerId,
    name: input.name,
    phone: input.phone,
    address: input.address,
    language: input.language,
    code: newCode(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const updateCustomerRecord = (id: string, patch: { name: string; phone: string; address: string; language: Lang }) =>
  updateDoc(doc(db, 'providerCustomers', id), patch)

export const removeCustomerRecord = (id: string) => deleteDoc(doc(db, 'providerCustomers', id))

export interface NewJobInput {
  providerId: string
  customer: { id: string; name: string }
  address: string
  date: string
  startTime: string
  endTime: string
  description: string
  descriptionLang: Lang
  tasks: TaskKey[]
}

export async function createJob(input: NewJobInput): Promise<string> {
  const ref = await addDoc(collection(db, 'jobs'), {
    providerId: input.providerId,
    customerId: input.customer.id,
    customerName: input.customer.name,
    address: input.address,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    description: input.description,
    descriptionLang: input.descriptionLang,
    tasks: input.tasks.map((key) => ({ key, done: false })),
    status: 'pending',
    photos: [],
    payment: { status: 'unpaid' },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const patchJob = (id: string, patch: Record<string, unknown>) => updateDoc(doc(db, 'jobs', id), patch)
export const removeJob = (id: string) => deleteDoc(doc(db, 'jobs', id))

export async function uploadJobPhoto(job: Job, file: File, tag: PhotoTag): Promise<JobPhoto> {
  const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const path = `jobs/${job.providerId}/${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const r = ref(storage, path)
  await uploadBytes(r, file, { contentType: file.type })
  const url = await getDownloadURL(r)
  return { url, path, tag }
}

export async function deleteJobPhoto(path: string) {
  try {
    await deleteObject(ref(storage, path))
  } catch {
    /* already gone: fine */
  }
}

export function useMessages(threadId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  useEffect(() => {
    if (!threadId) return
    const q = query(collection(db, 'threads', threadId, 'messages'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as ChatMessage))
    }, () => setMessages([]))
  }, [threadId])
  return messages
}

export async function sendMessage(opts: {
  providerId: string
  customerId: string
  senderId: string
  text: string
  lang: Lang
}) {
  const threadId = threadIdFor(opts.providerId, opts.customerId)
  await setDoc(doc(db, 'threads', threadId), {
    providerId: opts.providerId,
    customerId: opts.customerId,
    lastText: opts.text.slice(0, 120),
    lastAt: serverTimestamp(),
    lastSenderId: opts.senderId,
  })
  await addDoc(collection(db, 'threads', threadId, 'messages'), {
    senderId: opts.senderId,
    text: opts.text,
    lang: opts.lang,
    createdAt: serverTimestamp(),
  })
}

/** The text of something that may have been auto-translated, in the viewer's language. */
export function textFor(lang: Lang, original: string, originalLang: Lang, translations?: Partial<Record<Lang, string>>) {
  if (originalLang === lang) return { text: original, translated: false as const, pending: false }
  const tr = translations?.[lang]
  if (tr) return { text: tr, translated: true as const, pending: false }
  return { text: original, translated: false as const, pending: true }
}
