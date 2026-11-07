import * as React from "react"
import { Link } from "react-router-dom"
import { Droplet, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const { resetPassword, error, clearError } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch {
      // error state already set by resetPassword
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-brand-gradient relative flex min-h-full flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 15%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.2), transparent 40%)",
        }}
      />
      <div className="relative flex flex-1 flex-col justify-end px-6 pt-16 pb-8 text-primary-foreground sm:justify-center sm:pb-16">
        <div className="mx-auto w-full max-w-sm">
          <span className="shadow-elevated-lg mb-5 flex size-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Droplet className="size-8" fill="currentColor" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-primary-foreground/75">
            {sent
              ? "Check your inbox for a reset link."
              : "We'll email you a link to set a new one."}
          </p>
        </div>
      </div>

      <div className="shadow-elevated-lg relative rounded-t-[2rem] bg-background px-6 pt-8 pb-10">
        <div className="mx-auto w-full max-w-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="size-7" />
              </span>
              <div>
                <p className="font-semibold text-foreground">
                  Reset link sent to {email}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click the link in that email to choose a new password. It
                  can take a couple of minutes to arrive — check spam if you
                  don't see it.
                </p>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link to="/login">Back to Sign In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "Sending..." : "Send reset link"}{" "}
                <ArrowRight className="size-4" />
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Back to Sign In
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
