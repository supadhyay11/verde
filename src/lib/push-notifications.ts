import { doc, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore"
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging"
import { db, firebaseApp } from "@/lib/firebase"

// Generated once in the Firebase Console (Project Settings > Cloud
// Messaging > Web configuration > Web Push certificates > Generate key
// pair) and pasted into .env as VITE_FIREBASE_VAPID_KEY - see DEPLOY.md.
// It's a public key (safe to ship in the client bundle), just not
// something to guess at, so it's not hardcoded here like the rest of the
// Firebase config.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied"

export async function getPushSupport(): Promise<PushPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  if (!(await isSupported().catch(() => false))) return "unsupported"
  return Notification.permission as PushPermissionState
}

function tokenDocId(token: string) {
  // FCM tokens can contain characters like ":" that are valid in a
  // Firestore document ID, but encoding keeps this safe even if that ever
  // changes, and doubles as free de-duplication per device.
  return encodeURIComponent(token)
}

/**
 * Asks the browser for notification permission (if not already
 * granted/denied) and, once granted, registers this device's FCM token
 * under the signed-in user so Cloud Functions can push to it later. Meant
 * to be called from an explicit user action (a button tap), never
 * automatically on page load - an unprompted permission dialog is one of
 * the fastest ways to get an app's notifications turned off for good.
 */
export async function enablePushNotifications(uid: string): Promise<PushPermissionState> {
  const support = await getPushSupport()
  if (support === "unsupported") return support

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission as PushPermissionState

  if (!VAPID_KEY) {
    console.warn("VITE_FIREBASE_VAPID_KEY is not set - can't register for push yet.")
    return "default"
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
  const messaging = getMessaging(firebaseApp)
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })

  await setDoc(doc(db, "users", uid, "pushTokens", tokenDocId(token)), {
    token,
    platform: "web",
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
  })

  return "granted"
}

/** Removes this device's token, e.g. if someone turns notifications off. */
export async function disablePushNotifications(uid: string): Promise<void> {
  if (!VAPID_KEY) return
  const support = await getPushSupport()
  if (support === "unsupported") return
  try {
    const messaging = getMessaging(firebaseApp)
    const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js")
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration ?? undefined,
    }).catch(() => null)
    if (token) await deleteDoc(doc(db, "users", uid, "pushTokens", tokenDocId(token)))
  } catch {
    // Best-effort - if this fails the token just goes stale and the
    // Cloud Function will clean it up next time a send to it fails.
  }
}

/**
 * Shows a notification for messages that arrive while the app is already
 * open and focused - the service worker's onBackgroundMessage handler
 * only fires when the app is closed or backgrounded, so foreground
 * messages need to be surfaced manually. Call once, e.g. in AppShell.
 */
export async function listenForForegroundPush(onNotify?: (title: string, body: string) => void) {
  const support = await getPushSupport()
  if (support !== "granted") return () => {}
  const messaging = getMessaging(firebaseApp)
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || "Verde"
    const body = payload.notification?.body || ""
    onNotify?.(title, body)
    if (document.hidden) {
      new Notification(title, { body, icon: "/pwa-192x192.png" })
    }
  })
}
