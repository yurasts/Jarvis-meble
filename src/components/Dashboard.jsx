import React, { useState } from 'react';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

// Короткий формат даты: "19 cze"
const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

const Dashboard = ({ clients, updateClient, openProjectModal, setIsModalOpen, profilesById = {}, canCreate = true, currentProfile = null }) => {
  const [newTaskParams, setNewTaskParams] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);   // показать подпись задачи
  const [expandedProjectId, setExpandedProjectId] = useState(null); // показать подпись проекта

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
          <h2 style={{ margin: 0, color: '#2d3748', fontSize: '18px' }}>📋 Centrum Dowodzenia ({activeProjects.length})</h2>
          {canCreate && (
            <button onClick={() => setIsModalOpen(true)} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              + Nowy projekt
            </button>
          )}
        </div>

        {activeProjects.length === 0 ? (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#718096' }}>
            Brak aktywnych projektów.
          </div>
        ) : (
          activeProjects.map(project => {
            const editor = project.updated_by ? profilesById[project.updated_by] : null;
            const isProjectExpanded = expandedProjectId === project.id;

            return (
              <div key={project.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #cbd5e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>

                {/* Шапка проекта — компактная */}
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                  {/* Строка 1: имя + статус */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, color: '#2b6cb0', fontSize: '16px', fontWeight: 'bold' }}>{project.full_name}</h3>
                    <span style={{ fontSize: '11px', background: '#edf2f7', color: '#4a5568', padding: '2px 7px', borderRadius: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {project.status || 'Nowe'}
                    </span>
                  </div>

                  {/* Строка 2: адрес → Google Maps */}
                  {project.address && (
                    <div style={{ fontSize: '12px', marginBottom: '3px' }}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: '#3182ce', textDecoration: 'none' }}
                      >
                        📍 {project.address}
                      </a>
                    </div>
                  )}

                  {/* Строка 3: срок */}
                  {project.deadline && (
                    <div style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold', marginBottom: '4px' }}>
                      📅 {shortDate(project.deadline)}
                    </div>
                  )}

                  {/* Подпись редактора — скрыта, показывается по клику */}
                  {editor && (
                    <div
                      onClick={() => setExpandedProjectId(isProjectExpanded ? null : project.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {isProjectExpanded ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: editor.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>
                            {initials(editor.full_name)}
                          </div>
                          <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                            {editor.full_name} • {project.updated_at ? new Date(project.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      ) : (
                        <div style={{ width: '16px', height: '4px', borderRadius: '2px', background: editor.color || '#e2e8f0', marginBottom: '6px' }} />
                      )}
                    </div>
                  )}

                  {/* Кнопка по центру */}
                  <div style={{ textAlign: 'center' }}>
                    <button onClick={() => openProjectModal(project)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                      Otwórz projekt
                    </button>
                  </div>
                </div>

                {/* Список задач */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: '#a0aec0', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.5px' }}>✅ Lista zadań</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                    {(project.tasks || []).length === 0 && (
                      <div style={{ fontSize: '12px', color: '#a0aec0' }}>Brak zadań.</div>
                    )}
                    {(project.tasks || []).map(task => {
                      const taskColor = task.createdByColor || '#718096';
                      const isConfirm = confirmDeleteId === task.id;
                      const isExpanded = expandedTaskId === task.id;

                      return (
                        <div key={task.id} style={{ borderRadius: '5px', border: '1px solid', borderColor: isConfirm ? '#feb2b2' : task.isDone ? '#c6f6d5' : '#e2e8f0', background: isConfirm ? '#fff5f5' : task.isDone ? '#f0fff4' : '#f7fafc', overflow: 'hidden', transition: 'all 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', borderLeft: `3px solid ${taskColor}` }}>
                            {/* Чекбокс */}
                            <input
                              type="checkbox"
                              checked={task.isDone}
                              onChange={() => toggleTaskStatus(project.id, task.id)}
                              style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0, margin: '0 6px' }}
                            />

                            {/* Текст задачи — клик показывает подпись */}
                            <div
                              style={{ flex: 1, padding: '5px 4px', cursor: 'pointer' }}
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            >
                              <span style={{ fontSize: '13px', color: isConfirm ? '#e53e3e' : task.isDone ? '#a0aec0' : '#2d3748', textDecoration: task.isDone ? 'line-through' : 'none' }}>
                                {task.text}
                              </span>
                            </div>

                            {/* Дата — короткий формат, серая */}
                            {task.date && (
                              <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, marginRight: '6px', whiteSpace: 'nowrap' }}>
                                {shortDate(task.date)}
                              </span>
                            )}

                            {/* Кнопка удаления */}
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

                          {/* Подпись автора — только при нажатии */}
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
                      style={{ flex: 1, minWidth: '160px', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e0', fontSize: '12px' }}
                    />
                    <input
                      type="date"
                      value={newTaskParams[project.id]?.date || ''}
                      onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))}
                      style={{ width: '120px', padding: '6px 8px', borderRadius: '5px', border: '1px solid #cbd5e0', fontSize: '12px' }}
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
