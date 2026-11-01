import { describe, expect, it } from 'vitest';
import { isKitMaterial, kitComponentsFor, kitComponentsTotal } from './materialKits';

const materials = [
  { id: 1, name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
  { id: 2, name: 'Prowadnice Merivobox L-500 40kg (kpl L+P)', price: 25, unit: 'kpl' },
  { id: 3, name: 'Boxcover Merivobox E biały do szkła (kpl L+P)', price: 10, unit: 'kpl' },
];
const materialKitItems = [
  { kit_material_id: 1, component_material_id: 2, quantity: 1 },
  { kit_material_id: 1, component_material_id: 3, quantity: 1 },
];

describe('kitComponentsFor', () => {
  it('resolves components for a kit, joining quantity with the full material row', () => {
    const result = kitComponentsFor(1, materialKitItems, materials);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.component.id === 2)).toMatchObject({ quantity: 1 });
    expect(result.find(r => r.component.id === 3)).toMatchObject({ quantity: 1 });
  });

  it('returns an empty list for a material with no kit items', () => {
    expect(kitComponentsFor(2, materialKitItems, materials)).toEqual([]);
  });

  it('drops rows whose component_material_id is not in the loaded materials list', () => {
    const dangling = [...materialKitItems, { kit_material_id: 1, component_material_id: 999, quantity: 1 }];
    expect(kitComponentsFor(1, dangling, materials)).toHaveLength(2);
  });

  it('compares ids as strings so bigint-as-string/number mismatches from the API never hide a component', () => {
    const stringIds = [{ kit_material_id: '1', component_material_id: '2', quantity: 1 }];
    expect(kitComponentsFor(1, stringIds, materials)).toHaveLength(1);
  });

  it('tolerates missing materialKitItems/materials without throwing', () => {
    expect(kitComponentsFor(1, undefined, undefined)).toEqual([]);
  });
});

describe('isKitMaterial', () => {
  it('is true only for a material id that owns kit items', () => {
    expect(isKitMaterial(1, materialKitItems)).toBe(true);
    expect(isKitMaterial(2, materialKitItems)).toBe(false);
  });
});

describe('kitComponentsTotal', () => {
  it('sums quantity x price across all components', () => {
    const components = kitComponentsFor(1, materialKitItems, materials);
    expect(kitComponentsTotal(components)).toBeCloseTo(25 + 10, 6);
  });

  it('returns 0 for an empty/undefined list', () => {
    expect(kitComponentsTotal([])).toBe(0);
    expect(kitComponentsTotal(undefined)).toBe(0);
  });
});
