const { L } = require("./lang")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { defineSecret } = require("firebase-functions/params")
const { getFirestore } = require("firebase-admin/firestore")

// Same Resend HTTP API used everywhere else in this app - see
// functions/invoices.js for the full story. New "from" secret for this
// one so invite emails can look distinct from invoices/reports if
// wanted:
//   firebase functions:secrets:set RESEND_INVITE_FROM_EMAIL
// e.g. "Verde <invites@tadpool.app>"
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_INVITE_FROM_EMAIL = defineSecret("RESEND_INVITE_FROM_EMAIL")

function inviteLink(code, lang = "en") {
  return `https://verde-gardener-app.web.app/signup?code=${encodeURIComponent(code)}&lang=${lang}`
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
 * Auto-sends a "create your Verde account" invite email to a
 * not-yet-claimed customer, as an alternative to the existing "Send
 * Invite" button (which opens the provider's own text/email app). This
 * one fires immediately in the background, same as invoice/report
 * emails - the provider doesn't need their own email client for it.
 *
 * Only callable by the provider who owns the property (checked via
 * businessId match) - never lets one business email-invite another
 * business's customer.
 */
exports.sendInviteEmail = onCall(
  { secrets: [RESEND_API_KEY, RESEND_INVITE_FROM_EMAIL] },
  async (request) => {
    const callerUid = request.auth?.uid
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "You must be signed in.")
    }

    const propertyId = request.data?.propertyId
    if (typeof propertyId !== "string" || !propertyId.trim()) {
      throw new HttpsError("invalid-argument", "A property id is required.")
    }

    const db = getFirestore()
    const callerSnap = await db.collection("users").doc(callerUid).get()
    const caller = callerSnap.exists ? callerSnap.data() : null
    if (!caller || caller.role !== "provider") {
      throw new HttpsError("permission-denied", "Only a provider can send an invite email.")
    }

    const propSnap = await db.collection("properties").doc(propertyId).get()
    if (!propSnap.exists) {
      throw new HttpsError("not-found", "Customer not found.")
    }
    const property = propSnap.data()
    if (property.businessId !== caller.businessId) {
      throw new HttpsError("permission-denied", "That customer doesn't belong to your business.")
    }
    if (!property.email) {
      throw new HttpsError("failed-precondition", "This customer doesn't have an email on file.")
    }
    if (!property.inviteCode) {
      throw new HttpsError("failed-precondition", "This customer doesn't have an invite code yet.")
    }

    const businessSnap = await db.collection("businesses").doc(caller.businessId).get()
    const businessName = businessSnap.exists ? businessSnap.data()?.name : undefined

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_INVITE_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      throw new HttpsError("failed-precondition", "Invite email isn't set up yet - try again shortly.")
    }

    const l = L(property.language)
    const who = businessName ? l(`${businessName} on `, `${businessName} en `) : ""
    await sendViaResend({
      apiKey,
      from,
      to: property.email,
      subject: l(`${who}Verde has you set up - create your account`, `${who}Verde le tiene registrado - cree su cuenta`),
      text: [
        l(`Hi ${property.customerName || "there"}!`, `¡Hola ${property.customerName || ""}!`),
        "",
        l(`${who}Verde has you set up to track your garden service online.`, `${who}Verde le tiene registrado para seguir su servicio de jardinería en línea.`),
        "",
        `${l("Create your account here", "Cree su cuenta aquí")}: ${inviteLink(property.inviteCode, property.language)}`,
        "",
        `${l("Your invite code", "Su código de invitación")}: ${property.inviteCode}`,
        "",
        ...l(
          [
            "One tip once you're signed in: on iPhone, tap the Share icon in Safari",
            "and choose \"Add to Home Screen.\" That puts a Verde icon right on your",
            "home screen and opens the app full-screen, just like any other app -",
            "no need to open Safari and find the link again next time.",
          ],
          [
            "Un consejo al iniciar sesión: en iPhone, toque el ícono de Compartir en Safari",
            "y elija \"Añadir a pantalla de inicio\". Así tendrá un ícono de Verde en su",
            "pantalla de inicio y la app se abrirá en pantalla completa, como cualquier otra -",
            "sin tener que volver a buscar el enlace en Safari.",
          ]
        ),
      ].join("\n"),
    })

    return { ok: true }
  }
)
