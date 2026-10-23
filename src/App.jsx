import { Suspense, lazy, useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useAuth } from './useAuth'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import GlobalSearch from './components/GlobalSearch';
import ProjectNav from './components/ProjectNav';
import ProjectListPanel from './components/ProjectListPanel';
import MobileProjectsScreen from './components/MobileProjectsScreen';
import MobileBottomNav from './components/MobileBottomNav';
import { useIsDesktop } from './utils/useIsDesktop';
import { sortMaterialsByWorkflow } from './utils/materialSort';
import { findEquivalentMaterial } from './utils/materialPickerGroups';
import {
  createOrReuseCatalogItem,
  enrichCatalogWithUsage,
  sortCatalogByPriority,
} from './utils/catalogPriority';
import clientsRepository from './data/clientsRepository';
import catalogRepository from './data/catalogRepository';
import { BOOTSTRAP_RESOURCES, loadBootstrapData } from './data/bootstrapData';
import useCashTransactions from './components/useCashTransactions';
import { DEFAULT_PROJECT_FILE_CATEGORY } from './utils/projectFileCategories';
import {
  PROJECT_LIFECYCLE,
  canManageProjectLifecycle,
  canPurgeProjects,
  filterProjectsByLifecycle,
  getProjectLifecycle,
} from './utils/projectLifecycle';
import purgeProject from './data/projectPurge';
import { planClientGroupRename } from './utils/clientGroupRename';
import PurgeProjectsDialog from './components/PurgeProjectsDialog';
import { LayoutDashboard, FolderKanban, Package, Settings as SettingsIcon } from 'lucide-react'
import s from './App.module.css'

const KanbanBoard = lazy(() => import('./components/KanbanBoard'))
const MaterialsList = lazy(() => import('./components/MaterialsList'))
const ProjectModal = lazy(() => import('./components/ProjectModal'))
const Settings = lazy(() => import('./components/Settings'))
const AiAssistant = lazy(() => import('./components/AiAssistant'))
const MobileClientBalanceScreen = lazy(() => import('./components/MobileClientBalanceScreen'))
const Pro100Library = lazy(() => import('./components/Pro100Library'))

function ContentLoading() {
  return (
    <div className={s.lazyFallback} role="status" aria-live="polite">
      {'\u0141adowanie widoku\u2026'}
    </div>
  )
}

function OverlayLoading() {
  return (
    <div className={s.lazyOverlayFallback} role="status" aria-live="polite">
      {'\u0141adowanie projektu\u2026'}
    </div>
  )
}
const TABS = [
  { id: 'dashboard',  label: 'Panel',              Icon: LayoutDashboard },
  { id: 'board',      label: 'Tablica projektów',  Icon: FolderKanban    },
  { id: 'materials',  label: 'Materiały',          Icon: Package         },
  { id: 'settings',   label: 'Ustawienia',         Icon: SettingsIcon    },
]

const BOOTSTRAP_RESOURCE_LABELS = {
  clients: 'projekty',
  materials: 'materia\u0142y',
  services: 'us\u0142ugi',
}

const initials = (name) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

const PERSONAL_SCOPE_IDENTITIES = new Set(['yury', 'yurysts', 'yuryshab', 'alex'])

const normalizeIdentity = (value) =>
  String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

const defaultProjectScope = (profile, session) => {
  if (profile?.default_scope === 'personal' || profile?.default_scope === 'firma') {
    return profile.default_scope
  }

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

const lifecycleErrorMessage = (error) => {
  if (error?.code === 'LIFECYCLE_MIGRATION_MISSING' || error?.code === 'PURGE_NOT_ALLOWED') return error.message
  if (error?.code === '42501') {
    return 'Brak uprawnie\u0144: archiwizowa\u0107, przenosi\u0107 do kosza i przywraca\u0107 projekty mo\u017ce tylko w\u0142a\u015bciciel lub monter.'
  }
  return 'Nie uda\u0142o si\u0119 zmieni\u0107 stanu projektu. Spr\u00f3buj ponownie.'
}

// Убран с экрана по просьбе (пока, не окончательно) — компонент/код оставлены нетронутыми,
// включить обратно — просто вернуть true.
const AI_ASSISTANT_ENABLED = false

function App() {
  const { session, profile: authProfile, profilesById, isDark, theme, loadingSession, awaitingAccess, signOut } = useAuth()
  // Forest — тоже тёмная по духу тема: компонентам, красящим себя через
  // свой light/dark-хелпер (ProjectModal, Kanban, MaterialsList),
  // передаём именно этот флаг, чтобы они не "светлели" в Forest.
  const isDarkish = isDark || theme === 'forest'

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
  const defaultScope = defaultProjectScope(authProfile, session)
  const effectiveScope = scopeSelection?.userId === authUserId
    ? scopeSelection.scope
    : defaultScope
  const [menuOpen,  setMenuOpen]    = useState(false)
  const [clients,   setClients]     = useState([])
  const [materials, setMaterials]   = useState([])
  const [servicesList, setServicesList] = useState([])
  const [bootstrapErrors, setBootstrapErrors] = useState({})
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  // Archiwum / Kosz: обычные списки (дерево, панель, доска, поиск) показывают только активные
  // проекты; архив и корзина — только в системных папках левой панели. Bilans учитывает и архив
  // (деньги архивных проектов реальны), но не корзину.
  const { activeClients, archivedClients, trashClients, balanceClients } = useMemo(() => ({
    activeClients: filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.ACTIVE),
    archivedClients: filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.ARCHIVED),
    trashClients: filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.TRASH),
    balanceClients: clients.filter(client => getProjectLifecycle(client) !== PROJECT_LIFECYCLE.TRASH),
  }), [clients])
  const prioritizedMaterials = useMemo(() => sortCatalogByPriority(
    enrichCatalogWithUsage(materials, clients, 'calc_materials')
  ), [clients, materials])
  const prioritizedServices = useMemo(() => sortCatalogByPriority(
    enrichCatalogWithUsage(servicesList, clients, 'calc_services')
  ), [clients, servicesList])
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleNotice, setLifecycleNotice] = useState(null)
  // Проекты, ожидающие подтверждения «Usuń trwale» (null — диалог закрыт).
  const [purgeRequest, setPurgeRequest] = useState(null)
  // Mobile / Client Balance / Expanded v1 — единый массив реальных денежных операций всех
  // доступных проектов загружается hook-ом и используется совместно в Bilans klienta
  // (MobileClientBalanceScreen) и вкладки Rozliczenia (mobile ProjectModal) — без копирования
  // данных между экранами и без отдельного запроса на карточку.
  // 'loading' | 'error' | 'ready' — источник правды для Bilans klienta/Rozliczenia о том, можно ли
  // доверять cashTransactions. Без этого сбой запроса (нет таблицы, RLS, сеть) молча оставлял бы
  // cashTransactions=[] и оба экрана показывали бы 0.00 zł/"Brak operacji", будто это настоящий
  // ноль (review P1) — вместо этого экраны обязаны показать "не удалось загрузить" и не показывать
  // никаких сумм, пока статус не 'ready'.
  const {
    cashTransactions,
    cashStatus,
    loadCashTransactions,
    saveCashTransaction,
    deleteCashTransaction,
  } = useCashTransactions({
    scopeKey: authUserId && authProfile ? `${authUserId}:${effectiveScope}` : null,
    projectScope: effectiveScope,
  })
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
  // Bilans także musi przejść przez dialog niezapisanych zmian — inaczej ukrycie ProjectModal
  // odmontowuje lokalny draft materiałów/usług bez zapisania.
  const [pendingBalanceClientName, setPendingBalanceClientName] = useState(null)

  const [name,     setName]     = useState('')
  const [projectName, setProjectName] = useState('')
  const [phone,    setPhone]    = useState('')
  const [budget,   setBudget]   = useState('')
  const [deadline, setDeadline] = useState('')
  const [address,  setAddress]  = useState('')

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [duplicateFound,      setDuplicateFound]      = useState(null)
  const [matName,     setMatName]     = useState('')
  const [matSymbol,   setMatSymbol]   = useState('')
  const [matCategory, setMatCategory] = useState('Płyta')
  const [matUnit,     setMatUnit]     = useState('szt')
  const [matPrice,    setMatPrice]    = useState('')

  const topbarRef = useRef(null)
  const bottomNavRef = useRef(null)
  const bootstrapRequestRef = useRef(0)
  const favoriteRequestRef = useRef(new Map())

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

  const fetchBootstrapData = useCallback(async (resources = BOOTSTRAP_RESOURCES) => {
    if (!authUserId || resources.length === 0) return
    const requestId = ++bootstrapRequestRef.current

    const data = await loadBootstrapData({ resources })

    if (bootstrapRequestRef.current !== requestId) return
    if (data.clients) setClients(data.clients)
    if (data.materials) setMaterials(sortMaterialsByWorkflow(data.materials))
    if (data.services) setServicesList(data.services)
    setBootstrapErrors(current => {
      const next = { ...current }
      resources.forEach((resource) => {
        if (data.errors[resource]) next[resource] = data.errors[resource]
        else delete next[resource]
      })
      return next
    })
    setBootstrapLoading(false)
  }, [authUserId])

  useEffect(() => {
    if (!authUserId) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) fetchBootstrapData()
    })
    return () => {
      cancelled = true
      bootstrapRequestRef.current += 1
    }
  }, [authUserId, fetchBootstrapData])

  const [projectModalTab, setProjectModalTab] = useState('materials')
  // Desktop workspace 2026-10: папка файлов активного проекта выбирается в левой панели (под
  // проектом) и передаётся в FilesTab; "+" там же вызывает загрузку через fileUploadTriggerRef.
  const [fileCategory, setFileCategory] = useState(DEFAULT_PROJECT_FILE_CATEGORY)
  const [filesUploading, setFilesUploading] = useState(false)
  const fileUploadTriggerRef = useRef(null)
  // Окно «Klient i projekt» (бывший ℹ️ в шапке) открывается карандашом у клиента в левой панели.
  const [clientEditOpen, setClientEditOpen] = useState(false)
  // Проект, для которого после переключения нужно открыть это окно (карандаш у другого клиента).
  const [pendingEditProjectId, setPendingEditProjectId] = useState(null)

  const openProjectModal = (client, initialTab = 'materials') => {
    setBalanceClientName(null)
    setPendingBalanceClientName(null)
    if (client.id !== activeClient?.id) {
      setFileCategory(DEFAULT_PROJECT_FILE_CATEGORY)
      setClientEditOpen(false)
    }
    setActiveClient(client)
    setOriginalClient(JSON.parse(JSON.stringify(client)))
    setProjectModalTab(initialTab)
    setViewMode('project') // на desktop открывает рабочую область справа; на mobile ни на что не влияет (там всегда модалка)
  }

  // Точка входа для всех мест открытия проекта (левая панель, Dashboard, Kanban, поиск):
  // если открыт ДРУГОЙ проект с несохранёнными изменениями — не заменяет его сразу, а просит
  // подтверждение через тот же диалог, что и закрытие карточки (ADR-002, UX-faza 2.1).
  const requestOpenProject = (client, initialTab = 'materials') => {
    // Повторный клик по уже открытому проекту (например, в дереве слева) ничего не делает —
    // иначе черновик в рабочей области заменился бы сохранённой версией из списка.
    if (isDesktop && viewMode === 'project' && client.id === activeClient?.id && initialTab === projectModalTab) {
      return
    }
    if (activeClient && workspaceDirty && client.id !== activeClient.id) {
      setPendingClient({ client, initialTab })
      setViewMode('project') // возвращает рабочую область в видимость, чтобы диалог было видно
      return
    }
    openProjectModal(client, initialTab)
  }

  const confirmPendingSwitch = ({ saved = false } = {}) => {
    const target = pendingClient
    const balanceTarget = pendingBalanceClientName
    setPendingClient(null)
    setPendingBalanceClientName(null)

    if (target) {
      openProjectModal(target.client, target.initialTab)
      return
    }

    if (balanceTarget) {
      // Przy odrzuceniu nie zostawiamy w App lokalnego, brudnego projektu ukrytego pod Bilansem.
      if (!saved && originalClient) setActiveClient(JSON.parse(JSON.stringify(originalClient)))
      setWorkspaceDirty(false)
      setBalanceClientName(balanceTarget)
      setViewMode('balance')
    }
  }

  const cancelPendingSwitch = () => {
    setPendingClient(null)
    setPendingBalanceClientName(null)
    setPendingEditProjectId(null)
  }

  // Карандаш у клиента в левой панели: открывает окно «Klient i projekt» для активного проекта
  // этого клиента, а если активен проект другого клиента — сначала открывает первый проект группы
  // (через тот же диалог несохранённых изменений, что и обычное переключение).
  const requestEditClient = (_clientName, group) => {
    const target = group.find(c => c.id === activeClient?.id) || group[0]
    if (!target) return
    if (viewMode === 'project' && activeClient?.id === target.id) {
      setClientEditOpen(true)
      return
    }
    setPendingEditProjectId(target.id)
    requestOpenProject(target)
  }

  const goToTab = (id) => {
    setBalanceClientName(null)
    setActiveTab(id)
    setViewMode('tab') // уходя в глобальный раздел, скрываем рабочую область проекта (сам выбранный проект не сбрасываем)
    setPendingClient(null) // не оставляем «зависший» диалог переключения, если он был открыт
    setShowMobileHome(false) // уходя на конкретную вкладку — скрываем мобильный экран Projekty (ADR-003)
    setMenuOpen(false) // закрываем dropdown топбара, если он был открыт
  }

  const openPro100Library = () => {
    setBalanceClientName(null)
    setPendingClient(null)
    setPendingBalanceClientName(null)
    setViewMode('library')
    setShowMobileHome(false)
    setMenuOpen(false)
  }

  // Мобильная нижняя навигация (ADR-003): "Projekty" возвращает к мобильному экрану списка
  // проектов, не трогая activeTab — сам выбранный desktop-раздел под ним не сбрасывается.
  const showMobileProjectsHome = () => {
    setShowMobileHome(true)
    setMenuOpen(false)
  }

  async function updateClientFields(clientId, updatedFields) {
    setClients(current => current.map(c => c.id === clientId ? { ...c, ...updatedFields } : c))
    try {
      await clientsRepository.update(clientId, updatedFields)
    } catch {
      // Preserve the existing optimistic UI; the next reload reconciles remote state.
    }
  }

  async function saveProjectCoefficient(projectId, coefficient, calculatedBudget) {
    try {
      const data = await clientsRepository.updateAndGet(projectId, {
        budget_coefficient: coefficient,
        budget: calculatedBudget,
      })

      setClients(prev => prev.map(c => c.id === projectId ? data : c))
      setActiveClient(prev => prev?.id === projectId ? data : prev)
      setOriginalClient(prev => prev?.id === projectId ? JSON.parse(JSON.stringify(data)) : prev)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  async function handleAddClient(e) {
    e.preventDefault()
    try {
      const saved = await clientsRepository.create({
        full_name: name, client_name: name, project_name: projectName, phone, budget: Number(budget) || 0,
        deadline: deadline || null, address, status: 'new', project_scope: effectiveScope
      })
      setClients(current => [...current, saved])
      setName(''); setProjectName(''); setPhone(''); setBudget(''); setDeadline(''); setAddress('')
      setIsModalOpen(false)
    } catch {
      // Keep the form open so the user can retry.
    }
  }

  async function handleUpdateClient(e) {
    if (e && e.preventDefault) e.preventDefault()
    // Новое имя клиента записывается во все проекты его группы (utils/clientGroupRename.js) —
    // до сохранения самого проекта: если переименование не прошло, проект не сохраняется и
    // группа не распадается; повторное «Zapisz» сделает всё заново.
    const rename = planClientGroupRename({ clients, original: originalClient, draft: activeClient })
    try {
      if (rename) {
        const renamedRows = await clientsRepository.renameClientGroup(rename.ids, rename.fullNameIds, rename.nextName)
        const renamedById = new Map(renamedRows.map(row => [row.id, row]))
        setClients(current => current.map(c => (renamedById.has(c.id) ? { ...c, ...renamedById.get(c.id) } : c)))
      }
      const saved = await clientsRepository.updateAndGet(activeClient.id, {
        client_name:        rename ? rename.nextName : activeClient.client_name,
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
        important_points:   activeClient.important_points  || [],
        budget:             activeClient.budget            || 0,
        budget_coefficient: activeClient.budget_coefficient || 2.0,
      })
      setClients(current => current.map(c => c.id === activeClient.id ? saved : c))
      setOriginalClient(JSON.parse(JSON.stringify(saved)))
      if (rename) {
        // Имя без лишних пробелов и обновлённый full_name — в открытый черновик, иначе проект
        // сразу после сохранения выглядел бы изменённым.
        setActiveClient(prev => (prev?.id === saved.id
          ? { ...prev, client_name: saved.client_name, full_name: saved.full_name }
          : prev))
      }
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  async function handleAddMaterial(e) {
    e.preventDefault()
    const candidate = {
      name: matName.trim(),
      symbol: matSymbol.trim() || null,
      category: matCategory,
      unit: matUnit,
      price: Number(matPrice),
    }
    const existing = findEquivalentMaterial(materials, candidate)
    if (existing) {
      setDuplicateFound({
        existing,
        newPrice: Number(matPrice),
        samePrice: Math.abs(Number(existing.price) - Number(matPrice)) < 0.001
      })
      return
    }
    try {
      const saved = await catalogRepository.createMaterial({ ...candidate, price_history: [] })
      setMaterials(current => sortMaterialsByWorkflow([...current, saved]))
      setMatName(''); setMatSymbol(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    } catch {
      // Keep the form open so the user can retry.
    }
  }

  async function handleConfirmPriceUpdate() {
    const { existing, newPrice } = duplicateFound
    const today   = new Date().toISOString().split('T')[0]
    const history = [...(existing.price_history || []), { price: existing.price, date: today }]
    try {
      const saved = await catalogRepository.updateMaterial(existing.id, {
        price: newPrice,
        price_history: history,
      })
      setMaterials(current => sortMaterialsByWorkflow(current.map(m => m.id === existing.id ? saved : m)))
      setDuplicateFound(null)
      setMatName(''); setMatSymbol(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    } catch {
      // Keep the confirmation open so the user can retry.
    }
  }

  async function reloadMaterials() {
    try {
      setMaterials(sortMaterialsByWorkflow(await catalogRepository.listMaterials()))
    } catch {
      // Keep the last successful catalog when refresh fails.
    }
  }

  const autosaveProjectItems = useCallback(async (projectId, fields) => {
    await clientsRepository.update(projectId, fields)
    setClients(current => current.map(project => project.id === projectId ? { ...project, ...fields } : project))
    setOriginalClient(current => current?.id === projectId ? { ...current, ...fields } : current)
  }, [])

  const createManualCatalogItem = useCallback(async (kind, draft) => {
    const items = kind === 'material' ? materials : servicesList
    const { item, created } = await createOrReuseCatalogItem({
      kind,
      draft,
      items,
      repository: catalogRepository,
    })
    if (created) {
      if (kind === 'material') setMaterials(current => [...current, item])
      else setServicesList(current => [...current, item])
    }
    return item
  }, [materials, servicesList])

  const toggleCatalogFavorite = useCallback(async (kind, item) => {
    const nextFavorite = !item.is_favorite
    const setItems = kind === 'material' ? setMaterials : setServicesList
    const requestKey = `${kind}:${item.id}`
    const requestVersion = (favoriteRequestRef.current.get(requestKey) || 0) + 1
    favoriteRequestRef.current.set(requestKey, requestVersion)
    setItems(current => current.map(entry => entry.id === item.id
      ? { ...entry, is_favorite: nextFavorite }
      : entry))
    try {
      const saved = kind === 'material'
        ? await catalogRepository.updateMaterial(item.id, { is_favorite: nextFavorite })
        : await catalogRepository.updateService(item.id, { is_favorite: nextFavorite })
      if (favoriteRequestRef.current.get(requestKey) === requestVersion) {
        setItems(current => current.map(entry => entry.id === item.id ? { ...entry, ...saved } : entry))
      }
    } catch (error) {
      if (favoriteRequestRef.current.get(requestKey) === requestVersion) {
        setItems(current => current.map(entry => entry.id === item.id
          ? { ...entry, is_favorite: item.is_favorite }
          : entry))
      }
      throw error
    }
  }, [])

  const handleDragStart = (e, id) => e.dataTransfer.setData('clientId', id)
  const handleDragOver  = (e)     => e.preventDefault()
  const handleDrop      = async (e, newStatus) => {
    const id = e.dataTransfer.getData('clientId')
    setClients(current => current.map(c => c.id.toString() === id ? { ...c, status: newStatus } : c))
    try {
      await clientsRepository.update(id, { status: newStatus })
    } catch {
      // Preserve the existing optimistic UI; the next reload reconciles remote state.
    }
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

  const profile   = authProfile
  const canCreate = profile?.role === 'owner' || profile?.role === 'assembler'
  const canManageLifecycle = canManageProjectLifecycle(profile?.role)
  const canPurge = canPurgeProjects(profile?.role)

  // Поля жизненного цикла обновляются и в activeClient, и в originalClient — иначе открытый
  // проект выглядел бы «изменённым» после архивации.
  const applyLifecycleRows = (rows) => {
    const byId = new Map(rows.map(row => [row.id, row]))
    const merge = (client) => (client && byId.has(client.id) ? { ...client, ...byId.get(client.id) } : client)
    setClients(current => current.map(merge))
    setActiveClient(merge)
    setOriginalClient(merge)
  }

  const closeRemovedProject = () => {
    setActiveClient(null)
    setOriginalClient(null)
    setWorkspaceDirty(false)
    setPendingClient(null)
    if (viewMode === 'project') setViewMode('tab')
  }

  async function handleChangeLifecycle(projects, lifecycleStatus) {
    if (!projects?.length || lifecycleBusy) return
    const ids = projects.map(project => project.id)
    const touchesOpenProject = !!activeClient && ids.includes(activeClient.id)
    if (lifecycleStatus === PROJECT_LIFECYCLE.TRASH && touchesOpenProject && workspaceDirty) {
      setLifecycleNotice('Zapisz lub odrzu\u0107 zmiany w otwartym projekcie, zanim przeniesiesz go do kosza.')
      return
    }
    setLifecycleBusy(true)
    setLifecycleNotice(null)
    try {
      const rows = await clientsRepository.setLifecycle(ids, lifecycleStatus)
      applyLifecycleRows(rows)
      if (rows.length < ids.length) {
        setLifecycleNotice('Nie wszystkie projekty zosta\u0142y przeniesione \u2014 brak uprawnie\u0144 lub projekt ju\u017c nie istnieje.')
      }
      if (lifecycleStatus === PROJECT_LIFECYCLE.TRASH && touchesOpenProject && rows.some(row => row.id === activeClient.id)) {
        closeRemovedProject()
      }
    } catch (error) {
      setLifecycleNotice(lifecycleErrorMessage(error))
    } finally {
      setLifecycleBusy(false)
    }
  }

  const requestPurgeProjects = (projects) => {
    if (!canPurge || !projects?.length || lifecycleBusy) return
    setLifecycleNotice(null)
    setPurgeRequest(projects)
  }

  async function confirmPurgeProjects() {
    const projects = purgeRequest
    if (!projects || lifecycleBusy) return
    setLifecycleBusy(true)
    const deletedIds = new Set()
    let failure = null
    let storageFailed = false
    for (const project of projects) {
      try {
        const result = await purgeProject(project.id)
        deletedIds.add(project.id)
        if (result.storageError) storageFailed = true
      } catch (error) {
        failure = error
        break
      }
    }
    if (deletedIds.size > 0) {
      setClients(current => current.filter(client => !deletedIds.has(client.id)))
      if (activeClient && deletedIds.has(activeClient.id)) closeRemovedProject()
    }
    setPurgeRequest(null)
    setLifecycleBusy(false)
    if (failure) {
      setLifecycleNotice(failure.code === 'PURGE_NOT_ALLOWED' || failure.code === 'LIFECYCLE_MIGRATION_MISSING'
        ? failure.message
        : 'Nie uda\u0142o si\u0119 trwale usun\u0105\u0107 projektu. Spr\u00f3buj ponownie.')
    } else if (storageFailed) {
      setLifecycleNotice('Projekt usuni\u0119to, ale cz\u0119\u015bci plik\u00f3w nie uda\u0142o si\u0119 usun\u0105\u0107 z magazynu.')
    }
  }
  const activeTabLabel = TABS.find(t => t.id === activeTab)?.label || ''
  const failedBootstrapResources = BOOTSTRAP_RESOURCES.filter(resource => bootstrapErrors[resource])
  const retryFailedBootstrapResources = () => {
    setBootstrapLoading(true)
    fetchBootstrapData(failedBootstrapResources)
  }
  // При каждом новом входе стартовая группа вычисляется заново: Yury/Yuryshab/Alex → Moje,
  // остальные → GGS. Ручной выбор из Ustawienia действует только в текущей auth-сессии.
  const setScopeView = (scope) => {
    const nextScope = typeof scope === 'function' ? scope(effectiveScope) : scope
    setScopeSelection({
      userId: authUserId,
      scope: nextScope === 'personal' ? 'personal' : 'firma',
    })
  }
  // Рабочая область проекта справа — только desktop (ADR-002, UX-фаза 2). На узком экране
  // всегда используется прежняя модалка (ниже, отдельным условием с !isDesktop).
  const showWorkspace = isDesktop && viewMode === 'project' && !!activeClient
  const showDesktopBalance = isDesktop && viewMode === 'balance' && !!balanceClientName

  const showDesktopLibrary = isDesktop && viewMode === 'library'

  // Открыт проект — desktop (рабочая область) или mobile (полноэкранная модалка, variant="mobile");
  // от showWorkspace отличается тем, что НЕ требует isDesktop — нужно для «Klient i projekt» ниже,
  // который на mobile открывается карандашом из дерева Projekty (feat/mobile-project-list-parity).
  const projectWorkspaceActive = viewMode === 'project' && !!activeClient

  // Отложенное открытие окна «Klient i projekt» — как только нужный проект стал активным.
  if (pendingEditProjectId !== null && projectWorkspaceActive && activeClient?.id === pendingEditProjectId) {
    setPendingEditProjectId(null)
    setClientEditOpen(true)
  }
  // Ушли из рабочей области (доска, Bilans, библиотека) — очищаем и открытое, и
  // отложенное состояние, чтобы редактор не «всплыл» при позднейшем возврате.
  if (!projectWorkspaceActive) {
    if (clientEditOpen) setClientEditOpen(false)
    if (pendingEditProjectId !== null) setPendingEditProjectId(null)
  }
  const openClientBalance = (clientName) => {
    if (isDesktop && viewMode === 'project' && activeClient && workspaceDirty) {
      setPendingClient(null)
      setPendingBalanceClientName(clientName)
      return
    }

    setBalanceClientName(clientName)
    if (isDesktop) {
      setViewMode('balance')
      setPendingClient(null)
      setPendingBalanceClientName(null)
      setWorkspaceDirty(false)
    }
  }

  // Мобильный экран Projekty (ADR-003) — !isDesktop, т.е. до 767px включительно (единая граница,
  // см. useIsDesktop.js). showWorkspace требует isDesktop=true, поэтому они взаимоисключающие.
  const showMobileProjects = !isDesktop && showMobileHome
  // Подсветка одного из четырёх прямых пунктов мобильной навигации.
  const mobileNavActive = showMobileProjects
    ? 'projekty'
    : activeTab === 'board'
      ? 'board'
      : activeTab === 'materials'
        ? 'materials'
        : activeTab === 'settings'
          ? 'settings'
          : ''

  return (
    <div className="app-container">

      {/* ======== ДЕСКТОП: проект-центричная навигация (ADR-002) ======== */}
      <ProjectNav
        tabs={TABS}
        activeTab={activeTab}
        onSelectTab={goToTab}
        clients={activeClients}
        scopeView={effectiveScope}
        canCreate={canCreate}
        onNewProject={() => setIsModalOpen(true)}
        onOpenProject={requestOpenProject}
        onOpenBalance={openClientBalance}
        activeProjectId={activeClient?.id}
        onOpenLibrary={openPro100Library}
        libraryActive={showDesktopLibrary}
        onEditClient={requestEditClient}
        workspaceOpen={showWorkspace}
        activeFileCategory={fileCategory}
        onSelectFileCategory={setFileCategory}
        onUploadFile={() => fileUploadTriggerRef.current?.()}
        filesUploading={filesUploading}
        archivedClients={archivedClients}
        trashClients={trashClients}
        canManageLifecycle={canManageLifecycle}
        canPurge={canPurge}
        lifecycleBusy={lifecycleBusy}
        onChangeLifecycle={handleChangeLifecycle}
        onPurgeProjects={requestPurgeProjects}
      />

      {/* ======== МОБАЙЛ: топбар + dropdown ======== */}
      {/* Пока открыт полноэкранный Projekty, старый topbar не рендерится — его заменяет
          собственный Mobile App Bar внутри MobileProjectsScreen. */}
      {!showMobileProjects && activeTab !== 'materials' && activeTab !== 'board' && activeTab !== 'settings' && (
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

          <div className={s.topbarAvatar} style={{ background: profile?.color || '#718096' }}>
            {initials(profile?.full_name)}
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
                clients={activeClients}
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
            clients={activeClients}
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
        {failedBootstrapResources.length > 0 && (
          <div className={s.bootstrapNotice} role="alert">
            <span>
              {'Nie uda\u0142o si\u0119 za\u0142adowa\u0107: '}
              {failedBootstrapResources.map(resource => BOOTSTRAP_RESOURCE_LABELS[resource]).join(', ')}.
              {' Pozosta\u0142a cz\u0119\u015b\u0107 aplikacji nadal dzia\u0142a.'}
            </span>
            <button
              type="button"
              onClick={retryFailedBootstrapResources}
              disabled={bootstrapLoading}
            >
              {bootstrapLoading ? 'Ponawianie\u2026' : 'Spr\u00f3buj ponownie'}
            </button>
          </div>
        )}
        {lifecycleNotice && (
          <div className={s.bootstrapNotice} role="alert">
            <span>{lifecycleNotice}</span>
            <button type="button" onClick={() => setLifecycleNotice(null)}>Zamknij</button>
          </div>
        )}
        <div className="main-content" style={(showWorkspace || showDesktopBalance || showDesktopLibrary) ? { display: 'flex', flexDirection: 'column' } : undefined}>
        <Suspense fallback={<ContentLoading />}>
        {showDesktopLibrary ? (
          <Pro100Library profilesById={profilesById} />
        ) : showDesktopBalance ? (
          <MobileClientBalanceScreen
            desktopLayout
            clientName={balanceClientName}
            clients={balanceClients}
            transactions={cashTransactions}
            onSaveTransaction={saveCashTransaction}
            onDeleteTransaction={deleteCashTransaction}
            onSaveProjectCoefficient={saveProjectCoefficient}
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
            materials={prioritizedMaterials}
            servicesList={prioritizedServices}
            onClose={() => setViewMode('tab')}
            onSave={handleUpdateClient}
            onCoverChange={(clientId, url) => setClients(prev => prev.map(c => c.id === clientId ? { ...c, cover_url: url } : c))}
            currentProfile={profile}
            initialTab={projectModalTab}
            onDirtyChange={setWorkspaceDirty}
            pendingProjectLabel={pendingClient
              ? (pendingClient.client.project_name || pendingClient.client.client_name || pendingClient.client.full_name || '—')
              : pendingBalanceClientName
                ? `Bilans klienta: ${pendingBalanceClientName}`
                : null}
            onConfirmSwitch={confirmPendingSwitch}
            onCancelSwitch={cancelPendingSwitch}
            cashTransactions={cashTransactions}
            onSaveCashTransaction={saveCashTransaction}
            onDeleteCashTransaction={deleteCashTransaction}
            cashStatus={cashStatus}
            onRetryCash={loadCashTransactions}
            fileCategory={fileCategory}
            onFileCategoryChange={setFileCategory}
            fileUploadTriggerRef={fileUploadTriggerRef}
            onFilesUploadingChange={setFilesUploading}
            clientInfoOpen={clientEditOpen}
            onClientInfoOpenChange={setClientEditOpen}
            onAutosaveItems={autosaveProjectItems}
            onCreateCatalogItem={createManualCatalogItem}
            onToggleCatalogFavorite={toggleCatalogFavorite}
          />
        ) : (
        <>
        {activeTab === 'dashboard' && (
          <Dashboard
            clients={activeClients}
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
            clients={activeClients}
            setActiveClient={requestOpenProject}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            updateClient={updateClientFields}
            isDark={isDarkish}
            scopeView={effectiveScope}
          />
        )}
        {activeTab === 'materials' && (
          <MaterialsList
            materials={prioritizedMaterials}
            servicesList={prioritizedServices}
            setIsMaterialModalOpen={setIsMaterialModalOpen}
            onPricesUpdated={reloadMaterials}
            isDark={isDarkish}
            onToggleFavorite={toggleCatalogFavorite}
          />
        )}
        {activeTab === 'settings' && (
          <Settings
            profile={profile}
            profilesById={profilesById}
            scopeView={effectiveScope}
            setScopeView={setScopeView}
            onSignOut={signOut}
          />
        )}
        </>
        )}
        </Suspense>
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
              <div className="form-group"><label>Telefon (opcjonalnie)</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
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
        <Suspense fallback={<OverlayLoading />}>
        <ProjectModal
          key={`mobile-${activeClient?.id}-${projectModalTab}`}
          variant="mobile"
          client={activeClient}
          originalClient={originalClient}
          setClient={setActiveClient}
          materials={prioritizedMaterials}
          servicesList={prioritizedServices}
          onClose={() => { setActiveClient(null); setOriginalClient(null) }}
          onSave={handleUpdateClient}
          onCoverChange={(clientId, url) => setClients(prev => prev.map(c => c.id === clientId ? { ...c, cover_url: url } : c))}
          currentProfile={profile}
          initialTab={projectModalTab}
          onDirtyChange={setWorkspaceDirty}
          cashTransactions={cashTransactions}
          onSaveCashTransaction={saveCashTransaction}
          onDeleteCashTransaction={deleteCashTransaction}
          cashStatus={cashStatus}
          onRetryCash={loadCashTransactions}
          clientInfoOpen={clientEditOpen}
          onClientInfoOpenChange={setClientEditOpen}
          onAutosaveItems={autosaveProjectItems}
          onCreateCatalogItem={createManualCatalogItem}
          onToggleCatalogFavorite={toggleCatalogFavorite}
        />
        </Suspense>
      )}

      {/* «Usuń trwale» из корзины — только owner (повторно проверяется RLS в БД). */}
      {purgeRequest && (
        <PurgeProjectsDialog
          projects={purgeRequest}
          busy={lifecycleBusy}
          onConfirm={confirmPurgeProjects}
          onCancel={() => setPurgeRequest(null)}
        />
      )}

      {/* Модал: новый материал */}
      {isMaterialModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMaterialModalOpen(false)}>
          <div className="modal-content" style={{ width:'100%', maxWidth:'500px', boxSizing:'border-box' }} onClick={e => e.stopPropagation()}>
            <h2>Dodaj nowy materiał</h2>
            <form onSubmit={handleAddMaterial}>
              <div className="form-group"><label>Pełna nazwa</label><input type="text" required value={matName} onChange={e => setMatName(e.target.value)} /></div>
              <div className="form-group"><label>Artykuł</label><input type="text" value={matSymbol} onChange={e => setMatSymbol(e.target.value)} placeholder="np. W960 SM lub BL-71B3550" /></div>
              <div className="form-group">
                <label>Kategoria</label>
                <select value={matCategory} onChange={e => setMatCategory(e.target.value)} style={{ padding:'10px', borderRadius:'6px', border:'1px solid #ccc' }}>
                  <option value="Płyta">Płyta</option><option value="Obrzeże">Obrzeże</option>
                  <option value="Zawiasy">Zawiasy</option><option value="Prowadnice">Prowadnice</option>
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

      {/* Мобильный экран Projekty смонтирован всегда, чтобы поиск и фильтр не сбрасывались
          при переходах между нижними разделами. На 768px и выше всегда скрыт. */}
      <MobileProjectsScreen
        visible={showMobileProjects}
        clients={activeClients}
        scopeView={effectiveScope}
        canCreate={canCreate}
        onNewProject={() => setIsModalOpen(true)}
        onOpenProject={requestOpenProject}
        activeProjectId={activeClient?.id}
        onOpenBalance={openClientBalance}
        onEditClient={requestEditClient}
        archivedClients={archivedClients}
        trashClients={trashClients}
        canManageLifecycle={canManageLifecycle}
        canPurge={canPurge}
        lifecycleBusy={lifecycleBusy}
        onChangeLifecycle={handleChangeLifecycle}
        onPurgeProjects={requestPurgeProjects}
        lifecycleNotice={lifecycleNotice}
      />

      {/* Mobile / Client Balance / Expanded v1 — отдельный полноэкранный экран (кнопка "Bilans" в
          заголовке группы клиента, ProjectListPanel). Список Projekty выше остаётся смонтированным
          (не открытие проекта — requestOpenProject здесь не вызывается); нижняя навигация скрыта
          покрытием z-index этого экрана (см. .module.css), без правок MobileBottomNav.jsx. */}
      {!isDesktop && balanceClientName && (
        <Suspense fallback={<OverlayLoading />}>
        <MobileClientBalanceScreen
          clientName={balanceClientName}
          clients={balanceClients}
          transactions={cashTransactions}
          onSaveTransaction={saveCashTransaction}
          onDeleteTransaction={deleteCashTransaction}
          onSaveProjectCoefficient={saveProjectCoefficient}
          cashStatus={cashStatus}
          onRetryCash={loadCashTransactions}
          onClose={() => setBalanceClientName(null)}
        />
        </Suspense>
      )}

      {/* Нижняя мобильная навигация (ADR-003). Видимость — чисто через CSS-медиазапрос
          (max-width: 767px) в MobileBottomNav.module.css, компонент смонтирован всегда. */}
      <MobileBottomNav
        ref={bottomNavRef}
        active={mobileNavActive}
        onProjekty={showMobileProjectsHome}
        onTablica={() => goToTab('board')}
        onMaterialy={() => goToTab('materials')}
        onUstawienia={() => goToTab('settings')}
      />

      {AI_ASSISTANT_ENABLED && (
        <Suspense fallback={null}><AiAssistant /></Suspense>
      )}
    </div>
  )
}

export default App
