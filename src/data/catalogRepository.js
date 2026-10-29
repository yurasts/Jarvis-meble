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
  'is_favorite',
  'material_suppliers(id,supplier_id,supplier_sku,supplier_price,is_preferred,created_at,supplier:suppliers(id,name,address,google_maps_url,phone,email,contact_person,is_archived))',
].join(',');

export const SERVICE_COLUMNS = ['id', 'name', 'price', 'is_favorite'].join(',');

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

  async createService(fields) {
    return unwrap(await client.from('services').insert([fields]).select(SERVICE_COLUMNS).single());
  },

  async updateMaterial(id, fields) {
    return unwrap(await client.from('materials').update(fields).eq('id', id).select(MATERIAL_COLUMNS).single());
  },

  async replaceMaterialSuppliers(materialId, links) {
    return unwrap(await client.rpc('set_material_suppliers', {
      p_material_id: materialId,
      p_links: links,
    })) || [];
  },

  async updateService(id, fields) {
    return unwrap(await client.from('services').update(fields).eq('id', id).select(SERVICE_COLUMNS).single());
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
