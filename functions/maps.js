const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { defineSecret } = require("firebase-functions/params")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

// Route map support (Google Maps Platform).
//
//   getMapsBrowserKey  - hands a signed-in business login the browser key the
//                        map screen needs. That key is "public" by design
//                        (Google only honours it from app.tadpool.app, set
//                        when the key was created), but it still lives in
//                        Secret Manager, never in the repo.
//   geocodeProperties  - turns customers' street addresses into map points
//                        (lat/lng on the property doc). Only addresses that
//                        have never been looked up, or whose address text has
//                        changed since, are sent to Google - so the free
//                        monthly allowance goes a very long way.
//
// Secrets (created once, see the setup command in the project notes):
//   MAPS_BROWSER_KEY   - Maps JavaScript API, restricted to app.tadpool.app
//   MAPS_GEOCODING_KEY - Geocoding API, server-side only
const MAPS_BROWSER_KEY = defineSecret("MAPS_BROWSER_KEY")
const MAPS_GEOCODING_KEY = defineSecret("MAPS_GEOCODING_KEY")

const MAX_PER_CALL = 25

async function requireProvider(db, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const snap = await db.collection("users").doc(uid).get()
  const user = snap.exists ? snap.data() : null
  if (!user || user.role !== "provider" || !user.businessId) {
    throw new HttpsError("permission-denied", "Only a business account can use the route map.")
  }
  return user
}

exports.getMapsBrowserKey = onCall({ secrets: [MAPS_BROWSER_KEY] }, async (request) => {
  await requireProvider(getFirestore(), request.auth?.uid)
  const key = (MAPS_BROWSER_KEY.value() || "").trim()
  return { key: key || null }
})

async function geocode(address, apiKey) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    new URLSearchParams({ address, key: apiKey, region: "us" }).toString()
  const res = await fetch(url)
  if (!res.ok) return { status: `HTTP_${res.status}` }
  const body = await res.json()
  if (body.status !== "OK" || !body.results?.length) {
    return { status: body.status || "UNKNOWN" }
  }
  const loc = body.results[0].geometry?.location
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
    return { status: "NO_LOCATION" }
  }
  return { status: "OK", lat: loc.lat, lng: loc.lng }
}

exports.geocodeProperties = onCall({ secrets: [MAPS_GEOCODING_KEY] }, async (request) => {
  const db = getFirestore()
  const caller = await requireProvider(db, request.auth?.uid)

  const ids = Array.isArray(request.data?.propertyIds)
    ? [...new Set(request.data.propertyIds.filter((x) => typeof x === "string" && x))].slice(0, MAX_PER_CALL)
    : []
  if (ids.length === 0) return { results: {} }

  const apiKey = (MAPS_GEOCODING_KEY.value() || "").trim()
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "The map isn't set up yet.")
  }

  const results = {}
  for (const id of ids) {
    const ref = db.collection("properties").doc(id)
    const snap = await ref.get()
    const p = snap.exists ? snap.data() : null
    // Only this business's own customers.
    if (!p || p.businessId !== caller.businessId) {
      results[id] = { status: "NOT_FOUND" }
      continue
    }
    const address = typeof p.address === "string" ? p.address.trim() : ""
    if (!address) {
      results[id] = { status: "NO_ADDRESS" }
      continue
    }
    if (typeof p.lat === "number" && typeof p.lng === "number" && p.geocodedFor === address) {
      results[id] = { status: "OK", lat: p.lat, lng: p.lng, cached: true }
      continue
    }
    try {
      const r = await geocode(address, apiKey)
      if (r.status === "OK") {
        await ref.update({
          lat: r.lat,
          lng: r.lng,
          geocodedFor: address,
          geocodeStatus: "OK",
          geocodedAt: FieldValue.serverTimestamp(),
        })
        results[id] = { status: "OK", lat: r.lat, lng: r.lng }
      } else {
        await ref.update({ geocodedFor: address, geocodeStatus: r.status })
        results[id] = { status: r.status }
      }
    } catch (err) {
      console.error("geocodeProperties failed for", id, err)
      results[id] = { status: "ERROR" }
    }
  }
  return { results }
})

// The business's own address as a map point - the start of each day's route.
// Cached on the business doc against the address text, like customers.
exports.geocodeBusiness = onCall({ secrets: [MAPS_GEOCODING_KEY] }, async (request) => {
  const db = getFirestore()
  const caller = await requireProvider(db, request.auth?.uid)
  const ref = db.collection("businesses").doc(caller.businessId)
  const snap = await ref.get()
  const b = snap.exists ? snap.data() : null
  const address = b && typeof b.address === "string" ? b.address.trim() : ""
  if (!address) return { status: "NO_ADDRESS" }
  if (typeof b.lat === "number" && typeof b.lng === "number" && b.geocodedFor === address) {
    return { status: "OK", lat: b.lat, lng: b.lng, cached: true }
  }
  const apiKey = (MAPS_GEOCODING_KEY.value() || "").trim()
  if (!apiKey) throw new HttpsError("failed-precondition", "The map isn't set up yet.")
  try {
    const r = await geocode(address, apiKey)
    if (r.status === "OK") {
      await ref.update({ lat: r.lat, lng: r.lng, geocodedFor: address, geocodeStatus: "OK" })
      return { status: "OK", lat: r.lat, lng: r.lng }
    }
    await ref.update({ geocodedFor: address, geocodeStatus: r.status })
    return { status: r.status }
  } catch (err) {
    console.error("geocodeBusiness failed", err)
    return { status: "ERROR" }
  }
})
