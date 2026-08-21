import ProjectListPanel from './ProjectListPanel';
import s from './ProjectNav.module.css';

// Проект-центричная боковая панель (desktop). Заменяет прежнее полноразмерное текстовое меню:
// компактный ряд иконок глобальных разделов + список проектов занимает основное место.
export default function ProjectNav({
  tabs,
  activeTab,
  onSelectTab,
  clients,
  scopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  onOpenBalance,
  activeProjectId,
}) {
  return (
    <div className={s.sidebar}>
      <div className={s.logo}>Jarvis</div>

      <div className={s.iconRow} role="tablist" aria-label="Sekcje aplikacji">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-label={label}
            title={label}
            className={`${s.iconBtn} ${activeTab === id ? s.iconBtnActive : ''}`}
            onClick={() => onSelectTab(id)}
          >
            <Icon size={18} strokeWidth={2} />
          </button>
        ))}
      </div>

      <ProjectListPanel
        clients={clients}
        scopeView={scopeView}
        canCreate={canCreate}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        onOpenBalance={onOpenBalance}
        activeProjectId={activeProjectId}
      />

    </div>
  );
}
