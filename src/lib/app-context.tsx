import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from './firebase'
import { rememberLang, savedLang, translate } from './i18n'
import type { Key } from './i18n'
import type { Lang, Profile, ProviderProfile, Role } from './types'

interface AppState {
  user: User | null
  profile: Profile | null
  providerProfile: ProviderProfile | null
  /** the one language every screen is shown in; null until the user picks */
  lang: Lang | null
  authReady: boolean
  /** signed in but the profile document has not arrived yet */
  profileLoading: boolean
  t: (key: Key, vars?: Record<string, string | number>) => string
  chooseLang: (lang: Lang) => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'phone' | 'address' | 'language'>>) => Promise<void>
  updateProviderProfile: (patch: Partial<ProviderProfile>) => Promise<void>
  linkToProvider: (code: string) => Promise<void>
}

export interface SignUpInput {
  role: Role
  name: string
  email: string
  password: string
  phone?: string
  providerCode?: string
}

const AppContext = createContext<AppState | null>(null)

function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid mix-ups
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null)
  const [chosen, setChosen] = useState<Lang | null>(() => savedLang())
  const signingUp = useRef(false)

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u)
    setAuthReady(true)
    if (!u) {
      setProfile(null)
      setProfileLoaded(false)
    }
  }), [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? ({ uid: user.uid, ...snap.data() } as Profile) : null)
      setProfileLoaded(true)
    }, () => setProfileLoaded(true))
  }, [user])

  const providerUid = profile ? (profile.role === 'provider' ? profile.uid : profile.providerId) : undefined
  useEffect(() => {
    if (!providerUid) {
      setProviderProfile(null)
      return
    }
    return onSnapshot(doc(db, 'providerProfiles', providerUid), (snap) => {
      setProviderProfile(snap.exists() ? (snap.data() as ProviderProfile) : null)
    }, () => setProviderProfile(null))
  }, [providerUid])

  // The account's language wins once there is an account; before that, the
  // one picked on the first screen.
  const lang: Lang | null = profile?.language ?? chosen

  useEffect(() => {
    if (lang) {
      rememberLang(lang)
      document.documentElement.lang = lang
    }
  }, [lang])

  const t = useCallback<AppState['t']>((key, vars) => translate(lang ?? 'en', key, vars), [lang])

  const chooseLang = useCallback((l: Lang) => {
    rememberLang(l)
    setChosen(l)
  }, [])

  const linkToProvider = useCallback(async (code: string) => {
    const fn = httpsCallable<{ code: string }, { ok: true }>(functions, 'linkToProvider')
    await fn({ code: code.trim().toUpperCase() })
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    if (!chosen) throw new Error('no-language')
    signingUp.current = true
    try {
      const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password)
      const base = {
        role: input.role,
        language: chosen,
        name: input.name.trim(),
        email: input.email.trim(),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      }
      if (input.role === 'provider') {
        await setDoc(doc(db, 'users', cred.user.uid), { ...base, inviteCode: newInviteCode() })
        await setDoc(doc(db, 'providerProfiles', cred.user.uid), {
          name: base.name,
          language: chosen,
          ...(base.phone ? { phone: base.phone } : {}),
        })
      } else {
        await setDoc(doc(db, 'users', cred.user.uid), base)
        if (input.providerCode?.trim()) {
          try {
            await linkToProvider(input.providerCode)
          } catch {
            // The account exists; the customer can enter the code again from
            // the home screen. Not worth failing the whole sign-up over.
          }
        }
      }
    } finally {
      signingUp.current = false
    }
  }, [chosen, linkToProvider])

  const signOut = useCallback(async () => {
    await fbSignOut(auth)
  }, [])

  const updateProfile = useCallback<AppState['updateProfile']>(async (patch) => {
    if (!user) return
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    await updateDoc(doc(db, 'users', user.uid), clean)
    if (profile?.role === 'provider') {
      // Keep the part of the profile that customers can see in step.
      const pub: Partial<ProviderProfile> = {}
      if (patch.name) pub.name = patch.name
      if (patch.language) pub.language = patch.language
      if (patch.phone !== undefined) pub.phone = patch.phone
      if (Object.keys(pub).length) await setDoc(doc(db, 'providerProfiles', user.uid), pub, { merge: true })
    }
  }, [user, profile?.role])

  const updateProviderProfile = useCallback<AppState['updateProviderProfile']>(async (patch) => {
    if (!user) return
    await setDoc(doc(db, 'providerProfiles', user.uid), patch, { merge: true })
  }, [user])

  const value = useMemo<AppState>(() => ({
    user, profile, providerProfile, lang, authReady,
    profileLoading: !!user && !profileLoaded,
    t, chooseLang, signIn, signUp, signOut, updateProfile, updateProviderProfile, linkToProvider,
  }), [user, profile, providerProfile, lang, authReady, profileLoaded, t, chooseLang, signIn, signUp, signOut, updateProfile, updateProviderProfile, linkToProvider])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
