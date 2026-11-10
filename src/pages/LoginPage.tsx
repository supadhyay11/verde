import { LanguageToggle, useT } from "@/lib/i18n"
import { VerdeMark } from "@/components/VerdeMark"
import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function LoginPage() {
  const t = useT()
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
      className="flex min-h-full flex-col bg-[#F3F8F3] text-[#10241A] lg:flex-row"
      style={{ minHeight: "100dvh" }}
    >
      {/* Brand panel: a short header on phones, a full side panel on laptops. */}
      <div className="relative flex shrink-0 flex-col items-center justify-center gap-3.5 overflow-hidden bg-[#14532D] px-6 pt-16 pb-16 text-center lg:w-[44%] lg:max-w-[560px] lg:items-start lg:justify-between lg:p-14 lg:text-left">
        <LanguageToggle dark className="absolute top-4 right-4 z-10" />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="#86D17A" strokeWidth="1.5">
            <circle cx="200" cy="150" r="70" opacity="0.5" />
            <circle cx="200" cy="150" r="115" opacity="0.32" />
            <circle cx="200" cy="150" r="165" opacity="0.2" />
            <circle cx="200" cy="150" r="220" opacity="0.12" />
          </g>
        </svg>
        <a
          href="https://verde-gardener-app.web.app"
          aria-label={t("Go to Verde homepage")}
          className="relative flex flex-col items-center gap-3.5 lg:flex-row lg:gap-3"
        >
          <span className="flex size-[68px] items-center justify-center rounded-[20px] bg-[#86D17A] text-[#14532D] lg:size-11 lg:rounded-[13px]">
            <VerdeMark className="size-11 lg:size-[28px]" />
          </span>
          <span className="font-display text-3xl font-extrabold text-white lg:text-2xl">
            {t("Verde")}
          </span>
        </a>
        <div className="relative hidden flex-col gap-3.5 lg:flex">
          <h2 className="font-display text-[40px] leading-[1.1] font-extrabold text-balance text-white">
            {t("Every garden, every visit, one clear picture.")}
          </h2>
          <p className="max-w-[400px] text-[17px] leading-normal text-[#D6EBD8]">
            {t("Garden pros plan routes and send reports. Customers see what was done and what is next.")}
          </p>
        </div>
      </div>

      {/* Form: a white sheet overlapping the header on phones, centered on laptops. */}
      <div className="relative -mt-7 flex flex-1 items-start justify-center rounded-t-[28px] bg-white px-6 pt-8 pb-10 lg:mt-0 lg:items-center lg:rounded-none lg:bg-[#F3F8F3] lg:p-12">
        <div className="flex w-full max-w-[400px] flex-col gap-5 lg:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[26px] leading-[1.15] font-extrabold lg:text-[32px]">
              {t("Welcome back")}
            </h1>
            <p className="text-[15px] text-[#4B5E50] lg:text-base">
              <span className="lg:hidden">{t("Your gardens, visits and invoices in one place.")}</span>
              <span className="hidden lg:inline">{t("Sign in to manage your services.")}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-id" className="text-sm font-semibold">
                {t("Email or phone number")}
              </label>
              <input
                id="login-id"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="username"
                placeholder={t("you@example.com or (555) 123-4567")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C6D6C9] bg-white px-4 text-base text-[#10241A] placeholder:text-[#6B7F70] focus:border-[#1F7A3D] focus:outline-none focus:ring-[3px] focus:ring-[#9fd8de]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-pw" className="text-sm font-semibold">
                  {t("Password")}
                </label>
                <Link
                  to="/forgot-password"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-[#166534] hover:underline"
                >
                  {t("Forgot password?")}
                </Link>
              </div>
              <div className="relative flex">
                <input
                  id="login-pw"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={t("Your password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C6D6C9] bg-white px-4 text-base text-[#10241A] placeholder:text-[#6B7F70] focus:border-[#1F7A3D] focus:outline-none focus:ring-[3px] focus:ring-[#9fd8de] pr-14"
                />
                <button
                  type="button"
                  aria-label={showPassword ? t("Hide password") : t("Show password")}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-[10px] text-[#4B5E50]"
                >
                  {showPassword ? <EyeOff className="size-[22px]" /> : <Eye className="size-[22px]" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#1F7A3D] text-[17px] font-bold text-white disabled:opacity-60"
            >
              {submitting ? t("Signing in...") : t("Sign in")}
              <ArrowRight className="size-5" />
            </button>
          </form>

          <div className="flex items-center gap-3 text-[13px] text-[#4B5E50] lg:hidden">
            <div className="h-px flex-1 bg-[#DCE7DD]" />
            {t("New to Verde?")}
            <div className="h-px flex-1 bg-[#DCE7DD]" />
          </div>
          <Link
            to="/signup"
            className="flex h-[54px] items-center justify-center rounded-2xl border-[1.5px] border-[#1F7A3D] text-base font-bold text-[#166534] lg:hidden"
          >
            {t("Create an account")}
          </Link>
          <p className="text-center text-[13px] text-[#4B5E50] lg:hidden">
            {t("Got an invite code from your garden service? Tap Create an account.")}
          </p>
          <p className="hidden text-center text-[15px] text-[#4B5E50] lg:block">
            {t("New to Verde?")}{" "}
            <Link to="/signup" className="font-bold text-[#166534] hover:underline">
              {t("Create an account")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
