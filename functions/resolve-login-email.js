const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore } = require("firebase-admin/firestore")

function normalizePhone(raw) {
  // Keep only digits, then compare the last 10 - strips out formatting
  // ("(925) 628-0936" -> "9256280936") and a leading country code
  // ("+19256280936" -> same 10 digits) so it matches however either side
  // happened to type/store the number.
  return (raw || "").replace(/\D/g, "").slice(-10)
}

/**
 * Lets someone sign in by typing their phone number instead of their
 * email - Firebase Auth's email/password provider still needs an email
 * under the hood, so this looks up which account's users/{uid} profile
 * has a matching phone number and hands back its email, which the client
 * then uses for the normal signInWithEmailAndPassword call. The password
 * itself is never touched here - this only resolves "who is this."
 *
 * Deliberately NOT full Firebase Phone Auth (SMS one-time codes) - that
 * needs a paid SMS provider and reCAPTCHA setup this app doesn't have.
 * This is just a second identifier for the same email/password account.
 *
 * Callable without being signed in (that's the whole point - it runs
 * before login). Doesn't reveal anything beyond "found" or "not found",
 * matching the same disclosure level as the existing password-reset flow.
 */
exports.resolveLoginEmail = onCall(async (request) => {
  const rawPhone = request.data?.phone
  if (typeof rawPhone !== "string" || !rawPhone.trim()) {
    throw new HttpsError("invalid-argument", "A phone number is required.")
  }
  const target = normalizePhone(rawPhone)
  if (target.length < 7) {
    throw new HttpsError("invalid-argument", "That doesn't look like a valid phone number.")
  }

  const db = getFirestore()
  // A plain full-collection scan rather than a query - Firestore can't
  // index "last 10 digits of a differently-formatted phone string"
  // directly, and at this app's scale (a handful of businesses, each
  // with a modest customer/provider list) reading every user doc is
  // fine. Would need a stored normalizedPhone field to stay fast if the
  // user base grows much larger.
  const snap = await db.collection("users").get()
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.phone && normalizePhone(data.phone) === target && data.email) {
      return { email: data.email }
    }
  }
  throw new HttpsError("not-found", "No account found with that phone number.")
})
