const { onDocumentUpdated } = require("firebase-functions/v2/firestore")
const { defineSecret } = require("firebase-functions/params")
const { appLinkTextLines } = require("./app-link")

// Same Resend HTTP API used for invoices (see invoices.js for the full
// story on why we moved off Gmail SMTP). Reuses the same RESEND_API_KEY
// - Resend lets you send from any address at a verified domain, so
// getting a visually separate "from" address for reports vs invoices
// (Shail's original ask) no longer requires a whole second Gmail
// account - it's just a second "from" secret under the same Resend
// account:
//   firebase functions:secrets:set RESEND_REPORT_FROM_EMAIL
// e.g. "Verde Reports <reports@tadpool.app>" (as long as that address's
// domain is verified in the same Resend account used for invoices).
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_REPORT_FROM_EMAIL = defineSecret("RESEND_REPORT_FROM_EMAIL")

function reportLink(jobId) {
  return `https://verde-gardener-app.web.app/report/${jobId}`
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
 * Sends the "your service report is ready" email automatically the moment
 * a job transitions to "completed" - mirrors onInvoiceCreatedSendEmail in
 * invoices.js exactly, just triggered on an update (status change) rather
 * than a create. Text is deliberately NOT automated here either, for the
 * same reason as invoices: sending SMS from a server needs a paid provider
 * like Twilio, which this app doesn't use, so a text still only goes out
 * when the provider's own phone opens the pre-filled text message (see
 * handleSendText in JobDetailPage.tsx).
 *
 * Silently no-ops if there's no reportCustomerEmail snapshot on the job
 * (no email on file for that customer) - a missing automatic email should
 * never be treated as an error, the report is always still reachable via
 * its link either way.
 */
exports.onJobCompletedSendReportEmail = onDocumentUpdated(
  { document: "jobs/{jobId}", secrets: [RESEND_API_KEY, RESEND_REPORT_FROM_EMAIL] },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    // Only fire on the actual completed transition, not on every
    // subsequent edit to an already-completed job (e.g. a provider
    // tweaking report notes afterward).
    if (before.status === "completed" || after.status !== "completed") return
    if (!after.reportCustomerEmail) return

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_REPORT_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      console.warn("RESEND_API_KEY/RESEND_REPORT_FROM_EMAIL secrets not configured - skipping auto-email.")
      return
    }

    const dateStr = new Date(after.scheduledDate).toDateString()
    const businessName = after.reportBusinessName || "Your pool service provider"

    try {
      await sendViaResend({
        apiKey,
        from,
        to: after.reportCustomerEmail,
        subject: `Your pool service report - ${dateStr}`,
        text: [
          `Hi ${after.reportCustomerName || "there"},`,
          "",
          `Here's your pool service report from ${businessName} for ${dateStr}:`,
          reportLink(event.params.jobId),
          ...appLinkTextLines("Track every visit in the Verde app:"),
          "",
          "Thanks!",
        ].join("\n"),
      })
    } catch (err) {
      console.error("Failed to send report email", err)
    }
  }
)
