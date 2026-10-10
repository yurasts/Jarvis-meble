import { supabase } from '../supabase';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createClientsRepository = ({ client = supabase } = {}) => ({
  async list() {
    return unwrap(await client.from('clients').select('*')) || [];
  },

  async create(fields) {
    return unwrap(await client.from('clients').insert([fields]).select().single());
  },

  async update(id, fields) {
    unwrap(await client.from('clients').update(fields).eq('id', id));
  },

  async updateAndGet(id, fields) {
    return unwrap(await client.from('clients').update(fields).eq('id', id).select().single());
  },
});

const clientsRepository = createClientsRepository();

export default clientsRepository;
