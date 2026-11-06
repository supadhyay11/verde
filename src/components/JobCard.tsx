import { Check, Clock, Eye, MapPin, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { clock, shortDate } from '@/lib/date'
import { textFor } from '@/lib/data'
import type { Job } from '@/lib/types'
import { Pill, cx } from './ui'

export function statusPill(job: Job, t: ReturnType<typeof useApp>['t']) {
  if (job.status === 'done') return <Pill tone="green"><Check size={16} aria-hidden /> {t('done')}</Pill>
  if (job.status === 'in_progress') return <Pill tone="green">{t('inProgress')}</Pill>
  return <Pill>{t('pending')}</Pill>
}

/**
 * One job. `highlight` marks the next job of the day (green border, primary
 * Start button). `onStart` is only passed for provider screens.
 */
export default function JobCard({
  job, highlight, index, showDate, onStart, role,
}: {
  job: Job; highlight?: boolean; index?: number; showDate?: boolean; onStart?: () => void; role: 'provider' | 'customer'
}) {
  const { t, lang } = useApp()
  const l = lang ?? 'en'
  const desc = textFor(l, job.description, job.descriptionLang, job.descriptionTranslations)
  const done = job.status === 'done'
  const who = role === 'provider' ? job.customerName : null
  return (
    <article className={cx(
      'rounded-3xl bg-surface p-5 shadow-sm',
      highlight ? 'ring-[3px] ring-green' : done ? 'border-2 border-dashed border-line bg-bg' : 'border border-line',
    )}>
      <div className="flex items-center justify-between gap-3">
        {highlight && job.status !== 'done'
          ? <Pill tone="green"><Play size={14} aria-hidden /> {t('nextJob')}</Pill>
          : statusPill(job, t)}
        {index !== undefined && <span className="text-lg font-bold text-muted">#{index}</span>}
        {showDate && <span className="text-base font-bold text-muted">{shortDate(job.date, l)}</span>}
      </div>

      {who && <h3 className={cx('mt-3 text-2xl font-extrabold', done && 'text-muted line-through')}>{who}</h3>}
      {desc.text && <p className={cx('mt-1 text-xl', done ? 'text-muted' : 'text-ink/80')}>{desc.text}</p>}

      <ul className="mt-3 space-y-2 rounded-2xl bg-sand/70 p-3 text-xl">
        <li className="flex items-start gap-2"><MapPin size={22} className="mt-0.5 shrink-0 text-green" aria-hidden /> <span className="min-w-0 break-words">{job.address}</span></li>
        <li className="flex items-center gap-2"><Clock size={22} className="shrink-0 text-green" aria-hidden /> {clock(job.startTime, l)} – {clock(job.endTime, l)}</li>
      </ul>

      <div className="mt-4">
        {role === 'provider' && !done && onStart ? (
          highlight ? (
            <button type="button" onClick={onStart} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green text-xl font-bold text-white shadow-md active:bg-green-dark">
              <Play size={20} aria-hidden /> {job.status === 'in_progress' ? t('continueJob') : t('startJob')}
            </button>
          ) : (
            <Link to={`/job/${job.id}`} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-sand text-xl font-bold">
              <Eye size={20} aria-hidden /> {t('viewDetails')}
            </Link>
          )
        ) : (
          <Link to={`/job/${job.id}`} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-sand text-xl font-bold">
            <Eye size={20} aria-hidden /> {done ? t('viewReport') : t('viewDetails')}
          </Link>
        )}
      </div>
    </article>
  )
}
