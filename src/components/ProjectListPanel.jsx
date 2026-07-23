import { useMemo, useState } from 'react';
import { shortDate, groupByClient } from './dashboardHelpers';
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

function ProjectRow({ client, onOpen, isActive }) {
  const projectName = client.project_name || client.full_name || '—';
  const openTasks = (client.tasks || []).filter((t) => !t.isDone).length;
  const color = STATUS_COLOR[client.status] || STATUS_COLOR.new;

  return (
    <div
      className={`${s.row} ${isActive ? s.rowActive : ''}`}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onOpen(client)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(client); }}
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
function ClientGroups({ projects, onOpen, activeProjectId }) {
  return groupByClient(projects).map(([clientName, group]) => (
    <div key={clientName} className={s.clientGroup}>
      <div className={s.clientGroupHeader}>{clientName}</div>
      {group.map((c) => (
        <ProjectRow key={c.id} client={c} onOpen={onOpen} isActive={c.id === activeProjectId} />
      ))}
    </div>
  ));
}

export default function ProjectListPanel({
  clients = [],
  scopeView,
  setScopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  // Доп. отступ снизу у списка — нужен только для мобильного экрана Projekty (ADR-003),
  // где список перекрывался бы закреплённой нижней навигацией. На desktop/в мобильном
  // dropdown (существующие вызовы) не передаётся — поведение там не меняется.
  extraBottomPadding = false,
}) {
  const [searchText, setSearchText] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [recentIds, setRecentIds] = useState(() => getRecentProjectIds());

  const effectiveScope = scopeView || 'firma';

  const handleOpen = (client) => {
    markProjectOpened(client.id);
    setRecentIds(getRecentProjectIds());
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

    const rank = new Map(recentIds.map((id, idx) => [id, idx]));
    const byRecent = (list) => [...list].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
      return ra - rb; // Array.prototype.sort стабилен — при равенстве порядок сохраняется
    });

    return {
      active: byRecent(matched.filter((c) => !COMPLETED_STATUSES.has(c.status))),
      completed: byRecent(matched.filter((c) => COMPLETED_STATUSES.has(c.status))),
    };
  }, [clients, effectiveScope, searchText, recentIds]);

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

      <div className={s.scopeToggle} role="tablist" aria-label="Zakres projektów">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === 'firma'}
          className={`${s.scopeBtn} ${effectiveScope === 'firma' ? s.scopeBtnActive : ''}`}
          onClick={() => setScopeView('firma')}
        >
          Wszystkie
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === 'personal'}
          className={`${s.scopeBtn} ${effectiveScope === 'personal' ? s.scopeBtnActive : ''}`}
          onClick={() => setScopeView('personal')}
        >
          Moje
        </button>
      </div>

      <div className={`${s.list} ${extraBottomPadding ? s.listExtraBottom : ''}`}>
        {active.length === 0 && <div className={s.empty}>Brak projektów.</div>}
        <ClientGroups projects={active} onOpen={handleOpen} activeProjectId={activeProjectId} />
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
              <ClientGroups projects={completed} onOpen={handleOpen} activeProjectId={activeProjectId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
