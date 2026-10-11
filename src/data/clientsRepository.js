import { supabase } from '../supabase';

export const CLIENT_COLUMNS = [
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
].join(',');

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createClientsRepository = ({ client = supabase } = {}) => ({
  async list() {
    return unwrap(await client.from('clients').select(CLIENT_COLUMNS)) || [];
  },

  async create(fields) {
    return unwrap(await client.from('clients').insert([fields]).select(CLIENT_COLUMNS).single());
  },

  async update(id, fields) {
    unwrap(await client.from('clients').update(fields).eq('id', id));
  },

  async updateAndGet(id, fields) {
    return unwrap(await client.from('clients').update(fields).eq('id', id).select(CLIENT_COLUMNS).single());
  },
});

const clientsRepository = createClientsRepository();

export default clientsRepository;
