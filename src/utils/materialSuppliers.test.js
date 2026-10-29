import { describe, expect, it } from 'vitest';
import {
  materialHasSupplier,
  materialSupplierNames,
  normalizePreferredSupplierLinks,
} from './materialSuppliers';

const material = {
  supplier: 'Legacy',
  material_suppliers: [
    { supplier_id: 'a', is_preferred: true, supplier: { id: 'a', name: 'Alfa' } },
    { supplier_id: 'b', is_preferred: false, supplier: { id: 'b', name: 'Beta' } },
  ],
};

describe('material supplier helpers', () => {
  it('finds secondary suppliers by id or name', () => {
    expect(materialHasSupplier(material, 'b')).toBe(true);
    expect(materialHasSupplier(material, 'beta')).toBe(true);
    expect(materialHasSupplier(material, 'missing')).toBe(false);
    expect(materialSupplierNames(material)).toEqual(['Alfa', 'Beta']);
  });

  it('keeps exactly one preferred supplier and normalizes payload values', () => {
    expect(normalizePreferredSupplierLinks([
      { supplier_id: 'a', supplier_price: '12.50' },
      { supplier_id: 'b', supplier_sku: ' B-1 ', is_preferred: false },
    ])).toEqual([
      { supplier_id: 'a', supplier_sku: '', supplier_price: 12.5, is_preferred: true },
      { supplier_id: 'b', supplier_sku: 'B-1', supplier_price: null, is_preferred: false },
    ]);
  });
});
