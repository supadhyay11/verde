import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { patchJob, useJobs } from '@/lib/data'
import { greetingKey, longDate, todayKey } from '@/lib/date'
import JobCard from '@/components/JobCard'
import { Button, Empty, Pill, Screen } from '@/components/ui'

export default function Today() {
  const { profile, t, lang } = useApp()
  const navigate = useNavigate()
  const jobs = useJobs('provider', profile?.uid)
  const today = todayKey()
  const todays = useMemo(() => (jobs ?? []).filter((j) => j.date === today), [jobs, today])
  const nextId = todays.find((j) => j.status !== 'done')?.id
  const first = (profile?.name ?? '').split(' ')[0]
  const greet = { morning: t('goodMorning'), afternoon: t('goodAfternoon'), evening: t('goodEvening') }[greetingKey()]

  async function start(id: string, status: string) {
    if (status === 'pending') await patchJob(id, { status: 'in_progress' })
    navigate(`/job/${id}`)
  }

  return (
    <Screen>
      <p className="text-lg font-semibold text-muted">{longDate(today, lang ?? 'en')}</p>
      <h2 className="text-4xl font-extrabold leading-tight">{greet}, {first}</h2>

      <div className="mt-5 flex items-center justify-between rounded-2xl bg-sand px-4 py-3">
        <span className="text-2xl font-extrabold">{t('todaysJobs')}</span>
        {jobs && todays.length > 0 && <Pill tone="solid">{todays.length === 1 ? t('jobCountOne') : t('jobsCount', { n: todays.length })}</Pill>}
      </div>

      <div className="mt-4 space-y-4">
        {jobs === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
        {jobs && todays.length === 0 && (
          <Empty title={t('noJobsToday')} help={t('noJobsTodayHelp')}
            action={<Button onClick={() => navigate('/jobs/new')} icon={<Plus aria-hidden />}>{t('addJob')}</Button>} />
        )}
        {todays.map((job, i) => (
          <JobCard key={job.id} job={job} index={i + 1} role="provider" highlight={job.id === nextId} onStart={() => start(job.id, job.status)} />
        ))}
      </div>
    </Screen>
  )
}
