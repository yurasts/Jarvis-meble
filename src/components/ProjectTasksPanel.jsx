import { useState } from 'react';
import { nextTaskId } from './dashboardHelpers';
import s from './ProjectTasksPanel.module.css';

const formatTaskDate = (date) => {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return day && month && year ? day + '.' + month : date;
};

const ProjectTasksPanel = ({ tasks = [], onChange, currentProfile = null }) => {
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editDate, setEditDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const openTasks = tasks.filter(task => !task.isDone);
  const doneTasks = tasks.filter(task => task.isDone);

  const addTask = (event) => {
    event.preventDefault();
    const text = newText.trim();
    if (!text) return;
    onChange([
      ...tasks,
      {
        id: nextTaskId(tasks),
        text,
        date: newDate || '',
        isDone: false,
        createdById: currentProfile?.id || null,
        createdByName: currentProfile?.full_name || null,
        createdByColor: currentProfile?.color || '#718096',
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewText('');
    setNewDate('');
  };

  const toggleTask = (taskId) => {
    onChange(tasks.map(task => task.id === taskId ? { ...task, isDone: !task.isDone } : task));
  };

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditText(task.text || '');
    setEditDate(task.date || '');
    setConfirmDeleteId(null);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditText('');
    setEditDate('');
  };

  const saveEditing = () => {
    const text = editText.trim();
    if (!text) return;
    onChange(tasks.map(task => task.id === editingTaskId
      ? { ...task, text, date: editDate || '' }
      : task
    ));
    cancelEditing();
  };

  const deleteTask = (taskId) => {
    onChange(tasks.filter(task => task.id !== taskId));
    setConfirmDeleteId(null);
    if (editingTaskId === taskId) cancelEditing();
  };

  const renderTask = (task) => {
    const isEditing = editingTaskId === task.id;
    const isConfirming = confirmDeleteId === task.id;

    return (
      <div key={task.id} className={s.taskRow + (task.isDone ? ' ' + s.taskDone : '')}>
        <input
          type="checkbox"
          checked={Boolean(task.isDone)}
          onChange={() => toggleTask(task.id)}
          className={s.checkbox}
          aria-label={task.isDone ? 'Oznacz jako niewykonane' : 'Oznacz jako wykonane'}
        />

        {isEditing ? (
          <div className={s.editFields}>
            <input
              autoFocus
              type="text"
              value={editText}
              onChange={event => setEditText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') saveEditing();
                if (event.key === 'Escape') cancelEditing();
              }}
              className={s.textInput}
              aria-label="Treść zadania"
            />
            <input
              type="date"
              value={editDate}
              onChange={event => setEditDate(event.target.value)}
              className={s.dateInput}
              aria-label="Termin zadania"
            />
          </div>
        ) : (
          <button type="button" className={s.taskText} onClick={() => startEditing(task)}>
            {task.text}
          </button>
        )}

        {!isEditing && task.date && (
          <span className={s.dateBadge} title={task.date}>
            {formatTaskDate(task.date)}
          </span>
        )}

        {isConfirming ? (
          <div className={s.confirmActions}>
            <button type="button" className={s.confirmYes} onClick={() => deleteTask(task.id)}>Tak</button>
            <button type="button" className={s.confirmNo} onClick={() => setConfirmDeleteId(null)}>Nie</button>
          </div>
        ) : isEditing ? (
          <div className={s.rowActions}>
            <button type="button" className={s.saveEdit} onClick={saveEditing} aria-label="Zapisz zadanie">✓</button>
            <button type="button" className={s.cancelEdit} onClick={cancelEditing} aria-label="Anuluj edycję">×</button>
          </div>
        ) : (
          <button
            type="button"
            className={s.deleteButton}
            onClick={() => setConfirmDeleteId(task.id)}
            aria-label={'Usuń zadanie: ' + task.text}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <section className={s.panel} aria-label="Zadania projektu">
      <div className={s.header}>
        <div className={s.heading}>
          <h3>Zadania</h3>
          <span>{openTasks.length} do wykonania</span>
        </div>
        {doneTasks.length > 0 && (
          <button type="button" className={s.doneToggle} onClick={() => setShowDone(value => !value)}>
            {showDone ? 'Ukryj' : 'Wykonane'} ({doneTasks.length})
          </button>
        )}
      </div>

      <form className={s.addForm} onSubmit={addTask}>
        <input
          type="text"
          value={newText}
          onChange={event => setNewText(event.target.value)}
          placeholder="Nowe zadanie, np. kupić silikon…"
          className={s.textInput}
          aria-label="Nowe zadanie"
        />
        <input
          type="date"
          value={newDate}
          onChange={event => setNewDate(event.target.value)}
          className={s.dateInput}
          aria-label="Termin (opcjonalnie)"
        />
        <button type="submit" className={s.addButton} disabled={!newText.trim()}>
          <span aria-hidden="true">+</span> <span className={s.addLabel}>Dodaj</span>
        </button>
      </form>

      <div className={s.list}>
        {openTasks.length === 0 ? (
          <div className={s.empty}>Brak zadań do wykonania.</div>
        ) : openTasks.map(renderTask)}
      </div>

      {showDone && doneTasks.length > 0 && (
        <div className={s.doneList}>
          {doneTasks.map(renderTask)}
        </div>
      )}
    </section>
  );
};

export default ProjectTasksPanel;
