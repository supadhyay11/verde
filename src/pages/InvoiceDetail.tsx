import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Copy, Send, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { markInvoicePaid, markInvoiceUnpaid, removeInvoice, useCustomerBook, useInvoice } from '@/lib/data'
import { translate } from '@/lib/i18n'
import { ORIGIN, smsLink } from '@/lib/invite'
import { money } from '@/lib/money'
import InvoiceView from '@/components/InvoiceView'
import { Button, Empty, Loading, Screen, cx } from '@/components/ui'

// The gardener's view of one invoice: the invoice as the customer sees it,
// plus send, copy link, mark paid and delete.
export default function InvoiceDetail() {
  const { id } = useParams()
  const { profile, lang, t } = useApp()
  const navigate = useNavigate()
  const invoice = useInvoice(id)
  const book = useCustomerBook(profile?.uid)
  const [method, setMethod] = useState<'zelle' | 'venmo'>('zelle')
  const [copied, setCopied] = useState(false)

  if (invoice === undefined) return <Loading label={t('loading')} />
  if (invoice === null || invoice.providerId !== profile?.uid) {
    return <Screen title={t('invoice')} back="/billing" nav={false}><Empty title={t('invNotFound')} /></Screen>
  }

  const link = `${ORIGIN}/invoice/${invoice.id}`
  // The text goes to the customer, so it is written in THEIR language.
  const message = translate(invoice.customerLang, 'invSms', {
    name: invoice.providerName, amount: money(invoice.amount, invoice.customerLang), period: invoice.period, link,
  })
  const phone = book?.find((c) => c.id === invoice.customerId)?.phone

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* link is in the text message */ }
  }
  function send() {
    if (phone) window.location.href = smsLink(phone, message)
    else void copyLink()
  }
  async function remove() {
    if (window.confirm(t('invDeleteAsk'))) { await removeInvoice(invoice!.id); navigate('/billing', { replace: true }) }
  }

  return (
    <Screen title={t('invoiceNo', { n: invoice.number })} back="/billing" nav={false}>
      <InvoiceView invoice={invoice} lang={lang ?? 'en'} />
      <div className="mt-6 space-y-3">
        <Button onClick={send} icon={<Send size={22} aria-hidden />}>{t('invSend')}</Button>
        <Button variant="secondary" onClick={copyLink} icon={copied ? <Check size={22} aria-hidden /> : <Copy size={22} aria-hidden />}>{copied ? t('copied') : t('copy')}</Button>
        {invoice.status === 'unpaid' ? (
          <div className="space-y-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
            <div className="grid grid-cols-2 gap-3">
              {(['zelle', 'venmo'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                  className={cx('min-h-16 rounded-2xl text-xl font-bold', method === m ? 'bg-green-soft text-green-dark ring-[3px] ring-green' : 'bg-bg ring-2 ring-line')}>
                  {t(m)}
                </button>
              ))}
            </div>
            <Button onClick={() => markInvoicePaid(invoice.id, method)} icon={<Check size={22} aria-hidden />}>{t('markPaid')}</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => markInvoiceUnpaid(invoice.id)}>{t('markUnpaid')}</Button>
        )}
        <Button variant="danger" onClick={remove} icon={<Trash2 size={22} aria-hidden />}>{t('invDelete')}</Button>
      </div>
    </Screen>
  )
}
