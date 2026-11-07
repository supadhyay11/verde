import * as React from "react"
import { httpsCallable } from "firebase/functions"
import { MessageCircle, Send } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { functions } from "@/lib/firebase"

const SUPPORT_WHATSAPP_NUMBER = "15109005951"

function whatsappLink(number: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}`
}

export function SupportPage() {
  const [message, setMessage] = React.useState("")
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle")

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus("sending")
    try {
      await httpsCallable(functions, "sendSupportMessage")({ message: message.trim() })
      setStatus("sent")
      setMessage("")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background pb-6">
      <TopBar title="Help & Support" showBack backTo="/profile" />
      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Have a question or ran into a problem? Reach out and we&apos;ll get back to
          you.
        </p>

        {SUPPORT_WHATSAPP_NUMBER && (
          <a href={whatsappLink(SUPPORT_WHATSAPP_NUMBER)} target="_blank" rel="noreferrer">
            <Button variant="outline" className="w-full">
              <MessageCircle className="size-4" /> Message us on WhatsApp
            </Button>
          </a>
        )}

        <Card className="gap-3 p-4">
          <p className="text-sm font-semibold">Email Us</p>
          <p className="text-xs text-muted-foreground">
            Sends straight to our support team - we typically reply within a business
            day.
          </p>
          <form onSubmit={handleSend} className="flex flex-col gap-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's going on?"
              rows={5}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              required
            />
            <Button type="submit" disabled={status === "sending" || !message.trim()}>
              <Send className="size-4" />
              {status === "sending" ? "Sending..." : "Send Message"}
            </Button>
          </form>
          {status === "sent" && (
            <p className="text-sm text-success">
              Message sent - we&apos;ll get back to you soon.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">
              Couldn&apos;t send that. Try again in a moment, or email us directly at
              support@verde-gardener-app.web.app.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
