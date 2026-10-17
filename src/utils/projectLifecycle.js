// Жизненный цикл проекта (clients.lifecycle_status): отдельно от рабочего статуса
// (new/design/production/done), чтобы восстановленный проект вернулся на тот же этап.
//   active   — обычные списки (дерево, доска, панель, поиск);
//   archived — папка «Archiwum»;
//   trash    — папка «Kosz»; только отсюда владелец (owner) может удалить проект навсегда.
// Права дублируются в БД (миграция 20261017120000): триггер protect_lifecycle_column и
// RLS-политика clients_delete_owner_trash_only. Здесь — только отображение кнопок.
export const PROJECT_LIFECYCLE = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  TRASH: 'trash',
});

const KNOWN_LIFECYCLES = new Set(Object.values(PROJECT_LIFECYCLE));

// Строки без колонки (БД до миграции, старые фикстуры) считаются активными.
export const getProjectLifecycle = (client) =>
  KNOWN_LIFECYCLES.has(client?.lifecycle_status) ? client.lifecycle_status : PROJECT_LIFECYCLE.ACTIVE;

export const isActiveProject = (client) => getProjectLifecycle(client) === PROJECT_LIFECYCLE.ACTIVE;

export const filterProjectsByLifecycle = (clients, lifecycle) =>
  (clients || []).filter((client) => getProjectLifecycle(client) === lifecycle);

export const canManageProjectLifecycle = (role) => role === 'owner' || role === 'assembler';

export const canPurgeProjects = (role) => role === 'owner';

export const PROJECT_LIFECYCLE_ACTION_LABELS = Object.freeze({
  [PROJECT_LIFECYCLE.ACTIVE]: 'Przywróć',
  [PROJECT_LIFECYCLE.ARCHIVED]: 'W archiwum',
  [PROJECT_LIFECYCLE.TRASH]: 'Do kosza',
});

// Ошибка «колонки нет»: фронтенд выкатили раньше миграции.
// 42703 — undefined_column (Postgres), PGRST204 — колонка не найдена в кэше схемы PostgREST.
export const isMissingLifecycleColumnError = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204';
