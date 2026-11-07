import * as React from "react"
import { httpsCallable } from "firebase/functions"
import { Check, Copy, Gift, Mail, MessageCircle, MessageSquare, Share2 } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { functions } from "@/lib/firebase"
import { smsLink } from "@/lib/invite"
import { referralMessage } from "@/lib/referral"

interface ReferralInfo {
  code: string
  link: string
  creditMonthsEach: number
  joined: { businessName: string; joinedAt: number }[]
  monthsEarned: number
  referredByCreditMonths: number
}

export function ReferralsPage() {
  const [info, setInfo] = React.useState<ReferralInfo | null>(null)
  const [error, setError] = React.useState("")
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    httpsCallable<unknown, ReferralInfo>(functions, "getMyReferral")()
      .then((res) => {
        if (!cancelled) setInfo(res.data)
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load your referral link. Please try again in a moment.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const months = info?.creditMonthsEach ?? 3
  const message = info ? referralMessage(info.link, months) : ""
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  async function copyLink() {
    if (!info) return
    try {
      await navigator.clipboard.writeText(info.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the link is also shown on screen to copy by hand.
    }
  }

  async function nativeShare() {
    if (!info) return
    try {
      await navigator.share({ title: "Try Verde", text: message, url: info.link })
    } catch {
      // Closing the share sheet counts as an error - nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <TopBar title="Refer a garden pro" showBack backTo="/profile" />

      <div className="flex flex-col gap-4 px-4">
        <Card className="gap-3 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Gift className="size-5" />
            </span>
            <h2 className="text-base font-bold">Give {months} months, get {months} months</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Know another garden pro who'd like Verde? Send them your link. When they sign up with
            it, you both get {months} more months free.
          </p>
        </Card>

        {error ? (
          <Card className="p-4 text-sm text-destructive">{error}</Card>
        ) : !info ? (
          <Card className="p-4 text-sm text-muted-foreground">Loading your link…</Card>
        ) : (
          <>
            <Card className="gap-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your referral link
              </p>
              <p className="break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
                {info.link}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={copyLink}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                {canNativeShare ? (
                  <Button type="button" variant="outline" onClick={nativeShare}>
                    <Share2 className="size-4" /> Share…
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <a href={`mailto:?subject=${encodeURIComponent("Try Verde")}&body=${encodeURIComponent(message)}`}>
                      <Mail className="size-4" /> Email
                    </a>
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <a href={smsLink("", message)}>
                    <MessageSquare className="size-4" /> Text
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              </div>
            </Card>

            <Card className="gap-3 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pros who joined
                  </p>
                  <p className="text-2xl font-bold">{info.joined.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Free months earned
                  </p>
                  <p className="text-2xl font-bold">{info.monthsEarned}</p>
                </div>
              </div>
              {info.joined.length > 0 && (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {info.joined.map((j, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{j.businessName}</span>
                      <span className="text-xs text-muted-foreground">
                        {j.joinedAt ? new Date(j.joinedAt).toLocaleDateString() : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {info.referredByCreditMonths > 0 && (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm">
                  You joined Verde through a referral, so you also get{" "}
                  {info.referredByCreditMonths} free months.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Free months are applied to your Verde plan. A person can only be referred once,
                and signing up with your own link doesn't count.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
