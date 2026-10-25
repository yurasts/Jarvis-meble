import { createClient } from '@supabase/supabase-js';
import { PROJECT_FILES_BUCKET } from './constants.js';

const PROJECT_COLUMNS = 'id,full_name,client_name,project_name,lifecycle_status,updated_at';
const PROJECT_FILE_COLUMNS = 'id,client_id,category,file_name,file_path,file_url,file_type,uploaded_at';
const SYNC_ENTRY_COLUMNS = 'id,project_id,project_file_id,category,relative_path,file_name,content_sha256,size_bytes,storage_path,last_synced_at';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const listAll = async (queryFactory, pageSize = 1000) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await queryFactory().range(from, from + pageSize - 1)) || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

export const createDriveSyncRemote = ({ supabaseUrl, serviceRoleKey }) => {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const storage = client.storage.from(PROJECT_FILES_BUCKET);

  return {
    async acquireLease({ host, root, leaseSeconds }) {
      return Boolean(unwrap(await client.rpc('acquire_drive_sync_lease', {
        p_host: host,
        p_sync_root_path: root,
        p_lease_seconds: leaseSeconds,
      })));
    },

    async reportResult({ host, summary = null, error = null }) {
      return Boolean(unwrap(await client.rpc('report_drive_sync_result', {
        p_host: host,
        p_summary: summary,
        p_error: error,
      })));
    },

    async releaseLease(host) {
      return Boolean(unwrap(await client.rpc('release_drive_sync_lease', { p_host: host })));
    },

    listProjects() {
      return listAll(() => client.from('clients').select(PROJECT_COLUMNS).order('id'));
    },

    listProjectFiles() {
      return listAll(() => client.from('project_files').select(PROJECT_FILE_COLUMNS).order('id'));
    },

    listSyncEntries() {
      return listAll(() => client.from('drive_file_sync_entries').select(SYNC_ENTRY_COLUMNS).order('last_synced_at'));
    },

    async download(storagePath) {
      const blob = unwrap(await storage.download(storagePath));
      return new Uint8Array(await blob.arrayBuffer());
    },

    async upload(storagePath, contents, contentType) {
      unwrap(await storage.upload(storagePath, contents, {
        upsert: false,
        contentType: contentType || 'application/octet-stream',
      }));
      return storage.getPublicUrl(storagePath).data?.publicUrl || '';
    },

    async removeStorage(storagePath) {
      if (!storagePath) return;
      unwrap(await storage.remove([storagePath]));
    },

    async createProjectFile(payload) {
      return unwrap(await client.from('project_files').insert([payload]).select(PROJECT_FILE_COLUMNS).single());
    },

    async updateProjectFile(projectFileId, payload) {
      return unwrap(await client.from('project_files')
        .update(payload)
        .eq('id', projectFileId)
        .select(PROJECT_FILE_COLUMNS)
        .single());
    },

    async upsertSyncEntry(payload) {
      return unwrap(await client.from('drive_file_sync_entries')
        .upsert(payload, { onConflict: 'project_id,category,relative_path' })
        .select(SYNC_ENTRY_COLUMNS)
        .single());
    },

    async deleteSyncEntry(entryId) {
      unwrap(await client.from('drive_file_sync_entries').delete().eq('id', entryId));
    },
  };
};
