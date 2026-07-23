import ProjectListPanel from './ProjectListPanel';
import s from './MobileProjectsScreen.module.css';

// Мобильный экран "Projekty" (ADR-003, Mobile Field Mode — первая реализуемая фаза).
// Тонкая обёртка над уже существующим ProjectListPanel — группировка "клиент → проекты",
// сворачивание группы, поиск, статусы/сроки/счётчики задач и подсветка активного проекта
// переиспользованы без изменений и без новой логики. Открытие проекта (onOpenProject) —
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
        extraBottomPadding
      />
    </div>
  );
}
