import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from '@/lib/app-context'
import { rememberLang, savedLang } from '@/lib/i18n'

// An invite link (…/?code=ABC234&lang=es) opens straight in the customer's language.
try {
  const l = new URLSearchParams(window.location.search).get('lang')
  if ((l === 'en' || l === 'es') && !savedLang()) rememberLang(l)
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
