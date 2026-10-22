import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { AuthContext } from './authContextCore'
import useActivityTracker from './components/useActivityTracker'

const PROFILE_COLUMNS = [
  'id',
  'full_name',
  'role',
  'color',
  'theme',
  'default_scope',
].join(',')

export function AuthProvider({ children }) {
  const [session,        setSession]        = useState(undefined)
  const [profile,        setProfile]        = useState(null)
  const [profilesById,   setProfilesById]   = useState({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  const sessionUserId = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data?.session ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      // Очистка профиля при выходе — здесь, в асинхронном auth-колбэке, а не
      // синхронным каскадом setState в зависимом эффекте ниже.
      if (!newSession) {
        setProfile(null)
        setProfilesById({})
        setProfilesLoaded(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useActivityTracker({ session })

  const refreshProfiles = useCallback(async () => {
    if (!sessionUserId) return { error: null }

    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS)
    if (!error && data) {
      setProfilesById(Object.fromEntries(data.map(p => [p.id, p])))
      setProfile(data.find(p => p.id === sessionUserId) || null)
    }
    setProfilesLoaded(true)
    return { error }
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId) return
    async function loadProfiles() {
      await refreshProfiles()
    }
    loadProfiles()
  }, [sessionUserId, refreshProfiles])

  // Применяем тему к DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', profile?.theme || 'light')
  }, [profile?.theme])

  async function updateTheme(newTheme) {
    if (!profile) return
    const { data } = await supabase.from('profiles')
      .update({ theme: newTheme }).eq('id', profile.id).select(PROFILE_COLUMNS).single()
    if (data) {
      setProfile(data)
      setProfilesById(prev => ({ ...prev, [data.id]: data }))
    }
  }

  const theme = profile?.theme || 'light'
  const isDark = theme === 'dark'

  const value = {
    session, profile, profilesById, isDark, theme,
    loadingSession: session === undefined,
    awaitingAccess: !!session && profilesLoaded && !profile,
    updateTheme,
    refreshProfiles,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
