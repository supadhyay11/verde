import { useState } from 'react'
import type { FormEvent } from 'react'
import { Leaf, Scissors, Home } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { useApp } from '@/lib/app-context'
import type { Role } from '@/lib/types'
import { Button, Field, cx } from '@/components/ui'

export default function Auth({ onChangeLanguage }: { onChangeLanguage: () => void }) {
  const { t, signIn, signUp, lang } = useApp()
  const invite = (() => {
    try {
      const c = (new URLSearchParams(window.location.search).get('code') ?? '').trim().toUpperCase()
      return /^[A-Z2-9]{6}$/.test(c) ? c : ''
    } catch { return '' }
  })()
  const [mode, setMode] = useState<'signin' | 'signup'>(invite ? 'signup' : 'signin')
  const [role, setRole] = useState<Role>(invite ? 'customer' : 'provider')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState(invite)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && password.length < 8) return setError(t('passwordShort'))
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp({ role, name, email, password, phone, providerCode: role === 'customer' ? code : undefined })
    } catch (err) {
      const c = err instanceof FirebaseError ? err.code : ''
      setError(
        c === 'auth/email-already-in-use' ? t('emailTaken')
        : c.startsWith('auth/invalid') || c === 'auth/user-not-found' || c === 'auth/wrong-password' ? t('badLogin')
        : c === 'auth/weak-password' ? t('passwordShort')
        : t('somethingWrong'),
      )
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <span className="flex items-center gap-2 font-display text-2xl font-extrabold text-green">
          <Leaf aria-hidden /> Verde
        </span>
        <button type="button" onClick={onChangeLanguage} className="rounded-full bg-sand px-4 py-2 text-base font-bold">
          {lang === 'es' ? 'Español' : 'English'}
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5" noValidate>
        <h2 className="text-3xl font-extrabold">{mode === 'signin' ? t('signIn') : t('signUp')}</h2>

        {mode === 'signup' && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-lg font-bold">{t('whoAreYou')}</legend>
            <div className="grid grid-cols-2 gap-3">
              {([['provider', Scissors, t('iAmGardener')], ['customer', Home, t('iAmCustomer')]] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRole(id)}
                  aria-pressed={role === id}
                  className={cx(
                    'flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl bg-surface px-3 text-center text-lg font-bold',
                    role === id ? 'text-green-dark ring-[3px] ring-green' : 'ring-2 ring-line',
                  )}
                >
                  <Icon size={30} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {mode === 'signup' && (
          <Field id="name" label={t('yourName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        )}
        <Field id="email" label={t('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        <Field
          id="password" label={t('password')} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required
        />
        {mode === 'signup' && (
          <Field id="phone" label={t('phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        )}
        {mode === 'signup' && role === 'customer' && (
          <Field
            id="code" label={t('providerCode')} hint={t('providerCodeHelp')} value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" autoComplete="off"
          />
        )}

        {error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}

        <Button type="submit" disabled={busy || !email || !password || (mode === 'signup' && !name.trim())}>
          {busy ? t('loading') : mode === 'signin' ? t('signIn') : t('signUp')}
        </Button>

        <p className="text-center text-lg text-muted">
          {mode === 'signin' ? t('noAccount') : t('haveAccount')}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
            className="font-bold text-green-dark underline"
          >
            {mode === 'signin' ? t('signUp') : t('signIn')}
          </button>
        </p>
      </form>
    </div>
  )
}
