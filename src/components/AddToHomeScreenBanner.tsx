import * as React from "react"
import { Download, Share, SquarePlus, X } from "lucide-react"
import { doc, serverTimestamp, updateDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/firebase-auth-context"
import { isImpersonatingSession } from "@/pages/ImpersonatePage"

/** Chrome/Android/desktop fire this event when the site is installable,
 * and calling .prompt() on it shows the browser's real native "Install"
 * dialog - a true one-tap install, no manual steps. Not part of the
 * standard DOM lib types, so this is typed by hand. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const IS_IOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

/** True when running inside the native Verde iOS/Android app shell rather
 * than a regular mobile browser. The native app can set either signal before
 * this page loads: a global `window.VERDE_NATIVE_APP = true`, or a custom
 * user-agent suffix containing "VerdeNativeApp". Needed because the native
 * app is just a WebView around this same site, so IS_IOS and the standalone
 * checks below are both true/false in ways that don't distinguish it from
 * mobile Safari - without this, the app told users to do something
 * (add the web app to their home screen) that made no sense since they
 * already have the real app installed. */
const IS_NATIVE_APP =
  (typeof window !== "undefined" && (window as unknown as { VERDE_NATIVE_APP?: boolean }).VERDE_NATIVE_APP === true) ||
  (typeof navigator !== "undefined" && /VerdeNativeApp/.test(navigator.userAgent)) ||
  // The iOS app is a Capacitor shell around this site, and Capacitor puts
  // its bridge object on the page, so this works without shipping a new
  // app build.
  (typeof window !== "undefined" &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true)

/** True once the app is actually running installed (standalone), on any
 * platform - this is the only reliable signal there is that someone has
 * completed the install. Safari on iOS also exposes the older
 * `navigator.standalone` boolean, which display-mode doesn't always
 * catch there. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

// Dismissing hides the banner only until the NEXT time the app is opened
// in a regular browser tab - sessionStorage rather than localStorage is
// what makes that happen automatically, since it clears itself between
// visits. That's the strongest nudge possible without being able to
// truly force an install: keep asking every session until it's actually
// done, but never block someone from using the app in the meantime.
const DISMISS_KEY = "verde-a2hs-dismissed"

export function AddToHomeScreenBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      return false
    }
  })
  const [installed, setInstalled] = React.useState(isStandalone())
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)

  React.useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    function handleAppInstalled() {
      setInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  // A web page can't tell which apps a phone has installed, so remember it
  // on the account instead: the first time someone opens Verde inside the
  // iOS app (or from the Home Screen), mark their profile. After that the
  // banner stays away on every device and in every browser tab, including
  // links opened from WhatsApp, text messages or other apps. Skipped for
  // admin preview, which is not that person using the app.
  const userId = user?.id
  const alreadyMarked = user?.appInstalled === true
  const impersonating = isImpersonatingSession()
  React.useEffect(() => {
    if (!userId || alreadyMarked || impersonating) return
    if (!IS_NATIVE_APP && !isStandalone()) return
    updateDoc(doc(db, "users", userId), { appInstalled: true, appInstalledAt: serverTimestamp() }).catch(() => {
      // Best-effort - worst case the banner shows in a browser tab once more.
    })
  }, [userId, alreadyMarked, impersonating])

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // sessionStorage may be unavailable (private browsing); dismissal
      // just won't stick across reloads in that case, which is fine.
    }
  }

  async function handleInstallClick() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "accepted") setInstalled(true)
    setInstallPrompt(null)
  }

  // Nothing to show once actually installed, or if this is a browser
  // (like desktop Safari/Firefox) that neither supports the native
  // install prompt nor is iOS Safari with its manual Share flow.
  if (IS_NATIVE_APP) return null
  // Admin preview is a support person looking at someone's account, and an
  // account already marked as using the app has no use for the nudge.
  if (impersonating || alreadyMarked) return null
  if (installed || dismissed) return null
  if (!IS_IOS && !installPrompt) return null

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-primary/5 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-primary">
          <SquarePlus className="size-4 shrink-0" /> Add Verde to your Home Screen
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {IS_IOS ? (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Tap <Share className="mx-0.5 inline size-3.5" /> Share, then "Add to Home Screen"
          - it opens instantly, full-screen, like any other app.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Opens instantly, full-screen, like any other app.
          </p>
          <Button size="sm" onClick={handleInstallClick}>
            <Download className="size-3.5" /> Install
          </Button>
        </div>
      )}
    </div>
  )
}
