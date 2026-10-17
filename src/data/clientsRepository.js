import { supabase } from '../supabase';
import { PROJECT_LIFECYCLE, isMissingLifecycleColumnError } from '../utils/projectLifecycle';

const BASE_CLIENT_COLUMNS = [
  'id',
  'full_name',
  'phone',
  'address',
  'budget',
  'deadline',
  'status',
  'notes',
  'calc_materials',
  'calc_services',
  'calc_expenses',
  'tasks',
  'production_steps',
  'assigned_designer',
  'assigned_installer',
  'budget_coefficient',
  'cover_url',
  'client_name',
  'project_name',
  'project_scope',
  'important_points',
];

const LIFECYCLE_COLUMNS = ['lifecycle_status', 'lifecycle_changed_at'];

export const CLIENT_COLUMNS = [...BASE_CLIENT_COLUMNS, ...LIFECYCLE_COLUMNS].join(',');
// Набор колонок для БД без миграции 20261017120000 (фронтенд выкатили раньше базы).
export const LEGACY_CLIENT_COLUMNS = BASE_CLIENT_COLUMNS.join(',');
const LIFECYCLE_RESULT_COLUMNS = ['id', ...LIFECYCLE_COLUMNS].join(',');

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const withLegacyLifecycle = (row) => (row && !row.lifecycle_status
  ? { ...row, lifecycle_status: PROJECT_LIFECYCLE.ACTIVE, lifecycle_changed_at: null }
  : row);

const lifecycleMigrationError = (cause) => {
  const error = new Error(
    'Archiwum i kosz wymagają aktualizacji bazy danych (migracja 20261017120000_project_lifecycle_archive_trash).',
  );
  error.code = 'LIFECYCLE_MIGRATION_MISSING';
  error.cause = cause;
  return error;
};

export const createClientsRepository = ({ client = supabase } = {}) => {
  // Пока БД без колонок жизненного цикла, читаем старый набор, а строки считаем активными.
  let lifecycleSupported = true;

  const selectWithFallback = async (run) => {
    if (lifecycleSupported) {
      const result = await run(CLIENT_COLUMNS);
      if (!isMissingLifecycleColumnError(result.error)) return unwrap(result);
      lifecycleSupported = false;
    }
    const data = unwrap(await run(LEGACY_CLIENT_COLUMNS));
    return Array.isArray(data) ? data.map(withLegacyLifecycle) : withLegacyLifecycle(data);
  };

  return {
    async list() {
      return (await selectWithFallback(columns => client.from('clients').select(columns))) || [];
    },

    async create(fields) {
      // Повтор после 42703 безопасен: INSERT с RETURNING несуществующей колонки откатывается целиком.
      return selectWithFallback(columns => client.from('clients').insert([fields]).select(columns).single());
    },

    async update(id, fields) {
      unwrap(await client.from('clients').update(fields).eq('id', id));
    },

    async updateAndGet(id, fields) {
      return selectWithFallback(columns => client.from('clients').update(fields).eq('id', id).select(columns).single());
    },

    // Archiwum / Kosz / Przywróć для одного или нескольких проектов. Возвращает реально
    // изменённые строки: RLS может молча пропустить недоступные, а триггер БД отклоняет
    // смену статуса для ролей кроме owner/assembler (42501).
    async setLifecycle(ids, lifecycleStatus) {
      const result = await client
        .from('clients')
        .update({ lifecycle_status: lifecycleStatus })
        .in('id', ids)
        .select(LIFECYCLE_RESULT_COLUMNS);
      if (isMissingLifecycleColumnError(result.error)) throw lifecycleMigrationError(result.error);
      return unwrap(result) || [];
    },

    // Физическое удаление. RLS разрешает его только владельцу и только для строк в корзине;
    // запрещённый DELETE не даёт ошибки, а затрагивает 0 строк — поэтому проверяем ответ.
    async permanentlyDelete(id) {
      const result = await client
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('lifecycle_status', PROJECT_LIFECYCLE.TRASH)
        .select('id');
      if (isMissingLifecycleColumnError(result.error)) throw lifecycleMigrationError(result.error);
      const rows = unwrap(result) || [];
      if (rows.length === 0) {
        const error = new Error('Nie usunięto projektu: trwale usuwać projekty z kosza może tylko właściciel.');
        error.code = 'PURGE_NOT_ALLOWED';
        throw error;
      }
    },
  };
};

const clientsRepository = createClientsRepository();

export default clientsRepository;
