import { useMemo, useState } from 'react';
import { shortDate, groupByClient, projectTotals } from './dashboardHelpers';
import { getRecentProjectIds, markProjectOpened } from '../utils/recentProjects';
import s from './ProjectListPanel.module.css';

// Тот же канонический набор цветов статусов, что и в Settings.jsx («Legenda statusów projektów»).
const STATUS_COLOR = {
  new:        '#e53e3e',
  design:     '#dd6b20',
  production: '#d69e2e',
  done:       '#38a169',
};

// Устаревшие польские значения статуса, встречающиеся в части данных наравне с 'done' —
// трактуем их как «завершён», не трогая сами данные.
const COMPLETED_STATUSES = new Set(['done', 'Zrealizowane', 'Zakończone']);

function ProjectRow({ client, onRowClick, isActive, mobileLayout }) {
  const projectName = client.project_name || client.full_name || '—';
  const openTasks = (client.tasks || []).filter((t) => !t.isDone).length;

  if (mobileLayout) {
    // Mobile Project List v1: та же логика открытия/подсветки, что и в desktop-строке ниже, но
    // COMPLETED_STATUSES здесь трактуется явно (в отличие от desktop-фолбэка ниже, который для
    // устаревших "завершённых" значений вроде 'Zrealizowane' попадает в STATUS_COLOR.new/красный) —
    // требование "status dot зелёный" для завершённых проектов на mobile обязано выполняться для
    // ЛЮБОГО значения из COMPLETED_STATUSES, не только 'done'. Desktop-ветка ниже не тронута.
    const mobileColor = COMPLETED_STATUSES.has(client.status)
      ? STATUS_COLOR.done
      : (STATUS_COLOR[client.status] || STATUS_COLOR.new);
    return (
      <div
        className={`${s.mobileRow} ${isActive ? s.mobileRowActive : ''}`}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onRowClick(client)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(client); }
        }}
      >
        <span className={s.mobileRowName}>{projectName}</span>
        {openTasks > 0 && <span className={s.mobileRowTasks}>{openTasks}</span>}
        <span className={s.mobileStatusDot} style={{ background: mobileColor }} />
      </div>
    );
  }

  const color = STATUS_COLOR[client.status] || STATUS_COLOR.new;

  return (
    <div
      className={`${s.row} ${isActive ? s.rowActive : ''}`}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onRowClick(client)}
      onKeyDown={(e) => { if (e.key === 'Enter') onRowClick(client); }}
    >
      <span className={s.statusDot} style={{ background: color }} />
      <div className={s.rowText}>
        <div className={s.rowProject}>{projectName}</div>
      </div>
      <div className={s.rowMeta}>
        {client.deadline && <span className={s.rowDeadline}>{shortDate(client.deadline)}</span>}
        {openTasks > 0 && <span className={s.rowTasks}>{openTasks}</span>}
      </div>
    </div>
  );
}

// Группы «клиент → проекты» — временное представление поверх текущих данных clients
// (тот же group-by, что уже используется в Dashboard.jsx через dashboardHelpers.groupByClient).
// Никакой новой сущности «клиент» не создаётся.
function ClientGroups({ projects, onRowClick, activeProjectId, mobileLayout, onOpenBalance }) {
  return groupByClient(projects).map(([clientName, group]) => (
    <div key={clientName} className={mobileLayout ? s.mobileClientGroup : s.clientGroup}>
      {mobileLayout ? (
        <div className={s.mobileClientGroupHeader}>
          <span className={s.mobileClientGroupName}>{clientName}</span>
          {onOpenBalance && (
            <button
              type="button"
              className={s.mobileBalanceBtn}
              onClick={(e) => { e.stopPropagation(); onOpenBalance(clientName); }}
            >
              Bilans
            </button>
          )}
        </div>
      ) : (
        <div className={s.clientGroupHeaderRow}>
          <div className={s.clientGroupHeader}>{clientName}</div>
          {onOpenBalance && (
            <button
              type="button"
              className={s.desktopBalanceBtn}
              onClick={(e) => { e.stopPropagation(); onOpenBalance(clientName); }}
            >
              Bilans
            </button>
          )}
        </div>
      )}
      {group.map((c) => (
        <ProjectRow key={c.id} client={c} onRowClick={onRowClick} isActive={c.id === activeProjectId} mobileLayout={mobileLayout} />
      ))}
    </div>
  ));
}

// Компактная сворачиваемая финансовая панель активного проекта (compact-project-workspace UX) —
// показывается только в desktop sidebar (showFinancePanel), только для активного проекта, и
// только пока пользователь явно не свернул её повторным кликом по той же строке проекта.
// Коэффициент — единственный источник истины activeClient.budget_coefficient (setActiveClient —
// тот же setter, что получает variant='embedded' ProjectModal как proр setClient, см. App.jsx),
// без отдельного запроса к Supabase — сохранение идёт штатной кнопкой Zapisz внутри ProjectModal.
function FinancePanel({ client, setActiveClient }) {
  const [draft, setDraft] = useState(String(client.budget_coefficient ?? 2));
  const totalCost = projectTotals(client).total;
  const coefficient = parseFloat(client.budget_coefficient) || 2;
  const budget = totalCost * coefficient;

  const handleChange = (e) => {
    const raw = e.target.value;
    setDraft(raw);
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) {
      setActiveClient(prev => ({
        ...prev,
        budget_coefficient: val,
        budget: parseFloat((projectTotals(prev).total * val).toFixed(2)),
      }));
    }
  };

  return (
    <div className={s.financePanel}>
      <div className={s.financeRow}>
        <span>Koszty: <strong>{totalCost.toFixed(2)} zł</strong></span>
        <span className={s.financeTimes}>×</span>
        <input
          type="number" min="1" max="10" step="0.1"
          className={s.financeCoefInput}
          value={draft}
          onChange={handleChange}
          onClick={(e) => e.stopPropagation()}
          aria-label="Współczynnik budżetu"
        />
      </div>
      <div className={s.financeBudget}>Budżet: {budget.toFixed(2)} zł</div>
    </div>
  );
}

export default function ProjectListPanel({
  clients = [],
  scopeView,
  setScopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  // activeClient/setActiveClient — тот же live-объект и setter, что App.jsx передаёт в
  // ProjectModal (client/setClient) — нужны только для финансовой панели (showFinancePanel).
  activeClient,
  setActiveClient,
  // Финансовая панель — только desktop sidebar (ProjectNav); мобильный dropdown и мобильный
  // экран Projekty её не запрашивают, поведение клика по строке там не меняется.
  showFinancePanel = false,
  // Доп. отступ снизу у списка — нужен только для мобильного экрана Projekty (ADR-003),
  // где список перекрывался бы закреплённой нижней навигацией. На desktop/в мобильном
  // dropdown (существующие вызовы) не передаётся — поведение там не меняется.
  extraBottomPadding = false,
  // Mobile Project List v1 — явный вариант разметки только для полноэкранного мобильного
  // экрана Projekty (MobileProjectsScreen). Desktop (ProjectNav) и мобильный dropdown
  // (App.jsx) продолжают вызывать компонент без этого пропа — их разметка не затронута.
  mobileLayout = false,
  // Mobile / Client Balance / Expanded v1 — кнопка "Bilans" в заголовке группы клиента (только
  // mobileLayout). Не передаётся desktop (ProjectNav) и мобильным dropdown — там кнопки нет.
  onOpenBalance,
}) {
  const [searchText, setSearchText] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [recentIds, setRecentIds] = useState(() => getRecentProjectIds());
  // Раскрытость финансовой панели — id проекта, для которого её явно раскрыли повторным кликом
  // (не булев флаг). При смене активного проекта ЛЮБЫМ путём (клик по другой строке, открытие
  // через поиск/Dashboard/Kanban, закрытие карточки) панель обязана свернуться — в т.ч. если
  // новый активный проект СЛУЧАЙНО совпадает с id, для которого панель когда-то была раскрыта
  // (например: раскрыли Kuchnia → переключились на Garderoba → вернулись на Kuchnia одним
  // кликом — это открытие, а не toggle, панель не должна выпрыгнуть сама). Поэтому здесь нужно
  // явное отслеживание "предыдущего activeProjectId", а не просто сравнение с текущим.
  // useEffect для этого запрещён линтом (react-hooks/set-state-in-effect), чтение/запись ref во
  // время рендера — тоже (react-hooks/refs) → используется официально задокументированный React
  // паттерн "adjusting state when a prop changes": setState прямо в теле компонента, но через
  // ДРУГОЙ useState (не ref) для хранения предыдущего значения.
  const [expandedFinanceForId, setExpandedFinanceForId] = useState(null);
  const [prevActiveProjectId, setPrevActiveProjectId] = useState(activeProjectId);
  if (activeProjectId !== prevActiveProjectId) {
    setPrevActiveProjectId(activeProjectId);
    if (expandedFinanceForId !== null) setExpandedFinanceForId(null);
  }
  const financeOpen = showFinancePanel && expandedFinanceForId !== null && expandedFinanceForId === activeProjectId;

  // Внутренний fallback самого ProjectListPanel (на случай передачи falsy scopeView напрямую,
  // без App.jsx-обёртки) — 'personal' ("Moje"), синхронно с гарантированным стартом в App.jsx.
  const effectiveScope = scopeView || 'personal';

  const handleOpen = (client) => {
    markProjectOpened(client.id);
    setRecentIds(getRecentProjectIds());
    onOpenProject(client);
  };

  // Первый клик по другому проекту — открывает его (как раньше). Повторный клик по уже
  // активному проекту — раскрывает/сворачивает финансовую панель вместо повторного "открытия".
  const handleRowClick = (client) => {
    if (showFinancePanel && client.id === activeProjectId) {
      setExpandedFinanceForId(prev => (prev === client.id ? null : client.id));
      return;
    }
    handleOpen(client);
  };

  // Смена группы (Moje/GGS) или строки поиска списка проектов — активный проект в sidebar может
  // перестать отображаться (или список группы целиком сменился), поэтому раскрытая финансовая
  // панель обязана закрыться. Сброс — прямо в обработчиках пользовательских событий (клик по
  // кнопке группы, ввод в поле поиска), НЕ в эффекте — тот же запрет react-hooks/set-state-in-effect,
  // что и у механизма выше; derived-сравнение expandedFinanceForId===activeProjectId само по себе
  // не реагирует на смену группы/поиска (activeProjectId при этом не меняется), поэтому явный
  // сброс здесь обязателен.
  const handleScopeChange = (scope) => {
    setExpandedFinanceForId(null);
    setScopeView(scope);
  };

  const handleSearchChange = (value) => {
    setExpandedFinanceForId(null);
    setSearchText(value);
  };

  const { active, completed } = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const scoped = clients.filter((c) => (c.project_scope || 'firma') === effectiveScope);
    const matched = q
      ? scoped.filter((c) => {
          const project = (c.project_name || '').toLowerCase();
          const client = (c.client_name || c.full_name || '').toLowerCase();
          return project.includes(q) || client.includes(q);
        })
      : scoped;

    const rank = new Map(recentIds.map((id, idx) => [id, idx]));
    // Критический запрет на пересортировку (Mobile Project List v1, п.6): на мобильном экране
    // открытие/выделение проекта не должно двигать его вверх — recentIds там не применяется,
    // исходный порядок остаётся стабильным. Desktop-сортировка по recentIds не меняется.
    const byRecent = (list) => mobileLayout ? list : [...list].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
      return ra - rb; // Array.prototype.sort стабилен — при равенстве порядок сохраняется
    });

    return {
      active: byRecent(matched.filter((c) => !COMPLETED_STATUSES.has(c.status))),
      completed: byRecent(matched.filter((c) => COMPLETED_STATUSES.has(c.status))),
    };
  }, [clients, effectiveScope, searchText, recentIds, mobileLayout]);

  // Mobile Project List v1 (ADR-003) — отдельная, явная ветка разметки только для полноэкранного
  // мобильного экрана Projekty. Ниже, после этого блока, идёт ПОЛНОСТЬЮ НЕТРОНУТАЯ разметка для
  // desktop (ProjectNav) и мобильного dropdown (App.jsx) — эта ветка её не переиспользует и не
  // затрагивает, чтобы гарантированно не менять их визуально/функционально.
  if (mobileLayout) {
    // Отдельный корень (не s.panel — у него общий padding:12px, из-за которого App Bar не был бы
    // полноширинным): mobileAppBar сам управляет своим горизонтальным padding (16px) и border-bottom
    // на всю ширину экрана; поиск и список — во вложенной mobileBody со своим padding (12px).
    return (
      <div className={s.mobileRoot}>
        <div className={s.mobileAppBar}>
          <span className={s.mobileTitle}>Projekty</span>
          <div className={s.mobileScopeToggle} role="tablist" aria-label="Zakres projektów">
            <button
              type="button"
              role="tab"
              aria-selected={effectiveScope === 'personal'}
              className={`${s.mobileScopeBtn} ${effectiveScope === 'personal' ? s.mobileScopeBtnActive : ''}`}
              onClick={() => handleScopeChange('personal')}
            >
              Moje
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveScope === 'firma'}
              className={`${s.mobileScopeBtn} ${effectiveScope === 'firma' ? s.mobileScopeBtnActive : ''}`}
              onClick={() => handleScopeChange('firma')}
            >
              GGS
            </button>
          </div>
          {canCreate && (
            <button type="button" className={s.mobileAddBtn} onClick={onNewProject}>
              + Nowy
            </button>
          )}
        </div>

        <div className={s.mobileBody}>
          <input
            type="text"
            className={s.search}
            placeholder="Szukaj projektu…"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Szukaj projektu"
          />

          <div className={`${s.list} ${s.listExtraBottom}`}>
            {active.length === 0 && completed.length === 0 && <div className={s.empty}>Brak projektów.</div>}
            <ClientGroups projects={active} onRowClick={handleRowClick} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
            <ClientGroups projects={completed} onRowClick={handleRowClick} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className={s.title}>Projekty</span>
        {canCreate && (
          <button
            type="button"
            className={s.addBtn}
            onClick={onNewProject}
            aria-label="Dodaj projekt"
            title="Dodaj projekt"
          >
            +
          </button>
        )}
      </div>

      <input
        type="text"
        className={s.search}
        placeholder="Szukaj projektu…"
        value={searchText}
        onChange={(e) => handleSearchChange(e.target.value)}
        aria-label="Szukaj projektu"
      />

      {/* Etykieta "GGS" (dawniej "Wszystkie") — wartości wewnętrzne project_scope ('firma'/
          'personal') i dane NIE są przemianowywane, zmienia się tylko widoczny tekst przycisku
          i kolejność (Moje pierwsze, domyślnie aktywne — zob. App.jsx effectiveScope). */}
      <div className={s.scopeToggle} role="tablist" aria-label="Zakres projektów">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === 'personal'}
          className={`${s.scopeBtn} ${effectiveScope === 'personal' ? s.scopeBtnActive : ''}`}
          onClick={() => handleScopeChange('personal')}
        >
          Moje
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === 'firma'}
          className={`${s.scopeBtn} ${effectiveScope === 'firma' ? s.scopeBtnActive : ''}`}
          onClick={() => handleScopeChange('firma')}
        >
          GGS
        </button>
      </div>

      {showFinancePanel && financeOpen && activeClient && (
        <FinancePanel client={activeClient} setActiveClient={setActiveClient} />
      )}

      <div className={`${s.list} ${extraBottomPadding ? s.listExtraBottom : ''}`}>
        {active.length === 0 && <div className={s.empty}>Brak projektów.</div>}
        <ClientGroups projects={active} onRowClick={handleRowClick} activeProjectId={activeProjectId} onOpenBalance={onOpenBalance} />
      </div>

      {completed.length > 0 && (
        <div className={s.completedSection}>
          <button
            type="button"
            className={s.completedToggle}
            onClick={() => setCompletedOpen((v) => !v)}
            aria-expanded={completedOpen}
          >
            {completedOpen ? '▾' : '▸'} Zakończone ({completed.length})
          </button>
          {completedOpen && (
            <div className={s.completedList}>
              <ClientGroups projects={completed} onRowClick={handleRowClick} activeProjectId={activeProjectId} onOpenBalance={onOpenBalance} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
