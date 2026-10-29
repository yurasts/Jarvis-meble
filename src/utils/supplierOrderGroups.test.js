import { describe, expect, it } from 'vitest';
import {
  formatSupplierOrderText,
  groupMaterialsBySupplier,
  resolveMaterialSupplierLink,
} from './supplierOrderGroups';

const biPlast = { id: 's-bi-plast', name: 'Bi-Plast', phone: '600 100 200' };
const rehau = { id: 's-rehau', name: 'Rehau', phone: '600 300 400' };

const linkTo = (supplier, overrides = {}) => ({
  supplier_id: supplier.id,
  supplier,
  supplier_sku: '',
  is_preferred: false,
  ...overrides,
});

describe('resolveMaterialSupplierLink', () => {
  it('returns null when the catalog material has no linked suppliers', () => {
    expect(resolveMaterialSupplierLink({ id: 1 }, { id: 1, material_suppliers: [] })).toBeNull();
    expect(resolveMaterialSupplierLink({ id: 1 }, undefined)).toBeNull();
  });

  it('prefers the project-level override when it matches a linked supplier', () => {
    const catalogMaterial = {
      id: 1,
      material_suppliers: [linkTo(biPlast, { is_preferred: true }), linkTo(rehau)],
    };
    const link = resolveMaterialSupplierLink({ id: 1, supplier_id: rehau.id }, catalogMaterial);
    expect(link.supplier_id).toBe(rehau.id);
  });

  it('ignores an override that no longer matches a linked supplier', () => {
    const catalogMaterial = { id: 1, material_suppliers: [linkTo(biPlast, { is_preferred: true })] };
    const link = resolveMaterialSupplierLink({ id: 1, supplier_id: 'gone' }, catalogMaterial);
    expect(link.supplier_id).toBe(biPlast.id);
  });

  it('falls back to is_preferred, then the first link', () => {
    const preferred = { id: 1, material_suppliers: [linkTo(biPlast), linkTo(rehau, { is_preferred: true })] };
    expect(resolveMaterialSupplierLink({ id: 1 }, preferred).supplier_id).toBe(rehau.id);

    const noPreferred = { id: 1, material_suppliers: [linkTo(biPlast), linkTo(rehau)] };
    expect(resolveMaterialSupplierLink({ id: 1 }, noPreferred).supplier_id).toBe(biPlast.id);
  });
});

describe('groupMaterialsBySupplier', () => {
  const materialsById = new Map([
    [1, { id: 1, material_suppliers: [linkTo(biPlast, { is_preferred: true, supplier_sku: 'BP-1' })] }],
    [2, { id: 2, material_suppliers: [linkTo(rehau, { is_preferred: true })] }],
    [3, { id: 3, material_suppliers: [] }],
  ]);

  it('groups items by resolved supplier, sorted alphabetically with Bez dostawcy last', () => {
    const items = [
      { id: 2, name: 'Obrzeże', quantity: 10, unit: 'mb' },
      { id: 1, name: 'Płyta', quantity: 3, unit: 'szt' },
      { id: 3, name: 'Niestandardowy', quantity: 1, unit: 'szt' },
    ];

    const groups = groupMaterialsBySupplier(items, materialsById);

    expect(groups.map(g => g.supplier?.name || null)).toEqual(['Bi-Plast', 'Rehau', null]);
    expect(groups[0].entries).toEqual([{ item: items[1], index: 1, supplierSku: 'BP-1' }]);
    expect(groups[2].entries[0].item.name).toBe('Niestandardowy');
  });

  it('respects a project-level supplier override when grouping', () => {
    const multiSupplierMaterial = {
      id: 1,
      material_suppliers: [linkTo(biPlast, { is_preferred: true }), linkTo(rehau, { supplier_sku: 'RH-9' })],
    };
    const byId = new Map([[1, multiSupplierMaterial]]);
    const items = [{ id: 1, name: 'Płyta', quantity: 2, unit: 'szt', supplier_id: rehau.id }];

    const groups = groupMaterialsBySupplier(items, byId);

    expect(groups).toHaveLength(1);
    expect(groups[0].supplier.name).toBe('Rehau');
    expect(groups[0].entries[0].supplierSku).toBe('RH-9');
  });

  it('returns an empty list for an empty project', () => {
    expect(groupMaterialsBySupplier([], materialsById)).toEqual([]);
  });
});

describe('formatSupplierOrderText', () => {
  it('formats a numbered Polish order list without any prices', () => {
    const text = formatSupplierOrderText({
      projectName: 'Kuchnia Kowalska',
      items: [
        { name: 'ABS W960 SM', supplier_sku: 'BP-1', quantity: 24, unit: 'mb' },
        { name: 'Zawias puszkowy', supplier_sku: '', quantity: 12, unit: 'szt' },
      ],
    });

    expect(text).toBe([
      'Dzień dobry,',
      'proszę o przygotowanie zamówienia (Projekt: Kuchnia Kowalska):',
      '',
      '1. ABS W960 SM [Kod: BP-1] — 24 mb',
      '2. Zawias puszkowy — 12 szt',
      '',
      'Pozdrawiam',
    ].join('\n'));
    expect(text).not.toMatch(/\bzł\b/);
  });

  it('defaults the unit to szt and omits an empty supplier_sku', () => {
    const text = formatSupplierOrderText({
      projectName: 'Szafa',
      items: [{ name: 'Uchwyt', supplier_sku: '', quantity: 6 }],
    });

    expect(text).toContain('1. Uchwyt — 6 szt');
    expect(text).not.toContain('[Kod:');
  });

  it('produces just the header and footer for an empty item list', () => {
    const text = formatSupplierOrderText({ projectName: 'Test', items: [] });
    expect(text).toBe('Dzień dobry,\nproszę o przygotowanie zamówienia (Projekt: Test):\n\n\nPozdrawiam');
  });
});
