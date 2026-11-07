import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { Loading } from '@/components/ui'
import LanguagePick from '@/pages/LanguagePick'
import Auth from '@/pages/Auth'
import Today from '@/pages/Today'
import CustomerHome from '@/pages/CustomerHome'
import Schedule from '@/pages/Schedule'
import NewJob from '@/pages/NewJob'
import JobPage from '@/pages/JobPage'
import Customers from '@/pages/Customers'
import NewCustomer from '@/pages/NewCustomer'
import Messages from '@/pages/Messages'
import Chat from '@/pages/Chat'
import Profile from '@/pages/Profile'
import Support from '@/pages/Support'
import Billing from '@/pages/Billing'
import NewInvoice from '@/pages/NewInvoice'
import InvoiceDetail from '@/pages/InvoiceDetail'
import InvoicePage from '@/pages/InvoicePage'

export default function App() {
  const { user, profile, lang, authReady, profileLoading, t, signOut } = useApp()
  const { pathname } = useLocation()
  const [picking, setPicking] = useState(false)
  const [stuck, setStuck] = useState(false)

  // A signed-in account whose profile never shows up (rare: sign-up was cut
  // off halfway) gets a way out instead of an endless spinner.
  useEffect(() => {
    if (!user || profile) { setStuck(false); return }
    const id = setTimeout(() => setStuck(true), 8000)
    return () => clearTimeout(id)
  }, [user, profile])

  if (!authReady) return <Loading label="Verde" />
  // A shared invoice link opens for anyone, signed in or not.
  if (pathname.startsWith('/invoice/')) return <Routes><Route path="/invoice/:id" element={<InvoicePage />} /></Routes>
  if (!lang || picking) return <LanguagePick onDone={() => setPicking(false)} />
  if (!user) return <Auth onChangeLanguage={() => setPicking(true)} />
  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
        <Loading label={profileLoading || !stuck ? t('loading') : t('somethingWrong')} />
        {stuck && <button type="button" onClick={signOut} className="rounded-full bg-sand px-6 py-3 text-lg font-bold">{t('signOut')}</button>}
      </div>
    )
  }

  const provider = profile.role === 'provider'
  return (
    <Routes>
      <Route path="/" element={provider ? <Today /> : <CustomerHome />} />
      <Route path="/job/:id" element={<JobPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/support" element={<Support />} />
      <Route path="/billing" element={<Billing />} />
      {provider && <Route path="/billing/new" element={<NewInvoice />} />}
      {provider && <Route path="/billing/:id" element={<InvoiceDetail />} />}
      <Route path="/chat" element={<Chat />} />
      <Route path="/chat/:customerId" element={<Chat />} />
      {provider && <Route path="/schedule" element={<Schedule />} />}
      {provider && <Route path="/jobs/new" element={<NewJob />} />}
      {provider && <Route path="/customers" element={<Customers />} />}
      {provider && <Route path="/customers/new" element={<NewCustomer />} />}
      {provider && <Route path="/customers/:id/edit" element={<NewCustomer />} />}
      {provider && <Route path="/messages" element={<Messages />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
