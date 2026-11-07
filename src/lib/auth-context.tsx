// Re-exports the real Firebase-backed auth context so existing page imports
// (`@/lib/auth-context`) keep working without change.
export { AuthProvider, useAuth, isBizAdmin } from "@/lib/firebase-auth-context"
export type { UserRole } from "@/types"
