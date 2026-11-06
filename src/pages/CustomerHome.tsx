import { useApp } from '@/lib/app-context'
import { useJobs } from '@/lib/data'
import JobCard from '@/components/JobCard'
import { Empty, Screen } from '@/components/ui'
import LinkProvider from './LinkProvider'

export default function CustomerHome() {
  const { profile, providerProfile, t } = useApp()
  const jobs = useJobs('customer', profile?.uid)
  const first = (profile?.name ?? '').split(' ')[0]

  return (
    <Screen>
      <h2 className="text-4xl font-extrabold leading-tight">{first}</h2>
      {providerProfile && <p className="mt-1 text-xl text-muted">{t('yourGardener')}: <strong className="text-ink">{providerProfile.name}</strong></p>}

      {!profile?.providerId ? (
        <div className="mt-6"><LinkProvider /></div>
      ) : (
        <>
          <h2 className="mb-3 mt-6 text-2xl font-extrabold">{t('latestReports')}</h2>
          <div className="space-y-4">
            {jobs === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
            {jobs && jobs.length === 0 && <Empty title={t('noCustomerJobs')} help={t('noCustomerJobsHelp')} />}
            {(jobs ?? []).map((job) => <JobCard key={job.id} job={job} role="customer" showDate />)}
          </div>
        </>
      )}
    </Screen>
  )
}
