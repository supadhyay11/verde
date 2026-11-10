import { useT } from "@/lib/i18n"
import * as React from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { CalendarDays, Clock, MapPin, User as UserIcon } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useJobsStore } from "@/lib/jobs-store"
import { useAuth } from "@/lib/auth-context"
import { formatTime12h } from "@/lib/date"
import { BASE_TASKS, extraTasksFor } from "@/lib/tasks"
import type { RecurrenceRule, ServiceType } from "@/types"

const SERVICE_TYPES: ServiceType[] = [
  "Full Service",
  "Chem Check",
  "Filter Cleaning",
  "Weekly Maintenance",
  "One-Time Cleaning",
]

export function AssignJobPage() {
  const t = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { properties, businessUsers, addJob } = useJobsStore()

  const preselectedId = searchParams.get("propertyId")

  const [propertyId, setPropertyId] = React.useState(
    preselectedId ?? properties[0]?.id ?? ""
  )
  // Everyone on the team (admins + technicians) can be handed a job -
  // only shown when there's actually more than one person to pick from,
  // so a solo business's flow looks exactly like it always has.
  const team = businessUsers.filter((u) => u.role === "provider")
  const [technicianId, setTechnicianId] = React.useState(user?.id ?? "")

  React.useEffect(() => {
    if (!technicianId && user) setTechnicianId(user.id)
  }, [user, technicianId])
  const [date, setDate] = React.useState("")
  // Deliberately starts blank rather than defaulting to 9:00 AM - a
  // default meant every job left untouched here silently landed at 9:00,
  // which is exactly the "every job shows 9am" issue Shail reported.
  // Blank forces an explicit choice, same as the date field beside it.
  const [time, setTime] = React.useState("")
  const [serviceType, setServiceType] = React.useState<ServiceType>(
    "Weekly Maintenance"
  )
  const [extraTasks, setExtraTasks] = React.useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!propertyId && properties[0]) setPropertyId(properties[0].id)
  }, [properties, propertyId])

  const recurrence: RecurrenceRule =
    serviceType === "Weekly Maintenance" ? "weekly" : "none"

  const selectedProperty = properties.find((p) => p.id === propertyId)
  const availableExtraTasks = extraTasksFor(selectedProperty?.hasSpa)

  function toggleExtraTask(taskId: string) {
    setExtraTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !selectedProperty) return
    if (!date || !time) {
      setError("Pick both a date and a time for this visit.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // This visit's extra tasks only ever apply to this one job - they're
      // not remembered anywhere else, so a recurring job's next auto-
      // scheduled visit always starts fresh from just the base checklist.
      const chosenExtras = availableExtraTasks.filter((t) => extraTasks[t.id])
      await addJob({
        id: "",
        businessId: user.businessId,
        propertyId: selectedProperty.id,
        ownerId: selectedProperty.ownerId,
        technicianId: technicianId || user.id,
        status: "scheduled",
        serviceType,
        scheduledDate: date,
        scheduledTime: formatTime12h(time),
        estMinutes: 45,
        tasks: [
          ...BASE_TASKS.map((t) => ({ ...t, done: false })),
          ...chosenExtras.map((t) => ({ id: t.id, label: t.label, done: false })),
        ],
        recurrence,
        createdAt: new Date().toISOString(),
      })
      navigate("/jobs")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign the job.")
    } finally {
      setSubmitting(false)
    }
  }

  if (properties.length === 0) {
    return (
      <div className="flex min-h-full flex-col bg-background pb-6">
        <TopBar title={t("Schedule Service")} showBack backTo="/customers" />
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-base text-muted-foreground">
            {t("You don't have any customers yet. Add one first, then come back to schedule their service.")}
          </p>
          <Button asChild size="lg">
            <Link to="/customers">{t("Add a Customer")}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-background pb-8">
      <TopBar title={t("Schedule Service")} showBack backTo="/customers" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-7 px-4 py-5">
        <div className="space-y-2.5">
          <Label className="flex items-center gap-2 text-base font-semibold text-primary">
            <MapPin className="size-5" /> {t("Customer")}
          </Label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="h-14 w-full rounded-xl border border-input bg-transparent px-4 text-base shadow-xs"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.customerName} — {p.address}
              </option>
            ))}
          </select>

          {selectedProperty && (
            <div className="flex flex-col gap-1.5 rounded-xl border p-4 text-base">
              <p className="flex items-center gap-2 font-semibold">
                <UserIcon className="size-4 text-muted-foreground" />
                {selectedProperty.customerName}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedProperty.address}
              </p>
              {selectedProperty.gateCode && (
                <p className="text-sm text-muted-foreground">
                  {t("Gate code:")} {selectedProperty.gateCode}
                </p>
              )}
              {!selectedProperty.claimed && (
                <p className="text-sm text-accent-foreground">
                  {t("This customer hasn't created their account yet.")}
                </p>
              )}
            </div>
          )}
        </div>

        {team.length > 1 && (
          <div className="space-y-2.5">
            <Label className="flex items-center gap-2 text-base font-semibold">
              <UserIcon className="size-5 text-muted-foreground" /> {t("Assign To")}
            </Label>
            <select
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              className="h-14 w-full rounded-xl border border-input bg-transparent px-4 text-base shadow-xs"
            >
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === user?.id ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2.5">
            <Label className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="size-5 text-muted-foreground" /> {t("Date")}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-14 rounded-xl text-base"
            />
          </div>
          <div className="space-y-2.5">
            <Label className="flex items-center gap-2 text-base font-semibold">
              <Clock className="size-5 text-muted-foreground" /> {t("Time")}
            </Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="h-14 rounded-xl text-base"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <Label className="text-base font-semibold">{t("Service Type")}</Label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
            className="h-14 w-full rounded-xl border border-input bg-transparent px-4 text-base shadow-xs"
          >
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {recurrence !== "none" && (
          <p className="rounded-xl bg-accent/60 px-4 py-3 text-sm text-accent-foreground">
            {t("This will automatically repeat")} {recurrence} {t("— the next visit is scheduled as soon as this one is marked complete.")}
          </p>
        )}

        <div className="space-y-2.5">
          <Label className="text-base font-semibold">
            {t("Anything else needed this visit? (optional)")}
          </Label>
          <div className="grid grid-cols-2 gap-2.5">
            {availableExtraTasks.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2.5 rounded-xl border p-3.5 text-sm font-medium"
              >
                <Checkbox
                  className="size-6"
                  checked={!!extraTasks[t.id]}
                  onCheckedChange={() => toggleExtraTask(t.id)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        <Button
          type="submit"
          size="lg"
          className="h-14 w-full text-base"
          disabled={submitting}
        >
          {submitting ? "Scheduling..." : "Schedule Service"}
        </Button>
      </form>
    </div>
  )
}
