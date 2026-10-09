import { supabase } from '../supabase';
import { createStorageBucket } from './storageBucket';

const BUCKET = 'pro100-library';

const safeFilename = (name) => {
  const cleaned = String(name || 'projekt.sto').normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_');
  return cleaned.toLowerCase().endsWith('.sto') ? cleaned : `${cleaned}.sto`;
};

const defaultStoragePath = (file) => {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${id}/${Date.now()}_${safeFilename(file.name)}`;
};

const stagedError = (stage, error) => Object.assign(
  new Error(error?.message || `PRO100 repository operation failed: ${stage}`),
  { stage, cause: error },
);

export const createPro100LibraryRepository = ({
  client = supabase,
  createStoragePath = defaultStoragePath,
  logger = console,
} = {}) => {
  const storage = createStorageBucket(client, BUCKET, logger);

  return {
    async load() {
      const [categoryResult, fileResult] = await Promise.all([
        client.from('pro100_library_categories').select('*').eq('is_active', true).order('sort_order'),
        client.from('pro100_library_files').select('*').order('updated_at', { ascending: false }),
      ]);
      if (categoryResult.error) throw stagedError('load', categoryResult.error);
      if (fileResult.error) throw stagedError('load', fileResult.error);
      return {
        categories: categoryResult.data || [],
        files: fileResult.data || [],
      };
    },

    async create({ file, metadata }) {
      const storagePath = createStoragePath(file);
      const uploadResult = await storage.upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadResult.error) throw stagedError('create-upload', uploadResult.error);

      const saveResult = await client.from('pro100_library_files').insert({
        ...metadata,
        storage_path: storagePath,
        original_filename: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
      }).select('*').single();
      if (saveResult.error) {
        await storage.remove(storagePath);
        throw stagedError('create-save', saveResult.error);
      }
      return saveResult.data;
    },

    async updateMetadata(fileId, metadata) {
      const result = await client.from('pro100_library_files')
        .update(metadata)
        .eq('id', fileId)
        .select('*')
        .single();
      if (result.error) throw stagedError('metadata-save', result.error);
      return result.data;
    },

    async replace(currentFile, nextFile) {
      const newPath = createStoragePath(nextFile);
      const uploadResult = await storage.upload(newPath, nextFile, {
        contentType: nextFile.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadResult.error) throw stagedError('replace-upload', uploadResult.error);

      const updateResult = await client.from('pro100_library_files').update({
        storage_path: newPath,
        original_filename: nextFile.name,
        file_size: nextFile.size,
        content_type: nextFile.type || 'application/octet-stream',
        version: (currentFile.version || 1) + 1,
      }).eq('id', currentFile.id).select('*').single();
      if (updateResult.error) {
        await storage.remove(newPath);
        throw stagedError('replace-save', updateResult.error);
      }

      await storage.remove(currentFile.storage_path);
      return updateResult.data;
    },

    async remove(file) {
      const deleteResult = await client.from('pro100_library_files').delete().eq('id', file.id);
      if (deleteResult.error) throw stagedError('delete', deleteResult.error);
      await storage.remove(file.storage_path);
    },

    async download(path) {
      const result = await storage.download(path);
      if (result.error) throw stagedError('download', result.error);
      return result.data;
    },
  };
};

const pro100LibraryRepository = createPro100LibraryRepository();

export default pro100LibraryRepository;
