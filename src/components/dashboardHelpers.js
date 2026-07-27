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

// Единый расчёт стоимости проекта (materiały/usługi/wydatki + итог) — общий для ProjectModal.jsx
// (Koszty на вкладках) и sidebar-панели ProjectListPanel (Koszty/Budżet), чтобы не было двух
// независимых формул. Арифметика намеренно НЕ одинакова для всех трёх категорий — это точное
// отражение продуктовой логики, как она была в ProjectModal.jsx ДО объединения:
// - materiały: Number(price) * Number(quantity) — БЕЗ фолбэка "|| 1" (иначе позиция с
//   quantity=0/undefined считалась бы так, будто quantity=1, чего в материалах никогда не было);
// - usługi/wydatki: Number(price) * Number(quantity || 1) — фолбэк есть, т.к. эти позиции могут
//   не иметь явного количества (по умолчанию — "один раз").
export const projectTotals = (client) => {
  const materialsItems = client?.calc_materials || [];
  const servicesItems  = client?.calc_services  || [];
  const expensesItems  = client?.calc_expenses  || [];
  const materials = materialsItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const services  = servicesItems.reduce((s, i)  => s + Number(i.price) * Number(i.quantity || 1), 0);
  const expenses  = expensesItems.reduce((s, i)  => s + Number(i.price) * Number(i.quantity || 1), 0);
  return { materials, services, expenses, total: materials + services + expenses };
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