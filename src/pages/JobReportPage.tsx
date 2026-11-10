import { BilingualNote, pickText } from "@/lib/i18n/text"
import { LanguageToggle, useI18n, useT } from "@/lib/i18n"
import { VerdeMark } from "@/components/VerdeMark"
import * as React from "react"
import { useParams } from "react-router-dom"
import { doc, getDoc } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { CheckCircle2, Clock, FileText, Sparkles, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { db, functions } from "@/lib/firebase"
import { inviteLink } from "@/lib/invite"
import type { ServiceJob } from "@/types"

// Public, unauthenticated page: anyone with the link (sent via the
// provider's Email/Text buttons) can view it. It only ever reads the job
// document itself - never the property or business docs, which hold
// things like gate codes - relying on the reportXxx snapshot fields that
// get written onto the job when it's marked completed. Firestore rules
// only allow `get` (never `list`) on completed jobs, so this can't be
// used to browse a business's jobs, only to open one you already have
// the (unguessable) link to.
export function JobReportPage() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const { jobId } = useParams()
  const [job, setJob] = React.useState<ServiceJob | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!jobId) return
    let cancelled = false
    getDoc(doc(db, "jobs", jobId))
      .then((snap) => {
        if (cancelled) return
        if (!snap.exists()) {
          setJob(null)
          return
        }
        const loadedJob = { id: snap.id, ...snap.data() } as ServiceJob
        setJob(loadedJob)
        // Open in the customer's language unless this visitor already chose one.
        try {
          if (!localStorage.getItem("verde-lang") && loadedJob.reportLanguage) {
            setLang(loadedJob.reportLanguage)
          }
        } catch {
          // ignore
        }
        if (loadedJob.status === "completed") {
          // Fire-and-forget: lets the provider see whether/when this
          // report was actually opened (see functions/report-view.js).
          // Never blocks rendering and never surfaces an error to the
          // customer if it fails - viewing the report itself always
          // works regardless of whether this tracking call succeeds.
          httpsCallable(
            functions,
            "markReportViewed"
          )({ jobId }).catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setError("This report link isn't available right now.")
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  if (job === undefined && !error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground">
          <VerdeMark className="size-7" />
        </span>
      </div>
    )
  }

  if (error || !job || job.status !== "completed") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <VerdeMark className="size-8 text-primary" />
        <p className="font-semibold">{t("Report not available")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {error ?? "This link may be expired, or the service hasn't been marked complete yet."}
        </p>
      </div>
    )
  }

  // job.scheduledDate is a plain "YYYY-MM-DD" string. `new Date(str)`
  // parses that as UTC midnight, which in any timezone behind UTC
  // (all of the US) displays as the previous evening - a service done
  // "today" was showing as the day before. Appending a local midnight
  // time makes the browser parse it in local time instead.
  const dateStr = new Date(`${job.scheduledDate}T00:00:00`).toLocaleDateString(lang === "es" ? "es-US" : undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const isReady = job.report?.waterStatus === "ready"

  return (
    <div className="min-h-dvh bg-muted/30 pb-10">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-6">
        <div className="flex justify-end"><LanguageToggle /></div>
        <div className="flex items-center gap-2 px-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <VerdeMark className="size-4" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("Garden Service Report")}
            </p>
            <p className="text-sm font-bold">
              {job.reportBusinessName || "Your Garden Service Provider"}
            </p>
          </div>
        </div>

        {/* Hero: the headline result of the visit, up front and large -
            everything else on the page is supporting detail. */}
        <Card className="gap-3 border-none bg-gradient-to-b from-primary/5 to-transparent p-5 shadow-elevated">
          <div>
            {/* The headline always reads positive - a wait period is a
                normal, expected part of some treatments, not a problem,
                so it's called out as a small note below instead of
                swapping the whole headline to a warning state. */}
            <h1
              className={`flex items-center gap-2 font-display text-xl font-extrabold leading-tight ${
                job.report ? "text-success" : ""
              }`}
            >
              {job.report && (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
                  <CheckCircle2 className="size-4" />
                </span>
              )}
              {job.report ? "All Done & Looking Great" : "Service Complete"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {job.reportCustomerName || "Customer"}
              {job.reportAddress ? ` • ${job.reportAddress}` : ""}
            </p>
            {job.report && !isReady && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                <Clock className="size-3.5" />
                {t("Wait")} {job.report.waitHours || "a few"} {t("hours before using the area.")}
              </p>
            )}
          </div>

          {job.photoUrl ? (
            <img
              src={job.photoUrl}
              alt={t("Garden photo")}
              className="aspect-video w-full rounded-xl object-cover"
            />
          ) : job.beforePhotoUrl || job.afterPhotoUrl ? (
            <div className="grid grid-cols-2 gap-2">
              {job.beforePhotoUrl && (
                <img
                  src={job.beforePhotoUrl}
                  alt={t("Before service")}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )}
              {job.afterPhotoUrl && (
                <img
                  src={job.afterPhotoUrl}
                  alt={t("After service")}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {dateStr}
              {job.completedAt &&
                ` • ${new Date(job.completedAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}`}
            </span>
            {job.reportTechnicianName && (
              <span className="font-medium">{job.reportTechnicianName}</span>
            )}
          </div>
        </Card>

        {job.report && (
          <Card className="gap-4 p-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
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
                          <span className="text-sm font-medium">{task.label}</span>
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
              <h3 className="mb-1.5 text-sm font-semibold">{t("Tools & Equipment")}</h3>
              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                        job.report.equipmentStatus === "running"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      <Wrench className="size-3.5" />
                    </span>
                    <span className="text-sm font-medium">
                      {job.report.equipmentStatus === "running"
                        ? "Mower, tools & equipment"
                        : (job.report.attentionNotes ? pickText(job.report.attentionNotes, job.attentionNotesI18n, lang).shown : "See technician for details")}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                      job.report.equipmentStatus === "running"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {job.report.equipmentStatus === "running" ? "Running Smoothly" : "Needs Attention"}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {job.notes && (
          <Card className="gap-2 p-4">
            <h3 className="text-sm font-semibold">{t("Comments")}</h3>
            <BilingualNote text={job.notes} tr={job.notesI18n} className="text-sm text-muted-foreground" />
          </Card>
        )}

        <Card className="gap-2 p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("Service Type")}</p>
              <p className="font-medium">{job.serviceType}</p>
            </div>
            {job.invoiceRef && (
              <div>
                <p className="text-xs text-muted-foreground">{t("Invoice")}</p>
                <p className="flex items-center gap-1 font-medium">
                  <FileText className="size-3.5" /> {job.invoiceRef}
                </p>
              </div>
            )}
          </div>
        </Card>

        {!job.ownerId && job.reportInviteCode && (
          <Card className="gap-2 border-primary/30 bg-primary/5 p-4 text-center">
            <Sparkles className="mx-auto size-5 text-primary" />
            <h3 className="text-sm font-semibold">{t("Want to see reports like this anytime?")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("Create a free Verde account to view your service history, photos, and upcoming visits from")}{" "}
              {job.reportBusinessName ? job.reportBusinessName : "your provider"} {t("whenever you want.")}
            </p>
            <Button asChild className="mt-1 w-full">
              <a href={inviteLink(job.reportInviteCode, lang)}>{t("Join Verde - it's free")}</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("Your invite code:")} <span className="font-semibold">{job.reportInviteCode}</span>
            </p>
          </Card>
        )}

        <div className="flex flex-col items-center gap-1.5 px-2 pt-1 text-center">
          <p className="text-xs text-muted-foreground">
            {job.reportBusinessName ? `Sent by ${job.reportBusinessName}` : "Thanks for your business!"}
            {job.reportBusinessPhone ? ` · ${job.reportBusinessPhone}` : ""}
          </p>
          <a
            href="https://verde-gardener-app.web.app"
            className="flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <VerdeMark className="size-3" />
            {t("Powered by Verde")}
          </a>
          <p className="text-[11px] text-muted-foreground">
            {t("The easiest way for garden pros to run their business — verde-gardener-app.web.app")}
          </p>
        </div>
      </div>
    </div>
  )
}
