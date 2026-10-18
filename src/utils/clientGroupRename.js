// Переименование клиента. Клиента как отдельной сущности нет: группа в левой панели — это проекты
// с одинаковым client_name (или full_name, если client_name пуст; см. dashboardHelpers.groupByClient).
// Поэтому новое имя, введённое в окне «Klient i projekt» одного проекта, нужно записать во ВСЕ
// проекты старой группы — иначе группа распадается на две строки.

export const clientGroupName = (project) => project?.client_name || project?.full_name || '';

const scopeOf = (project) => project?.project_scope || 'firma';

// Что переименовать при сохранении draft (сохранённое состояние — original). Возвращает null, если
// имя клиента не менялось. В группу входят проекты того же раздела (Firma / Moje), что и раньше
// был у проекта, в любом состоянии (активные, архив, корзина) — чтобы восстановленный проект не
// оказался под старым именем. full_name обновляется там, где совпадал со старым именем (портал
// клиента показывает full_name).
export function planClientGroupRename({ clients = [], original, draft }) {
  if (!original || !draft) return null;
  const previousName = clientGroupName(original);
  const nextName = String(draft.client_name || '').trim();
  if (!nextName || nextName === previousName) return null;

  const scope = scopeOf(original);
  const group = clients.filter(project => project.id !== draft.id
    && clientGroupName(project) === previousName
    && scopeOf(project) === scope);
  const projects = [original, ...group];

  return {
    previousName,
    nextName,
    ids: projects.map(project => project.id),
    fullNameIds: projects.filter(project => project.full_name === previousName).map(project => project.id),
    siblingCount: group.length,
  };
}
