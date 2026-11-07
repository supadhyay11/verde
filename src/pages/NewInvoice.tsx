import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { createInvoice, useCustomerBook } from '@/lib/data'
import { monthLabel } from '@/lib/money'
import { Button, Empty, Field, Screen } from '@/components/ui'

export default function NewInvoice() {
  const { profile, providerProfile, lang, t } = useApp()
  const navigate = useNavigate()
  const customers = useCustomerBook(profile?.uid)
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState(monthLabel(lang ?? 'en'))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const customer = customers?.find((c) => c.id === customerId)
  const value = Number(amount.replace(',', '.').replace(/[^0-9.]/g, ''))
  const valid = !!customer && value > 0 && value < 1000000 && period.trim().length > 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !customer || !valid) return
    setBusy(true)
    setError('')
    try {
      const id = await createInvoice({
        providerId: profile.uid, providerName: profile.name,
        customer: { id: customer.id, name: customer.name, language: customer.language },
        amount: Math.round(value * 100) / 100, period: period.trim(), notes: notes.trim(),
        zelle: providerProfile?.zelle, venmo: providerProfile?.venmo,
      })
      navigate(`/billing/${id}`, { replace: true })
    } catch {
      setError(t('somethingWrong'))
      setBusy(false)
    }
  }

  return (
    <Screen title={t('newInvoice')} back="/billing" nav={false}>
      {customers && customers.length === 0 ? (
        <Empty title={t('noCustomers')} help={t('invSavedFirst')} action={<Button variant="secondary" onClick={() => navigate('/customers/new')}>{t('addCustomer')}</Button>} />
      ) : (
        <form onSubmit={submit} className="space-y-5 pb-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="inv-customer" className="block text-lg font-bold">{t('invPickCustomer')}</label>
            <select id="inv-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required
              className="h-16 w-full rounded-2xl border-2 border-line bg-surface px-4 text-xl focus:border-green">
              <option value="" disabled />
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Field id="inv-amount" label={t('amount')} placeholder={t('amountPlaceholder')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Field id="inv-period" label={t('invPeriod')} value={period} onChange={(e) => setPeriod(e.target.value)} />
          <Field id="inv-notes" label={t('invNotes')} value={notes} onChange={(e) => setNotes(e.target.value)} multiline maxLength={500} />
          {error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}
          <Button type="submit" disabled={busy || !valid}>{busy ? t('loading') : t('invCreate')}</Button>
        </form>
      )}
    </Screen>
  )
}
