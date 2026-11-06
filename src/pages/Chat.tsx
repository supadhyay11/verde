import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Languages, Mic, Phone, Send } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { sendMessage, textFor, threadIdFor, useCustomers, useMessages } from '@/lib/data'
import { timeOfDay, todayKey, longDate } from '@/lib/date'
import { canDictate, dictate } from '@/lib/speech'
import type { ChatMessage } from '@/lib/types'
import { Empty, Pill, Screen, cx } from '@/components/ui'
import LinkProvider from './LinkProvider'

// One conversation. The gardener opens it from /chat/<customerId>; a customer
// opens /chat and always talks to their own gardener.
export default function Chat() {
  const { customerId } = useParams()
  const { profile, providerProfile, t } = useApp()
  const customers = useCustomers(profile?.role === 'provider' ? profile.uid : undefined)
  if (!profile) return null

  const isProvider = profile.role === 'provider'
  const providerId = isProvider ? profile.uid : profile.providerId
  const otherId = isProvider ? customerId : profile.providerId
  if (!providerId || !otherId) {
    return <Screen title={t('messages')}><LinkProvider /></Screen>
  }
  const customer = customers?.find((c) => c.uid === customerId)
  const other = isProvider
    ? { name: customer?.name ?? '…', language: customer?.language, phone: customer?.phone }
    : { name: providerProfile?.name ?? t('gardener'), language: providerProfile?.language, phone: providerProfile?.phone }
  const customerUid = isProvider ? otherId : profile.uid
  return <Conversation providerId={providerId} customerId={customerUid} other={other} back={isProvider ? '/messages' : '/'} />
}

function Conversation({
  providerId, customerId, other, back,
}: { providerId: string; customerId: string; other: { name: string; language?: 'en' | 'es'; phone?: string }; back: string }) {
  const { profile, t, lang } = useApp()
  const l = lang ?? 'en'
  const messages = useMessages(threadIdFor(providerId, customerId))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages?.length])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !profile || busy) return
    setBusy(true)
    setText('')
    try {
      await sendMessage({ providerId, customerId, senderId: profile.uid, text: body, lang: l })
    } catch {
      setText(body) // keep what they typed so nothing is lost
    } finally {
      setBusy(false)
    }
  }

  const otherLangLabel = other.language ? (other.language === 'es' ? t('langSpanish') : t('langEnglish')) : ''
  const differs = !!other.language && other.language !== l

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-bg">
      <Screenless
        title={other.name} back={back}
        right={<Pill tone="green"><Languages size={16} aria-hidden /> {t('autoTranslated')}</Pill>}
        phone={other.phone}
      />
      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
        {messages && messages.length === 0 && <Empty title={t('noMessages')} />}
        <ol className="space-y-3">
          {(messages ?? []).map((m, i) => (
            <Bubble key={m.id} m={m} prev={messages?.[i - 1]} mine={m.senderId === profile?.uid} l={l}
              sentNote={differs ? t('sentTranslated', { name: other.name, lang: otherLangLabel }) : ''} />
          ))}
        </ol>
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-bg px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <div className="flex min-h-14 flex-1 items-center gap-2 rounded-full bg-surface pl-5 pr-3 ring-2 ring-line focus-within:ring-green">
          <input
            value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeMessage')} aria-label={t('typeMessage')}
            maxLength={2000} autoComplete="off" enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent py-3 text-xl outline-none placeholder:text-muted/70"
          />
          {canDictate() && (
            <button
              type="button" aria-label={t('voice')}
              onClick={() => { setListening(true); dictate(l, (said) => setText((x) => (x ? `${x} ${said}` : said)), () => setListening(false)) }}
              className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', listening ? 'bg-green text-white' : 'text-green')}
            >
              <Mic size={22} aria-hidden />
            </button>
          )}
        </div>
        <button type="submit" disabled={!text.trim() || busy} aria-label={t('send')} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green text-white shadow-md active:bg-green-dark">
          <Send size={24} aria-hidden />
        </button>
      </form>
    </div>
  )
}

// The chat has its own bottom bar (the input), so it uses a bare header
// instead of the standard Screen with navigation.
function Screenless({ title, back, right, phone }: { title: string; back: string; right: React.ReactNode; phone?: string }) {
  return (
    <div className="border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to={back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand" aria-label="Back"><ArrowLeft size={22} aria-hidden /></Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold">{title}</h1>
        {right}
        {phone && (
          <a href={`tel:${phone}`} aria-label={phone} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-soft text-green-dark">
            <Phone size={20} aria-hidden />
          </a>
        )}
      </div>
    </div>
  )
}

function Bubble({ m, prev, mine, l, sentNote }: { m: ChatMessage; prev?: ChatMessage; mine: boolean; l: 'en' | 'es'; sentNote: string }) {
  const { t } = useApp()
  const when = m.createdAt?.toDate()
  const day = when ? todayKey(when) : todayKey()
  const prevDay = prev?.createdAt ? todayKey(prev.createdAt.toDate()) : null
  const shown = mine
    ? { text: m.text, translated: false, pending: false }
    : textFor(l, m.text, m.lang, m.translations)

  return (
    <>
      {day !== prevDay && (
        <li className="flex justify-center py-1" aria-hidden>
          <span className="rounded-full bg-sand px-4 py-1 text-sm font-bold tracking-wide text-muted">
            {day === todayKey() ? t('today') : longDate(day, l)}
          </span>
        </li>
      )}
      <li className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
        <div className={cx(
          'max-w-[85%] rounded-3xl px-4 py-3 text-xl leading-snug',
          mine ? 'rounded-br-lg bg-green text-white' : 'rounded-bl-lg bg-surface ring-1 ring-line',
        )}>
          <p className="break-words font-semibold">{shown.text}</p>
          {mine && sentNote && (
            <p className="mt-2 flex items-center gap-1.5 border-t border-white/30 pt-2 text-base opacity-95"><Check size={16} aria-hidden /> {sentNote}</p>
          )}
          {!mine && shown.translated && (
            <p className="mt-2 border-t border-line pt-2 text-base italic text-muted">{t('original')}: “{m.text}”</p>
          )}
          {!mine && shown.pending && !m.translationFailed && (
            <p className="mt-2 border-t border-line pt-2 text-base italic text-muted">{t('translationPending')}</p>
          )}
        </div>
        <span className="mt-1 px-2 text-sm text-muted">{when ? timeOfDay(when, l) : ''}{mine ? ` • ${t('you')}` : ''}</span>
      </li>
    </>
  )
}
