const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getAuth } = require("firebase-admin/auth")
const { getFirestore } = require("firebase-admin/firestore")

// Fixing a mistyped email.
//
//   changeMyUnverifiedEmail - the signed-in person fixes their OWN email, but
//     only while it's still unverified (e.g. a typo at sign-up that sent the
//     code to the wrong inbox). A verified email is never changed this way.
//   adminChangeUserEmail    - a platform admin (users/{uid}.role == "admin")
//     changes any provider account's email, e.g. when someone asks support.
//     The new address starts out unverified, so the person confirms it with a
//     code on their next sign-in.
//
// Both update the Firebase Auth account AND users/{uid}.email, and clear any
// pending code so the next one goes to the new address.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_SELF_CHANGES_PER_HOUR = 3
const HOUR_MS = 60 * 60 * 1000

function cleanEmail(raw) {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email) || email.length > 254 || email.endsWith(".internal")) {
    throw new HttpsError("invalid-argument", "That email address looks invalid.")
  }
  return email
}

async function applyEmailChange(uid, email) {
  const auth = getAuth()
  const db = getFirestore()
  try {
    const existing = await auth.getUserByEmail(email)
    if (existing.uid !== uid) {
      throw new HttpsError("already-exists", "An account with that email already exists.")
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err
    if (err?.code !== "auth/user-not-found") throw err
  }
  await auth.updateUser(uid, { email, emailVerified: false })
  await db.collection("users").doc(uid).update({ email })
  await db.collection("emailCodes").doc(uid).delete().catch(() => {})
}

exports.changeMyUnverifiedEmail = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const email = cleanEmail(request.data?.email)

  const db = getFirestore()
  const profileSnap = await db.collection("users").doc(uid).get()
  if (!profileSnap.exists || profileSnap.data().role !== "provider") {
    throw new HttpsError("permission-denied", "Only a business account can change its email here.")
  }
  const user = await getAuth().getUser(uid)
  if (user.emailVerified) {
    throw new HttpsError("failed-precondition", "This email is already verified. Contact support to change it.")
  }
  if (user.email === email) return { ok: true, email, unchanged: true }

  // A few changes an hour is plenty for fixing a typo and stops abuse.
  const limitRef = db.collection("emailChanges").doc(uid)
  const limitSnap = await limitRef.get()
  const now = Date.now()
  let { count = 0, windowStart = now } = limitSnap.exists ? limitSnap.data() : {}
  if (now - windowStart > HOUR_MS) {
    count = 0
    windowStart = now
  }
  if (count >= MAX_SELF_CHANGES_PER_HOUR) {
    throw new HttpsError("resource-exhausted", "Too many changes. Please try again in a little while.")
  }

  await applyEmailChange(uid, email)
  await limitRef.set({ count: count + 1, windowStart })
  return { ok: true, email }
})

exports.adminChangeUserEmail = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const db = getFirestore()
  const callerSnap = await db.collection("users").doc(callerUid).get()
  if (!callerSnap.exists || callerSnap.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only an admin account can change another user's email.")
  }

  const targetUid = request.data?.uid
  if (typeof targetUid !== "string" || !targetUid) {
    throw new HttpsError("invalid-argument", "Provide the account to change.")
  }
  const email = cleanEmail(request.data?.email)

  const targetSnap = await db.collection("users").doc(targetUid).get()
  if (!targetSnap.exists || targetSnap.data().role !== "provider") {
    throw new HttpsError("failed-precondition", "That isn't a provider account.")
  }
  if (String(targetSnap.data().email || "").endsWith(".internal")) {
    throw new HttpsError("failed-precondition", "That technician signs in by phone and has no email.")
  }

  await applyEmailChange(targetUid, email)
  console.log(`adminChangeUserEmail: ${callerUid} changed email for ${targetUid}`)
  return { ok: true, email }
})
