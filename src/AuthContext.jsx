import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profilesById, setProfilesById] = useState({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data?.session ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null); setProfilesById({}); setProfilesLoaded(false); return
    }
    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('*')
      if (data) {
        setProfilesById(Object.fromEntries(data.map(p => [p.id, p])))
        setProfile(data.find(p => p.id === session.user.id) || null)
      }
      setProfilesLoaded(true)
    }
    loadProfiles()
  }, [session])

  // Применяем тему к DOM при каждом изменении профиля
  useEffect(() => {
    const theme = profile?.theme || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [profile?.theme])

  async function updateTheme(newTheme) {
    if (!profile) return
    const { data } = await supabase.from('profiles').update({ theme: newTheme }).eq('id', profile.id).select().single()
    if (data) {
      setProfile(data)
      setProfilesById(prev => ({ ...prev, [data.id]: data }))
    }
  }

  const isDark = (profile?.theme || 'light') === 'dark'

  const value = {
    session, profile, profilesById, isDark,
    loadingSession: session === undefined,
    awaitingAccess: !!session && profilesLoaded && !profile,
    updateTheme,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
