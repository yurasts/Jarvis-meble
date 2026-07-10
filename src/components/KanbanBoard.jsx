import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import s from './KanbanBoard.module.css';

const STATUS_COLOR = {
  new:        '#ef4444',
  design:     '#f59e0b',
  production: '#eab308',
  done:       '#22c55e',
};

const STATUSES = ['new', 'design', 'production', 'done'];
const TITLES   = ['Nowe', 'Projektowanie / 3D', 'W produkcji', 'Montaż / Gotowe'];

const MAX_TASKS_SHOWN = 4;

// Бейдж срока — компактный, только если срок задан
const DeadlineBadge = ({ dateString, status }) => {
  if (!dateString) return null;
  if (status === 'done') {
    return <span className={`${s.deadlineBadge} ${s.deadlineGreen}`}>🟢 {dateString}</span>;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(dateString) - today) / 86400000);
  if (diff < 0)  return <span className={`${s.deadlineBadge} ${s.deadlineRed}`}>🔴 Opóźnienie</span>;
  if (diff === 0) return <span className={`${s.deadlineBadge} ${s.deadlineYellow}`}>🟡 Dziś</span>;
  if (diff === 1) return <span className={`${s.deadlineBadge} ${s.deadlineYellow}`}>🟡 Jutro</span>;
  return <span className={`${s.deadlineBadge} ${s.deadlineGreen}`}>🟢 {dateString}</span>;
};

export default function KanbanBoard({
  clients,
  setActiveClient,
  handleDragStart,
  handleDragOver,
  handleDrop,
  updateClient,
  profilesById = {},
  scopeView,
  setScopeView,
}) {
  const [fileCounts, setFileCounts] = useState({}); // { [clientId]: totalCount }
  const [addingTaskFor, setAddingTaskFor] = useState(null); // client.id | null
  const [newTaskText, setNewTaskText] = useState('');

  const effectiveScope = scopeView || 'firma';
  const scopedClients = clients.filter(c => (c.project_scope || 'firma') === effectiveScope);

  useEffect(() => {
    const loadFileCounts = async () => {
      const { data } = await supabase.from('project_files').select('client_id');
      if (!data) return;
      const counts = {};
      data.forEach(f => { counts[f.client_id] = (counts[f.client_id] || 0) + 1; });
      setFileCounts(counts);
    };
    loadFileCounts();
  }, []);

  const getByStatus = (status) => scopedClients.filter(c => c.status === status);

  const toggleTask = (e, client, taskId) => {
    e.stopPropagation();
    if (!updateClient) return;
    updateClient(client.id, {
      tasks: (client.tasks || []).map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t),
    });
  };

  const startAddTask = (e, clientId) => {
    e.stopPropagation();
    setAddingTaskFor(clientId);
    setNewTaskText('');
  };

  const submitAddTask = (client) => {
    if (!newTaskText.trim() || !updateClient) { setAddingTaskFor(null); return; }
    const newTask = { id: Date.now(), text: newTaskText.trim(), isDone: false, date: '' };
    updateClient(client.id, { tasks: [...(client.tasks || []), newTask] });
    setAddingTaskFor(null);
    setNewTaskText('');
  };

  return (
    <>
      <h1 className={s.pageTitle}>Projekty</h1>

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

      <div className="kanban-board">
        {STATUSES.map((status, index) => (
          <div
            key={status}
            className="kanban-column"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <h3 className={s.columnTitle}>
              {TITLES[index]} <span className={s.columnCount}>{getByStatus(status).length}</span>
            </h3>

            {getByStatus(status).map(client => {
              const allTasks  = client.tasks || [];
              const openTasks = allTasks.filter(t => !t.isDone);
              const shownTasks = openTasks.slice(0, MAX_TASKS_SHOWN);
              const moreCount = openTasks.length - shownTasks.length;
              const fileCount = fileCounts[client.id] || 0;
              const materialCount = (client.calc_materials || []).length;
              const isAdding = addingTaskFor === client.id;

              return (
                <div
                  key={client.id}
                  className="client-card"
                  style={{ borderLeft: `3px solid ${STATUS_COLOR[client.status] || STATUS_COLOR.new}` }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, client.id)}
                  onClick={() => setActiveClient(client)}
                >
                  <div className={s.cardHeader}>
                    <span className={s.cardName}>{client.client_name || client.full_name}</span>
                  </div>
                  {client.project_name && (
                    <div className={s.cardProject}>{client.project_name}</div>
                  )}

                  <DeadlineBadge dateString={client.deadline} status={client.status} />

                  {allTasks.length > 0 && (
                    <div className={s.tasksLabel}>ZADANIA ({allTasks.length})</div>
                  )}

                  {shownTasks.length > 0 && (
                    <div className={s.taskPreviewList}>
                      {shownTasks.map(task => (
                        <label key={task.id} className={s.taskPreviewRow} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={task.isDone}
                            onChange={(e) => toggleTask(e, client, task.id)}
                            className={s.taskPreviewCheckbox}
                          />
                          <span className={s.taskPreviewText}>{task.text}</span>
                        </label>
                      ))}
                      {moreCount > 0 && (
                        <div className={s.taskMore}>+{moreCount} więcej...</div>
                      )}
                    </div>
                  )}

                  {isAdding ? (
                    <input
                      autoFocus
                      value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => e.key === 'Enter' && submitAddTask(client)}
                      onBlur={() => submitAddTask(client)}
                      placeholder="Wpisz zadanie..."
                      className={s.addTaskInput}
                    />
                  ) : (
                    <div className={s.addTaskLink} onClick={(e) => startAddTask(e, client.id)}>
                      + Dodaj zadanie
                    </div>
                  )}

                  {(fileCount > 0 || materialCount > 0) && (
                    <div className={s.cardFooter}>
                      {fileCount > 0 && <span className={s.footerBadge}>📎 {fileCount}</span>}
                      {materialCount > 0 && <span className={s.footerBadge}>🧱 {materialCount}</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {getByStatus(status).length === 0 && (
              <div className={s.emptyColumn}>
                <div className={s.emptyIcon}>▦</div>
                <div className={s.emptyTitle}>Brak projektów</div>
                <div className={s.emptyHint}>Przeciągnij projekt tutaj</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
