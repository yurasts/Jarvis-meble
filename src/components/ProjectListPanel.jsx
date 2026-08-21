import { useMemo, useState } from 'react';
import { groupByClient } from './dashboardHelpers';
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

export default function ProjectListPanel({
  clients = [],
  scopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
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

  // Защитный fallback: если обёртка не передала вычисленную группу, показываем GGS.
  const effectiveScope = scopeView || 'firma';

  const handleOpen = (client) => {
    onOpenProject(client);
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

    return {
      // Выбор проекта меняет только подсветку и рабочую область. Исходный порядок clients
      // сохраняется: строка не перескакивает вверх ни на desktop, ни на mobile.
      active: matched.filter((c) => !COMPLETED_STATUSES.has(c.status)),
      completed: matched.filter((c) => COMPLETED_STATUSES.has(c.status)),
    };
  }, [clients, effectiveScope, searchText]);

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
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Szukaj projektu"
          />

          <div className={`${s.list} ${s.listExtraBottom}`}>
            {active.length === 0 && completed.length === 0 && <div className={s.empty}>Brak projektów.</div>}
            <ClientGroups projects={active} onRowClick={handleOpen} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
            <ClientGroups projects={completed} onRowClick={handleOpen} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
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
        onChange={(e) => setSearchText(e.target.value)}
        aria-label="Szukaj projektu"
      />

      <div className={`${s.list} ${extraBottomPadding ? s.listExtraBottom : ''}`}>
        {active.length === 0 && <div className={s.empty}>Brak projektów.</div>}
        <ClientGroups projects={active} onRowClick={handleOpen} activeProjectId={activeProjectId} onOpenBalance={onOpenBalance} />
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
              <ClientGroups projects={completed} onRowClick={handleOpen} activeProjectId={activeProjectId} onOpenBalance={onOpenBalance} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
