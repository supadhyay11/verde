import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { createJob, useCustomerBook } from '@/lib/data'
import { todayKey } from '@/lib/date'
import { ALL_TASKS, DEFAULT_TASKS } from '@/lib/tasks'
import type { TaskKey } from '@/lib/types'
import { Button, Empty, Field, Screen, cx } from '@/components/ui'

export default function NewJob() {
  const { profile, t, lang } = useApp()
  const navigate = useNavigate()
  const customers = useCustomerBook(profile?.uid)
  const [customerId, setCustomerId] = useState('')
  const [address, setAddress] = useState('')
  const [date, setDate] = useState(todayKey())
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('10:00')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState<TaskKey[]>(DEFAULT_TASKS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const customer = customers?.find((c) => c.id === customerId)

  function pick(id: string) {
    setCustomerId(id)
    const c = customers?.find((x) => x.id === id)
    if (c?.address && !address) setAddress(c.address)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !customer) return
    setBusy(true)
    setError('')
    try {
      await createJob({
        providerId: profile.uid, customer, address: address.trim(), date, startTime: start, endTime: end,
        description: description.trim(), descriptionLang: lang ?? 'en',
        tasks: ALL_TASKS.filter((k) => tasks.includes(k)),
      })
      navigate(date === todayKey() ? '/' : '/schedule')
    } catch {
      setError(t('somethingWrong'))
      setBusy(false)
    }
  }

  return (
    <Screen title={t('newJob')} back="/schedule" nav={false}>
      {customers && customers.length === 0 ? (
        <Empty
          title={t('noCustomers')}
          help={t('noCustomersHelp')}
          action={<Button variant="secondary" onClick={() => navigate('/customers/new')}>{t('addCustomer')}</Button>}
        />
      ) : (
        <form onSubmit={submit} className="space-y-5 pb-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="customer" className="block text-lg font-bold">{t('chooseCustomer')}</label>
            <select
              id="customer" value={customerId} onChange={(e) => pick(e.target.value)} required
              className="h-16 w-full rounded-2xl border-2 border-line bg-surface px-4 text-xl focus:border-green"
            >
              <option value="" disabled />
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Field id="address" label={t('jobAddress')} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" required />
          <Field id="date" label={t('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Field id="start" label={t('startTime')} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            <Field id="end" label={t('endTime')} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
          <Field id="desc" label={t('whatToDo')} placeholder={t('whatToDoPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} multiline />

          <fieldset>
            <legend className="mb-2 text-lg font-bold">{t('tasksToTick')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ALL_TASKS.map((k) => {
                const on = tasks.includes(k)
                return (
                  <button
                    key={k} type="button" aria-pressed={on}
                    onClick={() => setTasks(on ? tasks.filter((x) => x !== k) : [...tasks, k])}
                    className={cx('flex min-h-14 items-center gap-2 rounded-2xl px-3 text-left text-lg font-semibold', on ? 'bg-green-soft ring-2 ring-green' : 'bg-surface ring-1 ring-line')}
                  >
                    <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', on ? 'bg-green text-white' : 'ring-2 ring-line')}>{on && <Check size={16} aria-hidden />}</span>
                    {t(`task_${k}`)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">{error}</p>}
          <Button type="submit" disabled={busy || !customer || !address.trim() || tasks.length === 0}>{busy ? t('loading') : t('createJob')}</Button>
        </form>
      )}
    </Screen>
  )
}
