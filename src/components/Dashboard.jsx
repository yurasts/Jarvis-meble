import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const Dashboard = ({ clients, updateClient, openProjectModal, setIsModalOpen }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [newTaskParams, setNewTaskParams] = useState({});
  
  // Состояния для модального окна поставщиков
  const [isSupModalOpen, setIsSupModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supForm, setSupForm] = useState({ name: '', category: 'Płyty i Blaty', phone: '', hours: '', address: '', notes: '' });

  // Загружаем поставщиков при открытии дашборда
  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    if (data) setSuppliers(data);
  }

  const activeProjects = (clients || []).filter(c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone');

  // --- ЛОГИКА ЗАДАЧ (Осталась без изменений) ---
  const handleAddTask = (clientId) => {
    const params = newTaskParams[clientId];
    if (!params || !params.text) return;
    const project = activeProjects.find(c => c.id === clientId);
    const newTask = { id: Date.now(), text: params.text, date: params.date || '', isDone: false };
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
  };

  // --- ЛОГИКА ПОСТАВЩИКОВ ---
  const openAddModal = () => {
    setEditingSupplierId(null);
    setSupForm({ name: '', category: 'Płyty i Blaty', phone: '', hours: '', address: '', notes: '' });
    setIsSupModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplierId(supplier.id);
    setSupForm({
      name: supplier.name || '',
      category: supplier.category || 'Inne',
      phone: supplier.phone || '',
      hours: supplier.hours || '',
      address: supplier.address || '',
      notes: supplier.notes || ''
    });
    setIsSupModalOpen(true);
  };

const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (editingSupplierId) {
      // Обновление существующего
      const { data, error } = await supabase.from('suppliers').update(supForm).eq('id', editingSupplierId).select();
      
      if (error) {
        alert("Błąd aktualizacji: " + error.message); // Показываем ошибку!
        console.error(error);
        return;
      }
      
      if (data) setSuppliers(suppliers.map(s => s.id === editingSupplierId ? data[0] : s));
    } else {
      // Создание нового
      const { data, error } = await supabase.from('suppliers').insert([supForm]).select();
      
      if (error) {
        alert("Błąd zapisu: " + error.message); // Показываем ошибку!
        console.error(error);
        return;
      }
      
      if (data) setSuppliers([...suppliers, data[0]]);
    }
    setIsSupModalOpen(false);
  };

  const handleDeleteSupplier = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tego dostawcę z bazy?')) {
      await supabase.from('suppliers').delete().eq('id', id);
      setSuppliers(suppliers.filter(s => s.id !== id));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '25px', alignItems: 'start' }}>
      
      {/* ЛЕВАЯ КОЛОНКА: АКТИВНЫЕ ПРОЕКТЫ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#2d3748', fontSize: '20px' }}>📋 Operacyjne Centrum Dowodzenia ({activeProjects.length})</h2>
          <button onClick={() => setIsModalOpen(true)} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            + Nowy projekt
          </button>
        </div>
        {activeProjects.length === 0 ? (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#718096' }}>Brak aktywnych projektów w tej chwili.</div>
        ) : (
          activeProjects.map(project => (
            <div key={project.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #cbd5e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
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
                  <button onClick={() => openProjectModal(project)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Otwórz projekt</button>
                </div>
              </div>

              <div style={{ padding: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4a5568', textTransform: 'uppercase' }}>✅ Lista zadań</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                  {(project.tasks || []).length === 0 && <div style={{ fontSize: '13px', color: '#a0aec0' }}>Brak zaplanowanych zadań.</div>}
                  {(project.tasks || []).map(task => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: task.isDone ? '#f0fff4' : '#edf2f7', padding: '8px 12px', borderRadius: '6px', border: '1px solid', borderColor: task.isDone ? '#c6f6d5' : '#e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={task.isDone} onChange={() => toggleTaskStatus(project.id, task.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        <span style={{ fontSize: '14px', color: task.isDone ? '#a0aec0' : '#2d3748', textDecoration: task.isDone ? 'line-through' : 'none' }}>{task.text}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {task.date && <span style={{ fontSize: '12px', background: '#fff', padding: '2px 6px', borderRadius: '4px', color: '#e53e3e', fontWeight: 'bold', border: '1px solid #fed7d7' }}>⏳ {task.date}</span>}
                        <button onClick={() => deleteTask(project.id, task.id)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', padding: '0', fontSize: '16px' }} title="Usuń">✖</button>
                      </div>
                    </div>
                  ))}
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

      {/* ПРАВАЯ КОЛОНКА: ПОСТАВЩИКИ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#2d3748', fontSize: '20px' }}>🏭 Baza Dostawców</h2>
          <button onClick={openAddModal} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>+ Nowy</button>
        </div>

        {suppliers.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#a0aec0', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px dashed #cbd5e0' }}>Brak dostawców w bazie.</div>
        ) : (
          suppliers.map(supplier => (
            <div key={supplier.id} style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                <button onClick={() => openEditModal(supplier)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Edytuj">✏️</button>
                <button onClick={() => handleDeleteSupplier(supplier.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Usuń">🗑️</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingRight: '40px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>{supplier.name}</h3>
              </div>
              <div style={{ marginBottom: '8px' }}><span style={{ fontSize: '11px', background: '#edf2f7', color: '#4a5568', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{supplier.category}</span></div>
              
              <div style={{ fontSize: '13px', color: '#4a5568', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {supplier.phone && <div>📞 <a href={`tel:${supplier.phone}`} style={{ color: '#3182ce', textDecoration: 'none', fontWeight: 'bold' }}>{supplier.phone}</a></div>}
                {supplier.hours && <div>🕒 {supplier.hours}</div>}
                {supplier.address && <div>📍 <a href={`https://maps.google.com/?q=$${encodeURIComponent(supplier.address)}`} target="_blank" rel="noreferrer" style={{ color: '#3182ce', textDecoration: 'none' }}>{supplier.address}</a></div>}
              </div>

              {supplier.notes && (
                <div style={{ marginTop: '10px', padding: '8px', background: '#fffff0', border: '1px solid #fefcbf', borderRadius: '6px', fontSize: '12px', color: '#744210' }}>
                  💡 {supplier.notes}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ/РЕДАКТИРОВАНИЯ ПОСТАВЩИКА */}
      {isSupModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '15px' }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#2d3748' }}>{editingSupplierId ? 'Edytuj dostawcę' : 'Nowy dostawca'}</h2>
            
            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Nazwa (Firma)</label>
                <input required type="text" value={supForm.name} onChange={e => setSupForm({...supForm, name: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Kategoria</label>
                <select value={supForm.category} onChange={e => setSupForm({...supForm, category: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }}>
                  <option value="Płyty i Blaty">Płyty i Blaty</option>
                  <option value="Okucia i Akcesoria">Okucia i Akcesoria</option>
                  <option value="Szklarz / Lustra">Szklarz / Lustra</option>
                  <option value="Lakiernia">Lakiernia</option>
                  <option value="Kamieniarz (Blaty)">Kamieniarz (Blaty)</option>
                  <option value="Inne">Inne</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Telefon</label>
                <input type="text" value={supForm.phone} onChange={e => setSupForm({...supForm, phone: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} placeholder="np. +48 500 123 456" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Godziny otwarcia</label>
                <input type="text" value={supForm.hours} onChange={e => setSupForm({...supForm, hours: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} placeholder="np. Pn-Pt 08:00 - 16:00" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Adres</label>
                <input type="text" value={supForm.address} onChange={e => setSupForm({...supForm, address: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Dodatkowe notatki</label>
                <textarea value={supForm.notes} onChange={e => setSupForm({...supForm, notes: e.target.value})} rows="3" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Osoba kontaktowa, rabaty..."></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsSupModalOpen(false)} style={{ background: '#edf2f7', color: '#4a5568', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Anuluj</button>
                <button type="submit" style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Zapisz</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;