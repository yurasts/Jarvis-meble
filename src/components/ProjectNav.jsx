import ProjectListPanel from './ProjectListPanel';
import s from './ProjectNav.module.css';

const initials = (name) =>
  (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

// Проект-центричная боковая панель (desktop). Заменяет прежнее полноразмерное текстовое меню:
// компактный ряд иконок глобальных разделов + список проектов занимает основное место.
export default function ProjectNav({
  tabs,
  activeTab,
  onSelectTab,
  clients,
  scopeView,
  setScopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  profile,
  displayName,
  onlineUsers = [],
  tabLabels = {},
  onSignOut,
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
        setScopeView={setScopeView}
        canCreate={canCreate}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        activeProjectId={activeProjectId}
      />

      {onlineUsers.length > 0 && (
        <div className={s.onlineBlock}>
          <div className={s.onlineLabel}>🟢 Online ({onlineUsers.length})</div>
          {onlineUsers.map((u) => (
            <div key={u.userId} className={s.onlineRow}>
              <div className={s.onlineAvatar} style={{ background: u.color || '#718096' }}>
                {initials(u.fullName)}
              </div>
              <div className={s.onlineText}>
                <div className={s.onlineName}>{u.userId === profile?.id ? 'Ja' : u.fullName}</div>
                <div className={s.onlineSub}>{tabLabels[u.activeTab] || u.activeTab}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.footer}>
        <div className={s.userRow}>
          <div className={s.avatar} style={{ background: profile?.color || '#718096' }}>
            {initials(profile?.full_name)}
          </div>
          <span className={s.userName}>{displayName}</span>
        </div>
        <div className={s.role}>{profile?.role}</div>
        <button className={s.logoutBtn} onClick={onSignOut}>Wyloguj</button>
      </div>
    </div>
  );
}
