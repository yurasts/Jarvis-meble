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