import { useState, useEffect, useCallback, useRef } from 'react';
import FilesTab from './FilesTab';
import ProjectCashLedger from './ProjectCashLedger';
import { projectTotals } from './dashboardHelpers';
import { summarizeCash, transactionsForProject } from '../utils/cashLedger';

// Лёгкая заливка фона по статусу проекта
const STATUS_OVERLAY = {
  new:        { light: 'rgba(229,62,62,0.04)',   dark: 'rgba(229,62,62,0.08)'   },
  design:     { light: 'rgba(221,107,32,0.04)',  dark: 'rgba(221,107,32,0.08)'  },
  production: { light: 'rgba(214,158,46,0.04)',  dark: 'rgba(214,158,46,0.08)'  },
  done:       { light: 'rgba(56,161,105,0.04)',  dark: 'rgba(56,161,105,0.08)'  },
};

const STATUS_BORDER_COLOR = {
  new:        '#e53e3e',
  design:     '#dd6b20',
  production: '#d69e2e',
  done:       '#38a169',
};

// Krótkie polskie etykiety statusu dla kompaktowej pigułki w nagłówku mobilnym (ADR-003,
// Mobile Field Mode faza 2) — skrócone wersje tych samych statusów co w Settings.jsx
// ("Legenda statusów projektów"), bez nowej logiki.
const STATUS_LABEL = {
  new:        'Nowy',
  design:     'Projektowanie',
  production: 'Produkcja',
  done:       'Gotowe',
};

const ProjectModal = ({ client, originalClient, setClient, materials, servicesList, onClose, onSave, currentProfile = null, isDark = false, theme = 'light', onCoverChange, initialTab = 'materials', variant = 'modal', onDirtyChange, pendingProjectLabel = null, onConfirmSwitch, onCancelSwitch,
  // Единый project_cash_transactions используется в Rozliczenia на mobile и embedded desktop;
  // modal-fallback сохраняет прежний calc_expenses для обратной совместимости.
  cashTransactions = [], onSaveCashTransaction, onDeleteCashTransaction, cashStatus = 'ready', onRetryCash,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [searchService, setSearchService] = useState('');
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  // Единственная раскрытая строка среди ДОБАВЛЕННЫХ позиций (desktop-таблицы Materiały/Usługi/
  // Wydatki, а также mobile-карточки Materiały — feat/mobile-material-row-compact) — nullable-ключ
  // вместо объекта с несколькими флагами: раскрытие новой строки автоматически схлопывает
  // предыдущую, повторный клик по уже раскрытой закрывает её. Ключ — стабильный item.id (есть у
  // любой добавленной позиции: и из справочника, и через handleCustomAdd) с префиксом таблицы,
  // чтобы id из разных таблиц не пересекались.
  const [expandedItemKey, setExpandedItemKey] = useState(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [qtyDraft, setQtyDraft] = useState({});

  // Mobile Project Workspace v1: секции "Dodane pozycje" (Materiały) и Usługi — свёрнуты/развёрнуты
  // по статусу проекта (ленивая инициализация, тот же паттерн, что и раньше был у coefficient —
  // при смене проекта весь ProjectModal перемонтируется, см. key в App.jsx). Чисто локальный UI-стейт,
  // не пишется в Supabase. status === 'new' — открыто сразу; на более поздних этапах пользователь
  // раскрывает вручную кнопкой-toggle.
  // (client.status || 'new') — проект без заполненного статуса ведёт себя как "Nowy" (открыто),
  // а не как поздний этап (закрыто).
  const [mobileMaterialsOpen, setMobileMaterialsOpen] = useState(() => (client.status || 'new') === 'new');
  const [mobileServicesOpen, setMobileServicesOpen] = useState(() => (client.status || 'new') === 'new');

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
  const [pendingTabChange, setPendingTabChange] = useState(null);
  const [cashTabSaveError, setCashTabSaveError] = useState(false);
  const cashLedgerRef = useRef(null);
  const projectCashSaldo = summarizeCash(transactionsForProject(cashTransactions, client.id)).saldo;
  const formatDesktopCashMoney = (value) => Number(value || 0)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const evalQty = (expr) => {
    if (expr === '' || expr === null || expr === undefined) return null;
    const str = String(expr).replace(',', '.').replace(/[^0-9+\-*/.()\s]/g, '');
    try {
      const result = Function('"use strict"; return (' + str + ')')();
      if (typeof result === 'number' && isFinite(result) && result > 0) return parseFloat(result.toFixed(4));
    } catch {
      return null;
    }
    return null;
  };

  const handleQtyFocus = (key, currentValue) => {
    setQtyDraft(prev => ({ ...prev, [key]: String(currentValue ?? '') }));
  };
  const handleQtyChange = (key, value) => {
    setQtyDraft(prev => ({ ...prev, [key]: value }));
  };
  const handleQtyCommit = (field, currentItems, index, key) => {
    const raw = qtyDraft[key];
    if (raw === undefined) return;
    const computed = evalQty(raw);
    if (computed !== null) {
      handleQuantityChange(field, currentItems, index, computed);
      setQtyDraft(prev => ({ ...prev, [key]: String(computed) }));
    } else {
      setQtyDraft(prev => ({ ...prev, [key]: String(currentItems[index].quantity ?? 1) }));
    }
  };

  const calcMaterials = client.calc_materials || [];
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
  const clientFieldsDirty = originalClient
    ? JSON.stringify({
        calc_materials: client.calc_materials || [],
        calc_services:  client.calc_services  || [],
        calc_expenses:  client.calc_expenses  || [],
        notes:         client.notes         || '',
        deadline:      client.deadline      || '',
        address:       client.address       || '',
        phone:         client.phone         || '',
        client_name:   client.client_name   || '',
        project_name:  client.project_name  || '',
        budget_coefficient: Number(client.budget_coefficient) || 2.0,
      }) !== JSON.stringify({
        calc_materials: originalClient.calc_materials || [],
        calc_services:  originalClient.calc_services  || [],
        calc_expenses:  originalClient.calc_expenses  || [],
        notes:         originalClient.notes         || '',
        deadline:      originalClient.deadline      || '',
        address:       originalClient.address       || '',
        phone:         originalClient.phone         || '',
        client_name:   originalClient.client_name   || '',
        project_name:  originalClient.project_name  || '',
        budget_coefficient: Number(originalClient.budget_coefficient) || 2.0,
      })
    : false;
  // Mobile / Client Balance / Expanded v1: cashDirty (открытый несохранённый редактор денежной
  // операции в Rozliczenia) примешан в общий isDirty — "уход назад при dirty" (handleClose ниже)
  // и все существующие потребители isDirty (onDirtyChange → App.jsx workspaceDirty, confirmClose)
  // реагируют на него точно так же, как на несохранённые calc_*/поля клиента, без отдельного пути.
  const isDirty = clientFieldsDirty || cashDirty;

  // Refy — zawsze aktualne wartości dla obsługi History API poniżej (efekt montuje się raz,
  // nie może zależeć od isDirty/onClose bez re-subskrybowania popstate co każdą zmianę pola).
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // Czy bieżący wpis w historii przeglądarki (dodany przy otwarciu w wariancie mobile) wciąż
  // "należy" do tego ekranu — pozwala domknąć go dokładnie raz, bez podwójnego cofania.
  const hasPushedHistoryRef = useRef(false);

  // Historia przeglądarki dla sprzętowego/przeglądarkowego przycisku "wstecz" — tylko w wariancie
  // mobile, bez wprowadzania routera (ADR-003, Mobile Field Mode faza 2). Push raz przy otwarciu;
  // popstate przechodzi przez tę samą ochronę niezapisanych zmian co "← Projekty" — jeśli są
  // zmiany, cofnięcie jest "odtwarzane" (ponowny push) i pokazywany jest dialog zamiast realnego
  // wyjścia z ekranu.
  useEffect(() => {
    if (!isMobileVariant) return;
    window.history.pushState({ jarvisMobileProject: true }, '');
    hasPushedHistoryRef.current = true;
    const onPopState = () => {
      if (isDirtyRef.current) {
        window.history.pushState({ jarvisMobileProject: true }, '');
        setConfirmClose(true);
      } else {
        hasPushedHistoryRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', onPopState);
    // Czyścimy tylko nasłuch (jak wymagane) — celowo NIE wołamy tu history.back(): to wywołanie
    // jest asynchroniczne (wynikowy popstate przychodzi później), więc w React StrictMode (dev —
    // efekt montuje się dwukrotnie: mount → cleanup → mount) spóźniony popstate z PIERWSZEGO
    // cleanupu potrafi trafić już w DRUGI, świeży mount i błędnie go zamknąć. Ewentualny jeden
    // "widmowy" wpis w historii przy realnie nietypowym zniknięciu ekranu (np. zmiana szerokości
    // okna na desktop w trakcie) jest nieszkodliwy — najwyżej jedno dodatkowe wciśnięcie "wstecz"
    // później, zanim użytkownik faktycznie opuści aplikację.
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isMobileVariant]);

  // Realne zamknięcie z poziomu UI (przycisk "← Projekty"/Wróć, dialog potwierdzenia) —
  // w wariancie mobile domyka też wpis historii dodany przy otwarciu.
  const finalizeClose = useCallback(() => {
    if (isMobileVariant && hasPushedHistoryRef.current) {
      hasPushedHistoryRef.current = false;
      window.history.back();
    }
    onClose();
  }, [isMobileVariant, onClose]);

  const handleClose = useCallback(() => { isDirty ? setConfirmClose(true) : finalizeClose(); }, [isDirty, finalizeClose]);

  // Escape w widoku embedded i mobile: idzie przez ten sam handleClose (z potwierdzeniem
  // niezapisanych zmian) — nigdy nie zamyka bezpośrednio przez onClose().
  useEffect(() => {
    if (!isEmbedded && !isMobileVariant) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEmbedded, isMobileVariant, handleClose]);

  // Rodzic (App.jsx) śledzi aktualny stan niezapisanych zmian, żeby zablokować
  // natychmiastową zmianę projektu z listy/Dashboard/Kanban (ADR-002, UX-faza 2.1).
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // null | 'saved' | 'error' — komunikat pod przyciskiem Zapisz w widoku embedded i mobile.
  const [saveStatus, setSaveStatus] = useState(null);
  const saveStatusTimerRef = useRef(null);
  useEffect(() => () => { if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current); }, []);

  // Zapisz i zamknij — zachowanie sprzed UX-fazy 2.1, używane w zwykłym modalu (isMobileVariant=false,
  // isEmbedded=false — tam Rozliczenia to zawsze desktop calc_expenses, ProjectCashLedger nigdy nie
  // jest zamontowany, więc cashDirty tu strukturalnie zawsze false — draft pieniężny nie dotyczy).
  const handleSaveAndClose = async () => {
    const result = await onSave();
    if (result?.error) { setSaveStatus('error'); return; }
    finalizeClose();
  };

  // Wspólny zapis obu źródeł niezapisanych zmian przed "Zapisz i wróć"/"Zapisz i przejdź dalej"
  // (dialog potwierdzenia zamknięcia/przełączenia projektu — NIE mylić z saveAndChangeTab, który
  // obsługuje osobny przypadek zmiany taba wewnątrz otwartego projektu). Review P1: dawniej ten
  // dialog wołał tylko onSave() (pola client) — otwarty draft operacji pieniężnej w Rozliczenia
  // ginął bez ostrzeżenia, bo ekran i tak się zamykał/przełączał. Kolejność (najpierw cash, potem
  // client) i early-return przy błędzie są tu istotne — ekran nie może się zamknąć, dopóki OBA
  // źródła nie zapiszą się poprawnie.
  const saveAllDirty = async () => {
    if (cashDirty) {
      const cashResult = await cashLedgerRef.current?.saveActiveDraft();
      if (cashResult?.error) { setSaveStatus('error'); return { error: true }; }
    }
    if (clientFieldsDirty) {
      const result = await onSave();
      if (result?.error) { setSaveStatus('error'); return { error: true }; }
    }
    return { error: null };
  };

  // Główny „Zapisz” w embedded/mobile zapisuje oba źródła zmian: aktywny draft operacji
  // pieniężnej oraz pola projektu. Sprawdzamy aktywny editor przez ref, a nie wyłącznie cashDirty:
  // onDirtyChange jest raportowany efektem i przy bardzo szybkim wpisaniu + kliknięciu mógłby jeszcze
  // nie zdążyć dotrzeć do rodzica. Kolejność cash → client pozostaje deterministyczna; błąd nie
  // zamyka edytora ani nie gubi wpisanych danych.
  const handleSaveClick = async () => {
    if (!staysOpenOnSave) { await handleSaveAndClose(); return; }
    if (cashLedgerRef.current?.hasActiveDraft()) {
      const cashResult = await cashLedgerRef.current.saveActiveDraft();
      if (cashResult?.error) { setSaveStatus('error'); return; }
    }
    const result = await onSave();
    if (result?.error) { setSaveStatus('error'); return; }
    if (isMobileVariant) closeMobileRowEditor();
    setSaveStatus('saved');
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), 2500);
  };

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

  // Baza materiałów — компактный поиск (compact-project-workspace): пустой/пробельный запрос —
  // ноль строк (каталог больше не отображается постоянно), непустой — фильтр по name/symbol,
  // как раньше, ограничение на 12 совпадений применяется в месте рендера (.slice(0, 12)).
  const filteredMaterials = searchTerm.trim()
    ? (materials || []).filter(m => {
        const q = searchTerm.trim().toLowerCase();
        return (m.name || '').toLowerCase().includes(q) || (m.symbol || '').toLowerCase().includes(q);
      })
    : [];

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleExpandedItem = (key) => setExpandedItemKey(prev => (prev === key ? null : key));
  const updateItems = (field, newItems) => setClient({ ...client, [field]: newItems });
  const authorMeta = () => ({ addedById: currentProfile?.id || null, addedByColor: currentProfile?.color || '#718096' });

  const handleAddItem = (field, currentItems, item) => {
    const existing = currentItems.find(i => i.id === item.id);
    if (existing) {
      updateItems(field, currentItems.map(i => i.id === item.id ? { ...i, quantity: (Number(i.quantity) || 1) + 1 } : i));
    } else {
      updateItems(field, [...currentItems, { ...item, quantity: 1, ...authorMeta() }]);
    }
  };

  // Единое завершение mobile row-редактора (hotfix): очищает ТОЛЬКО UI-состояние (какая строка
  // раскрыта/редактируется, черновики цены/количества, подтверждение удаления) — client, массивы
  // расчётов calc_materials/calc_services/calc_expenses и Supabase здесь не трогаются вообще.
  // Единая точка входа для Materiały/Usługi/Rozliczenia (общий renderMobileRow), для удаления
  // позиции и для смены mobile-вкладки — везде, где редактор строки обязан закрыться.
  const closeMobileRowEditor = () => {
    setExpandedItemKey(null);
    setEditingPrice(null);
    setPriceDraft('');
    setQtyDraft({});
    setConfirmDeleteKey(null);
  };

  // Кнопка "Gotowe" / клик по названию раскрытой mobile-строки: сначала блюрит активный price/qty
  // input этой же строки — это ЗАПУСКАЕТ существующие onBlur-обработчики (handlePriceSave/
  // handleQtyCommit), т.е. те же commit/evalQty/dirty-механизмы, что и раньше, без дублирования
  // их логики здесь, — и только потом закрывает редактор. document.activeElement достаточно без
  // дополнительного скоупинга по строке: одновременно раскрыта/редактируется не более одной строки
  // (expandedItemKey — синглтон), так что сфокусированный input, если он есть, точно принадлежит
  // именно этой строке.
  const finishEditing = () => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }
    closeMobileRowEditor();
  };

  // Смена таба на mobile/embedded: только при ФАКТИЧЕСКОЙ смене — сначала
  // finishEditing() (не closeMobileRowEditor() напрямую!), чтобы активный price/qty input сначала
  // прошёл существующий blur/commit, пока строка ещё смонтирована — переключение таба unmount'ит
  // содержимое предыдущего таба, и полагаться на onBlur во время React-unmount нельзя (не гарантирован).
  // draft/confirm-delete не должны "утекать" в другую вкладку — сценарий Materiały → раскрыть строку →
  // Usługi → Materiały обязан вернуть все строки свёрнутыми, а незакоммиченное значение — сохранённым.
  // В embedded эта же защита нужна для desktop ProjectCashLedger; modal-fallback остаётся без неё.
  const handleTabChange = (tab) => {
    if ((isMobileVariant || isEmbedded) && tab !== activeTab) {
      // cashDirty=true → ProjectCashLedger ma niezapisany draft, a zmiana taba go odmontuje bez
      // ostrzeżenia (review P1) — zamiast tego pytamy, tak jak przy zamykaniu karty projektu.
      if (activeTab === 'expenses' && cashDirty) {
        setPendingTabChange(tab);
        return;
      }
      finishEditing();
    }
    setActiveTab(tab);
  };

  const cancelTabChange = () => { setPendingTabChange(null); setCashTabSaveError(false); };

  const discardTabChange = () => {
    const tab = pendingTabChange;
    setPendingTabChange(null);
    setCashDirty(false);
    finishEditing();
    setActiveTab(tab);
  };

  const saveAndChangeTab = async () => {
    setCashTabSaveError(false);
    const result = await cashLedgerRef.current?.saveActiveDraft();
    // Błąd zapisu draftu jest też widoczny wewnątrz samego edytora (editorError), ale ten dialog
    // leży nad nim (z-index) — bez własnego komunikatu tutaj użytkownik nic by nie zobaczył.
    if (result?.error) { setCashTabSaveError(true); return; }
    const tab = pendingTabChange;
    setPendingTabChange(null);
    setCashDirty(false);
    finishEditing();
    setActiveTab(tab);
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

  // editingPrice/qtyDraft используют ключ по INDEX (mat-0, mat-1…), а не по id — у legacy-позиций
  // без id тем же индексом становится и expandedItemKey (item.id ?? index). После удаления все
  // позиции ПОСЛЕ удалённой сдвигаются на один индекс вниз, поэтому оставшийся draft/expanded-ключ
  // способен "унаследоваться" соседней строкой, чужой по смыслу. Безопасный сброс — очистить весь
  // черновой UI-стейт целиком через closeMobileRowEditor (единственная раскрытая/редактируемая
  // строка всё равно закрывается самим действием удаления).
  const handleRemoveItem = (field, currentItems, indexToRemove) => {
    closeMobileRowEditor();
    updateItems(field, currentItems.filter((_, idx) => idx !== indexToRemove));
  };

  const handleQuantityChange = (field, currentItems, index, newQuantity) => {
    const updated = [...currentItems];
    updated[index].quantity = newQuantity;
    updateItems(field, updated);
  };

  const handlePriceSave = (field, currentItems, index) => {
    const val = parseFloat(priceDraft);
    if (!isNaN(val) && val >= 0) {
      const updated = [...currentItems];
      updated[index] = { ...updated[index], price: val };
      updateItems(field, updated);
    }
    setEditingPrice(null);
  };

  const handleCustomAdd = (field, currentItems) => {
    const name = prompt('Wpisz nazwę:');
    if (!name) return;
    const price = parseFloat(prompt('Wpisz cenę za szt/usługę (zł):') || '0');
    updateItems(field, [...currentItems, { id: Date.now(), name, price, quantity: 1, unit: 'szt', category: 'Inne', supplier: 'Brak', ...authorMeta() }]);
  };

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

  // Стиль таба
  const tabBtn = (tab, activeColor, activeBorder, activeBg) => ({
    padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', border: 'none',
    borderBottom: activeTab === tab ? `3px solid ${activeBorder}` : '3px solid transparent',
    background: activeTab === tab ? (isDark ? activeBg.dark : activeBg.light) : 'transparent',
    color: activeTab === tab ? activeColor : textLight,
  });

  // variant='mobile' (ADR-003, Mobile Field Mode faza 2): pełnoekranowy widok do 767px, zastępuje
  // dotychczasowy modal-fallback. Układ to przewidywalna kolumna flex (bez ujemnych marginesów):
  // outerStyle → sztywna wysokość viewportu; innerStyle → kolumna [nagłówek][obszar przewijania
  // flex:1][pasek Zapisz]; przewija się WYŁĄCZNIE środkowy obszar (contentAreaStyle) — nagłówek
  // i pasek Zapisz są zwykłymi elementami flex (flexShrink:0), nie sticky.
  const outerStyle = isEmbedded
    ? { position: 'relative', width: '100%', height: '100%' }
    : isMobileVariant
      // height/maxHeight: 100dvh — устойчиво к динамическому viewport Safari (адресная строка);
      // overscrollBehavior: contain — доскролл содержимого не должен "протаскивать" документ под
      // экраном (rubber-band не открывает нижележащую страницу); background непрозрачен (var(--modal-bg))
      // и inset:0 полностью покрывает viewport — под экраном ничего не видно и не двигается.
      ? { position: 'fixed', inset: 0, height: '100dvh', maxHeight: '100dvh', zIndex: 1000, background: bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', overscrollBehavior: 'contain' }
      : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: isMobile ? 0 : '30px', paddingBottom: isMobile ? 0 : '30px', overflowY: 'auto' };

  const innerStyle = {
    background: bg,
    backgroundImage: `linear-gradient(${(STATUS_OVERLAY[client.status] || STATUS_OVERLAY.new)[isDark ? 'dark' : 'light']}, ${(STATUS_OVERLAY[client.status] || STATUS_OVERLAY.new)[isDark ? 'dark' : 'light']})`,
    borderRadius: isEmbedded ? '10px' : isMobileVariant ? 0 : (isMobile ? 0 : '10px'),
    width: (isEmbedded || isMobileVariant) ? '100%' : '95%',
    maxWidth: isEmbedded ? '1400px' : isMobileVariant ? 'none' : '1100px',
    padding: isMobileVariant ? 0 : '15px',
    boxShadow: (isEmbedded || isMobileVariant) ? 'none' : '0 10px 25px rgba(0,0,0,0.3)',
    position: 'relative',
    borderTop: isMobileVariant ? 'none' : `3px solid ${STATUS_BORDER_COLOR[client.status] || STATUS_BORDER_COLOR.new}`,
    ...(isMobileVariant ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' } : {}),
  };

  // Jedyny przewijany obszar ekranu mobilnego (między sztywnym nagłówkiem a paskiem Zapisz) —
  // zawiera polkę plików, taby i treść tabów (Mobile Project Workspace v1).
  const contentAreaStyle = isMobileVariant
    ? { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '10px 15px 16px' }
    : undefined;

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
    // Тот же формат ключа (`${prefix}-${index}`), что уже используют editingPrice/qtyDraft в
    // desktop-таблице/isMobile-карточках выше — polностью переиспользуем их состояние и handlers.
    const stateKey = `${prefix}-${index}`;
    const deleteKey = `${field}-${index}`;
    const accent = MOBILE_ROW_ACCENT[field];
    const isExpanded = expandedItemKey === rowKey;
    const isConfirmingDelete = confirmDeleteKey === deleteKey;
    const total = (Number(item.price) * Number(item.quantity || 1)).toFixed(2);

    // Открытие строки (A → B, hotfix): порядок вызовов здесь ДЕТЕРМИНИРОВАН и важен. finishEditing()
    // идёт ПЕРВЫМ — коммитит/закрывает ПРЕДЫДУЩУЮ раскрытую строку (если была) через её же onBlur,
    // затем полностью сбрасывает UI-состояние редактора (в т.ч. priceDraft='' и qtyDraft={}).
    // setPriceDraft(String(item.price)) для ЭТОЙ строки и setExpandedItemKey(rowKey) идут СТРОГО
    // ПОСЛЕ — оба вызова синхронны и относятся к тем же state-переменным, что и внутри
    // finishEditing()/closeMobileRowEditor(), поэтому по правилам батчинга React побеждает
    // последнее вызванное обновление: итоговые priceDraft/expandedItemKey — гарантированно от B,
    // а не затёртый сброс от finishEditing(). qtyDraft у B остаётся пуст (из closeMobileRowEditor) —
    // qtyDraft строки A туда не попадает, B при необходимости сам засеет свой через handleQtyFocus.
    // setExpandedItemKey(rowKey) — напрямую, а не toggleExpandedItem: openRow всегда означает
    // "открыть" (вызывается только из свёрнутого состояния строки), не переключить.
    const openRow = () => {
      finishEditing();
      setPriceDraft(String(item.price));
      setExpandedItemKey(rowKey);
    };

    // Подтверждение удаления показывается ПЕРВЫМ (до проверки isExpanded) — поэтому "Nie" всегда
    // возвращает ровно то состояние (свёрнуто/раскрыто), в котором строка была до нажатия ✖,
    // не трогая expandedItemKey.
    if (isConfirmingDelete) {
      // Полное имя может занимать несколько строк — фиксированная высота 24px здесь недопустима
      // (обрезала бы длинные названия). Tak/Nie — отдельной строкой справа, не перекрывают текст.
      return (
        <div key={itemKey} style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px', borderRadius: '5px', borderLeft: `3px solid ${rowStripe(item)}`, background: accent.bg }}>
          <span style={{ fontSize: '12px', color: text, whiteSpace: 'normal', wordBreak: 'break-word' }}>
            Usunąć „{item.name}”?
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => handleRemoveItem(field, items, index)} style={{ flexShrink: 0, background: '#e53e3e', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Tak</button>
            <button type="button" onClick={() => setConfirmDeleteKey(null)} style={{ flexShrink: 0, background: bgHeader, color: text, border: `1px solid ${border}`, padding: '3px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
          </div>
        </div>
      );
    }

    if (isExpanded) {
      return (
        <div key={itemKey} style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', minHeight: '64px', boxSizing: 'border-box', background: accent.bg, border: `1px solid ${accent.border}`, borderLeft: `4px solid ${rowStripe(item)}`, borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={finishEditing}
            style={{ display: 'block', width: '100%', maxWidth: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'bold', fontSize: '12.5px', color: accent.text, cursor: 'pointer', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {item.name}
          </button>
          <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* fontSize: 16px на price/qty (hotfix) — обязательно: iOS WebKit сам масштабирует
                (зумит) всю страницу при фокусе на input с font-size < 16px, тот же трюк, что и
                у остальных полей приложения. maxWidth:100%/minWidth:0/boxSizing:border-box —
                инпуты не должны раздувать строку шире родителя ни при каком контенте.
                stopPropagation на Escape (предыдущий hotfix) обязателен: ProjectModal вешает СВОЙ
                глобальный window keydown-слушатель Escape (закрывает весь mobile Workspace, см.
                выше по файлу) — без остановки всплытия Escape тут закрыл бы редактор строки И ТУТ
                ЖЕ весь экран проекта одним нажатием. */}
            <input
              autoFocus type="number" step="0.01" value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onBlur={() => handlePriceSave(field, items, index)}
              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave(field, items, index); if (e.key === 'Escape') { e.stopPropagation(); finishEditing(); } }}
              style={{ width: '64px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '16px', background: bgInput, color: text }}
            />
            <input
              type="text"
              value={qtyDraft[stateKey] !== undefined ? qtyDraft[stateKey] : (item.quantity ?? 1)}
              onFocus={() => handleQtyFocus(stateKey, item.quantity ?? 1)}
              onChange={e => handleQtyChange(stateKey, e.target.value)}
              onBlur={() => handleQtyCommit(field, items, index, stateKey)}
              onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit(field, items, index, stateKey); e.target.blur(); } if (e.key === 'Escape') { e.stopPropagation(); finishEditing(); } }}
              style={{ width: '46px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '16px', background: bgInput, color: text }}
            />
            <strong style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '12.5px', color: accent.text }}>{total} zł</strong>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteKey(deleteKey); }}
              style={{ flexShrink: 0, background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
            >
              ✖
            </button>
          </div>
          {/* Явная кнопка закрытия редактора — отдельной компактной строкой, не рядом с
              (потенциально длинным) названием, чтобы не перекрывать его. Delete (✖) выше — своя,
              отдельная кнопка, не переопределяется. Внешняя кнопка — только touch target (40px,
              прозрачный фон, padding:0); видимая зелёная "таблетка" — внутренний <span> высотой
              24px (hotfix — визуально вдвое компактнее при сохранении безопасной area касания). */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={finishEditing}
              aria-label="Zakończ edycję"
              style={{ minHeight: '40px', boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24px', padding: '0 12px', borderRadius: '5px', background: '#38a169', color: '#fff', fontSize: '12.5px', fontWeight: 'bold' }}>
                Gotowe
              </span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={itemKey}
        role="button"
        tabIndex={0}
        onClick={openRow}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(); } }}
        style={{ height: '24px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 6px', borderRadius: '5px', cursor: 'pointer', borderLeft: `3px solid ${rowStripe(item)}`, background: accent.bg, fontSize: '11px', fontWeight: 400, color: text }}
      >
        {/* Единая типографика колонок (п.4 ревью): размер/насыщенность заданы один раз на строке
            (fontSize/fontWeight выше), дочерние — font:inherit; различается только color. */}
        <span style={{ flex: 1, minWidth: 0, font: 'inherit', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        <span style={{ flexShrink: 0, width: '54px', font: 'inherit', color: textLight, textAlign: 'right' }}>{Number(item.price).toFixed(2)} zł</span>
        <span style={{ flexShrink: 0, width: '26px', font: 'inherit', color: textLight, textAlign: 'right' }}>{item.quantity ?? 1}</span>
        <span style={{ flexShrink: 0, width: '60px', font: 'inherit', color: accent.text, textAlign: 'right' }}>{total} zł</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmDeleteKey(deleteKey); }}
          style={{ flexShrink: 0, background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '13px', padding: 0, lineHeight: 1 }}
        >
          ✖
        </button>
      </div>
    );
  };

  // Заголовок секции Materiały/Usługi — toggle слева + "Dodane pozycje", сумма справа,
  // aria-expanded (p.5). Rozliczenia (p.7) свой, более простой заголовок без toggle — не переиспользует.
  const renderMobileSectionHeader = (open, onToggle, total) => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: bgHeader, border: `1px solid ${border}`, borderRadius: '8px', padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', color: text }}>
        {/* Зелёный checkbox/✓ — визуальный индикатор раскрытия секции (по Figma), а не отдельный
            интерактивный элемент: клик обрабатывает вся кнопка-заголовок, aria-expanded на ней же. */}
        <span aria-hidden="true" style={{
          width: '16px', height: '16px', flexShrink: 0, boxSizing: 'border-box',
          borderRadius: '4px', border: `1.5px solid ${open ? '#38a169' : border}`,
          background: open ? '#38a169' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '11px', fontWeight: 'bold', lineHeight: 1,
        }}>
          {open ? '✓' : ''}
        </span>
        Dodane pozycje
      </span>
      <strong style={{ fontSize: '13px', color: text }}>{total.toFixed(2)} zł</strong>
    </button>
  );

  return (
    <div style={outerStyle} onClick={isEmbedded ? undefined : handleClose}>
      <div style={innerStyle} onClick={isEmbedded ? undefined : (e => e.stopPropagation())}>

        {/* "← Wróć" usunięty z desktop/embedded (compact-project-workspace) — powrót do listy
            projektów na desktop odbywa się przez sam sidebar (ProjectNav), nie przez osobny
            przycisk w karcie; "← Projekty" na mobile (niżej) zostaje bez zmian. */}

        {/* Nagłówek mobile (ADR-003, Mobile Field Mode faza 2): sztywny element kolumny flex
            (innerStyle), nie sticky i bez ujemnych marginesów — leży nad przewijanym
            contentAreaStyle, więc zawsze widoczny i nigdy nie zasłania ostatniego wiersza treści. */}
        {isMobileVariant && (
          <div style={{
            flexShrink: 0, background: bg, boxSizing: 'border-box',
            padding: '10px 15px 8px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
            borderBottom: `2px solid ${border}`,
          }}>
            <button
              onClick={handleClose}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: textLight, fontSize: '13px', fontWeight: 'bold', padding: '4px 2px',
              }}
            >
              ← Projekty
            </button>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.client_name || 'Klient'}
                  </span>
                  <button
                    onClick={() => setClientInfoOpen(true)}
                    title="Informacje o kliencie"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0, flexShrink: 0 }}
                  >
                    ℹ️
                  </button>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client.project_name || 'Projekt'}
                </div>
              </div>
              <span style={{
                flexShrink: 0, fontSize: '10.5px', fontWeight: 'bold', color: '#fff',
                background: STATUS_BORDER_COLOR[client.status] || STATUS_BORDER_COLOR.new,
                padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', marginTop: '1px',
              }}>
                {STATUS_LABEL[client.status] || STATUS_LABEL.new}
              </span>
            </div>
          </div>
        )}

        {/* Jedyny przewijany obszar treści na mobile (polka plików + taby + treść taba) — dla innych
            wariantów contentAreaStyle jest undefined, więc to zwykły, niestylowany div bez wpływu
            na desktop/embedded (ADR-003, faza 2: usunięcie ujemnych marginesów). */}
        <div style={contentAreaStyle}>

        {/* Polka plików (Mobile Project Workspace v1): ten sam <FilesTab variant="shelf"> co
            w desktop/embedded header, tylko mobileWorkspaceLayout=true (rząd przycisków folderów +
            stała karuzela 132×132px zamiast select+Rozwiń/Zwiń — p.3 zadania). Leży wewnątrz
            jedynego przewijanego obszaru (contentAreaStyle), zaraz po nagłówku, przed tabami — jako
            zwykły element flow, bez position:fixed/sticky, więc przewija się razem z resztą treści.
            Jeden zamontowany FilesTab i jeden fetch — dokładnie jak na desktop/embedded. */}
        {isMobileVariant && (
          <div style={{ marginBottom: '14px' }}>
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
        {!isMobileVariant && (
        <div style={{ borderBottom: `2px solid ${border}`, paddingBottom: '10px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>

            {/* ЛЕВО: Klient + Projekt — одна горизонтальная строка, оба поля редактируемые */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 140px', minWidth: 0 }}>
                <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0 }}>Klient:</span>
                <input
                  value={client.client_name || ''}
                  onChange={e => setClient(prev => ({ ...prev, client_name: e.target.value }))}
                  placeholder="Imię klienta"
                  style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: 'bold', color: '#4da6ff', background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', minWidth: '60px', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => setClientInfoOpen(true)}
                  title="Informacje o kliencie"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: 0, flexShrink: 0 }}
                >
                  ℹ️
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 160px', minWidth: 0 }}>
                <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0 }}>Projekt:</span>
                <input
                  value={client.project_name || ''}
                  onChange={e => setClient(prev => ({ ...prev, project_name: e.target.value }))}
                  placeholder="Nazwa projektu (szafa, kuchnia...)"
                  style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 'bold', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', minWidth: '60px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* ПРАВО: Firma/Moje + Zapisz — переносится под Klient/Projekt на узкой ширине */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setClient(prev => ({ ...prev, project_scope: 'firma' }))}
                    title="Projekt firmowy"
                    style={{
                      padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                      background: (client.project_scope || 'firma') === 'firma' ? '#3182ce' : bg,
                      color: (client.project_scope || 'firma') === 'firma' ? '#fff' : textLight,
                    }}
                  >
                    🏢
                  </button>
                  <button
                    onClick={() => setClient(prev => ({ ...prev, project_scope: 'personal' }))}
                    title="Mój projekt"
                    style={{
                      padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                      background: client.project_scope === 'personal' ? '#3182ce' : bg,
                      color: client.project_scope === 'personal' ? '#fff' : textLight,
                    }}
                  >
                    👤
                  </button>
                </div>
                <button onClick={handleSaveClick} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#3182ce', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>💾 Zapisz</button>
              </div>
              {isEmbedded && saveStatus && (
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: saveStatus === 'saved' ? '#38a169' : '#e53e3e', maxWidth: '220px', textAlign: 'right' }}>
                  {saveStatus === 'saved' ? '✓ Zapisano' : 'Nie udało się zapisać zmian. Spróbuj ponownie.'}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Polka plików — zawsze osobnym rzędem BEZPOŚREDNIO pod kompaktową szapką (nie na
            poziomie Klient/Projekt) — tylko desktop/embedded. Jeden i ten sam zamontowany
            FilesTab i w stanie zwiniętym, i rozwiniętym (variant="shelf", jeden files-state,
            jeden fetch) — rozwinięcie nie wywołuje ponownego fetch. Bez sztuczek order/flexBasis:
            skoro polka nie dzieli już wiersza z Klient/Projekt/Zapisz, to zwykły blokowy element
            na pełną szerokość. */}
        {isEmbedded && (
          <div style={{ marginBottom: '10px' }}>
            <FilesTab
              variant="shelf"
              clientId={client.id}
              currentProfile={currentProfile}
              coverUrl={client.cover_url}
              onCoverChange={(url) => { setClient(prev => ({ ...prev, cover_url: url })); onCoverChange?.(client.id, url); }}
              expanded={filesShelfExpanded}
              onExpandedChange={setFilesShelfExpanded}
            />
          </div>
        )}

        {/* Модалка редактируемой информации о клиенте */}
        {clientInfoOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setClientInfoOpen(false)}>
            <div style={{ background: bg, color: text, width: '100%', maxWidth: '380px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${border}`, fontSize: '13px', fontWeight: 'bold' }}>
                <span>👤 Informacje o kliencie</span>
                <button onClick={() => setClientInfoOpen(false)} style={{ background: 'none', border: 'none', color: text, fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📍 Adres:</span>
                  <input
                    value={client.address || ''}
                    onChange={e => setClient(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Adres montażu"
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                  {client.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                      target="_blank" rel="noreferrer"
                      title="Otwórz w Mapach Google"
                      style={{ flexShrink: 0, fontSize: '14px' }}
                    >
                      🗺️
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📞 Tel:</span>
                  <input
                    value={client.phone || ''}
                    onChange={e => setClient(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Telefon (opcjonalnie)"
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                  {client.phone && (
                    <a href={`tel:${client.phone}`} title="Zadzwoń" style={{ flexShrink: 0, fontSize: '14px' }}>📲</a>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📅 Termin:</span>
                  <input
                    type="date"
                    value={client.deadline || ''}
                    onChange={e => setClient(prev => ({ ...prev, deadline: e.target.value }))}
                    style={{ flex: 1, fontSize: '13px', color: text, background: bgInput, border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>💬 Uwagi:</span>
                  <input
                    value={client.notes || ''}
                    onChange={e => setClient(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Dodatkowe informacje..."
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Табы — тёмная тема. На mobile (Mobile Project Workspace v1, p.4) — три РАВНЫЕ по ширине
            вкладки без emoji и без сумм в названиях (flex:1 через tabBtnMobile, поверх общего
            tabBtn); третья вкладка сохраняет внутренний id 'expenses' (данные/схема не трогаются),
            меняется только подпись — "Rozliczenia" вместо "Wydatki". desktop/embedded сохраняют
            emoji и суммы в названиях без изменений. */}
        <div style={{ display: 'flex', borderBottom: `2px solid ${border}`, marginBottom: '15px', overflowX: isMobileVariant ? 'hidden' : 'auto', whiteSpace: 'nowrap', gap: '2px' }}>
          <button onClick={() => handleTabChange('materials')} style={{ ...tabBtn('materials', c('#2b6cb0','#63b3ed'), '#3182ce', { light: '#ebf8ff', dark: '#0f2236' }), ...(isMobileVariant ? { flex: 1, textAlign: 'center' } : {}) }}>
            {(isMobileVariant || isEmbedded) ? 'Materiały' : `📦 Materiały (${totalMaterials.toFixed(2)} zł)`}
          </button>
          <button onClick={() => handleTabChange('services')} style={{ ...tabBtn('services', c('#276749','#68d391'), '#38a169', { light: '#f0fff4', dark: '#0f2a1a' }), ...(isMobileVariant ? { flex: 1, textAlign: 'center' } : {}) }}>
            {(isMobileVariant || isEmbedded) ? 'Usługi' : `🛠 Usługi (${totalServices.toFixed(2)} zł)`}
          </button>
          <button onClick={() => handleTabChange('expenses')} style={{ ...tabBtn('expenses', c('#c53030','#fc8181'), '#e53e3e', { light: '#fff5f5', dark: '#2d1515' }), ...(isMobileVariant ? { flex: 1, textAlign: 'center' } : {}) }}>
            {(isMobileVariant || isEmbedded) ? 'Rozliczenia' : `💸 Wydatki (${totalExpenses.toFixed(2)} zł)`}
          </button>
          {/* Pliki — не отдельная вкладка ни на desktop/embedded (полка в шапке), ни на mobile
              (полка в контенте, feat/mobile-files-zoom) — только у настоящего modal-fallback
              (variant='modal', вне embedded/mobile), где полки нет вовсе. */}
          {!isEmbedded && !isMobileVariant && (
            <button onClick={() => setActiveTab('files')} style={tabBtn('files', c('#553c9a','#b794f4'), '#805ad5', { light: '#faf5ff', dark: '#1a102e' })}>
              📎 Pliki
            </button>
          )}
        </div>

        <div style={{ minHeight: '350px' }}>

          {/* МАТЕРИАЛЫ */}
          {activeTab === 'materials' && (
            isMobileVariant ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderMobileSectionHeader(mobileMaterialsOpen, handleToggleMobileMaterials, totalMaterials)}
                {mobileMaterialsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* 1. Szukaj materiału w bazie… */}
                    <input
                      type="text"
                      placeholder="Szukaj materiału w bazie…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setSearchTerm(''); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: `1px solid ${border}`, borderRadius: '6px', fontSize: '12.5px', background: bgInput, color: text }}
                    />
                    {/* 2. Результаты — только при непустом запросе */}
                    {searchTerm.trim() && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', border: `1px solid ${border}`, borderRadius: '6px', padding: '4px', background: bgInput }}>
                        {filteredMaterials.slice(0, 12).map(m => {
                          const isSelected = calcMaterials.some(item => item.id === m.id);
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px' }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                              <span style={{ flexShrink: 0, fontSize: '12px', color: c('#2b6cb0','#63b3ed'), fontWeight: 'bold' }}>{Number(m.price).toFixed(2)} zł</span>
                              <button
                                type="button"
                                onClick={() => { handleAddItem('calc_materials', calcMaterials, m); setSearchTerm(''); }}
                                style={{ flexShrink: 0, background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                              >
                                {isSelected ? '+ Kol.' : '+ Dodaj'}
                              </button>
                            </div>
                          );
                        })}
                        {filteredMaterials.length === 0 && (
                          <div style={{ padding: '8px', textAlign: 'center', color: textLight, fontSize: '12px' }}>Brak wyników</div>
                        )}
                      </div>
                    )}
                    {/* 3. Добавленные материалы */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {calcMaterials.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '12px', color: textLight, fontSize: '12.5px' }}>Brak dodanych materiałów</div>
                      )}
                      {calcMaterials.map((item, index) => renderMobileRow('calc_materials', calcMaterials, index))}
                    </div>
                    {/* 4. Ручное добавление */}
                    <div style={{ textAlign: 'right' }}>
                      <button type="button" onClick={() => handleCustomAdd('calc_materials', calcMaterials)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ Dodaj pozycję ręcznie</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: text }}>✅ Dodane pozycje</h3>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {calcMaterials.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych materiałów</div>}
                    {calcMaterials.map((item, index) => {
                      // itemKey — stabilny identyfikator pozycji (item.id, nie index) używany jako
                      // klucz React ORAZ jako klucz expandedItemKey/matKey — usuwanie pierwszej
                      // pozycji nie powinno "przenosić" rozwinięcia/DOM-u na sąsiedni wiersz, co przy
                      // key={index} mogłoby się zdarzyć (React dopasowałby stary DOM po pozycji, nie
                      // po tożsamości pozycji).
                      const itemKey = item.id ?? index;
                      // Ten sam klucz co w desktopowej tabeli Materiały (mat-${itemKey}) —
                      // rozwinięcie jest współdzielone przez expandedItemKey, żaden nowy stan nie
                      // powstaje (feat/mobile-material-row-compact).
                      const matKey = `mat-${itemKey}`;
                      const isExpanded = expandedItemKey === matKey;
                      const isConfirmingDelete = confirmDeleteKey === `calc_materials-${index}`;
                      // Podczas potwierdzania usunięcia zawsze pokazujemy pełną nazwę u góry —
                      // użytkownik musi widzieć CO usuwa, nawet jeśli karta była zwinięta.
                      const showFullName = isExpanded || isConfirmingDelete;
                      // Krótka nazwa, która mieści się w całości (brak realnego przycięcia), nie
                      // powinna bezsensownie rozwijać karty — mierzymy scrollWidth/clientWidth
                      // dopiero w momencie kliknięcia/klawisza (event.currentTarget), nie podczas
                      // renderu ani przez osobny ref-rejestr (react-hooks/refs nie ma tu zastosowania,
                      // bo w ogóle nie czytamy/piszemy refs — DOM mierzony jest bezpośrednio z eventu).
                      const handleNameToggle = (e) => {
                        // Przycisk ma disabled={isConfirmingDelete}, więc to raczej zabezpieczenie
                        // niż realna ścieżka — ale jawnie: dopóki trwa potwierdzanie usunięcia,
                        // kliknięcie nazwy nie może ukryć kontekstu usuwania.
                        if (isConfirmingDelete) return;
                        if (isExpanded) { toggleExpandedItem(matKey); return; }
                        const el = e.currentTarget;
                        if (el.scrollWidth > el.clientWidth) toggleExpandedItem(matKey);
                      };
                      const priceNode = editingPrice === `mat-${index}` ? (
                        <input autoFocus type="number" step="0.01" value={priceDraft}
                          onChange={e => setPriceDraft(e.target.value)}
                          onBlur={() => handlePriceSave('calc_materials', calcMaterials, index)}
                          onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_materials', calcMaterials, index); if (e.key === 'Escape') setEditingPrice(null); }}
                          style={{ width: '70px', flexShrink: 0, boxSizing: 'border-box', padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                        />
                      ) : (
                        <span onClick={() => { setEditingPrice(`mat-${index}`); setPriceDraft(String(item.price)); }}
                          style={{ flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer', background: bgInput, border: '1px dashed #a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', color: textLight }}>
                          {Number(item.price).toFixed(2)} zł
                        </span>
                      );
                      const qtyNode = (
                        <input type="text"
                          value={qtyDraft[`mat-${index}`] !== undefined ? qtyDraft[`mat-${index}`] : item.quantity}
                          onFocus={() => handleQtyFocus(`mat-${index}`, item.quantity)}
                          onChange={e => handleQtyChange(`mat-${index}`, e.target.value)}
                          onBlur={() => handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`)}
                          onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`); e.target.blur(); } }}
                          style={{ width: '40px', boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                        />
                      );
                      const sumNode = (
                        <strong style={{ flexShrink: 0, whiteSpace: 'nowrap', color: c('#2b6cb0','#63b3ed'), fontSize: '13px' }}>
                          {(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł
                        </strong>
                      );
                      return (
                        <div key={itemKey} style={{ background: bgMatRow, borderRadius: '7px', border: `1px solid ${borderMat}`, borderLeft: `4px solid ${rowStripe(item)}`, padding: '8px 10px' }}>
                          {showFullName && (
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              disabled={isConfirmingDelete}
                              onClick={handleNameToggle}
                              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'bold', color: c('#2b6cb0','#63b3ed'), fontSize: '13px', marginBottom: '6px', cursor: isConfirmingDelete ? 'default' : 'pointer', whiteSpace: 'normal', wordBreak: 'break-word' }}
                            >
                              {item.name}
                            </button>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isConfirmingDelete ? (
                              // Potwierdzenie usunięcia zajmuje całą dostępną szerokość wiersza
                              // metryk (cena/ilość/suma są w tym momencie ukryte), żeby "Usunąć?
                              // Tak/Nie" nigdy nie nachodziło na dane (feat/mobile-material-row-compact).
                              <div style={{ flex: 1, display: 'flex' }}>
                                {renderDeleteBtn('calc_materials', calcMaterials, index, 'span')}
                              </div>
                            ) : (
                              <>
                                {!showFullName && (
                                  <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    onClick={handleNameToggle}
                                    style={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', fontWeight: 'bold', color: c('#2b6cb0','#63b3ed'), fontSize: '13px' }}
                                  >
                                    {item.name}
                                  </button>
                                )}
                                {priceNode}
                                {qtyNode}
                                {sumNode}
                                {renderDeleteBtn('calc_materials', calcMaterials, index, 'span')}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ background: bgHeader, textAlign: 'left', color: textLight }}>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Nazwa materiału</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Cena j.</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Jm</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, width: '60px' }}>Ilość</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Suma</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcMaterials.map((item, index) => {
                          const itemKey = item.id ?? index;
                          return (
                          <tr key={index} style={{ borderBottom: `1px solid ${border}`, backgroundColor: bgMatRow, borderLeft: `3px solid ${rowStripe(item)}` }}>
                            <td onClick={() => toggleExpandedItem(`mat-${itemKey}`)} style={{ padding: '4px 8px', fontWeight: 'bold', cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedItemKey === `mat-${itemKey}` ? 'normal' : 'nowrap', color: c('#2b6cb0','#63b3ed') }}>{item.name}</td>
                            <td style={{ padding: '4px 8px' }}>
                              {editingPrice === `mat-${index}` ? (
                                <input autoFocus type="number" step="0.01" value={priceDraft}
                                  onChange={e => setPriceDraft(e.target.value)}
                                  onBlur={() => handlePriceSave('calc_materials', calcMaterials, index)}
                                  onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_materials', calcMaterials, index); if (e.key === 'Escape') setEditingPrice(null); }}
                                  style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                                />
                              ) : (
                                <span onClick={() => { setEditingPrice(`mat-${index}`); setPriceDraft(String(item.price)); }}
                                  style={{ cursor: 'pointer', color: c('#2b6cb0','#63b3ed'), borderBottom: '1px dashed #a0aec0' }} title="Kliknij aby zmienić cenę">
                                  {Number(item.price).toFixed(2)} zł
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 8px', color: textLight }}>{item.unit || 'szt'}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <input type="text"
                                value={qtyDraft[`mat-${index}`] !== undefined ? qtyDraft[`mat-${index}`] : item.quantity}
                                onFocus={() => handleQtyFocus(`mat-${index}`, item.quantity)}
                                onChange={e => handleQtyChange(`mat-${index}`, e.target.value)}
                                onBlur={() => handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`)}
                                onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`); e.target.blur(); } }}
                                title="Wpisz liczbę lub wyrażenie: 37+20+16"
                                style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', fontWeight: 'bold', color: c('#2b6cb0','#63b3ed') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                            {renderDeleteBtn('calc_materials', calcMaterials, index)}
                          </tr>
                          );
                        })}
                        {calcMaterials.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych materiałów</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button onClick={() => handleCustomAdd('calc_materials', calcMaterials)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Dodaj pozycję ręcznie</button>
                </div>
              </div>

              {/* Baza materiałów — компактный поиск (compact-project-workspace): без заголовка,
                  без фильтров категории/поставщика, без постоянно отображаемого каталога и без
                  "Brak wyników" на пустой запрос — список появляется только во время ввода. */}
              <div>
                <input
                  type="text"
                  placeholder="🔍 Szukaj materiału…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setSearchTerm(''); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                />
                {searchTerm.trim() && (
                  <div style={{ marginTop: '6px', maxHeight: '220px', overflowY: 'auto', border: `1px solid ${border}`, background: bgInput, borderRadius: '4px' }}>
                    {filteredMaterials.slice(0, 12).map(m => {
                      const isSelected = calcMaterials.some(item => item.id === m.id);
                      const isExpanded = expandedMaterialId === m.id;
                      return (
                        <div key={m.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: isSelected ? bgMatRow : bgInput }}>
                          <div
                            onClick={() => setExpandedMaterialId(prev => prev === m.id ? null : m.id)}
                            style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                          >
                            <div style={{
                              flex: 1, minWidth: 0, fontWeight: 'bold', color: text,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: isExpanded ? 'normal' : 'nowrap',
                            }}>
                              {m.name}
                            </div>
                            <div style={{ width: '64px', flexShrink: 0, textAlign: 'left' }}>
                              <strong style={{ color: c('#2b6cb0','#63b3ed') }}>{Number(m.price).toFixed(2)} zł</strong>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddItem('calc_materials', calcMaterials, m); setSearchTerm(''); }}
                              style={{ background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '62px', flexShrink: 0 }}
                            >
                              {isSelected ? '+ Kol.' : '+ Dodaj'}
                            </button>
                          </div>
                          {isExpanded && (
                            <div style={{ padding: '0 8px 6px 8px', fontSize: '11px', color: textLight }}>
                              {m.supplier && <>Dostawca: {m.supplier} · </>}
                              Kategoria: {m.category || '-'}
                              {m.symbol && <> · Symbol: {m.symbol}</>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* УСЛУГИ */}
          {activeTab === 'services' && (
            isMobileVariant ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderMobileSectionHeader(mobileServicesOpen, handleToggleMobileServices, totalServices)}
                {mobileServicesOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Szukaj usługi w bazie… */}
                    <input
                      type="text"
                      placeholder="Szukaj usługi w bazie…"
                      value={searchService}
                      onChange={e => setSearchService(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setSearchService(''); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: `1px solid ${border}`, borderRadius: '6px', fontSize: '12.5px', background: bgInput, color: text }}
                    />
                    {searchService.trim() && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', border: `1px solid ${border}`, borderRadius: '6px', padding: '4px', background: bgInput }}>
                        {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.trim().toLowerCase())).map(s => {
                          const isSelected = calcServices.some(item => item.id === s.id);
                          return (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px' }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                              <span style={{ flexShrink: 0, fontSize: '12px', color: c('#276749','#68d391'), fontWeight: 'bold' }}>{Number(s.price).toFixed(2)} zł</span>
                              <button
                                type="button"
                                onClick={() => { handleAddItem('calc_services', calcServices, s); setSearchService(''); }}
                                style={{ flexShrink: 0, background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                              >
                                {isSelected ? '+ Kol.' : '+ Dodaj'}
                              </button>
                            </div>
                          );
                        })}
                        {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.trim().toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px', textAlign: 'center', color: textLight, fontSize: '12px' }}>Brak wyników</div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {calcServices.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '12px', color: textLight, fontSize: '12.5px' }}>Brak dodanych usług</div>
                      )}
                      {calcServices.map((item, index) => renderMobileRow('calc_services', calcServices, index))}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <button type="button" onClick={() => handleCustomAdd('calc_services', calcServices)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ Dodaj usługę ręcznie</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {calcServices.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych usług</div>}
                    {calcServices.map((item, index) => (
                      <div key={index} style={{ background: bgSrvRow, borderRadius: '7px', border: `1px solid ${borderSrv}`, borderLeft: `4px solid ${rowStripe(item)}`, padding: '8px 10px' }}>
                        <div style={{ fontWeight: 'bold', color: c('#276749','#68d391'), fontSize: '13px', marginBottom: '5px' }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {editingPrice === `srv-${index}` ? (
                            <input autoFocus type="number" step="0.01" value={priceDraft}
                              onChange={e => setPriceDraft(e.target.value)}
                              onBlur={() => handlePriceSave('calc_services', calcServices, index)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_services', calcServices, index); if (e.key === 'Escape') setEditingPrice(null); }}
                              style={{ width: '70px', padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                            />
                          ) : (
                            <span onClick={() => { setEditingPrice(`srv-${index}`); setPriceDraft(String(item.price)); }}
                              style={{ cursor: 'pointer', background: bgInput, border: '1px dashed #a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', color: textLight }}>
                              {Number(item.price).toFixed(2)} zł
                            </span>
                          )}
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>×</span>
                          <input type="text"
                            value={qtyDraft[`srv-${index}`] !== undefined ? qtyDraft[`srv-${index}`] : (item.quantity || 1)}
                            onFocus={() => handleQtyFocus(`srv-${index}`, item.quantity || 1)}
                            onChange={e => handleQtyChange(`srv-${index}`, e.target.value)}
                            onBlur={() => handleQtyCommit('calc_services', calcServices, index, `srv-${index}`)}
                            onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_services', calcServices, index, `srv-${index}`); e.target.blur(); } }}
                            style={{ width: '40px', boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                          />
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>=</span>
                          <strong style={{ color: c('#276749','#68d391'), fontSize: '13px', flex: 1 }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</strong>
                          {renderDeleteBtn('calc_services', calcServices, index, 'span')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ background: bgSrvRow, textAlign: 'left', color: c('#276749','#68d391') }}>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Nazwa usługi</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Cena jend. (zł)</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}`, width: '80px' }}>Ilość</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Suma</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcServices.map((item, index) => {
                          const itemKey = item.id ?? index;
                          return (
                          <tr key={index} style={{ borderBottom: `1px solid ${border}`, background: bg, borderLeft: `3px solid ${rowStripe(item)}` }}>
                            <td onClick={() => toggleExpandedItem(`srv-${itemKey}`)} style={{ padding: '6px 8px', color: text, cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedItemKey === `srv-${itemKey}` ? 'normal' : 'nowrap' }}>{item.name}</td>
                            <td style={{ padding: '6px 8px' }}>
                              {editingPrice === `srv-${index}` ? (
                                <input autoFocus type="number" step="0.01" value={priceDraft}
                                  onChange={e => setPriceDraft(e.target.value)}
                                  onBlur={() => handlePriceSave('calc_services', calcServices, index)}
                                  onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_services', calcServices, index); if (e.key === 'Escape') setEditingPrice(null); }}
                                  style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                                />
                              ) : (
                                <span onClick={() => { setEditingPrice(`srv-${index}`); setPriceDraft(String(item.price)); }}
                                  style={{ cursor: 'pointer', borderBottom: '1px dashed #a0aec0', color: text }} title="Kliknij aby zmienić cenę">
                                  {Number(item.price).toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="text"
                                value={qtyDraft[`srv-${index}`] !== undefined ? qtyDraft[`srv-${index}`] : (item.quantity || 1)}
                                onFocus={() => handleQtyFocus(`srv-${index}`, item.quantity || 1)}
                                onChange={e => handleQtyChange(`srv-${index}`, e.target.value)}
                                onBlur={() => handleQtyCommit('calc_services', calcServices, index, `srv-${index}`)}
                                onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_services', calcServices, index, `srv-${index}`); e.target.blur(); } }}
                                title="Wpisz liczbę lub wyrażenie: 37+20+16"
                                style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 'bold', color: c('#276749','#68d391') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                            {renderDeleteBtn('calc_services', calcServices, index)}
                          </tr>
                          );
                        })}
                        {calcServices.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych usług</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button onClick={() => handleCustomAdd('calc_services', calcServices)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Dodaj usługę ręcznie</button>
                </div>
              </div>

              {/* Baza usług */}
              <div style={{ background: bgSrvRow, padding: '10px', borderRadius: '6px', border: `1px solid ${borderSrv}` }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: c('#276749','#68d391') }}>🔍 Baza usług</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" placeholder="Szukaj usługi..." value={searchService} onChange={e => setSearchService(e.target.value)}
                    style={{ padding: '6px 8px', border: `1px solid ${borderSrv}`, borderRadius: '4px', fontSize: '12px', flex: 1, background: bgInput, color: text }} />
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', borderTop: `1px solid ${borderSrv}`, background: bgInput, borderRadius: '4px' }}>
                  {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.toLowerCase())).map(s => {
                    const isSelected = calcServices.some(item => item.id === s.id);
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: '10px', padding: '6px 10px', borderBottom: `1px solid ${border}`, fontSize: '12px', alignItems: 'center', backgroundColor: isSelected ? bgSrvRow : bgInput }}>
                        <div onClick={() => toggleRow(`avail_srv_${s.id}`)} style={{ flex: 1, minWidth: 0, fontWeight: 'bold', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedRows[`avail_srv_${s.id}`] ? 'normal' : 'nowrap', color: text }}>{s.name}</div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', width: '140px', flexShrink: 0 }}>
                          <strong style={{ color: c('#276749','#68d391') }}>{Number(s.price).toFixed(2)} zł</strong>
                          <button onClick={() => handleAddItem('calc_services', calcServices, s)} style={{ background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '65px' }}>
                            {isSelected ? '+ Kol.' : '+ Dodaj'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.toLowerCase())).length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>Brak wyników</div>
                  )}
                </div>
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
              единственной карточки собственный, локальный editingKey. Embedded включает отдельный
              desktopLayout по Figma; обычный modal-fallback ниже сохраняет calc_expenses. */}
          {activeTab === 'expenses' && (
            (isMobileVariant || isEmbedded) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isEmbedded ? '8px' : 0 }}>
                {isEmbedded && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '24px' }}>
                    <h3 style={{ margin: 0, color: text, fontSize: '16px', lineHeight: '24px', fontWeight: 700 }}>
                      Faktyczne przepływy pieniężne
                    </h3>
                    {cashStatus === 'ready' && (
                      <strong style={{ color: 'var(--accent)', fontSize: '14px', lineHeight: '20px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Saldo {formatDesktopCashMoney(projectCashSaldo)} zł
                      </strong>
                    )}
                  </div>
                )}
                <ProjectCashLedger
                  ref={cashLedgerRef}
                  client={client}
                  transactions={cashTransactions}
                  onSaveTransaction={onSaveCashTransaction}
                  onDeleteTransaction={onDeleteCashTransaction}
                  showProjectHeader={isEmbedded}
                  desktopLayout={isEmbedded}
                  onDirtyChange={setCashDirty}
                  status={cashStatus}
                  onRetry={onRetryCash}
                />
              </div>
            ) : (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <button onClick={() => handleCustomAdd('calc_expenses', calcExpenses)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>+ Dodaj wydatek (Paliwo, Zakupy itp.)</button>
              </div>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {calcExpenses.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodatkowych wydatków</div>}
                  {calcExpenses.map((item, index) => (
                    <div key={index} style={{ background: bgExpRow, borderRadius: '7px', border: `1px solid ${borderExp}`, borderLeft: `4px solid ${rowStripe(item)}`, padding: '8px 10px' }}>
                      <div style={{ fontWeight: 'bold', color: c('#c53030','#fc8181'), fontSize: '13px', marginBottom: '5px' }}>{item.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {editingPrice === `exp-${index}` ? (
                          <input autoFocus type="number" step="0.01" value={priceDraft}
                            onChange={e => setPriceDraft(e.target.value)}
                            onBlur={() => handlePriceSave('calc_expenses', calcExpenses, index)}
                            onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_expenses', calcExpenses, index); if (e.key === 'Escape') setEditingPrice(null); }}
                            style={{ width: '70px', padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                          />
                        ) : (
                          <span onClick={() => { setEditingPrice(`exp-${index}`); setPriceDraft(String(item.price)); }}
                            style={{ cursor: 'pointer', background: bgInput, border: '1px dashed #a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', color: textLight }}>
                            {Number(item.price).toFixed(2)} zł
                          </span>
                        )}
                        <span style={{ color: '#a0aec0', fontSize: '12px' }}>×</span>
                        <input type="text"
                          value={qtyDraft[`exp-${index}`] !== undefined ? qtyDraft[`exp-${index}`] : (item.quantity || 1)}
                          onFocus={() => handleQtyFocus(`exp-${index}`, item.quantity || 1)}
                          onChange={e => handleQtyChange(`exp-${index}`, e.target.value)}
                          onBlur={() => handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`)}
                          onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`); e.target.blur(); } }}
                          style={{ width: '40px', boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                        />
                        <span style={{ color: '#a0aec0', fontSize: '12px' }}>=</span>
                        <strong style={{ color: c('#c53030','#fc8181'), fontSize: '13px', flex: 1 }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</strong>
                        {renderDeleteBtn('calc_expenses', calcExpenses, index, 'span')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: bgExpRow, textAlign: 'left', color: c('#c53030','#fc8181') }}>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Opis wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Kwota bazowa (zł)</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}`, width: '80px' }}>Mnożnik / Ilość</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Suma Wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcExpenses.map((item, index) => {
                      const itemKey = item.id ?? index;
                      return (
                      <tr key={index} style={{ borderBottom: `1px solid ${border}`, background: bg, borderLeft: `3px solid ${rowStripe(item)}` }}>
                        <td onClick={() => toggleExpandedItem(`exp-${itemKey}`)} style={{ padding: '6px 8px', color: text, cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedItemKey === `exp-${itemKey}` ? 'normal' : 'nowrap' }}>{item.name}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {editingPrice === `exp-${index}` ? (
                            <input autoFocus type="number" step="0.01" value={priceDraft}
                              onChange={e => setPriceDraft(e.target.value)}
                              onBlur={() => handlePriceSave('calc_expenses', calcExpenses, index)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_expenses', calcExpenses, index); if (e.key === 'Escape') setEditingPrice(null); }}
                              style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                            />
                          ) : (
                            <span onClick={() => { setEditingPrice(`exp-${index}`); setPriceDraft(String(item.price)); }}
                              style={{ cursor: 'pointer', borderBottom: '1px dashed #a0aec0', color: text }} title="Kliknij aby zmienić cenę">
                              {Number(item.price).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="text"
                            value={qtyDraft[`exp-${index}`] !== undefined ? qtyDraft[`exp-${index}`] : (item.quantity || 1)}
                            onFocus={() => handleQtyFocus(`exp-${index}`, item.quantity || 1)}
                            onChange={e => handleQtyChange(`exp-${index}`, e.target.value)}
                            onBlur={() => handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`)}
                            onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`); e.target.blur(); } }}
                            title="Wpisz liczbę lub wyrażenie: 37+20+16"
                            style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: c('#c53030','#fc8181') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                        {renderDeleteBtn('calc_expenses', calcExpenses, index)}
                      </tr>
                      );
                    })}
                    {calcExpenses.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodatkowych wydatków</td></tr>}
                  </tbody>
                </table>
              </div>
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

        </div>

        </div>
        {/* /contentAreaStyle — koniec jedynego przewijanego obszaru mobile */}

        {/* Zawsze widoczna zona działań na dole (ADR-003, Mobile Field Mode faza 2) — zwykły
            element kolumny flex (innerStyle), nie sticky, więc fizycznie nigdy nie nachodzi na
            ostatni wiersz przewijanej treści; env(safe-area-inset-bottom) dodaje margines na
            strefę bezpieczną telefonu (np. pasek gestów iOS) zamiast na sztywny padding. */}
        {isMobileVariant && (
          <div style={{
            flexShrink: 0, background: bgHeader, borderTop: `2px solid ${border}`,
            padding: '10px 15px calc(10px + env(safe-area-inset-bottom))',
          }}>
            <button
              onClick={handleSaveClick}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#3182ce', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
            >
              💾 Zapisz
            </button>
            {saveStatus && (
              <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: saveStatus === 'saved' ? '#38a169' : '#e53e3e' }}>
                {saveStatus === 'saved' ? '✓ Zapisano' : 'Nie udało się zapisać zmian. Spróbuj ponownie.'}
              </div>
            )}
          </div>
        )}

        {/* Подтверждение закрытия / переключения на другой проект / возврата к списку на mobile
            (тот же диалог, ADR-002 UX-faza 2.1 + ADR-003 faza 2 — не дублируется). */}
        {(confirmClose || pendingProjectLabel || pendingTabChange) && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', borderRadius: isMobileVariant ? 0 : '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: bg, borderRadius: '10px', padding: '28px 32px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', textAlign: 'center', maxWidth: '360px', border: `1px solid ${border}` }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px 0', color: text, fontSize: '16px' }}>Masz niezapisane zmiany</h3>
              <p style={{ margin: '0 0 8px 0', color: textLight, fontSize: '13px' }}>{closeMessage}</p>
              {saveStatus === 'error' && !pendingTabChange && (
                <p style={{ margin: '0 0 12px 0', color: '#e53e3e', fontSize: '12px', fontWeight: 'bold' }}>
                  Nie udało się zapisać zmian. Spróbuj ponownie.
                </p>
              )}
              {pendingTabChange && cashTabSaveError && (
                <p style={{ margin: '0 0 12px 0', color: '#e53e3e', fontSize: '12px', fontWeight: 'bold' }}>
                  Nie udało się zapisać operacji. Spróbuj ponownie.
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                <button
                  onClick={() => { if (pendingTabChange) { discardTabChange(); } else if (pendingProjectLabel) { onConfirmSwitch?.(); } else { finalizeClose(); } }}
                  style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {closeLabels.discard}
                </button>
                <button
                  onClick={async () => {
                    if (pendingTabChange) { await saveAndChangeTab(); return; }
                    const result = await saveAllDirty();
                    if (result?.error) { return; }
                    setConfirmClose(false);
                    pendingProjectLabel ? onConfirmSwitch?.() : finalizeClose();
                  }}
                  style={{ background: '#38a169', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {closeLabels.save}
                </button>
                <button
                  onClick={() => { if (pendingTabChange) { cancelTabChange(); } else if (pendingProjectLabel) { onCancelSwitch?.(); } else { setConfirmClose(false); } }}
                  style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '9px 14px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
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
