import type { Lang } from './types'

type Rec = {
  lang: string
  interimResults: boolean
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void
  onerror: () => void
  start: () => void
}
type Ctor = new () => Rec

function ctor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Dictation relies on the phone's speech recognition; hide the mic where it is missing. */
export function canDictate(): boolean {
  return typeof window !== 'undefined' && !!ctor()
}

export function dictate(lang: Lang, onText: (text: string) => void, onEnd: () => void) {
  const C = ctor()
  if (!C) return onEnd()
  const rec = new C()
  rec.lang = lang === 'es' ? 'es-US' : 'en-US'
  rec.interimResults = false
  rec.onresult = (e) => onText(Array.from(e.results).map((r) => r[0].transcript).join(' '))
  rec.onend = onEnd
  rec.onerror = onEnd
  rec.start()
}
