const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

// Stored as plain ISO strings (not FieldValue.serverTimestamp() Firestore
// Timestamps) to match every other date field on ServiceJob
// (completedAt, scheduledDate, etc.) - the client reads these straight
// into `new Date(...)`, which only works for a string, not a Firestore
// Timestamp object.

/**
 * Records that a customer opened their public service-report link -
 * called once from JobReportPage.tsx right after it successfully loads a
 * completed job. Lets the provider see whether (and roughly when) a
 * report was actually viewed, without ever needing the customer to be
 * signed in (the report page is deliberately public/unauthenticated -
 * see JobReportPage.tsx).
 *
 * Runs as a trusted server-side write (Admin SDK) rather than letting
 * the public report page write to Firestore directly, so the report
 * page's Firestore access stays read-only - no security-rule hole that
 * would let an anonymous visitor write arbitrary fields onto a job.
 *
 * Silently no-ops (rather than throwing) for a job that doesn't exist or
 * isn't completed - a tracking call failing should never surface an
 * error to the customer looking at their report.
 */
exports.markReportViewed = onCall(async (request) => {
  const jobId = request.data?.jobId
  if (typeof jobId !== "string" || !jobId.trim()) {
    throw new HttpsError("invalid-argument", "A job id is required.")
  }

  const db = getFirestore()
  const jobRef = db.collection("jobs").doc(jobId)

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef)
      if (!snap.exists) return
      const data = snap.data()
      if (data.status !== "completed") return

      const nowIso = new Date().toISOString()
      const update = {
        reportViewCount: FieldValue.increment(1),
        reportLastViewedAt: nowIso,
      }
      if (!data.reportFirstViewedAt) {
        update.reportFirstViewedAt = nowIso
      }
      tx.update(jobRef, update)
    })
  } catch (err) {
    // Best-effort - never let a tracking failure look like a report
    // failure to the customer.
    console.error("markReportViewed failed", err)
  }

  return { ok: true }
})
