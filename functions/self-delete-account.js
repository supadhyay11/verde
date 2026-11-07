const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getAuth } = require("firebase-admin/auth")
const { getFirestore } = require("firebase-admin/firestore")

/**
 * Lets a signed-in user permanently delete their own account, from inside
 * the app - required by App Store Review Guideline 5.1.1(v) for any app
 * that lets people create an account (Apple will not accept "email
 * support to delete your account" as a substitute). Always acts on the
 * CALLER's own uid - there is no path for deleting someone else's account
 * here (that's adminDeleteAccounts, gated on the admin role).
 *
 * - Owner (customer) account: un-claims their property (ownerId: null,
 *   claimed: false) instead of deleting it, so the provider's customer
 *   record and job/service history survive - only the customer's own
 *   login and profile doc go away. The provider can re-invite the same
 *   property later with a fresh invite code.
 * - Provider account, and this is the business's only admin (or its only
 *   remaining login at all - the original single-operator case): deletes
 *   their whole business - the same cascade as the admin console's
 *   "Delete Business" button (jobs/messages/properties/users docs for
 *   that businessId, then the business doc itself). Invoices are
 *   deliberately left alone, matching that same admin cascade - they're
 *   kept as financial records.
 * - Provider account, but a technician, or an admin with at least one
 *   other admin left on the team (see functions/team.js): only this
 *   one login goes away. The business, its customers, its jobs, and its
 *   other teammates are untouched - this is "I'm leaving this team", not
 *   "shut the business down".
 */
exports.selfDeleteAccount = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.")
  }

  const db = getFirestore()
  const auth = getAuth()

  const userRef = db.collection("users").doc(uid)
  const userSnap = await userRef.get()

  if (userSnap.exists) {
    const userData = userSnap.data()

    if (userData.role === "owner" && userData.propertyId) {
      await db
        .collection("properties")
        .doc(userData.propertyId)
        .update({ ownerId: null, claimed: false })
        .catch(() => {
          // Best-effort - if the property was already removed by the
          // provider, there's nothing left to un-claim.
        })
    }

    if (userData.role === "provider" && userData.businessId) {
      const businessId = userData.businessId
      const isCallerAdmin = (userData.businessRole ?? "admin") === "admin"
      const teamSnap = await db.collection("users").where("businessId", "==", businessId).get()
      const hasOtherAdmin = teamSnap.docs.some(
        (d) => d.id !== uid && (d.data().businessRole ?? "admin") === "admin"
      )

      if (!isCallerAdmin || hasOtherAdmin) {
        // A technician leaving, or an admin whose team still has another
        // admin to run things - remove only this one login. Everything
        // else about the business stays exactly as it was.
        await userRef.delete().catch(() => {})
      } else {
        // The business's only admin, and nobody else can take over - same
        // whole-business cascade as the original single-operator case.
        const collections = [
          { name: "jobs", field: "businessId" },
          { name: "messages", field: "businessId" },
          { name: "properties", field: "businessId" },
          { name: "users", field: "businessId" },
        ]
        for (const { name, field } of collections) {
          const snap = await db.collection(name).where(field, "==", businessId).get()
          const docs = snap.docs
          for (let i = 0; i < docs.length; i += 450) {
            const batch = db.batch()
            for (const d of docs.slice(i, i + 450)) batch.delete(d.ref)
            await batch.commit()
          }
        }
        await db.collection("businesses").doc(businessId).delete().catch(() => {})
      }
    } else {
      // Owner path deletes only its own profile doc - the "users"
      // collection wipe above already covers the provider path.
      await userRef.delete().catch(() => {})
    }
  }

  await auth.deleteUser(uid).catch((err) => {
    // Already gone is fine - that's the desired end state either way.
    if (err?.code !== "auth/user-not-found") throw err
  })

  return { ok: true }
})
