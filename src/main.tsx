import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth-context'
import { I18nProvider } from '@/lib/i18n'
import { captureReferralFromUrl } from '@/lib/referral'

// Remember a ?ref= referral code from the link the moment the app opens.
captureReferralFromUrl()

// The PWA plugin's auto-injected registerSW.js only registers the
// service worker - it doesn't reload the page once a NEW version
// actually takes over. Since this is a single-page app with no real
// page navigations between screens, that meant a fresh deploy would
// install silently in the background on someone's first reopen of the
// installed app, but still show the OLD cached screens that whole
// session - it took a second full close-and-reopen before the new
// version was actually in control. Forcing a reload the moment a new
// worker takes control (controllerchange) collapses that down to a
// single reopen: whatever's newest on the server is what shows up.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
