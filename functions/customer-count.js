const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

/**
 * Keeps businesses/{businessId}.customerCount in sync with how many
 * properties (customers) that business actually has - a cached count for
 * display and reporting. Verde has no customer limit: it's $19.99/month
 * flat (first 3 months free) for unlimited pools and customers.
 * FieldValue.increment is used instead of a read-then-write so two devices
 * adding/removing customers for the same business at the same moment can
 * never race each other into a wrong count.
 *
 * Note this runs AFTER the property doc is already written, so the cached
 * count can briefly be one behind reality.
 */
exports.onPropertyCreatedIncrementCustomerCount = onDocumentCreated(
  "properties/{propertyId}",
  async (event) => {
    const businessId = event.data?.data()?.businessId
    if (!businessId) return
    await getFirestore()
      .collection("businesses")
      .doc(businessId)
      .update({ customerCount: FieldValue.increment(1) })
      .catch((err) => {
        // Business doc could be mid-deletion or otherwise gone - never
        // worth failing anything over, this is a display/limit-check
        // counter, not money-moving.
        console.error("onPropertyCreatedIncrementCustomerCount: couldn't update business", err)
      })
  }
)

exports.onPropertyDeletedDecrementCustomerCount = onDocumentDeleted(
  "properties/{propertyId}",
  async (event) => {
    const businessId = event.data?.data()?.businessId
    if (!businessId) return
    await getFirestore()
      .collection("businesses")
      .doc(businessId)
      .update({ customerCount: FieldValue.increment(-1) })
      .catch((err) => {
        console.error("onPropertyDeletedDecrementCustomerCount: couldn't update business", err)
      })
  }
)
