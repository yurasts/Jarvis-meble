import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './useAuth'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import KanbanBoard from './components/KanbanBoard'
import MaterialsList from './components/MaterialsList'
import ProductionTab from './components/ProductionTab'
import ProjectModal from './components/ProjectModal'
import Settings from './components/Settings'
import AiAssistant from './components/AiAssistant';
import GlobalSearch from './components/GlobalSearch';
import ProjectNav from './components/ProjectNav';
import ProjectListPanel from './components/ProjectListPanel';
import MobileProjectsScreen from './components/MobileProjectsScreen';
import MobileBottomNav from './components/MobileBottomNav';
import MobileClientBalanceScreen from './components/MobileClientBalanceScreen';
import { useIsDesktop } from './utils/useIsDesktop';
import { LayoutDashboard, FolderKanban, Wrench, Package, Settings as SettingsIcon } from 'lucide-react'
import s from './App.module.css'

// "Panel", а не "Dzisiaj" — отдельный экран "на сегодня" пока не реализован (см. ADR-002).
const TAB_LABELS = {
  dashboard:  'Panel',
  board:      'Tablica projektów',
  production: 'Produkcja',
  materials:  'Materiały',
  settings:   'Ustawienia',
}

const TABS = [
  { id: 'dashboard',  label: 'Panel',              Icon: LayoutDashboard },
  { id: 'board',      label: 'Tablica projektów',  Icon: FolderKanban    },
  { id: 'production', label: 'Produkcja',          Icon: Wrench          },
  { id: 'materials',  label: 'Materiały',          Icon: Package         },
  { id: 'settings',   label: 'Ustawienia',         Icon: SettingsIcon    },
]

const initials = (name) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

const PERSONAL_SCOPE_IDENTITIES = new Set(['yury', 'yurysts', 'yuryshab', 'alex'])

const normalizeIdentity = (value) =>
  String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

const defaultProjectScope = (profile, session) => {
  const emailName = session?.user?.email?.split('@')[0] || ''
  const candidates = [
    profile?.full_name,
    session?.user?.user_metadata?.full_name,
    emailName,
  ].flatMap((value) => {
    const normalized = normalizeIdentity(value)
    const firstName = normalizeIdentity(String(value || '').split(/\s+/)[0])
    return [normalized, firstName]
  })

  return candidates.some((value) =>
    PERSONAL_SCOPE_IDENTITIES.has(value) || /^yuryshab\\d+$/.test(value) || /^alex\\d+$/.test(value))
    ? 'personal'
    : 'firma'
}

// Убран с экрана по просьбе (пока, не окончательно) — компонент/код оставлены нетронутыми,
// включить обратно — просто вернуть true.
const AI_ASSISTANT_ENABLED = false

function App() {
  const { session, profile: authProfile, profilesById, isDark, theme, loadingSession, awaitingAccess, signOut, updatePresenceTab, onlineUsers } = useAuth()
  // Forest — тоже тёмная по духу тема: компонентам, красящим себя через
  // свой light/dark-хелпер (ProjectModal, Kanban, MaterialsList, Production),
  // передаём именно этот флаг, чтобы они не "светлели" в Forest.
  const isDarkish = isDark || theme === 'forest'
  const [localProfile, setLocalProfile] = useState(null)

  const [activeTab, setActiveTab]   = useState('dashboard')
  // 'tab' — обычный контент активного раздела; 'project' — рабочая область проекта справа (desktop, ADR-002 UX-фаза 2)
  const [viewMode, setViewMode] = useState('tab')
  // Единая граница mobile shell / desktop-tablet — 767px и ниже, 768px и выше (см. useIsDesktop.js).
  // !isDesktop используется и как признак mobile shell (ADR-003) — отдельного хука больше нет,
  // раньше isMobileShell был на (max-width: 767px), а isDesktop — на (min-width: 769px), из-за
  // чего 768px не попадал ни в тот, ни в другой диапазон.
  const isDesktop = useIsDesktop()
  // Показывать ли мобильный экран Projekty вместо обычного контента активной вкладки.
  // true по умолчанию — на мобильном свежая загрузка сразу открывает список проектов.
  const [showMobileHome, setShowMobileHome] = useState(true)
  // Ручной выбор группы живёт только до выхода. Guard во время рендера синхронно сбрасывает
  // его при смене auth-пользователя (включая logout → повторный login того же аккаунта), без
  // setState в effect и без сброса при штатном обновлении access token.
  const authUserId = session?.user?.id || null
  const [scopeSelection, setScopeSelection] = useState(null) // { userId, scope } | null
  const [scopeSelectionUserId, setScopeSelectionUserId] = useState(authUserId)
  if (scopeSelectionUserId !== authUserId) {
    setScopeSelectionUserId(authUserId)
    setScopeSelection(null)
  }
  const [menuOpen,  setMenuOpen]    = useState(false)
  const [clients,   setClients]     = useState([])
  const [materials, setMaterials]   = useState([])
  const [servicesList, setServicesList] = useState([])
  // Mobile / Client Balance / Expanded v1 — единый массив реальных денежных операций всех
  // доступных проектов, один Supabase-запрос (см. fetchData ниже), общий для Bilans klienta
  // (MobileClientBalanceScreen) и вкладки Rozliczenia (mobile ProjectModal) — без копирования
  // данных между экранами и без отдельного запроса на карточку.
  const [cashTransactions, setCashTransactions] = useState([])
  // 'loading' | 'error' | 'ready' — источник правды для Bilans klienta/Rozliczenia о том, можно ли
  // доверять cashTransactions. Без этого сбой запроса (нет таблицы, RLS, сеть) молча оставлял бы
  // cashTransactions=[] и оба экрана показывали бы 0.00 zł/"Brak operacji", будто это настоящий
  // ноль (review P1) — вместо этого экраны обязаны показать "не удалось загрузить" и не показывать
  // никаких сумм, пока статус не 'ready'.
  const [cashStatus, setCashStatus] = useState('loading')
  // client_name, для которого сейчас открыт Bilans klienta — null, когда экран закрыт.
  const [balanceClientName, setBalanceClientName] = useState(null)

  const [isModalOpen,     setIsModalOpen]     = useState(false)
  const [activeClient,    setActiveClient]    = useState(null)
  const [searchFocusTarget, setSearchFocusTarget] = useState(null) // { clientName, projectId, taskId } | null
  // Стабильная ссылка на колбэк — иначе эффект Dashboard, зависящий от onFocusHandled,
  // перезапускался бы на каждый ре-рендер App.jsx (onFocusHandled менял бы identity).
  const handleSearchFocusHandled = useCallback(() => setSearchFocusTarget(null), [])
  const [originalClient,  setOriginalClient]  = useState(null)
  // Czy aktualnie zamontowany ProjectModal (embedded lub modal) zgłasza niezapisane zmiany —
  // źródło prawdy pozostaje w ProjectModal (isDirty), tu tylko odbieramy stan (ADR-002, UX-faza 2.1).
  const [workspaceDirty,  setWorkspaceDirty]  = useState(false)
  // Projekt, który użytkownik próbuje otworzyć zamiast aktualnego (gdy są niezapisane zmiany)
  const [pendingClient,   setPendingClient]   = useState(null) // { client, initialTab } | null

  const [name,     setName]     = useState('')
  const [projectName, setProjectName] = useState('')
  const [phone,    setPhone]    = useState('')
  const [budget,   setBudget]   = useState('')
  const [deadline, setDeadline] = useState('')
  const [address,  setAddress]  = useState('')

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [duplicateFound,      setDuplicateFound]      = useState(null)
  const [matName,     setMatName]     = useState('')
  const [matCategory, setMatCategory] = useState('Płyta')
  const [matUnit,     setMatUnit]     = useState('szt')
  const [matPrice,    setMatPrice]    = useState('')

  const topbarRef = useRef(null)
  // Кнопка "Więcej" мобильной нижней навигации тоже открывает dropdown топбара (ADR-003) —
  // клики по ней не должны считаться "снаружи" в обработчике ниже.
  const bottomNavRef = useRef(null)

  // Закрываем dropdown при тапе вне него (топбара и мобильной нижней навигации)
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      const insideTopbar = topbarRef.current && topbarRef.current.contains(e.target)
      const insideBottomNav = bottomNavRef.current && bottomNavRef.current.contains(e.target)
      if (!insideTopbar && !insideBottomNav) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('touchstart', handler)
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('mousedown', handler)
    }
  }, [menuOpen])

  // Один запрос на ВСЕ доступные операции (не по проекту) — Bilans klienta агрегирует несколько
  // проектов клиента разом, а Rozliczenia фильтрует тот же массив на activeClient.id, без
  // отдельного fetch на каждую карточку. RLS на project_cash_transactions ограничивает то, что
  // реально вернётся, тем же способом, что и видимость строк clients (см. подготовленную, но
  // не применённую миграцию — supabase/migrations/…create_project_cash_transactions.sql).
  // Отдельная функция (не только внутри fetchData) — переиспользуется кнопкой "Spróbuj ponownie"
  // в Bilans klienta/Rozliczenia при cashStatus==='error' (review P1).
  const loadCashTransactions = useCallback(async () => {
    setCashStatus('loading')
    const { data, error } = await supabase.from('project_cash_transactions').select('*')
    if (error) { setCashStatus('error'); return }
    setCashTransactions(data || [])
    setCashStatus('ready')
  }, [])

  useEffect(() => {
    if (!session) return
    async function fetchData() {
      const { data: clientsData }   = await supabase.from('clients').select('*')
      if (clientsData)   setClients(clientsData)
      const { data: materialsData } = await supabase.from('materials').select('*')
      if (materialsData) setMaterials(materialsData)
      const { data: servicesData }  = await supabase.from('services').select('*')
      if (servicesData)  setServicesList(servicesData)
      loadCashTransactions()
    }
    fetchData()
  }, [session, loadCashTransactions])

  const [projectModalTab, setProjectModalTab] = useState('materials')

  const openProjectModal = (client, initialTab = 'materials') => {
    setBalanceClientName(null)
    setActiveClient(client)
    setOriginalClient(JSON.parse(JSON.stringify(client)))
    setProjectModalTab(initialTab)
    setViewMode('project') // на desktop открывает рабочую область справа; на mobile ни на что не влияет (там всегда модалка)
  }

  // Точка входа для всех мест открытия проекта (левая панель, Dashboard, Kanban, поиск):
  // если открыт ДРУГОЙ проект с несохранёнными изменениями — не заменяет его сразу, а просит
  // подтверждение через тот же диалог, что и закрытие карточки (ADR-002, UX-faza 2.1).
  const requestOpenProject = (client, initialTab = 'materials') => {
    if (activeClient && workspaceDirty && client.id !== activeClient.id) {
      setPendingClient({ client, initialTab })
      setViewMode('project') // возвращает рабочую область в видимость, чтобы диалог было видно
      return
    }
    openProjectModal(client, initialTab)
  }

  const confirmPendingSwitch = () => {
    const target = pendingClient
    setPendingClient(null)
    if (target) openProjectModal(target.client, target.initialTab)
  }

  const cancelPendingSwitch = () => setPendingClient(null)

  const goToTab = (id) => {
    setBalanceClientName(null)
    setActiveTab(id)
    setViewMode('tab') // уходя в глобальный раздел, скрываем рабочую область проекта (сам выбранный проект не сбрасываем)
    setPendingClient(null) // не оставляем «зависший» диалог переключения, если он был открыт
    setShowMobileHome(false) // уходя на конкретную вкладку — скрываем мобильный экран Projekty (ADR-003)
    setMenuOpen(false) // закрываем dropdown топбара, если был открыт (в т.ч. если попали сюда через "Więcej")
    updatePresenceTab?.(id)
  }

  // Мобильная нижняя навигация (ADR-003): "Projekty" возвращает к мобильному экрану списка
  // проектов, не трогая activeTab — сам выбранный desktop-раздел под ним не сбрасывается.
  const showMobileProjectsHome = () => {
    setShowMobileHome(true)
    setMenuOpen(false)
  }

  // "Więcej" (Mobile Project List v1, P1): старый мобильный topbar/dropdown теперь не рендерится
  // вообще, пока открыт полноэкранный Projekty (см. !showMobileProjects ниже в JSX) — значит,
  // прежде чем открыть dropdown, нужно сначала уйти с экрана Projekty, иначе topbar/dropdown
  // просто негде показать. showMobileProjectsHome (кнопка "Projekty") при возврате, как и раньше,
  // закрывает dropdown.
  const showMoreMenu = () => {
    setShowMobileHome(false)
    setMenuOpen(o => !o)
  }

  async function updateClientFields(clientId, updatedFields) {
    setClients(clients.map(c => c.id === clientId ? { ...c, ...updatedFields } : c))
    await supabase.from('clients').update(updatedFields).eq('id', clientId)
  }

  async function handleAddClient(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('clients').insert([{
      full_name: name, client_name: name, project_name: projectName, phone, budget: Number(budget) || 0,
      deadline: deadline || null, address, status: 'new', project_scope: effectiveScope
    }]).select()
    if (!error && data) {
      setClients([...clients, data[0]])
      setName(''); setProjectName(''); setPhone(''); setBudget(''); setDeadline(''); setAddress('')
      setIsModalOpen(false)
    }
  }

  async function handleUpdateClient(e) {
    if (e && e.preventDefault) e.preventDefault()
    const { data, error } = await supabase.from('clients')
      .update({
        client_name:        activeClient.client_name,
        project_name:       activeClient.project_name,
        project_scope:      activeClient.project_scope || 'firma',
        notes:              activeClient.notes,
        deadline:           activeClient.deadline,
        address:            activeClient.address,
        phone:              activeClient.phone || '',
        calc_materials:     activeClient.calc_materials    || [],
        calc_services:      activeClient.calc_services     || [],
        calc_expenses:      activeClient.calc_expenses     || [],
        tasks:              activeClient.tasks             || [],
        budget:             activeClient.budget            || 0,
        budget_coefficient: activeClient.budget_coefficient || 2.0,
      })
      .eq('id', activeClient.id).select()
    if (!error && data) {
      setClients(clients.map(c => c.id === activeClient.id ? data[0] : c))
      setOriginalClient(JSON.parse(JSON.stringify(data[0])))
    }
    return { error }
  }

  async function handleAddMaterial(e) {
    e.preventDefault()
    const { data: existing } = await supabase
      .from('materials').select('*').ilike('name', matName.trim()).maybeSingle()
    if (existing) {
      setDuplicateFound({
        existing,
        newPrice: Number(matPrice),
        samePrice: Math.abs(Number(existing.price) - Number(matPrice)) < 0.001
      })
      return
    }
    const { data, error } = await supabase
      .from('materials')
      .insert([{ name: matName, category: matCategory, unit: matUnit, price: Number(matPrice), price_history: [] }])
      .select()
    if (!error && data) {
      setMaterials([...materials, data[0]])
      setMatName(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    }
  }

  async function handleConfirmPriceUpdate() {
    const { existing, newPrice } = duplicateFound
    const today   = new Date().toISOString().split('T')[0]
    const history = [...(existing.price_history || []), { price: existing.price, date: today }]
    const { data, error } = await supabase
      .from('materials').update({ price: newPrice, price_history: history })
      .eq('id', existing.id).select()
    if (!error && data) {
      setMaterials(materials.map(m => m.id === existing.id ? data[0] : m))
      setDuplicateFound(null)
      setMatName(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    }
  }

  async function reloadMaterials() {
    const { data } = await supabase.from('materials').select('*')
    if (data) setMaterials(data)
  }

  const handleDragStart = (e, id) => e.dataTransfer.setData('clientId', id)
  const handleDragOver  = (e)     => e.preventDefault()
  const handleDrop      = async (e, newStatus) => {
    const id = e.dataTransfer.getData('clientId')
    setClients(clients.map(c => c.id.toString() === id ? { ...c, status: newStatus } : c))
    await supabase.from('clients').update({ status: newStatus }).eq('id', id)
  }

  async function handleToggleProductionStep(client, stepId, isDone) {
    const updatedSteps = { ...(client.production_steps || {}), [stepId]: isDone }
    setClients(clients.map(c => c.id === client.id ? { ...c, production_steps: updatedSteps } : c))
    await supabase.from('clients').update({ production_steps: updatedSteps }).eq('id', client.id)
  }

  // Mobile / Client Balance / Expanded v1 — "операции сохранения" для единого cashTransactions,
  // общие для Bilans klienta (MobileClientBalanceScreen) и Rozliczenia (mobile ProjectModal).
  // draft.id присутствует → UPDATE существующей операции; иначе → INSERT новой. created_by/
  // created_at/updated_at не передаются — берутся дефолтами колонок на стороне БД (см. миграцию).
  async function saveCashTransaction(projectId, draft) {
    if (draft.id) {
      const { data, error } = await supabase.from('project_cash_transactions')
        .update({
          direction:    draft.direction,
          amount:       draft.amount,
          occurred_on:  draft.occurred_on,
          description:  draft.description,
        })
        .eq('id', draft.id)
        .select()
        .single()
      if (!error && data) {
        setCashTransactions(prev => prev.map(t => t.id === data.id ? data : t))
      }
      return { error }
    }
    const { data, error } = await supabase.from('project_cash_transactions')
      .insert([{
        project_id:   projectId,
        direction:    draft.direction,
        amount:       draft.amount,
        occurred_on:  draft.occurred_on,
        description:  draft.description,
      }])
      .select()
      .single()
    if (!error && data) {
      setCashTransactions(prev => [data, ...prev])
    }
    return { error }
  }

  async function deleteCashTransaction(id) {
    const { error } = await supabase.from('project_cash_transactions').delete().eq('id', id)
    if (!error) {
      setCashTransactions(prev => prev.filter(t => t.id !== id))
    }
    return { error }
  }

  // --- Экраны загрузки / доступа ---
  if (loadingSession) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#718096' }}>
      ⏳ Sprawdzanie sesji...
    </div>
  )
  if (!session) return <Login />
  if (awaitingAccess) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'20px' }}>
      <div>
        <h2 style={{ color:'#2d3748' }}>Konto zalogowane, ale bez przypisanej roli</h2>
        <p style={{ color:'#718096' }}>Poproś właściciela (owner) o dodanie Twojego konta do tabeli profiles.</p>
        <button className="btn-secondary" onClick={signOut} style={{ marginTop:'15px' }}>Wyloguj</button>
      </div>
    </div>
  )

  const profile   = localProfile ?? authProfile
  const canCreate = profile?.role === 'owner' || profile?.role === 'assembler'
  const activeTabLabel = TABS.find(t => t.id === activeTab)?.label || ''
  // При каждом новом входе стартовая группа вычисляется заново: Yury/Yuryshab/Alex → Moje,
  // остальные → GGS. Ручной выбор из Ustawienia действует только в текущей auth-сессии.
  const defaultScope = defaultProjectScope(authProfile, session)
  const effectiveScope = scopeSelection?.userId === authUserId
    ? scopeSelection.scope
    : defaultScope
  const setScopeView = (scope) => {
    const nextScope = typeof scope === 'function' ? scope(effectiveScope) : scope
    setScopeSelection({
      userId: authUserId,
      scope: nextScope === 'personal' ? 'personal' : 'firma',
    })
  }
  // Онлайн-пользователи кроме себя
  const othersOnline = Object.values(onlineUsers || {}).filter(u => u.userId !== profile?.id)
  const allOnline    = Object.values(onlineUsers || {})

  // Рабочая область проекта справа — только desktop (ADR-002, UX-фаза 2). На узком экране
  // всегда используется прежняя модалка (ниже, отдельным условием с !isDesktop).
  const showWorkspace = isDesktop && viewMode === 'project' && !!activeClient
  const showDesktopBalance = isDesktop && viewMode === 'balance' && !!balanceClientName

  const openClientBalance = (clientName) => {
    setBalanceClientName(clientName)
    if (isDesktop) {
      setViewMode('balance')
      setPendingClient(null)
    }
  }

  // Мобильный экран Projekty (ADR-003) — !isDesktop, т.е. до 767px включительно (единая граница,
  // см. useIsDesktop.js). showWorkspace требует isDesktop=true, поэтому они взаимоисключающие.
  const showMobileProjects = !isDesktop && showMobileHome
  // Подсветка активного пункта нижней навигации: "Projekty" — когда открыт мобильный экран
  // списка; "Produkcja"/"Materiały" — когда открыта соответствующая вкладка (независимо от того,
  // как в неё попали — через нижнюю навигацию, dropdown топбара или глобальный поиск);
  // всё остальное (Panel/Tablica projektów/Ustawienia) считается "Więcej".
  const mobileNavActive = showMobileProjects
    ? 'projekty'
    : activeTab === 'production'
      ? 'production'
      : activeTab === 'materials'
        ? 'materials'
        : 'wiecej'

  return (
    <div className="app-container">

      {/* ======== ДЕСКТОП: проект-центричная навигация (ADR-002) ======== */}
      <ProjectNav
        tabs={TABS}
        activeTab={activeTab}
        onSelectTab={goToTab}
        clients={clients}
        scopeView={effectiveScope}
        canCreate={canCreate}
        onNewProject={() => setIsModalOpen(true)}
        onOpenProject={requestOpenProject}
        onOpenBalance={openClientBalance}
        activeProjectId={activeClient?.id}
      />

      {/* ======== МОБАЙЛ: топбар + dropdown ======== */}
      {/* Mobile Project List v1 (P1): пока открыт полноэкранный Projekty (showMobileProjects),
          старый topbar не рендерится вообще — его полностью заменяет собственный Mobile App Bar
          внутри MobileProjectsScreen. "Więcej" (см. showMoreMenu выше) сначала уводит с экрана
          Projekty (showMobileHome=false), и только тогда topbar/dropdown снова монтируются. */}
      {!showMobileProjects && (
      <div className={s.topbar} ref={topbarRef}>
        {/* Левая часть — лого + текущая вкладка + стрелка */}
        <div
          className={s.topbarLeft}
          onTouchStart={() => setMenuOpen(o => !o)}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className={s.topbarLogo}>Jarvis</span>
          <span className={s.topbarActive}>{activeTabLabel}</span>
          <span className={`${s.topbarArrow} ${menuOpen ? s.open : ''}`}>▼</span>
        </div>

        {/* Правая часть — кнопка нового проекта + аватар */}
        <div className={s.topbarRight}>

          {/* Онлайн-пользователи — мобайл */}
          {othersOnline.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {othersOnline.slice(0, 3).map(u => (
                <div key={u.userId} style={{ position: 'relative' }} title={`${u.fullName} — ${TAB_LABELS[u.activeTab] || u.activeTab}`}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: u.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '9px', fontWeight: 'bold' }}>
                    {(u.fullName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '7px', height: '7px', borderRadius: '50%', background: '#38a169', border: '1.5px solid var(--bg-sidebar)' }} />
                </div>
              ))}
            </div>
          )}
          <div className={s.topbarAvatar} style={{ background: profile?.color || '#718096', position: 'relative' }}>
            {initials(profile?.full_name)}
            {/* Своя зелёная точка */}
            <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '8px', height: '8px', borderRadius: '50%', background: '#38a169', border: '1.5px solid var(--bg-sidebar)' }} />
          </div>
        </div>

        {/* Dropdown меню */}
        {menuOpen && (
          <div className={s.dropdown}>
            {TABS.map(tab => (
              <div
                key={tab.id}
                className={`${s.dropdownItem} ${activeTab === tab.id ? s.active : ''}`}
                onTouchStart={() => goToTab(tab.id)}
                onClick={() => goToTab(tab.id)}
              >
                <tab.Icon size={18} strokeWidth={2} />
                {tab.label}
              </div>
            ))}

            {/* Lista projektów — dostępna też na wąskim ekranie (drawer), nie znika */}
            <div style={{ maxHeight: '50vh', overflowY: 'auto', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <ProjectListPanel
                clients={clients}
                scopeView={effectiveScope}
                canCreate={canCreate}
                onNewProject={() => { setMenuOpen(false); setIsModalOpen(true); }}
                onOpenProject={(client) => { setMenuOpen(false); requestOpenProject(client); }}
                activeProjectId={activeClient?.id}
              />
            </div>

          </div>
        )}
      </div>
      )}

      {/* ======== КОНТЕНТ ======== */}
      <div className={s.contentWrapper}>
        <div className={s.topHeader}>
          <GlobalSearch
            clients={clients}
            materials={materials}
            onNavigate={(action) => {
              if (action.type === 'project') {
                requestOpenProject(action.client);
              } else if (action.type === 'task') {
                goToTab('dashboard'); // скрывает рабочую область проекта, если была открыта
                setSearchFocusTarget({
                  clientName: action.client.client_name || action.client.full_name,
                  projectId: action.client.id,
                  taskId: action.task.id,
                });
              } else if (action.type === 'client') {
                goToTab('dashboard');
              } else if (action.type === 'material') {
                goToTab('materials');
              }
            }}
          />
        </div>
        <div className="main-content" style={(showWorkspace || showDesktopBalance) ? { display: 'flex', flexDirection: 'column' } : undefined}>
        {showDesktopBalance ? (
          <MobileClientBalanceScreen
            desktopLayout
            clientName={balanceClientName}
            clients={clients}
            transactions={cashTransactions}
            onSaveTransaction={saveCashTransaction}
            onDeleteTransaction={deleteCashTransaction}
            cashStatus={cashStatus}
            onRetryCash={loadCashTransactions}
            onClose={() => { setBalanceClientName(null); setViewMode('tab') }}
          />
        ) : showWorkspace ? (
          <ProjectModal
            key={`workspace-${activeClient?.id}-${projectModalTab}`}
            variant="embedded"
            client={activeClient}
            originalClient={originalClient}
            setClient={setActiveClient}
            materials={materials}
            servicesList={servicesList}
            onClose={() => setViewMode('tab')}
            onSave={handleUpdateClient}
            onCoverChange={(clientId, url) => setClients(prev => prev.map(c => c.id === clientId ? { ...c, cover_url: url } : c))}
            currentProfile={profile}
            isDark={isDarkish}
            theme={theme}
            initialTab={projectModalTab}
            onDirtyChange={setWorkspaceDirty}
            pendingProjectLabel={pendingClient ? (pendingClient.client.project_name || pendingClient.client.client_name || pendingClient.client.full_name || '—') : null}
            onConfirmSwitch={confirmPendingSwitch}
            onCancelSwitch={cancelPendingSwitch}
            cashTransactions={cashTransactions}
            onSaveCashTransaction={saveCashTransaction}
            onDeleteCashTransaction={deleteCashTransaction}
            cashStatus={cashStatus}
            onRetryCash={loadCashTransactions}
          />
        ) : (
        <>
        {activeTab === 'dashboard' && (
          <Dashboard
            clients={clients}
            updateClient={updateClientFields}
            openProjectModal={requestOpenProject}
            setIsModalOpen={setIsModalOpen}
            canCreate={canCreate}
            currentProfile={profile}
            isDark={isDarkish}
            focusTarget={searchFocusTarget}
            onFocusHandled={handleSearchFocusHandled}
            scopeView={effectiveScope}
          />
        )}
        {activeTab === 'board' && (
          <KanbanBoard
            clients={clients}
            setActiveClient={requestOpenProject}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            updateClient={updateClientFields}
            isDark={isDarkish}
            scopeView={effectiveScope}
          />
        )}
        {activeTab === 'production' && (
          <ProductionTab clients={clients} onToggleStep={handleToggleProductionStep} />
        )}
        {activeTab === 'materials' && (
          <MaterialsList
            materials={materials}
            servicesList={servicesList}
            setIsMaterialModalOpen={setIsMaterialModalOpen}
            onPricesUpdated={reloadMaterials}
            isDark={isDarkish}
          />
        )}
        {activeTab === 'settings' && (
          <Settings
            profile={profile}
            profilesById={profilesById}
            onColorUpdate={(hex) => setLocalProfile(p => ({ ...(p ?? profile), color: hex }))}
            scopeView={effectiveScope}
            setScopeView={setScopeView}
            onlineUsers={allOnline}
            tabLabels={TAB_LABELS}
            onSignOut={signOut}
          />
        )}
        </>
        )}
        </div>
      </div>

      {/* Модал: новый проект */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ width:'100%', maxWidth:'600px', boxSizing:'border-box' }} onClick={e => e.stopPropagation()}>
            <h2>Dodaj projekt</h2>
            <form onSubmit={handleAddClient}>
              <div className="form-group"><label>Imię i nazwisko klienta</label><input type="text" required value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="form-group"><label>Nazwa projektu (szafa, kuchnia, łazienka...)</label><input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="np. szafa do sypialni" /></div>
              <div className="form-group"><label>Telefon</label><input type="text" required value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div className="form-group"><label>Adres montażu</label><input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="np. Gdańsk, ul. Długa 12/4" /></div>
              <div style={{ display:'flex', gap:'15px' }}>
                <div className="form-group" style={{ flex:1 }}><label>Budżet (PLN)</label><input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></div>
                <div className="form-group" style={{ flex:1 }}><label>Termin</label><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #ccc', boxSizing:'border-box', height:'42px' }} /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Anuluj</button>
                <button type="submit" className="btn-primary">Zapisz</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ProjectModal — полноэкранный мобильный экран проекта до 767px (ADR-003, Mobile Field Mode
          faza 2; на desktop/tablet используется embedded-рабочая область выше) */}
      {!isDesktop && activeClient && (
        <ProjectModal
          key={`mobile-${activeClient?.id}-${projectModalTab}`}
          variant="mobile"
          client={activeClient}
          originalClient={originalClient}
          setClient={setActiveClient}
          materials={materials}
          servicesList={servicesList}
          onClose={() => { setActiveClient(null); setOriginalClient(null) }}
          onSave={handleUpdateClient}
          onCoverChange={(clientId, url) => setClients(prev => prev.map(c => c.id === clientId ? { ...c, cover_url: url } : c))}
          currentProfile={profile}
          isDark={isDarkish}
          theme={theme}
          initialTab={projectModalTab}
          onDirtyChange={setWorkspaceDirty}
          cashTransactions={cashTransactions}
          onSaveCashTransaction={saveCashTransaction}
          onDeleteCashTransaction={deleteCashTransaction}
          cashStatus={cashStatus}
          onRetryCash={loadCashTransactions}
        />
      )}

      {/* Модал: новый материал */}
      {isMaterialModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMaterialModalOpen(false)}>
          <div className="modal-content" style={{ width:'100%', maxWidth:'500px', boxSizing:'border-box' }} onClick={e => e.stopPropagation()}>
            <h2>Dodaj nowy materiał</h2>
            <form onSubmit={handleAddMaterial}>
              <div className="form-group"><label>Pełna nazwa</label><input type="text" required value={matName} onChange={e => setMatName(e.target.value)} /></div>
              <div className="form-group">
                <label>Kategoria</label>
                <select value={matCategory} onChange={e => setMatCategory(e.target.value)} style={{ padding:'10px', borderRadius:'6px', border:'1px solid #ccc' }}>
                  <option value="Płyta">Płyta</option><option value="Obrzeże">Obrzeże</option>
                  <option value="HDF">HDF</option><option value="Laminat">Laminat</option>
                  <option value="Akcesoria">Akcesoria (Okucia)</option><option value="Inne">Inne</option>
                </select>
              </div>
              <div className="form-group">
                <label>Jm</label>
                <select value={matUnit} onChange={e => setMatUnit(e.target.value)} style={{ padding:'10px', borderRadius:'6px', border:'1px solid #ccc' }}>
                  <option value="szt">Sztuki</option><option value="mb">Metry bieżące</option>
                  <option value="m2">Metry kwadratowe</option><option value="kpl">Komplet</option>
                </select>
              </div>
              <div className="form-group"><label>Cena brutto (PLN)</label><input type="number" step="0.01" required value={matPrice} onChange={e => setMatPrice(e.target.value)} /></div>

              {duplicateFound && (
                <div style={{ margin:'10px 0', padding:'12px', borderRadius:'8px',
                  background: duplicateFound.samePrice ? '#fffbeb' : '#fff5f5',
                  border: `1px solid ${duplicateFound.samePrice ? '#f6e05e' : '#feb2b2'}` }}>
                  {duplicateFound.samePrice ? (
                    <div style={{ fontSize:'13px', color:'#744210' }}>
                      ⚠️ Materiał <strong>{duplicateFound.existing.name}</strong> już istnieje z tą samą ceną ({duplicateFound.existing.price} zł).
                      <button onClick={() => setDuplicateFound(null)} style={{ marginLeft:'10px', background:'none', border:'none', color:'#3182ce', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>OK</button>
                    </div>
                  ) : (
                    <div style={{ fontSize:'13px', color:'#742a2a' }}>
                      🔄 Znaleziono istniejący materiał!<br />
                      <strong>{duplicateFound.existing.name}</strong><br />
                      <span style={{ color:'#718096' }}>Stara cena:</span> <strong>{duplicateFound.existing.price} zł</strong>
                      {' → '}
                      <span style={{ color:'#718096' }}>Nowa cena:</span> <strong style={{ color:'#e53e3e' }}>{duplicateFound.newPrice} zł</strong>
                      <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
                        <button onClick={handleConfirmPriceUpdate} style={{ background:'#38a169', color:'#fff', border:'none', padding:'6px 14px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>Zaktualizuj cenę</button>
                        <button onClick={() => setDuplicateFound(null)} style={{ background:'#e2e8f0', color:'#2d3748', border:'none', padding:'6px 14px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>Anuluj</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setIsMaterialModalOpen(false); setDuplicateFound(null) }}>Anuluj</button>
                <button type="submit" className="btn-primary">Zapisz</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Мобильный экран Projekty (ADR-003, Mobile Field Mode). Смонтирован всегда — видимость
          переключается через className внутри компонента, чтобы поиск/фильтр не сбрасывались
          при переходе на Produkcja/Materiały/Więcej и обратно. На 768px и выше всегда скрыт. */}
      <MobileProjectsScreen
        visible={showMobileProjects}
        clients={clients}
        scopeView={effectiveScope}
        canCreate={canCreate}
        onNewProject={() => setIsModalOpen(true)}
        onOpenProject={requestOpenProject}
        activeProjectId={activeClient?.id}
        onOpenBalance={openClientBalance}
      />

      {/* Mobile / Client Balance / Expanded v1 — отдельный полноэкранный экран (кнопка "Bilans" в
          заголовке группы клиента, ProjectListPanel). Список Projekty выше остаётся смонтированным
          (не открытие проекта — requestOpenProject здесь не вызывается); нижняя навигация скрыта
          покрытием z-index этого экрана (см. .module.css), без правок MobileBottomNav.jsx. */}
      {!isDesktop && balanceClientName && (
        <MobileClientBalanceScreen
          clientName={balanceClientName}
          clients={clients}
          transactions={cashTransactions}
          onSaveTransaction={saveCashTransaction}
          onDeleteTransaction={deleteCashTransaction}
          cashStatus={cashStatus}
          onRetryCash={loadCashTransactions}
          onClose={() => setBalanceClientName(null)}
        />
      )}

      {/* Нижняя мобильная навигация (ADR-003). Видимость — чисто через CSS-медиазапрос
          (max-width: 767px) в MobileBottomNav.module.css, компонент смонтирован всегда. */}
      <MobileBottomNav
        ref={bottomNavRef}
        active={mobileNavActive}
        onProjekty={showMobileProjectsHome}
        onProdukcja={() => goToTab('production')}
        onMaterialy={() => goToTab('materials')}
        onWiecej={showMoreMenu}
      />

      {AI_ASSISTANT_ENABLED && <AiAssistant />}
    </div>
  )
}

export default App
