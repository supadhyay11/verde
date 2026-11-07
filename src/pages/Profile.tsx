import { useState } from 'react'
import { Check, Copy, LifeBuoy, LogOut, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import type { Lang } from '@/lib/types'
import { Button, Field, Screen, cx } from '@/components/ui'
import LinkProvider from './LinkProvider'

export default function Profile() {
  const { profile, providerProfile, t, signOut, updateProfile, updateProviderProfile, deleteAccount } = useApp()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [zelle, setZelle] = useState(providerProfile?.zelle ?? '')
  const [venmo, setVenmo] = useState(providerProfile?.venmo ?? '')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!profile) return null
  const isProvider = profile.role === 'provider'

  async function save() {
    await updateProfile({ name: name.trim() || profile?.name, phone: phone.trim(), ...(isProvider ? {} : { address: address.trim() }) })
    if (isProvider) await updateProviderProfile({ zelle: zelle.trim(), venmo: venmo.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(profile?.inviteCode ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the code is on screen to read out or select */
    }
  }

  return (
    <Screen title={t('yourProfile')}>
      <section className="space-y-3">
        <h2 className="text-2xl font-extrabold">{t('language')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['en', 'es'] as Lang[]).map((l) => (
            <button
              key={l} type="button" lang={l} aria-pressed={profile.language === l}
              onClick={() => updateProfile({ language: l })}
              className={cx('min-h-16 rounded-2xl text-2xl font-extrabold', profile.language === l ? 'bg-green-soft text-green-dark ring-[3px] ring-green' : 'bg-surface ring-2 ring-line')}
            >
              {l === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>
      </section>

      {isProvider && (
        <section className="mt-8 rounded-3xl bg-green-soft p-5">
          <h2 className="text-2xl font-extrabold">{t('yourCode')}</h2>
          <p className="mt-1 text-lg text-green-dark">{t('yourCodeHelp')}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="select-all rounded-2xl bg-surface px-5 py-3 font-display text-4xl font-extrabold tracking-[.25em]">{profile.inviteCode}</span>
            <button type="button" onClick={copyCode} className="flex h-14 items-center gap-2 rounded-full bg-surface px-4 text-lg font-bold">
              {copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />} {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </section>
      )}

      <section className="mt-8 space-y-4">
        <Field id="p-name" label={t('yourName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <Field id="p-phone" label={t('phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        {!isProvider && <Field id="p-address" label={t('customerAddress')} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}
      </section>

      {isProvider && (
        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-extrabold">{t('paymentDetails')}</h2>
          <Field id="p-zelle" label={`${t('zelle')} · ${t('zelleHelp')}`} value={zelle} onChange={(e) => setZelle(e.target.value)} autoCapitalize="none" />
          <Field id="p-venmo" label={`${t('venmo')} · ${t('venmoHelp')}`} value={venmo} onChange={(e) => setVenmo(e.target.value)} autoCapitalize="none" />
        </section>
      )}

      {!isProvider && (
        <section className="mt-8">
          <h2 className="mb-3 text-2xl font-extrabold">{t('yourGardener')}</h2>
          {profile.providerId ? (
            <p className="rounded-2xl bg-green-soft px-4 py-3 text-xl font-bold text-green-dark"><Check className="mr-2 inline" size={20} aria-hidden />{t('linked')}{providerProfile ? `: ${providerProfile.name}` : ''}</p>
          ) : (
            <LinkProvider />
          )}
        </section>
      )}

      <div className="mt-8 space-y-3">
        <Button onClick={save} icon={saved ? <Check aria-hidden /> : undefined}>{saved ? t('saved') : t('save')}</Button>
        <Button variant="ghost" onClick={() => navigate('/support')} icon={<LifeBuoy size={22} aria-hidden />}>{t('support')}</Button>
        <Button variant="ghost" onClick={signOut} icon={<LogOut size={22} aria-hidden />}>{t('signOut')}</Button>
      </div>

      <section className="mt-10 space-y-3 border-t border-line pt-6">
        {!confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={22} aria-hidden />}>{t('deleteAccount')}</Button>
        ) : (
          <div className="space-y-3 rounded-3xl bg-danger/10 p-5">
            <p className="text-lg font-bold text-danger">{t('deleteAccountHelp')}</p>
            {deleteError && <p role="alert" className="text-lg font-semibold text-danger">{deleteError}</p>}
            <Button
              variant="danger" disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                setDeleteError('')
                try { await deleteAccount() } catch { setDeleteError(t('somethingWrong')); setDeleting(false) }
              }}
            >{deleting ? t('loading') : t('deleteAccountConfirm')}</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
          </div>
        )}
      </section>
    </Screen>
  )
}
