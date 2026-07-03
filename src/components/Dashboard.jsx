import React, { useState } from 'react';
import { supabase } from '../supabase';
import FileLightbox from './FileLightbox';
import s from './Dashboard.module.css';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

// Цвет левой рамки карточки по статусу
const STATUS_BORDER = {
  new:        '#e53e3e', // 🔴 красный
  design:     '#dd6b20', // 🟠 оранжевый
  production: '#d69e2e', // 🟡 жёлтый
  done:       '#38a169', // 🟢 зелёный
};

const STATUS_BG = {
  new:        { light: '#fff5f5', dark: '#2d1515' },
  design:     { light: '#fffaf0', dark: '#2d1a00' },
  production: { light: '#fffff0', dark: '#2d2a00' },
  done:       { light: '#f0fff4', dark: '#0f2a1a' },
};

// Категории файлов проекта
const FILE_CATEGORIES = [
  { key: 'Projekt', label: '📐 Projekt' },
  { key: 'Usterki', label: '⚠️ Usterki' },
  { key: 'Montaż',  label: '✅ Montaż'  },
  { key: 'Inne',    label: '📄 Inne'    },
];

// Группировка проектов по client_name
const groupByClient = (projects) => {
  const map = {};
  projects.forEach(p => {
    const key = p.client_name || p.full_name || '—';
    if (!map[key]) map[key] = [];
    map[key].push(p);
  });
  return Object.entries(map); // [[clientName, [projects]], ...]
};

const Dashboard = ({
  clients, updateClient, openProjectModal, setIsModalOpen,
  profilesById = {}, canCreate = true, currentProfile = null
}) => {
  const [newTaskParams,      setNewTaskParams]      = useState({});
  const [confirmDeleteId,    setConfirmDeleteId]    = useState(null);
  const [expandedTaskId,     setExpandedTaskId]     = useState(null);
  const [expandedProjectId,  setExpandedProjectId]  = useState(null);
  // Свёрнутые группы клиентов (Set с именами клиентов)
  const [collapsedClients,   setCollapsedClients]   = useState(new Set());
  // По умолчанию выполненные задачи скрыты для каждого проекта
  const [showDoneByProject,  setShowDoneByProject]  = useState({});
  const [fileViewer, setFileViewer] = useState(null); // { files, categoryLabel } | null

  const openFileCategory = async (project, cat) => {
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('client_id', project.id)
      .eq('category', cat.key)
      .order('uploaded_at', { ascending: true });
    setFileViewer({ files: data || [], categoryLabel: cat.label });
  };

  const toggleShowDone = (projectId) => {
    setShowDoneByProject(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const activeProjects = (clients || []).filter(
    c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone'
  );

  const groups = groupByClient(activeProjects);

  const toggleClientGroup = (clientName) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      next.has(clientName) ? next.delete(clientName) : next.add(clientName);
      return next;
    });
  };

  const handleAddTask = (clientId) => {
    const params = newTaskParams[clientId];
    if (!params?.text) return;
    const project = activeProjects.find(c => c.id === clientId);
    const newTask = {
      id: Date.now(), text: params.text, date: params.date || '', isDone: false,
      createdById: currentProfile?.id || null, createdByName: currentProfile?.full_name || null,
      createdByColor: currentProfile?.color || '#718096', createdAt: new Date().toISOString(),
    };
    updateClient(clientId, { tasks: [...(project.tasks || []), newTask] });
    setNewTaskParams(prev => ({ ...prev, [clientId]: { text: '', date: '' } }));
  };

  const toggleTaskStatus = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, {
      tasks: (project.tasks || []).map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t)
    });
  };

  const deleteTask = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, { tasks: (project.tasks || []).filter(t => t.id !== taskId) });
    setConfirmDeleteId(null);
  };

  return (
    <div className={s.page}>
      <div className={s.list}>

        {canCreate && (
          <div className={s.desktopNewBtn}>
            <button className={s.btnNewProject} onClick={() => setIsModalOpen(true)}>
              + Nowy projekt
            </button>
          </div>
        )}

        {activeProjects.length === 0 ? (
          <div className={s.empty}>Brak aktywnych projektów.</div>
        ) : (
          groups.map(([clientName, projects]) => {
            const isCollapsed = collapsedClients.has(clientName);
            return (
              <div key={clientName} className={s.clientGroup}>

                {/* Заголовок группы клиента */}
                <div
                  className={s.clientGroupHeader}
                  onClick={() => toggleClientGroup(clientName)}
                >
                  <span className={s.clientGroupName}>👤 {clientName}</span>
                  <span className={s.clientGroupMeta}>
                    {projects.length} {projects.length === 1 ? 'projekt' : 'projekty'}
                  </span>
                  <span className={s.clientGroupArrow}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                </div>

                {/* Проекты клиента */}
                {!isCollapsed && projects.map(project => {
                  const editor           = project.updated_by ? profilesById[project.updated_by] : null;
                  const isProjectExpanded = expandedProjectId === project.id;
                  const projectBudget    = Number(project.budget) || 0;
                  const coef             = Number(project.budget_coefficient) || 0;
                  const borderColor      = STATUS_BORDER[project.status] || STATUS_BORDER.new;

                  return (
                    <div
                      key={project.id}
                      className={s.projectCard}
                      data-status={project.status || 'new'}
                      style={{ borderLeft: `4px solid ${borderColor}` }}
                    >
                      <div
                        className={s.projectHeader}
                        onClick={() => openProjectModal(project)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={s.projectInfo}>

                          {/* Название проекта (крупно) + статус */}
                          <div className={s.projectNameRow}>
                            <h3 className={s.projectName}>
                              {project.project_name || project.full_name}
                            </h3>
                            <span
                              className={s.statusBadge}
                              style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '6px' }}
                            >
                              {project.status || 'new'}
                            </span>
                          </div>

                          {/* Адрес + дедлайн */}
                          {(project.address || project.deadline) && (
                            <div className={s.metaRow}>
                              {project.address && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`}
                                  target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className={s.addressLink}
                                >
                                  📍 {project.address}
                                </a>
                              )}
                              {project.deadline && (
                                <span className={s.deadline}>📅 {shortDate(project.deadline)}</span>
                              )}
                            </div>
                          )}

                          {/* Финансы */}
                          <div className={s.financeCol}>
                            {projectBudget > 0 && (
                              <span className={s.budzet}>
                                Budżet: {projectBudget.toFixed(2)} zł{coef > 0 ? ` (×${coef})` : ''}
                              </span>
                            )}
                          </div>

                          {/* Подпись редактора */}
                          {editor && (
                            <span
                              className={s.editorExpanded}
                              onClick={(e) => { e.stopPropagation(); setExpandedProjectId(isProjectExpanded ? null : project.id); }}
                            >
                              {isProjectExpanded ? (
                                <>
                                  <div className={s.editorAvatar} style={{ background: editor.color || '#718096' }}>
                                    {initials(editor.full_name)}
                                  </div>
                                  <span className={s.editorName}>
                                    {editor.full_name} • {project.updated_at
                                      ? new Date(project.updated_at).toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
                                      : ''}
                                  </span>
                                </>
                              ) : (
                                <div className={s.editorDot} style={{ background: editor.color || '#cbd5e0' }} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Кнопки категорий файлов */}
                      <div className={s.fileButtonsRow}>
                        {FILE_CATEGORIES.map(cat => (
                          <button
                            key={cat.key}
                            className={s.fileCatBtn}
                            onClick={() => openFileCategory(project, cat)}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      {/* Задачи */}
                      <div className={s.tasksBody}>
                        <div className={s.addTaskRow}>
                          <button className={s.btnAddTask} onClick={() => handleAddTask(project.id)}>+</button>
                          <input type="text" placeholder="Wpisz zadanie..."
                            value={newTaskParams[project.id]?.text || ''}
                            onChange={e => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], text: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddTask(project.id)}
                            className={s.inputTask} />
                          <div className={s.dateWrap}>
                            <input type="date"
                              value={newTaskParams[project.id]?.date || ''}
                              onChange={e => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))}
                              className={s.inputDateHidden} />
                            <button
                              type="button"
                              className={s.dateDisplayBtn}
                              onClick={(e) => {
                                const input = e.currentTarget.previousSibling;
                                if (input?.showPicker) input.showPicker();
                                else input?.focus();
                              }}
                            >
                              {newTaskParams[project.id]?.date ? shortDate(newTaskParams[project.id].date) : '📅'}
                            </button>
                          </div>
                        </div>
                        <div className={s.taskList}>
                          {(() => {
                            const allTasks  = project.tasks || [];
                            const doneTasks = allTasks.filter(t => t.isDone);
                            const openTasks = allTasks.filter(t => !t.isDone);
                            const showDone  = showDoneByProject[project.id];
                            const visible   = showDone ? allTasks : openTasks;
                            return (<>
                              {visible.length === 0 && openTasks.length === 0 && doneTasks.length === 0 && (
                                <div className={s.noTasks}>Brak zadań.</div>
                              )}
                          {visible.map(task => {
                            const taskColor  = task.createdByColor || '#718096';
                            const isConfirm  = confirmDeleteId === task.id;
                            const isExpanded = expandedTaskId === task.id;
                            const taskItemClass = [s.taskItem, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');
                            const taskTextClass = [s.taskText, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');
                            return (
                              <div key={task.id} className={taskItemClass}>
                                <div className={s.taskRow} style={{ borderLeft: `3px solid ${taskColor}` }}>
                                  <input type="checkbox" checked={task.isDone}
                                    onChange={() => toggleTaskStatus(project.id, task.id)}
                                    className={s.taskCheckbox} />
                                  <div className={s.taskTextWrap} onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                    <span className={taskTextClass}>{task.text}</span>
                                  </div>
                                  {task.date && <span className={s.taskDate}>{shortDate(task.date)}</span>}
                                  {isConfirm ? (
                                    <div className={s.confirmBtns}>
                                      <button className={s.btnConfirmYes} onClick={() => deleteTask(project.id, task.id)}>Tak</button>
                                      <button className={s.btnConfirmNo} onClick={() => setConfirmDeleteId(null)}>Nie</button>
                                    </div>
                                  ) : (
                                    <button className={s.btnDelete} onClick={() => setConfirmDeleteId(task.id)}>✖</button>
                                  )}
                                </div>
                                {isExpanded && task.createdByName && (
                                  <div className={s.taskAuthor}>
                                    <div className={s.taskAuthorAvatar} style={{ background: taskColor }}>
                                      {initials(task.createdByName)}
                                    </div>
                                    <span className={s.taskAuthorName}>
                                      {task.createdByName}
                                      {task.createdAt ? ' • ' + new Date(task.createdAt).toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {/* Кнопка показа выполненных задач */}
                          {(() => {
                            const doneTasks = (project.tasks || []).filter(t => t.isDone);
                            if (doneTasks.length === 0) return null;
                            const showDone = showDoneByProject[project.id];
                            return (
                              <button
                                onClick={() => toggleShowDone(project.id)}
                                className={s.btnToggleDone}
                              >
                                {showDone
                                  ? `▲ Ukryj wykonane (${doneTasks.length})`
                                  : `▼ Pokaż wykonane (${doneTasks.length})`}
                              </button>
                            );
                          })()}
                            </>);
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {fileViewer && (
        <FileLightbox
          files={fileViewer.files}
          categoryLabel={fileViewer.categoryLabel}
          onClose={() => setFileViewer(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
