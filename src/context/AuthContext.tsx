import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from '@/lib/api'
import { can as canWithRole, hasAny, type Permission } from '@/lib/permissions'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  role: Role | null
  loading: boolean
  error: string | null
  configured: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  refreshProfile: () => Promise<void>
  bootstrapOwner: () => Promise<void>
  can: (permission: Permission) => boolean
  canAny: (permissions: Permission[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (currentSession: Session | null): Promise<Profile | null> => {
    if (!currentSession?.user) {
      setProfile(null)
      return null
    }
    try {
      const result = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .maybeSingle()
      if (result.error) throw result.error
      const next = (result.data as Profile | null) ?? null
      setProfile(next)
      return next
    } catch (err) {
      setProfile(null)
      throw err
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const { data, error: sessionError } = await getSupabase().auth.getSession()
    if (sessionError) throw sessionError
    setSession(data.session)
    await loadProfile(data.session)
  }, [loadProfile])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true
    const supabase = getSupabase()
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      try { await loadProfile(data.session) } catch (err) { if (active) setError(errorMessage(err)) }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      void loadProfile(nextSession).catch((err) => setError(errorMessage(err)))
      setLoading(false)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    role: profile?.role ?? null,
    loading,
    error,
    configured: isSupabaseConfigured,
    isConfigured: isSupabaseConfigured,
    signIn: async (email, password) => {
      setError(null)
      const { data, error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(), password,
      })
      if (signInError) throw signInError
      const nextSession = data.session
      setSession(nextSession)
      const nextProfile = await loadProfile(nextSession)
      if (nextProfile && nextProfile.is_active === false) {
        await getSupabase().auth.signOut()
        setSession(null)
        setProfile(null)
        throw new Error('This account has been deactivated. Contact the store owner.')
      }
    },
    signUp: async (email, password, fullName) => {
      setError(null)
      const { error: signUpError } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpError) throw signUpError
    },
    signOut: async () => {
      if (isSupabaseConfigured) {
        const { error: signOutError } = await getSupabase().auth.signOut()
        if (signOutError) throw signOutError
      }
      setSession(null)
      setProfile(null)
    },
    refresh,
    refreshProfile: async () => { await refresh() },
    bootstrapOwner: async () => {
      await api.bootstrapOwner()
      await refresh()
    },
    can: (permission) => canWithRole(profile?.role, permission),
    canAny: (permissions) => hasAny(profile?.role, permissions),
  }), [session, profile, loading, error, refresh, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
