import { describe, expect, it } from 'vitest';
import {
  CABINET_MODULE_TYPES,
  COUNTERTOP_SHEET_LENGTH_M,
  USABLE_SHEET_AREA_M2,
  buildCabinetCostBreakdown,
  calculateCabinetMaterialsCost,
  calculateCabinetWycena,
  computeModule,
  createCabinetModule,
  detectDrawerSystem,
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
    expect(result.legs).toBe(4);
  });

  it('base_doors: widening past 900mm switches legs from 4 to 6', () => {
    expect(computeModule(createCabinetModule('base_doors', { W: 900 })).legs).toBe(4);
    expect(computeModule(createCabinetModule('base_doors', { W: 901 })).legs).toBe(6);
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
    expect(result.legs).toBe(0);
  });

  it('countertop: linear meters scale with qty only in the summary, not per unit', () => {
    const result = computeModule(createCabinetModule('countertop', { W: 3000 }));
    expect(result.countertopMeters).toBeCloseTo(3, 5);
  });

  it('throws for an unknown module type instead of silently returning zeros', () => {
    expect(() => computeModule({ type: 'not_a_real_type' })).toThrow();
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
      // Pełny periметr typowej forматki korpusu byłby rzędu 2*(W+H) na sztukę — dla pierwszej
      // lepszej konfiguracji to zawsze grubo ponad to, co faktycznie liczy bodyEdgeMeters. Sama
      // wartość dodatnia + rozsądny rząd wielkości (mniej niż 2x cuttingMeters) jest wystarczającym
      // sygnałem, że nie kromkujemy wszystkich czterech boków każdej forматki.
      expect(result.bodyEdgeMeters).toBeGreaterThan(0);
      expect(result.bodyEdgeMeters).toBeLessThan(result.cuttingMeters);
    },
  );

  it('a representative multi-module kitchen keeps total edge meaningfully below cutting length', () => {
    // 3 dolne szafki, 2 górne, 1 słupek, 1 blat — zestaw bliski realnej kuchni ze zgłoszenia.
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { qty: 2 }),
      createCabinetModule('base_drawers', { qty: 1 }),
      createCabinetModule('wall_cabinet', { qty: 2 }),
      createCabinetModule('tall_cabinet', { H: 2445, doors: 3, qty: 1 }),
      createCabinetModule('countertop', { W: 3255, qty: 1 }),
    ]);
    // Przed poprawkami ten stosunek wychodził bliski 1 (obrzeże ~= cięcie); po poprawkach jest
    // wyraźnie niższy, bo korpus kromkuje tylko 1 krawędź na formatkę, a blat już nie dokłada nic.
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
    expect(summary.legs).toBe(12); // 2x4 (base_doors, 600mm) + 1x4 (base_drawers, 600mm)
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
    externalDrawerSetPrice: 45,
    internalDrawerSetPrice: 999, // nieużywane w tym fixture (internalDrawerSets=0) — strażnik na błędne zliczenie
    countertopQuantity: 0,
    countertopPrice: 150,
    cuttingServicePricePerMeter: 2,
    edgingServicePricePerMeter: 1.5,
  };

  it('prices materials (sheets, edge, hinges, drawer sets) and services (cutting, edging) separately', () => {
    const cost = calculateCabinetMaterialsCost(summary, prices);
    expect(cost.materialsTotal).toBeCloseTo(817.3552, 2);
    expect(cost.servicesTotal).toBeCloseTo(86.3648, 2);
  });

  it('prices the countertop as quantity x price — caller resolves quantity honestly per unit', () => {
    const withCountertop = calculateCabinetMaterialsCost(summary, { ...prices, countertopQuantity: 3.26, countertopPrice: 150 });
    const without = calculateCabinetMaterialsCost(summary, prices);
    expect(withCountertop.materialsTotal - without.materialsTotal).toBeCloseTo(3.26 * 150, 2);
  });

  it('treats a missing price as 0 instead of throwing (material not selected yet)', () => {
    const cost = calculateCabinetMaterialsCost(summary, {});
    expect(cost.materialsTotal).toBe(0);
    expect(cost.servicesTotal).toBe(0);
  });

  it('prices external and internal drawer sets separately (e.g. MERIVOBOX E zewn. vs M wewn.)', () => {
    const tumbaSummary = summarizeCabinetModules([
      createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1 }),
    ]);
    const cost = calculateCabinetMaterialsCost(tumbaSummary, {
      externalDrawerSetPrice: 300, internalDrawerSetPrice: 210,
    });
    expect(cost.materialsTotal).toBeCloseTo(300 + 210, 6);
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

describe('buildCabinetCostBreakdown', () => {
  const summary = summarizeCabinetModules([
    createCabinetModule('base_doors', { qty: 2 }),
    createCabinetModule('base_drawers', { qty: 1 }),
  ]);
  const selections = {
    bodyMaterial: { name: 'PL W960 SM Biały', price: 180 },
    frontMaterial: { name: 'U702 ST9 Kaszmir', price: 220 },
    edgeMaterial: { name: 'ABS 2mm Biały', price: 3.5 },
    hinge: { name: 'BLUM Zawias 110°', price: 6 },
    drawerRunnerExternal: { name: 'Blum Tandem L-500', price: 45 },
    drawerRunnerInternal: { name: 'Blum Tandem L-500', price: 45 },
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
    expect(byKey('hinge')).toMatchObject({ quantity: summary.hinges, value: summary.hinges * 6 });
    expect(byKey('drawerRunnerExternal')).toMatchObject({ quantity: summary.externalDrawerSets, value: summary.externalDrawerSets * 45 });
    expect(byKey('drawerRunnerInternal')).toBeUndefined(); // internalDrawerSets=0 dla tego fixture — wiersz pominięty

    const cutting = breakdown.serviceRows.find(row => row.key === 'cutting');
    expect(cutting.value).toBeCloseTo(cutting.quantity * 2, 6);
  });

  it('shows two separate priced rows — Szuflada zewn. and Szuflada wewn. — the internal one only when internal sets exist', () => {
    const noInternalSummary = summarizeCabinetModules([
      createCabinetModule('base_drawers', { externalDrawers: 3, internalDrawers: 0 }),
    ]);
    const noInternalBreakdown = buildCabinetCostBreakdown(noInternalSummary, selections, 2);
    expect(noInternalBreakdown.materialRows.find(row => row.key === 'drawerRunnerInternal')).toBeUndefined();

    const withInternalSummary = summarizeCabinetModules([
      createCabinetModule('base_drawers', { externalDrawers: 1, internalDrawers: 1 }),
    ]);
    const withInternalBreakdown = buildCabinetCostBreakdown(withInternalSummary, {
      ...selections,
      drawerRunnerExternal: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
      drawerRunnerInternal: { name: 'MERIVOBOX M niska szuflada wewnętrzna', price: 210 },
    }, 2);
    const extRow = withInternalBreakdown.materialRows.find(row => row.key === 'drawerRunnerExternal');
    const intRow = withInternalBreakdown.materialRows.find(row => row.key === 'drawerRunnerInternal');
    expect(extRow).toMatchObject({ quantity: 1, unitPrice: 300, value: 300 });
    expect(intRow).toMatchObject({ quantity: 1, unitPrice: 210, value: 210 });
  });

  it('realistic scenario: 6 identical tumby, each with 1 external MERIVOBOX E + 1 internal MERIVOBOX M', () => {
    const summaryOf6 = summarizeCabinetModules(
      [createCabinetModule('base_drawers', { W: 600, H: 820, D: 520, externalDrawers: 1, internalDrawers: 1, qty: 6 })],
      { externalDrawerSystem: 'metal', internalDrawerSystem: 'metal' },
    );
    expect(summaryOf6.externalDrawerSets).toBe(6);
    expect(summaryOf6.internalDrawerSets).toBe(6);

    const breakdown = buildCabinetCostBreakdown(summaryOf6, {
      drawerRunnerExternal: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
      drawerRunnerInternal: { name: 'MERIVOBOX M niska szuflada wewnętrzna', price: 210 },
    }, 2);
    const extRow = breakdown.materialRows.find(row => row.key === 'drawerRunnerExternal');
    const intRow = breakdown.materialRows.find(row => row.key === 'drawerRunnerInternal');
    expect(extRow.value).toBeCloseTo(6 * 300, 6);
    expect(intRow.value).toBeCloseTo(6 * 210, 6);
  });

  it('marks HDF/Nogi/Zawieszki as informational — computed, but no price/selector', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2);
    expect(breakdown.infoRows.map(row => row.key)).toEqual(['hdf', 'legs', 'hangers']);
    expect(breakdown.infoRows.find(row => row.key === 'legs').quantityLabel).toBe(`${summary.legs} szt.`);
    breakdown.infoRows.forEach((row) => {
      expect(row).not.toHaveProperty('value');
      expect(row).not.toHaveProperty('unitPrice');
    });
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

  it('sums rows into totals that match calculateCabinetMaterialsCost for the equivalent flat prices', () => {
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2);
    const equivalentCost = calculateCabinetMaterialsCost(summary, {
      bodySheetPrice: 180, frontSheetPrice: 220, edgePricePerMeter: 3.5, hingePrice: 6,
      externalDrawerSetPrice: 45, internalDrawerSetPrice: 45,
      countertopQuantity: 0, countertopPrice: 150,
      cuttingServicePricePerMeter: 2, edgingServicePricePerMeter: 1.5,
    });
    // calculateCabinetMaterialsCost uses raw (unrounded) edge/cutting meters, breakdown rounds to
    // 2 decimals for display — expect them close, not bit-for-bit identical.
    expect(breakdown.materialsTotal).toBeCloseTo(equivalentCost.materialsTotal, 1);
    expect(breakdown.servicesTotal).toBeCloseTo(equivalentCost.servicesTotal, 1);
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

  it('never throws when no material/service has been selected yet', () => {
    const breakdown = buildCabinetCostBreakdown(summary, {}, 2);
    expect(breakdown.materialRows.every(row => row.item === null)).toBe(true);
    expect(breakdown.materialsTotal).toBe(0);
    expect(breakdown.wycena).toBe(0);
  });
});
