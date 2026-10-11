import { supabase } from '../supabase';

export const createProjectFileCountsRepository = ({ client = supabase } = {}) => ({
  async list() {
    const { data, error } = await client.rpc('get_project_file_counts');
    if (error) throw error;

    return Object.fromEntries((data || []).map(({ client_id: clientId, file_count: count }) => (
      [clientId, Number(count) || 0]
    )));
  },
});

const projectFileCountsRepository = createProjectFileCountsRepository();

export default projectFileCountsRepository;
