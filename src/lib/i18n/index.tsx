import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { ES } from "@/lib/i18n/es"
import { fill, setCurrentLang, type Lang, type Vars } from "@/lib/i18n/core"

export { getLang, tr, trIn, locale } from "@/lib/i18n/core"
export type { Lang }


const STORAGE_KEY = "verde-lang"

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === "en" || v === "es" ? v : null
  } catch {
    return null
  }
}

function browserLang(): Lang {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")
    ? "es"
    : "en"
}


interface I18nValue {
  lang: Lang
  /** Changes the language everywhere. For a signed-in person it is also
   * saved on their profile so it follows them to other devices. */
  setLang: (lang: Lang) => void
  /** t("English text") returns the Spanish text when the language is
   * Spanish, otherwise the English text. {name} placeholders are filled
   * from vars. */
  t: (text: string, vars?: Vars) => string
}

const I18nContext = React.createContext<I18nValue | undefined>(undefined)


export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUserProfile } = useAuth()
  const [local, setLocal] = React.useState<Lang>(() => {
    // An invite link can carry ?lang=es so a customer opens it in their language.
    try {
      const q = new URLSearchParams(window.location.search).get("lang")
      if (q === "en" || q === "es") {
        localStorage.setItem(STORAGE_KEY, q)
        return q
      }
    } catch {
      // ignore
    }
    return storedLang() ?? browserLang()
  })
  // A signed-in person's saved language wins over this device's choice.
  const lang: Lang = user?.language ?? local
  setCurrentLang(lang)

  // First time we see this account, remember the language they were using
  // (picked at sign-up or on the invite link) on their profile.
  const needsSave = !!user && !user.language
  React.useEffect(() => {
    if (needsSave) void updateUserProfile({ language: local }).catch(() => {})
  }, [needsSave, local, updateUserProfile])

  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = React.useCallback(
    (next: Lang) => {
      setLocal(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Private browsing - the choice still applies for this visit.
      }
      if (user) void updateUserProfile({ language: next }).catch(() => {})
    },
    [user, updateUserProfile]
  )

  const t = React.useCallback(
    (text: string, vars?: Vars) => fill(lang === "es" ? (ES[text] ?? text) : text, vars),
    [lang]
  )

  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider")
  return ctx
}

export function useT() {
  return useI18n().t
}

/** Small English | Español switch. */
export function LanguageToggle({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  const { lang, setLang } = useI18n()
  const base = "rounded-full px-3 py-1 text-xs font-bold transition-colors"
  const on = dark ? "bg-white text-[#14532D]" : "bg-primary text-primary-foreground"
  const off = dark ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      className={`inline-flex gap-0.5 rounded-full border p-0.5 ${dark ? "border-white/30" : "border-border bg-card"} ${className}`}
    >
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`${base} ${lang === l ? on : off}`}
        >
          {l === "en" ? "English" : "Español"}
        </button>
      ))}
    </div>
  )
}
