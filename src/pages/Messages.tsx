import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { db } from '@/lib/firebase'
import { useCustomers } from '@/lib/data'
import { Card, Empty, Screen } from '@/components/ui'

interface ThreadSummary { customerId: string; lastText?: string; lastSenderId?: string }

// Gardener's inbox: one row per linked customer.
export default function Messages() {
  const { profile, t } = useApp()
  const customers = useCustomers(profile?.uid)
  const [threads, setThreads] = useState<Record<string, ThreadSummary>>({})

  useEffect(() => {
    if (!profile) return
    const q = query(collection(db, 'threads'), where('providerId', '==', profile.uid))
    return onSnapshot(q, (snap) => {
      const map: Record<string, ThreadSummary> = {}
      snap.docs.forEach((d) => { const x = d.data() as ThreadSummary; map[x.customerId] = x })
      setThreads(map)
    }, () => setThreads({}))
  }, [profile])

  return (
    <Screen title={t('messages')}>
      {customers === null && <p className="py-10 text-center text-xl text-muted">{t('loading')}</p>}
      {customers && customers.length === 0 && <Empty title={t('noChats')} help={t('noChatsProvider')} />}
      <ul className="space-y-3">
        {(customers ?? []).map((c) => (
          <li key={c.uid}>
            <Card to={`/chat/${c.uid}`} className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-soft text-xl font-extrabold text-green-dark">
                {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xl font-extrabold">{c.name}</span>
                <span className="block truncate text-lg text-muted">{threads[c.uid]?.lastText ?? '—'}</span>
              </span>
              <ChevronRight className="shrink-0 text-muted" aria-hidden />
            </Card>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
