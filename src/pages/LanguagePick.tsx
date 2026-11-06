import { useState } from 'react'
import { ArrowRight, Check, Globe, Info, Languages, Leaf } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { cx } from '@/components/ui'
import type { Lang } from '@/lib/types'

// The one screen that is bilingual on purpose: nobody has picked yet.
export default function LanguagePick({ onDone }: { onDone?: () => void }) {
  const { chooseLang, lang } = useApp()
  const [pick, setPick] = useState<Lang>(lang ?? 'en')

  const options: Array<{ id: Lang; title: string; sub: string }> = [
    { id: 'en', title: 'English', sub: 'Inglés' },
    { id: 'es', title: 'Español', sub: 'Spanish' },
  ]

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-center gap-2 border-b border-line pb-4">
        <Leaf className="text-green" aria-hidden />
        <span className="font-display text-2xl font-extrabold text-green">Verde</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-soft px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-green-dark">
            <Languages size={18} aria-hidden /> Step 1 · Paso 1
          </span>
          <h1 className="text-3xl font-extrabold">Choose your language</h1>
          <p className="mt-1 text-2xl font-bold text-muted">Elige tu idioma</p>
        </div>

        <div role="radiogroup" aria-label="Language / Idioma" className="space-y-4">
          {options.map((o) => {
            const on = pick === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                lang={o.id}
                onClick={() => setPick(o.id)}
                className={cx(
                  'flex min-h-24 w-full items-center gap-4 rounded-3xl bg-surface px-5 text-left',
                  on ? 'ring-[3px] ring-green' : 'ring-2 ring-line',
                )}
              >
                <span className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', on ? 'bg-green-soft text-green' : 'bg-sand text-muted')}>
                  <Globe size={28} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-3xl font-extrabold">{o.title}</span>
                  <span className="block text-lg text-muted">{o.sub}</span>
                </span>
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-full', on ? 'bg-green text-white' : 'ring-2 ring-line')}>
                  {on && <Check size={24} aria-hidden />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="text-center text-muted">
          <p className="flex items-center justify-center gap-2 text-lg"><Info size={20} aria-hidden /> You can change this later</p>
          <p className="text-base">Puedes cambiarlo después en tu perfil</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { chooseLang(pick); onDone?.() }}
        className="flex min-h-20 w-full flex-col items-center justify-center rounded-3xl bg-green text-white shadow-lg active:bg-green-dark"
      >
        <span className="flex items-center gap-2 text-2xl font-extrabold">Continue <ArrowRight aria-hidden /></span>
        <span className="text-base font-medium opacity-90">Continuar</span>
      </button>
    </div>
  )
}
