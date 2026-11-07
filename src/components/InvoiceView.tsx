import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { money } from '@/lib/money'
import { longDate, todayKey } from '@/lib/date'
import type { Invoice, Lang } from '@/lib/types'
import { Card, Pill } from '@/components/ui'

/** The invoice itself, shown in `lang` (the customer's language on the shared link). */
export default function InvoiceView({ invoice, lang }: { invoice: Invoice; lang: Lang }) {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v)
  const [copied, setCopied] = useState('')
  const paid = invoice.status === 'paid'
  const paidDate = invoice.paidAt ? longDate(todayKey(invoice.paidAt.toDate()), lang) : ''

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* the text is on screen */ }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-bold text-muted">{t('invoiceNo', { n: invoice.number })}</p>
          <Pill tone={paid ? 'green' : 'neutral'}>{paid ? t('paid') : t('unpaid')}</Pill>
        </div>
        <p className="text-5xl font-extrabold">{money(invoice.amount, lang)}</p>
        <p className="text-xl font-semibold">{invoice.period}</p>
        <dl className="space-y-1 text-lg">
          <div className="flex justify-between gap-3"><dt className="text-muted">{t('invFrom')}</dt><dd className="font-bold">{invoice.providerName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">{t('invFor')}</dt><dd className="font-bold">{invoice.customerName}</dd></div>
        </dl>
        {invoice.notes && <p className="rounded-2xl bg-sand px-4 py-3 text-lg">{invoice.notes}</p>}
        {paid && invoice.method && (
          <p className="rounded-2xl bg-green-soft px-4 py-3 text-lg font-bold text-green-dark">
            <Check className="mr-2 inline" size={20} aria-hidden />
            {t('invPaidVia', { method: t(invoice.method), date: paidDate })}
          </p>
        )}
      </Card>

      {!paid && (
        <Card className="space-y-4">
          <h2 className="text-2xl font-extrabold">{t('howToPay')}</h2>
          <p className="text-lg text-muted">{t('invPayHelp')}</p>
          {!invoice.zelle && !invoice.venmo && <p className="text-lg font-semibold">{t('invNoPayInfo')}</p>}
          {invoice.zelle && (
            <div className="space-y-2 rounded-2xl bg-green-soft p-4">
              <p className="text-base font-semibold text-green-dark">{t('invZelleTo')}</p>
              <p className="break-all text-2xl font-extrabold text-green-dark">{invoice.zelle}</p>
              <button type="button" onClick={() => copy(invoice.zelle!)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-lg font-bold">
                {copied === invoice.zelle ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />} {copied === invoice.zelle ? t('copied') : t('copy')}
              </button>
            </div>
          )}
          {invoice.venmo && (
            <div className="space-y-2 rounded-2xl bg-green-soft p-4">
              <p className="text-base font-semibold text-green-dark">{t('invVenmoTo')}</p>
              <p className="break-all text-2xl font-extrabold text-green-dark">{invoice.venmo}</p>
              <a
                href={`https://venmo.com/${encodeURIComponent(invoice.venmo.replace(/^@/, ''))}`} target="_blank" rel="noreferrer"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-lg font-bold"
              ><ExternalLink size={20} aria-hidden /> {t('invOpenVenmo')}</a>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
