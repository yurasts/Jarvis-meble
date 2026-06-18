
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// undefined = сессию ещё не проверили, null = проверили, гостя нет
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
      setProfile(null)
      setProfilesById({})
      setProfilesLoaded(false)
      return
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

  const value = {
    session,
    profile,
    profilesById,
    loadingSession: session === undefined,
    // сессия есть, но строки в profiles ещё нет — владелец не завёл доступ
    awaitingAccess: !!session && profilesLoaded && !profile,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
