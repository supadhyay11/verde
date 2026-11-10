import { useT } from "@/lib/i18n"
import * as React from "react"
import { useNavigate } from "react-router-dom"
import { httpsCallable } from "firebase/functions"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Route as RouteIcon,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RouteMap, type RouteStop } from "@/components/RouteMap"
import { useAuth } from "@/lib/auth-context"
import { functions } from "@/lib/firebase"
import { useJobsStore } from "@/lib/jobs-store"
import { localDateIso, localTodayIso } from "@/lib/date"
import { mapsLink } from "@/lib/maps"
import {
  approxDriveMiles,
  approxRouteMiles,
  compareByRoute,
  formatMiles,
  googleDirectionsUrl,
  optimizeOrder,
  type LatLng,
} from "@/lib/route"
import type { Property, ServiceJob } from "@/types"

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDateIso(d)
}

function dayLabel(iso: string, todayIso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const text = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  if (iso === todayIso) return `Today · ${text}`
  if (iso === shiftDay(todayIso, 1)) return `Tomorrow · ${text}`
  return text
}

type Located = Property & { lat: number; lng: number }

function hasPoint(p: Property | undefined): p is Located {
  return !!p && typeof p.lat === "number" && typeof p.lng === "number"
}

/** Addresses that still need to be turned into map points: never looked up, or
 * the address was edited since the last lookup. */
function needsLookup(p: Property | undefined): boolean {
  if (!p || !p.address?.trim()) return false
  if (p.geocodeStatus && p.geocodedFor === p.address.trim()) return false
  return !(hasPoint(p) && p.geocodedFor === p.address.trim())
}

interface Row {
  job: ServiceJob
  property: Property | undefined
}

const pointOf = (r: Row): LatLng => ({ lat: (r.property as Located).lat, lng: (r.property as Located).lng })

/** Provider-side "Map" view of the Jobs screen: one day's stops in visit order,
 * as pins on a map plus a list with approximate distances between stops - and
 * an "Optimize route" button that proposes a shorter order. */
interface RoutePanelProps {
  /** Technician filter shared with the List view ("all" or a user id). */
  techId: string
  onTechIdChange: (id: string) => void
  /** Only admins can look at another technician's route. */
  canChangeTech: boolean
}

export function RoutePanel({ techId, onTechIdChange, canChangeTech }: RoutePanelProps) {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { jobs, businessUsers, business, getProperty, updateJob } = useJobsStore()
  const todayIso = localTodayIso()
  const [dateIso, setDateIso] = React.useState(todayIso)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [locating, setLocating] = React.useState(false)
  // A proposed order (job ids, located stops only) that hasn't been saved yet.
  const [preview, setPreview] = React.useState<string[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const askedRef = React.useRef<Set<string>>(new Set())

  // Changing the day or technician drops any unsaved proposal.
  React.useEffect(() => {
    setPreview(null)
    setNotice(null)
  }, [dateIso, techId])

  const technicians = React.useMemo(
    () => businessUsers.filter((u) => u.role === "provider"),
    [businessUsers]
  )

  const dayJobs = React.useMemo(() => {
    return jobs
      .filter((j: ServiceJob) => j.scheduledDate === dateIso)
      .filter((j) => techId === "all" || j.technicianId === techId)
      .slice()
      .sort(compareByRoute)
  }, [jobs, dateIso, techId])

  const rows: Row[] = dayJobs.map((job) => ({ job, property: getProperty(job.propertyId) }))

  // Look up addresses that don't have a map point yet (once per address per visit).
  const missing = rows
    .filter((r) => needsLookup(r.property) && !askedRef.current.has(r.property!.id))
    .map((r) => r.property!.id)
  const missingKey = missing.join(",")
  React.useEffect(() => {
    if (!missingKey) return
    const ids = missingKey.split(",")
    ids.forEach((id) => askedRef.current.add(id))
    setLocating(true)
    httpsCallable(functions, "geocodeProperties")({ propertyIds: ids })
      .catch(() => {
        /* the map just shows what it has */
      })
      .finally(() => setLocating(false))
  }, [missingKey])

  // The day starts at the business address (looked up once, saved on the business).
  const bizAddress = business?.address?.trim() ?? ""
  const bizAsked = React.useRef(false)
  const bizNeedsLookup =
    !!bizAddress &&
    !(typeof business?.lat === "number" && typeof business?.lng === "number" && business.geocodedFor === bizAddress) &&
    !(business?.geocodeStatus && business.geocodedFor === bizAddress)
  React.useEffect(() => {
    if (!bizNeedsLookup || bizAsked.current) return
    bizAsked.current = true
    httpsCallable(functions, "geocodeBusiness")({}).catch(() => {
      /* no start point: routes just begin at the first stop */
    })
  }, [bizNeedsLookup])
  const origin: LatLng | undefined =
    typeof business?.lat === "number" &&
    typeof business?.lng === "number" &&
    business.geocodedFor === bizAddress
      ? { lat: business.lat, lng: business.lng }
      : undefined

  const located = rows.filter((r) => hasPoint(r.property))
  const unlocated = rows.filter((r) => !hasPoint(r.property))

  // What's shown: the saved order, or the proposed one while previewing.
  const shown: Row[] = preview
    ? preview.map((id) => located.find((r) => r.job.id === id)).filter((r): r is Row => !!r)
    : located

  const stops: RouteStop[] = shown.map((r, i) => ({
    id: r.job.id,
    num: i + 1,
    ...pointOf(r),
    completed: r.job.status === "completed",
  }))
  const currentPoints = React.useMemo(() => located.map(pointOf), [located])
  const ghostPath = React.useMemo(
    () => (preview ? (origin ? [origin, ...currentPoints] : currentPoints) : undefined),
    [preview, currentPoints, origin]
  )

  const withOrigin = (pts: LatLng[]) => (origin ? [origin, ...pts] : pts)
  const miles = approxRouteMiles(withOrigin(shown.map(pointOf)))
  const currentMiles = approxRouteMiles(withOrigin(currentPoints))
  const savedMiles = currentMiles - miles
  const directionsUrl = googleDirectionsUrl([
    ...(origin ? [{ address: bizAddress, ...origin }] : []),
    ...shown.map((r) => ({ address: r.property!.address, ...pointOf(r) })),
  ])

  const todo = located.filter((r) => r.job.status !== "completed")
  const technicianGroups = new Set(located.map((r) => r.job.technicianId ?? ""))
  const canOptimize = todo.length >= 2 && technicianGroups.size <= 1
  const needsTechPick = todo.length >= 2 && technicianGroups.size > 1
  const hasSavedOrder = rows.some((r) => typeof r.job.routeOrder === "number")

  function propose() {
    setNotice(null)
    // Visits already finished stay where they are; the rest are re-ordered,
    // starting from wherever the last finished visit was - or, before any visit
    // is done, from the business address.
    const done = located.filter((r) => r.job.status === "completed")
    const start = done.length ? pointOf(done[done.length - 1]) : origin
    const pts = [...(start ? [start] : []), ...todo.map(pointOf)]
    const order = optimizeOrder(pts, !!start)
    const idx = start ? order.slice(1).map((i) => i - 1) : order
    setPreview([...done, ...idx.map((i) => todo[i])].map((r) => r.job.id))
    setSelectedId(null)
  }

  async function applyOrder() {
    if (!preview) return
    setSaving(true)
    setNotice(null)
    try {
      const order = [...preview, ...unlocated.map((r) => r.job.id)]
      await Promise.all(order.map((id, i) => updateJob(id, { routeOrder: i })))
      setPreview(null)
      setNotice({ kind: "ok", text: "Saved. This order now shows on the List too." })
    } catch {
      setNotice({ kind: "error", text: "Couldn't save the new order. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  async function resetOrder() {
    setSaving(true)
    setNotice(null)
    try {
      await Promise.all(
        rows
          .filter((r) => typeof r.job.routeOrder === "number")
          .map((r) => updateJob(r.job.id, { routeOrder: null }))
      )
      setPreview(null)
      setNotice({ kind: "ok", text: "Back to scheduled-time order." })
    } catch {
      setNotice({ kind: "error", text: "Couldn't reset the order. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  const savedPct = currentMiles > 0 ? (savedMiles / currentMiles) * 100 : 0
  const alreadyShort = preview !== null && savedMiles < 0.3

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("Previous day")}
            onClick={() => setDateIso((d) => shiftDay(d, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-semibold">
            {dayLabel(dateIso, todayIso)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("Next day")}
            onClick={() => setDateIso((d) => shiftDay(d, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {dateIso !== todayIso && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDateIso(todayIso)}>
              {t("Today")}
            </Button>
          )}
        </div>
        {canChangeTech && technicians.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Technician")}</span>
            <select
              value={techId}
              onChange={(e) => onTechIdChange(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">{t("Everyone")}</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === user?.id ? `${t.name} (you)` : t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {preview ? (
            <div className="rounded-xl border border-primary bg-primary/5 p-3">
              <p className="text-xs font-bold tracking-wide text-primary uppercase">
                {t("Proposed order")}
              </p>
              {alreadyShort ? (
                <p className="mt-1 text-sm">
                  {t("Your route is already about as short as it gets (~")}{formatMiles(miles)} {t("mi).")}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-semibold">
                    ~{formatMiles(miles)} {t("mi driving, down from ~")}{formatMiles(currentMiles)} {t("mi")}
                  </p>
                  <p className="text-sm text-green-700">
                    {t("Saves about")} {formatMiles(savedMiles)} {t("mi (")}{Math.round(savedPct)}{t("% shorter)")}
                  </p>
                </>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t("The dotted line on the map is today's order. Scheduled times aren't changed.")}
              </p>
              <div className="mt-3 flex gap-2">
                {!alreadyShort && (
                  <Button type="button" size="sm" onClick={applyOrder} disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {t("Apply this order")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPreview(null)}
                  disabled={saving}
                >
                  {alreadyShort ? "Close" : "Keep current"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {canOptimize && (
                <Button type="button" size="sm" onClick={propose} disabled={saving || locating}>
                  <RouteIcon className="size-4" /> {t("Optimize route")}
                </Button>
              )}
              {hasSavedOrder && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetOrder}
                  disabled={saving}
                >
                  <RotateCcw className="size-4" /> {t("Back to time order")}
                </Button>
              )}
              {needsTechPick && (
                <p className="text-xs text-muted-foreground">
                  {t("This day has several technicians. Pick one above to optimize their route.")}
                </p>
              )}
            </div>
          )}
          {notice && (
            <p
              role="status"
              className={
                "text-xs font-medium " + (notice.kind === "ok" ? "text-green-700" : "text-destructive")
              }
            >
              {notice.text}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {rows.length} {rows.length === 1 ? "stop" : "stops"}
                {stops.length > 1 && <> · ~{formatMiles(miles)} {t("mi driving")}</>}
              </p>
              <p className="text-xs text-muted-foreground">
                {locating ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> {t("Finding addresses on the map…")}
                  </span>
                ) : hasSavedOrder || preview ? (
                  "In route order. Tap a stop to open the job."
                ) : (
                  "In scheduled-time order. Tap a stop to open the job."
                )}
              </p>
            </div>
            {directionsUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={directionsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> {t("Open in Maps")}
                </a>
              </Button>
            )}
          </div>

          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("Nothing scheduled for this day.")}
            </p>
          )}

          <ol className="flex flex-col gap-2">
            {shown.map((r, i) => {
              const prev = i > 0 ? shown[i - 1] : null
              const leg = prev ? approxDriveMiles(pointOf(prev), pointOf(r)) : null
              const selected = selectedId === r.job.id
              const done = r.job.status === "completed"
              return (
                <li key={r.job.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/jobs/${r.job.id}`)}
                    className={
                      "flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors " +
                      (selected ? "border-primary ring-2 ring-primary/20" : "hover:bg-accent/40")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white " +
                        (done ? "bg-green-700" : "bg-primary")
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {r.property!.customerName}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-primary">
                          {r.job.scheduledTime}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {r.property!.address}
                      </span>
                      <span className="mt-1 flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {leg == null
                            ? origin
                              ? `~${formatMiles(approxDriveMiles(origin, pointOf(r)))} mi from your business address`
                              : "First stop"
                            : `~${formatMiles(leg)} mi from previous`}
                        </span>
                        {done && <span className="font-medium text-green-700">{t("Done")}</span>}
                        <a
                          href={mapsLink(r.property!.address)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          <MapPin className="size-3" /> {t("Directions")}
                        </a>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
            {unlocated.map((r) => (
              <li
                key={r.job.id}
                className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground"
              >
                <span className="font-semibold text-foreground">
                  {r.property?.customerName ?? "Customer"}
                </span>{" "}
                · {r.job.scheduledTime}
                <span className="block">
                  {locating && needsLookup(r.property)
                    ? "Finding this address…"
                    : "Couldn't place this address on the map. Check it on the customer's profile."}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="order-1 lg:sticky lg:top-4 lg:order-2">
          <RouteMap
            origin={origin}
            stops={stops}
            selectedId={selectedId}
            ghostPath={ghostPath}
            onSelect={(id) => navigate(`/jobs/${id}`)}
            className="h-72 lg:h-[560px]"
          />
        </div>
      </div>
    </div>
  )
}
