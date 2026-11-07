const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

// Referral program: a business shares its personal link
// (https://app.tadpool.app/signup?ref=CODE); when another pool pro signs up
// with it, BOTH businesses earn CREDIT_MONTHS free months.
//
// Everything lives in two server-only collections, written ONLY here with the
// Admin SDK (Firestore rules have no match for them, so clients can never read
// or write them directly - nobody can award themselves credit):
//
//   referralCodes/{CODE}          { businessId, ownerUid, createdAt }
//   referrals/{referredBusinessId}{ referrerBusinessId, referrerUid, referredBusinessId,
//                                   referredUid, code, creditMonthsEach, createdAt }
//
// TadPool's own subscription billing is not switched on yet (see the
// commented-out stripe-billing block in functions/index.js), so credits are a
// ledger: each referral records the months earned, and billing applies them
// when it goes live. The doc id of `referrals` is the REFERRED business, so a
// business can only ever be referred once.

const CREDIT_MONTHS = 3
const APP_URL = "https://app.tadpool.app"
// No 0/O/1/I/L so a code is easy to read out loud or type from a text.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 7
// A code can only be attached to a brand-new account, not an old one.
const MAX_ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000

function randomCode() {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

function normalizeCode(raw) {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : ""
}

function toMillis(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === "function") return ts.toMillis()
  return 0
}

/** The caller's profile, which must be a provider account that belongs to a business. */
async function getCaller(db, request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const snap = await db.collection("users").doc(uid).get()
  const data = snap.data()
  if (!snap.exists || data.role !== "provider" || !data.businessId) {
    throw new HttpsError("permission-denied", "Only a business account can use referrals.")
  }
  return { uid, profile: data, businessId: data.businessId }
}

/** Returns this business's referral code, creating one the first time. */
async function ensureCode(db, businessId, uid) {
  const existing = await db.collection("referralCodes").where("businessId", "==", businessId).limit(1).get()
  if (!existing.empty) return existing.docs[0].id

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode()
    try {
      // create() fails if the code already exists, so two businesses can never share one.
      await db.collection("referralCodes").doc(code).create({
        businessId,
        ownerUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      })
      return code
    } catch (err) {
      if (err.code !== 6 && !/already exists/i.test(String(err.message))) throw err
    }
  }
  throw new HttpsError("internal", "Couldn't create a referral code. Please try again.")
}

/**
 * The Referrals screen: this business's code + link, who has joined with it,
 * and the free months earned. Business admins only (same as Customers/Billing).
 */
exports.getMyReferral = onCall(async (request) => {
  const db = getFirestore()
  const { uid, profile, businessId } = await getCaller(db, request)
  if ((profile.businessRole || "admin") !== "admin") {
    throw new HttpsError("permission-denied", "Only a business admin can use referrals.")
  }

  const code = await ensureCode(db, businessId, uid)

  const joinedSnap = await db.collection("referrals").where("referrerBusinessId", "==", businessId).get()
  const joined = await Promise.all(
    joinedSnap.docs.map(async (d) => {
      const r = d.data()
      const biz = await db.collection("businesses").doc(r.referredBusinessId).get()
      return {
        businessName: (biz.exists && biz.data().name) || "A new pool business",
        joinedAt: toMillis(r.createdAt),
      }
    })
  )
  joined.sort((a, b) => b.joinedAt - a.joinedAt)

  // Was THIS business referred by someone? (Doc id is the referred business.)
  const mine = await db.collection("referrals").doc(businessId).get()

  return {
    code,
    link: `${APP_URL}/signup?ref=${code}`,
    creditMonthsEach: CREDIT_MONTHS,
    joined,
    monthsEarned: joined.length * CREDIT_MONTHS,
    referredByCreditMonths: mine.exists ? CREDIT_MONTHS : 0,
  }
})

/**
 * Called right after a new business signs up with a ?ref= code. Best-effort
 * from the client's side: any problem is returned as { ok: false, reason }
 * rather than thrown, so a bad or reused code can never block a sign-up.
 */
exports.recordReferral = onCall(async (request) => {
  const db = getFirestore()
  const { uid, profile, businessId } = await getCaller(db, request)

  const code = normalizeCode(request.data?.code)
  if (!code) return { ok: false, reason: "invalid-code" }

  // Only a brand-new account can be attached to a referral.
  const createdMs = toMillis(profile.createdAt)
  if (!createdMs || Date.now() - createdMs > MAX_ACCOUNT_AGE_MS) {
    return { ok: false, reason: "account-not-new" }
  }

  const codeSnap = await db.collection("referralCodes").doc(code).get()
  if (!codeSnap.exists) return { ok: false, reason: "invalid-code" }
  const { businessId: referrerBusinessId, ownerUid: referrerUid } = codeSnap.data()

  if (referrerBusinessId === businessId || referrerUid === uid) {
    return { ok: false, reason: "self-referral" }
  }
  // Same email on both sides is the same person signing up twice.
  const referrerSnap = await db.collection("users").doc(referrerUid).get()
  const referrerEmail = String((referrerSnap.exists && referrerSnap.data().email) || "").toLowerCase()
  if (referrerEmail && referrerEmail === String(profile.email || "").toLowerCase()) {
    return { ok: false, reason: "self-referral" }
  }

  try {
    // create() so a business can only be referred once, even if this is called twice.
    await db.collection("referrals").doc(businessId).create({
      referrerBusinessId,
      referrerUid,
      referredBusinessId: businessId,
      referredUid: uid,
      code,
      creditMonthsEach: CREDIT_MONTHS,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(String(err.message))) {
      return { ok: true, alreadyRecorded: true, creditMonths: CREDIT_MONTHS }
    }
    throw err
  }

  return { ok: true, creditMonths: CREDIT_MONTHS }
})
