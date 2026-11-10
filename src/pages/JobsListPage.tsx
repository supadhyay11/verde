import { useT, tr } from "@/lib/i18n"
import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  MapPin,
  Clock,
  Pencil,
  Plus,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Phone,
  MessageSquare,
  List,
  Map as MapIcon,
} from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { StatusBadge } from "@/components/StatusBadge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RoutePanel } from "@/components/RoutePanel"
import { isBizAdmin, useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import { format, formatTime12h, localDateIso, localTodayIso, to24Hour } from "@/lib/date"
import { mapsLink } from "@/lib/maps"
import { compareByRoute } from "@/lib/route"
import type { AppUser, Property, ServiceJob } from "@/types"

const MS_PER_DAY = 86_400_000

type Tab = "today" | "completed" | "upcoming"

function weekdayLabel(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

/** Whole-day difference between an ISO date and today, ignoring time. */
function diffDaysFromToday(isoDate: string, todayIso: string) {
  const a = new Date(`${todayIso}T00:00:00`).getTime()
  const b = new Date(`${isoDate}T00:00:00`).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

/** Today/Tomorrow/Yesterday when close by, otherwise a weekday + date -
 * shared by both the upcoming Scheduled grouping and the Completed
 * grouping below, so a day reads the same way in either tab. */
function dayHeaderLabel(isoDate: string, todayIso: string) {
  const d = diffDaysFromToday(isoDate, todayIso)
  if (d === 0) return tr("Today")
  if (d === 1) return tr("Tomorrow")
  if (d === -1) return tr("Yesterday")
  return weekdayLabel(isoDate)
}

/** Which calendar day a completed job actually belongs to - the day it
 * was finished (completedAt), not scheduledDate, which can differ for a
 * job that ran late. Falls back to scheduledDate for old jobs saved
 * before completedAt existed. Shared by the Completed tab's day grouping
 * and the Today tab's "which completed jobs count as today" check, so
 * both agree on what "today" means for a finished job. */
function completedDayIso(job: ServiceJob) {
  return job.completedAt ? localDateIso(new Date(job.completedAt)) : job.scheduledDate
}

/** Most-recently-finished first - used wherever completed jobs are
 * listed, so the order matches when things actually happened instead of
 * their scheduled route order (a job scheduled earlier in the day but
 * finished later than a "later" stop used to show first - this fixes
 * that). Jobs with no completedAt at all (old data) sink to the bottom
 * rather than breaking the sort. */
function sortByCompletedDesc(jobs: ServiceJob[]) {
  return jobs.slice().sort((a, b) => {
    const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return bt - at
  })
}

function JobCard({
  job,
  property,
  isProvider,
  isAdmin,
  team,
  assigneeName,
  updateJob,
}: {
  job: ServiceJob
  property: Property | undefined
  isProvider: boolean
  isAdmin: boolean
  team: AppUser[]
  assigneeName: string | undefined
  updateJob: (id: string, patch: Partial<ServiceJob>) => Promise<void>
}) {
  const t = useT()
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState(false)
  const [editDate, setEditDate] = React.useState(job.scheduledDate)
  const [editTime, setEditTime] = React.useState(to24Hour(job.scheduledTime))
  const [editTechnicianId, setEditTechnicianId] = React.useState(job.technicianId ?? "")
  const [saving, setSaving] = React.useState(false)

  // Only worth showing an "assign to" control at all when there's more
  // than one person it could possibly go to - a solo business's Jobs
  // list looks exactly like it always has.
  const canReassign = isAdmin && team.length > 1

  function startEdit(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditDate(job.scheduledDate)
    setEditTime(to24Hour(job.scheduledTime))
    setEditTechnicianId(job.technicianId ?? "")
    setEditing(true)
  }

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!editDate || !editTime) return
    setSaving(true)
    try {
      await updateJob(job.id, {
        scheduledDate: editDate,
        scheduledTime: formatTime12h(editTime),
        ...(canReassign && editTechnicianId ? { technicianId: editTechnicianId } : {}),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditing(false)
  }

  return (
    <Card
      className="gap-2 p-4 transition-shadow hover:shadow-md"
      onClick={() => {
        if (editing) return
        navigate(`/jobs/${job.id}`)
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <input
              type="date"
              value={editDate}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
            />
            <input
              type="time"
              value={editTime}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditTime(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
            />
            {canReassign && (
              <select
                value={editTechnicianId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditTechnicianId(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs"
              >
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <Button size="sm" className="h-8 px-2.5" disabled={saving} onClick={handleSave}>
              {saving ? "..." : t("Save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={saving}
              onClick={handleCancel}
            >
              {t("Cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">{job.scheduledTime}</p>
            {isProvider && job.status !== "completed" && (
              <button
                type="button"
                onClick={startEdit}
                aria-label={canReassign ? t("Edit date, time, and assignee") : t("Edit date and time")}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {assigneeName && (
        <p className="text-xs text-muted-foreground">{t("Assigned to")} {assigneeName}</p>
      )}
      {isProvider ? (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold">{property?.customerName}</p>
            {property?.address && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" /> {property.address}
              </p>
            )}
          </div>
          {(property?.phone || property?.address) && (
            <div className="flex shrink-0 gap-1">
              {property?.address && (
                <a
                  href={mapsLink(property.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t("Open {name}'s address in Maps", { name: property.customerName })}
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <MapPin className="size-3.5" />
                </a>
              )}
              {property?.phone && (
                <>
                  <a
                    href={`tel:${property.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t("Call {name}", { name: property.customerName })}
                    className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <Phone className="size-3.5" />
                  </a>
                  <a
                    href={`sms:${property.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t("Text {name}", { name: property.customerName })}
                    className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <MessageSquare className="size-3.5" />
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="font-bold">{property?.customerName}</p>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" /> {tr(job.serviceType)}
        </span>
        {job.distanceMiles != null && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {Number(job.distanceMiles.toFixed(1))} {t("mi")}
          </span>
        )}
      </div>
      {isProvider && job.status === "completed" && (
        <p
          className={
            "flex items-center gap-1 text-xs " +
            (job.reportFirstViewedAt ? "text-success" : "text-muted-foreground")
          }
        >
          <Eye className="size-3" />
          {job.reportFirstViewedAt ? t("Report viewed") : t("Report not yet viewed")}
        </p>
      )}
    </Card>
  )
}

function MissedJobs({
  jobs,
  getProperty,
  team,
  getUser,
  updateJob,
  deleteJob,
}: {
  jobs: ServiceJob[]
  getProperty: (id: string | null | undefined) => Property | undefined
  team: AppUser[]
  getUser: (id: string | null | undefined) => AppUser | undefined
  updateJob: (id: string, patch: Partial<ServiceJob>) => Promise<void>
  deleteJob: (id: string) => Promise<void>
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [confirmId, setConfirmId] = React.useState<string | "all" | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const repeating = jobs.filter((j) => j.recurrence && j.recurrence !== "none").length

  async function remove(ids: string[]) {
    setBusy(true)
    setError(null)
    try {
      await Promise.all(ids.map((id) => deleteJob(id)))
      setConfirmId(null)
    } catch {
      setError(t("Couldn't delete. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left text-sm font-semibold text-destructive"
      >
        {t("Missed jobs")} <span className="text-xs font-normal opacity-80">({jobs.length})</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("These were scheduled for a past day and never completed. Reschedule a job with the pencil on its card, or delete the ones you won't do.")}
            {repeating > 0 &&
              " " + t("{n} of them repeat: deleting a repeating job doesn't schedule its next visit, so reschedule those instead if you want the series to continue.", { n: repeating })}
          </p>
          {confirmId === "all" ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => remove(jobs.map((j) => j.id))}
              >
                {busy ? t("Deleting...") : t("Yes, delete {n}", { n: jobs.length })}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                {t("Cancel")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("This can't be undone.")}</span>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="self-start text-destructive"
              onClick={() => setConfirmId("all")}
            >
              <Trash2 className="size-3.5" /> {t("Delete all")} {jobs.length} {t("missed jobs")}
            </Button>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-1.5">
                <JobCard
                  job={job}
                  property={getProperty(job.propertyId)}
                  isProvider
                  isAdmin
                  team={team}
                  assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                  updateJob={updateJob}
                />
                {confirmId === job.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => remove([job.id])}
                    >
                      {busy ? t("Deleting...") : t("Yes, delete this job")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                      {t("Cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-end text-destructive"
                    onClick={() => setConfirmId(job.id)}
                  >
                    <Trash2 className="size-3.5" /> {t("Delete job")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function JobsListPage() {
  const t = useT()
  const { user } = useAuth()
  const { jobs, businessUsers, getProperty, getUser, updateJob, deleteJob } = useJobsStore()
  const team = businessUsers.filter((u) => u.role === "provider")
  const isAdmin = isBizAdmin(user)
  const [tab, setTab] = React.useState<Tab>("today")
  // Providers can flip the Jobs screen between the usual list and a map of a day's route.
  const [view, setView] = React.useState<"list" | "map">("map")
  const [search, setSearch] = React.useState("")
  // "all" or a technician's user id; shared by the List and Map views.
  // Opens on the signed-in person's own jobs. An admin can switch to
  // "Everyone" or another technician; a technician only ever sees theirs.
  const [pickedTech, setPickedTech] = React.useState<string | null>(null)
  // An admin who has no jobs of their own (everything goes to technicians)
  // opens on Everyone instead of an empty screen.
  const adminHasOwnJobs = !!user && jobs.some((j) => j.technicianId === user.id)
  const ownJobsDefault =
    user?.role === "provider" && team.length > 1 && (!isAdmin || adminHasOwnJobs)
  const techId = !ownJobsDefault ? "all" : isAdmin ? (pickedTech ?? user!.id) : user!.id
  const setTechId = setPickedTech
  // Keyed by "<tab>:<dateIso>" so collapsing a day in one tab doesn't
  // affect the same date's section in another tab.
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(new Set())

  const isProvider = user?.role === "provider"
  const todayIso = localTodayIso()

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const searchQuery = search.trim().toLowerCase()
  function matchesSearch(job: ServiceJob) {
    if (!searchQuery) return true
    const name = getProperty(job.propertyId)?.customerName ?? ""
    return name.toLowerCase().includes(searchQuery)
  }

  const sortedJobs = jobs
    .filter(matchesSearch)
    .filter((j) => techId === "all" || j.technicianId === techId)
    .slice()
    .sort((a, b) => {
      // Sort by day first (Tue before Wed, etc), then by the actual
      // scheduled time within that day. scheduledTime is stored as
      // "9:00 AM" / "12:30 PM" - a plain string sort on that puts "10:00
      // AM" before "2:00 PM" before "9:00 AM", which looked like jobs were
      // in a random/default order. to24Hour turns it into a zero-padded
      // "HH:MM" that sorts correctly.
      const byDate = a.scheduledDate.localeCompare(b.scheduledDate)
      if (byDate !== 0) return byDate
      // Same day: a route the provider optimized on the Map wins over plain time order.
      return compareByRoute(a, b)
    })

  // Split into three clean buckets instead of one mixed list - a
  // provider can now flip between today's work, what's coming up, and
  // what's already done, instead of scanning one long feed for the kind
  // of job they actually want to see right now. There's no Overdue tab
  // or bucket at all anymore (it was one tab too many and confusing) - a
  // past-due, not-yet-completed job just shows up in Upcoming under its
  // own (past) date, styled in red so it still stands out, and can be
  // rescheduled to any date right from its card like any other job.
  const completedJobs = sortedJobs.filter((j) => j.status === "completed")
  // "Today" shows the WHOLE day - jobs still to do, AND jobs already
  // finished today - instead of a job vanishing from Today the instant
  // it's completed (it used to only reappear buried inside the
  // Completed tab's own "Today" section, which was the #1 source of
  // "wait, where did that job go?" confusion). A completed job counts as
  // "today" by when it was actually finished (completedDayIso), not its
  // original scheduledDate, same rule the Completed tab already uses.
  const todayRemaining = sortedJobs.filter(
    (j) => j.status !== "completed" && diffDaysFromToday(j.scheduledDate, todayIso) === 0
  )
  const todayCompleted = sortByCompletedDesc(
    completedJobs.filter((j) => completedDayIso(j) === todayIso)
  )
  const todayJobs = [...todayRemaining, ...todayCompleted]
  // "Upcoming" includes every not-yet-completed job other than today's -
  // both overdue (any number of days in the past) and future, capped at
  // a rolling 6-day-out window so the future side reads as "this week
  // ahead" instead of an endless scroll of every job ever scheduled.
  const upcomingJobs = sortedJobs.filter((j) => {
    if (j.status === "completed") return false
    const d = diffDaysFromToday(j.scheduledDate, todayIso)
    return d >= 1 && d <= 6
  })
  // Jobs whose day has passed without being completed. They no longer sit in
  // Upcoming; an admin sees them at the bottom of Today to reschedule or delete.
  const missedJobs = sortedJobs.filter(
    (j) => j.status !== "completed" && diffDaysFromToday(j.scheduledDate, todayIso) < 0
  )

  const sections: { key: string; label: string; jobs: ServiceJob[]; emphasize?: boolean; overdue?: boolean }[] = []
  const byDate = new Map<string, ServiceJob[]>()
  for (const job of upcomingJobs) {
    const list = byDate.get(job.scheduledDate) ?? []
    list.push(job)
    byDate.set(job.scheduledDate, list)
  }
  // Oldest (most overdue) first, then soonest-to-furthest for the future.
  const upcomingDatesSorted = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b))
  for (const dateIso of upcomingDatesSorted) {
    const d = diffDaysFromToday(dateIso, todayIso)
    // Tomorrow gets a bolder, larger header - that's the section a
    // provider most needs to glance at while planning today.
    sections.push({
      key: `upcoming:${dateIso}`,
      label: dayHeaderLabel(dateIso, todayIso),
      jobs: byDate.get(dateIso) ?? [],
      emphasize: d === 1,
      overdue: d < 0,
    })
  }

  // Completed jobs grouped by the day they were actually finished (not
  // scheduledDate, which can differ for a job that ran late) - most
  // recent day first, so a provider scrolling the Completed tab reads
  // back through their history the same way Scheduled reads forward
  // through the week. Within each day, jobs are ordered by when they
  // were actually finished (sortByCompletedDesc), not their scheduled
  // route order - previously this list quietly inherited the schedule's
  // sort order, so a job finished later could show above one finished
  // earlier the same day.
  const completedSections: { key: string; label: string; jobs: ServiceJob[] }[] = []
  const completedByDate = new Map<string, ServiceJob[]>()
  for (const job of completedJobs) {
    const dateIso = completedDayIso(job)
    const list = completedByDate.get(dateIso) ?? []
    list.push(job)
    completedByDate.set(dateIso, list)
  }
  const completedDatesDesc = Array.from(completedByDate.keys()).sort((a, b) => b.localeCompare(a))
  for (const dateIso of completedDatesDesc) {
    completedSections.push({
      key: `completed:${dateIso}`,
      label: dayHeaderLabel(dateIso, todayIso),
      jobs: sortByCompletedDesc(completedByDate.get(dateIso) ?? []),
    })
  }

  const todayTotal = todayRemaining.length + todayCompleted.length
  const subtitleText =
    tab === "today"
      ? todayTotal > 0
        ? t("{a} of {b} done today", { a: todayCompleted.length, b: todayTotal })
        : searchQuery
          ? t("No jobs today match \"{q}\"", { q: search })
          : t("Nothing scheduled for today")
      : tab === "completed"
        ? t("{n} completed", { n: completedJobs.length })
        : t("{n} upcoming", { n: upcomingJobs.length })

  const tabs: { key: Tab; label: string; count: number }[] = [
    // The Today badge counts REMAINING work (what still needs doing),
    // not the full day's total - that's the number worth a provider's
    // attention at a glance, while the full picture (including what's
    // already done) lives in the subtitle and the tab body itself.
    { key: "today", label: t("Today"), count: todayRemaining.length },
    { key: "completed", label: t("Completed"), count: completedJobs.length },
    { key: "upcoming", label: "Upcoming", count: upcomingJobs.length },
  ]

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar
        initials={user?.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      />
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h2 className="text-xl font-bold">
            {isProvider ? t("Jobs") : t("My Service Visits")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isProvider
              ? subtitleText
              : `${jobs.length} visits \u00b7 starting ${format(new Date(), "MMM d, yyyy")}`}
          </p>
        </div>
        {isProvider && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label={t("Jobs view")}>
              {(
                [
                  { key: "list", label: "List", icon: List },
                  { key: "map", label: "Map", icon: MapIcon },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors " +
                    (view === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground")
                  }
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <Button asChild size="sm">
              <Link to="/jobs/new">
                <Plus className="size-4" /> {t("New")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {isProvider && view === "list" && (
        <div className="relative px-4 pt-3">
          <Search className="absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search by customer name")}
            className="pl-9"
          />
        </div>
      )}

      {isProvider && isAdmin && view === "list" && team.length > 1 && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <label htmlFor="jobsTechFilter" className="text-sm text-muted-foreground">
            {t("Technician")}
          </label>
          <select
            id="jobsTechFilter"
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-input bg-transparent px-3 text-sm sm:max-w-xs"
          >
            <option value="all">{t("Everyone")}</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id === user?.id ? tr("{name} (you)", { name: t.name }) : t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isProvider && view === "list" && (
        <div className="flex gap-2 px-4 pt-3">
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
                }
              >
                {tr(t.label)}
                {t.count > 0 && <span className="opacity-80">({t.count})</span>}
              </button>
            )
          })}
        </div>
      )}

      {isProvider && view === "map" && <RoutePanel techId={techId} onTechIdChange={setTechId} canChangeTech={isAdmin} />}

      <div className={"flex flex-col gap-5 px-4 py-4" + (isProvider && view === "map" ? " hidden" : "")}>
        {isProvider ? (
          tab === "today" ? (
            <div className="flex flex-col gap-5">
              {todayRemaining.length > 0 && (
                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                  {todayCompleted.length > 0 && (
                    <p className="lg:col-span-2 text-sm font-semibold text-muted-foreground">
                      {t("Remaining")}{" "}
                      <span className="text-xs font-normal opacity-70">({todayRemaining.length})</span>
                    </p>
                  )}
                  {todayRemaining.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      property={getProperty(job.propertyId)}
                      isProvider={isProvider}
                      isAdmin={isAdmin}
                      team={team}
                      assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                      updateJob={updateJob}
                    />
                  ))}
                </div>
              )}
              {todayCompleted.length > 0 && (
                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                  {todayRemaining.length > 0 && (
                    <p className="lg:col-span-2 text-sm font-semibold text-muted-foreground">
                      {t("Completed")}{" "}
                      <span className="text-xs font-normal opacity-70">({todayCompleted.length})</span>
                    </p>
                  )}
                  {todayCompleted.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      property={getProperty(job.propertyId)}
                      isProvider={isProvider}
                      isAdmin={isAdmin}
                      team={team}
                      assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                      updateJob={updateJob}
                    />
                  ))}
                </div>
              )}
              {todayJobs.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {searchQuery ? t("No jobs today match \"{q}\".", { q: search }) : t("Nothing scheduled for today.")}
                </p>
              )}
              {isAdmin && missedJobs.length > 0 && (
                <MissedJobs
                  jobs={missedJobs}
                  getProperty={getProperty}
                  team={team}
                  getUser={getUser}
                  updateJob={updateJob}
                  deleteJob={deleteJob}
                />
              )}
            </div>
          ) : tab === "completed" ? (
            <>
              {completedSections.map((section) => {
                const isCollapsed = collapsedSections.has(section.key)
                return (
                  <div key={section.key} className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className="flex items-center gap-1 text-left text-sm font-semibold text-muted-foreground lg:col-span-2"
                    >
                      {section.label}
                      <span className="text-xs font-normal opacity-70">({section.jobs.length})</span>
                      {isCollapsed ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronUp className="size-4" />
                      )}
                    </button>
                    {!isCollapsed &&
                      section.jobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          property={getProperty(job.propertyId)}
                          isProvider={isProvider}
                          isAdmin={isAdmin}
                          team={team}
                          assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                          updateJob={updateJob}
                        />
                      ))}
                  </div>
                )
              })}
              {completedSections.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {searchQuery ? t("No completed jobs match \"{q}\".", { q: search }) : t("No completed jobs yet.")}
                </p>
              )}
            </>
          ) : (
            <>
              {sections.map((section) => {
                const isCollapsed = collapsedSections.has(section.key)
                return (
                  <div key={section.key} className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className={
                        "flex items-center gap-1 text-left lg:col-span-2 " +
                        (section.overdue
                          ? "text-sm font-bold text-destructive"
                          : section.emphasize
                            ? "text-lg font-bold text-foreground"
                            : "text-sm font-semibold text-muted-foreground")
                      }
                    >
                      {section.label}
                      <span className="text-xs font-normal opacity-70">({section.jobs.length})</span>
                      {isCollapsed ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronUp className="size-4" />
                      )}
                    </button>
                    {!isCollapsed &&
                      section.jobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          property={getProperty(job.propertyId)}
                          isProvider={isProvider}
                          isAdmin={isAdmin}
                          team={team}
                          assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                          updateJob={updateJob}
                        />
                      ))}
                  </div>
                )
              })}
              {sections.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {searchQuery ? t("No upcoming jobs match \"{q}\".", { q: search }) : t("Nothing coming up this week.")}
                </p>
              )}
            </>
          )
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
            {sortedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                property={getProperty(job.propertyId)}
                isProvider={isProvider}
                isAdmin={isAdmin}
                team={team}
                assigneeName={team.length > 1 ? getUser(job.technicianId)?.name : undefined}
                updateJob={updateJob}
              />
            ))}
            {sortedJobs.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("No visits yet.")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
