const { onDocumentCreated } = require("firebase-functions/v2/firestore")
const { onSchedule } = require("firebase-functions/v2/scheduler")
const { defineSecret } = require("firebase-functions/params")
const { getFirestore } = require("firebase-admin/firestore")
const PDFDocument = require("pdfkit")

// Switched from Gmail SMTP (nodemailer + an app password) to Resend's
// HTTP API. Gmail was silently rejecting every login attempt from Cloud
// Functions' servers as "unfamiliar device/location" even with a
// correct, freshly-generated app password - a known problem with
// sending mail from a personal Gmail account off a cloud server. Resend
// is built for exactly this (server-to-customer transactional email)
// and has no such block.
//
// One-time setup (see DEPLOY.md for the full walkthrough):
//   1. Create a free account at https://resend.com (3,000 emails/month
//      free, no credit card required).
//   2. Add and verify a sending domain (or subdomain) you own, e.g.
//      tadpool.app - Resend gives you a few DNS records to add.
//   3. Create an API key and set it: `firebase functions:secrets:set RESEND_API_KEY`
//   4. Set the "from" address you verified:
//      `firebase functions:secrets:set RESEND_FROM_EMAIL`
//      (e.g. "TadPool Invoices <invoices@tadpool.app>")
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL")

// The public, unauthenticated invoice page (see src/pages/InvoicePage.tsx
// and its /invoice/:invoiceId route in App.tsx) - shows Venmo/Zelle "pay"
// buttons already; this is what the invoice email now links to, alongside
// the PDF attachment it already sent.
const PUBLIC_APP_URL = "https://app.tadpool.app"
const { appLinkTextLines, appLinkHtml } = require("./app-link")

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c])
}

function currentPeriodLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** Today as a "YYYY-MM-DD" string in the business's operating timezone
 * (Pacific, same as every other date convention in this file) - used to
 * decide whether a scheduled invoice's send date has arrived yet. Plain
 * string comparison works because scheduledSendAt is always stored in
 * the same "YYYY-MM-DD" shape. */
function todayIsoPacific() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}

/**
 * Renders one invoice as a one-page PDF - what actually gets attached to
 * the email now, replacing the old "here's a link" approach. Kept
 * deliberately simple (pdfkit, no HTML/headless-browser step) since this
 * runs inside a Cloud Function: no layout engine to install, small cold
 * start, and a one-page invoice doesn't need much more than text blocks.
 */
/** Builds the same pre-filled Venmo "pay" deep link used on the public
 * /invoice/:id page (see InvoicePage.tsx) - kept in sync with that
 * format so the PDF and the web page always point to the same place. */
function venmoLink(invoice) {
  if (!invoice.snapVenmoUsername) return null
  const note = `${invoice.snapBusinessName || "Pool service"} - ${invoice.period || ""}`
  return `https://venmo.com/${encodeURIComponent(invoice.snapVenmoUsername)}?txn=pay&amount=${invoice.amount}&note=${encodeURIComponent(note)}`
}

const PAGE_LEFT = 56
const PAGE_RIGHT = 556
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT

async function buildInvoicePdf(invoice) {
  // Fetch the logo's bytes (if any) BEFORE entering the Promise executor
  // below - pdfkit's doc.image() needs an actual Buffer, not a URL. Wrapped
  // in try/catch so a bad/unreachable logo URL never breaks PDF generation;
  // it just renders without a logo, same as an invoice with no logo set.
  let logoBuffer = null
  if (invoice.snapBusinessLogoUrl) {
    try {
      const logoRes = await fetch(invoice.snapBusinessLogoUrl)
      if (logoRes.ok) {
        logoBuffer = Buffer.from(await logoRes.arrayBuffer())
      }
    } catch (err) {
      console.error("Failed to fetch invoice logo, continuing without it", err)
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 56 })
    const chunks = []
    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const amountStr = Number(invoice.amount || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })
    const businessName = invoice.snapBusinessName || "Pool Service Invoice"
    const invoiceDateObj = new Date(invoice.createdAt || Date.now())
    const invoiceDate = invoiceDateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const dueDateObj = new Date(invoiceDateObj.getTime() + 15 * 24 * 60 * 60 * 1000)
    const dueDate = dueDateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const isPaid = invoice.status === "paid"
    const invoiceNo = invoice.invoiceNumber != null ? String(invoice.invoiceNumber) : "-"
    const venmo = venmoLink(invoice)

    const NAVY = "#0f2b46"
    const BLUE = "#0369a1"
    const LIGHT_BLUE = "#eaf3fb"
    const GRAY = "#555555"
    const DARK = "#111111"
    const LINE = "#dddddd"
    const GREEN = "#15803d"
    const RED = "#b91c1c"

    const y0 = 56

    // --- Header: logo circle (or business initial) left, business name /
    // address / phone next to it, big "INVOICE" + meta right ---
    const logoD = 40
    if (logoBuffer) {
      try {
        doc.save()
        doc.circle(PAGE_LEFT + logoD / 2, y0 + logoD / 2, logoD / 2).clip()
        doc.image(logoBuffer, PAGE_LEFT, y0, { width: logoD, height: logoD })
        doc.restore()
      } catch (err) {
        console.error("Failed to embed invoice logo in PDF, continuing without it", err)
      }
    } else {
      doc.fillColor(BLUE).circle(PAGE_LEFT + logoD / 2, y0 + logoD / 2, logoD / 2).fill()
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(businessName.charAt(0).toUpperCase() || "P", PAGE_LEFT, y0 + 11, {
          width: logoD,
          align: "center",
        })
    }

    const tx = PAGE_LEFT + logoD + 12
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(businessName, tx, y0, { width: 250 })
    doc.fillColor(GRAY).font("Helvetica").fontSize(8.5)
    if (invoice.snapBusinessAddress) doc.text(invoice.snapBusinessAddress, tx, y0 + 18, { width: 240 })
    if (invoice.snapBusinessPhone) doc.text(invoice.snapBusinessPhone, tx, doc.y, { width: 240 })

    doc
      .fillColor(BLUE)
      .font("Helvetica-Bold")
      .fontSize(24)
      .text("INVOICE", PAGE_LEFT, y0, { width: PAGE_WIDTH, align: "right" })
    doc.fillColor(DARK).font("Helvetica").fontSize(9)
    const metaLines = [`Invoice #: ${invoiceNo}`, `Invoice date: ${invoiceDate}`, `Due date: ${dueDate}`]
    let metaY = y0 + 28
    for (const line of metaLines) {
      doc.text(line, PAGE_LEFT, metaY, { width: PAGE_WIDTH, align: "right" })
      metaY += 12
    }

    let y = y0 + 58
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(1.5).strokeColor(NAVY).stroke()
    y += 22

    // --- Bill To panel ---
    const panelH = 58
    doc.roundedRect(PAGE_LEFT, y, PAGE_WIDTH, panelH, 4).fill(LIGHT_BLUE)
    doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(8.5).text("BILL TO", PAGE_LEFT + 14, y + 12)
    doc
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(invoice.snapCustomerName || "Customer", PAGE_LEFT + 14, y + 26)
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(9)
      .text(invoice.snapAddress || "", PAGE_LEFT + 14, y + 41, { width: 280 })

    const statusLabel = isPaid ? "PAID" : "UNPAID"
    doc
      .fillColor(isPaid ? GREEN : RED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(statusLabel, PAGE_LEFT, y + 12, { width: PAGE_WIDTH - 14, align: "right" })

    y += panelH + 26

    // --- Line item table ---
    doc.rect(PAGE_LEFT, y, PAGE_WIDTH, 22).fill(NAVY)
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5)
    doc.text("SERVICE PERIOD", PAGE_LEFT + 10, y + 7)
    doc.text("DESCRIPTION", PAGE_LEFT + 260, y + 7)
    doc.text("AMOUNT", PAGE_LEFT, y + 7, { width: PAGE_WIDTH - 10, align: "right" })

    const rowY = y + 22 + 10
    doc.rect(PAGE_LEFT, y + 22, PAGE_WIDTH, 32).fill("#f7f9fb")
    doc.fillColor(DARK).font("Helvetica").fontSize(9.5)
    doc.text(invoice.period || "", PAGE_LEFT + 10, rowY)
    const description = invoice.notes?.trim() || "Monthly pool service & maintenance"
    doc.text(description, PAGE_LEFT + 260, rowY, { width: 190 })
    doc.font("Helvetica-Bold")
    doc.text(amountStr, PAGE_LEFT, rowY, { width: PAGE_WIDTH - 10, align: "right" })

    y = y + 22 + 32 + 16
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).lineWidth(0.75).strokeColor(LINE).stroke()
    y += 24

    // --- Totals, right-aligned ---
    const totalsW = 200
    const totalsX = PAGE_RIGHT - totalsW
    doc.fillColor(GRAY).font("Helvetica").fontSize(9.5).text("Subtotal", totalsX, y)
    doc.fillColor(DARK).text(amountStr, totalsX, y, { width: totalsW, align: "right" })
    y += 18

    const boxH = 30
    doc.roundedRect(totalsX - 12, y, totalsW + 12, boxH, 4).fill(LIGHT_BLUE)
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(isPaid ? "TOTAL PAID" : "BALANCE DUE", totalsX, y + 9)
    doc
      .fillColor(BLUE)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(amountStr, totalsX, y + 7, { width: totalsW, align: "right" })
    y += boxH + 26

    // --- Payment options ---
  const venmoLines = venmo ? 2 : 0
  const zelleLines = invoice.snapZelleContact ? 1 : 0
  const payLines = venmoLines + zelleLines
  const payH = payLines > 0 ? 24 + payLines * 14 : 38
  doc.roundedRect(PAGE_LEFT, y, PAGE_WIDTH, payH, 4).fill("#f7f9fb")
  doc
    .fillColor(GRAY).font("Helvetica-Bold").fontSize(8.5)
    .text("PAYMENT OPTIONS", PAGE_LEFT + 14, y + 12)
  let payY = y + 27
  if (venmo) {
    doc
      .fillColor(DARK).font("Helvetica-Bold").fontSize(9.5)
      .text(`Venmo: ${invoice.snapVenmoUsername}`, PAGE_LEFT + 14, payY, { width: 280 })
    payY += 14
    doc
      .fillColor(BLUE).font("Helvetica-Bold").fontSize(9.5)
      .text("Pay with Venmo ->", PAGE_LEFT + 14, payY, { link: venmo, underline: true, width: 280 })
    payY += 14
  }
  if (invoice.snapZelleContact) {
      doc
        .fillColor(DARK)
        .font("Helvetica")
        .fontSize(9.5)
        .text(`Zelle: ${invoice.snapZelleContact}`, PAGE_LEFT + 14, payY, { width: 280 })
      payY += 14
    }
    y += payH + 24

    doc
      .fillColor(GRAY)
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .text("Thank you for your business!", PAGE_LEFT, y, { width: PAGE_WIDTH, align: "center" })

    doc.end()
  })
}

/**
 * Sends one email via the Resend HTTP API, with an optional PDF
 * attachment. Node 20's built-in `fetch` is used directly instead of
 * adding the `resend` npm package, to keep this a plain HTTPS call with
 * nothing extra to install.
 */
async function sendViaResend({ apiKey, from, to, subject, text, html, attachment }) {
  const body = { from, to, subject, text }
  if (html) {
    body.html = html
  }
  if (attachment) {
    body.attachments = [{ filename: attachment.filename, content: attachment.base64 }]
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const responseBody = await res.text().catch(() => "")
    throw new Error(`Resend API error ${res.status}: ${responseBody}`)
  }
}

/**
 * Builds the PDF and emails it for one invoice. Shared by both the
 * "send immediately on creation" path and the scheduled-invoice sender
 * below, so there's exactly one place that knows how to actually mail an
 * invoice. Silently no-ops if there's no customer email on file - a
 * missing email should never throw and block anything upstream.
 */
async function sendInvoicePdfEmail({ apiKey, from, invoice, invoiceId }) {
  if (!invoice.snapCustomerEmail) return false

  const amountStr = Number(invoice.amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  })
  const businessName = invoice.snapBusinessName || "Your pool service provider"
  const pdfBuffer = await buildInvoicePdf(invoice)
  const invoiceNo = invoice.invoiceNumber != null ? invoice.invoiceNumber : null
  const invoiceLink = `${PUBLIC_APP_URL}/invoice/${invoiceId}`
  const venmo = venmoLink(invoice)

  await sendViaResend({
    apiKey,
    from,
    to: invoice.snapCustomerEmail,
    subject: `Invoice${invoiceNo != null ? ` #${invoiceNo}` : ""} from ${businessName} - ${amountStr}`,
    text: [
      `Hi ${invoice.snapCustomerName || "there"},`,
      "",
      `Your ${invoice.period} pool service invoice${invoiceNo != null ? ` (#${invoiceNo})` : ""} from ${businessName} is ${amountStr}.`,
      "",
      `View & pay online: ${invoiceLink}`,
      ...(venmo ? [`Pay with Venmo (${invoice.snapVenmoUsername}): ${venmo}`] : []),
      "",
      "A PDF copy is attached as well.",
      ...appLinkTextLines("See your service history and invoices in the TadPool app:"),
      "",
      "Thanks!",
    ].join("\n"),
    html: [
      `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111111;">`,
      invoice.snapBusinessLogoUrl
        ? `<p style="text-align:center;margin:0 0 16px;"><img src="${escapeHtml(invoice.snapBusinessLogoUrl)}" alt="${escapeHtml(businessName)}" style="max-height:48px;max-width:200px;" /></p>`
        : "",
      `<p>Hi ${escapeHtml(invoice.snapCustomerName || "there")},</p>`,
      `<p>Your ${escapeHtml(invoice.period)} pool service invoice${invoiceNo != null ? ` (#${invoiceNo})` : ""} from ${escapeHtml(businessName)} is <strong>${amountStr}</strong>.</p>`,
      `<p style="text-align:center;margin:28px 0;">`,
      `<a href="${invoiceLink}" style="background:#0369a1;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">View &amp; Pay Invoice</a>`,
      `</p>`,
      venmo
        ? `<p style="text-align:center;margin:8px 0 0;font-size:13px;color:#555555;">Venmo: ${escapeHtml(invoice.snapVenmoUsername)}</p><p style="text-align:center;margin:2px 0 0;"><a href="${escapeHtml(venmo)}" style="color:#0369a1;font-weight:600;text-decoration:underline;">Pay with Venmo -></a></p>`
        : "",
      `<p style="font-size:13px;color:#666666;">A PDF copy of this invoice is attached as well.</p>`,
      appLinkHtml("See your service history and invoices in the TadPool app:"),
      `<p>Thanks!</p>`,
      `</div>`,
    ].join(""),
    attachment: {
      filename: `invoice${invoiceNo != null ? `-${invoiceNo}` : ""}.pdf`,
      base64: pdfBuffer.toString("base64"),
    },
  })

  await getFirestore()
    .collection("invoices")
    .doc(invoiceId)
    .update({ sentAt: new Date().toISOString() })
    .catch((err) => console.error(`Failed to mark invoice ${invoiceId} sent`, err))

  return true
}

/**
 * Fires the moment an invoice document is created - whether by a
 * provider tapping "Create & Send" in Billing, or by the monthly
 * auto-invoice job below. Sends right away UNLESS the invoice was
 * created with a future scheduledSendAt date, in which case it's left
 * alone here and picked up later by sendScheduledInvoices once that date
 * arrives - see the "schedule for a date" option in Billing.
 */
exports.onInvoiceCreatedSendEmail = onDocumentCreated(
  { document: "invoices/{invoiceId}", secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] },
  async (event) => {
    const invoice = event.data?.data()
    if (!invoice) return

    if (invoice.scheduledSendAt && invoice.scheduledSendAt > todayIsoPacific()) {
      // Future-dated - sendScheduledInvoices will handle it on the day.
      return
    }

    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      console.warn("RESEND_API_KEY/RESEND_FROM_EMAIL secrets not configured - skipping auto-email.")
      return
    }

    try {
      await sendInvoicePdfEmail({ apiKey, from, invoice, invoiceId: event.params.invoiceId })
    } catch (err) {
      // Best-effort - the invoice still exists and is visible in the app
      // even if this particular email attempt failed.
      console.error("Failed to send invoice email", err)
    }
  }
)

/**
 * Runs once a day and sends every invoice whose scheduledSendAt date has
 * arrived but hasn't gone out yet - the "schedule for a date" option in
 * Billing. An invoice created for TODAY or earlier is already handled
 * immediately by onInvoiceCreatedSendEmail above, so in practice this
 * only ever catches invoices that were scheduled for a future date at
 * creation time. Firestore's "<=" comparison naturally excludes invoices
 * with no scheduledSendAt field at all, so this never touches a normal,
 * immediately-sent invoice.
 */
exports.sendScheduledInvoices = onSchedule(
  { schedule: "0 14 * * *", timeZone: "America/Los_Angeles", secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] },
  async () => {
    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      console.warn("RESEND_API_KEY/RESEND_FROM_EMAIL secrets not configured - skipping scheduled invoices.")
      return
    }

    const db = getFirestore()
    const today = todayIsoPacific()
    const dueSnap = await db.collection("invoices").where("scheduledSendAt", "<=", today).get()

    for (const invoiceDoc of dueSnap.docs) {
      const invoice = invoiceDoc.data()
      if (invoice.sentAt) continue // already sent - guards against a re-run
      try {
        await sendInvoicePdfEmail({ apiKey, from, invoice, invoiceId: invoiceDoc.id })
      } catch (err) {
        console.error(`Failed to send scheduled invoice ${invoiceDoc.id}`, err)
      }
    }
  }
)

/**
 * Runs once a day and, on the 1st of the month, auto-generates an invoice
 * for every customer (across every business) who has a monthly rate set.
 * Creating the doc is what triggers onInvoiceCreatedSendEmail above, so
 * an auto-generated invoice gets emailed the same way a manually-sent one
 * does. Skips a property that already has an invoice for the current
 * period, so a retried/duplicate run can never double-bill anyone.
 */
exports.autoGenerateMonthlyInvoices = onSchedule(
  { schedule: "0 13 * * *", timeZone: "America/Los_Angeles" },
  async () => {
    const now = new Date()
    if (now.getDate() !== 1) return

    const db = getFirestore()
    const period = currentPeriodLabel(now)

    const propertiesSnap = await db.collection("properties").where("monthlyRate", ">", 0).get()

    for (const propDoc of propertiesSnap.docs) {
      const property = propDoc.data()

      const existing = await db
        .collection("invoices")
        .where("propertyId", "==", propDoc.id)
        .where("period", "==", period)
        .limit(1)
        .get()
      if (!existing.empty) continue

      const businessRef = db.collection("businesses").doc(property.businessId)

      // Same atomic-counter approach as the client-side createInvoice in
      // firebase-jobs-store.tsx, so auto-generated and manually-sent
      // invoices share one sequential numbering scheme per business -
      // read the business doc and bump its counter in the same
      // transaction so a manual invoice created at the same moment can
      // never land on the same number.
      const { business, invoiceNumber } = await db.runTransaction(async (tx) => {
        const businessSnap = await tx.get(businessRef)
        const businessData = businessSnap.data() || {}
        const current = businessData.nextInvoiceNumber ?? 1000
        tx.update(businessRef, { nextInvoiceNumber: current + 1 })
        return { business: businessData, invoiceNumber: current }
      })

      await db.collection("invoices").add({
        businessId: property.businessId,
        propertyId: propDoc.id,
        ownerId: property.ownerId ?? null,
        invoiceNumber,
        amount: property.monthlyRate,
        period,
        status: "unpaid",
        createdAt: new Date().toISOString(),
        notes: "Auto-generated monthly invoice",
        snapCustomerName: property.customerName ?? null,
        snapCustomerEmail: property.email ?? null,
        snapCustomerPhone: property.phone ?? null,
        snapSmsConsent: property.smsConsent ?? false,
        snapAddress: property.address ?? null,
        snapBusinessName: business.name ?? null,
        snapBusinessPhone: business.phone ?? null,
        snapBusinessAddress: business.address ?? null,
        snapVenmoUsername: business.venmoUsername ?? null,
        snapZelleContact: business.zelleContact ?? null,
        snapBusinessLogoUrl: business.logoUrl ?? null,
      })
    }
  }
)
