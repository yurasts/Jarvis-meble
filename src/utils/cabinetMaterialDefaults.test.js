import { describe, expect, it } from 'vitest';
import { findCabinetDefaultMaterial } from './cabinetMaterialDefaults';

const materials = [
  { id: 'noise', name: 'Pierwsza przypadkowa pozycja' },
  { id: 'board', name: 'Płyta meblowa W960 SM Biały Klasyczny — 2800×2070×18 mm', symbol: 'PL W960 SM' },
  { id: 'edge', name: 'Obrzeże ABS W960 SM Biały — 23×0,8 mm', symbol: 'ABS W960 SM' },
  { id: 'hinge', name: 'Blum CLIP top BLUMOTION — zawias 110° nakładany, z cichym domykiem (71B3550)', symbol: '71B3550' },
  { id: 'leg-front', name: 'Nóżka meblowa cokołowa H=100 mm, standardowa (czarna)' },
  { id: 'leg-rear', name: 'Häfele AXILO — nóżka cokołowa regulowana H=100 mm (90–120 mm), z głowicą', symbol: 'Axilo HAFELE H-100' },
  { id: 'hdf', name: 'Płyta HDF biała jednostronna — 2850×2070×3 mm' },
  { id: 'hanger', name: 'Camar 806 — zawieszka szafki górnej z białymi zaślepkami (komplet L+P)', symbol: 'CAMAR 806' },
  { id: 'tip-on', name: 'Blum TIP-ON do drzwi — wersja długa z magnesem, biała (956A1004)', symbol: '956A1004' },
];

describe('findCabinetDefaultMaterial', () => {
  it.each([
    ['bodyMaterial', 'board'],
    ['edgeMaterialBody', 'edge'],
    ['hinge', 'hinge'],
    ['legFront', 'leg-front'],
    ['legRearAxilo', 'leg-rear'],
    ['hdfMaterial', 'hdf'],
    ['hangerMaterial', 'hanger'],
    ['tipOnMaterial', 'tip-on'],
  ])('finds the literary catalogue default for %s', (role, expectedId) => {
    expect(findCabinetDefaultMaterial(materials, role)?.id).toBe(expectedId);
  });

  it('keeps the legacy ordinary-leg name compatible during migration rollout', () => {
    expect(findCabinetDefaultMaterial([{ id: 'legacy', name: 'Nogi zwykłe' }], 'legFront')?.id)
      .toBe('legacy');
  });
});
