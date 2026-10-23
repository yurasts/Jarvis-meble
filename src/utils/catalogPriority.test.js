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
