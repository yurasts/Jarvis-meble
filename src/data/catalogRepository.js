import { supabase } from '../supabase';

export const MATERIAL_COLUMNS = [
  'id',
  'name',
  'category',
  'unit',
  'price',
  'supplier',
  'symbol',
  'price_history',
].join(',');

export const SERVICE_COLUMNS = ['id', 'name', 'price'].join(',');

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createCatalogRepository = ({ client = supabase } = {}) => ({
  async listMaterials() {
    return unwrap(await client.from('materials').select(MATERIAL_COLUMNS)) || [];
  },

  async listServices() {
    return unwrap(await client.from('services').select(SERVICE_COLUMNS)) || [];
  },

  async createMaterial(fields) {
    return unwrap(await client.from('materials').insert([fields]).select(MATERIAL_COLUMNS).single());
  },

  async updateMaterial(id, fields) {
    return unwrap(await client.from('materials').update(fields).eq('id', id).select(MATERIAL_COLUMNS).single());
  },

  async updateMaterialPrices(updates) {
    const payload = updates.map(({ materialId, expectedPrice, newPrice }) => ({
      material_id: materialId,
      expected_price: expectedPrice,
      new_price: newPrice,
    }));

    return unwrap(await client.rpc('update_material_prices', { p_updates: payload })) || [];
  },
});

const catalogRepository = createCatalogRepository();

export default catalogRepository;
