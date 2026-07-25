// Общие мелкие функции/константы, используемые Dashboard и его подкомпонентами.

export const initials = (name) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

export const shortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
};

// Категории файлов проекта
export const FILE_CATEGORIES = [
  { key: 'projekt', icon: '📐', label: 'Projekt' },
  { key: 'usterki', icon: '⚠️', label: 'Uwagi' },
  { key: 'montaz',  icon: '✅', label: 'Montaż'  },
  { key: 'inne',    icon: '📄', label: 'Inne'    },
];

// Следующий числовой id задачи внутри конкретного проекта: max(существующие числовые id) + 1
// (вместо Date.now() — тот же числовой формат, но без вызова непрозрачной для React Compiler
// импурной функции в теле компонента; см. react-hooks/purity).
export const nextTaskId = (tasks) => {
  const numericIds = (tasks || [])
    .map(t => Number(t.id))
    .filter(n => Number.isFinite(n));
  return (numericIds.length ? Math.max(...numericIds) : 0) + 1;
};

// Группировка проектов по client_name
export const groupByClient = (projects) => {
  const map = {};
  projects.forEach(p => {
    const key = p.client_name || p.full_name || '—';
    if (!map[key]) map[key] = [];
    map[key].push(p);
  });
  return Object.entries(map); // [[clientName, [projects]], ...]
};