const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore")
const { getFirestore } = require("firebase-admin/firestore")
const { getMessaging } = require("firebase-admin/messaging")

/**
 * Sends a push notification to every device a user has registered (see
 * pushTokens subcollection, registered client-side in
 * src/lib/push-notifications.ts), and cleans up any token that's gone
 * stale (uninstalled app, expired token, etc.) so the list doesn't grow
 * forever with dead entries. Silently no-ops for a user with no
 * registered devices - not everyone turns notifications on, and that's
 * fine, it should never be treated as an error.
 */
async function sendPushToUser(uid, { title, body, url }) {
  if (!uid) return
  const db = getFirestore()
  const tokensSnap = await db.collection("users").doc(uid).collection("pushTokens").get()
  if (tokensSnap.empty) return

  const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean)
  if (tokens.length === 0) return

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: url ? { url } : {},
    webpush: { fcmOptions: url ? { link: url } : undefined },
  })

  const deletions = []
  response.responses.forEach((r, i) => {
    if (r.success) return
    const code = r.error?.code
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      deletions.push(tokensSnap.docs[i].ref.delete())
    } else {
      console.warn("Push send failed for a token", code, r.error?.message)
    }
  })
  await Promise.all(deletions)
}

/**
 * Notifies whichever side of the conversation DIDN'T just send a message.
 * Looks up the business (for its provider's uid) and property (for its
 * owner's uid) rather than trusting anything off the client, since this
 * runs with the Admin SDK and the message doc alone doesn't say who the
 * "other" person is.
 */
exports.onNewChatMessageSendPush = onDocumentCreated("messages/{messageId}", async (event) => {
  const message = event.data?.data()
  if (!message) return

  const db = getFirestore()
  const [businessSnap, propertySnap] = await Promise.all([
    db.collection("businesses").doc(message.businessId).get(),
    db.collection("properties").doc(message.propertyId).get(),
  ])
  const providerUid = businessSnap.data()?.ownerUid
  const ownerUid = propertySnap.data()?.ownerId
  const businessName = businessSnap.data()?.name || "Your pool service provider"
  const customerName = propertySnap.data()?.customerName || "Your customer"

  const recipientUid = message.senderId === providerUid ? ownerUid : providerUid
  if (!recipientUid) return // owner hasn't claimed their account yet, or business is misconfigured

  const senderIsProvider = message.senderId === providerUid
  await sendPushToUser(recipientUid, {
    title: senderIsProvider ? `New message from ${businessName}` : `New message from ${customerName}`,
    body: message.text || (message.photoUrl ? "Sent a photo" : "New message"),
    url: `/chat/${message.propertyId}`,
  }).catch((err) => console.error("Failed to send chat push", err))
})

/**
 * Notifies the customer when a new visit is scheduled for their property -
 * fires on job creation. No-ops for a property with no claimed owner yet
 * (nobody to notify).
 */
exports.onJobScheduledSendPush = onDocumentCreated("jobs/{jobId}", async (event) => {
  const job = event.data?.data()
  if (!job) return

  const db = getFirestore()
  const [propertySnap, businessSnap] = await Promise.all([
    db.collection("properties").doc(job.propertyId).get(),
    db.collection("businesses").doc(job.businessId).get(),
  ])
  const ownerUid = propertySnap.data()?.ownerId
  if (!ownerUid) return

  const businessName = businessSnap.data()?.name || "Your pool service provider"
  const dateStr = new Date(job.scheduledDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  await sendPushToUser(ownerUid, {
    title: "New visit scheduled",
    body: `${businessName} scheduled a visit for ${dateStr}.`,
    url: `/jobs/${event.params.jobId}`,
  }).catch((err) => console.error("Failed to send job-scheduled push", err))
})

/**
 * Notifies the customer the moment their service report is ready - same
 * pending->completed transition guard as onJobCompletedSendReportEmail in
 * reports.js, kept as a separate function so email and push can succeed
 * or fail independently.
 */
exports.onJobCompletedSendPush = onDocumentUpdated("jobs/{jobId}", async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!before || !after) return
  if (before.status === "completed" || after.status !== "completed") return

  const db = getFirestore()
  const propertySnap = await db.collection("properties").doc(after.propertyId).get()
  const ownerUid = propertySnap.data()?.ownerId
  if (!ownerUid) return

  const businessName = after.reportBusinessName || "Your pool service provider"

  await sendPushToUser(ownerUid, {
    title: "Your service report is ready",
    body: `${businessName} just finished your visit - tap to view the report.`,
    url: `/jobs/${event.params.jobId}`,
  }).catch((err) => console.error("Failed to send job-completed push", err))
})
