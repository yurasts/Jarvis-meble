import React from 'react';
import s from './Dashboard.module.css';
import { initials, shortDate } from './dashboardHelpers';

export default function TaskItem({
  task, isConfirm, isExpanded,
  onToggleStatus, onToggleExpand, onRequestDelete, onConfirmDelete, onCancelDelete,
}) {
  const taskColor = task.createdByColor || '#718096';
  const taskItemClass = [s.taskItem, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');
  const taskTextClass = [s.taskText, task.isDone ? s.done : '', isConfirm ? s.confirm : ''].join(' ');

  return (
    <div className={taskItemClass}>
      <div className={s.taskRow} style={{ borderLeft: `3px solid ${taskColor}` }}>
        <input
          type="checkbox"
          checked={task.isDone}
          onChange={onToggleStatus}
          className={s.taskCheckbox}
        />
        <div className={s.taskTextWrap} onClick={onToggleExpand}>
          <span className={taskTextClass}>{task.text}</span>
        </div>
        {task.date && <span className={s.taskDate}>{shortDate(task.date)}</span>}
        {isConfirm ? (
          <div className={s.confirmBtns}>
            <button className={s.btnConfirmYes} onClick={onConfirmDelete}>Tak</button>
            <button className={s.btnConfirmNo} onClick={onCancelDelete}>Nie</button>
          </div>
        ) : (
          <button className={s.btnDelete} onClick={onRequestDelete}>✖</button>
        )}
      </div>
      {isExpanded && task.createdByName && (
        <div className={s.taskAuthor}>
          <div className={s.taskAuthorAvatar} style={{ background: taskColor }}>
            {initials(task.createdByName)}
          </div>
          <span className={s.taskAuthorName}>
            {task.createdByName}
            {task.createdAt
              ? ' • ' + new Date(task.createdAt).toLocaleString('pl-PL', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}
