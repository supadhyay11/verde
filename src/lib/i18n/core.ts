import { ES } from "@/lib/i18n/es"

export type Lang = "en" | "es"

export type Vars = Record<string, string | number>

export function fill(text: string, vars?: Vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

/** The language currently on screen, readable outside React (date helpers,
 * error messages built in plain functions). Kept in step by I18nProvider. */
let currentLang: Lang = "en"
export function setCurrentLang(l: Lang) {
  currentLang = l
}
export function getLang(): Lang {
  return currentLang
}
/** Translate into a specific language regardless of the screen language -
 * for messages written TO someone else (e.g. a report sent to a customer). */
export function trIn(lang: Lang, text: string, vars?: Vars): string {
  return fill(lang === "es" ? (ES[text] ?? text) : text, vars)
}

/** Locale for toLocale*String so dates and times follow the language. */
export function locale(): string | undefined {
  return currentLang === "es" ? "es-US" : undefined
}
/** Same as t() but usable anywhere, not just inside components. */
export function tr(text: string, vars?: Vars): string {
  return fill(currentLang === "es" ? (ES[text] ?? text) : text, vars)
}

