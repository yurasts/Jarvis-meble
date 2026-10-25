import { supabase } from '../supabase';

export const DRIVE_SYNC_STATE_COLUMNS = [
  'singleton_id',
  'locked_by_host',
  'lease_until',
  'last_heartbeat_at',
  'sync_root_path',
  'last_sync_at',
  'last_sync_summary',
  'last_error',
].join(',');

export const createDriveSyncRepository = ({ client = supabase } = {}) => ({
  async getState() {
    const { data, error } = await client
      .from('drive_sync_state')
      .select(DRIVE_SYNC_STATE_COLUMNS)
      .eq('singleton_id', 1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },
});

const driveSyncRepository = createDriveSyncRepository();

export default driveSyncRepository;
