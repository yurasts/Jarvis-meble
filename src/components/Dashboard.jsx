import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import s from './Dashboard.module.css';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

const calcProjectCosts = (project) => {
  const sum = (arr) => (arr || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
  return sum(project.calc_materials) + sum(project.calc_services) + sum(project.calc_expenses);
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
  const [carouselIdx,        setCarouselIdx]        = useState({});
  const [projectFiles,       setProjectFiles]       = useState({});
  // Активная категория фото по проекту (null = скрыто)
  const [activePhotoTab,     setActivePhotoTab]     = useState({});
  // Лайтбокс: { projectId, index }
  const [lightbox,           setLightbox]           = useState(null);
  const [expandedProjectId,  setExpandedProjectId]  = useState(null);
  // Свёрнутые группы клиентов (Set с именами клиентов)
  const [collapsedClients,   setCollapsedClients]   = useState(new Set());
  // По умолчанию выполненные задачи скрыты для каждого проекта
  const [showDoneByProject,  setShowDoneByProject]  = useState({});

  const toggleShowDone = (projectId) => {
    setShowDoneByProject(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // Загружаем фото для всех активных проектов
  useEffect(() => {
    const ids = (clients || [])
      .filter(c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone')
      .map(c => c.id);
    if (!ids.length) return;
    supabase.from('project_files')
      .select('client_id, file_url, file_type, category')
      .in('client_id', ids)
      .order('uploaded_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const byProject = {};
        data.forEach(f => {
          if (!f.file_url || !f.file_type?.startsWith('image/')) return;
          if (!byProject[f.client_id]) byProject[f.client_id] = [];
          byProject[f.client_id].push({ url: f.file_url, category: f.category || 'inne' });
        });
        setProjectFiles(byProject);
      });
  }, [clients]);

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
    <>
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
                  const projectCosts     = calcProjectCosts(project);
                  const projectBudget    = Number(project.budget) || 0;
                  const coef             = Number(project.budget_coefficient) || 0;
                  const hasCover         = Boolean(project.cover_url);
                  const borderColor      = STATUS_BORDER[project.status] || STATUS_BORDER.new;

                  return (
                    <div
                      key={project.id}
                      className={s.projectCard}
                      data-status={project.status || 'new'}
                      style={{ borderLeft: `4px solid ${borderColor}` }}
                    >
                      <div className={s.projectHeader}>
                        <div className={s.projectInfo}>

                          {/* Название проекта (крупно) + статус + кнопки фото */}
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

                            {/* Кнопки категорий фото */}
                            {(() => {
                              const photos = projectFiles[project.id] || [];
                              if (!photos.length) return null;
                              const CATS = [
                                { id: 'all',     icon: '📁', label: 'Wszystkie' },
                                { id: 'projekt', icon: '📐', label: 'Projekt'   },
                                { id: 'usterki', icon: '⚠️', label: 'Usterki'  },
                                { id: 'montaz',  icon: '✅', label: 'Montaż'   },
                                { id: 'inne',    icon: '📄', label: 'Inne'     },
                              ];
                              const activeCat = activePhotoTab[project.id] || null;
                              return CATS
                                .filter(cat => cat.id === 'all' || photos.some(p => p.category === cat.id))
                                .map(cat => {
                                  const count = cat.id === 'all' ? photos.length : photos.filter(p => p.category === cat.id).length;
                                  const isActive = activeCat === cat.id;
                                  return (
                                    <button
                                      key={cat.id}
                                      onClick={e => { e.stopPropagation(); setActivePhotoTab(prev => ({ ...prev, [project.id]: isActive ? null : cat.id })); }}
                                      style={{ padding: '1px 6px', borderRadius: '10px', border: '1px solid', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', borderColor: isActive ? '#4da6ff' : 'var(--border)', background: isActive ? 'rgba(77,166,255,0.15)' : 'transparent', color: isActive ? '#4da6ff' : 'var(--text-muted)' }}
                                    >
                                      {cat.icon} {count}
                                    </button>
                                  );
                                });
                            })()}
                          </div>

                          {/* Адрес + дедлайн */}
                          {(project.address || project.deadline) && (
                            <div className={s.metaRow}>
                              {project.address && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`}
                                  target="_blank" rel="noreferrer"
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
                            {projectCosts > 0 && (
                              <span className={s.koszty}>Koszty: {projectCosts.toFixed(2)} zł</span>
                            )}
                            {projectBudget > 0 && (
                              <span className={s.budzet}>
                                Budżet: {projectBudget.toFixed(2)} zł{coef > 0 ? ` (×${coef})` : ''}
                              </span>
                            )}
                          </div>

                          {/* Галерея фото — показывается при нажатии на кнопку категории */}
                          {activePhotoTab[project.id] && (() => {
                            const photos = projectFiles[project.id] || [];
                            const cat    = activePhotoTab[project.id];
                            const visible = cat === 'all' ? photos : photos.filter(p => p.category === cat);
                            if (!visible.length) return null;
                            return (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                {visible.map((photo, idx) => (
                                  <div
                                    key={idx}
                                    onClick={e => { e.stopPropagation(); setLightbox({ projectId: project.id, photos: visible, index: idx }); }}
                                    style={{ width: '52px', height: '52px', borderRadius: '5px', overflow: 'hidden', cursor: 'zoom-in', flexShrink: 0, border: '1px solid var(--border)' }}
                                  >
                                    <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Подпись редактора */}
                          {editor && (
                            <span
                              className={s.editorExpanded}
                              onClick={() => setExpandedProjectId(isProjectExpanded ? null : project.id)}
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

                        {/* Карусель фото проекта */}
                        {(() => {
                          const photos = projectFiles[project.id] || [];
                          const idx = carouselIdx[project.id] || 0;
                          const hasPhotos = photos.length > 0;
                          const currentPhoto = hasPhotos ? photos[idx] : (project.cover_url || null);
                          const total = hasPhotos ? photos.length : (project.cover_url ? 1 : 0);

                          if (!currentPhoto) return (
                            <div className={s.coverPlaceholder} onClick={() => openProjectModal(project)} title="Otwórz projekt">📷</div>
                          );

                          return (
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div className={s.coverThumb} onClick={() => openProjectModal(project)} title="Otwórz projekt">
                                <img src={currentPhoto} alt="foto" />
                              </div>
                              {total > 1 && (
                                <>
                                  <button onClick={e => { e.stopPropagation(); setCarouselIdx(prev => ({ ...prev, [project.id]: (idx - 1 + total) % total })); }}
                                    style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>‹</button>
                                  <button onClick={e => { e.stopPropagation(); setCarouselIdx(prev => ({ ...prev, [project.id]: (idx + 1) % total })); }}
                                    style={{ position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>›</button>
                                  <div style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '3px' }}>
                                    {photos.slice(0, 5).map((_, i) => (
                                      <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: i === idx ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                                        onClick={e => { e.stopPropagation(); setCarouselIdx(prev => ({ ...prev, [project.id]: i })); }} />
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Задачи */}
                      <div className={s.tasksBody}>
                        <div className={s.tasksLabel}>✅ Lista zadań</div>
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
                              {visible.length === 0 && openTasks.length === 0 && doneTasks.length > 0 && (
                                <div className={s.noTasks}>Wszystkie zadania wykonane ✅</div>
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
                        <div className={s.addTaskRow}>
                          <input type="text" placeholder="Wpisz zadanie..."
                            value={newTaskParams[project.id]?.text || ''}
                            onChange={e => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], text: e.target.value } }))}
                            onKeyDown={e => e.key === 'Enter' && handleAddTask(project.id)}
                            className={s.inputTask} />
                          <input type="date"
                            value={newTaskParams[project.id]?.date || ''}
                            onChange={e => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))}
                            className={s.inputDate} />
                          <button className={s.btnAddTask} onClick={() => handleAddTask(project.id)}>+ Dodaj</button>
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
    </div>

    {/* Лайтбокс с навигацией */}
    {lightbox && (() => {
      const { photos, index } = lightbox;
      const total  = photos.length;
      const goPrev = e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: (prev.index - 1 + total) % total })); };
      const goNext = e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: (prev.index + 1) % total })); };
      return (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={photos[index].url} alt="" style={{ maxWidth: '88vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: '6px' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '14px', right: '18px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: '10px' }}>{index + 1} / {total}</div>
          {total > 1 && (<>
            <button onClick={goPrev} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', width: '46px', height: '46px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <button onClick={goNext} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', width: '46px', height: '46px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </>)}
        </div>
      );
    })()}
    </>
  );
};

export default Dashboard;
