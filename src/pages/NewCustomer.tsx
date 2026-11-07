import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { addCustomer, updateCustomerRecord, useCustomerBook } from '@/lib/data'
import type { Lang } from '@/lib/types'
import { Button, Field, Screen, cx } from '@/components/ui'

export default function NewCustomer() {
  const { profile, t } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const book = useCustomerBook(profile?.uid)
  const existing = id ? book?.find((c) => c.id === id && !c.linked) : undefined
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [language, setLanguage] = useState<Lang>('en')
  const [loadedId, setLoadedId] = useState('')
  if (existing && loadedId !== existing.id) {
    setLoadedId(existing.id)
    setName(existing.name)
    setPhone(existing.phone ?? '')
    setEmail(existing.email ?? '')
    setAddress(existing.address ?? '')
    setLanguage(existing.language ?? 'en')
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError('')
    try {
      if (id) {
        await updateCustomerRecord(id, { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), language })
        navigate('/customers')
      } else {
        const newId = await addCustomer({ providerId: profile.uid, name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), language })
        navigate('/customers', { state: { added: newId } })
      }
    } catch {
      setError(t('somethingWrong'))
      setBusy(false)
    }
  }

  return (
    <Screen title={id ? t('editCustomer') : t('addCustomer')} back="/customers" nav={false}>
      <form onSubmit={submit} className="space-y-5 pb-4" noValidate>
        <Field id="c-name" label={t('customerName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
        <Field id="c-phone" label={t('customerPhone')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        <Field id="c-email" label={t('emailOptional')} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <Field id="c-address" label={t('jobAddress')} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
        <fieldset>
          <legend className="mb-2 text-lg font-bold">{t('customerLanguage')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)}
                className={cx('min-h-16 rounded-2xl text-xl font-bold', language === l ? 'bg-green-soft text-green-dark ring-2 ring-green' : 'bg-surface ring-1 ring-line')}
              >
                {l === 'en' ? t('english') : t('spanish')}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? t('loading') : id ? t('saveChanges') : t('saveCustomer')}</Button>
      </form>
    </Screen>
  )
}
