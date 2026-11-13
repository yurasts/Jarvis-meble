import { describe, expect, it } from 'vitest';
import { findCabinetDefaultMaterial } from './cabinetMaterialDefaults';

const materials = [
  { id: 'noise', name: 'Pierwsza przypadkowa pozycja' },
  { id: 'board', name: 'PL W960 SM Biały Klasyczny', symbol: 'PL W960 SM' },
  { id: 'edge', name: 'ABS W960 SM Biały (23×0,8)', symbol: 'ABS W960 SM' },
  { id: 'hinge-decoy', name: 'Stary opis 71B3550', symbol: 'OTHER' },
  { id: 'hinge', name: 'Zawias 110° nakładany, z cichym domykiem Blum CLIP top BLUMOTION', symbol: '71B3550' },
  { id: 'leg-front', name: 'Nóżka meblowa cokołowa H=100 mm, standardowa' },
  { id: 'leg-rear', name: 'Nóżka cokołowa regulowana H=100 mm Häfele AXILO', symbol: 'Axilo HAFELE H-100' },
  { id: 'hdf', name: 'HDF Biała (3 mm)' },
  { id: 'hanger-806', name: 'Zawieszka szafki górnej Camar 806', symbol: 'CAMAR 806' },
  { id: 'hanger', name: 'Zawieszka meblowa ukryta 240 kg, biała Camar 807', symbol: 'CAMAR 807' },
  { id: 'tip-on', name: 'Odbojnik TIP-ON długi z magnesem, biały Blum', symbol: '956A1004' },
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
  ])('finds the compact catalogue default for %s', (role, expectedId) => {
    expect(findCabinetDefaultMaterial(materials, role)?.id).toBe(expectedId);
  });

  it('prefers the exact hinge symbol over an earlier name-only match', () => {
    expect(findCabinetDefaultMaterial(materials, 'hinge')?.id).toBe('hinge');
  });

  it('falls back to the spring hinge article 71T3550 when 71B3550 is unavailable', () => {
    const springHinge = {
      id: 'spring-hinge',
      name: 'Zawias 110° nakładany, ze sprężyną Blum CLIP top',
      symbol: '71T3550',
    };
    expect(findCabinetDefaultMaterial([springHinge], 'hinge')?.id).toBe('spring-hinge');
  });

  it('keeps the legacy ordinary-leg name compatible during migration rollout', () => {
    expect(findCabinetDefaultMaterial([{ id: 'legacy', name: 'Nogi zwykłe' }], 'legFront')?.id)
      .toBe('legacy');
  });
});
