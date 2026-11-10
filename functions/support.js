const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { defineSecret } = require("firebase-functions/params")
const { getFirestore } = require("firebase-admin/firestore")

// Same Resend HTTP API used everywhere else in this app (invoices,
// reports) - see functions/invoices.js for the full story on why Gmail
// SMTP doesn't work from Cloud Functions. This reuses the same
// RESEND_API_KEY (already set and verified against tadpool.app) plus one
// new "from" secret:
//   firebase functions:secrets:set RESEND_SUPPORT_FROM_EMAIL
// e.g. "Verde Support <support@tadpool.app>"
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_SUPPORT_FROM_EMAIL = defineSecret("RESEND_SUPPORT_FROM_EMAIL")

// Where support requests land. Hardcoded rather than a secret since it's
// not sensitive - just the inboxes that read these. Resend accepts
// multiple "to" addresses in one send, so both get every message rather
// than picking one.
const SUPPORT_INBOXES = ["support@verde-gardener-app.web.app"]

async function sendViaResend({ apiKey, from, to, subject, text, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      ...(replyTo ? { reply_to: [replyTo] } : {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

/**
 * Sends a "Contact Us" message from a signed-in user (provider or owner)
 * straight to support@verde-gardener-app.web.app, with the sender's name/email/role
 * attached and reply-to set to their own email so replying just works
 * normally in any mail client.
 *
 * Requires auth (not a public endpoint) - this is in-app support for
 * people who already have an account, not a public contact form, so
 * there's no need to handle anonymous submissions or spam-guard them.
 */
exports.sendSupportMessage = onCall(
  { secrets: [RESEND_API_KEY, RESEND_SUPPORT_FROM_EMAIL] },
  async (request) => {
    const callerUid = request.auth?.uid
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "You must be signed in to send a support message.")
    }

    const message = request.data?.message
    if (typeof message !== "string" || !message.trim()) {
      throw new HttpsError("invalid-argument", "A message is required.")
    }
    if (message.length > 5000) {
      throw new HttpsError("invalid-argument", "That message is too long.")
    }

    const db = getFirestore()
    const callerSnap = await db.collection("users").doc(callerUid).get()
    const caller = callerSnap.exists ? callerSnap.data() : null
    const name = caller?.name || "A Verde user"
    const email = caller?.email || null
    const role = caller?.role || "unknown"

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_SUPPORT_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      throw new HttpsError("failed-precondition", "Support email isn't set up yet - try again shortly.")
    }

    await sendViaResend({
      apiKey,
      from,
      to: SUPPORT_INBOXES,
      replyTo: email ?? undefined,
      subject: `Verde support request from ${name} (${role})`,
      text: [
        `From: ${name}${email ? ` <${email}>` : ""}`,
        `Role: ${role}`,
        "",
        message.trim(),
      ].join("\n"),
    })

    return { ok: true }
  }
)
