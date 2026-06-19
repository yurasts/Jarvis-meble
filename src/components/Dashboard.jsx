import React, { useState } from 'react';

// Инициалы из имени — "Jan Kowalski" → "JK"
const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const Dashboard = ({ clients, updateClient, openProjectModal, setIsModalOpen, profilesById = {}, canCreate = true, currentProfile = null }) => {
  const [newTaskParams, setNewTaskParams] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  
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
    const updatedTasks = [...(project.tasks || []), newTask];
    updateClient(clientId, { tasks: updatedTasks });
    setNewTaskParams(prev => ({ ...prev, [clientId]: { text: '', date: '' } }));
  };

  const toggleTaskStatus = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    const updatedTasks = (project.tasks || []).map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t);
    updateClient(clientId, { tasks: updatedTasks });
  };

  const deleteTask = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    const updatedTasks = (project.tasks || []).filter(t => t.id !== taskId);
    updateClient(clientId, { tasks: updatedTasks });
    setConfirmDeleteId(null);
  };

  const renderSignature = (project) => {
    if (!project.updated_by) return null;
    const editor = profilesById[project.updated_by];
    const color = editor?.color || '#718096';
    const when = project.updated_at ? new Date(project.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '9px', fontWeight: 'bold', flexShrink: 0 }}>
          {initials(editor?.full_name)}
        </div>
        <span style={{ fontSize: '11px', color: '#a0aec0' }}>{editor?.full_name || '?'} • {when}</span>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#2d3748', fontSize: '20px' }}>📋 Operacyjne Centrum Dowodzenia ({activeProjects.length})</h2>
          {canCreate && (
            <button onClick={() => setIsModalOpen(true)} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              + Nowy projekt
            </button>
          )}
        </div>
        
        {activeProjects.length === 0 ? (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#718096' }}>
            Brak aktywnych projektów w tej chwili.
          </div>
        ) : (
          activeProjects.map(project => (
            <div key={project.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #cbd5e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: '0 0 5px 0', color: '#2b6cb0', fontSize: '18px' }}>{project.full_name}</h3>
                  <div style={{ fontSize: '13px', color: '#4a5568' }}>📍 {project.address || 'Brak adresu'}</div>
                  {renderSignature(project)}
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div style={{ color: '#718096' }}>Status: <strong style={{ color: '#2d3748' }}>{project.status || 'Nowe'}</strong></div>
                    <div style={{ color: '#e53e3e', fontWeight: 'bold' }}>Termin: {project.deadline || 'Nieustalony'}</div>
                  </div>
                  <button onClick={() => openProjectModal(project)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Otwórz projekt</button>
                </div>
              </div>

              <div style={{ padding: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4a5568', textTransform: 'uppercase' }}>✅ Lista zadań</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  {(project.tasks || []).length === 0 && <div style={{ fontSize: '13px', color: '#a0aec0' }}>Brak zaplanowanych zadań.</div>}
                  {(project.tasks || []).map(task => {
                    const taskColor = task.createdByColor || '#718096';
                    const isConfirm = confirmDeleteId === task.id;
                    return (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isConfirm ? '#fff5f5' : task.isDone ? '#f0fff4' : '#edf2f7', borderRadius: '6px', border: '1px solid', borderColor: isConfirm ? '#feb2b2' : task.isDone ? '#c6f6d5' : '#e2e8f0', overflow: 'hidden', transition: 'all 0.2s' }}>
                        {/* Цветная полоска слева — фирменный цвет автора */}
                        <div style={{ width: '4px', alignSelf: 'stretch', background: taskColor, flexShrink: 0 }} />
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, padding: '8px 10px' }}>
                          <input type="checkbox" checked={task.isDone} onChange={() => toggleTaskStatus(project.id, task.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
                          <div>
                            <span style={{ fontSize: '14px', color: isConfirm ? '#e53e3e' : task.isDone ? '#a0aec0' : '#2d3748', textDecoration: task.isDone ? 'line-through' : 'none' }}>
                              {task.text}
                            </span>
                            {task.createdByName && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: taskColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>
                                  {initials(task.createdByName)}
                                </div>
                                <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                                  {task.createdByName}{task.createdAt ? ' • ' + new Date(task.createdAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, paddingRight: '10px' }}>
                          {task.date && <span style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', borderRadius: '4px', color: '#e53e3e', fontWeight: 'bold', border: '1px solid #fed7d7' }}>⏳ {task.date}</span>}
                          {isConfirm ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold', marginRight: '4px' }}>Usunąć?</span>
                              <button onClick={() => deleteTask(project.id, task.id)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Tak</button>
                              <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Nie</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(task.id)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', padding: '0', fontSize: '16px', lineHeight: 1, transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color='#fc8181'} onMouseLeave={e => e.target.style.color='#cbd5e0'} title="Usuń zadanie">✖</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Wpisz zadanie..." value={newTaskParams[project.id]?.text || ''} onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], text: e.target.value } }))} style={{ flex: 1, minWidth: '200px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }} />
                  <input type="date" value={newTaskParams[project.id]?.date || ''} onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))} style={{ width: '130px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }} />
                  <button onClick={() => handleAddTask(project.id)} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>+ Dodaj</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
