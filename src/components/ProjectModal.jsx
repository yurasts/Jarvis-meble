import { useState, useEffect, useCallback, useRef } from 'react';
import FilesTab from './FilesTab';
import ProjectCashLedger from './ProjectCashLedger';
import ProjectTasksPanel from './ProjectTasksPanel';
import ProjectImportantPoints from './ProjectImportantPoints';
import MobileProjectItemRow from './MobileProjectItemRow';
import MaterialPicker from './MaterialPicker';
import ServicePicker from './ServicePicker';
import DesktopProjectItemsTable from './DesktopProjectItemsTable';
import WorkspaceSection from './WorkspaceSection';
import useWorkspaceSections from './useWorkspaceSections';
import useProjectItemEditor from './useProjectItemEditor';
import useProjectItemPickers from './useProjectItemPickers';
import useProjectSaveLifecycle from './useProjectSaveLifecycle';
import useProjectCloseLifecycle from './useProjectCloseLifecycle';
import useProjectTabLifecycle from './useProjectTabLifecycle';
import { projectTotals } from './dashboardHelpers';
import { summarizeCash, transactionsForProject } from '../utils/cashLedger';
import { compareMaterialsByWorkflow } from '../utils/materialSort';
import { hasProjectFieldChanges } from '../utils/projectDirtyState';
import { statusBgVar, statusColorVar, statusLabel } from '../utils/projectStatuses';
import ms from './ProjectModal.module.css';

// Статусы (подписи и цвета) — utils/projectStatuses.js + токены --status-* в src/index.css.
const cx = (...classNames) => classNames.filter(Boolean).join(' ');

const ProjectModal = ({ client, originalClient, setClient, materials, servicesList, onClose, onSave, currentProfile = null, isDark = false, theme = 'light', onCoverChange, initialTab = 'materials', variant = 'modal', onDirtyChange, pendingProjectLabel = null, onConfirmSwitch, onCancelSwitch,
  // Единый project_cash_transactions используется в Rozliczenia на mobile и embedded desktop;
  // modal-fallback сохраняет прежний calc_expenses для обратной совместимости.
  cashTransactions = [], onSaveCashTransaction, onDeleteCashTransaction, cashStatus = 'ready', onRetryCash,
  // Desktop workspace 2026-10 (только variant='embedded'): выбранная папка файлов и "+" живут в
  // левой панели (ProjectListPanel), окно редактирования клиента открывается карандашом там же.
  fileCategory, onFileCategoryChange, fileUploadTriggerRef, onFilesUploadingChange,
  clientInfoOpen: clientInfoOpenProp, onClientInfoOpenChange,
}) => {
  const isMobile = window.innerWidth < 640;
  // variant='embedded' — рабочая область справа на desktop (ADR-002, UX-фаза 2);
  // variant='mobile' — полноэкранный мобильный экран проекта до 767px (ADR-003, Mobile Field
  // Mode faza 2), заменяет прежний modal-fallback на этой ширине;
  // variant='modal' (по умолчанию) — прежнее поведение без изменений (адаптивный fallback).
  // Вся внутренняя логика сметы ниже общая для всех трёх вариантов — меняется только обёртка.
  const isEmbedded = variant === 'embedded';
  const isMobileVariant = variant === 'mobile';
  // Zapisz zostawia ekran otwarty (nie zamyka) zarówno w embedded, jak i w mobile — tylko
  // "zwykły" modal zamyka się po zapisaniu (zachowanie sprzed UX-fazy 2.1).
  const staysOpenOnSave = isEmbedded || isMobileVariant;

  // ✅ Нейтральный "хром" — через переменные темы (Jasny/Ciemny/Forest)
  const c = (light, dark) => isDark ? dark : light;
  const bg        = 'var(--modal-bg)';
  const bgHeader  = 'var(--bg-kanban-col)';
  const bgMatRow  = theme === 'forest' ? '#4f7057' : c('#ebf8ff', '#0f2236');
  const bgSrvRow  = c('#f0fff4', '#0f2a1a');
  const bgExpRow  = c('#fff5f5', '#2d1515');
  const bgInput   = 'var(--input-bg)';
  const text      = 'var(--text-main)';
  const textLight = 'var(--text-muted)';
  const border    = 'var(--border)';
  const borderMat = c('#bee3f8', '#1a3a5c');
  const borderSrv = c('#c6f6d5', '#1a4a2e');
  const borderExp = c('#fed7d7', '#7b2020');

  // Вызывающий код всегда передаёт key вида `${client.id}-${initialTab}` (App.jsx), поэтому
  // при смене проекта/initialTab весь ProjectModal перемонтируется — ленивая инициализация
  // ниже достаточна, отдельный эффект синхронизации не нужен (был react-hooks/set-state-in-effect).
  // На desktop/embedded и на mobile отдельной вкладки "Pliki" больше нет (файлы — компактная
  // полка: в шапке на desktop/embedded, внутри прокручиваемого контента на mobile — см. ниже),
  // поэтому initialTab='files' безопасно откатывается на 'materials' в обоих случаях; сама полка
  // вместо этого открывается развёрнутой (filesShelfExpanded ниже). Настоящая вкладка "Pliki"
  // остаётся только у variant='modal' (fallback вне embedded/mobile).
  const [activeTab, setActiveTab] = useState(
    ((isEmbedded || isMobileVariant) && initialTab === 'files') ? 'materials' : initialTab
  );
  // Развёрнутость полки Pliki (isEmbedded — в шапке; isMobileVariant — в контенте) — состояние
  // поднято сюда (контролируемый FilesTab через expanded/onExpandedChange), потому что от него
  // зависит CSS-раскладка шапки на desktop/embedded (полка занимает всю ширину под компактной
  // строкой Klient/.../Zapisz); один и тот же стейт переиспользуется для mobile, т.к. варианты
  // взаимно исключают друг друга — в любой момент активен ровно один.
  const [filesShelfExpanded, setFilesShelfExpanded] = useState(initialTab === 'files');
  // Окно «Klient i projekt»: в embedded управляется из App (карандаш в левой панели), в
  // mobile/modal — локально (кнопка с именем клиента / ℹ️ в шапке).
  const [localClientInfoOpen, setLocalClientInfoOpen] = useState(false);
  const isClientInfoControlled = isEmbedded && clientInfoOpenProp !== undefined;
  const clientInfoOpen = isClientInfoControlled ? clientInfoOpenProp : localClientInfoOpen;
  const setClientInfoOpen = (open) => {
    if (isClientInfoControlled) onClientInfoOpenChange?.(open);
    else setLocalClientInfoOpen(open);
  };
  // Единственная раскрытая строка среди ДОБАВЛЕННЫХ позиций (desktop-таблицы Materiały/Usługi/
  // Wydatki, а также mobile-карточки Materiały — feat/mobile-material-row-compact) — nullable-ключ
  // вместо объекта с несколькими флагами: раскрытие новой строки автоматически схлопывает
  // предыдущую, повторный клик по уже раскрытой закрывает её. Ключ — стабильный item.id (есть у
  // любой добавленной позиции: и из справочника, и через handleCustomAdd) с префиксом таблицы,
  // чтобы id из разных таблиц не пересекались.
  const updateItems = useCallback((field, newItems) => {
    setClient(current => ({ ...current, [field]: newItems }));
  }, [setClient]);
  const {
    expandedItemKey,
    setExpandedItemKey,
    confirmDeleteKey,
    setConfirmDeleteKey,
    editingPrice,
    setEditingPrice,
    priceDraft,
    setPriceDraft,
    quantityDrafts: qtyDraft,
    toggleExpandedItem,
    closeEditor: closeMobileRowEditor,
    finishEditing,
    handleQuantityFocus: handleQtyFocus,
    handleQuantityChange: handleQtyChange,
    commitQuantity: handleQtyCommit,
    savePrice: handlePriceSave,
    removeItem: handleRemoveItem,
  } = useProjectItemEditor({ updateItems });

  // Mobile Project Workspace v1: секции "Dodane pozycje" (Materiały) и Usługi — свёрнуты/развёрнуты
  // по статусу проекта (ленивая инициализация, тот же паттерн, что и раньше был у coefficient —
  // при смене проекта весь ProjectModal перемонтируется, см. key в App.jsx). Чисто локальный UI-стейт,
  // не пишется в Supabase. status === 'new' — открыто сразу; на более поздних этапах пользователь
  // раскрывает вручную кнопкой-toggle.
  // (client.status || 'new') — проект без заполненного статуса ведёт себя как "Nowy" (открыто),
  // а не как поздний этап (закрыто).
  const [mobileMaterialsOpen, setMobileMaterialsOpen] = useState(() => (client.status || 'new') === 'new');
  const [mobileServicesOpen, setMobileServicesOpen] = useState(() => (client.status || 'new') === 'new');
  const [desktopMaterialsOpen, setDesktopMaterialsOpen] = useState(true);
  const [desktopServicesOpen, setDesktopServicesOpen] = useState(true);
  // Desktop workspace (embedded) 2026-10: вкладок нет — Materiały, Usługi, Rozliczenia, Zadania и
  // Informacje идут друг под другом сворачиваемыми секциями; что свёрнуто, запоминается
  // (useWorkspaceSections, localStorage) и сохраняется при переключении проектов.
  const workspaceSections = useWorkspaceSections();

  // Mobile / Client Balance / Expanded v1 — открытый (несохранённый) редактор денежной операции
  // во вкладке Rozliczenia (ProjectCashLedger — неконтролируемое использование, сам репортит сюда
  // через onDirtyChange). Отдельная от calc_* isDirty переменная сравнения ниже — project_cash_
  // transactions это отдельная таблица, не поле client — но "уход назад при dirty требует
  // подтверждения" должно работать одинаково для обоих видов несохранённых изменений, поэтому
  // ниже примешивается в общий isDirty через ||.
  const [cashDirty, setCashDirty] = useState(false);
  // Смена вкладки прочь от Rozliczenia при cashDirty=true (review P1) — ждёт подтверждения вместо
  // немедленного unmount ProjectCashLedger (который иначе тихо теряет черновик). Значение — имя
  // таба, на который хотели переключиться, или null.
  const cashLedgerRef = useRef(null);
  // Редактируемый współczynnik в desktop Rozliczenia (единственное место редактирования —
  // прежняя финансовая панель sidebar убрана, см. chore/remove-sidebar-finance-panel-and-ai-fab).
  // Коммит значения идёт в client.budget_coefficient (setClient) — тот же путь, что и раньше у
  // убранной панели: budget пересчитывается существующим эффектом ниже, clientFieldsDirty уже
  // сравнивает budget_coefficient (hasProjectFieldChanges), поэтому обычный Zapisz сохраняет его
  // без отдельного канала сохранения — никакой новой логики персиста не требуется.
  const [coefficientEditing, setCoefficientEditing] = useState(false);
  const [coefficientDraft, setCoefficientDraft] = useState('');

  const handleCoefficientEdit = () => {
    setCoefficientDraft(String(Number(client.budget_coefficient) || 2));
    setCoefficientEditing(true);
  };

  const handleCoefficientChange = (value) => setCoefficientDraft(value);

  const handleCoefficientFinish = () => {
    const value = parseFloat(String(coefficientDraft).replace(',', '.'));
    if (Number.isFinite(value) && value > 0) {
      setClient(prev => ({ ...prev, budget_coefficient: value }));
    }
    setCoefficientEditing(false);
  };

  const handleCoefficientCancel = () => setCoefficientEditing(false);
  const projectCashSaldo = summarizeCash(transactionsForProject(cashTransactions, client.id)).saldo;
  const formatDesktopCashMoney = (value) => Number(value || 0)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const calcMaterials = client.calc_materials || [];
  const sortedCalcMaterialEntries = calcMaterials
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareMaterialsByWorkflow(a.item, b.item));
  const calcServices  = client.calc_services  || [];
  const calcExpenses  = client.calc_expenses  || [];

  // Единый расчёт (dashboardHelpers.projectTotals) — та же формула, что и в финансовой панели
  // sidebar (ProjectListPanel), не две независимые реализации.
  const { materials: totalMaterials, services: totalServices, expenses: totalExpenses, total: totalProjectCost } = projectTotals(client);

  // isDirty: сравниваем только то что реально меняет пользователь.
  // budget НЕ сравниваем — это чисто производное значение (totalProjectCost × budget_coefficient),
  // пересчитывается автоматически ниже и может отличаться от сохранённого на копейки из-за
  // округления, что вызывало бы ложный isDirty. budget_coefficient, наоборот, теперь СРАВНИВАЕМ —
  // это единственное поле, которое реально меняет пользователь (в т.ч. из sidebar-панели
  // ProjectListPanel через тот же setClient/activeClient — единый источник истины), и по заданию
  // изменение коэффициента обязано включать dirty-state.
  const clientFieldsDirty = hasProjectFieldChanges(client, originalClient);
  // Mobile / Client Balance / Expanded v1: cashDirty (открытый несохранённый редактор денежной
  // операции в Rozliczenia) примешан в общий isDirty — "уход назад при dirty" (handleClose ниже)
  // и все существующие потребители isDirty (onDirtyChange → App.jsx workspaceDirty, confirmClose)
  // реагируют на него точно так же, как на несохранённые calc_*/поля клиента, без отдельного пути.
  const isDirty = clientFieldsDirty || cashDirty;

  const {
    confirmClose,
    setConfirmClose,
    finalizeClose,
    handleClose,
  } = useProjectCloseLifecycle({
    isDirty,
    isMobileVariant,
    isEmbedded,
    onClose,
    onDirtyChange,
  });
  const {
    saveStatus,
    saveAllDirty,
    handleSaveClick,
  } = useProjectSaveLifecycle({
    cashDirty,
    clientFieldsDirty,
    cashLedgerRef,
    onSave,
    finalizeClose,
    staysOpenOnSave,
    isMobileVariant,
    closeMobileRowEditor,
  });
  // Автопересчёт Budżet при изменении Koszty (totalProjectCost). ВАЖНО: источник коэффициента —
  // исключительно client.budget_coefficient (единый источник истины для финансовой панели в
  // sidebar — ProjectListPanel пишет туда через тот же setClient/activeClient; в mobile Workspace
  // коэффициент/Budżet не редактируются вовсе, см. Mobile Project Workspace v1 п.2 — Szczegóły
  // убран). Эффект НЕ пишет budget_coefficient сам, только производный budget.
  // setClient — стабильный setter из useState в App.jsx (setActiveClient), его identity не
  // меняется между рендерами, поэтому добавление в deps безопасно и не создаёт цикл.
  useEffect(() => {
    const coef = Number(client.budget_coefficient) || 2.0;
    const newBudget = parseFloat((totalProjectCost * coef).toFixed(2));
    setClient(prev => ({ ...prev, budget: newBudget }));
  }, [totalProjectCost, client.budget_coefficient, setClient]);

  // Baza materiałów: fokus otwiera istniejące pozycje także przy pustym zapytaniu;
  // wpisany tekst filtruje po name/symbol, a widok ogranicza listę do 12 pozycji.
  const authorMeta = () => ({ addedById: currentProfile?.id || null, addedByColor: currentProfile?.color || '#718096' });

  const handleAddItem = (field, currentItems, item) => {
    const existing = currentItems.find(i => i.id === item.id);
    if (existing) {
      updateItems(field, currentItems.map(i => i.id === item.id ? { ...i, quantity: (Number(i.quantity) || 1) + 1 } : i));
    } else {
      updateItems(field, [...currentItems, { ...item, quantity: 1, ...authorMeta() }]);
    }
  };
  // Сворачивание секции Materiały/Usługi (hotfix, п.3): если секция сейчас ОТКРЫТА (мы её
  // закрываем) — сначала finishEditing() (коммит активного input + полный сброс редактора), и
  // только потом toggle. При повторном раскрытии секции раскрытых строк/delete-confirm уже нет.
  // Открытие (сейчас закрыта) не нуждается в finishEditing — закрывать нечего.
  const handleToggleMobileMaterials = () => {
    if (mobileMaterialsOpen) finishEditing();
    setMobileMaterialsOpen(o => !o);
  };
  const handleToggleMobileServices = () => {
    if (mobileServicesOpen) finishEditing();
    setMobileServicesOpen(o => !o);
  };
  const handleToggleDesktopMaterials = () => {
    if (desktopMaterialsOpen) finishEditing();
    setDesktopMaterialsOpen(open => !open);
  };
  const handleToggleDesktopServices = () => {
    if (desktopServicesOpen) finishEditing();
    setDesktopServicesOpen(open => !open);
  };
  // Сворачивание секции рабочей области: как и раньше у Materiały/Usługi — сначала закрыть
  // редактор строки и выпадающий список выбора, потом скрыть секцию.
  const toggleWorkspaceSection = (id) => {
    if (workspaceSections.isOpen(id)) {
      if (id === 'materials' || id === 'services') finishEditing();
      if (id === 'materials') closeMaterialPicker();
      if (id === 'services') closeServicePicker();
    }
    workspaceSections.toggle(id);
  };
  const handleCustomAdd = (field, currentItems) => {
    const name = prompt('Wpisz nazwę:');
    if (!name) return;
    const price = parseFloat(prompt('Wpisz cenę za szt/usługę (zł):') || '0');
    updateItems(field, [...currentItems, { id: Date.now(), name, price, quantity: 1, unit: 'szt', category: 'Inne', supplier: 'Brak', ...authorMeta() }]);
  };

  const { material: materialPicker, service: servicePicker, resetPickers } = useProjectItemPickers({
    materials,
    services: servicesList,
    selectedMaterials: calcMaterials,
    selectedServices: calcServices,
    isMobileVariant,
    currentProfile,
    updateItems,
    addItem: handleAddItem,
    addCustomItem: handleCustomAdd,
    finishEditing,
    closeItemEditor: closeMobileRowEditor,
  });
  const {
    searchTerm,
    setSearchTerm,
    isOpen: materialSearchOpen,
    setIsOpen: setMaterialSearchOpen,
    highlightedIndex: highlightedMaterialIndex,
    setHighlightedIndex: setHighlightedMaterialIndex,
    categoryFilter: materialCategoryFilter,
    setCategoryFilter: setMaterialCategoryFilter,
    categoryOptions: materialCategoryOptions,
    supplierFilter: materialSupplierFilter,
    setSupplierFilter: setMaterialSupplierFilter,
    supplierOptions: materialSupplierOptions,
    expandedGroupId: expandedMaterialId,
    setExpandedGroupId: setExpandedMaterialId,
    replacingIndex: replacingMaterialIndex,
    groups: filteredMaterialGroups,
    pickerRef: materialPickerRef,
    searchInputRef: materialSearchInputRef,
    optionRefs: materialOptionRefs,
    offerButtonRefs: materialOfferButtonRefs,
    close: closeMaterialPicker,
    startReplacement: startMaterialReplacement,
    manualAdd: handleManualMaterialAdd,
    handleKeyDown: handleMaterialPickerKeyDown,
    select: addMaterialFromPicker,
  } = materialPicker;
  const {
    searchTerm: searchService,
    setSearchTerm: setSearchService,
    isOpen: serviceSearchOpen,
    setIsOpen: setServiceSearchOpen,
    highlightedIndex: highlightedServiceIndex,
    setHighlightedIndex: setHighlightedServiceIndex,
    services: filteredServices,
    pickerRef: servicePickerRef,
    searchInputRef: serviceSearchInputRef,
    optionRefs: serviceOptionRefs,
    close: closeServicePicker,
    manualAdd: handleManualServiceAdd,
    handleKeyDown: handleServicePickerKeyDown,
    select: addServiceFromPicker,
  } = servicePicker;
  const {
    pendingTabChange,
    cashTabSaveError,
    handleTabChange,
    cancelTabChange,
    discardTabChange,
    saveAndChangeTab,
  } = useProjectTabLifecycle({
    activeTab,
    setActiveTab,
    isMobileVariant,
    isEmbedded,
    cashDirty,
    setCashDirty,
    cashLedgerRef,
    finishEditing,
    resetPickers,
  });

  const rowStripe = (item) => item.addedByColor || '#e2e8f0';

  // Кнопка удаления с подтверждением. Tag='td' (по умолчанию, для таблиц) или 'span' (для
  // мобильных карточек, где обёртка — flex-row <div>, а не <table>/<tr> — ADR-003, Mobile Field
  // Mode faza 2: раньше здесь всегда возвращался <td>, даже внутри <div>, что было невалидным
  // HTML — уже существовавший баг в mobile-карточках materials/services, тут же исправленный).
  const renderDeleteBtn = (field, currentItems, index, Tag = 'td') => {
    const key = `${field}-${index}`;
    if (confirmDeleteKey === key) return (
      <Tag style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '11px', color: '#e53e3e', fontWeight: 'bold', marginRight: '4px' }}>Usunąć?</span>
        <button onClick={() => handleRemoveItem(field, currentItems, index)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', marginRight: '2px' }}>Tak</button>
        <button onClick={() => setConfirmDeleteKey(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
      </Tag>
    );
    return (
      <Tag style={{ padding: '4px 8px', textAlign: 'center' }}>
        <button onClick={() => setConfirmDeleteKey(key)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
          onMouseEnter={e => e.target.style.color = '#e53e3e'} onMouseLeave={e => e.target.style.color = '#cbd5e0'} title="Usuń">✖</button>
      </Tag>
    );
  };

  // Класс вкладки: цвета активной вкладки задаются токенами раздела (--section-*) в
  // ProjectModal.module.css, тёмные значения — в src/index.css, без isDark в JS.
  const tabClassName = (tab, sectionClass) => cx(
    ms.tab,
    sectionClass,
    activeTab === tab && ms.tabActive,
    isMobileVariant && ms.tabMobile,
  );

  // variant='mobile' (ADR-003, Mobile Field Mode faza 2): pełnoekranowy widok do 767px, zastępuje
  // dotychczasowy modal-fallback. Układ to przewidywalna kolumna flex (bez ujemnych marginesów):
  // ms.shellMobile → sztywna wysokość viewportu; ms.panelMobile → kolumna [nagłówek][obszar przewijania
  // flex:1][pasek Zapisz]; przewija się WYŁĄCZNIE środkowy obszar (ms.contentMobile) — nagłówek
  // i pasek Zapisz są zwykłymi elementami flex (flexShrink:0), nie sticky.
  const shellClassName = isEmbedded
    ? ms.shellEmbedded
    : isMobileVariant
      // 100dvh / overscroll-behavior / непрозрачный фон — см. .shellMobile в ProjectModal.module.css.
      ? ms.shellMobile
      : cx(ms.shellModal, isMobile && ms.shellModalCompact);

  const panelClassName = cx(
    ms.panel,
    isEmbedded ? ms.panelEmbedded : isMobileVariant ? ms.panelMobile : ms.panelModal,
    !isEmbedded && !isMobileVariant && isMobile && ms.panelModalCompact,
  );

  // Цвет и лёгкая заливка по статусу проекта — единственные значения из данных, остальное в CSS.
  const statusStyle = {
    '--project-status-color': statusColorVar(client.status),
    '--project-status-bg': statusBgVar(client.status),
  };

  // Jedyny przewijany obszar ekranu mobilnego (między sztywnym nagłówkiem a paskiem Zapisz) —
  // zawiera polkę plików, taby i treść tabów (Mobile Project Workspace v1): .contentMobile.

  // Etykiety/komunikat dialogu potwierdzenia — wyliczone raz, bez IIFE w JSX (ostatnie powodowało
  // fałszywy błąd react-hooks/refs, bo finalizeClose zamyka się nad refem historii).
  const closeLabels = (pendingProjectLabel || pendingTabChange)
    ? { discard: 'Odrzuć zmiany', save: 'Zapisz i przejdź dalej', cancel: 'Anuluj' }
    : isMobileVariant
      ? { discard: 'Odrzuć zmiany', save: 'Zapisz i wróć', cancel: 'Anuluj' }
      : { discard: 'Zamknij bez zapisania', save: 'Zapisz i zamknij', cancel: 'Wróć' };

  const closeMessage = pendingProjectLabel
    ? `Chcesz otworzyć „${pendingProjectLabel}” — odrzucić niezapisane zmiany w tym projekcie?`
    : pendingTabChange
      ? 'Masz niezapisaną operację w Rozliczeniach — odrzucić ją?'
      : isMobileVariant
        ? 'Chcesz wrócić do listy projektów — odrzucić niezapisane zmiany?'
        : 'Czy na pewno chcesz zamknąć bez zapisania?';

  // ==================== Mobile Project Workspace v1 (p.5/6/7) ====================
  // Общий render-helper для компактных строк Materiały/Usługi/Rozliczenia(Wydatki) на mobile —
  // НЕ объединяет модели данных (каждая секция вызывает его ясно ссо своим полем/массивом), только
  // переиспользует одну и ту же разметку строки (сжатая 24px → раскрытая ~64px редактируемая →
  // подтверждение удаления с полным именем) и уже существующие handlers/state этого компонента
  // (handlePriceSave/handleQty*/handleRemoveItem/expandedItemKey/confirmDeleteKey/priceDraft/
  // qtyDraft) — те же самые price/qty/Enter/onBlur/evalQty/dirty-механизмы, что и в desktop-таблице
  // и в isMobile-карточках выше, без дублирования их логики.
  const MOBILE_ROW_PREFIX = { calc_materials: 'mat', calc_services: 'srv', calc_expenses: 'exp' };
  const MOBILE_ROW_ACCENT = {
    calc_materials: { text: c('#2b6cb0', '#63b3ed'), bg: bgMatRow, border: borderMat },
    calc_services:  { text: c('#276749', '#68d391'), bg: bgSrvRow, border: borderSrv },
    calc_expenses:  { text: c('#c53030', '#fc8181'), bg: bgExpRow, border: borderExp },
  };

  const renderMobileRow = (field, items, index) => {
    const item = items[index];
    const itemKey = item.id ?? index;
    const prefix = MOBILE_ROW_PREFIX[field];
    const rowKey = `${prefix}-${itemKey}`;
    const stateKey = `${prefix}-${index}`;
    const deleteKey = `${field}-${index}`;
    const accent = MOBILE_ROW_ACCENT[field];

    const openRow = () => {
      finishEditing();
      setPriceDraft(String(item.price));
      setExpandedItemKey(rowKey);
    };

    return (
      <MobileProjectItemRow
        key={itemKey}
        field={field}
        item={item}
        isExpanded={expandedItemKey === rowKey}
        isConfirmingDelete={confirmDeleteKey === deleteKey}
        isReplacingMaterial={field === 'calc_materials' && replacingMaterialIndex === index}
        priceDraft={priceDraft}
        quantityDraft={qtyDraft[stateKey]}
        accent={accent}
        colors={{
          bgHeader,
          bgInput,
          border,
          text,
          textLight,
          rowStripe: rowStripe(item),
          replacementBackground: c('#dbeafe', '#17365c'),
        }}
        onOpen={openRow}
        onFinishEditing={finishEditing}
        onPriceDraftChange={setPriceDraft}
        onPriceSave={() => handlePriceSave(field, items, index)}
        onQuantityFocus={currentValue => handleQtyFocus(stateKey, currentValue)}
        onQuantityChange={value => handleQtyChange(stateKey, value)}
        onQuantityCommit={() => handleQtyCommit(field, items, index, stateKey)}
        onRequestDelete={() => setConfirmDeleteKey(deleteKey)}
        onCancelDelete={() => setConfirmDeleteKey(null)}
        onRemove={() => handleRemoveItem(field, items, index)}
        onStartMaterialReplacement={() => startMaterialReplacement(index)}
      />
    );
  };

  // Заголовок секции Materiały/Usługi — toggle слева + "Dodane pozycje", сумма справа,
  // aria-expanded (p.5). Rozliczenia (p.7) свой, более простой заголовок без toggle — не переиспользует.
  const renderSectionHeader = (open, onToggle, total, label = 'Dodane pozycje', totalPrefix = '') => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={ms.sectionHeader}
    >
      <span className={ms.sectionHeaderLabel}>
        {/* Зелёный checkbox/✓ — визуальный индикатор раскрытия секции (по Figma), а не отдельный
            интерактивный элемент: клик обрабатывает вся кнопка-заголовок, aria-expanded на ней же. */}
        <span aria-hidden="true" className={cx(ms.sectionCheck, open && ms.sectionCheckOn)}>
          {open ? '✓' : ''}
        </span>
        {label}
      </span>
      <strong className={ms.sectionTotal}>{totalPrefix}{totalPrefix ? formatDesktopCashMoney(total) : total.toFixed(2)} zł</strong>
    </button>
  );

  // Jeden wspólny selektor dla desktopu i mobile. Na mobile pole w treści jest przyciskiem,
  // a prawdziwy input powstaje dopiero w portalu u góry ekranu. iOS nie zdąży więc przewinąć
  // długiej strony do dolnego pola przed przeniesieniem selektora.
  const renderMaterialPicker = (compact = false) => (
    <MaterialPicker
      compact={compact}
      isMobileVariant={isMobileVariant}
      isOpen={materialSearchOpen}
      searchTerm={searchTerm}
      highlightedIndex={highlightedMaterialIndex}
      groups={filteredMaterialGroups}
      categoryFilter={materialCategoryFilter}
      categoryOptions={materialCategoryOptions}
      supplierFilter={materialSupplierFilter}
      supplierOptions={materialSupplierOptions}
      expandedGroupId={expandedMaterialId}
      replacingMaterialIndex={replacingMaterialIndex}
      selectedMaterials={calcMaterials}
      pickerRef={materialPickerRef}
      searchInputRef={materialSearchInputRef}
      optionRefs={materialOptionRefs}
      offerButtonRefs={materialOfferButtonRefs}
      colors={{
        bgInput,
        bgHeader,
        bgMaterialRow: bgMatRow,
        border,
        text,
        textLight,
        replacementBackground: c('#ebf8ff', '#17365c'),
        highlightBackground: c('#dbeafe', '#17365c'),
        expandedBackground: c('#f8fafc', '#162232'),
        blueText: c('#2b6cb0', '#63b3ed'),
        blueButton: c('#2b6cb0', '#3182ce'),
      }}
      onClose={closeMaterialPicker}
      onOpen={() => {
        setHighlightedMaterialIndex(0);
        setMaterialSearchOpen(true);
      }}
      onManualAdd={handleManualMaterialAdd}
      onSearchFocus={() => {
        setMaterialSearchOpen(true);
        setHighlightedMaterialIndex(0);
      }}
      onSearchChange={value => {
        setSearchTerm(value);
        setMaterialSearchOpen(true);
        setHighlightedMaterialIndex(0);
      }}
      onSearchKeyDown={handleMaterialPickerKeyDown}
      onCategoryChange={value => {
        setMaterialCategoryFilter(value);
        setMaterialSearchOpen(true);
        setHighlightedMaterialIndex(0);
        setExpandedMaterialId(null);
      }}
      onSupplierChange={value => {
        setMaterialSupplierFilter(value);
        setMaterialSearchOpen(true);
        setHighlightedMaterialIndex(0);
        setExpandedMaterialId(null);
      }}
      onHighlight={setHighlightedMaterialIndex}
      onToggleGroup={key => setExpandedMaterialId(previous => previous === key ? null : key)}
      onSelectMaterial={addMaterialFromPicker}
    />
  );

  const renderServicePicker = (compact = false) => (
    <ServicePicker
      compact={compact}
      isMobileVariant={isMobileVariant}
      isOpen={serviceSearchOpen}
      searchTerm={searchService}
      highlightedIndex={highlightedServiceIndex}
      services={filteredServices}
      selectedServices={calcServices}
      pickerRef={servicePickerRef}
      searchInputRef={serviceSearchInputRef}
      optionRefs={serviceOptionRefs}
      colors={{
        bgInput,
        bgHeader,
        border,
        text,
        textLight,
        selectedBackground: bgSrvRow,
        highlightBackground: c('#dcfce7', '#17452b'),
        accent: c('#276749', '#68d391'),
      }}
      onClose={closeServicePicker}
      onOpen={() => {
        setHighlightedServiceIndex(0);
        setServiceSearchOpen(true);
      }}
      onManualAdd={handleManualServiceAdd}
      onSearchFocus={() => {
        setServiceSearchOpen(true);
        setHighlightedServiceIndex(0);
      }}
      onSearchChange={value => {
        setSearchService(value);
        setServiceSearchOpen(true);
        setHighlightedServiceIndex(0);
      }}
      onSearchKeyDown={handleServicePickerKeyDown}
      onHighlight={setHighlightedServiceIndex}
      onSelectService={addServiceFromPicker}
    />
  );

  const renderDesktopItemsTable = ({ kind, entries, items, field, headerBackground, headerText, headerBorder, accent, rowBackground, footer = null, replacingIndex = null, bordered = true, showHeader = true }) => (
    <DesktopProjectItemsTable
      kind={kind}
      entries={entries}
      expandedItemKey={expandedItemKey}
      editingPrice={editingPrice}
      priceDraft={priceDraft}
      quantityDrafts={qtyDraft}
      replacingIndex={replacingIndex}
      colors={{
        border,
        text,
        mutedText: textLight,
        inputBackground: bgInput,
        headerBackground,
        headerText,
        headerBorder,
        accent,
        rowBackground,
        replacementBackground: c('#dbeafe', '#17365c'),
        nameText: kind === 'materials' ? accent : text,
      }}
      rowStripe={rowStripe}
      footer={footer}
      onToggleExpanded={toggleExpandedItem}
      onStartReplacement={startMaterialReplacement}
      onStartPriceEdit={(stateKey, price) => {
        setEditingPrice(stateKey);
        setPriceDraft(String(price));
      }}
      onPriceDraftChange={setPriceDraft}
      onPriceSave={index => handlePriceSave(field, items, index)}
      onCancelPriceEdit={() => setEditingPrice(null)}
      onQuantityFocus={handleQtyFocus}
      onQuantityChange={handleQtyChange}
      onQuantityCommit={(index, stateKey) => handleQtyCommit(field, items, index, stateKey)}
      renderDeleteCell={index => renderDeleteBtn(field, items, index)}
      bordered={bordered}
      showHeader={showHeader}
    />
  );

  // Desktop workspace (embedded): пять секций одинаковой ширины друг под другом.
  const renderWorkspaceSections = () => (
    <div className={ms.workspaceSections}>
      <WorkspaceSection
        title="Materiały"
        meta={calcMaterials.length > 0 ? `${calcMaterials.length} poz.` : null}
        summary={`${totalMaterials.toFixed(2)} zł`}
        open={workspaceSections.isOpen('materials')}
        onToggle={() => toggleWorkspaceSection('materials')}
        flush
      >
        {renderDesktopItemsTable({
          kind: 'materials',
          entries: sortedCalcMaterialEntries,
          items: calcMaterials,
          field: 'calc_materials',
          headerBackground: bgHeader,
          headerText: textLight,
          headerBorder: border,
          accent: c('#2b6cb0', '#63b3ed'),
          rowBackground: bgMatRow,
          footer: renderMaterialPicker(false),
          replacingIndex: replacingMaterialIndex,
          bordered: false,
          showHeader: false,
        })}
      </WorkspaceSection>

      <WorkspaceSection
        title="Usługi"
        meta={calcServices.length > 0 ? `${calcServices.length} poz.` : null}
        summary={`${totalServices.toFixed(2)} zł`}
        open={workspaceSections.isOpen('services')}
        onToggle={() => toggleWorkspaceSection('services')}
        flush
      >
        {renderDesktopItemsTable({
          kind: 'services',
          entries: calcServices.map((item, index) => ({ item, index })),
          items: calcServices,
          field: 'calc_services',
          headerBackground: bgSrvRow,
          headerText: c('#276749', '#68d391'),
          headerBorder: borderSrv,
          accent: c('#276749', '#68d391'),
          // Строки услуг с заливкой, как строки материалов (зелёный тон раздела).
          rowBackground: 'var(--section-services-tint)',
          footer: renderServicePicker(false),
          bordered: false,
          showHeader: false,
        })}
      </WorkspaceSection>

      {/* Rozliczenia — тот же ProjectCashLedger, что в Bilans klienta; смонтирован всегда (в т.ч.
          в свёрнутой секции), поэтому несохранённая операция не теряется при сворачивании. */}
      <WorkspaceSection
        title="Rozliczenia"
        summary={`Saldo ${formatDesktopCashMoney(projectCashSaldo)} zł`}
        open={workspaceSections.isOpen('cash')}
        onToggle={() => toggleWorkspaceSection('cash')}
        flush
      >
        <div className={ms.workspaceCash}>
          <ProjectCashLedger
            ref={cashLedgerRef}
            client={client}
            transactions={cashTransactions}
            onSaveTransaction={onSaveCashTransaction}
            onDeleteTransaction={onDeleteCashTransaction}
            showProjectHeader
            desktopLayout
            compactHeader
            onDirtyChange={setCashDirty}
            status={cashStatus}
            onRetry={onRetryCash}
            coefficientValue={coefficientDraft}
            coefficientEditing={coefficientEditing}
            onCoefficientEdit={handleCoefficientEdit}
            onCoefficientChange={handleCoefficientChange}
            onCoefficientFinish={handleCoefficientFinish}
            onCoefficientCancel={handleCoefficientCancel}
          />
        </div>
      </WorkspaceSection>

      <ProjectTasksPanel
        layout="workspace"
        open={workspaceSections.isOpen('tasks')}
        onToggle={() => toggleWorkspaceSection('tasks')}
        tasks={client.tasks || []}
        currentProfile={currentProfile}
        onChange={(tasks) => setClient(prev => ({ ...prev, tasks }))}
      />

      <ProjectImportantPoints
        layout="workspace"
        open={workspaceSections.isOpen('info')}
        onToggle={() => toggleWorkspaceSection('info')}
        points={client.important_points || []}
        currentProfile={currentProfile}
        onChange={(importantPoints) => setClient(prev => ({ ...prev, important_points: importantPoints }))}
      />
    </div>
  );

  // Firma/Moje + Zapisz (+ статус сохранения) — общий блок для modal-fallback (справа в шапке
  // Klient/Projekt) и embedded (справа от полки файлов, без отдельной строки шапки).
  const renderScopeAndSaveActions = () => {
    const isFirma = (client.project_scope || 'firma') === 'firma';
    const isPersonal = client.project_scope === 'personal';
    return (
      <div className={ms.actions}>
        <div className={ms.actionsRow}>
          <div className={ms.scopeToggle} role="group" aria-label="Grupa projektu">
            <button
              type="button"
              onClick={() => setClient(prev => ({ ...prev, project_scope: 'firma' }))}
              title="Projekt firmowy"
              aria-label="Projekt firmowy"
              aria-pressed={isFirma}
              className={cx(ms.scopeBtn, isFirma && ms.scopeBtnActive)}
            >
              🏢
            </button>
            <button
              type="button"
              onClick={() => setClient(prev => ({ ...prev, project_scope: 'personal' }))}
              title="Mój projekt"
              aria-label="Mój projekt"
              aria-pressed={isPersonal}
              className={cx(ms.scopeBtn, isPersonal && ms.scopeBtnActive)}
            >
              👤
            </button>
          </div>
          <button type="button" onClick={handleSaveClick} className={ms.saveBtn}>💾 Zapisz</button>
        </div>
        {isEmbedded && saveStatus && (
          <div role="status" className={cx(ms.saveStatus, saveStatus !== 'saved' && ms.saveStatusError)}>
            {saveStatus === 'saved' ? '✓ Zapisano' : 'Nie udało się zapisać zmian. Spróbuj ponownie.'}
          </div>
        )}
      </div>
    );
  };

    return (
    <div className={shellClassName} onClick={isEmbedded ? undefined : handleClose}>
      <div className={panelClassName} style={statusStyle} onClick={isEmbedded ? undefined : (e => e.stopPropagation())}>

        {/* "← Wróć" usunięty z desktop/embedded (compact-project-workspace) — powrót do listy
            projektów na desktop odbywa się przez sam sidebar (ProjectNav), nie przez osobny
            przycisk w karcie; "← Projekty" na mobile (niżej) zostaje bez zmian. */}

        {/* Nagłówek mobile (ADR-003, Mobile Field Mode faza 2): sztywny element kolumny flex
            (ms.panelMobile), nie sticky i bez ujemnych marginesów — leży nad przewijanym
            ms.contentMobile, więc zawsze widoczny i nigdy nie zasłania ostatniego wiersza treści. */}
        {isMobileVariant && (
          <div className={ms.mobileHeader}>
            <button onClick={handleClose} className={ms.mobileBackBtn}>
              ← Projekty
            </button>
            <div className={ms.mobileTitleRow}>
              <div className={ms.mobileTitleText}>
                <div className={ms.mobileClientRow}>
                  <span className={ms.mobileClientName}>
                    {client.client_name || 'Klient'}
                  </span>
                  <button
                    onClick={() => setClientInfoOpen(true)}
                    title="Informacje o kliencie"
                    className={ms.infoIconBtn}
                  >
                    ℹ️
                  </button>
                </div>
                <div className={ms.mobileProjectName}>
                  {client.project_name || 'Projekt'}
                </div>
              </div>
              <span className={ms.statusPill}>
                {statusLabel(client.status)}
              </span>
            </div>
          </div>
        )}

        {/* Jedyny przewijany obszar treści na mobile (polka plików + taby + treść taba) — dla innych
            wariantów className jest undefined, więc to zwykły, niestylowany div bez wpływu
            na desktop/embedded (ADR-003, faza 2: usunięcie ujemnych marginesów). */}
        <div className={isMobileVariant ? ms.contentMobile : undefined}>

        {/* Polka plików (Mobile Project Workspace v1): ten sam <FilesTab variant="shelf"> co
            w desktop/embedded header, tylko mobileWorkspaceLayout=true (rząd przycisków folderów +
            stała karuzela 132×132px zamiast select+Rozwiń/Zwiń — p.3 zadania). Leży wewnątrz
            jedynego przewijanego obszaru (ms.contentMobile), zaraz po nagłówku, przed tabami — jako
            zwykły element flow, bez position:fixed/sticky, więc przewija się razem z resztą treści.
            Jeden zamontowany FilesTab i jeden fetch — dokładnie jak na desktop/embedded. */}
        {isMobileVariant && (
          <div className={ms.mobileShelf}>
            <FilesTab
              variant="shelf"
              mobileWorkspaceLayout
              clientId={client.id}
              currentProfile={currentProfile}
              coverUrl={client.cover_url}
              onCoverChange={(url) => { setClient(prev => ({ ...prev, cover_url: url })); onCoverChange?.(client.id, url); }}
            />
          </div>
        )}

        {/* Компактная шапка (compact-project-workspace): Klient i Projekt w jednym rzędzie,
            Koszty×coefficient/Budżet przeniesione do panelu finansowego w sidebar (desktop) —
            tu ich już nie ma. Prawy blok (Firma/Moje + Zapisz) zawija się pod spód na wąskiej
            szerokości (flexWrap), ale sam Klient/Projekt nigdy nie dostaje poziomego scrolla —
            oba pola też mogą się zawinąć każde na swój wiersz (patrz flexWrap na ich kontenerze). */}
        {!isMobileVariant && !isEmbedded && (
        <div className={ms.modalHeader}>
          <div className={ms.modalHeaderRow}>

            {/* ЛЕВО: Klient + Projekt — одна горизонтальная строка, оба поля редактируемые */}
            <div className={ms.modalHeaderFields}>
              <div className={cx(ms.modalHeaderField, ms.modalHeaderFieldClient)}>
                <span className={ms.fieldLabel}>Klient:</span>
                <input
                  value={client.client_name || ''}
                  onChange={e => setClient(prev => ({ ...prev, client_name: e.target.value }))}
                  placeholder="Imię klienta"
                  className={cx(ms.headerInput, ms.headerInputClient, isMobile && ms.headerInputClientCompact)}
                />
                <button
                  onClick={() => setClientInfoOpen(true)}
                  title="Informacje o kliencie"
                  className={cx(ms.infoIconBtn, ms.infoIconBtnLarge)}
                >
                  ℹ️
                </button>
              </div>
              <div className={cx(ms.modalHeaderField, ms.modalHeaderFieldProject)}>
                <span className={ms.fieldLabel}>Projekt:</span>
                <input
                  value={client.project_name || ''}
                  onChange={e => setClient(prev => ({ ...prev, project_name: e.target.value }))}
                  placeholder="Nazwa projektu (szafa, kuchnia...)"
                  className={cx(ms.headerInput, ms.headerInputProject, isMobile && ms.headerInputProjectCompact)}
                />
              </div>
            </div>

            {/* ПРАВО: Firma/Moje + Zapisz — переносится под Klient/Projekt на узкой ширине */}
            {renderScopeAndSaveActions()}
          </div>
        </div>
        )}

        {/* Desktop workspace 2026-10: строки Klient/Projekt больше нет (клиент и проект видны в
            дереве слева, редактирование — карандашом там же); папки файлов тоже переключаются
            слева. Здесь — лента файлов выбранной папки + строка .sto, а справа от неё компактные
            Firma/Moje и Zapisz, чтобы не тратить отдельную строку по высоте. */}
        {isEmbedded && (
          <div className={ms.workspaceShelfRow}>
            <div className={ms.workspaceShelfMain}>
              <FilesTab
                variant="shelf"
                clientId={client.id}
                currentProfile={currentProfile}
                coverUrl={client.cover_url}
                onCoverChange={(url) => { setClient(prev => ({ ...prev, cover_url: url })); onCoverChange?.(client.id, url); }}
                expanded={filesShelfExpanded}
                onExpandedChange={setFilesShelfExpanded}
                externalFolderControls={fileCategory !== undefined}
                category={fileCategory}
                onCategoryChange={onFileCategoryChange}
                uploadTriggerRef={fileUploadTriggerRef}
                onUploadingChange={onFilesUploadingChange}
              />
            </div>
            {renderScopeAndSaveActions()}
          </div>
        )}

        {/* Модалка редактируемой информации о клиенте */}
        {clientInfoOpen && (
          <div className={ms.dialogBackdrop} onClick={() => setClientInfoOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="client-info-title"
              className={ms.dialog}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setClientInfoOpen(false); } }}
            >
              <div className={ms.dialogHeader}>
                <span id="client-info-title">{isEmbedded ? '✏️ Klient i projekt' : '👤 Informacje o kliencie'}</span>
                <button type="button" aria-label="Zamknij" onClick={() => setClientInfoOpen(false)} className={ms.dialogClose}>✕</button>
              </div>
              <div className={ms.dialogBody}>
                {/* В embedded строки Klient/Projekt в шапке больше нет — имена редактируются здесь. */}
                {isEmbedded && (
                  <>
                    <div className={ms.dialogField}>
                      <span className={ms.dialogLabel}>Klient:</span>
                      <input
                        autoFocus
                        aria-label="Imię klienta"
                        value={client.client_name || ''}
                        onChange={e => setClient(prev => ({ ...prev, client_name: e.target.value }))}
                        placeholder="Imię klienta"
                        className={cx(ms.dialogInput, ms.dialogInputStrong)}
                      />
                    </div>
                    <div className={ms.dialogField}>
                      <span className={ms.dialogLabel}>Projekt:</span>
                      <input
                        aria-label="Nazwa projektu"
                        value={client.project_name || ''}
                        onChange={e => setClient(prev => ({ ...prev, project_name: e.target.value }))}
                        placeholder="Nazwa projektu (szafa, kuchnia...)"
                        className={cx(ms.dialogInput, ms.dialogInputStrong)}
                      />
                    </div>
                  </>
                )}
                <div className={ms.dialogField}>
                  <span className={ms.dialogLabel}>📍 Adres:</span>
                  <input
                    value={client.address || ''}
                    onChange={e => setClient(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Adres montażu"
                    className={ms.dialogInput}
                  />
                  {client.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                      target="_blank" rel="noreferrer"
                      title="Otwórz w Mapach Google"
                      className={ms.dialogLink}
                    >
                      🗺️
                    </a>
                  )}
                </div>
                <div className={ms.dialogField}>
                  <span className={ms.dialogLabel}>📞 Tel:</span>
                  <input
                    value={client.phone || ''}
                    onChange={e => setClient(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Telefon (opcjonalnie)"
                    className={ms.dialogInput}
                  />
                  {client.phone && (
                    <a href={`tel:${client.phone}`} title="Zadzwoń" className={ms.dialogLink}>📲</a>
                  )}
                </div>
                <div className={ms.dialogField}>
                  <span className={ms.dialogLabel}>📅 Termin:</span>
                  <input
                    type="date"
                    value={client.deadline || ''}
                    onChange={e => setClient(prev => ({ ...prev, deadline: e.target.value }))}
                    className={cx(ms.dialogInput, ms.dialogInputDate)}
                  />
                </div>
                <div className={ms.dialogField}>
                  <span className={ms.dialogLabel}>💬 Uwagi:</span>
                  <input
                    value={client.notes || ''}
                    onChange={e => setClient(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Dodatkowe informacje..."
                    className={ms.dialogInput}
                  />
                </div>
                {isEmbedded && (
                  <div className={ms.dialogFooter}>
                    <span className={ms.dialogHint}>Zmiany zapisz przyciskiem „Zapisz”.</span>
                    <button
                      type="button"
                      onClick={() => setClientInfoOpen(false)}
                      className={ms.saveBtn}
                    >
                      Gotowe
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Табы — тёмная тема. На mobile (Mobile Project Workspace v1, p.4) — три РАВНЫЕ по ширине
            вкладки без emoji и без сумм в названиях (flex:1 через ms.tabMobile поверх общего
            ms.tab); третья вкладка сохраняет внутренний id 'expenses' (данные/схема не трогаются),
            меняется только подпись — "Rozliczenia" вместо "Wydatki". desktop/embedded сохраняют
            emoji и суммы в названиях без изменений. */}
        {!isEmbedded && (
        <div className={cx(ms.tabBar, isMobileVariant && ms.tabBarMobile)}>
          <button onClick={() => handleTabChange('materials')} className={tabClassName('materials', ms.tabMaterials)}>

            {isMobileVariant ? 'Materiały' : `📦 Materiały (${totalMaterials.toFixed(2)} zł)`}
          </button>
          <button onClick={() => handleTabChange('services')} className={tabClassName('services', ms.tabServices)}>

            {isMobileVariant ? 'Usługi' : `🛠 Usługi (${totalServices.toFixed(2)} zł)`}
          </button>
          <button onClick={() => handleTabChange('expenses')} className={tabClassName('expenses', ms.tabExpenses)}>

            {isMobileVariant ? 'Rozliczenia' : `💸 Wydatki (${totalExpenses.toFixed(2)} zł)`}
          </button>
          {/* Pliki — не отдельная вкладка ни на desktop/embedded (полка в шапке), ни на mobile
              (полка в контенте, feat/mobile-files-zoom) — только у настоящего modal-fallback
              (variant='modal', вне embedded/mobile), где полки нет вовсе. */}
          {!isEmbedded && !isMobileVariant && (
            <button onClick={() => setActiveTab('files')} className={tabClassName('files', ms.tabFiles)}>
              📎 Pliki
            </button>
          )}
        </div>
        )}

        {isEmbedded ? renderWorkspaceSections() : (
        <div style={{ minHeight: isMobileVariant ? '350px' : 0 }}>

          {/* МАТЕРИАЛЫ */}
          {activeTab === 'materials' && (
            isMobileVariant ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderSectionHeader(mobileMaterialsOpen, handleToggleMobileMaterials, totalMaterials)}
                {mobileMaterialsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Dodane materiały */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {calcMaterials.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '12px', color: textLight, fontSize: '12.5px' }}>Brak dodanych materiałów</div>
                      )}
                      {sortedCalcMaterialEntries.map(({ index }) => renderMobileRow('calc_materials', calcMaterials, index))}
                    </div>
                    {renderMaterialPicker(true)}
                  </div>
                )}
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {renderSectionHeader(desktopMaterialsOpen, handleToggleDesktopMaterials, totalMaterials)}
              <div style={{ display: desktopMaterialsOpen ? 'block' : 'none' }}>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {calcMaterials.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych materia&#322;&#243;w</div>}
                    {sortedCalcMaterialEntries.map(({ index }) => renderMobileRow('calc_materials', calcMaterials, index))}
                    {renderMaterialPicker(true)}
                  </div>
                ) : (
                  renderDesktopItemsTable({
                    kind: 'materials',
                    entries: sortedCalcMaterialEntries,
                    items: calcMaterials,
                    field: 'calc_materials',
                    headerBackground: bgHeader,
                    headerText: textLight,
                    headerBorder: border,
                    accent: c('#2b6cb0', '#63b3ed'),
                    rowBackground: bgMatRow,
                    footer: renderMaterialPicker(false),
                    replacingIndex: replacingMaterialIndex,
                  })
                )}
              </div>
            </div>
            )
          )}

          {/* УСЛУГИ */}
          {activeTab === 'services' && (
            isMobileVariant ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderSectionHeader(mobileServicesOpen, handleToggleMobileServices, totalServices)}
                {mobileServicesOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {renderServicePicker(true)}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {calcServices.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '12px', color: textLight, fontSize: '12.5px' }}>Brak dodanych usług</div>
                      )}
                      {calcServices.map((item, index) => renderMobileRow('calc_services', calcServices, index))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {renderSectionHeader(desktopServicesOpen, handleToggleDesktopServices, totalServices)}
              <div style={{ display: desktopServicesOpen ? 'block' : 'none' }}>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {calcServices.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych us&#322;ug</div>}
                    {calcServices.map((item, index) => renderMobileRow('calc_services', calcServices, index))}
                    {renderServicePicker(true)}
                  </div>
                ) : (
                  renderDesktopItemsTable({
                    kind: 'services',
                    entries: calcServices.map((item, index) => ({ item, index })),
                    items: calcServices,
                    field: 'calc_services',
                    headerBackground: bgSrvRow,
                    headerText: c('#276749', '#68d391'),
                    headerBorder: borderSrv,
                    accent: c('#276749', '#68d391'),
                    rowBackground: bg,
                    footer: renderServicePicker(false),
                  })
                )}
              </div>


            </div>
            )
          )}

          {/* Rozliczenia mobile/embedded: тот же
              ProjectCashLedger, что и в MobileClientBalanceScreen (Bilans klienta), тот же
              cashTransactions/onSaveCashTransaction/onDeleteCashTransaction из App.jsx (единый
              источник, без копирования) — отфильтрован здесь по activeClient.id. calc_expenses
              (legacy/расчётные позиции) сюда не подмешиваются и не трактуются как реальные
              расходы; Wpłaty/Saldo — настоящие, из project_cash_transactions, не имитация.
              cashDirty (см. выше) примешивается в общий isDirty через onDirtyChange ниже —
              неконтролируемое использование (без editingKey/onEditingKeyChange пропсов), у этой
              единственной карточки собственный, локальный editingKey. Embedded (desktop) — секция
              Rozliczenia в renderWorkspaceSections; обычный modal-fallback ниже сохраняет calc_expenses. */}
          {activeTab === 'expenses' && (
            isMobileVariant ? (
              <ProjectCashLedger
                ref={cashLedgerRef}
                client={client}
                transactions={cashTransactions}
                onSaveTransaction={onSaveCashTransaction}
                onDeleteTransaction={onDeleteCashTransaction}
                onDirtyChange={setCashDirty}
                status={cashStatus}
                onRetry={onRetryCash}
              />
            ) : (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <button onClick={() => handleCustomAdd('calc_expenses', calcExpenses)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>+ Dodaj wydatek (Paliwo, Zakupy itp.)</button>
              </div>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {calcExpenses.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodatkowych wydatk&#243;w</div>}
                  {calcExpenses.map((item, index) => renderMobileRow('calc_expenses', calcExpenses, index))}
                </div>
                ) : (
              renderDesktopItemsTable({
                kind: 'expenses',
                entries: calcExpenses.map((item, index) => ({ item, index })),
                items: calcExpenses,
                field: 'calc_expenses',
                headerBackground: bgExpRow,
                headerText: c('#c53030', '#fc8181'),
                headerBorder: borderExp,
                accent: c('#c53030', '#fc8181'),
                rowBackground: bg,
              })
              )}
            </div>
            )
          )}

          {/* ФАЙЛЫ — только настоящий modal-fallback; на desktop/embedded и на mobile FilesTab
              уже смонтирован как полка (variant="shelf") выше, и activeTab никогда не равен
              'files' в этих двух вариантах (см. initialTab выше). */}
          {!isEmbedded && !isMobileVariant && activeTab === 'files' && (
            <FilesTab variant="tab" clientId={client.id} currentProfile={currentProfile} coverUrl={client.cover_url} onCoverChange={(url) => { setClient(prev => ({ ...prev, cover_url: url })); onCoverChange?.(client.id, url); }} />
          )}

          {isMobileVariant && (
            <ProjectTasksPanel
              tasks={client.tasks || []}
              currentProfile={currentProfile}
              onChange={(tasks) => setClient(prev => ({ ...prev, tasks }))}
            />
          )}

          {isMobileVariant && (
            <ProjectImportantPoints
              points={client.important_points || []}
              currentProfile={currentProfile}
              onChange={(importantPoints) => setClient(prev => ({ ...prev, important_points: importantPoints }))}
            />
          )}
        </div>
        )}

        </div>
        {/* /ms.contentMobile — koniec jedynego przewijanego obszaru mobile */}

        {/* Zawsze widoczna zona działań na dole (ADR-003, Mobile Field Mode faza 2) — zwykły
            element kolumny flex (ms.panelMobile), nie sticky, więc fizycznie nigdy nie nachodzi na
            ostatni wiersz przewijanej treści; env(safe-area-inset-bottom) dodaje margines na
            strefę bezpieczną telefonu (np. pasek gestów iOS) zamiast na sztywny padding. */}
        {isMobileVariant && (
          <div className={ms.saveBar}>
            <button
              onClick={handleSaveClick}
              className={ms.saveBarBtn}
            >
              💾 Zapisz
            </button>
            {saveStatus && (
              <div className={cx(ms.saveBarStatus, saveStatus !== 'saved' && ms.saveBarStatusError)}>
                {saveStatus === 'saved' ? '✓ Zapisano' : 'Nie udało się zapisać zmian. Spróbuj ponownie.'}
              </div>
            )}
          </div>
        )}

        {/* Подтверждение закрытия / переключения на другой проект / возврата к списку на mobile
            (тот же диалог, ADR-002 UX-faza 2.1 + ADR-003 faza 2 — не дублируется). */}
        {(confirmClose || pendingProjectLabel || pendingTabChange) && (
          <div className={cx(ms.confirmOverlay, isMobileVariant && ms.confirmOverlayMobile)}>
            <div className={ms.confirmCard}>
              <div className={ms.confirmIcon}>⚠️</div>
              <h3 className={ms.confirmTitle}>Masz niezapisane zmiany</h3>
              <p className={ms.confirmText}>{closeMessage}</p>
              {saveStatus === 'error' && !pendingTabChange && (
                <p className={ms.confirmError}>
                  Nie udało się zapisać zmian. Spróbuj ponownie.
                </p>
              )}
              {pendingTabChange && cashTabSaveError && (
                <p className={ms.confirmError}>
                  Nie udało się zapisać operacji. Spróbuj ponownie.
                </p>
              )}
              <div className={ms.confirmActions}>
                <button
                  onClick={() => { if (pendingTabChange) { discardTabChange(); } else if (pendingProjectLabel) { onConfirmSwitch?.({ saved: false }); } else { finalizeClose(); } }}
                  className={ms.confirmDiscard}
                >
                  {closeLabels.discard}
                </button>
                <button
                  onClick={async () => {
                    if (pendingTabChange) { await saveAndChangeTab(); return; }
                    const result = await saveAllDirty();
                    if (result?.error) { return; }
                    setConfirmClose(false);
                    pendingProjectLabel ? onConfirmSwitch?.({ saved: true }) : finalizeClose();
                  }}
                  className={ms.confirmSave}
                >
                  {closeLabels.save}
                </button>
                <button
                  onClick={() => { if (pendingTabChange) { cancelTabChange(); } else if (pendingProjectLabel) { onCancelSwitch?.(); } else { setConfirmClose(false); } }}
                  className={ms.confirmCancel}
                >
                  {closeLabels.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectModal;
