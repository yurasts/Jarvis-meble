import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,        setSession]        = useState(undefined)
  const [profile,        setProfile]        = useState(null)
  const [profilesById,   setProfilesById]   = useState({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  // ✅ Presence: кто сейчас онлайн { userId: { profile, activeTab } }
  const [onlineUsers, setOnlineUsers] = useState({})
  const [presenceChannel, setPresenceChannel] = useState(null)

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

  // Применяем тему к DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', profile?.theme || 'light')
  }, [profile?.theme])

  // ✅ Presence: подключаемся к каналу когда профиль загружен
  useEffect(() => {
    if (!session || !profile) return

    // Отписываемся от предыдущего канала если был
    if (presenceChannel) {
      supabase.removeChannel(presenceChannel)
    }

    const channel = supabase.channel('jarvis-online', {
      config: { presence: { key: session.user.id } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // state = { userId: [{ profile, activeTab, ... }] }
        const users = {}
        Object.entries(state).forEach(([userId, presences]) => {
          // берём последнее присутствие пользователя
          users[userId] = presences[presences.length - 1]
        })
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId:    profile.id,
            fullName:  profile.full_name,
            color:     profile.color || '#718096',
            activeTab: 'dashboard',
          })
        }
      })

    setPresenceChannel(channel)

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, profile?.id])

  // ✅ Обновляем активную вкладку в Presence
  const updatePresenceTab = useCallback(async (tab) => {
    if (!presenceChannel || !profile) return
    await presenceChannel.track({
      userId:    profile.id,
      fullName:  profile.full_name,
      color:     profile.color || '#718096',
      activeTab: tab,
    })
  }, [presenceChannel, profile])

  async function updateTheme(newTheme) {
    if (!profile) return
    const { data } = await supabase.from('profiles')
      .update({ theme: newTheme }).eq('id', profile.id).select().single()
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
    updatePresenceTab,
    onlineUsers,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
