import { describe, expect, it, vi } from 'vitest';
import {
  createOrReuseCatalogItem,
  enrichCatalogWithUsage,
  normalizeCatalogName,
  sortCatalogByPriority,
} from './catalogPriority';

describe('catalogPriority', () => {
  it('normalizes whitespace and Polish case for duplicate detection', () => {
    expect(normalizeCatalogName('  Montaż   BLATU ')).toBe('montaż blatu');
  });

  it('orders favorites first, then frequently used items, then alphabetically', () => {
    const sorted = sortCatalogByPriority([
      { id: 1, name: 'Zeta', usage_count: 0 },
      { id: 2, name: 'Beta', usage_count: 2 },
      { id: 3, name: 'Alfa', usage_count: 2 },
      { id: 4, name: 'Omega', usage_count: 1, is_favorite: true },
      { id: 5, name: 'Delta', usage_count: 4, is_favorite: true },
    ]);

    expect(sorted.map(item => item.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('counts usage once per project', () => {
    const enriched = enrichCatalogWithUsage([{ id: 7 }], [
      { calc_materials: [{ id: 7 }, { id: 7 }] },
      { calc_materials: [{ id: 7 }] },
    ], 'calc_materials');
    expect(enriched[0].usage_count).toBe(2);
  });

  it('reuses a normalized duplicate without inserting it again', async () => {
    const repository = { createMaterial: vi.fn() };
    const existing = { id: 10, name: 'Płyta Biała', price: 20 };
    const result = await createOrReuseCatalogItem({
      kind: 'material',
      draft: { name: '  PŁYTA   BIAŁA ', price: 25 },
      items: [existing],
      repository,
    });

    expect(result).toEqual({
      item: { ...existing, unit: 'szt', category: 'Inne' },
      created: false,
    });
    expect(repository.createMaterial).not.toHaveBeenCalled();
  });

  it('reuses a material with the same manufacturer symbol even when invoice wording differs', async () => {
    const repository = { createMaterial: vi.fn() };
    const existing = {
      id: 11,
      name: 'Zawias 110° nakładany Blum CLIP top BLUMOTION',
      symbol: '71B3550',
      category: 'Akcesoria',
      unit: 'szt',
    };

    const result = await createOrReuseCatalogItem({
      kind: 'material',
      draft: {
        name: 'Blum zawias nakładany z domykiem',
        symbol: '71B3550',
        category: 'Zawiasy',
        price: 12,
      },
      items: [existing],
      repository,
    });

    expect(result).toEqual({ item: existing, created: false });
    expect(repository.createMaterial).not.toHaveBeenCalled();
  });

  it('does not merge ABS offers that share a decor symbol but have different cross-sections', async () => {
    const saved = {
      id: 13,
      name: 'ABS U702 ST9 Kaszmir (43×2,0)',
      symbol: 'ABS U702 ST9',
      category: 'Obrzeże',
      unit: 'mb',
      price: 4,
      is_favorite: false,
    };
    const repository = { createMaterial: vi.fn(async () => saved) };

    const result = await createOrReuseCatalogItem({
      kind: 'material',
      draft: saved,
      items: [{
        id: 12,
        name: 'ABS U702 ST9 Kaszmir (23×0,8)',
        symbol: 'ABS U702 ST9',
        category: 'Obrzeże',
      }],
      repository,
    });

    expect(result).toEqual({ item: saved, created: true });
    expect(repository.createMaterial).toHaveBeenCalledOnce();
  });

  it('creates a service with safe defaults when no duplicate exists', async () => {
    const saved = { id: 12, name: 'Montaż', price: 120, is_favorite: false };
    const repository = { createService: vi.fn(async () => saved) };
    await expect(createOrReuseCatalogItem({
      kind: 'service', draft: { name: ' Montaż ', price: '120' }, repository,
    })).resolves.toEqual({
      item: { ...saved, unit: 'szt', category: 'Inne' },
      created: true,
    });
    expect(repository.createService).toHaveBeenCalledWith({
      name: 'Montaż', price: 120, is_favorite: false,
    });
  });
});
