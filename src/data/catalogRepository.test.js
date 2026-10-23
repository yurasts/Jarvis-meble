import { describe, expect, it, vi } from 'vitest';
import {
  MATERIAL_COLUMNS,
  SERVICE_COLUMNS,
  createCatalogRepository,
} from './catalogRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('catalogRepository', () => {
  it('loads only material fields used by the application', async () => {
    const rows = [{ id: 1, name: 'Board' }];
    const select = vi.fn(async () => ({ data: rows, error: null }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createCatalogRepository({ client }).listMaterials()).resolves.toEqual(rows);
    expect(client.from).toHaveBeenCalledWith('materials');
    expect(select).toHaveBeenCalledWith(MATERIAL_COLUMNS);
  });

  it('loads only service fields used by the application', async () => {
    const rows = [{ id: 1, name: 'Assembly', price: 100 }];
    const select = vi.fn(async () => ({ data: rows, error: null }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(createCatalogRepository({ client }).listServices()).resolves.toEqual(rows);
    expect(client.from).toHaveBeenCalledWith('services');
    expect(select).toHaveBeenCalledWith(SERVICE_COLUMNS);
  });

  it('returns the persisted material after creation', async () => {
    const fields = { name: 'Board', price: 50, price_history: [] };
    const saved = { id: 7, ...fields };
    const single = vi.fn(async () => ({ data: saved, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const client = { from: vi.fn(() => ({ insert })) };

    await expect(createCatalogRepository({ client }).createMaterial(fields)).resolves.toEqual(saved);
    expect(insert).toHaveBeenCalledWith([fields]);
    expect(select).toHaveBeenCalledWith(MATERIAL_COLUMNS);
  });

  it('updates one material and propagates database errors', async () => {
    const databaseError = new Error('RLS denied');
    const single = vi.fn(async () => ({ data: null, error: databaseError }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) };

    await expect(createCatalogRepository({ client }).updateMaterial(7, { price: 75 }))
      .rejects.toBe(databaseError);
    expect(update).toHaveBeenCalledWith({ price: 75 });
    expect(eq).toHaveBeenCalledWith('id', 7);
    expect(select).toHaveBeenCalledWith(MATERIAL_COLUMNS);
  });

  it('creates and updates services with the selected application columns', async () => {
    const saved = { id: 8, name: 'Assembly', price: 90, is_favorite: true };
    const single = vi.fn(async () => ({ data: saved, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ insert, update })) };
    const repository = createCatalogRepository({ client });

    await expect(repository.createService({ name: 'Assembly', price: 90 })).resolves.toEqual(saved);
    await expect(repository.updateService(8, { is_favorite: true })).resolves.toEqual(saved);
    expect(insert).toHaveBeenCalledWith([{ name: 'Assembly', price: 90 }]);
    expect(update).toHaveBeenCalledWith({ is_favorite: true });
    expect(eq).toHaveBeenCalledWith('id', 8);
    expect(select).toHaveBeenCalledWith(SERVICE_COLUMNS);
  });

  it('updates material prices through one atomic RPC call', async () => {
    const saved = [{ id: 7, price: 75, price_history: [{ price: 50, date: '2026-10-11' }] }];
    const rpc = vi.fn(async () => ({ data: saved, error: null }));
    const client = { rpc };

    const updates = [{ materialId: 7, expectedPrice: 50, newPrice: 75 }];

    await expect(createCatalogRepository({ client }).updateMaterialPrices(updates)).resolves.toEqual(saved);
    expect(rpc).toHaveBeenCalledWith('update_material_prices', {
      p_updates: [{ material_id: 7, expected_price: 50, new_price: 75 }],
    });
  });

  it('propagates atomic price update errors', async () => {
    const databaseError = new Error('Material price update rejected for id 7');
    const client = { rpc: vi.fn(async () => ({ data: null, error: databaseError })) };

    await expect(createCatalogRepository({ client }).updateMaterialPrices([
      { materialId: 7, expectedPrice: 50, newPrice: 75 },
    ])).rejects.toBe(databaseError);
  });
});
