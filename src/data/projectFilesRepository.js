import { supabase } from '../supabase';
import { withProjectFileSignedUrls } from '../utils/projectFileAccess';
import { createStorageBucket } from './storageBucket';

const PROJECT_FILES_BUCKET = 'project-files';
const DEFAULT_PROFILE_COLOR = '#718096';

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

  return {
    async list(clientId) {
      const result = await client
        .from('project_files')
        .select('*')
        .eq('client_id', clientId)
        .order('uploaded_at', { ascending: false });
      throwIfError(result);
      return signFiles(result.data || []);
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
        const saveResult = await client.from('project_files').insert([payload]).select().single();
        throwIfError(saveResult);
        savedFile = saveResult.data;
      } catch (error) {
        await storage.remove(path);
        throw error;
      }
      return signSavedFile(savedFile);
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
        const saveResult = await query.select().single();
        throwIfError(saveResult);
        savedFile = saveResult.data;
      } catch (error) {
        await storage.remove(path);
        throw error;
      }

      if (currentFile?.file_path && currentFile.file_path !== path) {
        await storage.remove(currentFile.file_path);
      }
      return signSavedFile(savedFile);
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

    async download(path) {
      const result = await storage.download(path);
      throwIfError(result);
      return result.data;
    },
  };
};

const projectFilesRepository = createProjectFilesRepository();

export default projectFilesRepository;
