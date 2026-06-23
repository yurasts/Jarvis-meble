import React, { useState } from 'react';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

// ✅ Считаем суммарные затраты из calc_* полей проекта
const calcProjectCosts = (project) => {
  const mats = (project.calc_materials || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
  const srvs = (project.calc_services  || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
  const exps = (project.calc_expenses  || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
  return mats + srvs + exps;
};

const Dashboard = ({ clients, updateClient, openProjectModal, setIsModalOpen, profilesById = {}, canCreate = true, currentProfile = null, isDark = false }) => {
  const c = (light, dark) => isDark ? dark : light;
  const bg = c('#fff', '#1e293b');
  const bgHeader = c('#f8fafc', '#162032');
  const bgTask = c('#f7fafc', '#1a2535');
  const bgTaskDone = c('#f0fff4', '#162a1e');
  const text = c('#2d3748', '#e2e8f0');
  const textLight = c('#4a5568', '#94a3b8');
  const border = c('#e2e8f0', '#334155');
  const borderDone = c('#c6f6d5', '#1a4a2e');
  const [newTaskParams, setNewTaskParams] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [expandedProjectId, setExpandedProjectId] = useState(null);

  const activeProjects = (clients || []).filter(c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone');

  const handleAddTask = (clientId) => {
    const params = newTaskParams[clientId];
    if (!params || !params.text) return;
    const project = activeProjects.find(c => c.id === clientId);
    const newTask = {
      id: Date.now(),
      text: params.text,
      date: params.date || '',
      isDone: false,
      createdById: currentProfile?.id || null,
      createdByName: currentProfile?.full_name || null,
      createdByColor: currentProfile?.color || '#718096',
      createdAt: new Date().toISOString()
    };
    updateClient(clientId, { tasks: [...(project.tasks || []), newTask] });
    setNewTaskParams(prev => ({ ...prev, [clientId]: { text: '', date: '' } }));
  };

  const toggleTaskStatus = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, { tasks: (project.tasks || []).map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t) });
  };

  const deleteTask = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, { tasks: (project.tasks || []).filter(t => t.id !== taskId) });
    setConfirmDeleteId(null);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Заголовок */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: text, fontSize: '18px' }}>📋 Centrum Dowodzenia ({activeProjects.length})</h2>
          {canCreate && (
            <button onClick={() => setIsModalOpen(true)} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              + Nowy projekt
            </button>
          )}
        </div>

        {activeProjects.length === 0 ? (
          <div style={{ background: bg, padding: '20px', borderRadius: '8px', border: `1px solid ${border}`, color: textLight }}>
            Brak aktywnych projektów.
          </div>
        ) : (
          activeProjects.map(project => {
            const editor = project.updated_by ? profilesById[project.updated_by] : null;
            const isProjectExpanded = expandedProjectId === project.id;

            // ✅ Считаем затраты и бюджет для отображения на Dashboard
            const projectCosts = calcProjectCosts(project);
            const coef = Number(project.budget_coefficient) || 0;
            const projectBudget = Number(project.budget) || 0;
            const hasCosts = projectCosts > 0;
            const hasBudget = projectBudget > 0;

            return (
              <div key={project.id} style={{ background: bg, borderRadius: '10px', border: `1px solid ${border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>

                {/* Шапка проекта */}
                <div style={{ background: bgHeader, padding: '10px 14px', borderBottom: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>

                    {/* Левая часть: имя + адрес + дедлайн + финансы */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <h3 style={{ margin: 0, color: '#4da6ff', fontSize: '15px', fontWeight: 'bold' }}>{project.full_name}</h3>
                        <span style={{ fontSize: '11px', background: c('#edf2f7', '#253347'), color: textLight, padding: '2px 7px', borderRadius: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          {project.status || 'Nowe'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {project.address && (
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`}
                            target="_blank" rel="noreferrer"
                            style={{ color: '#3182ce', textDecoration: 'none', fontSize: '12px' }}>
                            📍 {project.address}
                          </a>
                        )}
                        {project.deadline && (
                          <span style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold' }}>
                            📅 {shortDate(project.deadline)}
                          </span>
                        )}

                        {/* ✅ Koszty i Budżet */}
                        {hasCosts && (
                          <span style={{ fontSize: '12px', color: c('#c53030', '#fc8181'), fontWeight: 'bold' }}>
                            Koszty: {projectCosts.toFixed(2)} zł
                          </span>
                        )}
                        {hasBudget && (
                          <span style={{ fontSize: '12px', background: c('#ebf8ff', '#1e3a5f'), color: c('#2b6cb0', '#63b3ed'), border: `1px solid ${c('#bee3f8', '#2c5282')}`, borderRadius: '5px', padding: '1px 7px', fontWeight: 'bold' }}>
                            Budżet: {projectBudget.toFixed(2)} zł{coef > 0 ? ` (×${coef})` : ''}
                          </span>
                        )}

                        {/* Подпись редактора */}
                        {editor && (
                          <span
                            onClick={() => setExpandedProjectId(isProjectExpanded ? null : project.id)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Kliknij aby zobaczyć kto edytował"
                          >
                            {isProjectExpanded ? (
                              <>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: editor.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>
                                  {initials(editor.full_name)}
                                </div>
                                <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                                  {editor.full_name} • {project.updated_at ? new Date(project.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </>
                            ) : (
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: editor.color || '#cbd5e0' }} />
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Кнопка */}
                    <button onClick={() => openProjectModal(project)}
                      style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Otwórz projekt
                    </button>
                  </div>
                </div>

                {/* Список задач */}
                <div style={{ padding: '10px 12px', background: bg }}>
                  <div style={{ fontSize: '11px', color: textLight, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.5px' }}>✅ Lista zadań</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                    {(project.tasks || []).length === 0 && (
                      <div style={{ fontSize: '12px', color: '#a0aec0' }}>Brak zadań.</div>
                    )}
                    {(project.tasks || []).map(task => {
                      const taskColor = task.createdByColor || '#718096';
                      const isConfirm = confirmDeleteId === task.id;
                      const isExpanded = expandedTaskId === task.id;

                      return (
                        <div key={task.id} style={{ borderRadius: '5px', border: '1px solid', borderColor: isConfirm ? c('#feb2b2', '#7b2020') : task.isDone ? borderDone : border, background: isConfirm ? c('#fff5f5', '#2d1515') : task.isDone ? bgTaskDone : bgTask, overflow: 'hidden', transition: 'all 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', borderLeft: `3px solid ${taskColor}` }}>
                            <input
                              type="checkbox"
                              checked={task.isDone}
                              onChange={() => toggleTaskStatus(project.id, task.id)}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0, margin: '0 6px' }}
                            />
                            <div
                              style={{ flex: 1, padding: '5px 4px', cursor: 'pointer' }}
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            >
                              <span style={{ fontSize: '13px', color: isConfirm ? '#fc8181' : task.isDone ? c('#a0aec0', '#64748b') : text, textDecoration: task.isDone ? 'line-through' : 'none' }}>
                                {task.text}
                              </span>
                            </div>
                            {task.date && (
                              <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, marginRight: '6px', whiteSpace: 'nowrap' }}>
                                {shortDate(task.date)}
                              </span>
                            )}
                            {isConfirm ? (
                              <div style={{ display: 'flex', gap: '3px', flexShrink: 0, paddingRight: '6px' }}>
                                <button onClick={() => deleteTask(project.id, task.id)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Tak</button>
                                <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(task.id)}
                                style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', padding: '0 8px', fontSize: '14px', flexShrink: 0, lineHeight: 1 }}
                                onMouseEnter={e => e.target.style.color = '#fc8181'}
                                onMouseLeave={e => e.target.style.color = '#cbd5e0'}
                              >✖</button>
                            )}
                          </div>

                          {isExpanded && task.createdByName && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 6px 4px 23px', borderTop: '1px dashed #e2e8f0' }}>
                              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: taskColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '7px', fontWeight: 'bold' }}>
                                {initials(task.createdByName)}
                              </div>
                              <span style={{ fontSize: '10px', color: '#a0aec0' }}>
                                {task.createdByName}{task.createdAt ? ' • ' + new Date(task.createdAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Добавить задачу */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Wpisz zadanie..."
                      value={newTaskParams[project.id]?.text || ''}
                      onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], text: e.target.value } }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTask(project.id)}
                      style={{ flex: 1, minWidth: '160px', padding: '6px 8px', borderRadius: '5px', border: `1px solid ${border}`, fontSize: '12px', background: c('#fff', '#0f172a'), color: text }}
                    />
                    <input
                      type="date"
                      value={newTaskParams[project.id]?.date || ''}
                      onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))}
                      style={{ width: '120px', padding: '6px 8px', borderRadius: '5px', border: `1px solid ${border}`, fontSize: '12px', background: c('#fff', '#0f172a'), color: text }}
                    />
                    <button
                      onClick={() => handleAddTask(project.id)}
                      style={{ background: '#38a169', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                    >+ Dodaj</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Dashboard;
