/** "admin" is a platform-support role, not a customer-facing one - it's
 * never offered on the public sign-up form and is provisioned by hand
 * directly in Firebase. See docs/admin-access.md. */
export type UserRole = "provider" | "owner" | "admin"

/** Only meaningful on "provider" role accounts - splits a business's own
 * logins into the one(s) who can manage customers/billing/team ("admin")
 * and the ones who just complete assigned jobs ("technician"). Missing on
 * older accounts, which should be treated as "admin" (every business had
 * exactly one login, and it could do everything) - see myBusinessRole()
 * in firestore.rules for where that default is enforced server-side too. */
export type BusinessRole = "admin" | "technician"

export interface AppUser {
  id: string
  /** Empty for admin accounts, which aren't scoped to a single business. */
  businessId: string
  role: UserRole
  /** "provider" accounts only - see BusinessRole. Undefined means "admin"
   * (the pre-multi-technician default). */
  businessRole?: BusinessRole
  name: string
  email: string
  phone?: string
  avatarUrl?: string
  /** Owner (customer) accounts only - the single property this account is linked to. */
  propertyId?: string
  /** Per-property "I've seen messages up to here" marker, keyed by
   * propertyId, so chat can show unread counts. Updated whenever this
   * user opens that conversation. */
  lastReadAt?: Record<string, string>
  /** True once this account has opened Verde inside the iOS app or from
   * the Home Screen. A web page can't see which apps are installed on a
   * phone, so this remembered flag is how the "Add to Home Screen" banner
   * knows to stay away from people who already have the app. */
  appInstalled?: boolean
}

export interface Business {
  id: string
  name: string
  address: string
  /** Map point for `address` (set by the geocodeBusiness function); the
   * start of each day's route. */
  lat?: number
  lng?: number
  geocodedFor?: string
  geocodeStatus?: string
  phone?: string
  website?: string
  hours?: string
  /** Firebase Storage download URL for the business's uploaded logo -
   * shown on the invoice PDF, the public invoice page, and anywhere
   * else the business's branding appears. Undefined means no logo
   * uploaded yet (falls back to the plain droplet/business-name
   * header). */
  logoUrl?: string
  /** Self-reported at sign-up as a bucketed range (e.g. "11-25") rather
   * than an exact count - faster to tap through and good enough for our
   * own product/segmentation insight. Not used to gate or unlock
   * anything. */
  customerCountRange?: string
  teamSizeRange?: string
  ownerUid: string
  createdAt: string
  /** Provider's Venmo @username (no leading @) - used to build a
   * pre-filled "Pay with Venmo" deep link on invoices. Payment still
   * has to be completed by hand in the Venmo app; there's no API to
   * confirm it landed. */
  venmoUsername?: string
  /** Whatever the provider tells customers to send Zelle to - an email
   * or phone number enrolled with Zelle. Zelle has no public API, so
   * this is displayed as plain text for the customer to enter manually
   * in their own banking app; there's no deep link or QR that can
   * pre-fill an amount. */
  zelleContact?: string
  /** Counter for the next invoice number to hand out - incremented
   * transactionally every time an invoice is created (see createInvoice
   * in firebase-jobs-store.tsx and the matching logic in
   * functions/invoices.js) so numbers are unique and sequential even
   * when two invoices are created back-to-back. Starts at 1000 the
   * first time an invoice is ever created for this business. */
  nextInvoiceNumber?: number
  /** This business's Stripe Connect "Express" account id, once they've
   * started connecting - set once and never changed. Only ever written
   * by Cloud Functions (createStripeConnectAccount / the Stripe
   * webhook), never by a plain client update - see firestore.rules. */
  stripeAccountId?: string
  /** Mirrors the connected Stripe account's own `charges_enabled` flag -
   * true once Stripe has fully verified the business and it can accept
   * a real card/ACH/Apple Pay payment. Kept in sync by the
   * stripeConnectWebhook Cloud Function listening for `account.updated`
   * events; never trust this field for anything money-moving
   * server-side (always re-check live with Stripe there) - it's display
   * state only. */
  stripeChargesEnabled?: boolean
  /** Mirrors `payouts_enabled` - true once Stripe can actually deposit
   * money into the business's bank account. A business can have
   * charges enabled before payouts are (e.g. bank details still
   * pending), so these are tracked separately rather than collapsed
   * into one "connected" boolean. */
  stripePayoutsEnabled?: boolean
  /** Mirrors `details_submitted` - true once the business has been
   * through Stripe's onboarding form at least once, even if Stripe is
   * still reviewing/verifying something. Used to distinguish "never
   * started onboarding" from "started but not fully approved yet" in
   * the UI. */
  stripeDetailsSubmitted?: boolean
  /** Verde's OWN subscription (businesses paying Verde to use the
   * app) - entirely separate from the stripeAccountId/stripeCharges*
   * fields above, which are this business's Stripe Connect setup for
   * accepting payment from ITS OWN customers. See
   * functions/stripe-billing.js. Only ever written by Cloud Functions
   * (createSubscriptionCheckout / stripeBillingWebhook / the
   * customerCount triggers), never by a plain client update - see
   * firestore.rules. */
  stripeCustomerId?: string
  subscriptionId?: string
  /** Raw Stripe subscription status ("trialing" | "active" | "past_due" |
   * "canceled" | ...) - undefined means never subscribed (still in the
   * free introductory period). Plans: Pro (up to 3 technicians) and Premium (up to 10); see functions/plans.js - no
   * other tiers and no customer limit. */
  subscriptionStatus?: string
  /** ISO timestamp - when the current paid period (or trial) ends. */
  currentPeriodEnd?: string
  /** Denormalized count of this business's properties (customers), kept
   * in sync by Cloud Function triggers on the properties collection.
   * There is no customer limit. Display/reporting only - not authoritative
   * enough to bill against; always re-derive from the properties
   * collection itself for anything money-related server-side. */
  customerCount?: number
}

export type JobStatus = "pending" | "in-progress" | "completed" | "scheduled"

export type ServiceType =
  | "Full Service"
  | "Chem Check"
  | "Filter Cleaning"
  | "Weekly Maintenance"
  | "One-Time Cleaning"

export type RecurrenceRule = "none" | "weekly" | "biweekly" | "monthly"

export interface Property {
  /** ISO timestamp set when the customer was added. Only present on
   * customers created after this field was introduced - existing
   * customers won't have one, so treat its absence as "unknown", not
   * "ancient". */
  createdAt?: string
  id: string
  businessId: string
  /** Customer's display name, captured by the provider when the customer is added. */
  customerName: string
  /** Set once the customer signs up with their invite code; null until claimed. */
  ownerId: string | null
  /** Unique code the customer uses to sign up and link to this property. */
  inviteCode: string
  claimed: boolean
  address: string
  phone?: string
  email?: string
  gateCode?: string
  /** Set when the provider notes this customer also has a spa - unlocks the
   * "Spa Treatment" checklist item for their visits. */
  hasSpa?: boolean
  lat?: number
  lng?: number
  /** The address text lat/lng were looked up for (set by the geocodeProperties
   * function) - lets the app tell when an address has changed since. */
  geocodedFor?: string
  /** "OK", or Google's status when the address couldn't be located. */
  geocodeStatus?: string
  /** What this customer is billed per month - used to pre-fill the
   * amount when the provider sends them an invoice. */
  monthlyRate?: number
  /** Whether this customer has agreed to receive automated text updates
   * (service-completed notices, invoice texts) from the business's Quo
   * number - captured as a checkbox alongside their phone number when a
   * provider adds/edits them. Never assumed true just because a phone
   * number is on file; texting without this set is what got the Quo
   * campaign registration rejected in the first place. Snapshotted onto
   * jobs/invoices at the moment each is created (reportSmsConsent /
   * snapSmsConsent) so a later change here can't retroactively affect
   * whether an already-sent notice looks compliant. */
  smsConsent?: boolean
  /** Set only on customers brought in via the one-time "Connect to
   * QuickBooks" import (functions/quickbooks-import.js) - this is that
   * QuickBooks Customer's Id, used only to skip re-importing the same
   * customer if the business runs the import again. Absent on every
   * customer added normally. */
  quickbooksCustomerId?: string
  /** Manual "how's this relationship going" marker, 0-100 (0 =
   * unhappy, 50 = neutral, 100 = happy) - set by an admin dragging a
   * slider on the customer's profile page. Undefined means never
   * set (shown as neutral). Later this could also be derived
   * automatically from chat sentiment, but for now it's manual
   * only. */
  sentiment?: number
}

export type WaterStatus = "ready" | "treated"
export type EquipmentStatus = "running" | "attention"

export interface ServiceReport {
  waterStatus: WaterStatus
  /** Only set when waterStatus is "treated". */
  waitHours?: string
  chemistryTested: boolean
  chlorine?: string
  ph?: string
  equipmentStatus: EquipmentStatus
  /** Only set when equipmentStatus is "attention". */
  attentionNotes?: string
}

export interface ServiceJob {
  id: string
  businessId: string
  propertyId: string
  ownerId: string | null
  technicianId: string | null
  status: JobStatus
  serviceType: ServiceType
  scheduledDate: string // ISO date
  scheduledTime: string // e.g. "09:00 AM"
  estMinutes: number
  distanceMiles?: number
  /** Position of this visit in its day's driving route (0 = first), set when the
   * provider applies "Optimize route" on the Jobs map. Visits without one fall back
   * to scheduled-time order; null/absent means "not optimized". */
  routeOrder?: number | null
  tasks: { id: string; label: string; done: boolean }[]
  /** Single service photo. Replaces the old two-photo (before/after) flow -
   * see beforePhotoUrl/afterPhotoUrl below, kept only so older completed
   * jobs still display the photos they already have. */
  photoUrl?: string
  /** @deprecated kept for jobs completed before the single-photo change */
  beforePhotoUrl?: string
  /** @deprecated kept for jobs completed before the single-photo change */
  afterPhotoUrl?: string
  notes?: string
  invoiceRef?: string
  recurrence: RecurrenceRule
  completedAt?: string
  createdAt: string
  report?: ServiceReport
  /** Snapshotted onto the job when it's marked completed, so the public
   * share-link report page can render without reading the property or
   * business docs (which hold things like gate codes that must never be
   * publicly readable). */
  reportCustomerName?: string
  reportAddress?: string
  reportBusinessName?: string
  reportBusinessPhone?: string
  reportTechnicianName?: string
  /** Also snapshotted at completion (from the property's email, if any) -
   * lets the onJobCompletedSendReportEmail Cloud Function send the report
   * email automatically, without reading the property doc. Never shown on
   * the public report page itself. */
  reportCustomerEmail?: string | null
  /** Also snapshotted at completion, from the property's phone/smsConsent -
   * lets onJobCompletedSendReportSms (functions/sms.js) text the customer
   * that their service is done, without reading the property doc. Only
   * ever sent when reportSmsConsent is true - see Property.smsConsent. */
  reportCustomerPhone?: string | null
  reportSmsConsent?: boolean
  /** Also snapshotted at completion, from the property's invite code - lets
   * the public report page invite a not-yet-signed-up customer to create
   * their own owner account, without ever reading the property doc itself. */
  reportInviteCode?: string
  /** Set the first time the public report link is opened - lets the
   * provider see whether/when a customer has actually looked at their
   * report, via the markReportViewed Cloud Function (called from
   * JobReportPage.tsx). Never set again after the first view. */
  reportFirstViewedAt?: string
  /** Updated on every open of the report link, including repeat views. */
  reportLastViewedAt?: string
  /** Total number of times the report link has been opened. */
  reportViewCount?: number
}

export type InvoiceStatus = "unpaid" | "paid"

export interface Invoice {
  id: string
  businessId: string
  propertyId: string
  ownerId: string | null
  amount: number
  /** Free-text billing period label shown on the invoice, e.g. "March 2026". */
  period: string
  status: InvoiceStatus
  createdAt: string
  paidAt?: string
  /** Unique, sequential per-business invoice number (starts at 1000) -
   * assigned once at creation via a Firestore transaction, never reused
   * or changed afterward. Shown on the PDF and the public invoice page. */
  invoiceNumber?: number
  notes?: string
  /** Set only when this invoice was created with a future send date
   * (the "schedule for a date" option in Billing) - a plain "YYYY-MM-DD"
   * string, same convention as ServiceJob.scheduledDate. Left unset for
   * an invoice that sends immediately on creation (the normal case). */
  scheduledSendAt?: string
  /** Set by the Cloud Function the moment the PDF invoice email actually
   * goes out - either immediately on creation, or later by the daily
   * scheduled-invoice sender once scheduledSendAt arrives. Undefined
   * means "not sent yet" (either no email on file, or still waiting on
   * its scheduled date). */
  sentAt?: string
  /** Who created this invoice (an admin or technician on the
   * business) - captured at creation time. The actual email delivery
   * is always automatic (immediate, scheduled, or the monthly
   * auto-invoice job), so this records who set the invoice in
   * motion, not who clicked a "send" button at delivery time. Null
   * for the monthly auto-generated invoices, which have no human
   * creator - BillingPage shows those as sent automatically. */
  sentByUid?: string | null
  sentByName?: string | null
  /** Snapshotted at creation - same reasoning as the ServiceJob reportXxx
   * fields: the public /invoice/:id page must never read the property or
   * business docs directly (gate codes, etc. live there), so everything it
   * needs to render is copied onto the invoice itself when it's created. */
  snapCustomerName?: string
  snapCustomerEmail?: string
  snapAddress?: string
  snapBusinessName?: string
  snapBusinessPhone?: string
  snapBusinessAddress?: string
  /** Snapshotted at creation, same reasoning as the other snapXxx
   * fields - the business's logo at the moment this invoice was sent,
   * so changing/removing the logo later doesn't retroactively alter
   * an already-sent invoice. */
  snapBusinessLogoUrl?: string
  /** Also snapshotted at creation, so the payment options on the invoice
   * page don't change retroactively if the provider edits their profile
   * after sending it. */
  snapVenmoUsername?: string
  snapZelleContact?: string
  /** Also snapshotted at creation, from the property's phone/smsConsent -
   * lets onInvoiceCreatedSendSms (functions/sms.js) text the customer that
   * an invoice is ready. Only ever sent when snapSmsConsent is true - see
   * Property.smsConsent. */
  snapCustomerPhone?: string | null
  snapSmsConsent?: boolean
}

export interface ChatMessage {
  id: string
  /** Conversations are one persistent thread per customer relationship,
   * not per job - a job just prompts the message, it doesn't scope it. */
  propertyId: string
  businessId: string
  senderId: string
  text?: string
  photoUrl?: string
  createdAt: string
}

