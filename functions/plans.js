const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { onDocumentCreated } = require("firebase-functions/v2/firestore")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

/**
 * Verde plans. Pro is $39.99/month for up to 3 technicians, Premium is
 * $69.99/month for up to 10; every feature is in both. A "technician" here
 * is anyone with a service login in the business (the owner and every
 * teammate, admin or technician role), i.e. every users/{uid} doc with
 * role "provider" in that business.
 *
 * The plan lives in businessPlans/{businessId}, NOT on the business doc:
 * a provider can edit their own business doc from the client, so a plan
 * stored there could be upgraded by the very person it limits. Nothing in
 * firestore.rules matches businessPlans, so clients can't read or write it
 * at all - only these Cloud Functions (Admin SDK) do, and the app asks for
 * its plan through getTeamPlan.
 *
 * A business with no businessPlans doc (everything created before plans
 * existed) counts as Pro with no trial date.
 *
 * Payment is not collected yet (no card at signup). When Stripe billing is
 * switched on, it should write `plan` here from the subscription instead.
 */

const PLANS = {
  pro: { name: "Pro", maxTechnicians: 3 },
  premium: { name: "Premium", maxTechnicians: 10 },
}

// New businesses that sign up on or before this moment get 3 months free;
// later signups get the shorter trial below. One place to change the date.
const PROMO_ENDS_AT = new Date("2027-01-01T08:00:00Z") // end of Dec 31, 2026, Pacific
const PROMO_TRIAL_DAYS = 90
const STANDARD_TRIAL_DAYS = 14

function planKey(data) {
  return data && PLANS[data.plan] ? data.plan : "pro"
}

async function countTechnicians(db, businessId) {
  const snap = await db
    .collection("users")
    .where("businessId", "==", businessId)
    .where("role", "==", "provider")
    .count()
    .get()
  return snap.data().count
}

async function getPlanInfo(db, businessId) {
  const [planSnap, used] = await Promise.all([
    db.collection("businessPlans").doc(businessId).get(),
    countTechnicians(db, businessId),
  ])
  const data = planSnap.exists ? planSnap.data() : null
  const key = planKey(data)
  return {
    plan: key,
    planName: PLANS[key].name,
    maxTechnicians: PLANS[key].maxTechnicians,
    used,
    trialEndsAt: data?.trialEndsAt ?? null,
  }
}

/** Throws if adding one more technician would go over the business's plan. */
async function assertRoomForTechnician(db, businessId) {
  const info = await getPlanInfo(db, businessId)
  if (info.used >= info.maxTechnicians) {
    throw new HttpsError(
      "failed-precondition",
      info.plan === "pro"
        ? `Your Pro plan includes up to ${info.maxTechnicians} technicians. Upgrade to Premium (up to ${PLANS.premium.maxTechnicians}) to add more.`
        : `Your Premium plan includes up to ${info.maxTechnicians} technicians. Contact support@verde-gardener-app.web.app if you need a larger team.`
    )
  }
}

// Every new business starts on Pro with a trial end date, set here (server
// side) so it can't be edited from the app.
exports.onBusinessCreatedSetPlan = onDocumentCreated("businesses/{businessId}", async (event) => {
  const now = new Date()
  const days = now <= PROMO_ENDS_AT ? PROMO_TRIAL_DAYS : STANDARD_TRIAL_DAYS
  const trialEndsAt = new Date(now.getTime() + days * 86400000).toISOString()
  await getFirestore()
    .collection("businessPlans")
    .doc(event.params.businessId)
    .set({ plan: "pro", trialEndsAt, createdAt: FieldValue.serverTimestamp() }, { merge: true })
})

exports.getTeamPlan = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const db = getFirestore()
  const me = (await db.collection("users").doc(uid).get()).data()
  if (!me) throw new HttpsError("permission-denied", "No account found.")
  let businessId = me.businessId
  // A Verde admin may look up any business (used by the Admin page).
  if (me.role === "admin" && typeof request.data?.businessId === "string") {
    businessId = request.data.businessId
  } else if (me.role !== "provider") {
    throw new HttpsError("permission-denied", "Only a business account has a plan.")
  }
  if (!businessId) throw new HttpsError("not-found", "No business found.")
  return getPlanInfo(db, businessId)
})

// Verde admin only: until card payments exist, this is how a business is
// moved between plans.
exports.adminSetBusinessPlan = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.")
  const db = getFirestore()
  const me = (await db.collection("users").doc(uid).get()).data()
  if (!me || me.role !== "admin") {
    throw new HttpsError("permission-denied", "Only an admin account can change a plan.")
  }
  const { businessId, plan } = request.data || {}
  if (typeof businessId !== "string" || !businessId || !PLANS[plan]) {
    throw new HttpsError("invalid-argument", "businessId and a valid plan are required.")
  }
  if (plan === "pro") {
    const used = await countTechnicians(db, businessId)
    if (used > PLANS.pro.maxTechnicians) {
      throw new HttpsError(
        "failed-precondition",
        `This business has ${used} technicians. Pro allows ${PLANS.pro.maxTechnicians}, so remove some first.`
      )
    }
  }
  await db.collection("businessPlans").doc(businessId).set({ plan }, { merge: true })
  return getPlanInfo(db, businessId)
})

exports.assertRoomForTechnician = assertRoomForTechnician
