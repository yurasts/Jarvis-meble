import ProjectListPanel from './ProjectListPanel';
import s from './MobileProjectsScreen.module.css';

// Мобильный экран "Projekty" (ADR-003, Mobile Project List v1). Тонкая обёртка над уже
// существующим ProjectListPanel — группировка "клиент → проекты", поиск и подсветка активного
// проекта переиспользованы без новой логики; собственно мобильную разметку (App Bar, компактные
// строки без переноса и без пересортировки по recentIds, завершённые проекты без Zakończone)
// включает проп mobileLayout — desktop (ProjectNav) и мобильный dropdown (App.jsx) вызывают тот
// же ProjectListPanel без него, их разметка не затронута. Открытие проекта (onOpenProject) —
// тот же requestOpenProject из App.jsx, что и на desktop: на узком экране он, как и раньше,
// открывает существующую модалку ProjectModal (variant="modal") — сознательно временное
// ограничение этой фазы (полноэкранный мобильный экран проекта — отдельная задача).
//
// Компонент всегда смонтирован (см. App.jsx) — видимость переключается только через className,
// а не через условный рендер, чтобы поиск/фильтр внутри ProjectListPanel не сбрасывались при
// переходе на Produkcja/Materiały/Więcej и обратно.
export default function MobileProjectsScreen({
  visible,
  clients,
  scopeView,
  setScopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  // Mobile / Client Balance / Expanded v1 — кнопка "Bilans" в заголовке группы клиента
  // (ProjectListPanel, mobileLayout) вызывает это с client_name; открывает отдельный полноэкранный
  // MobileClientBalanceScreen (сам этот экран Projekty остаётся смонтированным под ним).
  onOpenBalance,
}) {
  return (
    <div className={`${s.screen} ${visible ? '' : s.hidden}`} aria-hidden={!visible}>
      <ProjectListPanel
        clients={clients}
        scopeView={scopeView}
        setScopeView={setScopeView}
        canCreate={canCreate}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        activeProjectId={activeProjectId}
        onOpenBalance={onOpenBalance}
        mobileLayout
      />
    </div>
  );
}
