import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Droplet, ArrowRight, Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function LoginPage() {
  const [identifier, setIdentifier] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const { signInWithIdentifier, error, clearError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      await signInWithIdentifier(identifier, password)
      // Only follow an in-app path (starts with a single "/"), never a full URL.
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && /^\/(?!\/)/.test(from) ? from : "/jobs", { replace: true })
    } catch {
      // error state already set by signInWithIdentifier
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="flex min-h-full flex-col bg-[#F4F8FA] text-[#0F2233] lg:flex-row"
      style={{ minHeight: "100dvh" }}
    >
      {/* Brand panel: a short header on phones, a full side panel on laptops. */}
      <div className="relative flex shrink-0 flex-col items-center justify-center gap-3.5 overflow-hidden bg-[#0B2F4E] px-6 pt-16 pb-16 text-center lg:w-[44%] lg:max-w-[560px] lg:items-start lg:justify-between lg:p-14 lg:text-left">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="#19B5C2" strokeWidth="1.5">
            <circle cx="200" cy="150" r="70" opacity="0.5" />
            <circle cx="200" cy="150" r="115" opacity="0.32" />
            <circle cx="200" cy="150" r="165" opacity="0.2" />
            <circle cx="200" cy="150" r="220" opacity="0.12" />
          </g>
        </svg>
        <a
          href="https://verde-gardener-app.web.app"
          aria-label="Go to Verde homepage"
          className="relative flex flex-col items-center gap-3.5 lg:flex-row lg:gap-3"
        >
          <span className="flex size-[68px] items-center justify-center rounded-[20px] bg-[#19B5C2] text-[#0B2F4E] lg:size-11 lg:rounded-[13px]">
            <Droplet className="size-8 lg:size-[22px]" fill="currentColor" />
          </span>
          <span className="font-display text-3xl font-extrabold text-white lg:text-2xl">
            Verde
          </span>
        </a>
        <div className="relative hidden flex-col gap-3.5 lg:flex">
          <h2 className="font-display text-[40px] leading-[1.1] font-extrabold text-balance text-white">
            Every garden, every visit, one clear picture.
          </h2>
          <p className="max-w-[400px] text-[17px] leading-normal text-[#C9DCE8]">
            Garden pros plan routes and send reports. Customers see what was done and what is next.
          </p>
        </div>
      </div>

      {/* Form: a white sheet overlapping the header on phones, centered on laptops. */}
      <div className="relative -mt-7 flex flex-1 items-start justify-center rounded-t-[28px] bg-white px-6 pt-8 pb-10 lg:mt-0 lg:items-center lg:rounded-none lg:bg-[#F4F8FA] lg:p-12">
        <div className="flex w-full max-w-[400px] flex-col gap-5 lg:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[26px] leading-[1.15] font-extrabold lg:text-[32px]">
              Welcome back
            </h1>
            <p className="text-[15px] text-[#4A5B6B] lg:text-base">
              <span className="lg:hidden">Your gardens, visits and invoices in one place.</span>
              <span className="hidden lg:inline">Sign in to manage your services.</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-id" className="text-sm font-semibold">
                Email or phone number
              </label>
              <input
                id="login-id"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="username"
                placeholder="you@example.com or (555) 123-4567"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C5D2DC] bg-white px-4 text-base text-[#0F2233] placeholder:text-[#6B7C8C] focus:border-[#0E7C86] focus:outline-none focus:ring-[3px] focus:ring-[#9fd8de]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-pw" className="text-sm font-semibold">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0B5F69] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative flex">
                <input
                  id="login-pw"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C5D2DC] bg-white px-4 text-base text-[#0F2233] placeholder:text-[#6B7C8C] focus:border-[#0E7C86] focus:outline-none focus:ring-[3px] focus:ring-[#9fd8de] pr-14"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-[10px] text-[#4A5B6B]"
                >
                  {showPassword ? <EyeOff className="size-[22px]" /> : <Eye className="size-[22px]" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#0E7C86] text-[17px] font-bold text-white disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
              <ArrowRight className="size-5" />
            </button>
          </form>

          <div className="flex items-center gap-3 text-[13px] text-[#4A5B6B] lg:hidden">
            <div className="h-px flex-1 bg-[#D9E2EA]" />
            New to Verde?
            <div className="h-px flex-1 bg-[#D9E2EA]" />
          </div>
          <Link
            to="/signup"
            className="flex h-[54px] items-center justify-center rounded-2xl border-[1.5px] border-[#0E7C86] text-base font-bold text-[#0B5F69] lg:hidden"
          >
            Create an account
          </Link>
          <p className="text-center text-[13px] text-[#4A5B6B] lg:hidden">
            Got an invite code from your garden service? Tap Create an account.
          </p>
          <p className="hidden text-center text-[15px] text-[#4A5B6B] lg:block">
            New to Verde?{" "}
            <Link to="/signup" className="font-bold text-[#0B5F69] hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
