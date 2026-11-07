const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { initializeApp } = require("firebase-admin/app")
const { getAuth } = require("firebase-admin/auth")
const { getFirestore } = require("firebase-admin/firestore")

initializeApp()

// Auto-emails an invoice the moment it's created, and auto-generates
// monthly invoices for customers with a monthly rate set - see
// functions/invoices.js for the full explanation of what's automated
// (email) and what isn't (text, which still requires a paid SMS provider
// this app doesn't use).
const { onInvoiceCreatedSendEmail, autoGenerateMonthlyInvoices, sendScheduledInvoices } = require("./invoices")
exports.onInvoiceCreatedSendEmail = onInvoiceCreatedSendEmail
exports.autoGenerateMonthlyInvoices = autoGenerateMonthlyInvoices
exports.sendScheduledInvoices = sendScheduledInvoices

// Auto-emails the service report the moment a job is marked complete -
// same Gmail secrets and pattern as the invoice auto-email above. See
// functions/reports.js.
const { onJobCompletedSendReportEmail } = require("./reports")
exports.onJobCompletedSendReportEmail = onJobCompletedSendReportEmail

// Finishes an owner sign-up server-side (transactional, bypasses security
// rules) - fixes the "insufficient privilege" error real customers were
// hitting right after sign-up. See functions/claim-invite.js for the full
// explanation.
const { claimInvite } = require("./claim-invite")
exports.claimInvite = claimInvite

// Push notifications - new chat message, a new visit getting scheduled,
// and a job being marked complete. Each registered device's FCM token
// lives in users/{uid}/pushTokens - see src/lib/push-notifications.ts for
// how a device registers itself. See functions/push-notifications.js.
const { onNewChatMessageSendPush, onJobScheduledSendPush, onJobCompletedSendPush } = require("./push-notifications")
exports.onNewChatMessageSendPush = onNewChatMessageSendPush
exports.onJobScheduledSendPush = onJobScheduledSendPush
exports.onJobCompletedSendPush = onJobCompletedSendPush

// Lets an admin view the app as a specific provider account - see
// functions/admin-impersonate.js for how this stays safe (never resets or
// touches the provider's real password, and never disturbs the admin's
// own session).

// Lets someone sign in with their phone number instead of their email -
// see functions/resolve-login-email.js for how (looks up the matching
// account's email; the password itself still goes straight to Firebase
// Auth on the client, never through this function).
const { resolveLoginEmail } = require("./resolve-login-email")
exports.resolveLoginEmail = resolveLoginEmail

// Records that a customer opened their public service-report link, so
// the provider can see whether/when it was actually viewed. See
// functions/report-view.js.
const { markReportViewed } = require("./report-view")
exports.markReportViewed = markReportViewed

// In-app "Contact Us" - sends a signed-in user's support message
// straight to admin@tadpool.app. See functions/support.js.
const { sendSupportMessage } = require("./support")
exports.sendSupportMessage = sendSupportMessage

// Public "Book your demo" form on the marketing homepage (tadpool.app) -
// anonymous visitors, no auth, plain HTTP + CORS rather than onCall. See
// functions/book-demo.js.

// Homepage "Email us" form in the chat button - public, emails
// admin@tadpool.app only. See functions/contact-email.js.

// Referral program - a business shares its link, and when another pool pro
// signs up with it both earn free months. Server-only collections, no
// security-rule changes. See functions/referrals.js.
const { getMyReferral, recordReferral } = require("./referrals")
exports.getMyReferral = getMyReferral
exports.recordReferral = recordReferral

// Stripe Connect - lets a business accept card/ACH/Apple Pay payments
// directly into their own bank account. See functions/stripe-connect.js
// for the full setup steps (Stripe account, secrets, webhook).

// // TadPool's own subscription billing - businesses paying TadPool to use
// // the app ($19.99/month flat, first 3 months free), separate from
// // Stripe Connect above. See functions/stripe-billing.js.
// const {
//   createSubscriptionCheckout,
//   createBillingPortalLink,
//   stripeBillingWebhook,
// } = require("./stripe-billing")
// exports.createSubscriptionCheckout = createSubscriptionCheckout
// exports.createBillingPortalLink = createBillingPortalLink
// exports.stripeBillingWebhook = stripeBillingWebhook

// One-time "Connect to QuickBooks" customer import - a business admin
// connects once, TadPool pulls in their existing QuickBooks Online
// customers, no ongoing sync in either direction. See
// functions/quickbooks-import.js for the full setup steps (Intuit app,
// secrets, redirect URI).

// Keeps businesses/{id}.customerCount in sync with the properties
// collection (cached count for display and reporting; no customer limit)
// without a collection-count query. See functions/customer-count.js.
const {
  onPropertyCreatedIncrementCustomerCount,
  onPropertyDeletedDecrementCustomerCount,
} = require("./customer-count")
exports.onPropertyCreatedIncrementCustomerCount = onPropertyCreatedIncrementCustomerCount
exports.onPropertyDeletedDecrementCustomerCount = onPropertyDeletedDecrementCustomerCount

// Auto-sends the "create your account" invite email to a customer, as
// an alternative to the existing text/mailto "Send Invite" button. See
// functions/send-invite-email.js.
const { sendInviteEmail } = require("./send-invite-email")
exports.sendInviteEmail = sendInviteEmail

// Automated SMS to customers who've opted in - a Quo (formerly OpenPhone)
// number, separate from the existing manual "text" buttons which keep
// working from the provider's own phone either way. No-ops until
// QUO_API_KEY/QUO_FROM_NUMBER secrets are set - see functions/sms.js.

// Inbound side of the same Quo integration - a webhook Quo calls
// whenever a customer replies by text, which forwards that reply to
// the right business's own phone (so replies don't just pile up in
// Shail's shared Quo inbox). See functions/quo-inbound.js.

// Lets a signed-in user delete their own account from inside the app -
// required by App Store Guideline 5.1.1(v). See functions/self-delete-account.js.
const { selfDeleteAccount } = require("./self-delete-account")
exports.selfDeleteAccount = selfDeleteAccount

// Lets a business admin add technician (or additional admin) logins
// under their own business, change a teammate's role, or remove one.
// See functions/team.js.
const { createTechnician, updateTeamMemberRole, removeTeamMember } = require("./team")

const { resetCustomerAccess } = require("./reset-customer-access")
exports.resetCustomerAccess = resetCustomerAccess
exports.createTechnician = createTechnician
exports.updateTeamMemberRole = updateTeamMemberRole
exports.removeTeamMember = removeTeamMember

// Every Sunday 10am: emails a "create your account" reminder to
// unclaimed customers who have an email on file. See
// functions/weekly-signup-reminder.js.
const { sendWeeklySignupReminders } = require("./weekly-signup-reminder")
exports.sendWeeklySignupReminders = sendWeeklySignupReminders

const MAX_UIDS_PER_CALL = 100

/**
 * Deletes one or more Firebase Authentication accounts (sign-ins), plus
 * their users/{uid} Firestore profile doc.
 *
 * This exists ONLY because the client Firebase SDK can never delete
 * someone else's Auth account - that requires the Admin SDK, which only
 * runs in a trusted server context like this Cloud Function. It's what
 * lets the admin console's "Delete Customer" / "Delete Business" actions
 * fully remove an account instead of just its Firestore data, so the
 * same email can be used to sign up again afterward.
 *
 * Callable only by a signed-in user whose own users/{uid} doc has
 * role == "admin" - the same platform-support role documented in
 * docs/admin-access.md, provisioned by hand and never available through
 * the public sign-up form.
 */
exports.adminDeleteAccounts = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in.")
  }

  const db = getFirestore()
  const callerSnap = await db.collection("users").doc(callerUid).get()
  if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only an admin account can delete another user's sign-in."
    )
  }

  const uids = request.data?.uids
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError("invalid-argument", "Provide a non-empty array of uids.")
  }
  if (uids.length > MAX_UIDS_PER_CALL) {
    throw new HttpsError(
      "invalid-argument",
      `Can't delete more than ${MAX_UIDS_PER_CALL} accounts in one call.`
    )
  }
  if (!uids.every((u) => typeof u === "string" && u.length > 0)) {
    throw new HttpsError("invalid-argument", "Every uid must be a non-empty string.")
  }

  const auth = getAuth()
  const deleted = []
  const failed = []

  for (const uid of uids) {
    try {
      await auth.deleteUser(uid)
      deleted.push(uid)
    } catch (err) {
      // Already gone is fine - that's the desired end state either way.
      if (err?.code === "auth/user-not-found") {
        deleted.push(uid)
      } else {
        failed.push({ uid, message: err instanceof Error ? err.message : String(err) })
      }
    }
    // Best-effort: remove the Firestore profile doc too, in case the
    // caller hasn't already deleted it client-side.
    await db.collection("users").doc(uid).delete().catch(() => {})
  }

  return { deleted, failed }
})

// Sends the "verify your email" link via Resend (same sender as
// invoices/reports/invites) instead of Firebase Auth's own built-in
// verification email, which was landing in spam/junk. See
// functions/email-verification.js.
const { sendVerificationEmail } = require("./email-verification")
exports.sendVerificationEmail = sendVerificationEmail

// One-time passcode (6-digit code) email verification - used at sign-up and
// from the in-app banner instead of a link. See functions/email-code.js.
const { sendEmailCode, verifyEmailCode } = require("./email-code")
exports.sendEmailCode = sendEmailCode
exports.verifyEmailCode = verifyEmailCode

// Fixing a mistyped email: a person can fix their own while it's still
// unverified, and a platform admin can change a provider's. See
// functions/change-email.js.
const { changeMyUnverifiedEmail, adminChangeUserEmail } = require("./change-email")
exports.changeMyUnverifiedEmail = changeMyUnverifiedEmail
exports.adminChangeUserEmail = adminChangeUserEmail

// Route map: address -> map point lookup and the map key for the browser.
// See functions/maps.js.
const { getMapsBrowserKey, geocodeProperties, geocodeBusiness } = require("./maps")
exports.getMapsBrowserKey = getMapsBrowserKey
exports.geocodeProperties = geocodeProperties
exports.geocodeBusiness = geocodeBusiness

// Plans (Pro up to 3 technicians, Premium up to 10) - see plans.js.
const {
  onBusinessCreatedSetPlan,
  getTeamPlan,
  adminSetBusinessPlan,
} = require("./plans")
exports.onBusinessCreatedSetPlan = onBusinessCreatedSetPlan
exports.getTeamPlan = getTeamPlan
exports.adminSetBusinessPlan = adminSetBusinessPlan
