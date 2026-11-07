import { Navigate } from "react-router-dom"
import { CheckCircle2, FileText } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import type { Invoice } from "@/types"

function money(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{invoice.period}</p>
          {invoice.invoiceNumber != null && (
            <p className="text-xs text-muted-foreground">Invoice #{invoice.invoiceNumber}</p>
          )}
        </div>
        <p className="text-lg font-bold">{money(invoice.amount)}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        {invoice.status === "paid" ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="size-3.5" /> Paid
          </span>
        ) : (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
            Unpaid
          </span>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={`/invoice/${invoice.id}`} target="_blank" rel="noreferrer">
            {invoice.status === "paid" ? "View invoice" : "View & pay"}
          </a>
        </Button>
      </div>
    </Card>
  )
}

// Lets a customer (owner) see their own billing history and pay an open
// invoice from inside the app, instead of only ever seeing one if they
// still have the emailed/texted link handy. Reuses the existing public
// /invoice/:id page (InvoicePage.tsx) for the actual view-and-pay screen -
// it already shows the Venmo/Zelle pay options - rather than duplicating
// that UI here. There's no in-app card/ACH payment yet (that's a planned
// follow-up once Stripe Connect's "Pay with card" flow is built on top of
// the existing Connect setup - see ProfilePage's Stripe card); for now
// "pay" means the same Venmo/Zelle flow the emailed invoice already offers.
export function MyInvoicesPage() {
  const { user } = useAuth()
  const { invoices } = useJobsStore()

  // Providers already have the full-business version of this at /billing -
  // this page is scoped to one property's invoices (via the propertyId
  // filter useJobsStore already applies for an owner) and isn't meant for
  // them.
  if (user?.role === "provider") {
    return <Navigate to="/billing" replace />
  }

  const sorted = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unpaid = sorted.filter((i) => i.status !== "paid")
  const paid = sorted.filter((i) => i.status === "paid")

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar title="Billing" />
      <div className="flex flex-col gap-4 px-4 py-4">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileText className="size-8 text-muted-foreground/50" />
            <p>No invoices yet - they'll show up here once your provider sends one.</p>
          </div>
        ) : (
          <>
            {unpaid.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unpaid
                </h3>
                {unpaid.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </div>
            )}
            {paid.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paid
                </h3>
                {paid.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
