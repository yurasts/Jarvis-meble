import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import FileLightbox from './FileLightbox';
import s from './Dashboard.module.css';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

// Категории файлов проекта
const FILE_CATEGORIES = [
  { key: 'projekt', icon: '📐', label: 'Projekt' },
  { key: 'usterki', icon: '⚠️', label: 'Usterki' },
  { key: 'montaz',  icon: '✅', label: 'Montaż'  },
  { key: 'inne',    icon: '📄', label: 'Inne'    },
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
  const [fileCounts, setFileCounts] = useState({}); // { [clientId]: { [category]: count } }
  const [addTaskModal, setAddTaskModal] = useState(null); // project | null
  const [clientInfoModal, setClientInfoModal] = useState(null); // { clientName, address, phone } | null

  useEffect(() => {
    const loadFileCounts = async () => {
      const { data } = await supabase.from('project_files').select('client_id, category');
      if (!data) return;
      const counts = {};
      data.forEach(f => {
        if (!counts[f.client_id]) counts[f.client_id] = {};
        counts[f.client_id][f.category] = (counts[f.client_id][f.category] || 0) + 1;
      });
      setFileCounts(counts);
    };
    loadFileCounts();
  }, []);

  const openFileCategory = async (project, cat) => {
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('client_id', project.id)
      .eq('category', cat.key)
      .order('uploaded_at', { ascending: true });
    setFileViewer({ files: data || [], categoryLabel: `${cat.icon} ${cat.label}` });
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
    setAddTaskModal(null);
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
            const groupAddress = projects.find(p => p.address)?.address;
            const groupPhone   = projects.find(p => p.phone)?.phone;
            return (
              <div key={clientName} className={s.clientGroup}>

                {/* Заголовок группы клиента */}
                <div
                  className={s.clientGroupHeader}
                  onClick={() => toggleClientGroup(clientName)}
                >
                  <div className={s.clientGroupNameCol}>
                    <span className={s.clientGroupName}>👤 {clientName}</span>
                    {(groupAddress || groupPhone) && (
                      <button
                        className={s.clientInfoBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientInfoModal({ clientName, address: groupAddress, phone: groupPhone });
                        }}
                        title="Informacje o kliencie"
                      >
                        ℹ️
                      </button>
                    )}
                  </div>
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

                  return (
                    <div
                      key={project.id}
                      className={s.projectCard}
                      data-status={project.status || 'new'}
                    >
                      <div
                        className={s.projectHeader}
                        onClick={() => openProjectModal(project)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={s.projectInfo}>

                          {/* Название проекта — ярко-синим */}
                          <div className={s.projectNameRow}>
                            <h3 className={s.projectName}>
                              {project.project_name || project.full_name}
                            </h3>
                          </div>

                          {/* Дедлайн */}
                          {project.deadline && (
                            <div className={s.metaRow}>
                              <span className={s.deadline}>📅 {shortDate(project.deadline)}</span>
                            </div>
                          )}

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

                      {/* Кнопки категорий файлов — только те, где есть файлы */}
                      {FILE_CATEGORIES.some(cat => (fileCounts[project.id]?.[cat.key] || 0) > 0) && (
                        <div className={s.fileButtonsRow}>
                          {FILE_CATEGORIES.filter(cat => (fileCounts[project.id]?.[cat.key] || 0) > 0).map(cat => {
                            const count = fileCounts[project.id][cat.key];
                            return (
                              <button
                                key={cat.key}
                                className={s.fileCatBtn}
                                onClick={() => openFileCategory(project, cat)}
                              >
                                <span className={s.fileCatIcon}>
                                  {cat.icon}
                                  <span className={s.fileCatBadge}>{count}</span>
                                </span>
                                <span className={s.fileCatLabel}>{cat.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Задачи */}
                      <div className={s.tasksBody}>
                        <button className={s.btnAddTaskOpen} onClick={() => setAddTaskModal(project)}>
                          + Zadanie
                        </button>
                        <div className={s.taskList}>
                          {(() => {
                            const allTasks  = project.tasks || [];
                            const doneTasks = allTasks.filter(t => t.isDone);
                            const openTasks = allTasks.filter(t => !t.isDone);
                            const showDone  = showDoneByProject[project.id];
                            const visible   = showDone ? allTasks : openTasks;
                            return (<>
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

      {addTaskModal && (
        <div className={s.modalOverlay} onClick={() => setAddTaskModal(null)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <span>+ Zadanie — {addTaskModal.project_name || addTaskModal.full_name}</span>
              <button className={s.modalCloseBtn} onClick={() => setAddTaskModal(null)}>✕</button>
            </div>
            <div className={s.modalBody}>
              <input
                type="text"
                autoFocus
                placeholder="Wpisz zadanie..."
                value={newTaskParams[addTaskModal.id]?.text || ''}
                onChange={e => setNewTaskParams(prev => ({ ...prev, [addTaskModal.id]: { ...prev[addTaskModal.id], text: e.target.value } }))}
                onKeyDown={e => e.key === 'Enter' && handleAddTask(addTaskModal.id)}
                className={s.modalInput}
              />
              <div className={s.dateWrap}>
                <input type="date"
                  value={newTaskParams[addTaskModal.id]?.date || ''}
                  onChange={e => setNewTaskParams(prev => ({ ...prev, [addTaskModal.id]: { ...prev[addTaskModal.id], date: e.target.value } }))}
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
                  {newTaskParams[addTaskModal.id]?.date ? shortDate(newTaskParams[addTaskModal.id].date) : '📅 Termin'}
                </button>
              </div>
              <button className={s.modalSubmitBtn} onClick={() => handleAddTask(addTaskModal.id)}>
                + Dodaj zadanie
              </button>
            </div>
          </div>
        </div>
      )}

      {clientInfoModal && (
        <div className={s.modalOverlay} onClick={() => setClientInfoModal(null)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <span>👤 {clientInfoModal.clientName}</span>
              <button className={s.modalCloseBtn} onClick={() => setClientInfoModal(null)}>✕</button>
            </div>
            <div className={s.modalBody}>
              {clientInfoModal.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientInfoModal.address)}`}
                  target="_blank" rel="noreferrer"
                  className={s.clientInfoLink}
                >
                  📍 {clientInfoModal.address}
                </a>
              )}
              {clientInfoModal.phone && (
                <a href={`tel:${clientInfoModal.phone}`} className={s.clientInfoLink}>
                  📞 {clientInfoModal.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
