import { useState } from 'react'
import type { FormEvent } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useApp } from '@/lib/app-context'
import { db } from '@/lib/firebase'
import { Button, Field, Screen } from '@/components/ui'

// A simple message box: each message is saved for the Verde team to read.
export default function Support() {
  const { user, profile, lang, t } = useApp()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setBusy(true)
    setError('')
    try {
      await addDoc(collection(db, 'supportRequests'), {
        uid: user.uid, name: profile.name, email: profile.email, role: profile.role,
        lang: lang ?? 'en', message: message.trim(), createdAt: serverTimestamp(),
      })
      setSent(true)
      setMessage('')
    } catch {
      setError(t('somethingWrong'))
    }
    setBusy(false)
  }

  return (
    <Screen title={t('support')} back="/profile" nav={false}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-lg text-muted">{t('supportHelp')}</p>
        <Field id="support-msg" label={t('supportMessage')} value={message} onChange={(e) => setMessage(e.target.value)} multiline maxLength={2000} />
        {error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}
        {sent && <p role="status" className="rounded-2xl bg-green-soft px-4 py-3 text-lg font-semibold text-green-dark">{t('supportThanks')}</p>}
        <Button type="submit" disabled={busy || message.trim().length < 3}>{busy ? t('loading') : t('supportSend')}</Button>
      </form>
    </Screen>
  )
}
