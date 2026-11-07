import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { useInvoices } from '@/lib/data'
import { money } from '@/lib/money'
import { Button, Card, Empty, Pill, Screen } from '@/components/ui'

// Provider: all invoices they made. Customer: the invoices addressed to them.
export default function Billing() {
  const { profile, lang, t } = useApp()
  const navigate = useNavigate()
  const isProvider = profile?.role === 'provider'
  const invoices = useInvoices(profile?.role, profile?.uid)
  const owed = (invoices ?? []).filter((i) => i.status === 'unpaid').reduce((sum, i) => sum + i.amount, 0)
  const l = lang ?? 'en'

  return (
    <Screen title={t('billing')}>
      {isProvider && <Button onClick={() => navigate('/billing/new')} icon={<Plus aria-hidden />}>{t('newInvoice')}</Button>}
      {(invoices?.length ?? 0) > 0 && (
        <div className="mt-5 rounded-3xl bg-green-soft p-5">
          <p className="text-base font-semibold text-green-dark">{t('invOwed')}</p>
          <p className="text-4xl font-extrabold text-green-dark">{money(owed, l)}</p>
        </div>
      )}
      <div className="mt-6 space-y-3">
        {invoices === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
        {invoices && invoices.length === 0 && (
          <Empty title={t('invNoInvoices')} help={isProvider ? t('invNoInvoicesHelp') : t('invNoInvoicesCustomer')} />
        )}
        {(invoices ?? []).map((i) => (
          <Card key={i.id} to={isProvider ? `/billing/${i.id}` : `/invoice/${i.id}`} className="flex items-center gap-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xl font-extrabold">{isProvider ? i.customerName : i.providerName}</span>
              <span className="block truncate text-lg text-muted">#{i.number} · {i.period}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="text-xl font-extrabold">{money(i.amount, l)}</span>
              <Pill tone={i.status === 'paid' ? 'green' : 'neutral'}>{i.status === 'paid' ? t('paid') : t('unpaid')}</Pill>
            </span>
            <ChevronRight className="shrink-0 text-muted" aria-hidden />
          </Card>
        ))}
      </div>
    </Screen>
  )
}
