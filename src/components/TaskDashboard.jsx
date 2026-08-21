import { useEffect, useMemo, useState } from 'react';
import s from './TaskDashboard.module.css';

const taskKey = (projectId, taskId) => `${projectId}:${taskId}`;
const taskDomId = (projectId, taskId) => `task-${projectId}-${taskId}`;

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dueState = (value, isDone) => {
  if (!value || isDone) return '';
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return s.dateOverdue;
  if (due.getTime() === today.getTime()) return s.dateToday;
  return '';
};

export default function TaskDashboard({
  clients = [],
  updateClient,
  openProjectModal,
  focusTarget,
  onFocusHandled,
  scopeView,
}) {
  const [editingKey, setEditingKey] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);

  const effectiveScope = scopeView || 'firma';
  const projects = useMemo(
    () => clients.filter((client) => (client.project_scope || 'firma') === effectiveScope),
    [clients, effectiveScope],
  );

  const rows = useMemo(() => {
    const flattened = projects.flatMap((project, projectIndex) =>
      (project.tasks || []).map((task, taskIndex) => ({
        project,
        projectIndex,
        task,
        taskIndex,
        key: taskKey(project.id, task.id ?? taskIndex),
      })),
    );

    return flattened.sort((a, b) => {
      if (a.task.isDone !== b.task.isDone) return a.task.isDone ? 1 : -1;
      if (a.task.date && b.task.date && a.task.date !== b.task.date) return a.task.date.localeCompare(b.task.date);
      if (a.task.date !== b.task.date) return a.task.date ? -1 : 1;
      if (a.projectIndex !== b.projectIndex) return a.projectIndex - b.projectIndex;
      return a.taskIndex - b.taskIndex;
    });
  }, [projects]);

  useEffect(() => {
    if (!focusTarget) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(taskDomId(focusTarget.projectId, focusTarget.taskId))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocusHandled?.();
    }, 120);
    return () => clearTimeout(timer);
  }, [focusTarget, onFocusHandled]);

  const updateTasks = (project, mapper) => {
    if (!updateClient) return;
    updateClient(project.id, { tasks: mapper(project.tasks || []) });
  };

  const toggleTask = (project, taskIndex) => {
    updateTasks(project, (tasks) => tasks.map((task, index) =>
      index === taskIndex ? { ...task, isDone: !task.isDone } : task));
  };

  const startEditing = (project, task, key) => {
    setConfirmDeleteKey(null);
    setEditingKey(key);
    setDraftText(task.text || '');
    setDraftDate(task.date || '');
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setDraftText('');
    setDraftDate('');
  };

  const saveEditing = (project, taskIndex) => {
    const text = draftText.trim();
    if (!text) return;
    updateTasks(project, (tasks) => tasks.map((task, index) =>
      index === taskIndex ? { ...task, text, date: draftDate } : task));
    cancelEditing();
  };

  const deleteTask = (project, taskIndex, key) => {
    updateTasks(project, (tasks) => tasks.filter((_, index) => index !== taskIndex));
    setConfirmDeleteKey(null);
    if (editingKey === key) cancelEditing();
  };

  const openCount = rows.filter(({ task }) => !task.isDone).length;
  const scopeLabel = effectiveScope === 'personal' ? 'Moje' : 'GGS';

  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Zadania</h1>
          <div className={s.scopeLabel}>{scopeLabel}</div>
        </div>
        <div className={s.counter}>{openCount} {openCount === 1 ? 'zadanie' : 'zadań'}</div>
      </header>

      <div className={s.list} aria-label={`Zadania grupy ${scopeLabel}`}>
        {rows.length === 0 && (
          <div className={s.empty}>Brak zadań w grupie {scopeLabel}.</div>
        )}

        {rows.map(({ project, task, taskIndex, key }) => {
          const isEditing = editingKey === key;
          const isConfirming = confirmDeleteKey === key;
          const isFocused = focusTarget?.projectId === project.id && focusTarget?.taskId === task.id;
          const clientName = project.client_name || project.full_name || '—';
          const projectName = project.project_name || project.full_name || '—';

          return (
            <article
              key={key}
              id={taskDomId(project.id, task.id)}
              className={`${s.taskRow} ${task.isDone ? s.taskDone : ''} ${isFocused ? s.taskFocused : ''}`}
            >
              <button
                type="button"
                className={s.checkbox}
                aria-label={task.isDone ? 'Oznacz jako niewykonane' : 'Oznacz jako wykonane'}
                aria-pressed={task.isDone}
                onClick={() => toggleTask(project, taskIndex)}
              >
                {task.isDone ? '✓' : ''}
              </button>

              <div className={s.taskBody}>
                {isEditing ? (
                  <div className={s.editor}>
                    <input
                      className={s.textInput}
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      aria-label="Treść zadania"
                      autoFocus
                    />
                    <input
                      className={s.dateInput}
                      type="date"
                      value={draftDate}
                      onChange={(event) => setDraftDate(event.target.value)}
                      aria-label="Termin zadania"
                    />
                    <button type="button" className={s.saveBtn} onClick={() => saveEditing(project, taskIndex)}>Zapisz</button>
                    <button type="button" className={s.cancelBtn} onClick={cancelEditing}>Anuluj</button>
                  </div>
                ) : (
                  <>
                    <div className={s.taskMainLine}>
                      <span className={s.taskText}>{task.text}</span>
                      {task.date && (
                        <time className={`${s.date} ${dueState(task.date, task.isDone)}`} dateTime={task.date}>
                          {formatDate(task.date)}
                        </time>
                      )}
                    </div>
                    <button
                      type="button"
                      className={s.context}
                      onClick={() => openProjectModal?.(project)}
                      title="Otwórz projekt"
                    >
                      <strong>{clientName}</strong><span>·</span>{projectName}
                    </button>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className={s.actions}>
                  {isConfirming ? (
                    <>
                      <span className={s.confirmText}>Usunąć?</span>
                      <button type="button" className={s.deleteYes} onClick={() => deleteTask(project, taskIndex, key)}>Tak</button>
                      <button type="button" className={s.cancelBtn} onClick={() => setConfirmDeleteKey(null)}>Nie</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={s.iconBtn} onClick={() => startEditing(project, task, key)} aria-label="Edytuj zadanie">✎</button>
                      <button type="button" className={s.iconBtn} onClick={() => setConfirmDeleteKey(key)} aria-label="Usuń zadanie">×</button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
