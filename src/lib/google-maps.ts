import { httpsCallable } from "firebase/functions"
import { functions } from "@/lib/firebase"

// Loads the Google Maps JavaScript API once per page, using the browser key
// the server hands to signed-in business logins (see functions/maps.js). The
// key is never in the source code or the build.
//
// `google` has no bundled types here, and we only use a handful of calls
// (map, markers, one line), so it's typed loosely on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type MapsLoad =
  | { ok: true; google: any }
  | { ok: false; reason: "no-key" | "load-failed" }

let pending: Promise<MapsLoad> | null = null

export function loadGoogleMaps(): Promise<MapsLoad> {
  if (pending) return pending
  const attempt = (async (): Promise<MapsLoad> => {
    try {
      const res = await httpsCallable<unknown, { key: string | null }>(functions, "getMapsBrowserKey")({})
      const key = res.data?.key
      if (!key) return { ok: false, reason: "no-key" }

      const w = window as any
      if (w.google?.maps) return { ok: true, google: w.google }

      await new Promise<void>((resolve, reject) => {
        w.__verdeMapsReady = () => resolve()
        // Called by Google itself when the key is rejected (wrong site, API not enabled...).
        w.gm_authFailure = () => reject(new Error("maps auth failure"))
        const script = document.createElement("script")
        script.src =
          "https://maps.googleapis.com/maps/api/js?" +
          new URLSearchParams({ key, v: "weekly", callback: "__verdeMapsReady" }).toString()
        script.async = true
        script.onerror = () => reject(new Error("maps script failed"))
        document.head.appendChild(script)
      })
      return { ok: true, google: w.google }
    } catch {
      return { ok: false, reason: "load-failed" }
    }
  })()
  pending = attempt
  // A failed load isn't remembered, so reopening the map tries again.
  attempt.then((r) => {
    if (!r.ok && r.reason === "load-failed") pending = null
  })
  return attempt
}
