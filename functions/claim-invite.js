const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

/**
 * Finishes an owner (customer) sign-up: validates the invite code, creates
 * the users/{uid} profile, marks the property claimed, and marks the invite
 * used - all in one server-side Firestore transaction.
 *
 * WHY THIS EXISTS: the previous client-side flow did these same four steps
 * as separate awaited Firestore calls straight from the browser
 * (setDoc users/{uid}, then updateDoc properties/{propertyId}). The
 * properties update rule needs to look up the caller's own role/businessId
 * via a security-rule get() on users/{uid} - and Firestore's own docs note
 * that get()/exists() reads inside security rules aren't guaranteed to see
 * a write from earlier in the very same request sequence. In practice that
 * showed up as real customers getting "Missing or insufficient permissions"
 * (surfaced to them as "insufficient privilege") right after signing up,
 * even though the invite code and property were both completely valid -
 * confirmed happening to EverClearPools customer Zander Sprague.
 *
 * Running the whole claim as one Admin SDK transaction sidesteps security
 * rules entirely (this function IS the trusted server context) and makes
 * the four writes atomic - either the whole sign-up completes, or none of
 * it does, with no possibility of a half-claimed property or an orphaned
 * profile doc.
 */
exports.claimInvite = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.")
  }

  const rawCode = request.data?.code
  const name = request.data?.name
  const email = request.data?.email
  const phone = typeof request.data?.phone === "string" && request.data.phone.trim()
    ? request.data.phone.trim()
    : null

  if (typeof rawCode !== "string" || !rawCode.trim()) {
    throw new HttpsError("invalid-argument", "An invite code is required.")
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new HttpsError("invalid-argument", "A name is required.")
  }
  if (typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "An email is required.")
  }

  const code = rawCode.trim().toUpperCase()
  const db = getFirestore()
  const inviteRef = db.collection("inviteCodes").doc(code)
  const userRef = db.collection("users").doc(uid)

  try {
    return await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef)
      if (!inviteSnap.exists || inviteSnap.data().used) {
        throw new HttpsError(
          "failed-precondition",
          "That invite code is invalid or has already been used. Double-check it with your pool service provider."
        )
      }
      const invite = inviteSnap.data()
      const { businessId, propertyId } = invite

      const propertyRef = db.collection("properties").doc(propertyId)
      const propertySnap = await tx.get(propertyRef)
      if (!propertySnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "That invite code no longer has a matching account. Ask your pool service provider for a new invite."
        )
      }
      // SECURITY: an invite must only ever unlock a property of the SAME
      // business that issued it. Without this, a provider could mint an
      // invite pointing at another business's (unclaimed) customer record
      // and take it over by "claiming" it.
      if (propertySnap.data().businessId !== businessId) {
        throw new HttpsError(
          "failed-precondition",
          "That invite code is invalid or has already been used. Double-check it with your pool service provider."
        )
      }
      if (propertySnap.data().ownerId) {
        throw new HttpsError(
          "failed-precondition",
          "That invite code has already been claimed. Ask your pool service provider for a new invite."
        )
      }

      tx.set(userRef, {
        businessId,
        role: "owner",
        name: name.trim(),
        email: email.trim(),
        phone,
        propertyId,
        createdAt: FieldValue.serverTimestamp(),
      })
      tx.update(propertyRef, { ownerId: uid, claimed: true })
      tx.update(inviteRef, { used: true })

      return { businessId, propertyId }
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    console.error("claimInvite failed", err)
    throw new HttpsError(
      "internal",
      "Something went wrong finishing your sign-up. Please try again, and if it keeps happening let your pool service provider know."
    )
  }
})
