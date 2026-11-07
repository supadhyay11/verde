import * as React from "react"
import { useNavigate } from "react-router-dom"
import QRCode from "qrcode"
import { httpsCallable } from "firebase/functions"
import {
  Check,
  Copy,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AddressFields } from "@/components/AddressFields"
import { functions } from "@/lib/firebase"
import { useJobsStore } from "@/lib/jobs-store"
import { isBizAdmin, useAuth } from "@/lib/auth-context"
import {
  composeAddress,
  EMPTY_ADDRESS,
  isAddressComplete,
  parseAddress,
  type AddressParts,
} from "@/lib/address"
import { inviteLink, inviteMessage, smsLink } from "@/lib/invite"
import type { Property } from "@/types"

interface CustomerFormValues {
  name: string
  addr: AddressParts
  phone: string
  email: string
  gateCode: string
  hasSpa: boolean
  monthlyRate: string
}

const EMPTY_FORM: CustomerFormValues = {
  name: "",
  addr: EMPTY_ADDRESS,
  phone: "",
  email: "",
  gateCode: "",
  hasSpa: false,
  monthlyRate: "",
}

type InviteDispatchResult = "texted-and-emailed" | "texted" | "emailed" | "copied"

/** Sends the invite to every channel this customer has on file in one
 * tap, same pattern as dispatchInvoice above: a pre-filled text opens
 * immediately if they have a phone number, and an email goes out
 * automatically in the background (via the sendInviteEmail Cloud
 * Function) if they have an email on file - both, if both are on file,
 * with no separate "Email Invite" button and no prompt asking which
 * channel to use. Falls back to copying the message to the clipboard
 * only if there's no phone AND no email at all.
 *
 * The text link is opened FIRST and synchronously, before the `await`
 * for the email call - mobile browsers only allow window.open to
 * succeed as a direct result of the tap that triggered it, so opening it
 * after an awaited network call would get it silently blocked as a
 * pop-up. */
async function sendInvite(
  property: Property,
  businessName: string | undefined
): Promise<InviteDispatchResult> {
  const message = inviteMessage(businessName, property.inviteCode)

  if (property.phone) {
    window.open(smsLink(property.phone, message), "_blank")
  }

  let emailed = false
  if (property.email) {
    try {
      await httpsCallable(functions, "sendInviteEmail")({ propertyId: property.id })
      emailed = true
    } catch {
      emailed = false
    }
  }

  if (property.phone) return emailed ? "texted-and-emailed" : "texted"
  if (emailed) return "emailed"

  await navigator.clipboard.writeText(message)
  return "copied"
}

function InviteQrCode({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(inviteLink(code), { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (!dataUrl) return null

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md border bg-card p-3">
      <img src={dataUrl} alt="QR code to sign up with this invite" className="size-[140px]" />
      <p className="text-center text-[11px] text-muted-foreground">
        Customer scans this to sign up with their code pre-filled
      </p>
    </div>
  )
}

function CustomerFields({
  values,
  onChange,
}: {
  values: CustomerFormValues
  onChange: (values: CustomerFormValues) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Owner Name</Label>
        <Input
          placeholder="e.g. Priya Shah"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Property Address</Label>
        <AddressFields value={values.addr} onChange={(addr) => onChange({ ...values, addr })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Phone (optional)</Label>
        <Input
          type="tel"
          placeholder="+1 555 123 4567"
          value={values.phone}
          onChange={(e) => onChange({ ...values, phone: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Email (optional)</Label>
        <Input
          type="email"
          placeholder="priya@example.com"
          value={values.email}
          onChange={(e) => onChange({ ...values, email: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Gate Code (optional)</Label>
        <Input
          placeholder="4892"
          value={values.gateCode}
          onChange={(e) => onChange({ ...values, gateCode: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Monthly Rate (optional)</Label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="120"
          value={values.monthlyRate}
          onChange={(e) => onChange({ ...values, monthlyRate: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2.5 rounded-lg border p-3 text-sm font-medium">
        <Checkbox
          checked={values.hasSpa}
          onCheckedChange={(checked) =>
            onChange({ ...values, hasSpa: checked === true })
          }
        />
        Does this customer also have a spa?
      </label>
    </>
  )
}

function EditCustomerCard({
  property,
  onCancel,
  onSaved,
}: {
  property: Property
  onCancel: () => void
  onSaved: () => void
}) {
  const { updateCustomer } = useJobsStore()
  const [values, setValues] = React.useState<CustomerFormValues>({
    name: property.customerName ?? "",
    addr: parseAddress(property.address),
    phone: property.phone ?? "",
    email: property.email ?? "",
    gateCode: property.gateCode ?? "",
    hasSpa: property.hasSpa ?? false,
    monthlyRate: property.monthlyRate != null ? String(property.monthlyRate) : "",
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim() || !isAddressComplete(values.addr)) {
      setError("Give the customer a name and a complete address.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await updateCustomer(property.id, {
        name: values.name.trim(),
        address: composeAddress(values.addr),
        phone: values.phone.trim() || undefined,
        email: values.email.trim() || undefined,
        gateCode: values.gateCode.trim() || undefined,
        hasSpa: values.hasSpa,
        monthlyRate: values.monthlyRate.trim() ? Number(values.monthlyRate) : undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those changes.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Edit Customer</p>
        <button type="button" onClick={onCancel}>
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <CustomerFields values={values} onChange={setValues} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function CustomersPage() {
  const navigate = useNavigate()
  const { properties, business, addCustomer, deleteCustomer } = useJobsStore()

  // NOTE: there is no customer limit. An old upgrade banner (isSubscribed/
  // atFreeLimit) was pulled out; Verde is $19.99/month flat with the
  // first 3 months free, and subscription billing stays off until the App
  // Store review clears. See functions/index.js.

  const [showForm, setShowForm] = React.useState(false)
  const [newValues, setNewValues] = React.useState<CustomerFormValues>(EMPTY_FORM)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [justAdded, setJustAdded] = React.useState<{ id: string; code: string } | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const { user: currentUser } = useAuth()
  const canResetAccess = isBizAdmin(currentUser)
  const [confirmResetId, setConfirmResetId] = React.useState<string | null>(null)
  const [resetting, setResetting] = React.useState(false)
  const [resetError, setResetError] = React.useState<string | null>(null)
  const [qrOpenId, setQrOpenId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<"active" | "pending" | null>(null)
  const [inviteSendingId, setInviteSendingId] = React.useState<string | null>(null)
  const [inviteSentNote, setInviteSentNote] = React.useState<{
    propertyId: string
    result: InviteDispatchResult
  } | null>(null)

  async function handleSendInvite(property: Property) {
    setInviteSendingId(property.id)
    try {
      const result = await sendInvite(property, business?.name)
      setInviteSentNote({ propertyId: property.id, result })
    } finally {
      setInviteSendingId((cur) => (cur === property.id ? null : cur))
    }
  }

  // Alphabetical by customer name, filtered by the search box (name,
  // address, or phone) - makes the list usable once a provider has more
  // than a handful of customers.
  const visibleProperties = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...properties]
      .filter((p) => {
        if (!q) return true
        return (
          p.customerName.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q)
        )
      })
      .filter((p) => {
        if (statusFilter === "active") return p.claimed
        if (statusFilter === "pending") return !p.claimed
        return true
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName))
  }, [properties, search, statusFilter])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newValues.name.trim() || !isAddressComplete(newValues.addr)) {
      setError("Give the customer a name and a complete address.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const { propertyId, code } = await addCustomer({
        name: newValues.name.trim(),
        address: composeAddress(newValues.addr),
        phone: newValues.phone.trim() || undefined,
        email: newValues.email.trim() || undefined,
        gateCode: newValues.gateCode.trim() || undefined,
        hasSpa: newValues.hasSpa,
        monthlyRate: newValues.monthlyRate.trim() ? Number(newValues.monthlyRate) : undefined,
      })
      setJustAdded({ id: propertyId, code })
      setNewValues(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that customer.")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCode(propertyId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(propertyId)
      setTimeout(() => setCopiedId((cur) => (cur === propertyId ? null : cur)), 1500)
    } catch {
      // clipboard may be unavailable; no-op
    }
  }

  async function handleResetAccess(propertyId: string) {
    setResetting(true)
    setResetError(null)
    try {
      await httpsCallable(functions, "resetCustomerAccess")({ propertyId })
      setConfirmResetId(null)
    } catch {
      setResetError("Couldn't reset access. Please try again.")
    } finally {
      setResetting(false)
    }
  }

  async function handleDelete(propertyId: string) {
    setDeleting(true)
    try {
      await deleteCustomer(propertyId)
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background pb-6">
      <TopBar title="Customers" />

      <div className="flex flex-col gap-3 px-4 py-4">
        {properties.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <Card className="items-center gap-0.5 p-3 text-center">
              <p className="text-lg font-bold">{properties.length}</p>
              <p className="text-[11px] text-muted-foreground">
                total customer{properties.length === 1 ? "" : "s"}
              </p>
            </Card>
            <Card
              className={
                "items-center gap-0.5 p-0 text-center transition-colors " +
                (statusFilter === "active" ? "border-success bg-success/10" : "")
              }
            >
              <button
                type="button"
                disabled={properties.filter((p) => p.claimed).length === 0}
                onClick={() =>
                  setStatusFilter((cur) => (cur === "active" ? null : "active"))
                }
                aria-pressed={statusFilter === "active"}
                className="flex w-full flex-col items-center gap-0.5 p-3 disabled:cursor-default"
              >
                <p className="text-lg font-bold text-success">
                  {properties.filter((p) => p.claimed).length}
                </p>
                <p className="text-[11px] text-muted-foreground">active</p>
              </button>
            </Card>
            <Card
              className={
                "items-center gap-0.5 p-0 text-center transition-colors " +
                (statusFilter === "pending" ? "border-foreground/30 bg-muted" : "")
              }
            >
              <button
                type="button"
                disabled={properties.filter((p) => !p.claimed).length === 0}
                onClick={() =>
                  setStatusFilter((cur) => (cur === "pending" ? null : "pending"))
                }
                aria-pressed={statusFilter === "pending"}
                className="flex w-full flex-col items-center gap-0.5 p-3 disabled:cursor-default"
              >
                <p className="text-lg font-bold text-muted-foreground">
                  {properties.filter((p) => !p.claimed).length}
                </p>
                <p className="text-[11px] text-muted-foreground">pending</p>
              </button>
            </Card>
          </div>
        )}

        {statusFilter && (
          <Card className="flex-row items-center justify-between gap-2 p-3">
            <p className="text-xs font-medium text-foreground">
              Showing {statusFilter} customers only
            </p>
            <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)}>
              Clear
            </Button>
          </Card>
        )}

        {justAdded && (
          <Card className="gap-2 border-l-4 border-l-success p-4">
            <p className="text-sm font-semibold">Customer added</p>
            <p className="text-xs text-muted-foreground">
              Share this invite code with them so they can create their
              account and see their service schedule.
            </p>
            <button
              type="button"
              onClick={() => copyCode(justAdded.id, justAdded.code)}
              className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-left font-mono text-lg tracking-widest"
            >
              {justAdded.code}
              {copiedId === justAdded.id ? (
                <Check className="size-4 text-success" />
              ) : (
                <Copy className="size-4 text-muted-foreground" />
              )}
            </button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={inviteSendingId === justAdded.id}
                onClick={() => {
                  const property = properties.find((p) => p.id === justAdded.id)
                  if (property) handleSendInvite(property)
                }}
              >
                <Send className="size-3.5" />
                {inviteSendingId === justAdded.id ? "Sending..." : "Send Invite"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setQrOpenId((cur) => (cur === justAdded.id ? null : justAdded.id))
                }
              >
                <QrCode className="size-3.5" />
              </Button>
            </div>
            {inviteSentNote?.propertyId === justAdded.id && (
              <p className="text-xs text-muted-foreground">
                {inviteSentNote.result === "texted-and-emailed" &&
                  "Text opened to send, and emailed automatically in the background."}
                {inviteSentNote.result === "texted" &&
                  "Text opened to send. (No email on file for this customer.)"}
                {inviteSentNote.result === "emailed" &&
                  "Emailed automatically in the background - no phone on file for this customer."}
                {inviteSentNote.result === "copied" &&
                  "No phone or email on file - invite message copied to your clipboard instead."}
              </p>
            )}
            {qrOpenId === justAdded.id && <InviteQrCode code={justAdded.code} />}
            <button
              type="button"
              className="self-start text-xs text-muted-foreground underline"
              onClick={() => setJustAdded(null)}
            >
              Dismiss
            </button>
          </Card>
        )}

        {showForm ? (
          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">New Customer</p>
              <button type="button" onClick={() => setShowForm(false)}>
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <CustomerFields values={newValues} onChange={setNewValues} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add Customer & Generate Code"}
              </Button>
            </form>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" /> Add Customer
            </Button>
          </div>
        )}

        {properties.length > 0 && (
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name, address, or phone"
              className="pl-9"
            />
          </div>
        )}

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          {visibleProperties.length === 0 && properties.length > 0 && (
            <p className="lg:col-span-2 py-6 text-center text-sm text-muted-foreground">
              {search.trim()
                ? `No customers match "${search}".`
                : `No ${statusFilter} customers right now.`}
            </p>
          )}
          {visibleProperties.map((property) =>
            editingId === property.id ? (
              <EditCustomerCard
                key={property.id}
                property={property}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <Card key={property.id} className="gap-2 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 font-bold">
                      <button
                        type="button"
                        onClick={() => navigate(`/customers/${property.id}`)}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {property.customerName}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(property.id)}
                        aria-label={`Edit ${property.customerName}`}
                        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" /> {property.address}
                    </p>
                    {property.phone && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3.5" /> {property.phone}
                      </p>
                    )}
                    {property.email && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="size-3.5" /> {property.email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {property.claimed ? (
                      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                        <ShieldCheck className="size-3.5" /> Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {!property.claimed && (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => copyCode(property.id, property.inviteCode)}
                      className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-left font-mono text-sm tracking-widest"
                    >
                      {property.inviteCode}
                      {copiedId === property.id ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={inviteSendingId === property.id}
                        onClick={() => handleSendInvite(property)}
                      >
                        <Send className="size-3.5" />
                        {inviteSendingId === property.id ? "Sending..." : "Send Invite"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setQrOpenId((cur) => (cur === property.id ? null : property.id))
                        }
                      >
                        <QrCode className="size-3.5" />
                      </Button>
                    </div>
                    {inviteSentNote?.propertyId === property.id && (
                      <p className="text-xs text-muted-foreground">
                        {inviteSentNote.result === "texted-and-emailed" &&
                          "Text opened to send, and emailed automatically in the background."}
                        {inviteSentNote.result === "texted" &&
                          "Text opened to send. (No email on file for this customer.)"}
                        {inviteSentNote.result === "emailed" &&
                          "Emailed automatically in the background - no phone on file for this customer."}
                        {inviteSentNote.result === "copied" &&
                          "No phone or email on file - invite message copied to your clipboard instead."}
                      </p>
                    )}
                    {qrOpenId === property.id && <InviteQrCode code={property.inviteCode} />}
                  </div>
                )}

                {property.claimed && canResetAccess && (
                  confirmResetId === property.id ? (
                    <div className="flex flex-col gap-2 rounded-md border bg-muted p-3">
                      <p className="text-xs text-muted-foreground">
                        Reset sign-in for {property.customerName}? Their
                        current login is removed and a new invite code is
                        issued. Jobs, invoices, payments and messages stay
                        exactly as they are.
                      </p>
                      {resetError && <p className="text-xs text-destructive">{resetError}</p>}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          disabled={resetting}
                          onClick={() => handleResetAccess(property.id)}
                        >
                          {resetting ? "Resetting..." : "Reset Access"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={resetting}
                          onClick={() => setConfirmResetId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="self-start text-xs text-muted-foreground underline"
                      onClick={() => {
                        setResetError(null)
                        setConfirmResetId(property.id)
                      }}
                    >
                      Can't sign in? Reset access
                    </button>
                  )
                )}

                {confirmDeleteId === property.id ? (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs text-destructive">
                      Remove {property.customerName}? This deletes their
                      property and invite code. Past jobs and messages are
                      kept but will no longer be reachable from Customers.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        disabled={deleting}
                        onClick={() => handleDelete(property.id)}
                      >
                        {deleting ? "Removing..." : "Remove Customer"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={deleting}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/jobs/new?propertyId=${property.id}`)}
                    >
                      Schedule Service
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(property.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </Card>
            )
          )}
          {properties.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No customers yet. Add your first one above.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
