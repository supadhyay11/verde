const { onSchedule } = require("firebase-functions/v2/scheduler")
const { defineSecret } = require("firebase-functions/params")
const { getFirestore } = require("firebase-admin/firestore")
const { appLinkTextLines } = require("./app-link")

// Same Resend setup/secrets as the on-demand "Send Invite" button (see
// functions/send-invite-email.js) - this reuses that same
// RESEND_INVITE_FROM_EMAIL secret rather than asking for a new one,
// since it's the same kind of email (an invite to create a TadPool
// account), just sent automatically on a schedule instead of by hand.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY")
const RESEND_INVITE_FROM_EMAIL = defineSecret("RESEND_INVITE_FROM_EMAIL")

function inviteLink(code) {
  return `https://app.tadpool.app/signup?code=${encodeURIComponent(code)}`
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
 * Every Sunday at 10am (America/Los_Angeles, same timezone as the other
 * scheduled jobs in invoices.js), emails a "create your account" nudge
 * to every customer across every business who was added with an email
 * on file but has never claimed their invite - i.e. exactly the
 * customers the provider's manual "Send Invite" button on the Customers
 * page already targets, just automatic and recurring instead of a
 * one-time click.
 *
 * Email only, on purpose (per Shail's request) - this does NOT touch
 * the text-message invite path at all, and doesn't require SMS/Quo to
 * be set up. A property with no email on file, or that's already
 * claimed, is silently skipped - there's nothing to remind them of.
 *
 * No cap on how many weeks this repeats - it'll keep nudging every
 * Sunday for as long as a customer stays unclaimed. If that turns out
 * to be too naggy after a few weeks, this is the file to add a cutoff
 * (e.g. stop after N reminders, tracked with a reminderCount field on
 * the property) - not built now since it wasn't asked for.
 */
exports.sendWeeklySignupReminders = onSchedule(
  {
    schedule: "0 10 * * 0",
    timeZone: "America/Los_Angeles",
    secrets: [RESEND_API_KEY, RESEND_INVITE_FROM_EMAIL],
  },
  async () => {
    const apiKey = (RESEND_API_KEY.value() || "").trim()
    const from = (RESEND_INVITE_FROM_EMAIL.value() || "").trim()
    if (!apiKey || !from) {
      console.warn("sendWeeklySignupReminders: RESEND secrets not set, skipping this run.")
      return
    }

    const db = getFirestore()
    const snap = await db
      .collection("properties")
      .where("claimed", "==", false)
      .get()

    const targets = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => typeof p.email === "string" && p.email.trim() && p.inviteCode)

    if (targets.length === 0) {
      console.log("sendWeeklySignupReminders: nothing to send this week.")
      return
    }

    // Cache each business's name so a business with many pending
    // customers only costs one extra read, not one per customer.
    const businessNameCache = new Map()
    async function businessNameFor(businessId) {
      if (businessNameCache.has(businessId)) return businessNameCache.get(businessId)
      const bizSnap = await db.collection("businesses").doc(businessId).get()
      const name = bizSnap.exists ? bizSnap.data()?.name : undefined
      businessNameCache.set(businessId, name)
      return name
    }

    let sent = 0
    let failed = 0
    for (const property of targets) {
      const businessName = await businessNameFor(property.businessId)
      const who = businessName ? `${businessName} on ` : ""
      try {
        await sendViaResend({
          apiKey,
          from,
          to: property.email,
          subject: `Reminder: create your ${businessName || "TadPool"} account`,
          text: [
            `Hi ${property.customerName || "there"}!`,
            "",
            `Just a reminder - ${who}TadPool has you set up to track your pool service online, but your account isn't created yet.`,
            "",
            `Create your account here: ${inviteLink(property.inviteCode)}`,
            "",
            `Your invite code: ${property.inviteCode}`,
            ...appLinkTextLines("Prefer the app? Download TadPool, tap Create Account, and enter your invite code:"),
            "",
            "Once you're signed in, you can see your service history, photos, and",
            "upcoming visits any time.",
          ].join("\n"),
        })
        sent++
      } catch (err) {
        failed++
        console.error(`sendWeeklySignupReminders: failed for property ${property.id}`, err)
      }
    }
    console.log(`sendWeeklySignupReminders: sent ${sent}, failed ${failed}, skipped (no email/code) ${snap.size - targets.length}.`)
  }
)
