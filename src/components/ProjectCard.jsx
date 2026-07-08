import React from 'react';
import s from './Dashboard.module.css';
import TaskItem from './TaskItem';
import { FILE_CATEGORIES } from './dashboardHelpers';

export default function ProjectCard({
  project, fileCounts,
  onOpenProject, onOpenFileCategory, onOpenAddTask,
  showDone, onToggleShowDone,
  confirmDeleteId, setConfirmDeleteId,
  expandedTaskId, setExpandedTaskId,
  onToggleTaskStatus, onDeleteTask,
}) {
  const allTasks  = project.tasks || [];
  const doneTasks = allTasks.filter(t => t.isDone);
  const openTasks = allTasks.filter(t => !t.isDone);
  const visible   = showDone ? allTasks : openTasks;

  const availableCats = FILE_CATEGORIES.filter(
    cat => (fileCounts[project.id]?.[cat.key] || 0) > 0
  );

  return (
    <div className={s.projectCard} data-status={project.status || 'new'}>
      <div className={s.projectHeader} onClick={onOpenProject} style={{ cursor: 'pointer' }}>
        <div className={s.projectInfo}>
          <div className={s.projectNameRow}>
            <h3 className={s.projectName}>
              {project.project_name || project.full_name}
            </h3>

            {availableCats.length > 0 && (
              <div className={s.fileButtonsInline}>
                {availableCats.map(cat => {
                  const count = fileCounts[project.id][cat.key];
                  return (
                    <button
                      key={cat.key}
                      className={s.fileCatBtnSmall}
                      onClick={(e) => { e.stopPropagation(); onOpenFileCategory(cat); }}
                      title={`${cat.label} (${count})`}
                    >
                      {cat.icon}
                      <span className={s.fileCatBadgeSmall}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={s.tasksBody}>
        <div className={s.taskActionsRow}>
          <button className={s.btnAddTaskOpen} onClick={onOpenAddTask}>
            + Zadanie
          </button>
          {doneTasks.length > 0 && (
            <button onClick={onToggleShowDone} className={s.btnToggleDone}>
              {showDone ? '▲' : '▼'} Wykonane ({doneTasks.length})
            </button>
          )}
        </div>

        <div className={s.taskList}>
          {visible.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              isConfirm={confirmDeleteId === task.id}
              isExpanded={expandedTaskId === task.id}
              onToggleStatus={() => onToggleTaskStatus(task.id)}
              onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
              onRequestDelete={() => setConfirmDeleteId(task.id)}
              onConfirmDelete={() => onDeleteTask(task.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
