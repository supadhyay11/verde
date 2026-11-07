import * as React from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  Briefcase,
  DollarSign,
  Droplet,
  LayoutGrid,
  Mail,
  MessageCircle,
  ShieldAlert,
  User,
  Users,
} from "lucide-react"
import { AddToHomeScreenBanner } from "@/components/AddToHomeScreenBanner"
import { cn } from "@/lib/utils"
import { isBizAdmin, useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import { listenForForegroundPush } from "@/lib/push-notifications"
import { isImpersonatingSession } from "@/pages/ImpersonatePage"

// Anything at this width or wider is treated as "a laptop/desktop browser
// window", not a phone or tablet held in one hand - 1024px is the
// conventional breakpoint for that (Tailwind's own `lg:`). Below it,
// nothing changes from the existing phone-app experience; at/above it,
// AppShell swaps the bottom tab bar for a sidebar and lets the page use
// the room a real monitor has, instead of staying pinned to a
// phone-width column in the middle of the screen.
const DESKTOP_QUERY = "(min-width: 1024px)"

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  )
  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    setIsDesktop(mql.matches)
    mql.addEventListener("change", handleChange)
    return () => mql.removeEventListener("change", handleChange)
  }, [])
  return isDesktop
}

function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === "string") {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  return 0
}

const BASE_NAV_ITEMS = [
  { to: "/dashboard", label: "Home", icon: LayoutGrid },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
]

const PROVIDER_NAV_ITEMS = [
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/billing", label: "Billing", icon: DollarSign },
]

// A customer's own view of what they owe/have paid - see
// MyInvoicesPage.tsx. Only shown for the "owner" role; a technician gets
// the same 4 base+tail tabs as before (no billing of any kind).
const OWNER_NAV_ITEMS = [{ to: "/my-billing", label: "Billing", icon: DollarSign }]

const TAIL_NAV_ITEMS = [
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
]

// Soft reminder for anyone who hasn't verified their email yet - mainly
// technicians, since business admins are stopped at the full-screen code
// screen (see RequireAuth in App.tsx) until they verify. Opens the same
// 6-digit-code screen. Hidden during platform-admin "view as" so previewing
// an account never emails that person.
function VerifyEmailBanner() {
  const { user, emailVerified } = useAuth()

  // `emailVerified === undefined` just means Firebase Auth hasn't reported a
  // value back yet, not that it's actually unverified.
  if (user?.role !== "provider" || emailVerified !== false || isImpersonatingSession()) return null
  // Technicians added with only a phone number sign in through a made-up
  // "@technicians.verde.internal" address (functions/team.js). Nothing can
  // be delivered there, so don't ask them to verify it.
  if (user.email?.toLowerCase().endsWith(".internal")) return null

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warning px-3 py-1.5 text-center text-xs font-semibold text-warning-foreground">
      <span className="flex items-center gap-1.5">
        <Mail className="size-3.5" /> Please verify your email address ({user.email})
      </span>
      <NavLink to="/verify-email" className="underline underline-offset-2">
        Enter code
      </NavLink>
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { messages } = useJobsStore()
  const isDesktop = useIsDesktop()
  // Customers/Billing are administrative tabs - a technician (a
  // "provider" role account that isn't a business admin) gets the same
  // 4 tabs as an owner, not the full 5.
  const showAdminTabs = isBizAdmin(user)
  const navItems = showAdminTabs
    ? [...BASE_NAV_ITEMS, ...PROVIDER_NAV_ITEMS, ...TAIL_NAV_ITEMS]
    : user?.role === "owner"
      ? [...BASE_NAV_ITEMS, ...OWNER_NAV_ITEMS, ...TAIL_NAV_ITEMS]
      : [...BASE_NAV_ITEMS, ...TAIL_NAV_ITEMS]

  // Only shows a notification for messages that arrive while the app is
  // already open in a background/hidden tab - a foreground, visible tab
  // already reflects new messages live via Firestore listeners, and the
  // service worker's own background handler covers the app being fully
  // closed. Safe to call unconditionally; it's a no-op if permission was
  // never granted (see getPushSupport in push-notifications.ts).
  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined
    listenForForegroundPush().then((fn) => {
      unsubscribe = fn
    })
    return () => unsubscribe?.()
  }, [])

  const lastReadAt = user?.lastReadAt ?? {}
  const unreadTotal = messages.filter((m) => {
    if (m.senderId === user?.id) return false
    const readSince = lastReadAt[m.propertyId]
    const readMillis = readSince ? toMillis(readSince) : 0
    return toMillis(m.createdAt) > readMillis
  }).length

  const impersonationBanner = isImpersonatingSession() && (
    <div className="flex shrink-0 items-center justify-center gap-1.5 bg-warning px-3 py-1.5 text-center text-xs font-semibold text-warning-foreground">
      <ShieldAlert className="size-3.5" /> Viewing as {user?.name ?? "provider"} (admin preview) -
      close this tab to exit
    </div>
  )

  // Desktop/laptop browser window: a left sidebar nav that stays put
  // while the page scrolls, and the page itself gets real width to work
  // with instead of being squeezed into a phone-width column. Same
  // routes, same pages, same <Outlet/> as the mobile shell below - only
  // the surrounding chrome changes.
  if (isDesktop) {
    return (
      <div className="flex h-dvh w-full bg-muted/40">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className="bg-brand-gradient shadow-elevated flex size-8 items-center justify-center rounded-full text-white">
              <Droplet className="size-4.5" fill="currentColor" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
              Verde
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex items-center justify-center">
                      <Icon className="size-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                      {to === "/chat" && unreadTotal > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                          {unreadTotal > 9 ? "9+" : unreadTotal}
                        </span>
                      )}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {impersonationBanner}
          <VerifyEmailBanner />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-10 py-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-background sm:my-4 sm:h-[850px] sm:rounded-[2.5rem] sm:border-8 sm:border-neutral-900 sm:shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] overflow-hidden">
      {impersonationBanner}
      <VerifyEmailBanner />
      <AddToHomeScreenBanner />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>
      <nav
        className={cn(
          "shadow-elevated-lg grid shrink-0 border-t border-border/70 bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md",
          navItems.length === 6
            ? "grid-cols-6"
            : navItems.length === 5
              ? "grid-cols-5"
              : "grid-cols-4"
        )}
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 font-medium transition-colors",
                navItems.length === 6 ? "text-[9.5px]" : "text-[11px]",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "relative flex items-center justify-center rounded-full transition-all",
                    navItems.length === 6 ? "size-8" : "size-9",
                    isActive && "bg-primary/10 scale-105"
                  )}
                >
                  <Icon
                    className={navItems.length === 6 ? "size-4" : "size-5"}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  {to === "/chat" && unreadTotal > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                      {unreadTotal > 9 ? "9+" : unreadTotal}
                    </span>
                  )}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
