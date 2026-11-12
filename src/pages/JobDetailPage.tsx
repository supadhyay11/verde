import { MAX_JOB_PHOTOS, jobPhotos } from "@/lib/photos"
import { BilingualNote, pickText } from "@/lib/i18n/text"
import { useI18n, useT, tr, locale, trIn } from "@/lib/i18n"
import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Camera,
  CheckCircle2,
  Images,
  X,
  MapPin,
  Clock,
  Eye,
  FileText,
  Link as LinkIcon,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  User as UserIcon,
} from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { StatusBadge } from "@/components/StatusBadge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import { cn } from "@/lib/utils"
import { extraTasksFor } from "@/lib/tasks"
import { inviteLink, inviteMessage, smsLink } from "@/lib/invite"
import { formatTime12h, to24Hour } from "@/lib/date"
import { mapsLink } from "@/lib/maps"
import type { EquipmentStatus, ServiceReport, WaterStatus } from "@/types"

// Sensible starting point for the dials on a brand-new report - lands
// right in the middle of the "Good" zone for each, rather than at the
// bottom of the range, so the very first thing the technician sees isn't
// a red "Low" reading they haven't actually taken yet. The chemistry
// dials are always shown (no more "Chemistry tested" checkbox gating
// them), so the report is marked as tested from the start.
const DEFAULT_CHLORINE = "2.0"
const DEFAULT_PH = "7.4"

const DEFAULT_REPORT: ServiceReport = {
  waterStatus: "ready",
  waitHours: "",
  chemistryTested: true,
  chlorine: DEFAULT_CHLORINE,
  ph: DEFAULT_PH,
  equipmentStatus: "running",
  attentionNotes: "",
}

function PhotoSlot({
  label,
  uploading,
  onPick,
  max = 1,
}: {
  label: string
  uploading: boolean
  onPick: (files: File[]) => void
  /** How many more photos can be added right now. */
  max?: number
}) {
  const t = useT()
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const galleryRef = React.useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, max)
    if (files.length) onPick(files)
    e.target.value = ""
  }

  return (
    <div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={handleFile}
      />

      {/* Tapping the square opens the camera directly - that's the common
          case in the field. The small gallery button in the corner is the
          exception for picking an existing photo. */}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        disabled={uploading}
        className={cn(
          "relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-accent bg-accent/40 text-primary"
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <>
            <Camera className="size-6" />
            <span className="text-xs font-medium">{label}</span>
          </>
        )}

        <span
          role="button"
          aria-label={t("Choose from gallery")}
          onClick={(e) => {
            e.stopPropagation()
            if (!uploading) galleryRef.current?.click()
          }}
          className="absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-full bg-background text-foreground shadow-elevated"
        >
          <Images className="size-4" />
        </span>
      </button>
    </div>
  )
}

export function JobDetailPage() {
  const t = useT()
  const { lang } = useI18n()
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { jobs, business, getProperty, getUser, updateJob, uploadJobPhoto, removeJobPhoto } = useJobsStore()

  const job = jobs.find((j) => j.id === id)
  const [tasks, setTasks] = React.useState(job?.tasks ?? [])
  const [report, setReport] = React.useState<ServiceReport>(
    job?.report ?? DEFAULT_REPORT
  )
  const [notes, setNotes] = React.useState(job?.notes ?? "")
  const [uploading, setUploading] = React.useState(false)
  const [completing, setCompleting] = React.useState(false)
  const [completeError, setCompleteError] = React.useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = React.useState(false)
  const [editDate, setEditDate] = React.useState("")
  const [editTime, setEditTime] = React.useState("")
  const [savingSchedule, setSavingSchedule] = React.useState(false)

  // Clicking "Complete & Send Report" while the Comments box still has
  // focus blurs it FIRST (browser order: mousedown -> blur -> click), so
  // handleNotesBlur used to always fire its own separate updateDoc right
  // before handleComplete's. That's redundant - handleComplete already
  // sends the current `notes` value itself - but the extra network
  // request queued just ahead of it was enough, on a slow connection, to
  // delay the real "status: completed" write landing on the server while
  // the report-link text/email already went out (see the comment in
  // handleComplete about why that has to fire before the write is
  // awaited) - so a customer opening the link right away could briefly
  // see "Report not available". Setting this flag on the button's
  // mousedown (which fires before the blur) lets handleNotesBlur skip its
  // own save exactly when it's about to be superseded, without losing the
  // autosave-on-navigate-away behavior for every other case. Declared up
  // here with the other hooks (not next to handleNotesBlur below) since
  // this component has an early `if (!job) return` - a hook can never be
  // called after a conditional return.
  const skipNextNotesBlurSave = React.useRef(false)

  // Only re-sync local form state when we're looking at a DIFFERENT job
  // (navigated here fresh, or the id changed) - not on every Firestore
  // update to this same job. toggling a checklist item or adding a task
  // writes to Firestore immediately, which pushes a brand-new `job`
  // object through the listener; syncing on every such change was
  // silently wiping out whatever the provider had already typed into
  // the water/chemistry/equipment fields and comments before they'd
  // been saved (those only get written to Firestore when the job is
  // completed, or on blur for comments).
  const jobId = job?.id
  React.useEffect(() => {
    if (job) {
      setTasks(job.tasks)
      setReport(job.report ?? DEFAULT_REPORT)
      setNotes(job.notes ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  if (!job) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t("Job not found.")}
      </div>
    )
  }

  const currentJob = job
  const property = getProperty(currentJob.propertyId)
  const technician = getUser(currentJob.technicianId)
  const isProvider = user?.role === "provider"

  function toggleTask(taskId: string) {
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t
    )
    setTasks(updated)
    updateJob(currentJob.id, { tasks: updated })
  }

  function addStandardTask(taskId: string, label: string) {
    const updated = [...tasks, { id: taskId, label, done: false }]
    setTasks(updated)
    updateJob(currentJob.id, { tasks: updated })
  }

  function handleNotesBlur() {
    if (skipNextNotesBlurSave.current) {
      skipNextNotesBlurSave.current = false
      return
    }
    if (notes !== (job?.notes ?? "")) {
      updateJob(currentJob.id, { notes: notes.trim() || undefined })
    }
  }

  async function handlePhotoPick(files: File[]) {
    setUploading(true)
    try {
      const room = MAX_JOB_PHOTOS - jobPhotos(currentJob).length
      // One after another so each photo is added to the list cleanly.
      for (const file of files.slice(0, Math.max(room, 0))) {
        await uploadJobPhoto(currentJob.id, file)
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    setCompleteError(null)

    // Both the email AND the text now go out for real, automatically, in
    // the background the instant this job's doc updates below -
    // onJobCompletedSendReportEmail and onJobCompletedSendReportSms (see
    // functions/reports.js and functions/sms.js) - so there's no
    // client-side mailto/sms compose to fire here anymore. (Email has no
    // gate beyond having an address on file; the text only goes out if
    // the customer also has smsConsent set - see reportSmsConsent below.)
    // This used to force-open the device's own Messages app with a
    // pre-filled text every time a job was completed, back before Quo's
    // carrier registration was approved and automatic SMS existed at
    // all - that's gone now. The manual "Text" button further down (in
    // the completed-job view) still opens Messages on demand, for a
    // deliberate one-off resend.

    try {
      await updateJob(currentJob.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        invoiceRef:
          currentJob.invoiceRef ?? `#INV-${Math.floor(1000 + Math.random() * 9000)}`,
        // Save the checklist state along with everything else, in case a
        // toggle's own save is still in flight.
        tasks,
        report,
        notes: notes.trim() || undefined,
        // Snapshot the display fields the public report page needs, so it
        // never has to read the property/business docs directly (those
        // hold things like the gate code that must stay private).
        reportCustomerName: property?.customerName ?? "",
        reportLanguage: property?.language ?? "en",
        reportAddress: property?.address ?? "",
        reportBusinessName: business?.name ?? "",
        reportBusinessPhone: business?.phone ?? "",
        // Whoever is actually completing the visit right now, not
        // whoever the job happens to be assigned to - an admin covering
        // for a technician (or vice versa) should show up on the report
        // as the one who was really there. `technician` (below) is still
        // used elsewhere on this page for "who is this job assigned to".
        reportTechnicianName: user?.name ?? technician?.name ?? "",
        reportInviteCode: property?.inviteCode ?? "",
        // Lets the background Cloud Function email the report without
        // ever reading the property doc itself (same pattern as invoices).
        reportCustomerEmail: property?.email ?? null,
        // Same idea, for onJobCompletedSendReportSms (functions/sms.js) -
        // only ever texted when the customer has actually consented.
        reportCustomerPhone: property?.phone ?? null,
        reportSmsConsent: property?.smsConsent ?? false,
      })
      // Stay on this page rather than navigating away - once the job's
      // status flips to "completed" it re-renders as the summary view
      // right here, with the (optional, manual re-send) Send Report
      // options below.
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : t("Couldn't mark this job complete. Try again.")
      )
    } finally {
      setCompleting(false)
    }
  }

  // Lets a provider go back and fix a job that was saved with the wrong
  // date/time - most commonly one of the jobs that got silently saved at
  // 9:00 AM before the scheduling form required an explicit time.
  function startEditSchedule() {
    setEditDate(currentJob.scheduledDate)
    setEditTime(to24Hour(currentJob.scheduledTime))
    setEditingSchedule(true)
  }

  async function handleSaveSchedule() {
    if (!editDate || !editTime) return
    setSavingSchedule(true)
    try {
      await updateJob(currentJob.id, {
        scheduledDate: editDate,
        scheduledTime: formatTime12h(editTime),
      })
      setEditingSchedule(false)
    } finally {
      setSavingSchedule(false)
    }
  }

  function reportLink() {
    return `${window.location.origin}/report/${currentJob.id}`
  }

  // Email/text handlers use window.open rather than window.location.href,
  // and "Both" fires them synchronously back to back rather than staggering
  // the second with a setTimeout. Two window.location.href writes in the
  // same tick cancel each other, which is why setTimeout was used - but a
  // delayed call loses "user gesture" status on mobile browsers and gets
  // silently blocked, so email would open but the text never would. Two
  // synchronous window.open calls avoid both problems. These are now only
  // ever triggered by an explicit tap on a resend button below - never
  // automatically on job completion (see handleComplete above).
  function handleSendEmail() {
    if (!property?.email) return
    const dateStr = new Date(`${currentJob.scheduledDate}T00:00:00`).toDateString()
    const cl = property.language ?? "en"
    const subject = trIn(cl, "Your garden service report - {date}", { date: dateStr })
    const body = [
      trIn(cl, "Hi {name},", { name: property.customerName || trIn(cl, "there") }),
      "",
      trIn(cl, "Here's your garden service report from {biz} for {date}:", { biz: business?.name || trIn(cl, "us"), date: dateStr }),
      reportLink(),
      "",
      trIn(cl, "Thanks!"),
    ].join("\n")
    window.open(`mailto:${property.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank")
  }

  function handleSendText() {
    if (!property?.phone) return
    const cl = property.language ?? "en"
    const body = trIn(cl, "Your garden service report from {biz}: {link}", { biz: business?.name || trIn(cl, "us"), link: reportLink() })
    window.open(smsLink(property.phone, body), "_blank")
  }

  function handleSendBoth() {
    handleSendText()
    handleSendEmail()
  }

  // Invites this property's customer to create their own owner account,
  // using the same invite code/link shown on the Customers page - handy to
  // offer right when the provider is already sending them a report.
  function handleInviteEmail() {
    if (!property?.email) return
    const subject = trIn(property.language ?? "en", "Create your free Verde account")
    const body = inviteMessage(business?.name, property.inviteCode, property.language)
    window.open(`mailto:${property.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank")
  }

  function handleInviteText() {
    if (!property?.phone) return
    const body = inviteMessage(business?.name, property.inviteCode, property.language)
    window.open(smsLink(property.phone, body), "_blank")
  }

  function handleInviteBoth() {
    handleInviteText()
    handleInviteEmail()
  }

  const showCompletedView = !isProvider || job.status === "completed"

  return (
    <div className="flex min-h-full flex-col bg-background pb-6">
      <TopBar title={t("Job Details")} showBack backTo="/jobs" />

      {showCompletedView ? (
        <div className="flex flex-col gap-5 px-4 py-4">
          <Card className="gap-3 border-l-4 border-l-success p-4">
            <div className="flex items-start justify-between">
              <div>
                <StatusBadge status={job.status} className="mb-1" />
                <p className="text-lg font-bold">{property?.customerName}</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" />{" "}
              {new Date(`${job.scheduledDate}T00:00:00`).toDateString()} {t("·")}{" "}
              {job.scheduledTime}
            </p>
            {job.completedAt && (
              <p className="text-xs text-muted-foreground">
                {t("Completed")} {new Date(job.completedAt).toLocaleString(locale(), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            {isProvider && job.status === "completed" && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  job.reportFirstViewedAt ? "text-success" : "text-muted-foreground"
                )}
              >
                <Eye className="size-3.5" />
                {job.reportFirstViewedAt
                  ? t("Report viewed by customer {when}", {
                      when:
                        new Date(job.reportLastViewedAt ?? job.reportFirstViewedAt).toLocaleString(locale(), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }) +
                        (job.reportViewCount && job.reportViewCount > 1 ? ` (${job.reportViewCount}x)` : ""),
                    })
                  : t("Report not yet viewed by customer")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Service Provider")}</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <UserIcon className="size-3.5" /> {technician?.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("Service Type")}</p>
                <p className="font-medium">{tr(job.serviceType)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("Duration")}</p>
                <p className="font-medium">{job.estMinutes} {t("mins")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("Invoice")}</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <FileText className="size-3.5" /> {job.invoiceRef ?? "—"}
                </p>
              </div>
            </div>
          </Card>

          {job.report && (
            <Card className="gap-4 p-4">
              <div>
                {/* Always reads positive - a wait period is a normal part
                    of some treatments, not a problem, so it's a small
                    note inside the same box rather than swapping the
                    whole thing to a warning state. */}
                <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-success">
                      {t("All Done & Looking Great")}
                    </p>
                    {job.report.waterStatus === "ready" ? (
                      <p className="text-xs text-muted-foreground">
                        {t("Serviced today — dive in whenever you're ready.")}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs font-medium text-warning">
                        <Clock className="size-3.5" />
                        {t("Wait")} {job.report.waitHours || "a few"} {t("hours before using the area.")}
                      </p>
                    )}
                  </div>
                </div>
                {jobPhotos(job).length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {jobPhotos(job).map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={t("Garden photo")}
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t("Services Performed")}</h3>
                  {job.tasks.length > 0 && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {job.tasks.filter((t) => t.done).length} {t("of")} {job.tasks.length} {t("done")}
                    </span>
                  )}
                </div>
                {job.tasks.some((t) => t.done) ? (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border">
                    {job.tasks
                      .filter((t) => t.done)
                      .map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 p-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                              <CheckCircle2 className="size-4" />
                            </span>
                            <span className="text-sm font-medium">{tr(task.label)}</span>
                          </div>
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success whitespace-nowrap">
                            {t("Completed")}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t("Tools & Equipment")}</h3>
                <p className="text-sm text-muted-foreground">
                  {job.report.equipmentStatus === "running"
                    ? t("✓ Running smoothly")
                    : t("⚠ Attention needed: {note}", { note: job.report.attentionNotes ? pickText(job.report.attentionNotes, job.attentionNotesI18n, lang).shown : "—" })}
                </p>
              </div>
            </Card>
          )}

          {job.notes && (
            <Card className="gap-2 p-4">
              <h3 className="text-sm font-semibold">{t("Comments")}</h3>
              <BilingualNote text={job.notes} tr={job.notesI18n} className="text-sm text-muted-foreground" />
            </Card>
          )}

          {isProvider && job.status === "completed" && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 font-semibold">
                {t("Send Report")}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                {property?.email
                  ? t("The report email was sent automatically when this job was marked complete. ")
                  : ""}
                {property?.phone && property?.smsConsent
                  ? t("A text with the report link was sent automatically too. ")
                  : ""}
                {t("Use these buttons any time to resend, or if the customer's contact info was added after this job was completed.")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!property?.email}
                  onClick={handleSendEmail}
                >
                  <Mail className="size-4" /> {t("Email")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!property?.phone}
                  onClick={handleSendText}
                >
                  <MessageSquare className="size-4" /> {t("Text")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!property?.email || !property?.phone}
                  onClick={handleSendBoth}
                >
                  {t("Both")}
                </Button>
              </div>
              {!property?.email && !property?.phone && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("Add an email or phone number for this customer to send them a report.")}
                </p>
              )}
              <button
                type="button"
                onClick={() => window.open(reportLink(), "_blank")}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground underline"
              >
                <LinkIcon className="size-3.5" /> {t("Preview report page")}
              </button>

              {!job.ownerId && property?.inviteCode && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="mb-1 font-semibold">{t("Invite to Verde")}</h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t("This customer doesn't have an account yet - the report page already includes a \"Join Verde\" link with their invite code, or send it directly below.")}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!property?.email}
                      onClick={handleInviteEmail}
                    >
                      <Mail className="size-4" /> {t("Email")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!property?.phone}
                      onClick={handleInviteText}
                    >
                      <MessageSquare className="size-4" /> {t("Text")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!property?.email || !property?.phone}
                      onClick={handleInviteBoth}
                    >
                      {t("Both")}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("Invite code:")} <span className="font-semibold">{property.inviteCode}</span>{" "}
                    ·{" "}
                    <button
                      type="button"
                      onClick={() => window.open(inviteLink(property.inviteCode, property.language), "_blank")}
                      className="underline"
                    >
                      {t("preview invite link")}
                    </button>
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => navigate("/jobs")}
              >
                {t("Done")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-4 py-4">
          <div>
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">{property?.customerName}</h2>
                {property?.address && (
                  <a
                    href={mapsLink(property.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    <MapPin className="size-3.5 shrink-0" /> {property.address}
                  </a>
                )}
              </div>
              <StatusBadge status={job.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tr(job.serviceType)}</p>
            {editingSchedule ? (
              <div className="mt-2 flex items-end gap-2">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-10 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="h-10 rounded-lg border border-input bg-transparent px-2 text-sm"
                />
                <Button size="sm" disabled={savingSchedule} onClick={handleSaveSchedule}>
                  {savingSchedule ? t("Saving...") : t("Save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingSchedule}
                  onClick={() => setEditingSchedule(false)}
                >
                  {t("Cancel")}
                </Button>
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-4" /> {new Date(`${job.scheduledDate}T00:00:00`).toDateString()},{" "}
                {job.scheduledTime}
                <button
                  type="button"
                  onClick={startEditSchedule}
                  className="ml-1 text-xs font-medium text-primary underline"
                >
                  {t("Edit")}
                </button>
              </p>
            )}
          </div>

          <div className="flex h-36 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <MapPin className="size-6" />
            <span className="ml-2 text-sm">{t("Map preview")}</span>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">{t("Completed Tasks")}</h3>
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <label
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border p-4"
                >
                  <Checkbox
                    className="size-6"
                    checked={task.done}
                    onCheckedChange={() => toggleTask(task.id)}
                  />
                  <span
                    className={cn(
                      "text-base",
                      task.done && "text-muted-foreground line-through"
                    )}
                  >
                    {tr(task.label)}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3">
              {(() => {
                const remaining = extraTasksFor(property?.hasSpa).filter(
                  (t) => !tasks.some((task) => task.id === t.id)
                )
                if (remaining.length === 0) return null
                return (
                  <>
                    <p className="mb-1.5 text-sm text-muted-foreground">
                      {t("Add a task if needed:")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {remaining.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => addStandardTask(t.id, t.label)}
                          className="flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-3 py-2 text-sm font-medium text-primary"
                        >
                          <Plus className="size-3.5" /> {tr(t.label)}
                        </button>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">
              {t("Documentation")}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({jobPhotos(job).length}/{MAX_JOB_PHOTOS})
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {jobPhotos(job).map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg border">
                  <img src={url} alt={t("Garden photo")} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={t("Remove")}
                    onClick={() => void removeJobPhoto(currentJob.id, url)}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-elevated"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {jobPhotos(job).length < MAX_JOB_PHOTOS && (
                <PhotoSlot
                  label={t("Add photo")}
                  uploading={uploading}
                  onPick={handlePhotoPick}
                  max={MAX_JOB_PHOTOS - jobPhotos(job).length}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5 rounded-xl border p-4">
              <div>
                <h3 className="mb-2.5 text-base font-semibold">{t("Garden Status")}</h3>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center gap-3 rounded-lg border p-3.5 text-base">
                    <input
                      type="radio"
                      name="waterStatus"
                      className="size-5"
                      checked={report.waterStatus === "ready"}
                      onChange={() =>
                        setReport((r) => ({ ...r, waterStatus: "ready" as WaterStatus }))
                      }
                    />
                    {t("Looking great, all done")}
                  </label>
                  <label className="flex flex-wrap items-center gap-3 rounded-lg border p-3.5 text-base">
                    <input
                      type="radio"
                      name="waterStatus"
                      className="size-5"
                      checked={report.waterStatus === "treated"}
                      onChange={() =>
                        setReport((r) => ({ ...r, waterStatus: "treated" as WaterStatus }))
                      }
                    />
                    <span className="flex items-center gap-1.5">
                      {t("Treated (keep off for")}
                      <Input
                        className="mx-1 h-10 w-16 px-2 text-center text-base"
                        placeholder="__"
                        value={report.waitHours}
                        onFocus={() =>
                          setReport((r) => ({ ...r, waterStatus: "treated" as WaterStatus }))
                        }
                        onChange={(e) =>
                          setReport((r) => ({ ...r, waitHours: e.target.value }))
                        }
                      />
                      {t("hours before using the area)")}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="mb-2.5 text-base font-semibold">{t("Tools & Equipment")}</h3>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center gap-3 rounded-lg border p-3.5 text-base">
                    <input
                      type="radio"
                      name="equipmentStatus"
                      className="size-5"
                      checked={report.equipmentStatus === "running"}
                      onChange={() =>
                        setReport((r) => ({
                          ...r,
                          equipmentStatus: "running" as EquipmentStatus,
                        }))
                      }
                    />
                    {t("Running smoothly")}
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border p-3.5 text-base">
                    <input
                      type="radio"
                      name="equipmentStatus"
                      className="size-5"
                      checked={report.equipmentStatus === "attention"}
                      onChange={() =>
                        setReport((r) => ({
                          ...r,
                          equipmentStatus: "attention" as EquipmentStatus,
                        }))
                      }
                    />
                    {t("Attention needed:")}
                  </label>
                  {report.equipmentStatus === "attention" && (
                    <Input
                      className="ml-4 h-11 text-base"
                      placeholder={t("What needs attention?")}
                      value={report.attentionNotes}
                      onChange={(e) =>
                        setReport((r) => ({ ...r, attentionNotes: e.target.value }))
                      }
                    />
                  )}
                </div>
              </div>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">{t("Comments")}</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder={t("Anything worth noting about this visit...")}
              rows={3}
              className="w-full rounded-xl border border-input bg-transparent p-4 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          {completeError && (
            <p className="text-base text-destructive">{completeError}</p>
          )}

          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={completing}
            onMouseDown={() => {
              skipNextNotesBlurSave.current = true
            }}
            onClick={handleComplete}
          >
            {completing ? t("Completing...") : t("Complete & Send Report")}
          </Button>
        </div>
      )}
    </div>
  )
}
