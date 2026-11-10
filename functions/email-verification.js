const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { withSenderName } = require("./sender-name")
const { defineSecret } = require("firebase-functions/params")
const { getAuth } = require("firebase-admin/auth")

// Same Resend HTTP API used everywhere else in this app (see
// functions/invoices.js for the full story and one-time setup). This
// replaces Firebase Auth's own BUILT-IN verification email, which comes
// from a shared @<project>.firebaseapp.com address with no sender
// reputation of its own - Gmail (and most providers) file that one
// straight into spam/junk. Sending the exact same verification LINK
// (still minted by Firebase Auth itself, via generateEmailVerificationLink
// - clicking it still marks the account verified the normal way) through
// Resend instead means it rides on the same sender reputation Verde's
// invoices/reports/invite emails already have, landing in the inbox
// instead of junk.
//
// Uses the SAME secrets invoices.js already needs - nothing new to set up
// if those are already configured:
//   RESEND_API_KEY, RESEND_FROM_EMAIL
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL")

const APP_URL = "https://verde-gardener-app.web.app"

// Runs one step of sendVerificationEmail and, if it throws, logs the real
// error and re-throws it as an HttpsError that names the step - so the app
// can show WHY it failed ("link: ...", "resend: ...") instead of a generic
// "internal" error.
async function step(name, fn) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof HttpsError) throw err
    const detail = (err && err.message ? String(err.message) : String(err)).slice(0, 300)
    console.error(`sendVerificationEmail: ${name} failed`, err)
    throw new HttpsError("internal", `${name} failed: ${detail}`)
  }
}

async function sendViaResend({ apiKey, from, to, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

/**
 * Sends the "verify your email" link to the signed-in caller's OWN email
 * address - never a caller-supplied address, so this can't be used to
 * spam anyone else. A no-op (returns alreadyVerified) if the account is
 * already verified. Used both right after a new provider sign-up and by
 * the in-app "Resend email" button (see VerifyEmailBanner in
 * src/components/layout/AppShell.tsx and resendVerificationEmail in
 * src/lib/firebase-auth-context.tsx).
 */
exports.sendVerificationEmail = onCall(
  { secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] },
  async (request) => {
    const callerUid = request.auth?.uid
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "You must be signed in.")
    }

    const auth = getAuth()
    const userRecord = await step("lookup", () => auth.getUser(callerUid))
    if (!userRecord.email) {
      throw new HttpsError(
        "failed-precondition",
        "This account doesn't have an email on file."
      )
    }
    if (userRecord.emailVerified) {
      return { ok: true, alreadyVerified: true }
    }

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const rawFrom = (RESEND_FROM_EMAIL.value() || "").trim()
    const from = rawFrom ? withSenderName(rawFrom, "Verde") : ""
    if (!apiKey || !from) {
      throw new HttpsError(
        "failed-precondition",
        "Verification email isn't set up yet - try again shortly."
      )
    }

    const link = await step("link", () =>
      auth.generateEmailVerificationLink(userRecord.email, { url: APP_URL })
    )

    await step("resend", () => sendViaResend({
      apiKey,
      from,
      to: userRecord.email,
      subject: "Verify your email for Verde",
      text: [
        `Hi ${userRecord.displayName || "there"}!`,
        "",
        "Please verify your email address for your Verde account by",
        "clicking the link below:",
        "",
        link,
        "",
        "If you didn't create a Verde account, you can safely ignore",
        "this email.",
      ].join("\n"),
    }))

    return { ok: true }
  }
)
