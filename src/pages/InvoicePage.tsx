import { LanguageToggle, useI18n, useT, locale } from "@/lib/i18n"
import { VerdeMark } from "@/components/VerdeMark"
import * as React from "react"
import { useParams } from "react-router-dom"
import { doc, getDoc } from "firebase/firestore"
import { CheckCircle2, Landmark, Printer, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { db } from "@/lib/firebase"
import type { Invoice } from "@/types"

// Public, unauthenticated page: anyone with the link (sent via the
// provider's "Send Invoice" button) can view it, same pattern as
// JobReportPage. It only ever reads the invoice document itself - never
// the property or business docs - relying on the snapXxx fields captured
// when the invoice was created. There is no real payment processor behind
// this: Venmo only pre-fills the amount inside its own app, and Zelle has
// no way to accept a pre-filled request at all, so the customer always
// finishes the payment by hand and the provider marks it Paid manually.
export function InvoicePage() {
  const t = useT()
  const { setLang } = useI18n()
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = React.useState<Invoice | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!invoiceId) return
    let cancelled = false
    getDoc(doc(db, "invoices", invoiceId))
      .then((snap) => {
        if (cancelled) return
        if (!snap.exists()) {
          setInvoice(null)
          return
        }
        const loaded = { id: snap.id, ...snap.data() } as Invoice
        setInvoice(loaded)
        // Open in the customer's language unless this visitor already chose one.
        try {
          if (!localStorage.getItem("verde-lang") && loaded.snapLanguage) setLang(loaded.snapLanguage)
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("This invoice link isn't available right now."))
      })
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  if (invoice === undefined && !error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground">
          <VerdeMark className="size-7" />
        </span>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <VerdeMark className="size-8 text-primary" />
        <p className="font-semibold">{t("Invoice not available")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {error ?? t("This link may be incorrect or the invoice may have been removed.")}
        </p>
      </div>
    )
  }

  const amountStr = invoice.amount.toLocaleString(locale(), {
    style: "currency",
    currency: "USD",
  })

  const venmoLink = invoice.snapVenmoUsername
    ? `https://venmo.com/${encodeURIComponent(invoice.snapVenmoUsername)}?txn=pay&amount=${invoice.amount}&note=${encodeURIComponent(
        `${invoice.snapBusinessName || t("Garden service")} - ${invoice.period}`
      )}`
    : null

  return (
    <div className="min-h-dvh bg-muted/30 pb-10">
      <div className="mx-auto flex max-w-lg justify-end px-4 pt-3 print:hidden"><LanguageToggle /></div>
      <div className="bg-primary px-5 pb-14 pt-8 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/15">
              {invoice.snapBusinessLogoUrl ? (
                <img src={invoice.snapBusinessLogoUrl} alt="" className="size-full object-cover" />
              ) : (
                <VerdeMark className="size-6" />
              )}
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                {invoice.snapBusinessName || t("Garden Service Invoice")}
              </p>
              <p className="text-lg font-bold">{t("Invoice")}</p>
              {invoice.invoiceNumber != null && (
                <p className="text-xs text-primary-foreground/70">#{invoice.invoiceNumber}</p>
              )}
            </div>
          </div>
          <span
            className={
              "shrink-0 rounded-full px-3 py-1 text-xs font-bold " +
              (invoice.status === "paid" ? "bg-green-500/25 text-white" : "bg-red-500/25 text-white")
            }
          >
            {invoice.status === "paid" ? "PAID" : "UNPAID"}
          </span>
        </div>
      </div>

      <div className="mx-auto -mt-8 flex max-w-lg flex-col gap-4 px-4">
        <div className="flex justify-end print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> {t("Print")}
          </Button>
        </div>

        <Card className="gap-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Bill to")}</p>
          <p className="text-lg font-bold">{invoice.snapCustomerName || t("Customer")}</p>
          {invoice.snapAddress && <p className="text-sm text-muted-foreground">{invoice.snapAddress}</p>}
        </Card>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            <span>{t("Service period")}</span>
            <span>{t("Amount")}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{invoice.period}</span>
            <span className="text-sm font-semibold">{amountStr}</span>
          </div>
          {invoice.notes && (
            <p className="border-t px-4 py-2 text-sm text-muted-foreground">{invoice.notes}</p>
          )}
        </Card>

        <Card
          className={
            "gap-1 p-4 text-center " +
            (invoice.status === "paid" ? "border-green-500/30 bg-green-500/10" : "border-primary/30 bg-primary/5")
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {invoice.status === "paid" ? t("Total paid") : t("Balance due")}
          </p>
          <p className={"text-3xl font-bold " + (invoice.status === "paid" ? "text-green-600" : "text-primary")}>
            {amountStr}
          </p>
        </Card>

        {invoice.status === "paid" ? (
          <Card className="gap-1 border-green-500/30 bg-green-500/10 p-4 text-center">
            <CheckCircle2 className="mx-auto size-6 text-green-600" />
            <p className="text-sm font-semibold text-green-700">{t("This invoice has been marked as paid.")}</p>
            <p className="text-xs text-muted-foreground">{t("Thank you!")}</p>
          </Card>
        ) : (
          <>
            {(venmoLink || invoice.snapZelleContact) && (
              <p className="px-1 text-center text-xs text-muted-foreground">
                {t("Pay however's easiest - payment is completed on your end; your provider will mark this invoice paid once it comes through.")}
              </p>
            )}

            {venmoLink && (
              <Card className="gap-2 p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Wallet className="size-4" /> {t("Pay with Venmo")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("Opens Venmo with the amount and note pre-filled.")}
                </p>
                <p className="rounded-md bg-muted px-3 py-2 text-center text-sm font-semibold">
                  {invoice.snapVenmoUsername}
                </p>
                <Button asChild className="mt-1 w-full">
                  <a href={venmoLink}>{t("Pay")} {amountStr} {t("with Venmo")}</a>
                </Button>
              </Card>
            )}

            {invoice.snapZelleContact && (
              <Card className="gap-2 p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Landmark className="size-4" /> {t("Pay with Zelle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("Send")} {amountStr} {t("via Zelle in your banking app to:")}
                </p>
                <p className="rounded-md bg-muted px-3 py-2 text-center text-sm font-semibold">
                  {invoice.snapZelleContact}
                </p>
              </Card>
            )}

            {!venmoLink && !invoice.snapZelleContact && (
              <Card className="gap-1 p-4 text-center text-sm text-muted-foreground">
                {t("Contact")} {invoice.snapBusinessName || "your provider"} {t("to arrange payment.")}
              </Card>
            )}
          </>
        )}

        <p className="px-2 text-center text-xs text-muted-foreground">
          {invoice.snapBusinessName ? t("Sent by {name}", { name: invoice.snapBusinessName }) : t("Thanks for your business!")}
          {invoice.snapBusinessPhone ? `  ${invoice.snapBusinessPhone}` : ""}
        </p>
      </div>
    </div>
  )
}
