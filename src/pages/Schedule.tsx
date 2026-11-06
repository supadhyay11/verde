import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { patchJob, useJobs } from '@/lib/data'
import { todayKey } from '@/lib/date'
import JobCard from '@/components/JobCard'
import { Button, Empty, Screen } from '@/components/ui'

export default function Schedule() {
  const { profile, t } = useApp()
  const navigate = useNavigate()
  const jobs = useJobs('provider', profile?.uid)
  const today = todayKey()
  const upcoming = (jobs ?? []).filter((j) => j.date >= today && !(j.date === today && j.status === 'done'))

  async function start(id: string, status: string) {
    if (status === 'pending') await patchJob(id, { status: 'in_progress' })
    navigate(`/job/${id}`)
  }

  return (
    <Screen title={t('schedule')}>
      <Button onClick={() => navigate('/jobs/new')} icon={<Plus aria-hidden />}>{t('addJob')}</Button>
      <h2 className="mb-3 mt-6 text-2xl font-extrabold">{t('upcoming')}</h2>
      <div className="space-y-4">
        {jobs === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
        {jobs && upcoming.length === 0 && <Empty title={t('noUpcoming')} help={t('noUpcomingHelp')} />}
        {upcoming.map((job) => (
          <JobCard key={job.id} job={job} role="provider" showDate onStart={() => start(job.id, job.status)} />
        ))}
      </div>
    </Screen>
  )
}
