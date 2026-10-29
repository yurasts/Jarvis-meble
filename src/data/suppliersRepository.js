import { supabase } from '../supabase';

export const SUPPLIER_COLUMNS = [
  'id',
  'name',
  'address',
  'google_maps_url',
  'phone',
  'email',
  'contact_person',
  'notes',
  'is_archived',
  'created_at',
  'updated_at',
].join(',');

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createSuppliersRepository = ({ client = supabase } = {}) => ({
  async list() {
    const [suppliersResult, linksResult] = await Promise.all([
      client.from('suppliers').select(SUPPLIER_COLUMNS).order('name'),
      client.from('material_suppliers').select('supplier_id'),
    ]);
    const suppliers = unwrap(suppliersResult) || [];
    const links = unwrap(linksResult) || [];
    const counts = links.reduce((map, link) => {
      map.set(link.supplier_id, (map.get(link.supplier_id) || 0) + 1);
      return map;
    }, new Map());

    return suppliers.map(supplier => ({
      ...supplier,
      material_count: counts.get(supplier.id) || 0,
    }));
  },

  async create(fields) {
    return unwrap(await client.from('suppliers').insert([fields]).select(SUPPLIER_COLUMNS).single());
  },

  async update(id, fields) {
    return unwrap(await client.from('suppliers').update(fields).eq('id', id).select(SUPPLIER_COLUMNS).single());
  },

  async setArchived(id, isArchived = true) {
    return unwrap(await client.from('suppliers')
      .update({ is_archived: isArchived })
      .eq('id', id)
      .select(SUPPLIER_COLUMNS)
      .single());
  },
});

const suppliersRepository = createSuppliersRepository();
export default suppliersRepository;
