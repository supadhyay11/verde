import type { Lang } from './types'

export function money(amount: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

/** "November 2026" / "noviembre de 2026" */
export function monthLabel(lang: Lang, d = new Date()): string {
  const s = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', year: 'numeric' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
