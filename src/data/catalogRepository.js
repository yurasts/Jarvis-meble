import { supabase } from '../supabase';

// Базовые поля materials, не зависящие от material_suppliers/suppliers — если эти таблицы ещё не
// развёрнуты на окружении (миграции не выполнены) или запрос с embed по какой-то другой причине
// падает, listMaterials() ниже повторяет select именно этим списком, чтобы Baza materiałów не
// обнулялась целиком из-за недоступности связи поставщиков.
export const BASE_MATERIAL_COLUMNS = [
  'id',
  'name',
  'category',
  'unit',
  'price',
  'supplier',
  'symbol',
  'price_history',
  'is_favorite',
  'is_kit_component',
].join(',');

export const MATERIAL_COLUMNS = [
  ...BASE_MATERIAL_COLUMNS.split(','),
  'material_suppliers(id,supplier_id,supplier_sku,supplier_price,is_preferred,created_at,supplier:suppliers(id,name,address,google_maps_url,phone,email,contact_person,is_archived))',
].join(',');

export const SERVICE_COLUMNS = ['id', 'name', 'price', 'is_favorite'].join(',');

// material_kit_items ma DWA FK do materials (kit_material_id/component_material_id) — zamiast
// rozwiązywać niejednoznaczny embed w jednym zapytaniu, trzymamy je jako osobny, płaski zasób
// (ten sam wzorzec odporności na brak migracji co listMaterials/BASE_MATERIAL_COLUMNS wyżej) i
// składamy "kit -> components" po stronie klienta z już wczytanej listy materials.
export const KIT_ITEM_COLUMNS = ['kit_material_id', 'component_material_id', 'quantity'].join(',');

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createCatalogRepository = ({ client = supabase, logger = console } = {}) => ({
  async listMaterials() {
    const result = await client.from('materials').select(MATERIAL_COLUMNS);
    if (result.error) {
      logger.error(result.error);
      // Graceful fallback: material_suppliers/suppliers mogły jeszcze nie zostać wdrożone (migracje
      // nie zostały wypchnięte) albo zapytanie z embed padło z innego powodu — podstawowa lista
      // materiałów i tak musi się wczytać, bez linków do dostawców.
      return unwrap(await client.from('materials').select(BASE_MATERIAL_COLUMNS)) || [];
    }
    return result.data || [];
  },

  async listServices() {
    return unwrap(await client.from('services').select(SERVICE_COLUMNS)) || [];
  },

  async listMaterialKitItems() {
    const result = await client.from('material_kit_items').select(KIT_ITEM_COLUMNS);
    if (result.error) {
      logger.error(result.error);
      // Migracja material_kit_items mogła jeszcze nie zostać wypchnięta — skład zestawu jest
      // czysto informacyjny (UI), więc jego brak nie może zablokować wczytania reszty katalogu.
      return [];
    }
    return result.data || [];
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
