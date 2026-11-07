const crypto = require("crypto")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")
const { getAuth } = require("firebase-admin/auth")

// "Reset access" for a customer (property) whose login got stuck - most
// often a property marked claimed/Active whose login has no profile
// document any more, so the person can't sign in and can't sign up again.
// Keeps the property and everything linked to it (jobs, invoices,
// messages, history) exactly as is; only the sign-in link is cleared and
// a fresh invite code is issued.

const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // matches src/lib/firebase-auth-context.tsx

function randomInviteCode() {
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)]
  }
  return code
}

exports.resetCustomerAccess = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) throw new HttpsError("unauthenticated", "You must be signed in.")

  const propertyId = request.data?.propertyId
  if (typeof propertyId !== "string" || !propertyId) {
    throw new HttpsError("invalid-argument", "A propertyId is required.")
  }

  const db = getFirestore()
  const callerSnap = await db.collection("users").doc(callerUid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null
  if (!caller || caller.role !== "provider" || (caller.businessRole ?? "admin") !== "admin" || !caller.businessId) {
    throw new HttpsError("permission-denied", "Only a business admin can reset customer access.")
  }

  const propertyRef = db.collection("properties").doc(propertyId)
  const propertySnap = await propertyRef.get()
  if (!propertySnap.exists || propertySnap.data().businessId !== caller.businessId) {
    throw new HttpsError("not-found", "Customer not found.")
  }
  const property = propertySnap.data()

  // Work out which login(s) to clear: the recorded owner, plus any Auth
  // account on the customer's email that has no profile (an orphan from a
  // sign-up that never finished).
  const auth = getAuth()
  const candidates = new Set()
  if (property.ownerId) candidates.add(property.ownerId)
  if (typeof property.email === "string" && property.email.trim()) {
    try {
      const u = await auth.getUserByEmail(property.email.trim())
      candidates.add(u.uid)
    } catch (err) {
      if (err?.code !== "auth/user-not-found") console.error("resetCustomerAccess lookup", err)
    }
  }

  let loginsRemoved = 0
  for (const uid of candidates) {
    const userRef = db.collection("users").doc(uid)
    const userSnap = await userRef.get()
    if (userSnap.exists) {
      const u = userSnap.data()
      // Only ever touch this customer's own login - never a provider/admin
      // account or a login belonging to a different customer.
      if (u.role !== "owner" || u.businessId !== caller.businessId || (u.propertyId && u.propertyId !== propertyId)) {
        continue
      }
      await userRef.delete()
    }
    try {
      await auth.deleteUser(uid)
      loginsRemoved++
    } catch (err) {
      if (err?.code !== "auth/user-not-found") throw err
    }
  }

  // Retire the old invite code and issue a fresh one.
  if (property.inviteCode) {
    await db.collection("inviteCodes").doc(property.inviteCode).delete().catch(() => {})
  }
  const inviteCode = randomInviteCode()
  await db.collection("inviteCodes").doc(inviteCode).set({
    businessId: caller.businessId,
    propertyId,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
  })
  await propertyRef.update({ ownerId: null, claimed: false, inviteCode })

  return { inviteCode, loginsRemoved }
})
