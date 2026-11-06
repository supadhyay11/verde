import type { Lang } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

const locale = (lang: Lang) => (lang === 'es' ? 'es-US' : 'en-US')

export function longDate(key: string, lang: Lang): string {
  const s = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', month: 'long', day: 'numeric' }).format(parseKey(key))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortDate(key: string, lang: Lang): string {
  const s = new Intl.DateTimeFormat(locale(lang), { weekday: 'short', month: 'short', day: 'numeric' }).format(parseKey(key))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function clock(hhmm: string, lang: Lang): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0)
  return new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit' }).format(d)
}

export function timeOfDay(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function greetingKey(d = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}
