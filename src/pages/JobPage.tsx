import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Camera, Check, Copy, ExternalLink, Mic, MapPin, Send, Trash2, X } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { clock, longDate } from '@/lib/date'
import { deleteJobPhoto, patchJob, removeJob, textFor, uploadJobPhoto, useCustomerBook, useJob } from '@/lib/data'
import { translate } from '@/lib/i18n'
import { ORIGIN, smsLink } from '@/lib/invite'
import { compressImage } from '@/lib/image'
import { canDictate, dictate } from '@/lib/speech'
import type { Job, PhotoTag } from '@/lib/types'
import { Button, Card, Field, Loading, Pill, Screen, cx } from '@/components/ui'

const TAGS: PhotoTag[] = ['before', 'after', 'clean']

export default function JobPage() {
  const { id } = useParams()
  const { profile, t } = useApp()
  const job = useJob(id)
  if (job === undefined) return <Loading label={t('loading')} />
  if (job === null || !profile) return <Screen back="/"><p className="py-10 text-center text-xl text-muted">—</p></Screen>
  return profile.role === 'provider' ? <ProviderJob job={job} /> : <CustomerJob job={job} />
}

/* ---------------------------------------------------------------- provider */

function ProviderJob({ job }: { job: Job }) {
  const { t, lang, profile } = useApp()
  const l = lang ?? 'en'
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState(job.note ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const done = job.status === 'done'
  const doneCount = job.tasks.filter((x) => x.done).length

  async function toggle(i: number) {
    if (done) return
    await patchJob(job.id, { tasks: job.tasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)), status: job.status === 'pending' ? 'in_progress' : job.status })
  }

  async function addPhoto(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const small = await compressImage(file)
      const tag: PhotoTag = TAGS[Math.min(job.photos.length, 2)]
      const photo = await uploadJobPhoto(job, small, tag)
      await patchJob(job.id, { photos: [...job.photos, photo] })
    } catch {
      setError(t('somethingWrong'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removePhoto(i: number) {
    const p = job.photos[i]
    await patchJob(job.id, { photos: job.photos.filter((_, j) => j !== i) })
    await deleteJobPhoto(p.path)
  }

  async function cycleTag(i: number) {
    const next = TAGS[(TAGS.indexOf(job.photos[i].tag) + 1) % TAGS.length]
    await patchJob(job.id, { photos: job.photos.map((p, j) => (j === i ? { ...p, tag: next } : p)) })
  }

  async function sendReport() {
    setSending(true)
    setError('')
    try {
      await patchJob(job.id, {
        status: 'done',
        note: note.trim(),
        noteLang: l,
        providerName: profile?.name ?? '',
        reportSentAt: new Date(),
      })
      setSending(false) // stay here: the share link appears below
    } catch {
      setError(t('somethingWrong'))
      setSending(false)
    }
  }

  function startDictation() {
    setListening(true)
    dictate(l, (said) => setNote((n) => (n ? `${n} ${said}` : said)), () => setListening(false))
  }

  return (
    <Screen nav={false} title={job.customerName} back="/" right={done ? <Pill tone="green"><Check size={16} aria-hidden /> {t('done')}</Pill> : undefined}>
      <Card>
        <Pill tone="green">{job.status === 'done' ? t('done') : job.status === 'in_progress' ? t('inProgress') : t('pending')}</Pill>
        <h2 className="mt-2 text-2xl font-extrabold">{job.customerName}</h2>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
          target="_blank" rel="noreferrer"
          className="mt-1 flex items-start gap-2 text-xl text-green-dark underline"
        >
          <MapPin size={22} className="mt-0.5 shrink-0" aria-hidden /> <span className="break-words">{job.address}</span>
        </a>
        <p className="mt-1 text-lg text-muted">{longDate(job.date, l)} · {clock(job.startTime, l)} – {clock(job.endTime, l)}</p>
        {job.description && <p className="mt-2 text-xl">{job.description}</p>}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold">{t('jobTasks')}</h2>
        <Pill tone="green"><Check size={16} aria-hidden /> {t('progress', { done: doneCount, total: job.tasks.length })}</Pill>
      </div>
      <ul className="mt-3 space-y-3">
        {job.tasks.map((task, i) => (
          <li key={task.key}>
            <button
              type="button" onClick={() => toggle(i)} aria-pressed={task.done} disabled={done}
              className={cx('flex min-h-[4.5rem] w-full items-center gap-4 rounded-3xl bg-surface px-4 text-left text-2xl font-bold', task.done ? 'ring-[3px] ring-green/60' : 'ring-1 ring-line')}
            >
              <span className="flex-1">{t(`task_${task.key}`)}</span>
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', task.done ? 'bg-green text-white' : 'ring-2 ring-line')}>
                {task.done && <Check size={26} aria-hidden />}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-2xl font-extrabold">{t('photos')}</h2>
      {!done && (
        <>
          <input ref={fileRef} id="photo-input" type="file" accept="image/*" className="sr-only" onChange={(e) => addPhoto(e.target.files)} />
          <label
            htmlFor="photo-input"
            className={cx('mt-3 flex min-h-20 w-full cursor-pointer items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-green bg-green-soft text-2xl font-bold text-green-dark', uploading && 'opacity-60')}
          >
            <Camera aria-hidden /> {uploading ? t('uploading') : t('addPhoto')}
          </label>
        </>
      )}
      {job.photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {job.photos.map((p, i) => (
            <li key={p.path} className="relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
              <img src={p.url} alt={t(p.tag)} className="aspect-square w-full object-cover" loading="lazy" />
              <button type="button" disabled={done} onClick={() => cycleTag(i)} aria-label={t('changeTag')} className="block w-full py-1.5 text-center text-base font-bold">
                {t(p.tag)}
              </button>
              {!done && (
                <button type="button" onClick={() => removePhoto(i)} aria-label={t('removePhoto')} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white">
                  <X size={18} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold">{t('noteForCustomer')}</h2>
        {!done && canDictate() && (
          <button type="button" onClick={startDictation} className="flex h-12 items-center gap-2 rounded-full bg-surface px-4 text-lg font-bold ring-2 ring-line">
            <Mic size={20} className="text-green" aria-hidden /> {listening ? t('listening') : t('voice')}
          </button>
        )}
      </div>
      {done ? (
        <p className="mt-3 rounded-3xl bg-surface p-4 text-xl ring-1 ring-line">{job.note || '—'}</p>
      ) : (
        <div className="mt-3">
          <Field id="note" label={t('noteForCustomer')} multiline placeholder={t('notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}

      {!done ? (
        <div className="sticky bottom-0 -mx-5 mt-8 border-t border-line bg-bg/95 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Button onClick={sendReport} disabled={sending || uploading} icon={<Send size={22} aria-hidden />}>
            {sending ? t('sending') : t('sendReport')}
          </Button>
          <div className="mt-3">
            {confirmDelete ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="ghost" className="min-h-14 text-lg" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
                <Button variant="danger" className="min-h-14 text-lg" onClick={async () => { await removeJob(job.id); navigate('/') }}>{t('yesDelete')}</Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex w-full items-center justify-center gap-2 py-2 text-lg font-semibold text-danger">
                <Trash2 size={20} aria-hidden /> {t('deleteJob')}
              </button>
            )}
          </div>
          {confirmDelete && <p className="mt-2 text-center text-base text-muted">{t('deleteSure')}</p>}
        </div>
      ) : (
        <>
          <ShareReport job={job} />
          <ProviderPayment job={job} />
        </>
      )}
    </Screen>
  )
}

function ShareReport({ job }: { job: Job }) {
  const { t, profile } = useApp()
  const book = useCustomerBook(profile?.uid)
  const [copied, setCopied] = useState(false)
  const link = `${ORIGIN}/report/${job.id}`
  const lang = job.customerLang ?? 'en'
  const phone = book?.find((c) => c.id === job.customerId)?.phone
  const message = translate(lang, 'rptSms', { name: profile?.name ?? '', link })

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* link is in the text */ }
  }
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-2xl font-extrabold">{t('rptShare')}</h2>
      <p className="text-lg text-muted">{t('rptShareHelp')}</p>
      <Button onClick={() => { if (phone) window.location.href = smsLink(phone, message); else void copyLink() }} icon={<Send size={22} aria-hidden />}>{t('rptSend')}</Button>
      <Button variant="secondary" onClick={copyLink} icon={copied ? <Check size={22} aria-hidden /> : <Copy size={22} aria-hidden />}>{copied ? t('copied') : t('copy')}</Button>
    </section>
  )
}

function ProviderPayment({ job }: { job: Job }) {
  const { t } = useApp()
  const [amount, setAmount] = useState(job.payment.amount ?? '')
  const [method, setMethod] = useState<'zelle' | 'venmo'>(job.payment.method ?? 'zelle')
  const [pnote, setPnote] = useState(job.payment.note ?? '')
  const paid = job.payment.status === 'paid'

  return (
    <section className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extrabold">{t('payment')}</h2>
        <Pill tone={paid ? 'green' : 'neutral'}>{paid ? t('paid') : t('unpaid')}</Pill>
      </div>
      <Field id="amount" label={t('amount')} placeholder={t('amountPlaceholder')} inputMode="decimal" value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => patchJob(job.id, { 'payment.amount': amount.trim() })} disabled={paid} />
      <div className="grid grid-cols-2 gap-3">
        {(['zelle', 'venmo'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} disabled={paid}
            className={cx('min-h-16 rounded-2xl text-xl font-bold', method === m ? 'bg-green-soft text-green-dark ring-[3px] ring-green' : 'bg-surface ring-2 ring-line')}>
            {t(m)}
          </button>
        ))}
      </div>
      <Field id="pnote" label={t('paymentNote')} value={pnote} onChange={(e) => setPnote(e.target.value)} disabled={paid} />
      {paid ? (
        <Button variant="ghost" onClick={() => patchJob(job.id, { payment: { status: 'unpaid', amount: amount.trim() } })}>{t('markUnpaid')}</Button>
      ) : (
        <Button
          icon={<Check aria-hidden />}
          onClick={() => patchJob(job.id, { payment: { status: 'paid', method, amount: amount.trim(), note: pnote.trim(), paidAt: new Date() } })}
        >
          {t('markPaid')}
        </Button>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- customer */

function CustomerJob({ job }: { job: Job }) {
  const { t, lang, providerProfile } = useApp()
  const l = lang ?? 'en'
  const desc = textFor(l, job.description, job.descriptionLang, job.descriptionTranslations)
  const note = job.note ? textFor(l, job.note, job.noteLang ?? 'en', job.noteTranslations) : null
  const doneCount = job.tasks.filter((x) => x.done).length
  const paid = job.payment.status === 'paid'
  const [copied, setCopied] = useState('')

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      /* no clipboard permission: the text is on screen to select */
    }
  }

  return (
    <Screen nav={false} title={providerProfile?.name ?? t('gardener')} back="/">
      <Card>
        {job.status === 'done' ? <Pill tone="green"><Check size={16} aria-hidden /> {t('done')}</Pill> : <Pill>{job.status === 'in_progress' ? t('inProgress') : t('pending')}</Pill>}
        <h2 className="mt-2 text-2xl font-extrabold">{longDate(job.date, l)}</h2>
        <p className="text-lg text-muted">{clock(job.startTime, l)} – {clock(job.endTime, l)}</p>
        <p className="mt-1 flex items-start gap-2 text-xl"><MapPin size={22} className="mt-0.5 shrink-0 text-green" aria-hidden /> <span className="break-words">{job.address}</span></p>
        {desc.text && (
          <p className="mt-3 text-xl">
            {desc.text}
            {desc.translated && <span className="mt-1 block text-base italic text-muted">{t('original')}: “{job.description}”</span>}
          </p>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold">{t('jobTasks')}</h2>
        <Pill tone="green"><Check size={16} aria-hidden /> {t('progress', { done: doneCount, total: job.tasks.length })}</Pill>
      </div>
      <ul className="mt-3 space-y-2">
        {job.tasks.map((task) => (
          <li key={task.key} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-xl font-semibold ring-1 ring-line">
            <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', task.done ? 'bg-green text-white' : 'ring-2 ring-line')}>{task.done && <Check size={20} aria-hidden />}</span>
            {t(`task_${task.key}`)}
          </li>
        ))}
      </ul>

      {job.photos.length > 0 && (
        <>
          <h2 className="mt-8 text-2xl font-extrabold">{t('photos')}</h2>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {job.photos.map((p) => (
              <li key={p.path} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={t(p.tag)} className="aspect-square w-full object-cover" loading="lazy" /></a>
                <p className="py-1.5 text-center text-base font-bold">{t(p.tag)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {note && (
        <>
          <h2 className="mt-8 text-2xl font-extrabold">{t('noteForCustomer')}</h2>
          <p className="mt-3 rounded-3xl bg-surface p-4 text-xl ring-1 ring-line">
            {note.text}
            {note.pending && <span className="mt-1 block text-base text-muted">{t('translationPending')}</span>}
            {note.translated && <span className="mt-2 block text-base italic text-muted">{t('original')}: “{job.note}”</span>}
          </p>
        </>
      )}

      {job.status === 'done' && (
        <section className="mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold">{t('payment')}</h2>
            <Pill tone={paid ? 'green' : 'neutral'}>{paid ? t('paid') : t('unpaid')}</Pill>
          </div>
          {job.payment.amount && <p className="text-3xl font-extrabold">{job.payment.amount.startsWith('$') ? job.payment.amount : `$${job.payment.amount}`}</p>}
          {paid ? (
            <p className="text-xl">{t('paidWith', { method: job.payment.method ? t(job.payment.method) : '' })}</p>
          ) : providerProfile?.zelle || providerProfile?.venmo ? (
            <>
              <h3 className="text-xl font-bold">{t('howToPay')}</h3>
              {providerProfile?.zelle && (
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
                  <div className="min-w-0 flex-1"><p className="text-base font-bold text-muted">{t('zelle')}</p><p className="select-all break-all text-xl font-bold">{providerProfile.zelle}</p></div>
                  <button type="button" onClick={() => copy(providerProfile.zelle ?? '', 'z')} className="flex h-12 items-center gap-2 rounded-full bg-sand px-4 font-bold"><Copy size={18} aria-hidden /> {copied === 'z' ? t('copied') : t('copy')}</button>
                </div>
              )}
              {providerProfile?.venmo && (
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
                  <div className="min-w-0 flex-1"><p className="text-base font-bold text-muted">{t('venmo')}</p><p className="select-all break-all text-xl font-bold">@{providerProfile.venmo.replace(/^@/, '')}</p></div>
                  <a href={`https://venmo.com/${encodeURIComponent(providerProfile.venmo.replace(/^@/, ''))}`} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 rounded-full bg-sand px-4 font-bold"><ExternalLink size={18} aria-hidden /> {t('payWithVenmo')}</a>
                </div>
              )}
            </>
          ) : (
            <p className="text-lg text-muted">{t('noPaymentInfo')}</p>
          )}
        </section>
      )}
    </Screen>
  )
}
