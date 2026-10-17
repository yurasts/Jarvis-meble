import clientsRepository from './clientsRepository';
import projectFilesRepository from './projectFilesRepository';

// «Usuń trwale» из корзины.
// 1. Собираем пути файлов проекта (после удаления строки они уже недоступны).
// 2. Удаляем строку clients — права проверяет БД (owner + lifecycle_status = 'trash'); project_files
//    и project_cash_transactions удаляются каскадом, audit_log сохраняет копию строки.
// 3. Удаляем объекты из хранилища (политика project_files_storage_owner_delete_orphans).
// Порядок важен: если БД откажет, файлы проекта остаются нетронутыми.
export const createProjectPurge = ({
  clients = clientsRepository,
  files = projectFilesRepository,
} = {}) => async (clientId) => {
  const paths = await files.listStoragePaths(clientId);
  await clients.permanentlyDelete(clientId);
  const storageError = paths.length > 0 ? await files.removeStoragePaths(paths) : null;
  return { removedFiles: paths.length, storageError };
};

const purgeProject = createProjectPurge();

export default purgeProject;
