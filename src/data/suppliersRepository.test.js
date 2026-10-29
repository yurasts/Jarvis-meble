import { describe, expect, it, vi } from 'vitest';
import { createSuppliersRepository, SUPPLIER_COLUMNS } from './suppliersRepository';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('suppliersRepository', () => {
  it('lists suppliers with linked material counts', async () => {
    const supplierRows = [{ id: 's1', name: 'Alfa' }, { id: 's2', name: 'Beta' }];
    const order = vi.fn(async () => ({ data: supplierRows, error: null }));
    const supplierSelect = vi.fn(() => ({ order }));
    const linkSelect = vi.fn(async () => ({
      data: [{ supplier_id: 's1' }, { supplier_id: 's1' }],
      error: null,
    }));
    const client = {
      from: vi.fn(table => table === 'suppliers'
        ? { select: supplierSelect }
        : { select: linkSelect }),
    };

    await expect(createSuppliersRepository({ client }).list()).resolves.toEqual([
      { id: 's1', name: 'Alfa', material_count: 2 },
      { id: 's2', name: 'Beta', material_count: 0 },
    ]);
    expect(supplierSelect).toHaveBeenCalledWith(SUPPLIER_COLUMNS);
    expect(linkSelect).toHaveBeenCalledWith('supplier_id');
  });

  it('creates, updates and archives through explicit fields', async () => {
    const single = vi.fn(async () => ({ data: { id: 's1', name: 'Alfa' }, error: null }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const insert = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ insert, update })) };
    const repository = createSuppliersRepository({ client });

    await repository.create({ name: 'Alfa' });
    await repository.update('s1', { phone: '123' });
    await repository.setArchived('s1', true);

    expect(insert).toHaveBeenCalledWith([{ name: 'Alfa' }]);
    expect(update).toHaveBeenCalledWith({ phone: '123' });
    expect(update).toHaveBeenCalledWith({ is_archived: true });
  });
});
