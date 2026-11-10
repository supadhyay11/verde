import { tr } from "@/lib/i18n/core"
import * as React from "react"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth"
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { auth, db, functions } from "@/lib/firebase"
import { clearStoredReferral, getStoredReferral } from "@/lib/referral"
import { clearImpersonatingSession } from "@/pages/ImpersonatePage"
import type { AppUser, UserRole } from "@/types"

interface SignUpProviderInput {
  role: "provider"
  name: string
  email: string
  password: string
  phone?: string
  businessName: string
  businessAddress: string
  customerCountRange?: string
  teamSizeRange?: string
  businessPhone?: string
  website?: string
  hours?: string
}

interface SignUpOwnerInput {
  role: "owner"
  name: string
  email: string
  password: string
  phone?: string
  inviteCode: string
}

type SignUpInput = SignUpProviderInput | SignUpOwnerInput

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  error: string | null
  /** Mirrors the signed-in Firebase Auth user's own `emailVerified` flag -
   * undefined while signed out. This is a soft gate only: the account is
   * fully usable either way (see the verify-email banner in AppShell.tsx),
   * it's just surfaced so the UI can remind an unverified provider to
   * check their inbox. Kept fresh by re-checking on window focus, since
   * clicking the verification link happens in a separate tab and Firebase
   * Auth doesn't push that change to already-open sessions on its own. */
  emailVerified: boolean | undefined
  /** Re-sends the verification email to the signed-in user's address.
   * Throws if nobody's signed in or Firebase Auth rate-limits the resend
   * (it allows only so many in a short window). */
  resendVerificationEmail: () => Promise<void>
  /** Re-reads the signed-in account's emailVerified flag (and refreshes the
   * ID token) - call after a one-time code is accepted. */
  refreshEmailVerified: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  /** Same as signIn, but accepts either an email or a phone number as the
   * identifier - see resolveLoginEmail below for how a phone number gets
   * resolved to the matching account's email first. */
  signInWithIdentifier: (identifier: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  /** Updates the signed-in user's own name/phone - both their users/{uid}
   * Firestore doc (the source of truth read back into `user` above) and,
   * for name, the Firebase Auth displayName too, so the two never drift
   * apart. Email is deliberately not editable here - changing it needs
   * Firebase Auth's own re-verification flow, not a plain profile edit. */
  updateUserProfile: (patch: { name?: string; phone?: string; language?: "en" | "es" }) => Promise<void>
  /** Permanently deletes the signed-in user's own account (Firestore
   * profile + Firebase Auth sign-in, plus their whole business if this is
   * a provider - see functions/self-delete-account.js) and signs them
   * out. Required so the app satisfies App Store Guideline 5.1.1(v). */
  deleteMyAccount: () => Promise<void>
  clearError: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined
)

function randomBusinessId() {
  return `biz-${Math.random().toString(36).slice(2, 10)}`
}

// Excludes visually ambiguous characters (0/O, 1/I/L) for a code customers
// will be typing in by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
function randomInviteCode() {
  // Cryptographic randomness (not Math.random, which is predictable) -
  // an invite code is a credential that lets someone claim a customer.
  const bytes = new Uint32Array(6)
  crypto.getRandomValues(bytes)
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(
    null
  )
  const [user, setUser] = React.useState<AppUser | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [emailVerified, setEmailVerified] = React.useState<boolean | undefined>(
    undefined
  )
  // True for the whole duration of signUp() below. The profile listener a
  // few effects down treats "signed in, but no users/{uid} doc yet" as a
  // sign that a PAST sign-up attempt died partway through - which is right
  // for someone signing back in later, but was also firing on every brand
  // new sign-up, because onAuthStateChanged fires the instant the Auth
  // account is created, before signUp() has had a chance to write the
  // business/profile docs a few lines later. That race was kicking every
  // new sign-up out with "we couldn't find an account profile" while it
  // was still legitimately in progress. This flag tells that listener to
  // hold off (rather than error out and sign the person out) while a
  // sign-up is actively running.
  const signingUpRef = React.useRef(false)

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser)
      setEmailVerified(fbUser?.emailVerified)
      if (!fbUser) {
        setUser(null)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  // Clicking the verification link opens in a separate tab, so this
  // session's own `firebaseUser.emailVerified` goes stale the moment
  // someone verifies - Firebase Auth doesn't push that change here on its
  // own. Re-checking whenever the tab regains focus (a reasonable proxy
  // for "they might have just come back from their inbox") keeps the
  // verify-email banner from lingering after it's no longer true.
  React.useEffect(() => {
    if (!firebaseUser) return
    const recheck = () => {
      firebaseUser
        .reload()
        .then(() => setEmailVerified(firebaseUser.emailVerified))
        .catch(() => {
          // Best-effort - a failed reload just means the banner might
          // stay up one extra focus cycle, not worth surfacing as an error.
        })
    }
    window.addEventListener("focus", recheck)
    return () => window.removeEventListener("focus", recheck)
  }, [firebaseUser])

  React.useEffect(() => {
    if (!firebaseUser) return
    setLoading(true)
    const ref = doc(db, "users", firebaseUser.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setUser({
            id: firebaseUser.uid,
            businessId: data.businessId,
            role: data.role,
            businessRole: data.businessRole ?? undefined,
            name: data.name,
            email: data.email,
            phone: data.phone,
            propertyId: data.propertyId ?? undefined,
            lastReadAt: data.lastReadAt ?? undefined,
            appInstalled: data.appInstalled === true ? true : undefined,
          })
          setLoading(false)
          return
        }

        // A sign-up currently in flight (see signingUpRef above) legitimately
        // has no profile doc yet for the brief moment between the Auth
        // account being created and signUp() finishing its Firestore
        // writes - that's not an error, just wait for the next snapshot.
        if (signingUpRef.current) return

        // Signed in with valid Firebase Auth credentials, but there's no
        // matching users/{uid} profile doc - most often a sign-up that
        // partially failed (e.g. an invalid invite code threw AFTER the
        // Auth account was already created, and the best-effort rollback
        // in signUp() below couldn't delete it either). Left unhandled,
        // RequireAuth just sees `user: null` once loading finishes and
        // silently bounces back to /login with no explanation - which
        // looks exactly like the login itself failed. Signing out and
        // surfacing a clear message here is what actually explains it.
        setUser(null)
        setLoading(false)
        setError(
          tr("We couldn't find an account profile for this login. This can happen if a sign-up didn't finish completely - try signing up again, or double-check you're using the right email if you have more than one account.")
        )
        signOut(auth).catch(() => {})
      },
      () => {
        setUser(null)
        setLoading(false)
        setError(tr("We couldn't load your account. Please try signing in again."))
        signOut(auth).catch(() => {})
      }
    )
    return unsub
  }, [firebaseUser])

  const signIn = React.useCallback(async (email: string, password: string) => {
    setError(null)
    // A real, normal sign-in - never how admin impersonation happens (that
    // goes through ImpersonatePage's own signInWithCustomToken instead).
    // Clearing this here is what stops the "Viewing as ... (admin
    // preview)" banner from getting stuck showing forever in a browser
    // tab that was used to impersonate a provider once, then later signed
    // into normally - sessionStorage isn't cleared by a page refresh, only
    // by closing the tab or explicitly clearing it like this.
    clearImpersonatingSession()
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError(mapAuthError(err))
      throw err
    }
  }, [])

  const signInWithIdentifier = React.useCallback(
    async (identifier: string, password: string) => {
      setError(null)
      clearImpersonatingSession()
      try {
        const trimmed = identifier.trim()
        let email = trimmed
        if (!trimmed.includes("@")) {
          // Doesn't look like an email - treat it as a phone number and
          // resolve it to the matching account's email server-side.
          // Firebase Auth's email/password provider still needs an email
          // under the hood; this just lets the person type either.
          const resolve = httpsCallable(functions, "resolveLoginEmail")
          const res = await resolve({ phone: trimmed })
          email = (res.data as { email: string }).email
        }
        await signInWithEmailAndPassword(auth, email, password)
      } catch (err) {
        setError(mapAuthError(err))
        throw err
      }
    },
    []
  )

  const signUp = React.useCallback(async (input: SignUpInput) => {
    setError(null)
    clearImpersonatingSession()
    signingUpRef.current = true
    try {
      if (input.role === "provider") {
        const businessId = randomBusinessId()
        const cred = await createUserWithEmailAndPassword(
          auth,
          input.email,
          input.password
        )

        // Everything after this point writes the Firestore profile that
        // makes this Auth account actually usable. If any of it fails
        // partway through (a dropped connection, a transient rules
        // hiccup right after sign-up, etc.) the account must not be left
        // behind with no matching users/{uid} doc - that's exactly the
        // "We couldn't find an account profile for this login" dead end.
        // Mirrors the owner sign-up path's rollback below.
        try {
          await updateProfile(cred.user, { displayName: input.name })
          // Sent via the sendVerificationEmail Cloud Function (Resend, the
          // same sender Verde's invoices/reports/invites already use) -
          // NOT Firebase Auth's own built-in verification email, which
          // comes from a shared @<project>.firebaseapp.com address with no
          // sender reputation of its own and lands straight in spam/junk
          // for most people. Best-effort - a business owner should never
          // be blocked from finishing sign-up just because this happened
          // to fail (rate limits, a transient hiccup). The verify-email
          // banner's "Resend" button covers this either way.
          httpsCallable(functions, "sendEmailCode")({}).catch(() => {})

          await setDoc(doc(db, "businesses", businessId), {
            name: input.businessName,
            address: input.businessAddress,
            customerCountRange: input.customerCountRange ?? null,
            teamSizeRange: input.teamSizeRange ?? null,
            phone: input.businessPhone ?? null,
            website: input.website ?? null,
            hours: input.hours ?? null,
            ownerUid: cred.user.uid,
            createdAt: serverTimestamp(),
          })

          await setDoc(doc(db, "users", cred.user.uid), {
            businessId,
            role: "provider",
            // The account that signs a business up is always its first
            // admin - adding technicians (or additional admins) afterward
            // happens from Profile > Team, via the createTechnician Cloud
            // Function (see functions/team.js).
            businessRole: "admin",
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            createdAt: serverTimestamp(),
          })

          // Signed up from a referral link? Tell the server so BOTH
          // businesses get their free months (functions/referrals.js).
          // Best-effort like the verification email above: a bad or reused
          // code must never get in the way of finishing sign-up.
          const referralCode = getStoredReferral()
          if (referralCode) {
            httpsCallable(functions, "recordReferral")({ code: referralCode })
              .then(() => clearStoredReferral())
              .catch(() => {})
          }
        } catch (innerErr) {
          await cred.user.delete().catch(() => {
            // Best-effort cleanup; if this fails the account is still
            // usable for a retry via sign-in once support fixes the
            // linkage.
          })
          throw innerErr
        }
        return
      }

      // Owner (customer) sign-up: create the auth account, then hand the
      // invite code off to the claimInvite Cloud Function, which validates
      // it and creates the users/{uid} profile + claims the property in one
      // server-side transaction (see functions/claim-invite.js for why this
      // is a Cloud Function rather than sequential client-side writes - the
      // short version is that the old approach could intermittently fail
      // with "Missing or insufficient permissions" right after a valid
      // sign-up, which is not something a client-side retry can fix).
      const code = input.inviteCode.trim().toUpperCase()
      const cred = await createUserWithEmailAndPassword(
        auth,
        input.email,
        input.password
      )

      try {
        await updateProfile(cred.user, { displayName: input.name })

        const claim = httpsCallable(functions, "claimInvite")
        await claim({
          code,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
        })
      } catch (innerErr) {
        await cred.user.delete().catch(() => {
          // Best-effort cleanup; if this fails the account is still usable
          // for a retry via sign-in once support fixes the linkage.
        })
        throw innerErr
      }
    } catch (err) {
      setError(mapAuthError(err))
      throw err
    } finally {
      signingUpRef.current = false
    }
  }, [])

  const logout = React.useCallback(async () => {
    clearImpersonatingSession()
    await signOut(auth)
  }, [])

  const updateUserProfile = React.useCallback(
    async (patch: { name?: string; phone?: string; language?: "en" | "es" }) => {
      if (!firebaseUser) throw new Error(tr("Not signed in."))
      const updates: Record<string, string | null> = {}
      if (patch.name !== undefined) updates.name = patch.name
      if (patch.phone !== undefined) updates.phone = patch.phone || null
      if (patch.language !== undefined) updates.language = patch.language
      if (Object.keys(updates).length === 0) return
      await updateDoc(doc(db, "users", firebaseUser.uid), updates)
      if (patch.name !== undefined) {
        await updateProfile(firebaseUser, { displayName: patch.name }).catch(() => {
          // Best-effort - the Firestore doc above is the source of truth
          // the app actually reads, so a failure here is not worth
          // surfacing as an error to the user.
        })
      }
    },
    [firebaseUser]
  )

  const deleteMyAccount = React.useCallback(async () => {
    setError(null)
    const del = httpsCallable(functions, "selfDeleteAccount")
    await del({})
    await signOut(auth).catch(() => {
      // Best-effort - the Cloud Function above already deleted the Auth
      // account server-side, so a local sign-out failure here is harmless.
    })
  }, [])

  const resendVerificationEmail = React.useCallback(async () => {
    if (!firebaseUser) throw new Error(tr("Not signed in."))
    const send = httpsCallable(functions, "sendVerificationEmail")
    await send({})
  }, [firebaseUser])

  const refreshEmailVerified = React.useCallback(async () => {
    const current = auth.currentUser
    if (!current) return
    await current.reload()
    await current.getIdToken(true)
    setEmailVerified(current.emailVerified)
  }, [])

  const resetPassword = React.useCallback(async (email: string) => {
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err) {
      setError(mapAuthError(err))
      throw err
    }
  }, [])

  const clearError = React.useCallback(() => setError(null), [])

  const value = React.useMemo(
    () => ({
      user,
      loading,
      error,
      emailVerified,
      resendVerificationEmail,
      refreshEmailVerified,
      signIn,
      signInWithIdentifier,
      signUp,
      logout,
      resetPassword,
      updateUserProfile,
      deleteMyAccount,
      clearError,
    }),
    [
      user,
      loading,
      error,
      emailVerified,
      resendVerificationEmail,
      refreshEmailVerified,
      signIn,
      signInWithIdentifier,
      signUp,
      logout,
      resetPassword,
      updateUserProfile,
      deleteMyAccount,
      clearError,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ""
  // Check this specific, unambiguous code before the "user-not-found"
  // check below - "auth/user-not-found" contains the substring
  // "not-found" too, so a generic check would misfire on it.
  if (code.includes("functions/not-found"))
    return tr("No account found with that phone number.")
  if (code.includes("email-already-in-use"))
    return tr("An account with that email already exists.")
  if (code.includes("invalid-credential") || code.includes("wrong-password"))
    return tr("Incorrect email or password.")
  if (code.includes("user-not-found")) return tr("No account found with that email.")
  if (code.includes("weak-password"))
    return tr("Password should be at least 6 characters.")
  if (code.includes("invalid-email")) return tr("That email address looks invalid.")
  return err instanceof Error ? err.message : tr("Something went wrong.")
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

/** True for a "provider" role account that can manage customers, billing,
 * team, and the business profile - false for a technician. A missing
 * businessRole (every account created before this feature shipped)
 * defaults to admin, matching the server-side default in
 * firestore.rules' myBusinessRole(). Owner and platform-admin accounts
 * are never business admins by this definition. */
export function isBizAdmin(user: Pick<AppUser, "role" | "businessRole"> | null | undefined) {
  return !!user && user.role === "provider" && (user.businessRole ?? "admin") === "admin"
}

export { randomInviteCode }
export type { UserRole }
