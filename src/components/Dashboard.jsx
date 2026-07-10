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
  profilesById = {}, canCreate = true, currentProfile = null,
  focusTarget = null, onFocusHandled,
  scopeView, setScopeView,
}) => {
  const [newTaskParams,      setNewTaskParams]      = useState({});
  const [confirmDeleteId,    setConfirmDeleteId]    = useState(null);
  const [expandedTaskId,     setExpandedTaskId]     = useState(null);
  const [editingTaskId,      setEditingTaskId]      = useState(null);
  const [editTaskText,       setEditTaskText]       = useState('');
  // Свёрнутые группы клиентов (Set с именами клиентов)
  const [collapsedClients,   setCollapsedClients]   = useState(new Set());
  // По умолчанию выполненные задачи скрыты для каждого проекта
  const [showDoneByProject,  setShowDoneByProject]  = useState({});
  const [fileViewer, setFileViewer] = useState(null); // { files, categoryLabel } | null
  const [fileCounts, setFileCounts] = useState({}); // { [clientId]: { [category]: count } }
  const [addTaskModal, setAddTaskModal] = useState(null); // project | null
  const [clientInfoModal, setClientInfoModal] = useState(null); // { clientName, address, phone } | null
  const [expandedProjects, setExpandedProjects] = useState(new Set()); // id проектов, развёрнутых в аккордеоне
  const [highlightedTaskId, setHighlightedTaskId] = useState(null);

  // Переход к задаче из глобального поиска: разворачиваем клиента и проект, подсвечиваем задачу
  useEffect(() => {
    if (!focusTarget) return;
    const { clientName, projectId, taskId } = focusTarget;

    setCollapsedClients(prev => {
      const next = new Set(prev);
      next.delete(clientName);
      return next;
    });
    setExpandedProjects(prev => new Set(prev).add(projectId));
    setHighlightedTaskId(taskId);

    const scrollTimer = setTimeout(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clearTimer = setTimeout(() => setHighlightedTaskId(null), 2500);

    onFocusHandled?.();
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [focusTarget]);

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

  const effectiveScope = scopeView || 'firma';

  const activeProjects = (clients || []).filter(
    c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone'
      && (c.project_scope || 'firma') === effectiveScope
  );

  const groups = groupByClient(activeProjects);

  const toggleClientGroup = (clientName) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      next.has(clientName) ? next.delete(clientName) : next.add(clientName);
      return next;
    });
  };

  const toggleProjectExpand = (projectId) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
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

  const updateTaskText = (clientId, taskId, newText) => {
    if (!newText.trim()) return;
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, {
      tasks: (project.tasks || []).map(t => t.id === taskId ? { ...t, text: newText } : t)
    });
  };

  return (
    <div className={s.page}>
      <div className={s.list}>

        <div className={s.scopeToggle}>
          <button
            className={`${s.scopeBtn} ${effectiveScope === 'firma' ? s.scopeBtnActive : ''}`}
            onClick={() => setScopeView('firma')}
          >
            🏢 Firma
          </button>
          <button
            className={`${s.scopeBtn} ${effectiveScope === 'personal' ? s.scopeBtnActive : ''}`}
            onClick={() => setScopeView('personal')}
          >
            👤 Moje
          </button>
        </div>

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
                    <span className={s.clientGroupName}>👤 {clientName}</span>
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
                  const isProjectExpanded = expandedProjects.has(project.id);
                  const allTasksCount = (project.tasks || []).length;
                  const availableCats = FILE_CATEGORIES.filter(cat => (fileCounts[project.id]?.[cat.key] || 0) > 0);
                  return (
                    <div key={project.id} className={s.projectRowWrap}>
                      <div
                        className={s.projectRow}
                        onClick={() => toggleProjectExpand(project.id)}
                      >
                        <span className={s.projectDot} data-status={project.status || 'new'} />
                        <span
                          className={s.projectRowName}
                          onClick={(e) => { e.stopPropagation(); openProjectModal(project); }}
                        >
                          {project.project_name || project.full_name}
                        </span>
                        <span className={s.projectRowMeta}>
                          {allTasksCount} {allTasksCount === 1 ? 'zadanie' : 'zadań'}
                        </span>
                        {availableCats.length > 0 && (
                          <div className={s.fileButtonsInline} onClick={e => e.stopPropagation()}>
                            {availableCats.map(cat => {
                              const count = fileCounts[project.id][cat.key];
                              return (
                                <button
                                  key={cat.key}
                                  className={s.fileCatBtnSmall}
                                  onClick={() => openFileCategory(project, cat)}
                                  title={`${cat.label} (${count})`}
                                >
                                  {cat.icon}
                                  <span className={s.fileCatBadgeSmall}>{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <span className={s.projectRowArrow}>{isProjectExpanded ? '▼' : '▶'}</span>
                      </div>

                      {/* Задачи — только когда развёрнуто */}
                      {isProjectExpanded && (
                      <div className={s.tasksBody}>
                        {(() => {
                          const allTasks  = project.tasks || [];
                          const doneTasks = allTasks.filter(t => t.isDone);
                          const openTasks = allTasks.filter(t => !t.isDone);
                          const showDone  = showDoneByProject[project.id];
                          const visible   = showDone ? allTasks : openTasks;
                          return (
                            <>
                              <div className={s.taskActionsRow}>
                                <button className={s.btnAddTaskOpen} onClick={() => setAddTaskModal(project)}>
                                  +
                                </button>
                                {doneTasks.length > 0 && (
                                  <button
                                    onClick={() => toggleShowDone(project.id)}
                                    className={s.btnToggleDone}
                                  >
                                    {showDone ? '▲' : '▼'} Wykonane ({doneTasks.length})
                                  </button>
                                )}
                              </div>
                              <div className={s.taskList}>
                                {visible.map(task => {
                                  const taskColor  = task.createdByColor || '#718096';
                                  const isConfirm  = confirmDeleteId === task.id;
                                  const isExpanded = expandedTaskId === task.id;
                                  const isEditing  = editingTaskId === task.id;
                                  const taskItemClass = [s.taskItem, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');
                                  const taskTextClass = [s.taskText, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');
                                  const startEditing = (e) => {
                                    e.stopPropagation();
                                    setEditingTaskId(task.id);
                                    setEditTaskText(task.text);
                                  };
                                  const saveEditing = () => {
                                    updateTaskText(project.id, task.id, editTaskText);
                                    setEditingTaskId(null);
                                  };
                                  return (
                                    <div
                                      key={task.id}
                                      id={`task-${task.id}`}
                                      className={`${taskItemClass} ${highlightedTaskId === task.id ? s.taskHighlighted : ''}`}
                                    >
                                      <div className={s.taskRow}>
                                        <input type="checkbox" checked={task.isDone}
                                          onChange={() => toggleTaskStatus(project.id, task.id)}
                                          className={s.taskCheckbox} />
                                        {isEditing ? (
                                          <input
                                            autoFocus
                                            value={editTaskText}
                                            onChange={e => setEditTaskText(e.target.value)}
                                            onBlur={saveEditing}
                                            onKeyDown={e => e.key === 'Enter' && saveEditing()}
                                            onClick={e => e.stopPropagation()}
                                            className={s.taskEditInput}
                                          />
                                        ) : (
                                          <div className={s.taskTextWrap} onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                            <span className={taskTextClass}>{task.text}</span>
                                          </div>
                                        )}
                                        {task.date && <span className={s.taskDate}>{shortDate(task.date)}</span>}
                                        {isConfirm ? (
                                          <div className={s.confirmBtns}>
                                            <button className={s.btnConfirmYes} onClick={() => deleteTask(project.id, task.id)}>Tak</button>
                                            <button className={s.btnConfirmNo} onClick={() => setConfirmDeleteId(null)}>Nie</button>
                                          </div>
                                        ) : (
                                          <>
                                            <button className={s.btnEdit} onClick={startEditing}>✎</button>
                                            <button className={s.btnDelete} onClick={() => setConfirmDeleteId(task.id)}>✖</button>
                                          </>
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
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      )}
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
