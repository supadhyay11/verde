import { useState } from 'react'
import type { FormEvent } from 'react'
import { useApp } from '@/lib/app-context'
import { Button, Field } from '@/components/ui'

// Customers who skipped (or mistyped) the code at sign-up enter it here.
export default function LinkProvider() {
  const { t, linkToProvider } = useApp()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await linkToProvider(code)
    } catch {
      setError(t('badCode'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 className="text-2xl font-extrabold">{t('linkNow')}</h2>
      <Field id="link-code" label={t('providerCode')} hint={t('providerCodeHelp')} value={code} maxLength={6}
        onChange={(e) => setCode(e.target.value.toUpperCase())} error={error} autoCapitalize="characters" autoComplete="off" />
      <Button type="submit" disabled={busy || code.trim().length < 6}>{busy ? t('loading') : t('link')}</Button>
    </form>
  )
}
