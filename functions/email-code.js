const { L } = require("./lang")
const crypto = require("crypto")
const { withSenderName } = require("./sender-name")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { defineSecret } = require("firebase-functions/params")
const { getAuth } = require("firebase-admin/auth")
const { getFirestore } = require("firebase-admin/firestore")

// One-time passcode ("OTP") email verification, used at sign-up and from
// the in-app banner. The person gets a 6-digit code by email (Resend, the
// same sender as invoices/reports/invites) and types it into the app - no
// link, no leaving the app, no dependence on Firebase's link domains.
//
//   sendEmailCode   - emails a fresh code to the SIGNED-IN caller's own
//                     address (never a caller-supplied one).
//   verifyEmailCode - checks the code; on success marks the Firebase Auth
//                     account's email as verified (Admin SDK).
//
// Codes live only in the server-only `emailCodes/{uid}` collection (no
// Firestore rule matches it, so clients can never read or write it), and
// only as a salted HMAC - never the code itself.
//
// Same secrets the other emails already use: RESEND_API_KEY, RESEND_FROM_EMAIL.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL")

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 30 * 1000
const MAX_ATTEMPTS = 5
const MAX_SENDS_PER_HOUR = 5
const HOUR_MS = 60 * 60 * 1000

function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0")
}

function hashCode(code, salt) {
  return crypto.createHmac("sha256", salt).update(code).digest("hex")
}

function safeEqualHex(a, b) {
  const x = Buffer.from(a, "hex")
  const y = Buffer.from(b, "hex")
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

async function sendViaResend({ apiKey, from, to, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

exports.sendEmailCode = onCall(
  { secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")

    const auth = getAuth()
    const user = await auth.getUser(uid)
    if (!user.email) {
      throw new HttpsError("failed-precondition", "This account doesn't have an email on file.")
    }
    if (user.emailVerified) return { ok: true, alreadyVerified: true }

    const db = getFirestore()
    const ref = db.collection("emailCodes").doc(uid)
    const snap = await ref.get()
    const prev = snap.exists ? snap.data() : null
    const now = Date.now()
    const force = request.data?.force === true

    // Already has a live code and nobody asked for a new one (e.g. the
    // verify screen opening right after sign-up): don't send a duplicate.
    if (prev && !force && prev.expiresAt > now) {
      return { ok: true, sent: false, expiresAt: prev.expiresAt, resendAfter: prev.lastSentAt + RESEND_COOLDOWN_MS }
    }
    if (prev && now - prev.lastSentAt < RESEND_COOLDOWN_MS) {
      return { ok: true, sent: false, expiresAt: prev.expiresAt, resendAfter: prev.lastSentAt + RESEND_COOLDOWN_MS }
    }

    let windowStart = prev?.windowStart ?? now
    let sendCount = prev?.sendCount ?? 0
    if (now - windowStart > HOUR_MS) {
      windowStart = now
      sendCount = 0
    }
    if (sendCount >= MAX_SENDS_PER_HOUR) {
      throw new HttpsError("resource-exhausted", "Too many codes requested. Please try again in a little while.")
    }

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const rawFrom = (RESEND_FROM_EMAIL.value() || "").trim()
    const from = rawFrom ? withSenderName(rawFrom, "Verde") : ""
    if (!apiKey || !from) {
      throw new HttpsError("failed-precondition", "Verification email isn't set up yet - try again shortly.")
    }

    const l = L(request.data?.language === "es" ? "es" : "en")
    const code = newCode()
    const salt = crypto.randomBytes(16).toString("hex")
    try {
      await sendViaResend({
        apiKey,
        from,
        to: user.email,
        subject: l(`${code} is your Verde verification code`, `${code} es su código de verificación de Verde`),
        text: [
          l(`Hi ${user.displayName || "there"}!`, `¡Hola ${user.displayName || ""}!`),
          "",
          l(`Your Verde verification code is: ${code}`, `Su código de verificación de Verde es: ${code}`),
          "",
          ...l(
            ["It expires in 10 minutes. If you didn't create a Verde account,", "you can safely ignore this email."],
            ["Vence en 10 minutos. Si usted no creó una cuenta de Verde,", "puede ignorar este correo."]
          ),
        ].join("\n"),
      })
    } catch (err) {
      console.error("sendEmailCode: resend failed", err)
      throw new HttpsError("internal", `Couldn't send the code: ${String(err.message || err).slice(0, 200)}`)
    }

    // Saved only after the email went out, so a failed send never burns a
    // slot in the hourly limit or invalidates an earlier working code.
    await ref.set({
      hash: hashCode(code, salt),
      salt,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
      windowStart,
      sendCount: sendCount + 1,
    })
    return { ok: true, sent: true, expiresAt: now + CODE_TTL_MS, resendAfter: now + RESEND_COOLDOWN_MS }
  }
)

exports.verifyEmailCode = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")

  const code = typeof request.data?.code === "string" ? request.data.code.replace(/\s+/g, "") : ""
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid-format" }

  const auth = getAuth()
  const user = await auth.getUser(uid)
  if (user.emailVerified) return { ok: true, alreadyVerified: true }

  const db = getFirestore()
  const ref = db.collection("emailCodes").doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, reason: "no-code" }
  const rec = snap.data()

  if (rec.expiresAt <= Date.now()) return { ok: false, reason: "expired" }
  if (rec.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too-many-attempts" }

  if (!safeEqualHex(hashCode(code, rec.salt), rec.hash)) {
    const attempts = rec.attempts + 1
    await ref.update({ attempts })
    return {
      ok: false,
      reason: attempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong-code",
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
    }
  }

  await auth.updateUser(uid, { emailVerified: true })
  await ref.delete().catch(() => {})
  return { ok: true }
})
