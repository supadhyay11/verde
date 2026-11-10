import { useT } from "@/lib/i18n"
import { VerdeMark } from "@/components/VerdeMark"
import * as React from "react"
import { useNavigate } from "react-router-dom"
import { httpsCallable } from "firebase/functions"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { functions } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"

interface SendResult {
  ok: boolean
  sent?: boolean
  alreadyVerified?: boolean
  resendAfter?: number
}
interface VerifyResult {
  ok: boolean
  alreadyVerified?: boolean
  reason?: "invalid-format" | "no-code" | "expired" | "too-many-attempts" | "wrong-code"
  attemptsLeft?: number
}

const REASON_TEXT: Record<string, string> = {
  "invalid-format": "Enter the 6-digit code from your email.",
  "no-code": "That code isn't active any more. Tap “Send a new code”.",
  expired: "That code has expired. Tap “Send a new code”.",
  "too-many-attempts": "Too many wrong tries. Tap “Send a new code” to get a fresh one.",
}

/**
 * "Check your email" - the person types the 6-digit code we emailed them
 * (functions/email-code.js). `required` is the full-screen gate business
 * admins hit until they verify; without it (technicians, or someone opening
 * it from the banner) it's a normal page they can leave.
 */
export function VerifyEmailScreen({ required = false }: { required?: boolean }) {
  const t = useT()
  const { user, emailVerified, refreshEmailVerified, logout } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [info, setInfo] = React.useState("")
  const [resendAt, setResendAt] = React.useState(0)
  const [now, setNow] = React.useState(Date.now())
  const askedRef = React.useRef(false)
  const [editing, setEditing] = React.useState(false)
  const [newEmail, setNewEmail] = React.useState("")
  const [changing, setChanging] = React.useState(false)

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const sendCode = React.useCallback(async (force: boolean) => {
    setMessage("")
    setInfo("")
    try {
      const res = await httpsCallable<{ force: boolean }, SendResult>(functions, "sendEmailCode")({ force })
      if (res.data.alreadyVerified) {
        await refreshEmailVerified()
        return
      }
      if (res.data.resendAfter) setResendAt(res.data.resendAfter)
      if (res.data.sent) setInfo("We sent you a new code.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message.slice(0, 200) : "Couldn't send the code. Please try again.")
    }
  }, [refreshEmailVerified])

  // Opening the screen makes sure a live code exists. The server won't send
  // a duplicate if one was just emailed at sign-up.
  React.useEffect(() => {
    if (askedRef.current) return
    askedRef.current = true
    void sendCode(false)
  }, [sendCode])

  // Once verified (here or in another tab), move on.
  React.useEffect(() => {
    if (emailVerified === true && !required) navigate("/jobs", { replace: true })
  }, [emailVerified, required, navigate])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage("")
    setInfo("")
    try {
      const res = await httpsCallable<{ code: string }, VerifyResult>(functions, "verifyEmailCode")({ code })
      const d = res.data
      if (d.ok) {
        await refreshEmailVerified()
        if (!required) navigate("/jobs", { replace: true })
      } else if (d.reason === "wrong-code") {
        setMessage(`That code isn't right. ${d.attemptsLeft ?? 0} ${d.attemptsLeft === 1 ? "try" : "tries"} left.`)
      } else {
        setMessage(REASON_TEXT[d.reason ?? ""] ?? "That didn't work. Please try again.")
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message.slice(0, 200) : "That didn't work. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  // "Wrong email?" - fixes a typo while the email is still unverified, then
  // sends the code to the corrected address (functions/change-email.js).
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setChanging(true)
    setMessage("")
    setInfo("")
    try {
      await httpsCallable<{ email: string }, { ok: boolean }>(functions, "changeMyUnverifiedEmail")({
        email: newEmail.trim(),
      })
      setEditing(false)
      setNewEmail("")
      setCode("")
      setResendAt(0)
      await sendCode(true)
    } catch (err) {
      setMessage(err instanceof Error ? err.message.slice(0, 200) : "Couldn't change the email. Please try again.")
    } finally {
      setChanging(false)
    }
  }

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000))

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <span className="bg-brand-gradient mb-5 flex size-14 items-center justify-center rounded-2xl text-primary-foreground">
          <VerdeMark className="size-7" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("Check your email")}</h1>
        <p className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
          <MailCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            {t("We sent a 6-digit code to")} <strong className="text-foreground">{user?.email}</strong>{t(". It can take a minute to arrive - check spam if you don't see it.")}
          </span>
        </p>

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            autoFocus
            aria-label={t("6-digit verification code")}
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
          />
          {message && <p className="text-sm text-destructive">{message}</p>}
          {info && !message && <p className="text-sm text-muted-foreground">{info}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Checking..." : "Verify email"}
          </Button>
        </form>

        {editing ? (
          <form onSubmit={handleChangeEmail} className="mt-4 space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{t("What's the right email address?")}</p>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("you@example.com")}
              autoComplete="email"
              required
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={changing || !newEmail.trim()}>
                {changing ? "Saving..." : "Save and send code"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                {t("Cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMessage("")
              setEditing(true)
            }}
            className="mt-4 text-sm text-muted-foreground underline underline-offset-2"
          >
            {t("Wrong email address?")}
          </button>
        )}

        <div className="mt-3 flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => void sendCode(true)}
            disabled={waitSeconds > 0}
            className="font-medium text-primary underline underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
          >
            {waitSeconds > 0 ? `Send a new code in ${waitSeconds}s` : "Send a new code"}
          </button>
          {required ? (
            <button type="button" onClick={() => void logout()} className="text-muted-foreground underline underline-offset-2">
              {t("Sign out")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/jobs")}
              className="text-muted-foreground underline underline-offset-2"
            >
              {t("Not now")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
