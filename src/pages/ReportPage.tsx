import { useParams } from 'react-router-dom'
import { Check, MapPin } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { clock, longDate } from '@/lib/date'
import { textFor, useJob } from '@/lib/data'
import { translate } from '@/lib/i18n'
import { Card, Empty, Loading, Pill, Screen, cx } from '@/components/ui'

// The page behind a shared report link: read-only, no sign-in, in the
// customer's language (or the signed-in person's own language).
export default function ReportPage() {
  const { id } = useParams()
  const { user, lang } = useApp()
  const job = useJob(id)
  const l = user && lang ? lang : job?.customerLang ?? lang ?? 'en'
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(l, k, v)

  if (job === undefined) return <Loading label={t('loading')} />
  if (job === null || !job.reportSentAt) return <Screen title={t('appName')} nav={false}><Empty title={t('rptNotFound')} /></Screen>

  const note = job.note ? textFor(l, job.note, job.noteLang ?? 'en', job.noteTranslations) : null
  const doneCount = job.tasks.filter((x) => x.done).length

  return (
    <Screen title={job.providerName ? `${t('rptBy')} ${job.providerName}` : t('appName')} nav={false}>
      <Card>
        <Pill tone="green"><Check size={16} aria-hidden /> {t('done')}</Pill>
        <h2 className="mt-2 text-2xl font-extrabold">{longDate(job.date, l)}</h2>
        <p className="text-lg text-muted">{clock(job.startTime, l)} – {clock(job.endTime, l)}</p>
        <p className="mt-1 flex items-start gap-2 text-xl"><MapPin size={22} className="mt-0.5 shrink-0 text-green" aria-hidden /> <span className="break-words">{job.address}</span></p>
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

      {note && note.text && (
        <>
          <h2 className="mt-8 text-2xl font-extrabold">{t('noteForCustomer')}</h2>
          <p className="mt-3 rounded-3xl bg-surface p-4 text-xl ring-1 ring-line">
            {note.text}
            {note.translated && <span className="mt-2 block text-base italic text-muted">{t('original')}: “{job.note}”</span>}
          </p>
        </>
      )}
    </Screen>
  )
}
