import { Link } from "react-router-dom"
import {
  CheckCircle2,
  Clock,
  Plus,
  UserPlus,
  DollarSign,
  AlertTriangle,
  Users,
  CalendarCheck,
} from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import { localDateIso, localTodayIso } from "@/lib/date"
import type { JobStatus, ServiceJob } from "@/types"

const MS_PER_DAY = 86_400_000
const OVERDUE_INVOICE_AFTER_DAYS = 14

function money(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY)
}

/** Monday of the week containing the given ISO date - jobs this week are
 * grouped Mon-Sun to match how most providers think about a work week,
 * rather than a rolling 7 days. */
function startOfWeekIso(todayIso: string) {
  const d = new Date(`${todayIso}T00:00:00`)
  const day = d.getDay() // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diffToMonday)
  return localDateIso(d)
}
function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localDateIso(d)
}

// Vivid, fixed colors (not the app's muted success/warning/primary
// tokens) - picked deliberately so Job Status reads at a glance, per
// request. Validated as a categorical set (CVD-safe pairwise, lightness
// band, contrast) with the dataviz skill's palette validator.
const DONUT_CONFIG: { status: JobStatus; label: string; color: string }[] = [
  { status: "completed", label: "Completed", color: "#16A34A" },
  { status: "in-progress", label: "In Progress", color: "#F59E0B" },
  { status: "scheduled", label: "Scheduled", color: "#2563EB" },
  { status: "pending", label: "Pending", color: "#DC2626" },
]

function JobStatusDonut({ jobs }: { jobs: ServiceJob[] }) {
  const total = jobs.length
  const counts: Record<JobStatus, number> = {
    completed: 0,
    "in-progress": 0,
    scheduled: 0,
    pending: 0,
  }
  for (const j of jobs) counts[j.status]++

  // r = 15.9 on a 36x36 viewBox gives a circumference of ~99.9, so each
  // segment's percent-of-total maps directly onto dasharray/dashoffset
  // units without a separate circumference conversion.
  let cumulative = 0
  const arcs = total === 0 ? [] : DONUT_CONFIG.map(({ status, color }) => {
    const pct = (counts[status] / total) * 100
    const arc = { color, pct, offset: -cumulative }
    cumulative += pct
    return arc
  }).filter((a) => a.pct > 0)

  return (
    <div className="flex items-center gap-5">
      <svg width="104" height="104" viewBox="0 0 36 36" className="shrink-0">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F1F5F9" strokeWidth="4" />
        {arcs.map((a) => (
          <circle
            key={a.color}
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={a.color}
            strokeWidth="4"
            strokeDasharray={`${a.pct} ${100 - a.pct}`}
            strokeDashoffset={a.offset}
            strokeLinecap="round"
          />
        ))}
        <text x="18" y="17" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0F172A">
          {counts.completed}
        </text>
        <text x="18" y="23.5" textAnchor="middle" fontSize="3.3" fill="#64748B">
          done
        </text>
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        {DONUT_CONFIG.map(({ status, label, color }) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span className="size-2.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
            <span className="font-bold">{counts[status]}</span>
          </div>
        ))}
        {total === 0 && <p className="text-xs text-muted-foreground">No jobs scheduled this week.</p>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const { jobs, properties, invoices } = useJobsStore()

  const isProvider = user?.role === "provider"
  const firstName = user?.name.split(" ")[0]

  const activeJobs = jobs.filter((j) => j.status !== "completed")
  const completedCount = jobs.filter((j) => j.status === "completed").length

  // "Today's Jobs" on the provider dashboard should mean today, not
  // every not-yet-completed job ever scheduled (that's what activeJobs
  // above counts, and it's what the Jobs list's own tabs use for
  // Today/Upcoming) - so this is deliberately its own same-day-only
  // slice.
  const todayIso = localTodayIso()
  const todaysJobs = jobs.filter((j) => j.scheduledDate === todayIso)
  const todaysScheduledCount = todaysJobs.filter((j) => j.status !== "completed").length
  // Completed today has to be judged by when a job was actually finished
  // (completedAt), not by its original scheduledDate - the same
  // convention the Jobs page's Completed tab groups by (see
  // completedSections in JobsListPage.tsx). A job that was overdue from
  // an earlier day and got completed today counts here even though its
  // scheduledDate isn't today; without this, this count and the
  // Completed tab's "Today" section would disagree.
  const todaysCompletedCount = jobs.filter((j) => {
    if (j.status !== "completed") return false
    const completedDateIso = j.completedAt ? localDateIso(new Date(j.completedAt)) : j.scheduledDate
    return completedDateIso === todayIso
  }).length

  if (!isProvider) {
    const upcoming = activeJobs.sort((a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate)
    )[0]

    return (
      <div className="flex min-h-full flex-col bg-background">
        <TopBar
          initials={user?.name
            .split(" ")
            .map((n) => n[0])
            .join("")}
        />
        <div className="px-4 py-5">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Good Morning, {firstName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here&apos;s the status of your garden.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4">
          <Card className="items-center gap-1.5 p-4 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Clock className="size-4.5 text-primary" />
            </span>
            <p className="font-display text-2xl font-bold">{activeJobs.length}</p>
            <p className="text-xs text-muted-foreground">Upcoming Visits</p>
          </Card>
          <Card className="items-center gap-1.5 p-4 text-center">
            <span className="bg-success/10 flex size-9 items-center justify-center rounded-full">
              <CheckCircle2 className="size-4.5 text-success" />
            </span>
            <p className="font-display text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </Card>
        </div>

        {upcoming && (
          <div className="px-4 pt-5">
            <Card className="bg-brand-gradient shadow-elevated-lg relative gap-1 overflow-hidden border-0 p-4 text-primary-foreground">
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 90% 0%, rgba(255,255,255,0.35), transparent 55%)",
                }}
              />
              <p className="relative text-sm font-medium opacity-90">Next Visit</p>
              <p className="font-display relative text-lg font-bold">
                {new Date(`${upcoming.scheduledDate}T00:00:00`).toDateString()}
              </p>
              <p className="relative flex items-center gap-1.5 text-sm opacity-90">
                <Clock className="size-3.5" /> {upcoming.serviceType}
              </p>
            </Card>
          </div>
        )}

        <div className="px-4 py-5">
          <Button asChild className="w-full" size="lg">
            <Link to="/jobs">View Service History</Link>
          </Button>
        </div>
      </div>
    )
  }

  // --- Provider view below - the part this redesign actually touches ---

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const weekStart = startOfWeekIso(todayIso)
  const weekEnd = addDaysIso(weekStart, 6)

  // Revenue this month: sum of invoices created in the current calendar
  // month, regardless of paid/unpaid status - "invoiced" not "collected".
  // Invoice has no due date field, only createdAt, so this is the only
  // date it can be grouped by.
  const thisMonthInvoices = invoices.filter((inv) => inv.createdAt.startsWith(monthStart))
  const revenueThisMonth = thisMonthInvoices.reduce((sum, inv) => sum + inv.amount, 0)

  const unpaidInvoices = invoices.filter((inv) => inv.status === "unpaid")
  const outstandingTotal = unpaidInvoices.reduce((sum, inv) => sum + inv.amount, 0)
  const overdueInvoices = unpaidInvoices.filter(
    (inv) => daysSince(inv.createdAt) > OVERDUE_INVOICE_AFTER_DAYS
  )

  // New customers this month: only properties created since the
  // createdAt field was added will have one, so this quietly reads 0 for
  // everyone until new customers start coming in through the real flow -
  // it never guesses a signup date for an existing customer.
  const newCustomersThisMonth = properties.filter(
    (p) => p.createdAt && p.createdAt.startsWith(monthStart)
  ).length

  const thisWeekJobs = jobs.filter((j) => j.scheduledDate >= weekStart && j.scheduledDate <= weekEnd)
  const thisWeekCompleted = thisWeekJobs.filter((j) => j.status === "completed").length

  const billingList = unpaidInvoices
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 5)

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar
        initials={user?.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      />
      <div className="flex flex-col gap-5 px-4 py-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Good Morning, {firstName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here is the status of your customers today.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:max-w-lg">
          <Button asChild size="lg">
            <Link to="/jobs/new">
              <Plus className="size-4" /> Schedule
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/customers">
              <UserPlus className="size-4" /> Add Customer
            </Link>
          </Button>
        </div>

        <Link to="/jobs">
          <Card className="bg-brand-gradient shadow-elevated-lg hover:shadow-elevated-lg relative gap-1 overflow-hidden border-0 p-4 text-primary-foreground transition-shadow">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 90% 0%, rgba(255,255,255,0.35), transparent 55%)",
              }}
            />
            <p className="relative text-sm font-medium opacity-90">Today&apos;s Jobs</p>
            {/* Deliberately the sum of the two numbers on the line below,
                not a separate scheduledDate-based count - those two are
                what the badge is trying to summarize, and a job completed
                today after being overdue from an earlier day (so it's not
                in "today's" scheduledDate) still needs to show up here or
                this number reads as less than its own breakdown. */}
            <p className="font-display relative text-4xl font-bold">
              {todaysCompletedCount + todaysScheduledCount}
            </p>
            <p className="relative flex items-center gap-1.5 text-sm opacity-90">
              <Clock className="size-3.5" /> {todaysCompletedCount} Completed &middot;{" "}
              {todaysScheduledCount} Scheduled
            </p>
          </Card>
        </Link>

        {/* KPI row: Revenue, Active Customers, Jobs This Week, Outstanding -
            colored icon badges (not the app's muted tokens) per request,
            so each tile reads at a glance instead of blending together. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link to="/my-billing">
            <Card className="gap-1 p-4 transition-shadow hover:shadow-md">
              <span className="mb-1 flex size-8 items-center justify-center rounded-lg bg-green-100">
                <DollarSign className="size-4 text-green-600" />
              </span>
              <p className="text-xs font-semibold text-muted-foreground">Revenue (MTD)</p>
              <p className="font-display text-2xl font-bold">{money(revenueThisMonth)}</p>
              <p className="text-xs text-muted-foreground">
                {thisMonthInvoices.length} invoice{thisMonthInvoices.length === 1 ? "" : "s"}
              </p>
            </Card>
          </Link>
          <Link to="/customers">
            <Card className="gap-1 p-4 transition-shadow hover:shadow-md">
              <span className="mb-1 flex size-8 items-center justify-center rounded-lg bg-blue-100">
                <Users className="size-4 text-blue-600" />
              </span>
              <p className="text-xs font-semibold text-muted-foreground">Active Customers</p>
              <p className="font-display text-2xl font-bold">{properties.length}</p>
              <p className="text-xs font-semibold text-green-600">
                +{newCustomersThisMonth} new this month
              </p>
            </Card>
          </Link>
          <Link to="/jobs">
            <Card className="gap-1 p-4 transition-shadow hover:shadow-md">
              <span className="mb-1 flex size-8 items-center justify-center rounded-lg bg-amber-100">
                <CalendarCheck className="size-4 text-amber-600" />
              </span>
              <p className="text-xs font-semibold text-muted-foreground">Jobs This Week</p>
              <p className="font-display text-2xl font-bold">
                {thisWeekCompleted}
                <span className="text-sm font-medium text-muted-foreground"> / {thisWeekJobs.length}</span>
              </p>
              <p className="text-xs text-muted-foreground">completed so far</p>
            </Card>
          </Link>
          <Link to="/my-billing">
            <Card className="gap-1 p-4 transition-shadow hover:shadow-md">
              <span className="mb-1 flex size-8 items-center justify-center rounded-lg bg-red-100">
                <AlertTriangle className="size-4 text-red-600" />
              </span>
              <p className="text-xs font-semibold text-muted-foreground">Outstanding</p>
              <p className="font-display text-2xl font-bold">{money(outstandingTotal)}</p>
              <p className={"text-xs font-semibold " + (overdueInvoices.length > 0 ? "text-red-600" : "text-muted-foreground")}>
                {unpaidInvoices.length} unpaid{overdueInvoices.length > 0 ? `, ${overdueInvoices.length} overdue` : ""}
              </p>
            </Card>
          </Link>
        </div>

        {/* Job status donut - this week's jobs by real status, vivid colors */}
        <Link to="/jobs">
          <Card className="gap-3 p-4 transition-shadow hover:shadow-md">
            <div>
              <p className="font-display font-semibold">Job Status</p>
              <p className="text-xs text-muted-foreground">
                This week &middot; {thisWeekJobs.length} scheduled
              </p>
            </div>
            <JobStatusDonut jobs={thisWeekJobs} />
          </Card>
        </Link>

        {/* Billing - the panel header goes to the full invoice list,
            each row goes to that specific invoice. */}
        {billingList.length > 0 && (
          <Card className="gap-3 p-4">
            <Link to="/my-billing">
              <p className="font-display font-semibold">Billing</p>
              <p className="text-xs text-muted-foreground">
                {money(outstandingTotal)} outstanding &middot; {unpaidInvoices.length} invoice
                {unpaidInvoices.length === 1 ? "" : "s"}
              </p>
            </Link>
            <div className="flex flex-col">
              {billingList.map((invoice) => {
                const age = daysSince(invoice.createdAt)
                const overdue = age > OVERDUE_INVOICE_AFTER_DAYS
                return (
                  <Link
                    key={invoice.id}
                    to={`/customers/${invoice.propertyId}`}
                    className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {invoice.snapCustomerName || "Customer"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.invoiceNumber != null ? `Invoice #${invoice.invoiceNumber} · ` : ""}
                        {money(invoice.amount)}
                      </p>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                        (overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")
                      }
                    >
                      {age <= 0 ? "Sent today" : `${age}d unpaid`}
                    </span>
                  </Link>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
