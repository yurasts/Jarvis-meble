import { supabase } from '../supabase';
import { withProjectFileSignedUrls } from '../utils/projectFileAccess';
import { createStorageBucket } from './storageBucket';

const PROJECT_FILES_BUCKET = 'project-files';
const DEFAULT_PROFILE_COLOR = '#718096';

export const PROJECT_FILE_COLUMNS = [
  'id',
  'client_id',
  'category',
  'file_name',
  'file_path',
  'file_url',
  'file_type',
  'comment',
  'uploaded_by_color',
  'uploaded_at',
].join(',');

// В public.project_files нет колонки размера: размер подтягивается отдельно и «best effort»
// (drive_file_sync_entries, затем метаданные Storage). Ошибка тут не должна ломать список файлов.
const SYNC_ENTRY_SIZE_COLUMNS = 'project_file_id,size_bytes';

const validSize = (value) => {
  const size = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(size) && size >= 0 ? size : null;
};

const folderOf = (path) => {
  const index = String(path || '').lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '';
};

const safeFilename = (name) => String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');

const publicUrlFor = (storage, path) => {
  const { data, error } = storage.getPublicUrl(path);
  if (error) throw error;
  return data?.publicUrl || '';
};

const throwIfError = ({ error }) => {
  if (error) throw error;
};

const projectFilePayload = ({ clientId, category, file, path, publicUrl, profile, uploadedAt }) => ({
  client_id: clientId,
  category,
  file_name: file.name,
  file_path: path,
  file_url: publicUrl,
  file_type: file.type || 'application/octet-stream',
  comment: '',
  ...(uploadedAt ? { uploaded_at: uploadedAt } : {}),
  uploaded_by: profile?.id || null,
  uploaded_by_color: profile?.color || DEFAULT_PROFILE_COLOR,
});

export const createProjectFilesRepository = ({
  client = supabase,
  signFiles = withProjectFileSignedUrls,
  now = () => new Date(),
  logger = console,
} = {}) => {
  const storage = createStorageBucket(client, PROJECT_FILES_BUCKET, logger);

  const signSavedFile = async (file) => {
    try {
      const [signedFile] = await signFiles([file]);
      return signedFile || file;
    } catch (error) {
      logger.error(error);
      return { ...file, signed_url: file?.file_url || '' };
    }
  };

  // Локальный File.size известен сразу после загрузки — в БД его не пишем.
  const withLocalSize = (savedFile, file) => {
    const size = validSize(file?.size);
    return size === null ? savedFile : { ...savedFile, size_bytes: size };
  };

  const syncEntrySizes = async (clientId) => {
    const sizes = new Map();
    try {
      const result = await client
        .from('drive_file_sync_entries')
        .select(SYNC_ENTRY_SIZE_COLUMNS)
        .eq('project_id', clientId);
      if (result.error) throw result.error;
      (result.data || []).forEach((entry) => {
        const size = validSize(entry.size_bytes);
        if (entry.project_file_id != null && size !== null) sizes.set(String(entry.project_file_id), size);
      });
    } catch (error) {
      logger.error(error);
    }
    return sizes;
  };

  const storageObjectSizes = async (paths) => {
    const sizes = new Map();
    const folders = [...new Set(paths.map(folderOf).filter(Boolean))];
    await Promise.all(folders.map(async (folder) => {
      try {
        const { data, error } = await storage.list(folder, { limit: 1000 });
        if (error) throw error;
        (data || []).forEach((object) => {
          const size = validSize(object?.metadata?.size);
          if (object?.name && size !== null) sizes.set(`${folder}/${object.name}`, size);
        });
      } catch (error) {
        logger.error(error);
      }
    }));
    return sizes;
  };

  const loadFileSizes = async (clientId, rows) => {
    if (!rows.length) return new Map();
    const sizes = await syncEntrySizes(clientId);
    const missing = rows.filter(row => !sizes.has(String(row.id)));
    if (!missing.length) return sizes;

    const storageSizes = await storageObjectSizes(missing.map(row => row.file_path));
    missing.forEach((row) => {
      const size = storageSizes.get(row.file_path);
      if (size !== undefined) sizes.set(String(row.id), size);
    });
    return sizes;
  };

  return {
    async list(clientId) {
      const result = await client
        .from('project_files')
        .select(PROJECT_FILE_COLUMNS)
        .eq('client_id', clientId)
        .order('uploaded_at', { ascending: false });
      throwIfError(result);
      const rows = result.data || [];
      const [signedFiles, sizes] = await Promise.all([
        signFiles(rows),
        loadFileSizes(clientId, rows).catch((error) => {
          logger.error(error);
          return new Map();
        }),
      ]);
      return signedFiles.map((file) => {
        const size = sizes.get(String(file.id));
        return size === undefined ? file : { ...file, size_bytes: size };
      });
    },

    async upload({ clientId, category, file, profile }) {
      const timestamp = now().getTime();
      const path = `${clientId}/${timestamp}_${safeFilename(file.name)}`;
      const uploadResult = await storage.upload(path, file, { upsert: false });
      throwIfError(uploadResult);

      let savedFile;
      try {
        const payload = projectFilePayload({
          clientId,
          category,
          file,
          path,
          publicUrl: publicUrlFor(storage, path),
          profile,
        });
        const saveResult = await client.from('project_files').insert([payload]).select(PROJECT_FILE_COLUMNS).single();
        throwIfError(saveResult);
        savedFile = saveResult.data;
      } catch (error) {
        await storage.remove(path);
        throw error;
      }
      return signSavedFile(withLocalSize(savedFile, file));
    },

    async replaceSto({ clientId, file, profile, currentFile }) {
      const uploadedAt = now().toISOString();
      const path = `${clientId}/sto/${uploadedAt.replace(/[^0-9]/g, '')}_${safeFilename(file.name)}`;
      const uploadResult = await storage.upload(path, file, { upsert: false });
      throwIfError(uploadResult);

      let savedFile;
      try {
        const payload = projectFilePayload({
          clientId,
          category: 'sto',
          file,
          path,
          publicUrl: publicUrlFor(storage, path),
          profile,
          uploadedAt,
        });
        const query = currentFile
          ? client.from('project_files').update(payload).eq('id', currentFile.id)
          : client.from('project_files').insert([payload]);
        const saveResult = await query.select(PROJECT_FILE_COLUMNS).single();
        throwIfError(saveResult);
        savedFile = saveResult.data;
      } catch (error) {
        await storage.remove(path);
        throw error;
      }

      if (currentFile?.file_path && currentFile.file_path !== path) {
        await storage.remove(currentFile.file_path);
      }
      return signSavedFile(withLocalSize(savedFile, file));
    },

    async remove({ clientId, file, clearCover }) {
      const deleteResult = await client.from('project_files').delete().eq('id', file.id);
      throwIfError(deleteResult);

      let coverError = null;
      if (clearCover) {
        const coverResult = await client.from('clients').update({ cover_url: null }).eq('id', clientId);
        coverError = coverResult.error || null;
        if (coverError) logger.error(coverError);
      }

      const storageError = await storage.remove(file.file_path);
      return { coverError, storageError };
    },

    async updateComment(fileId, comment) {
      const result = await client.from('project_files').update({ comment }).eq('id', fileId);
      throwIfError(result);
    },

    async updateCover(clientId, coverUrl) {
      const result = await client.from('clients').update({ cover_url: coverUrl }).eq('id', clientId);
      throwIfError(result);
    },

    // Пути объектов проекта в хранилище — собираются ДО удаления строки clients (после него
    // project_files уже удалены каскадом).
    async listStoragePaths(clientId) {
      const result = await client.from('project_files').select('file_path').eq('client_id', clientId);
      throwIfError(result);
      return (result.data || []).map(row => row.file_path).filter(Boolean);
    },

    removeStoragePaths(paths) {
      return storage.removeMany(paths);
    },

    async download(path) {
      const result = await storage.download(path);
      throwIfError(result);
      return result.data;
    },
  };
};

const projectFilesRepository = createProjectFilesRepository();

export default projectFilesRepository;
