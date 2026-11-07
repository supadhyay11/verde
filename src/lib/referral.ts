// Referral links look like https://verde-gardener-app.web.app/signup?ref=ABC1234.
// The code is remembered the moment someone lands with it (even if they
// browse around or come back later to sign up), and handed to the
// recordReferral Cloud Function right after their business account is
// created. See functions/referrals.js.

const STORAGE_KEY = "verde-ref"
// A code stops counting after this long without a sign-up.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function normalize(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : ""
}

/** Call once at app start: remembers a ?ref= code from the URL, if present. */
export function captureReferralFromUrl() {
  try {
    const code = normalize(new URLSearchParams(window.location.search).get("ref"))
    if (!code) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }))
  } catch {
    // Storage can be unavailable (private browsing); the link just won't be remembered.
  }
}

/** The remembered referral code, or "" if there isn't a recent one. */
export function getStoredReferral(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ""
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return ""
    return normalize(parsed.code)
  } catch {
    return ""
  }
}

export function clearStoredReferral() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** The text that goes with the link when someone shares it. */
export function referralMessage(link: string, months: number) {
  return `I use Verde to run my gardening business - scheduling, payments and service reports in one app. Sign up with my link and we both get ${months} more months free: ${link}`
}
