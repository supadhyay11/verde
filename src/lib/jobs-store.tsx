// Re-exports the real Firebase-backed jobs store so existing page imports
// (`@/lib/jobs-store`) keep working without change.
export { JobsStoreProvider, useJobsStore } from "@/lib/firebase-jobs-store"
