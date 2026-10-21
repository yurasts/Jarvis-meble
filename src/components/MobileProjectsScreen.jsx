import ProjectListPanel from './ProjectListPanel';
import s from './MobileProjectsScreen.module.css';

// Мобильный экран "Projekty" (ADR-003, Mobile Project List v1). Тонкая обёртка над уже
// существующим ProjectListPanel — группировка "клиент → проекты", поиск и подсветка активного
// проекта переиспользованы без новой логики; собственно мобильную разметку (App Bar, touch-
// размеры) включает проп mobileLayout — desktop (ProjectNav) и мобильный dropdown (App.jsx)
// вызывают тот же ProjectListPanel без него, их разметка не затронута. Открытие проекта
// (onOpenProject) — тот же requestOpenProject из App.jsx, что и на desktop.
//
// feat/mobile-project-list-parity (2026-10): mobileLayout теперь рендерится деревом
// клиент→проекты (тем же TreeClientGroups/SystemFolder, что и десктопный treeLayout — карандаш,
// Bilans, меню «⋯», Zakończone/Archiwum/Kosz), кроме папок файлов — см. ProjectListPanel.jsx.
//
// Компонент всегда смонтирован (см. App.jsx) — видимость переключается только через className,
// а не через условный рендер, чтобы поиск/фильтр внутри ProjectListPanel не сбрасывались при
// переходах между основными мобильными разделами.
export default function MobileProjectsScreen({
  visible,
  clients,
  scopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  // Mobile / Client Balance / Expanded v1 — кнопка "Bilans" в заголовке группы клиента
  // (ProjectListPanel, mobileLayout) вызывает это с client_name; открывает отдельный полноэкранный
  // MobileClientBalanceScreen (сам этот экран Projekty остаётся смонтированным под ним).
  onOpenBalance,
  // Карандаш у клиента — открывает/создаёт отложенное открытие окна «Klient i projekt»
  // (requestEditClient из App.jsx, та же функция, что и на desktop).
  onEditClient,
  // Archiwum/Kosz и меню «⋯» — те же пропсы и обработчики, что ProjectNav передаёт на desktop.
  archivedClients,
  trashClients,
  canManageLifecycle,
  canPurge,
  lifecycleBusy,
  onChangeLifecycle,
  onPurgeProjects,
  // Ошибка архивации/корзины/удаления (App.jsx, lifecycleNotice) — на desktop видна в общей
  // полосе над контентом; этот экран рендерится поверх неё (position: fixed, см. .module.css),
  // поэтому показывает её сам, иначе действия из дерева падали бы без видимой причины.
  lifecycleNotice,
}) {
  return (
    <div className={`${s.screen} ${visible ? '' : s.hidden}`} aria-hidden={!visible}>
      <ProjectListPanel
        clients={clients}
        scopeView={scopeView}
        canCreate={canCreate}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        activeProjectId={activeProjectId}
        onOpenBalance={onOpenBalance}
        mobileLayout
        onEditClient={onEditClient}
        archivedClients={archivedClients}
        trashClients={trashClients}
        canManageLifecycle={canManageLifecycle}
        canPurge={canPurge}
        lifecycleBusy={lifecycleBusy}
        onChangeLifecycle={onChangeLifecycle}
        onPurgeProjects={onPurgeProjects}
        lifecycleNotice={lifecycleNotice}
      />
    </div>
  );
}
