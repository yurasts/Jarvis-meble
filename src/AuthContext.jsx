import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { AuthContext } from './authContextCore'

export function AuthProvider({ children }) {
  const [session,        setSession]        = useState(undefined)
  const [profile,        setProfile]        = useState(null)
  const [profilesById,   setProfilesById]   = useState({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  // ✅ Presence: кто сейчас онлайн { userId: { profile, activeTab } }
  const [onlineUsers, setOnlineUsers] = useState({})
  // Канал presence живёт в ref, а не в state — сам по себе не влияет на рендер,
  // и не требует synchronous setState внутри эффекта его создания (см. ниже).
  const presenceChannelRef = useRef(null)

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

  useEffect(() => {
    if (!session) return
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

  // ✅ Presence: подключаемся к каналу когда профиль загружен.
  // Примитивы вместо объектов session/profile в зависимостях — эффект (пересоздание
  // канала) реагирует именно на смену пользователя/сессии и на смену имени/цвета
  // (то, что реально трекается), а не на любую смену ссылки на объект profile
  // (например, смену theme, которая presence не касается).
  const sessionUserId   = session?.user?.id
  const profileId       = profile?.id
  const profileFullName = profile?.full_name
  const profileColor    = profile?.color || '#718096'

  useEffect(() => {
    if (!sessionUserId || !profileId) return

    const channel = supabase.channel('jarvis-online', {
      config: { presence: { key: sessionUserId } }
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
            userId:    profileId,
            fullName:  profileFullName,
            color:     profileColor,
            activeTab: 'dashboard',
          })
        }
      })

    presenceChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      // Снимаем ref, только если он всё ещё указывает на канал именно этого
      // эффекта — StrictMode-двойной mount не оставит "чужой" канал висящим.
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null
      }
    }
  }, [sessionUserId, profileId, profileFullName, profileColor])

  // ✅ Обновляем активную вкладку в Presence
  const updatePresenceTab = useCallback(async (tab) => {
    const channel = presenceChannelRef.current
    if (!channel || !profile) return
    await channel.track({
      userId:    profile.id,
      fullName:  profile.full_name,
      color:     profile.color || '#718096',
      activeTab: tab,
    })
  }, [profile])

  async function updateTheme(newTheme) {
    if (!profile) return
    const { data } = await supabase.from('profiles')
      .update({ theme: newTheme }).eq('id', profile.id).select().single()
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
    updatePresenceTab,
    onlineUsers,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
