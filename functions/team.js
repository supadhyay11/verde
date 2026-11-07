const crypto = require("crypto")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")
const { getAuth } = require("firebase-admin/auth")
const { assertRoomForTechnician } = require("./plans")

/**
 * Team management for a business: an "admin" (businessRole) can add
 * technician (or additional admin) logins under their own business,
 * change a teammate's role, or remove one. See BusinessRole in
 * src/types/index.ts and the myBusinessRole()/isBizAdmin() helpers in
 * firestore.rules for the client-side half of this.
 *
 * All three callables run as the Admin SDK (bypasses security rules) and
 * do their own permission check first: the caller must be a signed-in
 * "provider" role account whose OWN businessRole is "admin" (missing
 * businessRole defaults to "admin" - every business created before this
 * feature shipped had exactly one login and it could do everything).
 * That's deliberate: letting a technician create/edit/remove teammates
 * client-side, even through a tightly-scoped Firestore rule, is a much
 * easier place to get a privilege-escalation bug wrong than checking it
 * once, here, in trusted server code.
 */

function randomTempPassword() {
  // Only used when the admin doesn't type their own password - see
  // createTechnician below. Avoids visually-ambiguous characters since
  // it'll likely be read off a phone screen or texted by hand.
  // crypto.randomInt, not Math.random - this is a real login password.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < 12; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)]
  }
  return out
}

function normalizePhoneDigits(raw) {
  return (raw || "").replace(/\D/g, "")
}

// Firebase Auth's email/password sign-in provider always needs an email
// under the hood, even for an account that's meant to sign in by phone
// number (see resolveLoginEmail.js - the client resolves a typed phone
// number to this same synthetic address, then signs in with it and the
// password normally). ".internal" is not a real, resolvable domain -
// nothing is ever sent there - so this can never collide with, or
// accidentally email, a real address. It's deterministic from the
// phone's digits, so re-adding the same phone number reliably hits
// Firebase's "email already exists" error instead of silently creating
// a second, confusing account for the same person.
function syntheticEmailForPhone(phone) {
  const digits = normalizePhoneDigits(phone)
  return `tech-${digits}@technicians.tadpool.internal`
}

async function requireCallingAdmin(db, callerUid) {
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in.")
  }
  const callerSnap = await db.collection("users").doc(callerUid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null
  if (!caller || caller.role !== "provider") {
    throw new HttpsError("permission-denied", "Only a business account can manage a team.")
  }
  const callerBusinessRole = caller.businessRole ?? "admin"
  if (callerBusinessRole !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only a business admin can manage the team."
    )
  }
  return caller
}

exports.createTechnician = onCall(async (request) => {
  const db = getFirestore()
  const caller = await requireCallingAdmin(db, request.auth?.uid)
  // Plan limit (Pro: 3, Premium: 10). Checked here, on the server, so it
  // can't be skipped from the app. See plans.js.
  await assertRoomForTechnician(db, caller.businessId)

  const name = typeof request.data?.name === "string" ? request.data.name.trim() : ""
  const rawEmail = typeof request.data?.email === "string" ? request.data.email.trim() : ""
  const rawPhone = typeof request.data?.phone === "string" ? request.data.phone.trim() : ""
  const businessRole = request.data?.businessRole === "admin" ? "admin" : "technician"

  if (!name) throw new HttpsError("invalid-argument", "A name is required.")
  if (!rawEmail && !rawPhone) {
    throw new HttpsError("invalid-argument", "An email or phone number is required.")
  }
  if (rawPhone && normalizePhoneDigits(rawPhone).length < 7) {
    throw new HttpsError("invalid-argument", "That doesn't look like a valid phone number.")
  }

  // The admin can type their own password for the new teammate, or leave
  // it blank to get a random one generated here - either way it comes
  // back in the response so it can be shared with them once.
  const requestedPassword =
    typeof request.data?.password === "string" ? request.data.password : ""
  if (requestedPassword && requestedPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Password should be at least 6 characters.")
  }
  const password = requestedPassword || randomTempPassword()

  // Signing in by email is the normal case; signing in by phone reuses
  // the same synthetic-email trick the client already uses to resolve a
  // typed phone number to an account (see resolveLoginEmail.js) - the
  // technician still ends up with a real Firebase Auth email/password
  // account, they just never see or use that email themselves.
  const authEmail = rawEmail || syntheticEmailForPhone(rawPhone)

  const auth = getAuth()

  let uid
  try {
    const created = await auth.createUser({
      email: authEmail,
      password,
      displayName: name,
    })
    uid = created.uid
  } catch (err) {
    if (err?.code === "auth/email-already-exists") {
      throw new HttpsError(
        "already-exists",
        rawEmail
          ? "An account with that email already exists."
          : "An account with that phone number already exists."
      )
    }
    if (err?.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "Password should be at least 6 characters.")
    }
    throw new HttpsError(
      "internal",
      rawEmail
        ? "Couldn't create that login. Double-check the email and try again."
        : "Couldn't create that login. Double-check the phone number and try again."
    )
  }

  try {
    await db.collection("users").doc(uid).set({
      businessId: caller.businessId,
      role: "provider",
      businessRole,
      name,
      email: authEmail,
      phone: rawPhone || null,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // Roll back the just-created auth account so a failed team-add never
    // leaves an orphaned login nobody can see or use.
    await auth.deleteUser(uid).catch(() => {})
    throw new HttpsError("internal", "Couldn't finish setting up that account. Try again.")
  }

  return { uid, password, signInWith: rawEmail || rawPhone }
})

exports.updateTeamMemberRole = onCall(async (request) => {
  const db = getFirestore()
  const caller = await requireCallingAdmin(db, request.auth?.uid)

  const targetUid = request.data?.uid
  const businessRole = request.data?.businessRole
  if (typeof targetUid !== "string" || !targetUid) {
    throw new HttpsError("invalid-argument", "uid is required.")
  }
  if (businessRole !== "admin" && businessRole !== "technician") {
    throw new HttpsError("invalid-argument", "businessRole must be \"admin\" or \"technician\".")
  }

  const targetRef = db.collection("users").doc(targetUid)
  const targetSnap = await targetRef.get()
  if (!targetSnap.exists) throw new HttpsError("not-found", "That teammate no longer exists.")
  const target = targetSnap.data()
  if (target.businessId !== caller.businessId || target.role !== "provider") {
    throw new HttpsError("permission-denied", "That account isn't on your team.")
  }

  if (targetUid === request.auth.uid && businessRole !== "admin") {
    throw new HttpsError(
      "failed-precondition",
      "You can't demote yourself - have another admin change your role instead."
    )
  }

  if ((target.businessRole ?? "admin") === "admin" && businessRole === "technician") {
    // Demoting an admin - make sure at least one admin is left standing,
    // or the business would end up with nobody able to manage it.
    const teamSnap = await db.collection("users").where("businessId", "==", caller.businessId).get()
    const otherAdmins = teamSnap.docs.filter(
      (d) => d.id !== targetUid && (d.data().businessRole ?? "admin") === "admin"
    )
    if (otherAdmins.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "This business needs at least one admin - promote someone else first."
      )
    }
  }

  await targetRef.update({ businessRole })
  return { ok: true }
})

exports.removeTeamMember = onCall(async (request) => {
  const db = getFirestore()
  const caller = await requireCallingAdmin(db, request.auth?.uid)

  const targetUid = request.data?.uid
  if (typeof targetUid !== "string" || !targetUid) {
    throw new HttpsError("invalid-argument", "uid is required.")
  }
  if (targetUid === request.auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "Use \"Delete my account\" in Profile to remove your own login."
    )
  }

  const targetRef = db.collection("users").doc(targetUid)
  const targetSnap = await targetRef.get()
  if (!targetSnap.exists) throw new HttpsError("not-found", "That teammate no longer exists.")
  const target = targetSnap.data()
  if (target.businessId !== caller.businessId || target.role !== "provider") {
    throw new HttpsError("permission-denied", "That account isn't on your team.")
  }

  if ((target.businessRole ?? "admin") === "admin") {
    const teamSnap = await db.collection("users").where("businessId", "==", caller.businessId).get()
    const otherAdmins = teamSnap.docs.filter(
      (d) => d.id !== targetUid && (d.data().businessRole ?? "admin") === "admin"
    )
    if (otherAdmins.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "This business needs at least one admin - promote someone else before removing this one."
      )
    }
  }

  // Jobs/customers/messages this teammate touched are left exactly as
  // they are (e.g. a past job's technicianId keeps pointing at this uid,
  // same as any other completed-job history) - only their login goes
  // away. Removing a technician is not the same as un-claiming a
  // customer's property; there's no customer-facing record tied to a
  // technician account to unwind.
  await getAuth().deleteUser(targetUid).catch((err) => {
    if (err?.code !== "auth/user-not-found") throw err
  })
  await targetRef.delete()

  return { ok: true }
})
