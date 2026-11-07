import * as React from "react"
import {
  Calendar,
  CalendarX,
  ChevronDown,
  ChevronUp,
  FileText,
  Pencil,
  Printer,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useJobsStore } from "@/lib/jobs-store"
import { localTodayIso } from "@/lib/date"
import type { Invoice, Property } from "@/types"

/** "YYYY-MM" for right now - the value a native <input type="month">
 * expects/produces, and what monthValue defaults to on a fresh form. */
function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Turns an <input type="month"> value ("2026-08") into the same
 * human-readable label createInvoice/the PDF expect ("August 2026"). */
function monthValueLabel(value: string): string {
  const [y, m] = value.split("-").map(Number)
  if (!y || !m) return value
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

// Full date + time, e.g. "Oct 18, 2026, 2:30 PM" - used for sentAt/
// paidAt, which are ISO timestamps (not just a date).
function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// scheduledSendAt is a plain "YYYY-MM-DD" string with no time component -
// parsed as a local date (not UTC) to avoid an off-by-one day.
function formatScheduledDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function money(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

/** What one property's billing currently looks like, derived from its
 * invoice history - used both for the summary stats at the top and the
 * status badge on each customer row. */
function propertyBillingStatus(invoices: Invoice[]) {
  if (invoices.length === 0) return { label: "No invoices yet", tone: "muted" as const }
  const latest = invoices[0]
  if (latest.scheduledSendAt && !latest.sentAt) {
    return { label: `Scheduled ${latest.scheduledSendAt}`, tone: "info" as const }
  }
  if (latest.status === "paid") return { label: "Paid", tone: "success" as const }
  return { label: "Unpaid", tone: "destructive" as const }
}

function SendInvoiceForm({
  property,
  onCancel,
  onCreated,
}: {
  property: Property
  onCancel: () => void
  onCreated: (result: { propertyId: string; invoiceId: string; scheduled: boolean }) => void
}) {
  const { createInvoice } = useJobsStore()
  const [amount, setAmount] = React.useState(
    property.monthlyRate != null ? String(property.monthlyRate) : ""
  )
  const [periodMode, setPeriodMode] = React.useState<"month" | "custom">("month")
  const [monthValue, setMonthValue] = React.useState(currentMonthValue())
  const [customPeriod, setCustomPeriod] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [scheduledDate, setScheduledDate] = React.useState(localTodayIso())
  // Which action is in flight, if any - drives the per-button "Sending..."
  // / "Scheduling..." label and disables both buttons while either is
  // submitting, without needing a separate boolean per button.
  const [submitting, setSubmitting] = React.useState<"now" | "scheduled" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(scheduled: boolean) {
    const numericAmount = Number(amount)
    if (!amount.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.")
      return
    }
    const period = periodMode === "month" ? monthValueLabel(monthValue) : customPeriod.trim()
    if (periodMode === "month" && !monthValue) {
      setError("Pick a service month.")
      return
    }
    if (periodMode === "custom" && !period) {
      setError('Describe this invoice, e.g. "One-time algae treatment".')
      return
    }
    if (scheduled && !scheduledDate) {
      setError("Pick a date to send this invoice.")
      return
    }
    setError(null)
    setSubmitting(scheduled ? "scheduled" : "now")
    try {
      const invoiceId = await createInvoice({
        propertyId: property.id,
        amount: numericAmount,
        period,
        notes: notes.trim() || undefined,
        scheduledSendAt: scheduled ? scheduledDate : undefined,
      })
      onCreated({ propertyId: property.id, invoiceId, scheduled })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that invoice.")
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Send Invoice - {property.customerName}</p>
        <button type="button" onClick={onCancel} aria-label="Close">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="120"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Billing period</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriodMode("month")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                (periodMode === "month"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground")
              }
            >
              Service month
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("custom")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                (periodMode === "custom"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground")
              }
            >
              Custom / one-time
            </button>
          </div>
          {periodMode === "month" ? (
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
          ) : (
            <Input
              placeholder="One-time algae treatment"
              value={customPeriod}
              onChange={(e) => setCustomPeriod(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional - shown on the PDF)</Label>
          <Input
            placeholder="Extra mulch, fertilizer, plant replacement, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Schedule date (only used if you tap "Schedule" below)
          </Label>
          <Input
            type="date"
            min={localTodayIso()}
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={submitting !== null}
            onClick={() => submit(false)}
            className="flex-1"
          >
            {submitting === "now" ? "Sending..." : "Send Now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting !== null}
            onClick={() => submit(true)}
            className="flex-1"
          >
            {submitting === "scheduled" ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function EditInvoiceForm({
  invoice,
  onCancel,
  onSaved,
}: {
  invoice: Invoice
  onCancel: () => void
  onSaved: () => void
}) {
  const { updateInvoice } = useJobsStore()
  // "Service month" periods are always produced by monthValueLabel, e.g.
  // "August 2026" - matching that shape is how we tell a month-mode
  // invoice apart from a custom/one-time one when re-opening it to edit,
  // since nothing on the Invoice itself records which mode created it.
  const isMonthPeriod = /^[A-Za-z]+ \d{4}$/.test(invoice.period)
  const [periodMode, setPeriodMode] = React.useState<"month" | "custom">(
    isMonthPeriod ? "month" : "custom"
  )
  const [monthValue, setMonthValue] = React.useState(currentMonthValue())
  const [customPeriod, setCustomPeriod] = React.useState(isMonthPeriod ? "" : invoice.period)
  const [amount, setAmount] = React.useState(String(invoice.amount))
  const [notes, setNotes] = React.useState(invoice.notes ?? "")
  const pendingSend = Boolean(invoice.scheduledSendAt && !invoice.sentAt)
  const [scheduledDate, setScheduledDate] = React.useState(invoice.scheduledSendAt ?? localTodayIso())
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit() {
    const numericAmount = Number(amount)
    if (!amount.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.")
      return
    }
    const period = periodMode === "month" ? monthValueLabel(monthValue) : customPeriod.trim()
    if (periodMode === "custom" && !period) {
      setError('Describe this invoice, e.g. "One-time algae treatment".')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await updateInvoice(invoice.id, {
        amount: numericAmount,
        period,
        notes: notes.trim() || undefined,
        scheduledSendAt: pendingSend ? scheduledDate : invoice.scheduledSendAt,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those changes.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="gap-3 border-primary/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          Edit Invoice{invoice.invoiceNumber != null ? ` #${invoice.invoiceNumber}` : ""}
        </p>
        <button type="button" onClick={onCancel} aria-label="Close">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      {!pendingSend && (
        <p className="rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
          This invoice was already sent to the customer - they may still have the old amount/PDF. Consider letting them know separately.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Billing period</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPeriodMode("month")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                (periodMode === "month"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground")
              }
            >
              Service month
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("custom")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                (periodMode === "custom"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground")
              }
            >
              Custom / one-time
            </button>
          </div>
          {periodMode === "month" ? (
            <Input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
          ) : (
            <Input
              placeholder="One-time algae treatment"
              value={customPeriod}
              onChange={(e) => setCustomPeriod(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional - shown on the PDF)</Label>
          <Input
            placeholder="Extra mulch, fertilizer, plant replacement, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {pendingSend && (
          <div className="space-y-1.5">
            <Label className="text-xs">Scheduled send date</Label>
            <Input
              type="date"
              min={localTodayIso()}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={submitting} onClick={submit}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Card>
  )
}

function CustomerBillingRow({
  property,
  invoices,
  onInvoiceCreated,
}: {
  property: Property
  invoices: Invoice[]
  onInvoiceCreated: (result: { propertyId: string; invoiceId: string; scheduled: boolean }) => void
}) {
  const { markInvoicePaid, deleteInvoice } = useJobsStore()
  const [open, setOpen] = React.useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = React.useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = React.useState<string | null>(null)
  const sorted = React.useMemo(
    () => invoices.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [invoices]
  )
  const status = propertyBillingStatus(sorted)
  // Excludes invoices that are scheduled for a future send date but
  // haven't actually gone out yet - the customer doesn't know about
  // those, so they shouldn't count as money owed yet.
  const unpaidTotal = sorted
    .filter((i) => i.status !== "paid" && !(i.scheduledSendAt && !i.sentAt))
    .reduce((sum, i) => sum + i.amount, 0)

  return (
    <Card className="gap-2 p-4">
      <button
        type="button"
        className="flex w-full items-start justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="font-bold">{property.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {property.monthlyRate != null
              ? `${money(property.monthlyRate)} / month`
              : "No monthly rate set"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full px-2 py-1 text-xs font-medium " +
              (status.tone === "success"
                ? "bg-success/10 text-success"
                : status.tone === "destructive"
                  ? "bg-destructive/10 text-destructive"
                  : status.tone === "info"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground")
            }
          >
            {status.label}
          </span>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {unpaidTotal > 0 && (
        <p className="text-xs text-muted-foreground">{money(unpaidTotal)} outstanding</p>
      )}

      {showInvoiceForm ? (
        <SendInvoiceForm
          property={property}
          onCancel={() => setShowInvoiceForm(false)}
          onCreated={(result) => {
            setShowInvoiceForm(false)
            setOpen(true)
            onInvoiceCreated(result)
          }}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowInvoiceForm(true)}>
          <Send className="size-3.5" /> Send Invoice
        </Button>
      )}

      {open && (
        <div className="flex flex-col gap-1.5 pt-1">
          {sorted.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">No invoices sent to this customer yet.</p>
          )}
          {sorted.map((inv) => {
            const pendingSend = Boolean(inv.scheduledSendAt && !inv.sentAt)
            if (editingInvoiceId === inv.id) {
              return (
                <EditInvoiceForm
                  key={inv.id}
                  invoice={inv}
                  onCancel={() => setEditingInvoiceId(null)}
                  onSaved={() => setEditingInvoiceId(null)}
                />
              )
            }
            return (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-xs"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold">
                    {inv.invoiceNumber != null ? `Invoice #${inv.invoiceNumber}` : "Invoice"}
                    {" · "}
                    {inv.period} · {money(inv.amount)}
                  </p>
                  <p
                    className={
                      "flex items-center gap-1 " +
                      (pendingSend
                        ? "text-primary"
                        : inv.status === "paid"
                          ? "text-success"
                          : "text-muted-foreground")
                    }
                  >
                    {pendingSend ? (
                      <>
                        <Calendar className="size-3" /> Scheduled to send{" "}
                        {formatScheduledDate(inv.scheduledSendAt!)} as a PDF
                      </>
                    ) : inv.status === "paid" ? (
                      "Marked as paid"
                    ) : (
                      "Sent · not yet paid"
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {pendingSend
                      ? inv.sentByName
                        ? `Set up by ${inv.sentByName}`
                        : "Set up automatically"
                      : inv.sentAt
                        ? `Sent ${formatSentAt(inv.sentAt)}${inv.sentByName ? ` by ${inv.sentByName}` : " automatically"}`
                        : "Not sent yet"}
                  </p>
                  {inv.status === "paid" && inv.paidAt && (
                    <p className="text-success">Paid {formatSentAt(inv.paidAt)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`/invoice/${inv.id}`, "_blank")}
                    aria-label="Print invoice"
                    title="Print invoice"
                  >
                    <Printer className="size-3.5" />
                  </Button>
                  {inv.status !== "paid" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingInvoiceId(inv.id)}
                      aria-label="Edit invoice"
                      title="Edit invoice"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {!pendingSend && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Delete invoice"
                      title="Delete invoice"
                      onClick={() => {
                        const warning =
                          inv.status === "paid"
                            ? `Permanently delete invoice #${inv.invoiceNumber ?? ""}? It's marked paid, so deleting it will also reduce your reported revenue totals. This can't be undone.`
                            : `Permanently delete invoice #${inv.invoiceNumber ?? ""}? This can't be undone.`
                        if (window.confirm(warning)) {
                          deleteInvoice(inv.id)
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                  {pendingSend && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Cancel this scheduled invoice? It hasn't been sent yet, so canceling removes it completely."
                          )
                        ) {
                          deleteInvoice(inv.id)
                        }
                      }}
                      aria-label="Cancel scheduled invoice"
                      title="Cancel scheduled invoice"
                    >
                      <CalendarX className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markInvoicePaid(inv.id, inv.status !== "paid")}
                  >
                    Mark {inv.status === "paid" ? "Unpaid" : "Paid"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function BillingPage() {
  const { properties, invoices } = useJobsStore()
  const [search, setSearch] = React.useState("")
  const [note, setNote] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<"scheduled" | "unpaid" | null>(null)

  function handleInvoiceCreated({
    scheduled,
  }: {
    propertyId: string
    invoiceId: string
    scheduled: boolean
  }) {
    setNote(
      scheduled
        ? "Invoice created - it'll email as a PDF automatically on the date you chose."
        : "Invoice created and emailed as a PDF."
    )
  }

  const invoicesByProperty = React.useMemo(() => {
    const map = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      const list = map.get(inv.propertyId) ?? []
      list.push(inv)
      map.set(inv.propertyId, list)
    }
    return map
  }, [invoices])

  // Property ids with at least one invoice matching each stat tile - same
  // per-invoice tests CustomerBillingRow/propertyBillingStatus already use
  // (scheduled-but-not-sent, and not-yet-paid), just rolled up to the
  // property level so the stat tiles can filter the list down to these.
  const scheduledPropertyIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const inv of invoices) {
      if (inv.scheduledSendAt && !inv.sentAt) ids.add(inv.propertyId)
    }
    return ids
  }, [invoices])

  const unpaidPropertyIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const inv of invoices) {
      if (inv.status !== "paid") ids.add(inv.propertyId)
    }
    return ids
  }, [invoices])

  const visibleProperties = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...properties]
      .filter((p) => !q || p.customerName.toLowerCase().includes(q))
      .filter((p) => {
        if (statusFilter === "scheduled") return scheduledPropertyIds.has(p.id)
        if (statusFilter === "unpaid") return unpaidPropertyIds.has(p.id)
        return true
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName))
  }, [properties, search, statusFilter, scheduledPropertyIds, unpaidPropertyIds])

  const totalUnpaid = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.amount, 0)
  const scheduledCount = invoices.filter((i) => i.scheduledSendAt && !i.sentAt).length
  const unpaidCount = invoices.filter((i) => i.status !== "paid").length

  return (
    <div className="flex min-h-full flex-col bg-background pb-6">
      <TopBar title="Billing" />

      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Card
            className={
              "items-center gap-0.5 p-0 text-center transition-colors " +
              (statusFilter === "unpaid" ? "border-destructive bg-destructive/10" : "")
            }
          >
            <button
              type="button"
              disabled={unpaidCount === 0}
              onClick={() =>
                setStatusFilter((cur) => (cur === "unpaid" ? null : "unpaid"))
              }
              aria-pressed={statusFilter === "unpaid"}
              className="flex w-full flex-col items-center gap-0.5 p-3 disabled:cursor-default"
            >
              <p className="text-lg font-bold text-destructive">{money(totalUnpaid)}</p>
              <p className="text-[11px] text-muted-foreground">
                {unpaidCount} unpaid invoice{unpaidCount === 1 ? "" : "s"}
              </p>
            </button>
          </Card>
          <Card className="items-center gap-0.5 p-3 text-center">
            <p className="text-lg font-bold">{properties.length}</p>
            <p className="text-[11px] text-muted-foreground">customers</p>
          </Card>
          <Card
            className={
              "items-center gap-0.5 p-0 text-center transition-colors " +
              (statusFilter === "scheduled" ? "border-primary bg-primary/10" : "")
            }
          >
            <button
              type="button"
              disabled={scheduledCount === 0}
              onClick={() =>
                setStatusFilter((cur) => (cur === "scheduled" ? null : "scheduled"))
              }
              aria-pressed={statusFilter === "scheduled"}
              className="flex w-full flex-col items-center gap-0.5 p-3 disabled:cursor-default"
            >
              <p className="text-lg font-bold text-primary">{scheduledCount}</p>
              <p className="text-[11px] text-muted-foreground">scheduled to send</p>
            </button>
          </Card>
        </div>

        {statusFilter && (
          <Card className="flex-row items-center justify-between gap-2 p-3">
            <p
              className={
                "flex items-center gap-1.5 text-xs font-medium " +
                (statusFilter === "unpaid" ? "text-destructive" : "text-primary")
              }
            >
              <Calendar className="size-3.5" />
              {statusFilter === "unpaid"
                ? "Showing customers with an unpaid invoice"
                : "Showing customers with a scheduled invoice"}
            </p>
            <Button variant="outline" size="sm" onClick={() => setStatusFilter(null)}>
              Clear
            </Button>
          </Card>
        )}

        {note && (
          <Card className="gap-1 border-l-4 border-l-success p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Send className="size-3.5" /> {note}
            </p>
          </Card>
        )}

        {properties.length > 0 && (
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers"
              className="pl-9"
            />
          </div>
        )}

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          {visibleProperties.map((property) => (
            <CustomerBillingRow
              key={property.id}
              property={property}
              invoices={invoicesByProperty.get(property.id) ?? []}
              onInvoiceCreated={handleInvoiceCreated}
            />
          ))}
          {visibleProperties.length === 0 && properties.length > 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground lg:col-span-2">
              {search.trim()
                ? `No customers match "${search}".`
                : statusFilter === "unpaid"
                  ? "No customers have an unpaid invoice right now."
                  : "No customers have a scheduled invoice right now."}
            </p>
          )}
          {properties.length === 0 && (
            <p className="flex flex-col items-center gap-1 py-10 text-center text-sm text-muted-foreground lg:col-span-2">
              <FileText className="mb-1 size-6" />
              Add a customer first, then come back here to bill them.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
