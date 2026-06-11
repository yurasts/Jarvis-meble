import React, { useState } from 'react';

const Dashboard = ({ clients, updateClient, openProjectModal }) => {
  // Временная база поставщиков (позже можно вынести в базу данных Supabase)
  const [suppliers, setSuppliers] = useState([
    { id: 1, name: 'Hurtownia "Strefa Płyt"', category: 'Płyty i Blaty', phone: '+48 500 111 222', hours: '08:00 - 16:00', address: 'ul. Stolarska 12, Gdańsk', notes: 'Rabat 10% na płyty Egger. Pytaj o p. Tomasza.' },
    { id: 2, name: 'Hurtownia Akcesoriów', category: 'Okucia (Blum/Hettich)', phone: '+48 600 333 444', hours: '07:30 - 15:30', address: 'ul. Magazynowa 5, Gdynia', notes: 'Darmowa dostawa powyżej 1500 PLN.' },
    { id: 3, name: 'Usługi Szklarskie', category: 'Szkło / Lustra', phone: '+48 700 555 666', hours: '09:00 - 17:00', address: 'ul. Szklana 8, Sopot', notes: 'Czas realizacji ok. 7 dni roboczych.' }
  ]);

  // Состояние для новых задач (чтобы вводить текст и дату для каждого проекта отдельно)
  const [newTaskParams, setNewTaskParams] = useState({});

  // Фильтруем только активные проекты (исключаем "Zrealizowane" или пустые)
  const activeProjects = (clients || []).filter(c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone');

  // Добавление новой задачи в проект
  const handleAddTask = (clientId) => {
    const params = newTaskParams[clientId];
    if (!params || !params.text) return;

    const project = activeProjects.find(c => c.id === clientId);
    const newTask = {
      id: Date.now(),
      text: params.text,
      date: params.date || '',
      isDone: false
    };

    const updatedTasks = [...(project.tasks || []), newTask];
    updateClient(clientId, { tasks: updatedTasks });

    // Очищаем инпуты после добавления
    setNewTaskParams(prev => ({ ...prev, [clientId]: { text: '', date: '' } }));
  };

  // Переключение статуса задачи (выполнено/не выполнено)
  const toggleTaskStatus = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    const updatedTasks = (project.tasks || []).map(t => 
      t.id === taskId ? { ...t, isDone: !t.isDone } : t
    );
    updateClient(clientId, { tasks: updatedTasks });
  };

  // Удаление задачи
  const deleteTask = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    const updatedTasks = (project.tasks || []).filter(t => t.id !== taskId);
    updateClient(clientId, { tasks: updatedTasks });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '25px', alignItems: 'start' }}>
      
      {/* ЛЕВАЯ КОЛОНКА: АКТИВНЫЕ ПРОЕКТЫ И ЗАДАЧИ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ margin: 0, color: '#2d3748', fontSize: '20px' }}>📋 Operacyjne Centrum Dowodzenia ({activeProjects.length})</h2>
        
        {activeProjects.length === 0 ? (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#718096' }}>
            Brak aktywnych projektów w tej chwili.
          </div>
        ) : (
          activeProjects.map(project => (
            <div key={project.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #cbd5e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              
              {/* Шапка проекта */}
              <div style={{ background: '#f8fafc', padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: '0 0 5px 0', color: '#2b6cb0', fontSize: '18px' }}>{project.full_name}</h3>
                  <div style={{ fontSize: '13px', color: '#4a5568' }}>📍 {project.address || 'Brak adresu'}</div>
                </div>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div style={{ color: '#718096' }}>Status: <strong style={{ color: '#2d3748' }}>{project.status || 'Nowe'}</strong></div>
                    <div style={{ color: '#e53e3e', fontWeight: 'bold' }}>Termin: {project.deadline || 'Nieustalony'}</div>
                  </div>
                  <button onClick={() => openProjectModal(project)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                    Otwórz projekt
                  </button>
                </div>
              </div>

              {/* Чек-лист задач */}
              <div style={{ padding: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4a5568', textTransform: 'uppercase' }}>✅ Lista zadań</h4>
                
                {/* Список существующих задач */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  {(project.tasks || []).length === 0 && <div style={{ fontSize: '13px', color: '#a0aec0' }}>Brak zaplanowanych zadań.</div>}
                  
                  {(project.tasks || []).map(task => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: task.isDone ? '#f0fff4' : '#edf2f7', padding: '8px 12px', borderRadius: '6px', border: '1px solid', borderColor: task.isDone ? '#c6f6d5' : '#e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={task.isDone} onChange={() => toggleTaskStatus(project.id, task.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        <span style={{ fontSize: '14px', color: task.isDone ? '#a0aec0' : '#2d3748', textDecoration: task.isDone ? 'line-through' : 'none' }}>
                          {task.text}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {task.date && <span style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', borderRadius: '4px', color: '#e53e3e', fontWeight: 'bold', border: '1px solid #fed7d7' }}>⏳ {task.date}</span>}
                        <button onClick={() => deleteTask(project.id, task.id)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', padding: '0', fontSize: '16px' }} title="Usuń zadanie">✖</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Добавление новой задачи */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    placeholder="Wpisz zadanie (np. Zrobić pomiar, Kupić silikon)..." 
                    value={newTaskParams[project.id]?.text || ''}
                    onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], text: e.target.value } }))}
                    style={{ flex: 1, minWidth: '200px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }}
                  />
                  <input 
                    type="date" 
                    value={newTaskParams[project.id]?.date || ''}
                    onChange={(e) => setNewTaskParams(prev => ({ ...prev, [project.id]: { ...prev[project.id], date: e.target.value } }))}
                    style={{ width: '130px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }}
                  />
                  <button onClick={() => handleAddTask(project.id)} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                    + Dodaj
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ПРАВАЯ КОЛОНКА: ПОСТАВЩИКИ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#2d3748', fontSize: '20px' }}>🏭 Baza Dostawców</h2>
        </div>

        {suppliers.map(supplier => (
          <div key={supplier.id} style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>{supplier.name}</h3>
              <span style={{ fontSize: '11px', background: '#edf2f7', color: '#4a5568', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{supplier.category}</span>
            </div>
            
            <div style={{ fontSize: '13px', color: '#4a5568', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>📞 <a href={`tel:${supplier.phone}`} style={{ color: '#3182ce', textDecoration: 'none', fontWeight: 'bold' }}>{supplier.phone}</a></div>
              <div>🕒 {supplier.hours}</div>
              <div>📍 <a href={`https://maps.google.com/?q=${encodeURIComponent(supplier.address)}`} target="_blank" rel="noreferrer" style={{ color: '#3182ce', textDecoration: 'none' }}>{supplier.address}</a></div>
            </div>

            {supplier.notes && (
              <div style={{ marginTop: '10px', padding: '8px', background: '#fffff0', border: '1px solid #fefcbf', borderRadius: '6px', fontSize: '12px', color: '#744210' }}>
                💡 <strong>Notatka:</strong> {supplier.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Медиазапрос для мобильных в инлайн-стиле (костыль для React, лучше вынести в CSS, но для начала сойдет) */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;