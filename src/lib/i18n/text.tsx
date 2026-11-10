import { useI18n } from "@/lib/i18n"
import type { BilingualText } from "@/types"

/** Free text someone typed, shown in the reader's language. When it was
 * translated, the original wording stays visible underneath in small grey
 * text so nothing is lost in translation. */
export function pickText(original: string, tr: BilingualText | undefined, lang: "en" | "es") {
  const shown = tr?.[lang]?.trim()
  const differs = !!shown && shown !== original.trim()
  return { shown: differs ? shown : original, original: differs ? original : null }
}

export function BilingualNote({
  text,
  tr,
  className = "",
}: {
  text: string
  tr?: BilingualText
  className?: string
}) {
  const { lang } = useI18n()
  const { shown, original } = pickText(text, tr, lang)
  return (
    <>
      <p className={`whitespace-pre-wrap ${className}`}>{shown}</p>
      {original && (
        <p className="mt-0.5 text-[11px] whitespace-pre-wrap text-muted-foreground/70 italic">
          {original}
        </p>
      )}
    </>
  )
}
