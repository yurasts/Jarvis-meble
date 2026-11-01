import { describe, expect, it } from 'vitest';
import {
  CABINET_MODULE_TYPES,
  COUNTERTOP_SHEET_LENGTH_M,
  USABLE_SHEET_AREA_M2,
  buildCabinetCostBreakdown,
  computeModule,
  createCabinetModule,
  detectDrawerSystem,
  drawerTypeToSystem,
  getHingesPerDoor,
  resolveCountertopQuantity,
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
    expect(result.frontLegs).toBe(2);
    expect(result.rearAxiloLegs).toBe(2);
  });

  // Etap B: nogi dzielą się 50/50 przód (zwykłe)/tył (Axilo) — ten sam próg szerokości co w Etapie A.
  it('base_doors: widening past 900mm splits legs 3+3 instead of 2+2', () => {
    const narrow = computeModule(createCabinetModule('base_doors', { W: 900 }));
    const wide = computeModule(createCabinetModule('base_doors', { W: 901 }));
    expect(narrow.frontLegs).toBe(2);
    expect(narrow.rearAxiloLegs).toBe(2);
    expect(wide.frontLegs).toBe(3);
    expect(wide.rearAxiloLegs).toBe(3);
  });

  it('base_drawers: external drawer sets match the default count, internal defaults to 0', () => {
    const result = computeModule(createCabinetModule('base_drawers'));
    expect(result.externalDrawerSets).toBe(3);
    expect(result.internalDrawerSets).toBe(0);
    expect(result.hinges).toBe(0);
    // Wood system (default): 0.35 m2/drawer (body) + HDF bottoms — folded into the panel-derived areas.
    expect(result.bodyAreaM2).toBeGreaterThan(0.35 * 3);
    expect(result.hdfAreaM2).toBeGreaterThan(0);
  });

  it('backward compat: a legacy module saved with only `drawers` (pre-split) maps to externalDrawers, internalDrawers=0', () => {
    const legacyModule = { type: 'base_drawers', W: 600, H: 820, D: 520, drawers: 5, qty: 1 };
    const result = computeModule(legacyModule);
    expect(result.externalDrawerSets).toBe(5);
    expect(result.internalDrawerSets).toBe(0);
  });

  it('wall_cabinet: always exactly 1 komplet (2 szt.) of hangers, regardless of width', () => {
    expect(computeModule(createCabinetModule('wall_cabinet')).hangers).toBe(2);
    expect(computeModule(createCabinetModule('wall_cabinet', { W: 1200 })).hangers).toBe(2);
  });

  it('tall_cabinet: more shelves increase body area; drawers add runner sets without changing doors', () => {
    const noDrawers = computeModule(createCabinetModule('tall_cabinet', { externalDrawers: 0 }));
    const withDrawers = computeModule(createCabinetModule('tall_cabinet', { externalDrawers: 2 }));
    expect(withDrawers.externalDrawerSets).toBe(2);
    expect(noDrawers.externalDrawerSets).toBe(0);
    expect(withDrawers.bodyAreaM2).toBeGreaterThan(noDrawers.bodyAreaM2);
    expect(withDrawers.frontAreaM2).toBeCloseTo(noDrawers.frontAreaM2, 5);
  });

  // Etap A liczył tall_cabinet na sztywno 4 nogi niezależnie od szerokości — Etap B ujednolicił
  // go z resztą typów podłogowych (base_doors/base_drawers/wardrobe_section), bo zgłoszenie mówi
  // wprost o tym samym podziale 50/50 dla WSZYSTKICH czterech typów.
  it('tall_cabinet: legs now split by width too (50/50, same threshold as the other floor types)', () => {
    const narrow = computeModule(createCabinetModule('tall_cabinet', { W: 600 }));
    const wide = computeModule(createCabinetModule('tall_cabinet', { W: 901 }));
    expect(narrow.frontLegs).toBe(2);
    expect(narrow.rearAxiloLegs).toBe(2);
    expect(wide.frontLegs).toBe(3);
    expect(wide.rearAxiloLegs).toBe(3);
  });

  it('tall_cabinet/wardrobe_section: external+internal drawers add box area but never touch doors-driven fronts/hinges', () => {
    ['tall_cabinet', 'wardrobe_section'].forEach((type) => {
      const noDrawers = computeModule(createCabinetModule(type, { externalDrawers: 0, internalDrawers: 0 }));
      const withDrawers = computeModule(createCabinetModule(type, { externalDrawers: 1, internalDrawers: 1 }));
      expect(withDrawers.frontAreaM2).toBeCloseTo(noDrawers.frontAreaM2, 5);
      expect(withDrawers.hinges).toBe(noDrawers.hinges);
      expect(withDrawers.externalDrawerSets).toBe(1);
      expect(withDrawers.internalDrawerSets).toBe(1);
      expect(withDrawers.bodyAreaM2).toBeGreaterThan(noDrawers.bodyAreaM2);
    });
  });

  // Realny przypadek ze zgłoszenia: Słupek H=2445, doors=3 (dół/środek/góra, ułożone jedna NAD
  // drugą) liczył błędnie 3 fronty PEŁNEJ wysokości (3 × getHingesPerDoor(2445)=5 = 15 zawiasów).
  // Front w słupku dzieli WYSOKOŚĆ (H / doors), nie szerokość — stąd ~815mm na front -> 2 zawiasy.
  it('tall_cabinet: doors stack by HEIGHT (H / doors), not by width — fixes a 15-hinge over-count', () => {
    const result = computeModule(createCabinetModule('tall_cabinet', { H: 2445, doors: 3, shelves: 0 }));
    expect(result.hinges).toBe(6); // 3 fronty × 2 zawiasy (815mm <= 900mm bracket)
    // Całkowita powierzchnia frontu się nie zmienia (ten sam W × H niezależnie od podziału).
    expect(result.frontAreaM2).toBeCloseTo((600 * 2445) / 1_000_000, 5);
  });

  it('tall_cabinet: with doors=1 the height-split is a no-op (unchanged from before the fix)', () => {
    const result = computeModule(createCabinetModule('tall_cabinet', { H: 2100, doors: 1 }));
    expect(result.hinges).toBe(getHingesPerDoor(2100));
  });

  // Realny przypadek ze zgłoszenia: Blat 3255×600 błędnie dodawał W×D jako panel 'body' (dawał
  // dodatkowy arkusz w Korpus) i kromkę na całą szerokość (3.58 mb w Obrzeże ABS). Blat liczy
  // WYŁĄCZNIE metry bieżące swojej długości — zero wpływu na korpus/front/HDF/kromkę korpusu.
  it('countertop: contributes ONLY linear meters — zero body/front/HDF area and zero body edge', () => {
    const result = computeModule(createCabinetModule('countertop', { W: 3255, D: 600 }));
    expect(result.countertopMeters).toBeCloseTo(3.255, 5);
    expect(result.bodyAreaM2).toBe(0);
    expect(result.frontAreaM2).toBe(0);
    expect(result.hdfAreaM2).toBe(0);
    expect(result.bodyEdgeMeters).toBe(0);
    expect(result.frontEdgeMeters).toBe(0);
    expect(result.cuttingMeters).toBe(0);
    expect(result.hinges).toBe(0);
    expect(result.frontLegs).toBe(0);
    expect(result.rearAxiloLegs).toBe(0);
  });

  it('countertop: linear meters scale with qty only in the summary, not per unit', () => {
    const result = computeModule(createCabinetModule('countertop', { W: 3000 }));
    expect(result.countertopMeters).toBeCloseTo(3, 5);
  });

  it('throws for an unknown module type instead of silently returning zeros', () => {
    expect(() => computeModule({ type: 'not_a_real_type' })).toThrow();
  });

  describe('tipOnUnits — Etap B, krok 4.3: 1 szt. per door, only on door-bearing types, only when tipOn is set', () => {
    it('counts 1 TIP-ON per door when tipOn is set', () => {
      expect(computeModule(createCabinetModule('base_doors', { doors: 2, tipOn: true })).tipOnUnits).toBe(2);
      expect(computeModule(createCabinetModule('wall_cabinet', { doors: 1, tipOn: true })).tipOnUnits).toBe(1);
    });

    it('is 0 when the chip is off, even with doors present', () => {
      expect(computeModule(createCabinetModule('base_doors', { doors: 2 })).tipOnUnits).toBe(0);
    });

    it('is 0 for types without doors (base_drawers/countertop), even if tipOn is somehow set', () => {
      expect(computeModule(createCabinetModule('base_drawers', { tipOn: true })).tipOnUnits).toBe(0);
      expect(computeModule(createCabinetModule('countertop', { tipOn: true })).tipOnUnits).toBe(0);
    });
  });
});

describe('detectDrawerSystem', () => {
  it('detects ready metal box systems (MERIVOBOX/TANDEMBOX/LEGRABOX) by name, case-insensitively', () => {
    expect(detectDrawerSystem('MERIVOBOX E wysoka szuflada zewnętrzna')).toBe('metal');
    expect(detectDrawerSystem('merivobox m niska szuflada wewnętrzna')).toBe('metal');
    expect(detectDrawerSystem('Blum TANDEMBOX Antaro')).toBe('metal');
    expect(detectDrawerSystem('Hettich LEGRABOX')).toBe('metal');
  });

  it('treats plain TANDEM runners (no "BOX") and anything else as the wood (self-built box) system', () => {
    expect(detectDrawerSystem('Blum Tandem L-500')).toBe('wood');
    expect(detectDrawerSystem('')).toBe('wood');
    expect(detectDrawerSystem(undefined)).toBe('wood');
  });
});

describe('drawerTypeToSystem — Etap B per-module drawer type chip', () => {
  it('maps concrete types to their geometry system', () => {
    expect(drawerTypeToSystem('merivobox_e')).toBe('metal');
    expect(drawerTypeToSystem('merivobox_m')).toBe('metal');
    expect(drawerTypeToSystem('tandem')).toBe('wood');
  });

  it('returns null for "inherit" (or anything unrecognized) — caller falls back to the global system', () => {
    expect(drawerTypeToSystem('inherit')).toBeNull();
    expect(drawerTypeToSystem(undefined)).toBeNull();
  });
});

// Zgłoszenie: tumby z 1 zewnętrzną szufladą MERIVOBOX E (widoczny front) + 1 wewnętrzną MERIVOBOX M
// (schowana za nim) — геометрия короба zależy od wybranego w Bloku 1 systemu (metal vs wood).
describe('drawer box geometry — metal (MERIVOBOX/TANDEMBOX/LEGRABOX) vs wood (classic runners)', () => {
  const dims = { W: 600, H: 820, D: 520, externalDrawers: 1, internalDrawers: 0, qty: 1 };

  it('metal system: body board extra area is only bottom+back per drawer, zero HDF', () => {
    const zero = computeModule(createCabinetModule('base_drawers', { ...dims, externalDrawers: 0 }), { externalDrawerSystem: 'metal' });
    const one = computeModule(createCabinetModule('base_drawers', dims), { externalDrawerSystem: 'metal' });
    const expectedPerDrawerM2 = ((600 - 75) * (520 - 20)) / 1_000_000 + ((600 - 87) * 135) / 1_000_000;
    expect(one.bodyAreaM2 - zero.bodyAreaM2).toBeCloseTo(expectedPerDrawerM2, 6);
    expect(one.hdfAreaM2).toBe(zero.hdfAreaM2); // metal adds 0 m² HDF (dno z płyty, nie z HDF)
  });

  it('wood system (default, no options passed): legacy 0.35 m2/drawer lump, plus an HDF bottom', () => {
    const zero = computeModule(createCabinetModule('base_drawers', { ...dims, externalDrawers: 0 }));
    const one = computeModule(createCabinetModule('base_drawers', dims));
    expect(one.bodyAreaM2 - zero.bodyAreaM2).toBeCloseTo(0.35, 5);
    expect(one.hdfAreaM2).toBeGreaterThan(zero.hdfAreaM2);
  });

  it('internal drawers use the same per-system geometry as external, but never add front area', () => {
    const externalOnly = computeModule(
      createCabinetModule('base_drawers', { W: 600, H: 820, D: 520, externalDrawers: 1, internalDrawers: 0 }),
      { externalDrawerSystem: 'metal' },
    );
    const withInternal = computeModule(
      createCabinetModule('base_drawers', { W: 600, H: 820, D: 520, externalDrawers: 1, internalDrawers: 1 }),
      { externalDrawerSystem: 'metal', internalDrawerSystem: 'metal' },
    );
    expect(withInternal.frontAreaM2).toBeCloseTo(externalOnly.frontAreaM2, 6);
    expect(withInternal.bodyAreaM2).toBeGreaterThan(externalOnly.bodyAreaM2);
    expect(withInternal.externalDrawerSets).toBe(1);
    expect(withInternal.internalDrawerSets).toBe(1);
  });
});

// Zgłoszenie opisywało Obrzeże ABS (175.66 mb) niemal równe Cięcie płyty (181.59 mb) jako osobny,
// trzeci bug — "kromkowane są niewidoczne torcy detali korpusu". Audyt każdego typu modułu
// potwierdza, że korpus już liczy wyłącznie 1 widoczny, przedni torец (H dla boczyn, W-2t dla
// dna/wieka/półek) — dokładnie formuła z zadania. Jedynym realnym źródłem zawyżenia był blat
// (patrz testy countertop wyżej); ten blok to regresyjna blokada, nie nowa poprawka.
describe('body edge banding — only the front-visible edge, never the full perimeter', () => {
  it.each(Object.keys(CABINET_MODULE_TYPES).filter(type => type !== 'countertop'))(
    '%s: body edge is well below what a full-perimeter formula would give',
    (type) => {
      const module = createCabinetModule(type);
      const result = computeModule(module);
      if (result.bodyAreaM2 === 0) return;
      expect(result.bodyEdgeMeters).toBeGreaterThan(0);
      expect(result.bodyEdgeMeters).toBeLessThan(result.cuttingMeters);
    },
  );

  it('a representative multi-module kitchen keeps total edge meaningfully below cutting length', () => {
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { qty: 2 }),
      createCabinetModule('base_drawers', { qty: 1 }),
      createCabinetModule('wall_cabinet', { qty: 2 }),
      createCabinetModule('tall_cabinet', { H: 2445, doors: 3, qty: 1 }),
      createCabinetModule('countertop', { W: 3255, qty: 1 }),
    ]);
    expect(summary.edgeMeters / summary.cuttingMeters).toBeLessThan(0.9);
    expect(summary.countertopMeters).toBeCloseTo(3.255, 5);
  });
});

describe('resolveCountertopQuantity', () => {
  it('rounds linear meters to 2 decimals for a "mb"-priced countertop (cut to exact length)', () => {
    expect(resolveCountertopQuantity(3.255, 'mb')).toBeCloseTo(3.26, 2);
    expect(resolveCountertopQuantity(3.255, '')).toBeCloseTo(3.26, 2);
    expect(resolveCountertopQuantity(3.255, undefined)).toBeCloseTo(3.26, 2);
  });

  it('converts to whole sheets for a "szt"-priced countertop using the standard sheet length', () => {
    expect(resolveCountertopQuantity(8.5, 'szt')).toBe(Math.ceil(8.5 / COUNTERTOP_SHEET_LENGTH_M));
    expect(resolveCountertopQuantity(4.1, 'szt')).toBe(1);
    expect(resolveCountertopQuantity(4.2, 'szt')).toBe(2);
  });

  it('returns 0 for a non-positive length regardless of unit', () => {
    expect(resolveCountertopQuantity(0, 'szt')).toBe(0);
    expect(resolveCountertopQuantity(-1, 'mb')).toBe(0);
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
    expect(summary.frontLegs).toBe(6); // 2x2 (base_doors, 600mm) + 1x2 (base_drawers, 600mm)
    expect(summary.rearAxiloLegs).toBe(6);
    expect(summary.externalDrawerSets).toBe(3);
    expect(summary.internalDrawerSets).toBe(0);
    expect(summary.hinges).toBe(4); // 2 doors total x 2 hinges (H=820 <= 900mm bracket)
  });

  it('passes externalDrawerSystem/internalDrawerSystem options through to every module (metal = 0 HDF)', () => {
    const modules = [createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 0 })];
    const woodSummary = summarizeCabinetModules(modules);
    const metalSummary = summarizeCabinetModules(modules, { externalDrawerSystem: 'metal' });
    expect(metalSummary.hdfAreaM2).toBeLessThan(woodSummary.hdfAreaM2);
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

  describe('Etap B — progressive routing (płyta korpus/front/front góra, obrzeże korpus/front)', () => {
    it('bodyFromFrontBoard (global default) moves every module\'s body area into the front board pool', () => {
      const modules = [createCabinetModule('base_doors', { qty: 1 })];
      const normal = summarizeCabinetModules(modules);
      const routed = summarizeCabinetModules(modules, { bodyFromFrontBoard: true });
      expect(routed.bodyAreaM2).toBe(0);
      expect(routed.frontAreaM2).toBeCloseTo(normal.frontAreaM2 + normal.bodyAreaM2, 5);
    });

    it('a per-module chip (bodyFromFront: true) overrides the global default for just that module', () => {
      const perUnit = computeModule(createCabinetModule('base_doors'));
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 1, bodyFromFront: true }),
        createCabinetModule('base_doors', { qty: 1 }),
      ]); // global default stays OFF
      expect(summary.bodyAreaM2).toBeCloseTo(perUnit.bodyAreaM2, 5); // only the un-overridden module
      expect(summary.frontAreaM2).toBeCloseTo(perUnit.frontAreaM2 * 2 + perUnit.bodyAreaM2, 5);
    });

    it('edgeBodyFromFrontColor (global default) routes body edge meters into the front edge pool, total unchanged', () => {
      const modules = [createCabinetModule('base_doors', { qty: 1 })];
      const normal = summarizeCabinetModules(modules);
      const routed = summarizeCabinetModules(modules, { edgeBodyFromFrontColor: true });
      expect(routed.bodyEdgeMeters).toBe(0);
      expect(routed.frontEdgeMeters).toBeCloseTo(normal.frontEdgeMeters + normal.bodyEdgeMeters, 5);
      expect(routed.edgeMeters).toBeCloseTo(normal.edgeMeters, 5);
    });

    it('a per-module chip (edgeFromFront: true) overrides the global default for just that module', () => {
      const summary = summarizeCabinetModules([createCabinetModule('base_doors', { qty: 1, edgeFromFront: true })]);
      expect(summary.bodyEdgeMeters).toBe(0);
      expect(summary.frontEdgeMeters).toBeGreaterThan(0);
    });

    it('separateTopFrontBoard routes wall_cabinet fronts into the "top" pool automatically (always "góra")', () => {
      const modules = [
        createCabinetModule('wall_cabinet', { qty: 1 }),
        createCabinetModule('base_doors', { qty: 1 }),
      ];
      const normal = summarizeCabinetModules(modules);
      const routed = summarizeCabinetModules(modules, { separateTopFrontBoard: true });
      const wallUnit = computeModule(createCabinetModule('wall_cabinet'));
      expect(routed.frontTopAreaM2).toBeCloseTo(wallUnit.frontAreaM2, 5);
      expect(routed.frontAreaM2).toBeCloseTo(normal.frontAreaM2 - wallUnit.frontAreaM2, 5);
    });

    it('tall_cabinet/wardrobe_section use frontPosition ("dol" default vs "gora") to pick the board pool', () => {
      const dolSummary = summarizeCabinetModules(
        [createCabinetModule('tall_cabinet', { qty: 1, frontPosition: 'dol' })], { separateTopFrontBoard: true },
      );
      const goraSummary = summarizeCabinetModules(
        [createCabinetModule('tall_cabinet', { qty: 1, frontPosition: 'gora' })], { separateTopFrontBoard: true },
      );
      expect(dolSummary.frontTopAreaM2).toBe(0);
      expect(dolSummary.frontAreaM2).toBeGreaterThan(0);
      expect(goraSummary.frontAreaM2).toBe(0);
      expect(goraSummary.frontTopAreaM2).toBeGreaterThan(0);
    });

    it('without separateTopFrontBoard, nothing ever routes to the "top" pool, even for wall_cabinet', () => {
      const summary = summarizeCabinetModules([createCabinetModule('wall_cabinet', { qty: 1 })]);
      expect(summary.frontTopAreaM2).toBe(0);
      expect(summary.frontTopSheets).toBe(0);
    });
  });

  describe('Etap B — per-module drawer type override (externalDrawersByType/internalDrawersByType)', () => {
    it('modules without an override fall into "inherit"; overridden modules go into their own bucket', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1 }),
        createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1, drawerType: 'merivobox_e' }),
        createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1, drawerType: 'tandem' }),
      ]);
      expect(summary.externalDrawersByType.inherit).toBe(1);
      expect(summary.externalDrawersByType.merivobox_e).toBe(1);
      expect(summary.externalDrawersByType.tandem).toBe(1);
      expect(summary.externalDrawersByType.merivobox_m).toBe(0);
      expect(summary.externalDrawerSets).toBe(3); // total unaffected by the type split
    });

    it('a merivobox_e/merivobox_m override also switches that module\'s own box geometry to metal', () => {
      const inheritWood = computeModule(createCabinetModule('base_drawers', { externalDrawers: 1 }));
      const overridden = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1, drawerType: 'merivobox_e' }),
      ]); // global options empty -> would default to wood, override forces metal for this module
      expect(overridden.hdfAreaM2).toBeLessThan(inheritWood.hdfAreaM2);
    });

    it('internalDrawersByType separates M niska (default/explicit) from E wysoka per module', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1, qty: 1 }),
        createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1, qty: 1, internalDrawerType: 'merivobox_m' }),
        createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1, qty: 1, internalDrawerType: 'merivobox_e' }),
      ]);
      expect(summary.internalDrawersByType.inherit).toBe(1);
      expect(summary.internalDrawersByType.merivobox_m).toBe(1);
      expect(summary.internalDrawersByType.merivobox_e).toBe(1);
      expect(summary.internalDrawerSets).toBe(3);
    });
  });
});

describe('buildCabinetCostBreakdown', () => {
  const summary = summarizeCabinetModules([
    createCabinetModule('base_doors', { qty: 2 }),
    createCabinetModule('base_drawers', { qty: 1 }),
  ]);
  const selections = {
    bodyMaterial: { name: 'PL W960 SM Biały', price: 180 },
    frontMaterial: { name: 'U702 ST9 Kaszmir', price: 220 },
    frontMaterialTop: { name: 'U960 SM Biały', price: 230 },
    edgeMaterialBody: { name: 'ABS W960 SM', price: 1.13 },
    edgeMaterialFront: { name: 'ABS U702', price: 3.5 },
    edgeMaterialTop: { name: 'ABS U960', price: 3.6 },
    hinge: { name: 'BLUM Zawias 110°', price: 6 },
    externalDrawerByType: { inherit: { name: 'Blum Tandem L-500', price: 45 } },
    internalDrawerByType: { inherit: { name: 'Blum Tandem L-500', price: 45 } },
    legFront: { name: 'Nogi zwykłe', price: 1 },
    legRearAxilo: { name: 'Nóżka Axilo HAFELE H-100 mm', price: 4.19 },
    hdfMaterial: { name: 'HDF BIAŁY 2850x2070x3mm', price: 56.73 },
    hangerMaterial: { name: 'ZAWIESZKA CAMAR 806 KPL', price: 8 },
    tipOnMaterial: { name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', price: 14.19 },
    countertop: { name: 'Blat laminowany', price: 150, unit: 'mb' },
    cuttingService: { name: 'Cięcie płyty', price: 2 },
    edgingService: { name: 'Oklejanie PCV', price: 1.5 },
  };

  it('builds one row per Blok 1 material/service, each with a quantity label, unit price and value', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2);
    const byKey = key => breakdown.materialRows.find(row => row.key === key);

    expect(byKey('bodySheet')).toMatchObject({ item: selections.bodyMaterial, quantity: summary.bodySheets, unitPrice: 180 });
    expect(byKey('bodySheet').quantityLabel).toBe(`${summary.bodySheets} ark. (${summary.bodyAreaM2.toFixed(2)} m²)`);
    expect(byKey('frontSheet').quantityLabel).toBe(`${summary.frontSheets} ark. (${summary.frontAreaM2.toFixed(2)} m²)`);
    expect(byKey('frontTopSheet')).toBeUndefined(); // frontTopSheets=0 — separateTopFrontBoard not used here
    expect(byKey('hinge')).toMatchObject({ quantity: summary.hinges, value: summary.hinges * 6 });
    expect(byKey('drawerExt_inherit')).toMatchObject({ quantity: summary.externalDrawerSets, value: summary.externalDrawerSets * 45 });
    expect(byKey('drawerInt_inherit')).toBeUndefined(); // internalDrawerSets=0 for this fixture

    const cutting = breakdown.serviceRows.find(row => row.key === 'cutting');
    expect(cutting.value).toBeCloseTo(cutting.quantity * 2, 6);
  });

  it('HDF/Nogi (przednie+Axilo)/Zawieszki are real priced rows now, not informational-only (Etap A)', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2);
    const hdfRow = breakdown.materialRows.find(row => row.key === 'hdf');
    const legFrontRow = breakdown.materialRows.find(row => row.key === 'legFront');
    const legRearRow = breakdown.materialRows.find(row => row.key === 'legRearAxilo');
    expect(hdfRow).toMatchObject({ quantity: summary.hdfSheets, unitPrice: 56.73 });
    expect(legFrontRow).toMatchObject({ quantity: summary.frontLegs, unitPrice: 1 });
    expect(legRearRow).toMatchObject({ quantity: summary.rearAxiloLegs, unitPrice: 4.19 });
    expect(legFrontRow.value).toBeCloseTo(summary.frontLegs * 1, 6);
    expect(legRearRow.value).toBeCloseTo(summary.rearAxiloLegs * 4.19, 6);
    // base_doors/base_drawers never produce hangers -> row hidden (qty 0, filtered out).
    expect(breakdown.materialRows.find(row => row.key === 'hanger')).toBeUndefined();
  });

  it('creates a separate priced row per drawer TYPE, shown only when its own quantity is > 0', () => {
    const withTypes = summarizeCabinetModules([
      createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1 }),
      createCabinetModule('base_drawers', { externalDrawers: 1, qty: 1, drawerType: 'merivobox_e' }),
    ]);
    const breakdown = buildCabinetCostBreakdown(withTypes, {
      externalDrawerByType: {
        inherit: { name: 'Blum Tandem L-500', price: 45 },
        merivobox_e: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
      },
    }, 2);
    const inheritRow = breakdown.materialRows.find(row => row.key === 'drawerExt_inherit');
    const eRow = breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_e');
    expect(inheritRow).toMatchObject({ quantity: 1, unitPrice: 45, value: 45 });
    expect(eRow).toMatchObject({ quantity: 1, unitPrice: 300, value: 300 });
    expect(breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_m')).toBeUndefined();
    expect(breakdown.materialRows.find(row => row.key === 'drawerExt_tandem')).toBeUndefined();
  });

  // Dokładnie scenariusz ze zgłoszenia: jedna tumba z niską wewnętrzną M (210 zł), druga z wysoką
  // wewnętrzną E ze szkłem (290 zł) — każda wyceniona swoją własną pozycją katalogu.
  it('realistic scenario: one tumba with internal M niska (210 zł), another with internal E wysoka (290 zł)', () => {
    const summaryMixed = summarizeCabinetModules([
      createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1, internalDrawerType: 'merivobox_m', qty: 1 }),
      createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1, internalDrawerType: 'merivobox_e', qty: 1 }),
    ]);
    const breakdown = buildCabinetCostBreakdown(summaryMixed, {
      internalDrawerByType: {
        merivobox_m: { name: 'MERIVOBOX M niska szuflada wewnętrzna', price: 210 },
        merivobox_e: { name: 'MERIVOBOX E wysoka szuflada wewnętrzna ze szkłem', price: 290 },
      },
    }, 2);
    const mRow = breakdown.materialRows.find(row => row.key === 'drawerInt_merivobox_m');
    const eRow = breakdown.materialRows.find(row => row.key === 'drawerInt_merivobox_e');
    expect(mRow).toMatchObject({ quantity: 1, value: 210 });
    expect(eRow).toMatchObject({ quantity: 1, value: 290 });
  });

  it('TIP-ON is a real priced row, 1 per door, only when tipOn is set on a door-bearing module', () => {
    const tipOnSummary = summarizeCabinetModules([createCabinetModule('base_doors', { doors: 2, tipOn: true, qty: 1 })]);
    const breakdown = buildCabinetCostBreakdown(tipOnSummary, {
      tipOnMaterial: { name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', price: 14.19 },
    }, 2);
    const row = breakdown.materialRows.find(r => r.key === 'tipOn');
    expect(row).toMatchObject({ quantity: 2, unitPrice: 14.19, value: 2 * 14.19 });
  });

  // Etap B, krok 1.4: w rozliczeniu widać tylko pozycje realnie użyte w projekcie.
  it('never shows a row with zero quantity', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2);
    breakdown.materialRows.forEach(row => expect(row.quantity).toBeGreaterThan(0));
    breakdown.serviceRows.forEach(row => expect(row.quantity).toBeGreaterThan(0));
  });

  it('shows no rows at all for an empty project', () => {
    const emptyBreakdown = buildCabinetCostBreakdown(summarizeCabinetModules([]), selections, 2);
    expect(emptyBreakdown.materialRows).toEqual([]);
    expect(emptyBreakdown.serviceRows).toEqual([]);
    expect(emptyBreakdown.materialsTotal).toBe(0);
  });

  it('shows whole sheets, not meters, when the countertop material is priced "szt"', () => {
    const summaryWithTop = summarizeCabinetModules([createCabinetModule('countertop', { W: 8500 })]);
    const breakdown = buildCabinetCostBreakdown(summaryWithTop, {
      ...selections,
      countertop: { name: 'Blat 4.1m', price: 600, unit: 'szt' },
    }, 2);
    const row = breakdown.materialRows.find(r => r.key === 'countertop');
    expect(row.quantity).toBe(3); // ceil(8.5 / 4.1)
    expect(row.quantityLabel).toBe('3 szt.');
    expect(row.value).toBeCloseTo(3 * 600, 6);
  });

  it('RAZEM equals materials*multiplier + services, the same formula used everywhere else', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 3);
    expect(breakdown.multiplier).toBe(3);
    expect(breakdown.materialsScaled).toBeCloseTo(breakdown.materialsTotal * 3, 6);
    expect(breakdown.wycena).toBeCloseTo(breakdown.materialsTotal * 3 + breakdown.servicesTotal, 6);
  });

  it('falls back to multiplier 2 when none/invalid is given, same as calculateProjectWycena', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, undefined);
    expect(breakdown.multiplier).toBe(2);
  });

  it('never throws when no material/service has been selected — rows with real quantity still show, just unpriced', () => {
    const breakdown = buildCabinetCostBreakdown(summary, {}, 2);
    expect(breakdown.materialRows.length).toBeGreaterThan(0);
    breakdown.materialRows.forEach((row) => {
      expect(row.item).toBeNull();
      expect(row.unitPrice).toBe(0);
      expect(row.value).toBe(0);
    });
    expect(breakdown.materialsTotal).toBe(0);
    expect(breakdown.wycena).toBe(0);
  });
});
