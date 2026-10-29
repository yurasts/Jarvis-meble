import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import s from './WorkspaceSection.module.css';

// Классы кнопок шапки — для «+ Dodaj…» и вторичных кнопок внутри actions.

// Единая сворачиваемая секция рабочей области проекта на desktop (2026-10): Materiały, Usługi,
// Rozliczenia, Zadania, Informacje — одна ширина, одна строка-заголовок (шеврон + название +
// пояснение), итог и кнопки справа. Тело при сворачивании скрывается атрибутом hidden, но
// остаётся смонтированным — черновики (операция кассы, ввод количества) не теряются.
export default function WorkspaceSection({
  title,
  meta,
  summary,
  actions,
  open,
  onToggle,
  label,
  flush = false,
  className,
  children,
  // Цвет акцентной полосы/плашки раздела (Segmented Section Cards): 'materials' | 'services' |
  // 'expenses' сопоставлены с существующими --section-*-line/-tint/-ink (src/index.css, те же
  // токены, что и у шапок modal-fallback вкладок). 'neutral' (Zadania/Informacje) — спокойный
  // var(--accent) без собственной заливки шапки.
  accent = 'neutral',
}) {
  const bodyId = useId();
  return (
    <section
      className={[s.section, open ? s.sectionOpen : '', className].filter(Boolean).join(' ')}
      aria-label={label || title}
      data-accent={accent}
    >
      <div className={s.header}>
        {/* Паттерн аккордеона: заголовок h3 содержит кнопку-переключатель. */}
        <h3 className={s.heading}>
          <button
            type="button"
            className={s.toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            <ChevronRight
              size={14}
              strokeWidth={2.5}
              className={[s.chevron, open ? s.chevronOpen : ''].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
            <span className={s.title}>{title}</span>
            {meta !== undefined && meta !== null && <span className={s.meta}>{meta}</span>}
          </button>
        </h3>
        {summary !== undefined && summary !== null && <strong className={s.summary}>{summary}</strong>}
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      <div id={bodyId} className={flush ? s.bodyFlush : s.body} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
