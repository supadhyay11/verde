import { VerdeMark } from "@/components/VerdeMark"
import type { ReactNode } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { LoginPage } from "@/pages/LoginPage"
import { SignUpPage } from "@/pages/SignUpPage"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { JobsListPage } from "@/pages/JobsListPage"
import { JobDetailPage } from "@/pages/JobDetailPage"
import { AssignJobPage } from "@/pages/AssignJobPage"
import { CustomersPage } from "@/pages/CustomersPage"
import { CustomerProfilePage } from "@/pages/CustomerProfilePage"
import { BillingPage } from "@/pages/BillingPage"
import { MyInvoicesPage } from "@/pages/MyInvoicesPage"
import { TeamPage } from "@/pages/TeamPage"
import { ReferralsPage } from "@/pages/ReferralsPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { ChatListPage } from "@/pages/ChatListPage"
import { ChatThreadPage } from "@/pages/ChatThreadPage"
import { ProfilePage } from "@/pages/ProfilePage"
import { SupportPage } from "@/pages/SupportPage"
import { JobReportPage } from "@/pages/JobReportPage"
import { InvoicePage } from "@/pages/InvoicePage"
import { VerifyEmailScreen } from "@/components/VerifyEmailScreen"
import { isBizAdmin, useAuth } from "@/lib/auth-context"
import { JobsStoreProvider } from "@/lib/jobs-store"

function SplashScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground">
        <VerdeMark className="size-7" />
      </span>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, emailVerified } = useAuth()
  const location = useLocation()
  if (loading) return <SplashScreen />
  // Remember where they were headed (e.g. a "Refer now" link from the
  // website) so signing in lands them there instead of on Jobs.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // Admin accounts aren't scoped to a single business, so they never enter
  // the normal provider/owner app shell - straight to the admin console.
  if (user.role === "admin") return <Navigate to="/admin" replace />
  // Business admins must confirm their email with the 6-digit code before
  // using the app. Technicians (and anyone invited) can go on and just see
  // the banner. Platform-admin preview ("view as") is never blocked.
  if (isBizAdmin(user) && emailVerified === false) {
    return <VerifyEmailScreen required />
  }
  return <JobsStoreProvider>{children}</JobsStoreProvider>
}

// Customers, Billing, and Team are administrative surfaces - a
// technician (a "provider" role account whose businessRole isn't
// "admin") is bounced back to Jobs just like a non-provider is, even if
// they land on the URL directly rather than through the nav.
function RequireBizAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user && !isBizAdmin(user)) return <Navigate to="/jobs" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Public - no login required. Shared via the provider's Email/Text
          "Send Report" buttons on a completed job. */}
      <Route path="/report/:jobId" element={<JobReportPage />} />
      {/* Public - no login required. Shared via the provider's "Send
          Invoice" text/email button on a customer. */}
      <Route path="/invoice/:invoiceId" element={<InvoicePage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/jobs" element={<JobsListPage />} />
        <Route
          path="/jobs/new"
          element={
            <RequireBizAdmin>
              <AssignJobPage />
            </RequireBizAdmin>
          }
        />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route
          path="/customers"
          element={
            <RequireBizAdmin>
              <CustomersPage />
            </RequireBizAdmin>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <RequireBizAdmin>
              <CustomerProfilePage />
            </RequireBizAdmin>
          }
        />
        <Route
          path="/billing"
          element={
            <RequireBizAdmin>
              <BillingPage />
            </RequireBizAdmin>
          }
        />
        <Route
          path="/team"
          element={
            <RequireBizAdmin>
              <TeamPage />
            </RequireBizAdmin>
          }
        />
        <Route
          path="/referrals"
          element={
            <RequireBizAdmin>
              <ReferralsPage />
            </RequireBizAdmin>
          }
        />
        {/* Owner-facing equivalent of /billing above - a customer's own
            invoice history and pay links, scoped to their property (see
            MyInvoicesPage.tsx). Not admin-gated like /billing since every
            signed-in owner should see their own bills; the page itself
            redirects a provider account back to /billing. */}
        <Route path="/my-billing" element={<MyInvoicesPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:propertyId" element={<ChatThreadPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/verify-email" element={<VerifyEmailScreen />} />
        <Route path="/support" element={<SupportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  )
}
