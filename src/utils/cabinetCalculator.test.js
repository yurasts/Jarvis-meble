import { describe, expect, it } from 'vitest';
import {
  CABINET_MODULE_TYPES,
  USABLE_SHEET_AREA_M2,
  calculateCabinetMaterialsCost,
  calculateCabinetWycena,
  computeModule,
  createCabinetModule,
  getHingesPerDoor,
  summarizeCabinetModules,
} from './cabinetCalculator';

describe('getHingesPerDoor', () => {
  it('follows the Jarvis height brackets', () => {
    expect(getHingesPerDoor(900)).toBe(2);
    expect(getHingesPerDoor(901)).toBe(3);
    expect(getHingesPerDoor(1600)).toBe(3);
    expect(getHingesPerDoor(1601)).toBe(4);
    expect(getHingesPerDoor(2100)).toBe(4);
    expect(getHingesPerDoor(2101)).toBe(5);
  });

  it('auto-adjusts the hinge count when the door/front height changes from 720mm to 2400mm', () => {
    const low = computeModule(createCabinetModule('wall_cabinet', { H: 720 }));
    const tall = computeModule(createCabinetModule('wall_cabinet', { H: 2400 }));
    expect(low.hinges).toBe(2);
    expect(tall.hinges).toBe(5);
  });
});

describe('computeModule — W x H x D to m2', () => {
  it('base_doors: body/front/HDF areas, edge and cutting lengths for the default 600x820x520', () => {
    const result = computeModule(createCabinetModule('base_doors'));
    expect(result.bodyAreaM2).toBeCloseTo(1.72136, 5);
    expect(result.frontAreaM2).toBeCloseTo(0.492, 5);
    expect(result.hdfAreaM2).toBeCloseTo(0.492, 5);
    expect(result.bodyEdgeMeters).toBeCloseTo(3.6652, 4);
    expect(result.frontEdgeMeters).toBeCloseTo(3.124, 4);
    expect(result.cuttingMeters).toBeCloseTo(8.752, 3);
    expect(result.hinges).toBe(2);
    expect(result.legs).toBe(4);
  });

  it('base_doors: widening past 900mm switches legs from 4 to 6', () => {
    expect(computeModule(createCabinetModule('base_doors', { W: 900 })).legs).toBe(4);
    expect(computeModule(createCabinetModule('base_doors', { W: 901 })).legs).toBe(6);
  });

  it('base_drawers: drawer runner sets match the drawer count, plus the lump drawer-box area', () => {
    const result = computeModule(createCabinetModule('base_drawers'));
    expect(result.drawerSets).toBe(3);
    expect(result.hinges).toBe(0);
    // 0.35 m2/drawer (body) + HDF bottoms — both folded into the panel-derived areas.
    expect(result.bodyAreaM2).toBeGreaterThan(0.35 * 3);
    expect(result.hdfAreaM2).toBeGreaterThan(0);
  });

  it('wall_cabinet: always exactly 1 komplet (2 szt.) of hangers, regardless of width', () => {
    expect(computeModule(createCabinetModule('wall_cabinet')).hangers).toBe(2);
    expect(computeModule(createCabinetModule('wall_cabinet', { W: 1200 })).hangers).toBe(2);
  });

  it('tall_cabinet: more shelves increase body area; drawers add runner sets without changing doors', () => {
    const noDrawers = computeModule(createCabinetModule('tall_cabinet', { drawers: 0 }));
    const withDrawers = computeModule(createCabinetModule('tall_cabinet', { drawers: 2 }));
    expect(withDrawers.drawerSets).toBe(2);
    expect(noDrawers.drawerSets).toBe(0);
    expect(withDrawers.bodyAreaM2).toBeGreaterThan(noDrawers.bodyAreaM2);
    expect(withDrawers.frontAreaM2).toBeCloseTo(noDrawers.frontAreaM2, 5);
  });

  it('countertop: reports linear meters from width, independent of qty (qty multiplies in the summary)', () => {
    const result = computeModule(createCabinetModule('countertop', { W: 3000 }));
    expect(result.countertopMeters).toBeCloseTo(3, 5);
    expect(result.hinges).toBe(0);
    expect(result.legs).toBe(0);
  });

  it('throws for an unknown module type instead of silently returning zeros', () => {
    expect(() => computeModule({ type: 'not_a_real_type' })).toThrow();
  });
});

describe('summarizeCabinetModules — sheet conversion', () => {
  it('ceils body/front/HDF area to whole sheets using the usable sheet area constants', () => {
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { qty: 2 }),
      createCabinetModule('base_drawers', { qty: 1 }),
    ]);
    expect(summary.bodyAreaM2).toBeCloseTo(5.93208, 4);
    expect(summary.frontAreaM2).toBeCloseTo(1.476, 3);
    expect(summary.hdfAreaM2).toBeCloseTo(2.2536, 3);
    expect(summary.bodySheets).toBe(2);
    expect(summary.frontSheets).toBe(1);
    expect(summary.hdfSheets).toBe(1);
    expect(summary.legs).toBe(12); // 2x4 (base_doors, 600mm) + 1x4 (base_drawers, 600mm)
    expect(summary.drawerSets).toBe(3);
    expect(summary.hinges).toBe(4); // 2 doors total x 2 hinges (H=820 <= 900mm bracket)
  });

  it('respects a custom usable sheet area override', () => {
    const modules = [createCabinetModule('base_doors', { qty: 10 })];
    const defaultSummary = summarizeCabinetModules(modules);
    const narrowerSummary = summarizeCabinetModules(modules, { usableSheetAreaM2: 2 });
    expect(narrowerSummary.bodySheets).toBeGreaterThan(defaultSummary.bodySheets);
    expect(defaultSummary.bodySheets).toBe(Math.ceil(defaultSummary.bodyAreaM2 / USABLE_SHEET_AREA_M2));
  });

  it('ignores modules with qty 0 and tolerates an empty list', () => {
    expect(summarizeCabinetModules([]).bodySheets).toBe(0);
    const summary = summarizeCabinetModules([createCabinetModule('base_doors', { qty: 0 })]);
    expect(summary.bodyAreaM2).toBe(0);
    expect(summary.bodySheets).toBe(0);
  });

  it('covers every documented module type without throwing', () => {
    Object.keys(CABINET_MODULE_TYPES).forEach((type) => {
      const summary = summarizeCabinetModules([createCabinetModule(type)]);
      expect(summary.bodySheets).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('calculateCabinetMaterialsCost + calculateCabinetWycena', () => {
  const summary = summarizeCabinetModules([
    createCabinetModule('base_doors', { qty: 2 }),
    createCabinetModule('base_drawers', { qty: 1 }),
  ]);
  const prices = {
    bodySheetPrice: 180,
    frontSheetPrice: 220,
    edgePricePerMeter: 3.5,
    hingePrice: 6,
    drawerSetPrice: 45,
    countertopPricePerMeter: 150,
    cuttingServicePricePerMeter: 2,
    edgingServicePricePerMeter: 1.5,
  };

  it('prices materials (sheets, edge, hinges, drawer sets, countertop) and services (cutting, edging) separately', () => {
    const cost = calculateCabinetMaterialsCost(summary, prices);
    expect(cost.materialsTotal).toBeCloseTo(817.3552, 2);
    expect(cost.servicesTotal).toBeCloseTo(86.3648, 2);
  });

  it('treats a missing price as 0 instead of throwing (material not selected yet)', () => {
    const cost = calculateCabinetMaterialsCost(summary, {});
    expect(cost.materialsTotal).toBe(0);
    expect(cost.servicesTotal).toBe(0);
  });

  it('computes the final Wycena with the same formula as the rest of the project: materials*multiplier + services', () => {
    const cost = calculateCabinetMaterialsCost(summary, prices);
    const wycena = calculateCabinetWycena({
      materialsTotal: cost.materialsTotal,
      servicesTotal: cost.servicesTotal,
      multiplier: 2,
    });
    expect(wycena).toBeCloseTo(cost.materialsTotal * 2 + cost.servicesTotal, 6);
    expect(wycena).toBeCloseTo(1721.0752, 2);
  });
});
