import React from 'react';
import s from './Dashboard.module.css';
import { shortDate } from './dashboardHelpers';

export default function AddTaskModal({ project, value, onChangeText, onChangeDate, onSubmit, onClose }) {
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={s.modalBox} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <span>+ Zadanie — {project.project_name || project.full_name}</span>
          <button className={s.modalCloseBtn} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          <input
            type="text"
            autoFocus
            placeholder="Wpisz zadanie..."
            value={value.text || ''}
            onChange={e => onChangeText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
            className={s.modalInput}
          />
          <div className={s.dateWrap}>
            <input
              type="date"
              value={value.date || ''}
              onChange={e => onChangeDate(e.target.value)}
              className={s.inputDateHidden}
            />
            <button
              type="button"
              className={s.dateDisplayBtn}
              onClick={(e) => {
                const input = e.currentTarget.previousSibling;
                if (input?.showPicker) input.showPicker();
                else input?.focus();
              }}
            >
              {value.date ? shortDate(value.date) : '📅 Termin'}
            </button>
          </div>
          <button className={s.modalSubmitBtn} onClick={onSubmit}>
            + Dodaj zadanie
          </button>
        </div>
      </div>
    </div>
  );
}
