import { TriangleAlert } from 'lucide-react';
import s from './PurgeProjectsDialog.module.css';

// 2–4 (кроме 12–14) → «projekty», остальные → «projektów».
const projectsWord = (count) => {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'projekty' : 'projektów';
};

const projectLabel = (project) => {
  const client = project.client_name || project.full_name || '—';
  return project.project_name ? `${client} — ${project.project_name}` : client;
};

// Подтверждение «Usuń trwale» (только owner, только из корзины). Удаление необратимо: вместе со
// строкой проекта исчезают его файлы и операции кассы.
export default function PurgeProjectsDialog({ projects, busy = false, onConfirm, onCancel }) {
  const single = projects.length === 1;
  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className={`modal-content ${s.dialog}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="purge-projects-title"
        aria-describedby="purge-projects-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="purge-projects-title" className={s.title}>
          <TriangleAlert size={20} strokeWidth={2.25} aria-hidden="true" />
          {single ? 'Usunąć projekt trwale?' : `Usunąć trwale ${projects.length} ${projectsWord(projects.length)}?`}
        </h2>
        <ul className={s.list}>
          {projects.map((project) => <li key={project.id}>{projectLabel(project)}</li>)}
        </ul>
        <p id="purge-projects-description" className={s.description}>
          Zostaną usunięte również pliki i operacje kasowe {single ? 'projektu' : 'tych projektów'}.
          {' '}Tej operacji nie można cofnąć.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Anuluj
          </button>
          <button type="button" className={s.confirm} onClick={onConfirm} disabled={busy}>
            {busy ? 'Usuwanie…' : 'Usuń trwale'}
          </button>
        </div>
      </div>
    </div>
  );
}
