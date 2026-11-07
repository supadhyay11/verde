import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Copy, Mail, MapPin, Pencil, Phone, Plus, Search, Send, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { removeCustomerRecord, sendShareEmail, useCustomerBook } from '@/lib/data'
import { inviteMessage, smsLink } from '@/lib/invite'
import type { CustomerEntry } from '@/lib/types'
import { Button, Card, Empty, Pill, Screen, cx } from '@/components/ui'

// The gardener's customer list: people added by hand (not in the app yet, each
// with their own code and a one-tap text invite) plus people who linked.
export default function Customers() {
  const { profile, t } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const justAdded = (location.state as { added?: string } | null)?.added
  const customers = useCustomerBook(profile?.uid)
  const [copied, setCopied] = useState('')
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const visible = (customers ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.address ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q),
  )

  async function copy(code: string, lang: CustomerEntry['language']) {
    try {
      await navigator.clipboard.writeText(inviteMessage(profile?.name, code, lang ?? 'en'))
      setCopied(code)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* clipboard blocked: the code is on screen anyway */ }
  }

  // Opens the phone's text app with the customer's number and the invite already filled in.
  function sendInvite(c: CustomerEntry) {
    if (!c.code) return
    const body = inviteMessage(profile?.name, c.code, c.language ?? 'en')
    if (c.phone) window.location.href = smsLink(c.phone, body)
    else void copy(c.code, c.language)
  }

  const [mailState, setMailState] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({})
  async function emailInvite(c: CustomerEntry) {
    if (!c.email) return
    setMailState((m) => ({ ...m, [c.id]: 'sending' }))
    try { await sendShareEmail('invite', c.id); setMailState((m) => ({ ...m, [c.id]: 'sent' })) }
    catch { setMailState((m) => ({ ...m, [c.id]: 'failed' })) }
  }

  async function remove(id: string) {
    if (window.confirm(t('removeCustomerAsk'))) await removeCustomerRecord(id)
  }

  return (
    <Screen title={t('customers')}>
      <Button onClick={() => navigate('/customers/new')} icon={<Plus aria-hidden />}>{t('addCustomer')}</Button>

      {(customers?.length ?? 0) > 3 && (
        <label className="mt-4 flex h-16 items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 focus-within:border-green">
          <Search size={22} className="text-muted" aria-hidden />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchCustomers')} aria-label={t('searchCustomers')}
            className="min-w-0 flex-1 bg-transparent text-xl outline-none"
          />
        </label>
      )}

      <div className="mt-6 space-y-4">
        {customers === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
        {customers && customers.length === 0 && <Empty title={t('noCustomersList')} help={t('noCustomersListHelp')} />}
        {customers && customers.length > 0 && visible.length === 0 && <p className="py-10 text-center text-xl text-muted">{t('noMatches')}</p>}
        {visible.map((c) => (
          <Card key={c.id} className={cx('space-y-3', c.id === justAdded && 'ring-2 ring-green')}>
            {c.id === justAdded && (
              <p className="rounded-2xl bg-green-soft px-4 py-3 text-lg font-bold text-green-dark">
                <Check className="mr-2 inline" size={20} aria-hidden />{t('inviteReady')}. {t('inviteReadyHelp')}
              </p>
            )}
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-2xl font-extrabold">{c.name}</h2>
              {!c.linked && (
                <button type="button" onClick={() => navigate(`/customers/${c.id}/edit`)} aria-label={t('editCustomer')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink">
                  <Pencil size={20} aria-hidden />
                </button>
              )}
            </div>
            <Pill tone={c.linked ? 'green' : 'neutral'}>{c.linked ? t('inApp') : t('notInApp')}</Pill>
            {c.address && <p className="flex items-start gap-2 text-lg text-muted"><MapPin size={20} className="mt-0.5 shrink-0" aria-hidden />{c.address}</p>}
            {c.email && <p className="break-all text-lg text-muted">{c.email}</p>}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xl font-bold text-green-dark">
                <Phone size={20} aria-hidden /> {c.phone}
              </a>
            )}
            {!c.linked && c.code && (
              <div className="space-y-3 rounded-2xl bg-green-soft p-4">
                <div>
                  <p className="text-base font-semibold text-green-dark">{t('theirCode')}</p>
                  <p className="text-3xl font-extrabold tracking-widest text-green-dark">{c.code}</p>
                </div>
                <Button onClick={() => sendInvite(c)} icon={<Send size={22} aria-hidden />}>{t('sendInvite')}</Button>
                {c.email && <Button variant="secondary" disabled={mailState[c.id] === 'sending'} onClick={() => emailInvite(c)} icon={mailState[c.id] === 'sent' ? <Check size={22} aria-hidden /> : <Mail size={22} aria-hidden />}>{mailState[c.id] === 'sending' ? t('sending') : mailState[c.id] === 'sent' ? t('emailSent') : t('sendByEmail')}</Button>}
                {mailState[c.id] === 'failed' && <p role="alert" className="text-lg font-semibold text-danger">{t('emailFailed')}</p>}
                <button type="button" onClick={() => copy(c.code!, c.language)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-lg font-bold">
                  {copied === c.code ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />} {copied === c.code ? t('copied') : t('copy')}
                </button>
              </div>
            )}
            {!c.linked && (
              <Button variant="ghost" onClick={() => remove(c.id)} icon={<Trash2 size={20} aria-hidden />}>{t('removeCustomer')}</Button>
            )}
          </Card>
        ))}
      </div>
    </Screen>
  )
}
