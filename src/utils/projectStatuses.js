// Единый справочник статусов проекта (clients.status). Цвета живут в src/index.css
// (--status-<key>-color / --status-<key>-bg, в т.ч. отдельные значения для тёмных тем), здесь —
// ключи, польские подписи и хелперы, возвращающие CSS-переменные. Компонентам больше не нужно
// держать свои таблицы цветов или вычислять isDark ? … : … для статусов.

export const PROJECT_STATUSES = Object.freeze(['new', 'design', 'production', 'done']);
export const DEFAULT_PROJECT_STATUS = 'new';

// Устаревшие польские значения в части данных, которые означают «завершён». Сами данные не
// меняются — только трактовка при отображении.
export const COMPLETED_STATUSES = new Set(['done', 'Zrealizowane', 'Zakończone']);

// Короткие подписи (пилюля статуса в мобильной шапке проекта).
export const STATUS_LABEL = Object.freeze({
  new:        'Nowy',
  design:     'Projektowanie',
  production: 'Produkcja',
  done:       'Gotowe',
});

// Заголовки колонок Tablica projektów.
export const STATUS_BOARD_TITLE = Object.freeze({
  new:        'Nowe',
  design:     'Projektowanie / 3D',
  production: 'W produkcji',
  done:       'Montaż / Gotowe',
});

// Легенда статусов в Ustawienia.
export const STATUS_LEGEND = Object.freeze([
  Object.freeze({ status: 'new',        label: 'Nowy / Nieokreślony',             description: 'Zapytanie, wycena, brak decyzji' }),
  Object.freeze({ status: 'design',     label: 'Umowa podpisana / Projektowanie', description: 'Start projektu, zakup materiałów' }),
  Object.freeze({ status: 'production', label: 'Produkcja / Składanie',           description: 'Elementy w produkcji lub na hali' }),
  Object.freeze({ status: 'done',       label: 'Montaż / Gotowe',                 description: 'Montaż u klienta lub zakończony' }),
]);

export const isKnownStatus = (status) => PROJECT_STATUSES.includes(status);

export const isCompletedStatus = (status) => COMPLETED_STATUSES.has(status);

// Известный ключ или 'new' (прежнее поведение `MAP[status] || MAP.new`).
export const normalizeStatus = (status) => (isKnownStatus(status) ? status : DEFAULT_PROJECT_STATUS);

// То же, но устаревшие «завершённые» значения ('Zrealizowane' и т.п.) показываются как 'done'.
export const resolveDisplayStatus = (status) => (isCompletedStatus(status) ? 'done' : normalizeStatus(status));

export const statusLabel = (status) => STATUS_LABEL[normalizeStatus(status)];

export const statusColorVar = (status) => `var(--status-${normalizeStatus(status)}-color)`;

export const statusBgVar = (status) => `var(--status-${normalizeStatus(status)}-bg)`;

export const statusBoardColorVar = (status) => `var(--status-${normalizeStatus(status)}-board-color)`;
