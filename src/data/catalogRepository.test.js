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
});
