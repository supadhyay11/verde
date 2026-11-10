import { useT } from "@/lib/i18n"
import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Wrench,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useJobsStore } from "@/lib/jobs-store"
import type { ServiceJob } from "@/types"

function money(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

// Full date + time, e.g. "Oct 18, 2026, 2:30 PM" - for ISO timestamps.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Plain date, e.g. "Oct 18, 2026" - for either an ISO timestamp or a
// plain "YYYY-MM-DD" date-only string (both parse fine through `new
// Date` for display purposes here).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// "Oct 18, 2026 (3 months ago)" - falls back to "Unknown" for customers
// added before Property.createdAt existed (see its doc comment).
function customerSinceLabel(createdAt: string | undefined): string {
  if (!createdAt) return "Unknown"
  const days = daysSince(createdAt)
  if (days < 30) return `${formatDate(createdAt)} (${days} day${days === 1 ? "" : "s"} ago)`
  const months = Math.floor(days / 30)
  if (months < 24) return `${formatDate(createdAt)} (${months} month${months === 1 ? "" : "s"} ago)`
  const years = Math.floor(months / 12)
  return `${formatDate(createdAt)} (${years} year${years === 1 ? "" : "s"} ago)`
}

const SENTIMENT_BANDS = [
  { max: 25, label: "Unhappy", className: "text-destructive" },
  { max: 60, label: "Neutral", className: "text-muted-foreground" },
  { max: 101, label: "Happy", className: "text-success" },
] as const

function sentimentLabel(value: number) {
  return SENTIMENT_BANDS.find((band) => value <= band.max) ?? SENTIMENT_BANDS[1]
}

function jobStatusLabel(status: ServiceJob["status"]): string {
  switch (status) {
    case "completed":
      return "Completed"
    case "in-progress":
      return "In progress"
    case "scheduled":
      return "Scheduled"
    default:
      return "Pending"
  }
}

export function CustomerProfilePage() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { getProperty, jobs, invoices, getUser, updateCustomerSentiment } = useJobsStore()
  const property = getProperty(id)

  // Local slider state so the thumb moves smoothly while dragging - the
  // actual Firestore write only fires once the drag ends (onMouseUp /
  // onTouchEnd below), not on every intermediate value.
  const [sliderValue, setSliderValue] = React.useState<number>(property?.sentiment ?? 50)
  React.useEffect(() => {
    setSliderValue(property?.sentiment ?? 50)
  }, [property?.sentiment])

  const propertyJobs = React.useMemo(
    () =>
      jobs
        .filter((j) => j.propertyId === id)
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
    [jobs, id]
  )
  const propertyInvoices = React.useMemo(
    () =>
      invoices
        .filter((inv) => inv.propertyId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [invoices, id]
  )

  const completedJobs = propertyJobs.filter((j) => j.status === "completed")
  const lifetimePaid = propertyInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.amount, 0)
  const outstanding = propertyInvoices
    .filter((inv) => inv.status !== "paid")
    .reduce((sum, inv) => sum + inv.amount, 0)

  if (!property) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/customers")}>
          <ArrowLeft className="size-3.5" /> {t("Back to Customers")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t("Couldn't find that customer - they may have been removed.")}
        </p>
      </div>
    )
  }

  const sentiment = sentimentLabel(sliderValue)
  const propertyId = property.id

  function commitSentiment() {
    updateCustomerSentiment(propertyId, sliderValue)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate("/customers")}>
        <ArrowLeft className="size-3.5" /> {t("Back to Customers")}
      </Button>

      <Card className="gap-2 p-4">
        <p className="text-lg font-bold">{property.customerName}</p>
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
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="size-3.5" /> {t("Customer since")} {customerSinceLabel(property.createdAt)}
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="gap-1 p-3 text-center">
          <p className="text-xl font-bold">{completedJobs.length}</p>
          <p className="text-xs text-muted-foreground">{t("Jobs completed")}</p>
        </Card>
        <Card className="gap-1 p-3 text-center">
          <p className="text-xl font-bold">{money(lifetimePaid)}</p>
          <p className="text-xs text-muted-foreground">{t("Lifetime paid")}</p>
        </Card>
        <Card className="gap-1 p-3 text-center">
          <p className={"text-xl font-bold " + (outstanding > 0 ? "text-destructive" : "")}>
            {money(outstanding)}
          </p>
          <p className="text-xs text-muted-foreground">{t("Outstanding")}</p>
        </Card>
      </div>

      <Card className="gap-3 p-4">
        <p className="text-sm font-bold">{t("Customer sentiment")}</p>
        <p className="text-xs text-muted-foreground">
          {t("How's this relationship going? You set this yourself for now - later we'll be able to pick it up automatically from chat.")}
        </p>
        <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-red-400 via-zinc-300 to-green-400">
          <input
            type="range"
            min={0}
            max={100}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            onMouseUp={commitSentiment}
            onTouchEnd={commitSentiment}
            className="absolute inset-0 h-2.5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow"
            aria-label={t("Customer sentiment")}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("Unhappy")}</span>
          <span>{t("Neutral")}</span>
          <span>{t("Happy")}</span>
        </div>
        <p className={"text-center text-sm font-semibold " + sentiment.className}>{sentiment.label}</p>
      </Card>

      <Card className="gap-2 p-4">
        <p className="text-sm font-bold">{t("Job history")}</p>
        {propertyJobs.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">{t("No jobs for this customer yet.")}</p>
        )}
        {propertyJobs.map((job) => {
          const tech = getUser(job.technicianId)
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => navigate(`/jobs/${job.id}`)}
              className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <p className="flex items-center gap-1 font-medium">
                <Wrench className="size-3.5" /> {job.serviceType}
              </p>
              <p className="text-muted-foreground">
                {formatDate(job.scheduledDate)} · {jobStatusLabel(job.status)}
                {tech ? ` · ${tech.name}` : ""}
              </p>
              {job.completedAt && (
                <p className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-3" /> {t("Completed")} {formatDateTime(job.completedAt)}
                </p>
              )}
              {job.notes && <p className="text-muted-foreground">{t("&ldquo;")}{job.notes}{t("&rdquo;")}</p>}
            </button>
          )
        })}
      </Card>

      <Card className="gap-2 p-4">
        <p className="text-sm font-bold">{t("Invoice history")}</p>
        {propertyInvoices.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">{t("No invoices for this customer yet.")}</p>
        )}
        {propertyInvoices.map((inv) => {
          const pendingSend = Boolean(inv.scheduledSendAt && !inv.sentAt)
          return (
            <div key={inv.id} className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
              <p className="text-sm font-semibold">
                {inv.invoiceNumber != null ? `Invoice #${inv.invoiceNumber}` : "Invoice"}
                {" · "}
                {inv.period} · {money(inv.amount)}
              </p>
              <p
                className={
                  pendingSend ? "text-primary" : inv.status === "paid" ? "text-success" : "text-muted-foreground"
                }
              >
                {pendingSend ? "Scheduled to send" : inv.status === "paid" ? "Marked as paid" : "Sent · not yet paid"}
              </p>
              <p className="text-muted-foreground">
                {pendingSend
                  ? inv.sentByName
                    ? `Set up by ${inv.sentByName}`
                    : "Set up automatically"
                  : inv.sentAt
                    ? `Sent ${formatDateTime(inv.sentAt)}${inv.sentByName ? ` by ${inv.sentByName}` : " automatically"}`
                    : "Not sent yet"}
              </p>
              {inv.status === "paid" && inv.paidAt && (
                <p className="text-success">{t("Paid")} {formatDateTime(inv.paidAt)}</p>
              )}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
