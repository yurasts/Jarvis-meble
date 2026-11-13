import { describe, expect, it } from 'vitest';
import {
  CABINET_MODULE_TYPES,
  COUNTERTOP_SHEET_LENGTH_M,
  DEFAULT_KITCHEN_HEIGHTS,
  EDGE_WASTE_FACTOR,
  USABLE_SHEET_AREA_M2,
  buildCabinetCostBreakdown,
  computeCornerDepthMm,
  computeDrawersCount,
  computeKitchenHeights,
  computeLegsCount,
  computeModule,
  computeWallFreeSpace,
  createCabinetModule,
  detectDrawerSystem,
  drawerTypeToSystem,
  FRIDGE_STANDARD_OPTIONS,
  getHingesPerDoor,
  layoutCountertopSegments,
  layoutFloorBand,
  layoutUpperRow,
  reorderItems,
  resolveCountertopQuantity,
  summarizeCabinetModules,
  syncModuleHeights,
} from './cabinetCalculator';

// Etap L, krok 1 — panel "Wymiary wysokościowe kuchni": wysokości korpusów liczone z garści
// parametrów stolarskich (sufit/blat/nogi/pas roboczy/antresola), zamiast zahardkodowanych 820/720/2100.
describe('computeKitchenHeights', () => {
  it('with Jarvis defaults (blat 900, grubość 38, nogi 105): dolna szafka = 900 - 38 - 105 = 757mm', () => {
    const heights = computeKitchenHeights(DEFAULT_KITCHEN_HEIGHTS);
    expect(heights.bottomHeight).toBe(757);
  });

  it('bottomHeight never drops below the 400mm floor, even with an absurdly low countertop', () => {
    const heights = computeKitchenHeights({ ...DEFAULT_KITCHEN_HEIGHTS, countertopHeight: 300 });
    expect(heights.bottomHeight).toBe(400);
  });

  it('tall cabinet: full height to the ceiling (minus gap+legs) vs shortened when a mezzanine sits on top', () => {
    const heights = computeKitchenHeights(DEFAULT_KITCHEN_HEIGHTS);
    // 2600 - 20 - 105 = 2475
    expect(heights.tallFullHeight).toBe(2475);
    // 2475 - 400 (mezzanine) = 2075
    expect(heights.tallHeightWithMezzanine).toBe(2075);
  });

  it('wall cabinet: zone between countertop+backsplash and the ceiling, shortened when a mezzanine sits on top', () => {
    const heights = computeKitchenHeights(DEFAULT_KITCHEN_HEIGHTS);
    // 2600 - 20 - 900 - 600 = 1080
    expect(heights.wallZoneFull).toBe(1080);
    // 1080 - 400 (mezzanine) = 680
    expect(heights.wallHeightWithMezzanine).toBe(680);
  });

  it('mezzanineHeight passes through unchanged, as the antresola\'s own recommended height', () => {
    const heights = computeKitchenHeights({ ...DEFAULT_KITCHEN_HEIGHTS, mezzanineHeight: 450 });
    expect(heights.mezzanineHeight).toBe(450);
  });

  it('missing/partial input falls back to Jarvis defaults for the untouched fields', () => {
    const heights = computeKitchenHeights({ countertopHeight: 920 });
    // 920 - 38 (default) - 105 (default) = 777
    expect(heights.bottomHeight).toBe(777);
  });
});

// Etap Q, krok 2 — blendy/cokół PRZESTAŁY być osobną "instalacyjną" formułą (computeTrims, usunięte)
// i są teraz ZWYKŁYMI modułami (side_filler/top_filler/plinth_strip) — liczone przez TEN SAM
// computeModule co każda inna szafka, z geometrią identyczną do starych formuł computeTrims.
describe('side_filler / top_filler / plinth_strip (dawne "blendy i cokół", Etap Q)', () => {
  it('side_filler: pionowa listwa z Płyty frontu, kromkowana po obu pionowych torcach (2 x H)', () => {
    const module = createCabinetModule('side_filler', { W: 50, H: 2600 });
    const result = computeModule(module);
    expect(result.frontAreaM2).toBeCloseTo(0.13, 6); // 50 x 2600mm
    expect(result.frontEdgeMeters).toBeCloseTo(5.2 * EDGE_WASTE_FACTOR, 6); // 2 x 2.6m
    expect(result.bodyAreaM2).toBe(0);
  });

  it('top_filler: pozioma listwa z Płyty frontu na całą szerokość rzędu, kromkowana po 2 torcach (2 x W)', () => {
    const module = createCabinetModule('top_filler', { W: 3000, H: 50 });
    const result = computeModule(module);
    expect(result.frontAreaM2).toBeCloseTo(0.15, 6); // 3000 x 50mm
    expect(result.frontEdgeMeters).toBeCloseTo(6 * EDGE_WASTE_FACTOR, 6); // 2 x 3m
    expect(result.bodyAreaM2).toBe(0);
  });

  it('plinth_strip z płyty korpusu (domyślnie) trafia do body, kromkowana tylko po 1 (górnej) krawędzi', () => {
    const module = createCabinetModule('plinth_strip', { W: 3000, H: 105 });
    const result = computeModule(module);
    expect(result.bodyAreaM2).toBeCloseTo(0.315, 6); // 3000 x 105mm
    expect(result.bodyEdgeMeters).toBeCloseTo(3 * EDGE_WASTE_FACTOR, 6); // 1 x 3m
    expect(result.frontAreaM2).toBe(0);
  });

  it('plinth_strip z source="front" trafia do front, nie do body', () => {
    const module = createCabinetModule('plinth_strip', { W: 3000, H: 105, source: 'front' });
    const result = computeModule(module);
    expect(result.frontAreaM2).toBeCloseTo(0.315, 6);
    expect(result.frontEdgeMeters).toBeCloseTo(3 * EDGE_WASTE_FACTOR, 6);
    expect(result.bodyAreaM2).toBe(0);
  });
});

// Etap N, krok 3 — przestawianie szafek myszką (WallElevationCanvas) lub strzałkami w tabeli;
// reorderItems to czysta, nie-mutująca funkcja przesunięcia elementu w tablicy.
describe('reorderItems', () => {
  it('moves an item forward, shifting the items in between back by one', () => {
    expect(reorderItems(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward, shifting the items in between forward by one', () => {
    expect(reorderItems(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op when fromIndex equals toIndex', () => {
    expect(reorderItems(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('returns the list unchanged for out-of-bounds indices', () => {
    const items = ['a', 'b', 'c'];
    expect(reorderItems(items, -1, 1)).toEqual(items);
    expect(reorderItems(items, 0, 5)).toEqual(items);
    expect(reorderItems(items, 5, 0)).toEqual(items);
  });

  it('never mutates the input array', () => {
    const items = ['a', 'b', 'c'];
    reorderItems(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

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

// Etap F, krok 3 — na produkcji połowa zawiasów szafki dostaje spowalniacz (BLUMOTION), połowa
// zwykłą sprężynę; TIP-ON wyklucza spowalniacz na tej szafce (TIP-ON i BLUMOTION się wykluczają),
// więc WTEDY 100% zawiasów liczy się jako "ze sprężyną / zwykłe".
describe('softCloseHinges / springHinges — 50/50 split bez TIP-ON, 100% springHinges z TIP-ON', () => {
  it('without TIP-ON, an even hinge count splits exactly 50/50', () => {
    // wall_cabinet H=720 -> 2 zawiasy (<=900mm próg) -> 1 spowalniacz + 1 sprężyna.
    const result = computeModule(createCabinetModule('wall_cabinet', { H: 720 }));
    expect(result.hinges).toBe(2);
    expect(result.softCloseHinges).toBe(1);
    expect(result.springHinges).toBe(1);
  });

  it('without TIP-ON, an odd hinge count rounds the soft-close half UP (ceil) and the spring half DOWN (floor)', () => {
    // wall_cabinet H=2400 -> 5 zawiasów (nieparzysta) -> ceil(5/2)=3 spowalniacz, floor(5/2)=2 sprężyna.
    const result = computeModule(createCabinetModule('wall_cabinet', { H: 2400 }));
    expect(result.hinges).toBe(5);
    expect(result.softCloseHinges).toBe(3);
    expect(result.springHinges).toBe(2);
    expect(result.softCloseHinges + result.springHinges).toBe(result.hinges);
  });

  it('with TIP-ON on, 100% of the hinges go to springHinges (0 softCloseHinges) — BLUMOTION and TIP-ON are mutually exclusive', () => {
    const withoutTipOn = computeModule(createCabinetModule('wall_cabinet', { H: 2400, openingMethod: 'uchwyt' }));
    const withTipOn = computeModule(createCabinetModule('wall_cabinet', { H: 2400, openingMethod: 'tip_on' }));
    expect(withTipOn.hinges).toBe(withoutTipOn.hinges); // sama liczba zawiasów się nie zmienia
    expect(withTipOn.softCloseHinges).toBe(0);
    expect(withTipOn.springHinges).toBe(withTipOn.hinges);
  });

  it('summarizeCabinetModules sums softCloseHinges/springHinges across modules, splitting per-module BEFORE aggregating (not on the combined total)', () => {
    // 2 moduły, każdy z 3 zawiasami (nieparzyste): osobno ceil(3/2)=2 + floor(3/2)=1 KAŻDY, razem
    // 4 spowalniacz + 2 sprężyna. Zsumowanie najpierw (3+3=6) i dopiero podział dałoby 3+3 — inny
    // (błędny) wynik, bo każda fizyczna szafka ma WŁASNY, niezależny zestaw zawiasów.
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { H: 1600, doors: 1, qty: 1 }), // 3 zawiasy (901-1600 bracket)
      createCabinetModule('base_doors', { H: 1600, doors: 1, qty: 1 }),
    ]);
    const perUnit = computeModule(createCabinetModule('base_doors', { H: 1600, doors: 1 }));
    expect(perUnit.hinges).toBe(3);
    expect(summary.softCloseHinges).toBe(4); // 2 + 2, NIE ceil(6/2)=3
    expect(summary.springHinges).toBe(2); // 1 + 1, NIE floor(6/2)=3
    expect(summary.hinges).toBe(6);
  });

  it('summarizeCabinetModules: a module with TIP-ON contributes 0 to softCloseHinges and all its hinges to springHinges, alongside a non-TIP-ON module', () => {
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { H: 1600, doors: 1, qty: 1 }), // 3 zawiasy, bez TIP-ON -> 2 + 1
      createCabinetModule('base_doors', { H: 1600, doors: 1, qty: 1, openingMethod: 'tip_on' }), // 3 zawiasy, TIP-ON -> 0 + 3
    ]);
    expect(summary.softCloseHinges).toBe(2);
    expect(summary.springHinges).toBe(1 + 3);
    expect(summary.hinges).toBe(6);
  });

  it('qty > 1 multiplies the already-split per-unit counts, not the combined total', () => {
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { H: 1600, doors: 1, qty: 4 }), // per-unit 3 zawiasy -> 2+1, x4 qty
    ]);
    expect(summary.softCloseHinges).toBe(8); // 2 x 4
    expect(summary.springHinges).toBe(4); // 1 x 4
  });
});

describe('computeModule — W x H x D to m2', () => {
  it('base_doors: body/front/HDF areas, edge and cutting lengths for the default 600x820x520', () => {
    const result = computeModule(createCabinetModule('base_doors'));
    // Etap E: boki (boczki) kromkowane z 3 stron (H + 2*D) jednym ABS, nie tylko z przodu (H) —
    // patrz docs/decisions/ADR-010.md "Etap E, krok 4". base_doors domyślnie hdfInGroove=false
    // (HDF nakładany), więc dno/wieniec kromkowane tylko z przodu, a półka ma pełną głębokość D
    // (skracana o 20mm tylko przy wpuszczanym HDF).
    expect(result.bodyAreaM2).toBeCloseTo(1.73264, 5);
    expect(result.frontAreaM2).toBeCloseTo(0.492, 5);
    expect(result.hdfAreaM2).toBeCloseTo(0.492, 5);
    expect(result.bodyEdgeMeters).toBeCloseTo(5.9532, 4);
    expect(result.frontEdgeMeters).toBeCloseTo(3.124, 4);
    expect(result.cuttingMeters).toBeCloseTo(8.772, 3);
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
    const noDrawers = computeModule(createCabinetModule('tall_cabinet', { externalDrawersHigh: 0, externalDrawersLow: 0 }));
    const withDrawers = computeModule(createCabinetModule('tall_cabinet', { externalDrawersHigh: 1, externalDrawersLow: 1 }));
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
      const noDrawers = computeModule(createCabinetModule(type, { externalDrawersHigh: 0, externalDrawersLow: 0, internalDrawersHigh: 0, internalDrawersLow: 0 }));
      const withDrawers = computeModule(createCabinetModule(type, { externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 1 }));
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

  describe('tipOnUnits — Etap B/G: 1 szt. per door, only on door-bearing types, only when openingMethod is tip_on', () => {
    it('counts 1 TIP-ON per door when openingMethod is tip_on', () => {
      expect(computeModule(createCabinetModule('base_doors', { doors: 2, openingMethod: 'tip_on' })).tipOnUnits).toBe(2);
      expect(computeModule(createCabinetModule('wall_cabinet', { doors: 1, openingMethod: 'tip_on' })).tipOnUnits).toBe(1);
    });

    it('is 0 when openingMethod is not tip_on, even with doors present', () => {
      expect(computeModule(createCabinetModule('base_doors', { doors: 2 })).tipOnUnits).toBe(0);
    });

    it('is 0 for types without doors (base_drawers/countertop), even if openingMethod is somehow tip_on', () => {
      expect(computeModule(createCabinetModule('base_drawers', { openingMethod: 'tip_on' })).tipOnUnits).toBe(0);
      expect(computeModule(createCabinetModule('countertop', { openingMethod: 'tip_on' })).tipOnUnits).toBe(0);
    });
  });

  // Etap G, krok 2 — "Sposób otwierania drzwi" per szafka zastępuje starą flagę `tipOn`: steruje
  // podziałem zawiasów, dodatkowym osprzętem (uchwyty/TIP-ON/profil HAFELE) i, dla "Opuszczany
  // front", wysokością formatki frontu (+20mm na zwis pod dłoń).
  describe('openingMethod — Etap G, krok 2: 4 sposoby otwierania drzwi per szafka', () => {
    it('default openingMethod per type: uchwyt dla base_doors/tall_cabinet/wardrobe_section, opuszczany_front dla wall_cabinet', () => {
      expect(CABINET_MODULE_TYPES.base_doors.defaults.openingMethod).toBe('uchwyt');
      expect(CABINET_MODULE_TYPES.tall_cabinet.defaults.openingMethod).toBe('uchwyt');
      expect(CABINET_MODULE_TYPES.wardrobe_section.defaults.openingMethod).toBe('uchwyt');
      expect(CABINET_MODULE_TYPES.wall_cabinet.defaults.openingMethod).toBe('opuszczany_front');
    });

    it('opuszczany_front adds +20mm to the front door height (and thus front area) on base_doors/wall_cabinet/wardrobe_section', () => {
      ['base_doors', 'wall_cabinet', 'wardrobe_section'].forEach((type) => {
        const uchwyt = computeModule(createCabinetModule(type, { doors: 1, openingMethod: 'uchwyt' }));
        const opuszczany = computeModule(createCabinetModule(type, { doors: 1, openingMethod: 'opuszczany_front' }));
        const { W, H } = CABINET_MODULE_TYPES[type].defaults;
        expect(opuszczany.frontAreaM2 - uchwyt.frontAreaM2).toBeCloseTo((W * 20) / 1_000_000, 6);
        void H;
      });
    });

    it('tall_cabinet: opuszczany_front applies +20mm PER divided door (doors stack by height), not once to the whole H', () => {
      // H/doors=890mm (<=900 -> 2 zawiasy), +20mm=910mm (>900 -> 3 zawiasy) na KAŻDYM z 2 frontów.
      const uchwyt = computeModule(createCabinetModule('tall_cabinet', { H: 1780, doors: 2, openingMethod: 'uchwyt' }));
      const opuszczany = computeModule(createCabinetModule('tall_cabinet', { H: 1780, doors: 2, openingMethod: 'opuszczany_front' }));
      expect(uchwyt.hinges).toBe(4); // 2 fronty x 2 zawiasy
      expect(opuszczany.hinges).toBe(6); // 2 fronty x 3 zawiasy (próg 900mm przekroczony na KAŻDYM froncie)
    });

    it('tip_on: 100% zawiasów ze sprężyną (0 spowalniacz) — niezależnie od wysokości frontu', () => {
      const result = computeModule(createCabinetModule('base_doors', { doors: 2, H: 1600, openingMethod: 'tip_on' }));
      expect(result.softCloseHinges).toBe(0);
      expect(result.springHinges).toBe(result.hinges);
    });

    it('uchwyt / opuszczany_front / profil_hafele all split hinges 50/50 the same way', () => {
      ['uchwyt', 'opuszczany_front', 'profil_hafele'].forEach((openingMethod) => {
        const result = computeModule(createCabinetModule('base_doors', { doors: 1, H: 2400, openingMethod }));
        expect(result.hinges).toBe(5);
        expect(result.softCloseHinges).toBe(3);
        expect(result.springHinges).toBe(2);
      });
    });

    it('handleUnits: 1 szt. per door only for openingMethod uchwyt', () => {
      expect(computeModule(createCabinetModule('base_doors', { doors: 3, openingMethod: 'uchwyt' })).handleUnits).toBe(3);
      expect(computeModule(createCabinetModule('base_doors', { doors: 3, openingMethod: 'tip_on' })).handleUnits).toBe(0);
      expect(computeModule(createCabinetModule('base_doors', { doors: 3, openingMethod: 'opuszczany_front' })).handleUnits).toBe(0);
      expect(computeModule(createCabinetModule('base_doors', { doors: 3, openingMethod: 'profil_hafele' })).handleUnits).toBe(0);
    });

    it('hafeleProfileMeters: (W / 1000) linear meters only for openingMethod profil_hafele', () => {
      const result = computeModule(createCabinetModule('base_doors', { W: 800, openingMethod: 'profil_hafele' }));
      expect(result.hafeleProfileMeters).toBeCloseTo(0.8, 5);
      expect(computeModule(createCabinetModule('base_doors', { W: 800, openingMethod: 'uchwyt' })).hafeleProfileMeters).toBe(0);
    });

    it('openingMethod has no effect on types without doors (base_drawers/countertop)', () => {
      const noDoors = computeModule(createCabinetModule('base_drawers', { openingMethod: 'profil_hafele' }));
      expect(noDoors.handleUnits).toBe(0);
      expect(noDoors.hafeleProfileMeters).toBe(0);
      expect(noDoors.tipOnUnits).toBe(0);
    });

    // Etap AD, krok 1 — zgłoszenie (fronty.jpg): "Opuszczany front" (+20mm) ma sens WYŁĄCZNIE dla
    // Szafek górnych kuchni (`group: 'kitchen_top'`) — moduł kuchennych dolnych/słupków/antresoli
    // (nawet jeśli NADAL niesie stare `openingMethod: 'opuszczany_front'`, np. z zapisanego wcześniej
    // projektu) musi liczyć się tak, jakby był 'uchwyt' — patrz computeModule.
    it('"opuszczany_front" jest IGNOROWANE dla kuchennych grup innych niż kitchen_top (kitchen_bottom/kitchen_tall/kitchen_mezzanine)', () => {
      ['kitchen_bottom', 'kitchen_tall', 'kitchen_mezzanine'].forEach((group) => {
        const uchwyt = computeModule(createCabinetModule('base_doors', { doors: 1, openingMethod: 'uchwyt', group }));
        const opuszczany = computeModule(createCabinetModule('base_doors', { doors: 1, openingMethod: 'opuszczany_front', group }));
        expect(opuszczany.frontAreaM2).toBeCloseTo(uchwyt.frontAreaM2, 6);
        expect(opuszczany.handleUnits).toBe(uchwyt.handleUnits); // nadal liczy się jak "uchwyt" (1 szt/drzwi)
      });
    });

    it('"opuszczany_front" nadal DZIAŁA dla group: "kitchen_top" (Szafki górne) — jedyna grupa, dla której ma sens', () => {
      const uchwyt = computeModule(createCabinetModule('wall_cabinet', { doors: 1, openingMethod: 'uchwyt', group: 'kitchen_top' }));
      const opuszczany = computeModule(createCabinetModule('wall_cabinet', { doors: 1, openingMethod: 'opuszczany_front', group: 'kitchen_top' }));
      const { W } = CABINET_MODULE_TYPES.wall_cabinet.defaults;
      expect(opuszczany.frontAreaM2 - uchwyt.frontAreaM2).toBeCloseTo((W * 20) / 1_000_000, 6);
    });

    it('backward compat: a legacy module saved with only `tipOn: true` (pre-Etap-G, no openingMethod) migrates to openingMethod tip_on', () => {
      const legacyModule = { type: 'base_doors', W: 600, H: 820, D: 520, doors: 2, qty: 1, tipOn: true };
      const result = computeModule(legacyModule);
      expect(result.tipOnUnits).toBe(2);
      expect(result.softCloseHinges).toBe(0);
      expect(result.handleUnits).toBe(0);
    });
  });

  // Etap H, krok 3 — 4 nowe typy kuchenne: piekarnik/zlew/zmywarka/narożnik zaślepiony.
  describe('oven_cabinet — front TYLKO niskiej szuflady (140mm), reszta zasłonięta piekarnikiem', () => {
    it('front area is W x 140mm, not W x H — the oven itself covers the rest of the height', () => {
      const result = computeModule(createCabinetModule('oven_cabinet'));
      expect(result.frontAreaM2).toBeCloseTo((600 * 140) / 1_000_000, 6);
    });

    it('no doors/hinges at all (the drawer front has no hinge, the oven has none either)', () => {
      const result = computeModule(createCabinetModule('oven_cabinet'));
      expect(result.hinges).toBe(0);
    });

    it('defaults to 1 niska szuflada zewn. (externalDrawersLow), 0 wysokich — "pod piekarnikiem"', () => {
      const module = createCabinetModule('oven_cabinet');
      expect(module.externalDrawersHigh).toBe(0);
      expect(module.externalDrawersLow).toBe(1);
      const result = computeModule(module);
      expect(result.externalDrawerSets).toBe(1);
      expect(result.externalDrawerSetsLow).toBe(1);
      expect(result.externalDrawerSetsHigh).toBe(0);
    });

    it('defaults to hdfInGroove=true (like wall_cabinet/tall_cabinet) and has real HDF area', () => {
      expect(CABINET_MODULE_TYPES.oven_cabinet.defaults.hdfInGroove).toBe(true);
      expect(computeModule(createCabinetModule('oven_cabinet')).hdfAreaM2).toBeGreaterThan(0);
    });

    it('always exactly 4 legs (2 front + 2 Axilo), regardless of width', () => {
      const narrow = computeModule(createCabinetModule('oven_cabinet', { W: 600 }));
      const wide = computeModule(createCabinetModule('oven_cabinet', { W: 1200 }));
      expect(narrow.frontLegs).toBe(2);
      expect(narrow.rearAxiloLegs).toBe(2);
      expect(wide.frontLegs).toBe(2);
      expect(wide.rearAxiloLegs).toBe(2);
    });

    it('has no openingMethod/handle concept (no "doors" to attach a handle to)', () => {
      expect(CABINET_MODULE_TYPES.oven_cabinet.defaults.openingMethod).toBeUndefined();
      expect(computeModule(createCabinetModule('oven_cabinet')).handleUnits).toBe(0);
    });
  });

  describe('sink_cabinet — bez HDF, bez półek (zlewozmywak zajmuje całe wnętrze)', () => {
    it('contributes ZERO HDF area, even though it has a body', () => {
      const result = computeModule(createCabinetModule('sink_cabinet'));
      expect(result.bodyAreaM2).toBeGreaterThan(0);
      expect(result.hdfAreaM2).toBe(0);
    });

    it('has no shelves field at all (no "Półki" counter makes sense without an adjustable shelf)', () => {
      expect('shelves' in CABINET_MODULE_TYPES.sink_cabinet.defaults).toBe(false);
    });

    it('full W x H front (split by doors), with normal hinge/leg behavior', () => {
      const result = computeModule(createCabinetModule('sink_cabinet', { doors: 1 }));
      expect(result.frontAreaM2).toBeCloseTo((600 * 820) / 1_000_000, 5);
      expect(result.hinges).toBe(getHingesPerDoor(820));
      expect(result.frontLegs).toBe(2);
      expect(result.rearAxiloLegs).toBe(2);
    });

    it('opening method affects it exactly like base_doors (uchwyt -> 1 handle per door)', () => {
      const result = computeModule(createCabinetModule('sink_cabinet', { doors: 2, openingMethod: 'uchwyt' }));
      expect(result.handleUnits).toBe(2);
    });
  });

  // Etap AB, krok 3 — zgłoszenie (zmywarka.jpg): zmywarka to WOLNO STOJĄCY sprzęt AGD z WŁASNYM
  // korpusem — dawne 2 dystansowe traversy (listwy 600×100mm) USUNIĘTE z build(), bodyAreaM2 jest
  // teraz ZAWSZE 0 dla tego typu, nie "mniejsze niż front".
  describe('dishwasher_front — TYLKO front, bez boczków/dna/traweres/HDF/zawiasów/nóg', () => {
    it('zero hinges, zero legs, zero HDF — the appliance has its own carcass and feet', () => {
      const result = computeModule(createCabinetModule('dishwasher_front'));
      expect(result.hinges).toBe(0);
      expect(result.frontLegs).toBe(0);
      expect(result.rearAxiloLegs).toBe(0);
      expect(result.hdfAreaM2).toBe(0);
    });

    it('front area is the full W x H (1 piece), body area is ZERO (no furniture carcass at all)', () => {
      const result = computeModule(createCabinetModule('dishwasher_front', { W: 600, H: 720 }));
      expect(result.frontAreaM2).toBeCloseTo((600 * 720) / 1_000_000, 5);
      expect(result.bodyAreaM2).toBe(0);
    });

    it('has no "doors" field, but still counts as 1 front for handle/TIP-ON/profil HAFELE (frontCount)', () => {
      expect('doors' in CABINET_MODULE_TYPES.dishwasher_front.defaults).toBe(false);
      expect(computeModule(createCabinetModule('dishwasher_front', { openingMethod: 'uchwyt' })).handleUnits).toBe(1);
      expect(computeModule(createCabinetModule('dishwasher_front', { openingMethod: 'tip_on' })).tipOnUnits).toBe(1);
      expect(computeModule(createCabinetModule('dishwasher_front', { openingMethod: 'profil_hafele', W: 800 })).hafeleProfileMeters).toBeCloseTo(0.8, 5);
    });
  });

  describe('corner_blind_cabinet — narożnik z głuchą zaślepką i widoczną 100mm blendą', () => {
    it('frontWidth controls the opening door width independently from the total W', () => {
      const narrowDoor = computeModule(createCabinetModule('corner_blind_cabinet', { W: 1000, frontWidth: 300 }));
      const wideDoor = computeModule(createCabinetModule('corner_blind_cabinet', { W: 1000, frontWidth: 600 }));
      expect(wideDoor.frontAreaM2).toBeGreaterThan(narrowDoor.frontAreaM2);
    });

    it('exactly 1 door worth of hinges, regardless of frontWidth (always 1 opening door)', () => {
      const result = computeModule(createCabinetModule('corner_blind_cabinet', { H: 820 }));
      expect(result.hinges).toBe(getHingesPerDoor(820));
    });

    it('counts as 1 front for handle/TIP-ON/profil HAFELE, with no "doors" field', () => {
      expect('doors' in CABINET_MODULE_TYPES.corner_blind_cabinet.defaults).toBe(false);
      expect(computeModule(createCabinetModule('corner_blind_cabinet', { openingMethod: 'uchwyt' })).handleUnits).toBe(1);
    });

    it('legs split 50/50 same as other floor types: 4 at W<=900, 6 at W>900', () => {
      const narrow = computeModule(createCabinetModule('corner_blind_cabinet', { W: 900 }));
      const wide = computeModule(createCabinetModule('corner_blind_cabinet', { W: 901 }));
      expect(narrow.frontLegs).toBe(2);
      expect(narrow.rearAxiloLegs).toBe(2);
      expect(wide.frontLegs).toBe(3);
      expect(wide.rearAxiloLegs).toBe(3);
    });

    it('opuszczany_front still adds +20mm to the (single) front height, same as other door types', () => {
      const uchwyt = computeModule(createCabinetModule('corner_blind_cabinet', { H: 890, openingMethod: 'uchwyt' }));
      const opuszczany = computeModule(createCabinetModule('corner_blind_cabinet', { H: 890, openingMethod: 'opuszczany_front' }));
      expect(uchwyt.hinges).toBe(2); // 910<=900? no: H=890 -> doorHeight=890 <=900 -> 2
      expect(opuszczany.hinges).toBe(3); // doorHeight=910 -> >900 -> 3
    });
  });

  // Etap V, krok 2 — nowy typ pod wbudowaną lodówkę (178/194/194 XXL cm).
  describe('fridge_tall_cabinet — pod wbudowaną lodówkę (178/194/194 XXL cm)', () => {
    it('no back panel at all — hdfAreaM2 is always 0 (wentylacja za urządzeniem jest obowiązkowa)', () => {
      const result = computeModule(createCabinetModule('fridge_tall_cabinet'));
      expect(result.hdfAreaM2).toBe(0);
    });

    it('internal shelves are shortened by 60mm of depth (not the standard 20mm) for the condenser vent gap', () => {
      const D = 560;
      // t=18 (DEFAULT_BOARD_THICKNESS_MM): innerW = 600 - 2*18 = 564mm.
      const expectedShelfAreaM2 = (564 * (D - 60)) / 1_000_000;
      const withOneShelf = computeModule(createCabinetModule('fridge_tall_cabinet', { D, shelves: 0, W: 600, H: 2100 }));
      const withTwoShelves = computeModule(createCabinetModule('fridge_tall_cabinet', { D, shelves: 1, W: 600, H: 2100 }));
      // shelves:0 -> wciąż 1 (sztywna, konstrukcyjna) półka; shelves:1 -> 2 półki razem — różnica to
      // DOKŁADNIE 1 dodatkowa półka, o głębokości D-60 (nie standardowe D-20).
      expect(withTwoShelves.bodyAreaM2 - withOneShelf.bodyAreaM2).toBeCloseTo(expectedShelfAreaM2, 5);
    });

    it('frontCount is 2 (lower "zamrażarka" + upper "lodówka"), with no "doors" field at all', () => {
      expect('doors' in CABINET_MODULE_TYPES.fridge_tall_cabinet.defaults).toBe(false);
      const result = computeModule(createCabinetModule('fridge_tall_cabinet', { openingMethod: 'uchwyt' }));
      expect(result.handleUnits).toBe(2);
    });

    it('the 2 fronts split at bottomHeightMm — combined front area always equals W x H regardless of the split point', () => {
      const shortBottom = computeModule(createCabinetModule('fridge_tall_cabinet', { W: 600, H: 2100, bottomHeightMm: 700 }));
      const tallBottom = computeModule(createCabinetModule('fridge_tall_cabinet', { W: 600, H: 2100, bottomHeightMm: 900 }));
      expect(shortBottom.frontAreaM2).toBeCloseTo((600 * 2100) / 1_000_000, 5);
      expect(tallBottom.frontAreaM2).toBeCloseTo((600 * 2100) / 1_000_000, 5);
    });

    it('hinges = getHingesPerDoor(lower) + getHingesPerDoor(upper), reflecting the actual split point (not evenly divided)', () => {
      const H = 2100;
      const bottomHeightMm = 757;
      const result = computeModule(createCabinetModule('fridge_tall_cabinet', { W: 600, H, bottomHeightMm }));
      expect(result.hinges).toBe(getHingesPerDoor(bottomHeightMm) + getHingesPerDoor(H - bottomHeightMm));
    });

    it('legs split 50/50 same as other floor-standing types', () => {
      const narrow = computeModule(createCabinetModule('fridge_tall_cabinet', { W: 600 }));
      expect(narrow.frontLegs).toBe(2);
      expect(narrow.rearAxiloLegs).toBe(2);
    });

    // Etap V, krok 2 — przełączenie standardu (⚙️ "Standard lodówki do zabudowy" w UI) nadpisuje
    // W/D/fridgeNicheHeightMm NARAZ — logika aplikowania żyje w CabinetCalculator.jsx
    // (applyFridgeStandard), ale same dane (ten test) są czystą, testowalną stałą w jądrze.
    it('FRIDGE_STANDARD_OPTIONS: xxl_75_194 is 750mm wide (wider body for a 75cm side-by-side fridge)', () => {
      const standard178 = FRIDGE_STANDARD_OPTIONS.find(option => option.value === 'standard_178');
      const xl194 = FRIDGE_STANDARD_OPTIONS.find(option => option.value === 'xl_194');
      const xxl194 = FRIDGE_STANDARD_OPTIONS.find(option => option.value === 'xxl_75_194');
      expect(standard178).toMatchObject({ W: 600, D: 560, fridgeNicheHeightMm: 1780 });
      expect(xl194).toMatchObject({ W: 600, D: 560, fridgeNicheHeightMm: 1940 });
      expect(xxl194).toMatchObject({ W: 750, D: 560, fridgeNicheHeightMm: 1940 });
    });
  });

  // Wszystkie 10 typów (razem z 4 nowymi) muszą mieć ten sam kontrakt: throw dla nieznanego typu,
  // nigdy cichych zer. `covers every documented module type without throwing` (summarizeCabinetModules
  // describe niżej) już to pokrywa dla CAŁEGO rejestru — nie duplikujemy tu.
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
  const dims = { W: 600, H: 820, D: 520, externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 0, qty: 1 };

  it('metal system: body board extra area is only bottom+back per drawer, zero HDF', () => {
    const zero = computeModule(createCabinetModule('base_drawers', { ...dims, externalDrawersLow: 0 }), { externalDrawerSystem: 'metal' });
    const one = computeModule(createCabinetModule('base_drawers', dims), { externalDrawerSystem: 'metal' });
    const expectedPerDrawerM2 = ((600 - 75) * (520 - 20)) / 1_000_000 + ((600 - 87) * 135) / 1_000_000;
    expect(one.bodyAreaM2 - zero.bodyAreaM2).toBeCloseTo(expectedPerDrawerM2, 6);
    expect(one.hdfAreaM2).toBe(zero.hdfAreaM2); // metal adds 0 m² HDF (dno z płyty, nie z HDF)
  });

  it('wood system (default, no options passed): legacy 0.35 m2/drawer lump, plus an HDF bottom', () => {
    const zero = computeModule(createCabinetModule('base_drawers', { ...dims, externalDrawersLow: 0 }));
    const one = computeModule(createCabinetModule('base_drawers', dims));
    expect(one.bodyAreaM2 - zero.bodyAreaM2).toBeCloseTo(0.35, 5);
    expect(one.hdfAreaM2).toBeGreaterThan(zero.hdfAreaM2);
  });

  it('internal drawers use the same per-system geometry as external, but never add front area', () => {
    const externalOnly = computeModule(
      createCabinetModule('base_drawers', { W: 600, H: 820, D: 520, externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 0 }),
      { externalDrawerSystem: 'metal' },
    );
    const withInternal = computeModule(
      createCabinetModule('base_drawers', { W: 600, H: 820, D: 520, externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 1 }),
      { externalDrawerSystem: 'metal', internalDrawerSystem: 'metal' },
    );
    expect(withInternal.frontAreaM2).toBeCloseTo(externalOnly.frontAreaM2, 6);
    expect(withInternal.bodyAreaM2).toBeGreaterThan(externalOnly.bodyAreaM2);
    expect(withInternal.externalDrawerSets).toBe(1);
    expect(withInternal.internalDrawerSets).toBe(1);
  });
});

// Etap E, krok 4 — poprawka technologiczna: boczki korpusu ZAWSZE kromkowane z TRZECH stron
// (przedni pionowy torec H + górny/dolny poziomy torec D+D = H + 2*D) JEDNYM typem ABS — nikt na
// produkcji nie oklei przodu boczku inną kromką niż jego góry/dołu. To był realny błąd we
// wcześniejszej wersji (liczyła tylko H, "tylko przedni widoczny torec boczku" — mylące, bo u
// boczka widoczne/kromkowane są 3 torce, nie 1). Dno/wieniec: przedni torec zawsze (W-2t), tylny
// torec DODATKOWO tylko gdy HDF jest wpuszczane w rowek (patrz hdfInGroove — krok 3). Półki
// wewnętrzne: wyłącznie przedni torec, bez zmian.
describe('body edge banding — side panels edged on 3 sides, horizontals on front (+ back when HDF is grooved)', () => {
  // `plinth_strip` (Etap Q) jest wykluczony jak `countertop`: to płaska listwa na całą szerokość
  // ściany (1 panel, krawędź = cała szerokość), nie boksowana szafka z bokami/wieńcami — inwariant
  // "kromka < długość cięcia" z definicji nie trzyma się dla pojedynczej, bardzo szerokiej formatki.
  it.each(Object.keys(CABINET_MODULE_TYPES).filter(type => type !== 'countertop' && type !== 'plinth_strip'))(
    '%s: body edge is still well below the cutting length, despite 3-sided boczki (aggregate includes many lower-ratio panels too)',
    (type) => {
      const module = createCabinetModule(type);
      const result = computeModule(module);
      if (result.bodyAreaM2 === 0) return;
      expect(result.bodyEdgeMeters).toBeGreaterThan(0);
      expect(result.bodyEdgeMeters).toBeLessThan(result.cuttingMeters);
    },
  );

  it('a single side panel alone already needs more edge than its own cutting length (3 sides vs 2 dimensions) — the regression this formula fixes', () => {
    // H=820, D=520: edge (3 strony) = H + 2*D = 1860mm; cutting (jedna formatka) = H + D = 1340mm.
    // Przed poprawką liczono tylko H=820mm (1 strona) — błąd, który zaniżał realne zużycie ABS.
    const perUnit = computeModule(createCabinetModule('base_doors', { shelves: 0 }));
    // 2 boczki, bez półek: edge = 2*(H+2D)*1.1; sprawdzamy wprost względem nowej formuły.
    const expectedSideEdgeM = (2 * (820 + 2 * 520) * 1.1) / 1000;
    // Reszta (dno+wieniec, hdfInGroove=false domyślnie dla base_doors) też wchodzi w bodyEdgeMeters
    // — więc porównujemy, że boczki same w sobie STANOWIĄ WIĘKSZOŚĆ kromki korpusu, nie że to cała kromka.
    expect(perUnit.bodyEdgeMeters).toBeGreaterThan(expectedSideEdgeM * 0.9);
  });

  it('a representative multi-module kitchen: edge meters now meaningfully approach/exceed cutting length (3-sided boczki), not stay safely below it', () => {
    const summary = summarizeCabinetModules([
      createCabinetModule('base_doors', { qty: 2 }),
      createCabinetModule('base_drawers', { qty: 1 }),
      createCabinetModule('wall_cabinet', { qty: 2 }),
      createCabinetModule('tall_cabinet', { H: 2445, doors: 3, qty: 1 }),
      createCabinetModule('countertop', { W: 3255, qty: 1 }),
    ]);
    // Etap G, krok 2: wall_cabinet domyślnie "Opuszczany front" (+20mm wysokości frontu na 2 modułach
    // z qty: 2) podnosi obwód kromki frontu i długość formatki frontu względem poprzednich wartości.
    expect(summary.edgeMeters).toBeCloseTo(70.7212, 3);
    expect(summary.cuttingMeters).toBeCloseTo(62.748, 2);
    expect(summary.edgeMeters / summary.cuttingMeters).toBeGreaterThan(1.0);
    expect(summary.countertopMeters).toBeCloseTo(3.255, 5);
  });
});

// Etap E, krok 3 — sposób montażu HDF (plecy): "wpuszczany" (w rowek 8mm z każdej strony) vs
// "nakładany" (na styk, od tyłu). Wpływa na wymiar samej płyty HDF, na to czy tylny torec dna/
// wieńca jest odsłonięty (kromka), i na głębokość półek wewnętrznych (zapas pod rowek).
describe('hdfInGroove — sposób montażu HDF (wpuszczany w rowek vs nakładany)', () => {
  it('wall_cabinet i tall_cabinet domyślnie hdfInGroove=true; base_doors/base_drawers/wardrobe_section domyślnie false', () => {
    expect(CABINET_MODULE_TYPES.wall_cabinet.defaults.hdfInGroove).toBe(true);
    expect(CABINET_MODULE_TYPES.tall_cabinet.defaults.hdfInGroove).toBe(true);
    expect(CABINET_MODULE_TYPES.base_doors.defaults.hdfInGroove).toBe(false);
    expect(CABINET_MODULE_TYPES.base_drawers.defaults.hdfInGroove).toBe(false);
    expect(CABINET_MODULE_TYPES.wardrobe_section.defaults.hdfInGroove).toBe(false);

    expect(createCabinetModule('wall_cabinet').hdfInGroove).toBe(true);
    expect(createCabinetModule('tall_cabinet').hdfInGroove).toBe(true);
    expect(createCabinetModule('base_doors').hdfInGroove).toBe(false);
  });

  it('hdfInGroove=true shrinks the HDF panel to (W - 2t + 16) x (H - 2t + 16); false keeps full W x H', () => {
    const nakladany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, shelves: 0, hdfInGroove: false }));
    const wpuszczany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, shelves: 0, hdfInGroove: true }));
    // t=18 (DEFAULT_BOARD_THICKNESS_MM): wpuszczany = (600-36+16) x (820-36+16) = 580 x 800 mm.
    expect(nakladany.hdfAreaM2).toBeCloseTo((600 * 820) / 1_000_000, 6);
    expect(wpuszczany.hdfAreaM2).toBeCloseTo((580 * 800) / 1_000_000, 6);
    expect(wpuszczany.hdfAreaM2).toBeLessThan(nakladany.hdfAreaM2);
  });

  it('hdfInGroove=true adds a back edge (W-2t) on dno/wieniec on top of the front edge; false keeps only the front edge', () => {
    const nakladany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, D: 520, shelves: 0, hdfInGroove: false }));
    const wpuszczany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, D: 520, shelves: 0, hdfInGroove: true }));
    // Różnica to dokładnie 2x tylny torec dna/wieńca (2 formatki x W-2t=564mm), z zapasem +10%.
    const expectedExtraM = (2 * 564 * 1.1) / 1000;
    expect(wpuszczany.bodyEdgeMeters - nakladany.bodyEdgeMeters).toBeCloseTo(expectedExtraM, 5);
  });

  it('hdfInGroove=true shortens internal shelf depth by 20mm (area drops); false keeps full D', () => {
    const nakladany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, D: 520, shelves: 1, hdfInGroove: false }));
    const wpuszczany = computeModule(createCabinetModule('base_doors', { W: 600, H: 820, D: 520, shelves: 1, hdfInGroove: true }));
    const innerW = 0.6 - 2 * 0.018;
    const expectedDropM2 = innerW * 0.02; // 1 półka, głębokość krótsza o 20mm
    expect(nakladany.bodyAreaM2 - wpuszczany.bodyAreaM2).toBeCloseTo(expectedDropM2, 5);
  });

  it('an old saved module without the hdfInGroove field still computes using the type default (backward compat)', () => {
    const legacyWallCabinet = { type: 'wall_cabinet', W: 600, H: 720, D: 320, doors: 1, shelves: 2, qty: 1 };
    const withDefault = computeModule(legacyWallCabinet);
    const explicitTrue = computeModule({ ...legacyWallCabinet, hdfInGroove: true });
    expect(withDefault.hdfAreaM2).toBeCloseTo(explicitTrue.hdfAreaM2, 6);
    expect(withDefault.bodyEdgeMeters).toBeCloseTo(explicitTrue.bodyEdgeMeters, 6);
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
    // Etap E: boczki teraz kromkowane z 3 stron (nie wpływa na AREA), ale głębokość półki
    // base_doors (hdfInGroove=false domyślnie) nie jest już bezwarunkowo skracana o 20mm — stąd
    // bodyAreaM2 nieco wyższe niż przed Etapem E.
    expect(summary.bodyAreaM2).toBeCloseTo(5.95464, 4);
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
    const modules = [createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 0 })];
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

  describe('Etap H — per-module routing (płyta korpus/front, obrzeże korpus/front)', () => {
    // Etap H, krok 2 — globalne ustawienia (bodyFromFrontBoard/separateTopFrontBoard/
    // edgeBodyFromFrontColor) zniknęły: każdy moduł decyduje sam o sobie, bez globalnego fallbacku.
    it('bodyFromFront: true on a module routes just that module\'s body into front, others stay in body', () => {
      const perUnit = computeModule(createCabinetModule('base_doors'));
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 1, bodyFromFront: true }),
        createCabinetModule('base_doors', { qty: 1 }),
      ]);
      expect(summary.bodyAreaM2).toBeCloseTo(perUnit.bodyAreaM2, 5); // tylko moduł BEZ flagi
      expect(summary.frontAreaM2).toBeCloseTo(perUnit.frontAreaM2 * 2 + perUnit.bodyAreaM2, 5);
    });

    it('edgeFromFront: true on a module routes just that module\'s body edge into the front edge pool', () => {
      const summary = summarizeCabinetModules([createCabinetModule('base_doors', { qty: 1, edgeFromFront: true })]);
      expect(summary.bodyEdgeMeters).toBe(0);
      expect(summary.frontEdgeMeters).toBeGreaterThan(0);
    });

    // Etap I, krok 4 — bodyMaterialId/frontMaterialId/edgeMaterialBodyId/edgeMaterialFrontId i
    // bodyFromFront/edgeFromFront są teraz wstrzykiwane przez UI z konfiguracji GRUPY (patrz
    // CabinetCalculator.jsx), ale summarizeCabinetModules nadal grupuje płytę/kromkę po
    // RÓŻNYCH materiałach — dwa moduły z różnym frontMaterialId trafiają do dwóch różnych bucketów.
    it('two modules with different frontMaterialId land in two separate buckets (per-group material plurality)', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 1, frontMaterialId: 'dab-casella' }),
        createCabinetModule('base_doors', { qty: 1, frontMaterialId: 'u702-kaszmir' }),
      ]);
      const perUnit = computeModule(createCabinetModule('base_doors'));
      const buckets = summary.boardAreaByBucket;
      expect(buckets['front:dab-casella']).toBeCloseTo(perUnit.frontAreaM2, 5);
      expect(buckets['front:u702-kaszmir']).toBeCloseTo(perUnit.frontAreaM2, 5);
      expect(summary.frontAreaM2).toBeCloseTo(perUnit.frontAreaM2 * 2, 5);
    });
  });

  describe('Etap I, krok 3 — wall_cabinet/tall_cabinet hangerCount, wardrobe_section legsEnabled', () => {
    it('wall_cabinet defaults to 2 hangers (unchanged behaviour)', () => {
      expect(computeModule(createCabinetModule('wall_cabinet')).hangers).toBe(2);
    });

    it('wall_cabinet hangerCount: 0 removes hangers (np. "Antresola nad słupkiem")', () => {
      expect(computeModule(createCabinetModule('wall_cabinet', { hangerCount: 0 })).hangers).toBe(0);
    });

    it('tall_cabinet defaults to 0 hangers (floor-standing słupek, unchanged)', () => {
      expect(computeModule(createCabinetModule('tall_cabinet')).hangers).toBe(0);
    });

    it('tall_cabinet hangerCount: 2 adds hangers (np. "Słupek łazienkowy") without touching legs', () => {
      const unit = computeModule(createCabinetModule('tall_cabinet', { hangerCount: 2 }));
      expect(unit.hangers).toBe(2);
      expect(unit.frontLegs + unit.rearAxiloLegs).toBeGreaterThan(0);
    });

    it('wardrobe_section defaults to legs enabled (unchanged behaviour)', () => {
      const unit = computeModule(createCabinetModule('wardrobe_section'));
      expect(unit.frontLegs + unit.rearAxiloLegs).toBeGreaterThan(0);
    });

    it('wardrobe_section legsEnabled: false removes legs (np. "Pawlacz / Nadstawka")', () => {
      const unit = computeModule(createCabinetModule('wardrobe_section', { legsEnabled: false }));
      expect(unit.frontLegs).toBe(0);
      expect(unit.rearAxiloLegs).toBe(0);
    });
  });

  describe('Etap I, krok 3 — vanity_cabinet (szafka łazienkowa pod umywalkę)', () => {
    it('has no BACK-PANEL HDF (hdfAreaM2 comes only from the wood drawer boxes\' own bottom panels, same as a comparable base_drawers minus its back panel)', () => {
      const unit = computeModule(createCabinetModule('vanity_cabinet'));
      const comparableWithBackPanel = computeModule(
        createCabinetModule('base_drawers', { W: 800, H: 550, D: 460, externalDrawersHigh: 2, externalDrawersLow: 0 }),
      );
      expect(unit.hdfAreaM2).toBeGreaterThan(0);
      expect(unit.hdfAreaM2).toBeLessThan(comparableWithBackPanel.hdfAreaM2);
    });

    it('has drawer fronts (externalDrawerSets) but no hinges and no legs', () => {
      const unit = computeModule(createCabinetModule('vanity_cabinet'));
      expect(unit.externalDrawerSets).toBeGreaterThan(0);
      expect(unit.hinges).toBe(0);
      expect(unit.frontLegs).toBe(0);
      expect(unit.rearAxiloLegs).toBe(0);
    });

    it('hangs on 2 hangers by default', () => {
      expect(computeModule(createCabinetModule('vanity_cabinet')).hangers).toBe(2);
    });

    it('body edge is well below the cutting length (sanity check, same shape as other types)', () => {
      const unit = computeModule(createCabinetModule('vanity_cabinet'));
      expect(unit.bodyEdgeMeters).toBeGreaterThan(0);
      expect(unit.bodyEdgeMeters).toBeLessThan(unit.cuttingMeters);
    });
  });

  // Etap F, krok 4 — bez nadpisania (ani per-moduł materiału, ani wymuszonego chip-a typu) szuflady
  // dzielą się domyślnie wg DWÓCH liczników modułu (wysokie -> merivobox_e, niskie -> merivobox_m),
  // nie wg jednego wspólnego "inherit". Wymuszony chip typu nadal łączy WSZYSTKIE szuflady modułu
  // (wysokie+niskie razem) w JEDEN bucket.
  describe('Etap B/F — per-module drawer type override i domyślny podział wysokie/niskie (externalDrawersByType/internalDrawersByType)', () => {
    it('modules without an override split high/low into merivobox_e/merivobox_m; an overridden module forces its WHOLE drawer count into one bucket', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawersHigh: 1, externalDrawersLow: 1, qty: 1 }),
        createCabinetModule('base_drawers', { externalDrawersHigh: 1, externalDrawersLow: 1, qty: 1, drawerType: 'tandem' }),
      ]);
      expect(summary.externalDrawersByType.merivobox_e).toBe(1); // tylko "wysokie" modułu BEZ override
      expect(summary.externalDrawersByType.merivobox_m).toBe(1); // tylko "niskie" modułu BEZ override
      expect(summary.externalDrawersByType.tandem).toBe(2); // CAŁY moduł z override (1+1) trafia tu razem
      expect(summary.externalDrawersByType.inherit).toBe(0); // "inherit" nie jest już domyślną pulą
      expect(summary.externalDrawerSets).toBe(4); // total unaffected by the type split: 2 + 2
    });

    it('a merivobox_e/merivobox_m override also switches that module\'s own box geometry to metal', () => {
      const noOverride = computeModule(createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 1 }));
      const overridden = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 1, qty: 1, drawerType: 'merivobox_e' }),
      ]); // global options empty -> would default to wood, override forces metal for this module
      expect(overridden.hdfAreaM2).toBeLessThan(noOverride.hdfAreaM2);
    });

    it('internalDrawersByType splits high/low into merivobox_e/merivobox_m by default; an explicit override forces one bucket', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', {
          externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 1, internalDrawersLow: 1, qty: 1,
        }),
        createCabinetModule('base_drawers', {
          externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 1, internalDrawersLow: 1, qty: 1, internalDrawerType: 'merivobox_m',
        }),
      ]);
      expect(summary.internalDrawersByType.merivobox_e).toBe(1); // tylko z modułu bez override
      expect(summary.internalDrawersByType.merivobox_m).toBe(1 + 2); // 1 (niskie modułu 1) + 2 (CAŁY moduł 2, wymuszony)
      expect(summary.internalDrawerSets).toBe(2 + 2);
    });
  });

  // Etap F, krok 4 — szuflady różnej wysokości w JEDNEJ szafce (np. 2 wysokie MERIVOBOX E + 1
  // niska MERIVOBOX M w tej samej tumbie) — dokładnie scenariusz ze zgłoszenia.
  describe('externalDrawersHigh/externalDrawersLow — szuflady różnej wysokości w jednej szafce', () => {
    it('base_drawers defaults to 2 wysokie (E) + 1 niska (M) — standardowa tumba od razu ma mieszane wysokości', () => {
      const module = createCabinetModule('base_drawers');
      expect(module.externalDrawersHigh).toBe(2);
      expect(module.externalDrawersLow).toBe(1);
      const summary = summarizeCabinetModules([{ ...module, qty: 1 }]);
      expect(summary.externalDrawersByType.merivobox_e).toBe(2);
      expect(summary.externalDrawersByType.merivobox_m).toBe(1);
      expect(summary.externalDrawerSets).toBe(3);
    });

    it('the front panel count (and per-drawer height) reflects the COMBINED high+low total, not just one group', () => {
      const twoHighOneLow = computeModule(createCabinetModule('base_drawers', { externalDrawersHigh: 2, externalDrawersLow: 1 }));
      const threeLowOnly = computeModule(createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 3 }));
      // 3 szuflady w obu przypadkach -> ta sama liczba frontów i ta sama łączna wysokość frontów
      // (geometria nie rozróżnia "wysoka"/"niska" — to tylko etykieta katalogowa/cenowa).
      expect(twoHighOneLow.frontAreaM2).toBeCloseTo(threeLowOnly.frontAreaM2, 6);
      expect(twoHighOneLow.externalDrawerSets).toBe(3);
    });

    it('qty > 1 multiplies each group (high/low) independently, not just the combined total', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawersHigh: 2, externalDrawersLow: 1, qty: 3 }),
      ]);
      expect(summary.externalDrawersByType.merivobox_e).toBe(6); // 2 x 3
      expect(summary.externalDrawersByType.merivobox_m).toBe(3); // 1 x 3
      expect(summary.externalDrawerSets).toBe(9);
    });

    it('2 modules with different high/low splits aggregate correctly into the same 2 buckets', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', { externalDrawersHigh: 2, externalDrawersLow: 1, qty: 1 }), // tumba standardowa
        createCabinetModule('tall_cabinet', { externalDrawersHigh: 1, externalDrawersLow: 0, qty: 1 }), // słupek z 1 wysoką
        createCabinetModule('wardrobe_section', { externalDrawersHigh: 0, externalDrawersLow: 2, qty: 1 }), // szafa z 2 niskimi
      ]);
      expect(summary.externalDrawersByType.merivobox_e).toBe(2 + 1); // 2 (tumba) + 1 (słupek)
      expect(summary.externalDrawersByType.merivobox_m).toBe(1 + 2); // 1 (tumba) + 2 (szafa)
      expect(summary.externalDrawerSets).toBe(3 + 1 + 2);
    });

    it('a stale calculator_state with only the OLD single externalDrawers field migrates its whole count into "niskie" (M)', () => {
      const legacyModule = { type: 'base_drawers', W: 600, H: 820, D: 520, externalDrawers: 5, qty: 1 };
      const summary = summarizeCabinetModules([legacyModule]);
      expect(summary.externalDrawersByType.merivobox_m).toBe(5);
      expect(summary.externalDrawersByType.merivobox_e).toBe(0);
      expect(summary.externalDrawerSets).toBe(5);
    });

    it('buildCabinetCostBreakdown prices the high (E) and low (M) groups with their own distinct materials, in one scenario', () => {
      // Dokładnie scenariusz ze zgłoszenia: 2 wysokie E (300 zł) + 1 niska M (210 zł) w JEDNEJ tumbie.
      const summary = summarizeCabinetModules([createCabinetModule('base_drawers', { qty: 1 })]);
      const breakdown = buildCabinetCostBreakdown(summary, {
        externalDrawerByType: {
          merivobox_e: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
          merivobox_m: { name: 'MERIVOBOX M niska szuflada zewnętrzna', price: 210 },
        },
      }, 2);
      const eRow = breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_e');
      const mRow = breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_m');
      expect(eRow).toMatchObject({ quantity: 2, unitPrice: 300, value: 600 });
      expect(mRow).toMatchObject({ quantity: 1, unitPrice: 210, value: 210 });
      expect(breakdown.materialsTotal).toBeCloseTo(600 + 210, 6);
    });
  });

  // Etap C, krok 3.4 — "🎨 Własne materiały szafki": moduł może nadpisać płytę/kromkę/zawiasy
  // swoim WŁASNYM id z katalogu, niezależnie od globalnego wyboru w Bloku 1. Area/metry/liczniki
  // muszą się grupować PO KONKRETNYM materialId (bucket), nie wpadać do jednej wspólnej sumy —
  // inaczej 5 szafek na białej płycie + 1 na kolorowej policzyłoby się jako 6 szafek na jednej
  // płycie (błędna liczba arkuszy i błędna cena).
  describe('Etap C — per-module material override (boardAreaByBucket/edgeMetersByBucket)', () => {
    it('a module with bodyMaterialId=42 lands in its own "body:42" bucket, others stay in "body:default"', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 5 }),
        createCabinetModule('base_doors', { qty: 1, bodyMaterialId: 42 }),
      ]);
      const perUnit = computeModule(createCabinetModule('base_doors'));
      expect(summary.boardAreaByBucket['body:default']).toBeCloseTo(perUnit.bodyAreaM2 * 5, 5);
      expect(summary.boardAreaByBucket['body:42']).toBeCloseTo(perUnit.bodyAreaM2 * 1, 5);
      // Suma ogólna (bodyAreaM2) nadal liczy WSZYSTKIE moduły razem — tylko bucket-y per materiał
      // rozdzielają, do czyjej płyty/arkuszy wlicza się który moduł.
      expect(summary.bodyAreaM2).toBeCloseTo(perUnit.bodyAreaM2 * 6, 5);
    });

    it('string vs number materialId never splits what should be the same bucket (ADR-010 Etap C bug krytyczny #1)', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 1, bodyMaterialId: 42 }),
        createCabinetModule('base_doors', { qty: 1, bodyMaterialId: '42' }),
      ]);
      expect(Object.keys(summary.boardAreaByBucket).sort()).toEqual(['body:42', 'front:default']);
      const perUnit = computeModule(createCabinetModule('base_doors'));
      expect(summary.boardAreaByBucket['body:42']).toBeCloseTo(perUnit.bodyAreaM2 * 2, 5);
    });

    it('sheets are rounded PER BUCKET, not on the combined total — 5 modules on the default board + 1 on its own never share a rounding', () => {
      // 5 x base_doors (bodyAreaM2 ≈ 1.72136 każdy) = 8.6068 m² -> ceil(8.6068/4.4) = 2 arkusze na
      // domyślnej płycie; 1 x base_doors na WŁASNEJ płycie = 1.72136 m² -> osobny 1 arkusz. Suma
      // "wspólna" (bez bucketów) dałaby 10.328/4.4 = ceil(2.347..) = 3 arkusze — też 3, więc test
      // dobiera drugi moduł na override tak, by łączenie w jedną sumę DAŁOBY INNY wynik niż
      // liczenie osobno (to właśnie ma wychwycić regresję).
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 2, bodyMaterialId: 'own' }), // 2 x 1.72136 = 3.443 m² -> ceil(3.443/4.4) = 1 arkusz osobno
        createCabinetModule('base_doors', { qty: 2 }), // 2 x 1.72136 = 3.443 m² -> ceil(3.443/4.4) = 1 arkusz na domyślnej
      ]);
      expect(summary.bodySheets).toBe(2); // 1 + 1 liczone OSOBNO
      // Gdyby liczono łącznie (4 x 1.72136 = 6.885 m²), wyszłoby ceil(6.885/4.4) = 2 też — więc
      // sprawdzamy wprost przez boardAreaByBucket, że to NIE jest jeden wspólny bucket.
      expect(Object.keys(summary.boardAreaByBucket).sort()).toEqual(['body:default', 'body:own', 'front:default']);
    });

    it('edgeMaterialBodyId/edgeMaterialFrontId route body/front edge meters into their own per-module buckets', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 1, edgeMaterialBodyId: 7 }),
        createCabinetModule('base_doors', { qty: 1, edgeMaterialFrontId: 9 }),
      ]);
      const perUnit = computeModule(createCabinetModule('base_doors'));
      expect(summary.edgeMetersByBucket['body:7']).toBeCloseTo(perUnit.bodyEdgeMeters, 5);
      expect(summary.edgeMetersByBucket['front:9']).toBeCloseTo(perUnit.frontEdgeMeters, 5);
      // Drugi moduł nie nadpisał edgeMaterialBodyId -> jego własna kromka korpusu idzie do default.
      expect(summary.edgeMetersByBucket['body:default']).toBeCloseTo(perUnit.bodyEdgeMeters, 5);
    });

    // Etap F, krok 3.4 — zawiasy nie mają już per-moduł nadpisania materiału (hingeId usunięte:
    // zastąpione globalnym podziałem spowalniacz/sprężyna, patrz niżej "softCloseHinges/
    // springHinges"); `hinges` nadal jest prostą sumą wszystkich modułów.
    it('"hinges" totals across modules regardless of individual door counts', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_doors', { qty: 3 }),
        createCabinetModule('base_doors', { qty: 2 }),
      ]);
      const perDoorHinges = computeModule(createCabinetModule('base_doors')).hinges;
      expect(summary.hinges).toBe(perDoorHinges * 5);
    });

    it('drawerRunnerExternalId (per-module material override) takes priority over the drawerType enum chip', () => {
      const summary = summarizeCabinetModules([
        createCabinetModule('base_drawers', {
          externalDrawersHigh: 0, externalDrawersLow: 1, qty: 1, drawerType: 'tandem', drawerRunnerExternalId: 55,
        }),
      ]);
      expect(summary.externalDrawersByType['id:55']).toBe(1);
      expect(summary.externalDrawersByType.tandem).toBe(0);
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
    edgeMaterialBody: { name: 'ABS W960 SM', price: 1.13 },
    edgeMaterialFront: { name: 'ABS U702', price: 3.5 },
    hingeSoftClose: { name: "BLUM Zawias 110' nakładany ze spowalniaczem 71B3550", price: 12 },
    hingeSpring: { name: "BLUM Zawias 110' nakładany ze sprężyną 71T3550", price: 14 },
    externalDrawerByType: {
      inherit: { name: 'Blum Tandem L-500', price: 45 },
      merivobox_e: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
      merivobox_m: { name: 'MERIVOBOX M niska szuflada zewnętrzna', price: 210 },
    },
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
    expect(byKey('hingeSoftClose')).toMatchObject({ quantity: summary.softCloseHinges, value: summary.softCloseHinges * 12 });
    expect(byKey('hingeSpring')).toMatchObject({ quantity: summary.springHinges, value: summary.springHinges * 14 });
    // base_drawers domyślne (bez override): 2 wysokie (E) + 1 niska (M) — bez "inherit".
    expect(byKey('drawerExt_merivobox_e')).toMatchObject({ quantity: 2, value: 2 * 300 });
    expect(byKey('drawerExt_merivobox_m')).toMatchObject({ quantity: 1, value: 1 * 210 });
    expect(byKey('drawerExt_inherit')).toBeUndefined();
    expect(byKey('drawerInt_inherit')).toBeUndefined(); // internalDrawerSets=0 for this fixture
    // base_doors domyślnie openingMethod='uchwyt' -> 2 szt. uchwytów (1 drzwi x qty 2), 0 profilu HAFELE.
    expect(byKey('handle')).toMatchObject({ quantity: summary.handleUnits, value: 0 });
    expect(byKey('hafeleProfile')).toBeUndefined(); // hafeleProfileMeters=0 — openingMethod domyślny to nie profil HAFELE

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
      createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 1, qty: 1 }), // bez override -> "niskie" idzie do M
      createCabinetModule('base_drawers', { externalDrawersHigh: 0, externalDrawersLow: 1, qty: 1, drawerType: 'merivobox_e' }), // wymuszone -> CAŁOŚĆ do E
    ]);
    const breakdown = buildCabinetCostBreakdown(withTypes, {
      externalDrawerByType: {
        merivobox_e: { name: 'MERIVOBOX E wysoka szuflada zewnętrzna', price: 300 },
        merivobox_m: { name: 'MERIVOBOX M niska szuflada zewnętrzna', price: 210 },
      },
    }, 2);
    const mRow = breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_m');
    const eRow = breakdown.materialRows.find(row => row.key === 'drawerExt_merivobox_e');
    expect(mRow).toMatchObject({ quantity: 1, unitPrice: 210, value: 210 });
    expect(eRow).toMatchObject({ quantity: 1, unitPrice: 300, value: 300 });
    expect(breakdown.materialRows.find(row => row.key === 'drawerExt_inherit')).toBeUndefined();
    expect(breakdown.materialRows.find(row => row.key === 'drawerExt_tandem')).toBeUndefined();
  });

  // Dokładnie scenariusz ze zgłoszenia: jedna tumba z niską wewnętrzną M (210 zł), druga z wysoką
  // wewnętrzną E ze szkłem (290 zł) — każda wyceniona swoją własną pozycją katalogu.
  it('realistic scenario: one tumba with internal M niska (210 zł), another with internal E wysoka (290 zł)', () => {
    const summaryMixed = summarizeCabinetModules([
      createCabinetModule('base_drawers', {
        externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 1, internalDrawerType: 'merivobox_m', qty: 1,
      }),
      createCabinetModule('base_drawers', {
        externalDrawersHigh: 0, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 1, internalDrawerType: 'merivobox_e', qty: 1,
      }),
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

  it('TIP-ON is a real priced row, 1 per door, only when openingMethod is tip_on on a door-bearing module', () => {
    const tipOnSummary = summarizeCabinetModules([createCabinetModule('base_doors', { doors: 2, openingMethod: 'tip_on', qty: 1 })]);
    const breakdown = buildCabinetCostBreakdown(tipOnSummary, {
      tipOnMaterial: { name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', price: 14.19 },
    }, 2);
    const row = breakdown.materialRows.find(r => r.key === 'tipOn');
    expect(row).toMatchObject({ quantity: 2, unitPrice: 14.19, value: 2 * 14.19 });
  });

  // Etap G, krok 2 — Uchwyty i Profil HAFELE są realnymi pozycjami kosztowymi, widocznymi tylko gdy
  // choć jedna szafka ma odpowiedni sposób otwierania (ta sama reguła filter(quantity > 0) co TIP-ON).
  it('Uchwyty is a real priced row, 1 per door, only when openingMethod is uchwyt', () => {
    const handleSummary = summarizeCabinetModules([createCabinetModule('base_doors', { doors: 2, openingMethod: 'uchwyt', qty: 1 })]);
    const breakdown = buildCabinetCostBreakdown(handleSummary, {
      handleMaterial: { name: 'Uchwyt GAMET meblowy', price: 6.5 },
    }, 2);
    const row = breakdown.materialRows.find(r => r.key === 'handle');
    expect(row).toMatchObject({ quantity: 2, unitPrice: 6.5, value: 2 * 6.5 });
    expect(breakdown.materialRows.find(r => r.key === 'tipOn')).toBeUndefined();
    expect(breakdown.materialRows.find(r => r.key === 'hafeleProfile')).toBeUndefined();
  });

  it('Profil HAFELE is a real priced row, (W/1000) linear meters, only when openingMethod is profil_hafele', () => {
    const profileSummary = summarizeCabinetModules([createCabinetModule('base_doors', { W: 800, doors: 1, openingMethod: 'profil_hafele', qty: 2 })]);
    const breakdown = buildCabinetCostBreakdown(profileSummary, {
      hafeleProfileMaterial: { name: 'Profil HAFELE aluminiowy', price: 25 },
    }, 2);
    const row = breakdown.materialRows.find(r => r.key === 'hafeleProfile');
    expect(row.quantity).toBeCloseTo(1.6, 5); // 0.8 mb x qty 2
    expect(row).toMatchObject({ unitPrice: 25 });
    expect(breakdown.materialRows.find(r => r.key === 'handle')).toBeUndefined();
    expect(breakdown.materialRows.find(r => r.key === 'tipOn')).toBeUndefined();
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

  // Etap C, krok 3.4: moduł z własnym materialId dostaje WŁASNY wiersz w rozliczeniu, wyceniony
  // jego konkretną pozycją katalogu — nie miesza się z domyślnym wyborem z Bloku 1.
  it('a per-module material override (bodyMaterialId) produces its own priced row, resolved via materialsById', () => {
    const summaryWithOverride = summarizeCabinetModules([
      createCabinetModule('base_doors', { qty: 5 }),
      createCabinetModule('base_doors', { qty: 1, bodyMaterialId: 42 }),
    ]);
    const materialsById = new Map([[String(42), { name: 'U702 ST9 Kaszmir', price: 220 }]]);
    const breakdown = buildCabinetCostBreakdown(summaryWithOverride, { ...selections, materialsById }, 2);

    const defaultRow = breakdown.materialRows.find(row => row.key === 'bodySheet');
    const overrideRow = breakdown.materialRows.find(row => row.key === 'bodySheet_42');
    expect(defaultRow).toMatchObject({ item: selections.bodyMaterial, unitPrice: 180 });
    expect(overrideRow).toMatchObject({ item: { name: 'U702 ST9 Kaszmir', price: 220 }, unitPrice: 220 });
    // Policzone i zaokrąglone do arkuszy OSOBNO dla każdego materiału.
    expect(defaultRow.quantity).toBe(summaryWithOverride.boardAreaByBucket['body:default'] > 0
      ? Math.ceil(summaryWithOverride.boardAreaByBucket['body:default'] / USABLE_SHEET_AREA_M2) : 0);
    expect(overrideRow.quantity).toBe(1); // 1 moduł, osobny arkusz
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

  // Etap N, krok 4 — "tymczasowo" bez furnitury: includeHardware:false chowa WSZYSTKIE pozycje
  // osprzętu, zostawiając płyty/kromkę/HDF/blat + usługi (reszta rozliczenia liczy się identycznie).
  // Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu: `includeLegs`/`includeDrawerSets` są TERAZ
  // NIEZALEŻNE od `includeHardware` (ten sam wzorzec domyślny — `!== false`, nie `=== true` — więc
  // wołający BEZ żadnych opcji dalej widzi WSZYSTKO, zero regresji dla starszych wywołań). Samo
  // `includeHardware: false` chowa więc TYLKO zawiasy/zawieszki/uchwyty/TIP-ON/profil HAFELE — nogi
  // i komplety szuflad zostają widoczne, dopóki NIE dostaną WŁASNEGO `false`.
  it('includeHardware:false hides zawiasy/zawieszki/uchwyty/TIP-ON/profil HAFELE, but keeps legs/drawer sets (own flags)', () => {
    const full = buildCabinetCostBreakdown(summary, selections, 2);
    const withoutHardware = buildCabinetCostBreakdown(summary, selections, 2, { includeHardware: false });

    const hiddenKeys = ['hingeSoftClose', 'hingeSpring', 'hanger', 'handle', 'tipOn', 'hafeleProfile'];
    hiddenKeys.forEach((key) => {
      expect(withoutHardware.materialRows.find(row => row.key === key)).toBeUndefined();
    });
    const keptKeys = ['legFront', 'legRearAxilo'];
    keptKeys.forEach((key) => {
      expect(withoutHardware.materialRows.find(row => row.key === key))
        .toEqual(full.materialRows.find(row => row.key === key));
    });

    ['bodySheet', 'frontSheet', 'hdf'].forEach((key) => {
      expect(withoutHardware.materialRows.find(row => row.key === key))
        .toEqual(full.materialRows.find(row => row.key === key));
    });
    expect(withoutHardware.serviceRows).toEqual(full.serviceRows);
  });

  it('includeLegs:false and includeDrawerSets:false additionally hide nogi/komplety szuflad, independently of includeHardware', () => {
    const nothing = buildCabinetCostBreakdown(summary, selections, 2, {
      includeHardware: false, includeLegs: false, includeDrawerSets: false,
    });
    ['legFront', 'legRearAxilo'].forEach((key) => {
      expect(nothing.materialRows.find(row => row.key === key)).toBeUndefined();
    });
    nothing.materialRows.forEach((row) => {
      expect(row.key.startsWith('drawerExt_')).toBe(false);
      expect(row.key.startsWith('drawerInt_')).toBe(false);
    });
  });
});

// Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu: nóżki meblowe (Dolne/Słupki: 4 szt.;
// Narożna zaślepiona: 6 szt.; Zabudowa zmywarki: 0 szt., stoi na własnych nóżkach zmywarki) i
// komplety szuflad/prowadnic wracają do rozliczenia — computeLegsCount/computeDrawersCount
// udostępniają te sumy wprost, do testowania bez przechodzenia przez cały buildCabinetCostBreakdown.
describe('computeLegsCount / computeDrawersCount (Etap AA, krok 4)', () => {
  it('standardowa szafka dolna (base_doors, W<=900) dostaje 4 nóżki (2 przednie + 2 tylne Axilo)', () => {
    const modules = [createCabinetModule('base_doors', { W: 600 })];
    expect(computeLegsCount(modules)).toBe(4);
  });

  it('Słupek (tall_cabinet) dostaje te same 4 nóżki co Dolne', () => {
    const modules = [createCabinetModule('tall_cabinet', { W: 600 })];
    expect(computeLegsCount(modules)).toBe(4);
  });

  it('"Narożna zaślepiona" (corner_blind_cabinet, W=1000 domyślnie — szerszy korpus) dostaje 6 nóżek', () => {
    const modules = [createCabinetModule('corner_blind_cabinet')];
    expect(computeLegsCount(modules)).toBe(6);
  });

  it('"Zabudowa zmywarki" (dishwasher_front) nie ma WŁASNYCH nóżek — stoi na regulowanych nóżkach zmywarki', () => {
    const modules = [createCabinetModule('dishwasher_front')];
    expect(computeLegsCount(modules)).toBe(0);
  });

  it('suma nóżek liczy WSZYSTKIE moduły naraz, pomnożone przez ich qty', () => {
    const modules = [
      createCabinetModule('base_doors', { W: 600, qty: 2 }), // 4 × 2 = 8
      createCabinetModule('corner_blind_cabinet'), // 6
      createCabinetModule('dishwasher_front'), // 0
    ];
    expect(computeLegsCount(modules)).toBe(8 + 6 + 0);
  });

  it('computeDrawersCount liczy łącznie zewnętrzne + wewnętrzne komplety szuflad ze wszystkich modułów', () => {
    const modules = [
      createCabinetModule('base_drawers', { externalDrawersHigh: 2, externalDrawersLow: 1 }), // 3 zewn.
      createCabinetModule('oven_cabinet', { externalDrawersLow: 1 }), // 1 zewn.
    ];
    expect(computeDrawersCount(modules)).toBe(3 + 1);
  });

  it('nóżki i komplety szuflad wchodzą do materialsTotal/materialsScaled (× współczynnik projektu)', () => {
    const modules = [createCabinetModule('base_doors', { W: 600 })];
    const summary = summarizeCabinetModules(modules);
    const selections = { legFront: { price: 1 }, legRearAxilo: { price: 4 } };
    const breakdown = buildCabinetCostBreakdown(summary, selections, 2, { includeHardware: false });

    const legFrontRow = breakdown.materialRows.find(row => row.key === 'legFront');
    const legRearRow = breakdown.materialRows.find(row => row.key === 'legRearAxilo');
    expect(legFrontRow).toMatchObject({ quantity: 2, unitPrice: 1, value: 2 });
    expect(legRearRow).toMatchObject({ quantity: 2, unitPrice: 4, value: 8 });
    expect(breakdown.materialsTotal).toBeGreaterThanOrEqual(legFrontRow.value + legRearRow.value);
    expect(breakdown.materialsScaled).toBeCloseTo(breakdown.materialsTotal * 2, 6);
  });
});

// Etap O, krok 1 — reaktywna synchronizacja wysokości (bez klikania "Zastosuj wysokości"):
// standardowy moduł ZAWSZE goni żywą rekomendację panelu; moduł z customHeight:true zostaje przy
// swojej wartości, dopóki user nie zresetuje go ręcznie.
describe('syncModuleHeights', () => {
  const heightForRole = { bottom: 838, wall: 999, tall: 2475, mezzanine: 400 };

  it('snaps a standard module (no customHeight) to the current recommendation for its role', () => {
    const modules = [createCabinetModule('base_doors', { heightRole: 'bottom', H: 757 })];
    const synced = syncModuleHeights(modules, heightForRole);
    expect(synced[0].H).toBe(838);
  });

  it('leaves a customHeight:true module untouched, even though its role recommendation changed', () => {
    const modules = [createCabinetModule('base_doors', { heightRole: 'bottom', H: 757, customHeight: true })];
    const synced = syncModuleHeights(modules, heightForRole);
    expect(synced[0].H).toBe(757);
    expect(synced[0].customHeight).toBe(true);
  });

  it('leaves a module without heightRole untouched (fixed-height presets like "Nad okap")', () => {
    const modules = [createCabinetModule('wall_cabinet', { H: 450 })];
    const synced = syncModuleHeights(modules, heightForRole);
    expect(synced[0].H).toBe(450);
  });

  it('is a no-op (same array reference per item) when every module already matches its recommendation', () => {
    const modules = [createCabinetModule('base_doors', { heightRole: 'bottom', H: 838 })];
    const synced = syncModuleHeights(modules, heightForRole);
    expect(synced[0]).toBe(modules[0]);
  });

  it('never mutates the input array', () => {
    const modules = [createCabinetModule('base_doors', { heightRole: 'bottom', H: 757 })];
    syncModuleHeights(modules, heightForRole);
    expect(modules[0].H).toBe(757);
  });
});

// Etap O, krok 3 — kuchnia narożna (L): zajęte/wolne miejsce liczone OSOBNO dla ściany X i Y, z
// odjęciem głębokości narożnika (pierwsze cornerDepthMm ściany Y jest fizycznie "pod" blatem/
// korpusem narożnika stojącego na ścianie X).
describe('computeWallFreeSpace', () => {
  it('simple layout (1 ściana): wall Y stays zero, and a module tagged "Y" (leftover from a previous Narożny L) still counts towards X', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'Y' }),
    ];
    const result = computeWallFreeSpace(modules, { wallXWidthMm: 3000, wallYWidthMm: 2200, layout: 'simple' });
    expect(result.occupiedX).toBe(600);
    expect(result.occupiedY).toBe(0);
    expect(result.freeY).toBe(0);
  });

  it('corner_l: occupied width per wall is the widest TIER on that wall, not the sum of all tiers', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500, wall: 'X' }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 400, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 700, wall: 'Y' }),
    ];
    const result = computeWallFreeSpace(modules, {
      wallXWidthMm: 3000, wallYWidthMm: 2200, layout: 'corner_l', cornerDepthMm: 600,
    });
    expect(result.occupiedX).toBe(1100); // 600+500 (dolne) > 400 (górne)
    expect(result.freeX).toBe(1900);
    expect(result.occupiedY).toBe(700);
    expect(result.cornerDeductionMm).toBe(600);
    expect(result.availableY).toBe(1600); // 2200 - 600
    expect(result.freeY).toBe(900); // 1600 - 700
  });

  it('corner deduction never pushes availableY below zero', () => {
    const result = computeWallFreeSpace([], { wallXWidthMm: 3000, wallYWidthMm: 500, layout: 'corner_l', cornerDepthMm: 600 });
    expect(result.availableY).toBe(0);
    expect(result.freeY).toBe(0);
  });

  // Etap U, krok 2/3 — zgłoszenie: Antresole wyliczały się JAKO OSOBNY jarus (max z resztą), ale w
  // praktyce sumowały się z Szafki górne na rysunku (inna, rozjechana logika w WallElevationCanvas)
  // — occupiedX wychodził 4000mm zamiast realnych 3500mm. computeWallFreeSpace i rysunek MUSZĄ
  // liczyć DOKŁADNIE to samo (patrz layoutFloorBand/layoutCountertopSegments niżej, współdzielone).
  it('kitchen_bottom + kitchen_tall form ONE combined floor band (summed, not maxed)', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
    ];
    const result = computeWallFreeSpace(modules, { wallXWidthMm: 3000, layout: 'simple' });
    expect(result.occupiedX).toBe(1800); // 600+600+600, NIE max(1200, 600)
  });

  it('Szafki górne start AFTER leading Słupki (leftTallOffset) when computing occupied width', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }), // słupek na początku rzędu
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 2900 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 3000 }), // górne liczą się OD leftTallOffset
    ];
    const result = computeWallFreeSpace(modules, { wallXWidthMm: 4000, layout: 'simple' });
    // floor = 600+2900=3500; top end = leftTallOffset(600) + 3000 = 3600 -> szerszy niż floor
    expect(result.occupiedX).toBe(3600);
  });

  it('Antresole liczą się w SWOIM NIEZALEŻNYM rzędzie od X=0 — nie sumują się z Szafki górne', () => {
    const modules = [
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 1800 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_mezzanine', W: 2200 }),
    ];
    const result = computeWallFreeSpace(modules, { wallXWidthMm: 3000, layout: 'simple' });
    // Gdyby antresola sumowała się z górnymi (stary bug), wyszłoby 1800+2200=4000.
    expect(result.occupiedX).toBe(2200); // max(1800, 2200), NIE suma
  });

  // Etap AD, krok 2 — zgłoszenie: "Narożny L — ściana Y z prawej" liczy się WYŁĄCZNIE na kluczu Y2
  // (occupiedY/wallYWidthMm zostają zerowe — to NIE jest ta sama ściana co 'corner_l').
  it('corner_l_right: tylko wall "Y2" ma niezerowe occupied/available — "Y" zostaje zerowe', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 700, wall: 'Y2' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 999, wall: 'Y' }), // "osierocony" Y (nieaktywna ściana) -> pomijany
    ];
    const result = computeWallFreeSpace(modules, {
      wallXWidthMm: 3000, wallY2WidthMm: 2200, layout: 'corner_l_right', cornerDepth2Mm: 600,
    });
    expect(result.occupiedY).toBe(0);
    expect(result.wallYWidthMm).toBe(0);
    expect(result.occupiedY2).toBe(700);
    expect(result.wallY2WidthMm).toBe(2200);
    expect(result.cornerDeduction2Mm).toBe(600);
    expect(result.availableY2).toBe(1600);
    expect(result.freeY2).toBe(900);
  });

  // Etap AD, krok 2 — Układ U: OBIE ściany (Y lewa + Y2 prawa) naraz, każda z WŁASNYM narożnikiem.
  it('u_layout: wall "Y" i wall "Y2" liczą się OBIE, niezależnie, każda z własnym cornerDeduction', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 400, wall: 'Y' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 700, wall: 'Y2' }),
    ];
    const result = computeWallFreeSpace(modules, {
      wallXWidthMm: 3000, wallYWidthMm: 2000, wallY2WidthMm: 2200,
      layout: 'u_layout', cornerDepthMm: 560, cornerDepth2Mm: 600,
    });
    expect(result.occupiedY).toBe(400);
    expect(result.availableY).toBe(1440); // 2000-560
    expect(result.freeY).toBe(1040);
    expect(result.occupiedY2).toBe(700);
    expect(result.availableY2).toBe(1600); // 2200-600
    expect(result.freeY2).toBe(900);
  });

  // Etap AD, krok 3 — "Zajęte" musi odzwierciedlać TĘ SAMĄ geometrię co rysunek: słup/szyb na danej
  // ścianie przesuwa occupiedX/Y dokładnie tak samo, jak layoutFloorBand (bez tego bejdż i rysunek
  // pokazywałyby różne liczby — dokładnie klasa buga, którą ten projekt już raz naprawiał).
  it('pillars: słup na ścianie X przesuwa occupiedX o przeskok (ta sama matematyka co layoutFloorBand)', () => {
    const modules = [createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' })];
    const pillar = { wall: 'X', xMm: 600, widthMm: 600 };
    const result = computeWallFreeSpace(modules, { wallXWidthMm: 3000, layout: 'simple', pillars: [pillar] });
    expect(result.occupiedX).toBe(600); // jedna szafka, bez kolizji -> bez zmian
    const modulesCollision = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }), // koliduje z [600,1200] -> 1200
    ];
    const resultCollision = computeWallFreeSpace(modulesCollision, { wallXWidthMm: 3000, layout: 'simple', pillars: [pillar] });
    expect(resultCollision.occupiedX).toBe(1800); // 1200 (przeskok) + 600 (własna szerokość)
  });

  it('pillars: słup na ścianie Y NIE wpływa na occupiedX ani na occupiedY innej ściany', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'Y' }),
    ];
    const pillarOnY = { wall: 'Y', xMm: 0, widthMm: 600 }; // koliduje z Y, ale nie z X
    const result = computeWallFreeSpace(modules, {
      wallXWidthMm: 3000, wallYWidthMm: 2200, layout: 'corner_l', cornerDepthMm: 0, pillars: [pillarOnY],
    });
    expect(result.occupiedX).toBe(600); // bez zmian
    expect(result.occupiedY).toBe(1200); // szafka 600 przeskoczyła za słup [0,600] -> staje na 600, kończy na 1200
  });
});

// Etap X, krok 2 — zgłoszenie (Screenshot_6.jpg): kuchnia narożna L, róg (0,0) — pas podłogowy
// ściany Y nakładał się na to, co REALNIE stoi w rogu ściany X (szafki narysowane jedna na drugiej
// na Widoku z góry). `computeCornerDepthMm` liczy, o ile mm trzeba przesunąć START pasa podłogowego
// ściany Y (patrz WallElevationCanvas.jsx, krok 2), żeby jego prostokąty nigdy nie kolidowały z
// prostokątem rogu ściany X.
describe('computeCornerDepthMm', () => {
  it('corner occupied by a tall cabinet (Słupek, D=560) with NO countertop over it -> cornerDepth = jego własna głębokość (560)', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'X', W: 600 }),
    ];
    expect(computeCornerDepthMm(modules, 600)).toBe(560);
  });

  it('corner occupied by a regular base cabinet (D=520) PRZYKRYTY blatem (600mm, głębszy niż korpus) -> cornerDepth = głębokość blatu (600)', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'X', W: 600 }),
    ];
    expect(computeCornerDepthMm(modules, 600)).toBe(600);
  });

  it('"Narożna zaślepiona" (corner_blind_cabinet, D=520) w rogu, blat 600mm -> cornerDepth = 600 (blat wygrywa, nie W=1000 ani frontWidth=450)', () => {
    const modules = [
      createCabinetModule('corner_blind_cabinet', { group: 'kitchen_bottom', wall: 'X' }),
    ];
    expect(computeCornerDepthMm(modules, 600)).toBe(600);
  });

  it('pusta ściana X (brak modułów Dolne/Słupki w rogu) -> cornerDepth = 0, nic nie koliduje', () => {
    expect(computeCornerDepthMm([], 600)).toBe(0);
    const onlyWallCabinet = [createCabinetModule('wall_cabinet', { group: 'kitchen_top', wall: 'X', W: 600 })];
    expect(computeCornerDepthMm(onlyWallCabinet, 600)).toBe(0);
  });

  it('moduł w rogu ściany Y (nie X) nie wpływa na cornerDepth — liczy się TYLKO róg ściany X', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'Y', W: 600 }),
    ];
    expect(computeCornerDepthMm(modules, 600)).toBe(0);
  });

  // Etap AD, krok 2 — zgłoszenie: Układ U / "Narożny L z prawej" mają narożnik na PRAWYM końcu
  // ściany X — `side: 'right'` musi patrzeć na OSTATNI element jej pasa podłogowego, nie pierwszy —
  // ALE tylko gdy ten element FIZYCZNIE sięga do `wallXWidthMm` (inaczej róg jest pusty, mimo że
  // floorX ma jakieś elementy gdzieś dalej w lewo — stąd wymagany tu 4. argument).
  describe('side: "right" (Narożny L z prawej / Układ U, prawy narożnik)', () => {
    it('ostatni (prawy) moduł pasa podłogowego decyduje o cornerDepth, PIERWSZY (lewy) jest ignorowany', () => {
      const modules = [
        createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'X', W: 600, D: 520 }), // lewy koniec
        createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'X', W: 600, D: 560 }), // prawy koniec
      ];
      // Pas podłogowy (600+600=1200) sięga dokładnie do wallXWidthMm=1200 -> prawy koniec dotyka ściany.
      expect(computeCornerDepthMm(modules, 600, 'right', 1200)).toBe(560); // Słupek bez blatu -> własna głębokość
      expect(computeCornerDepthMm(modules, 600, 'left')).toBe(600); // base_doors PRZYKRYTY blatem 600mm
    });

    it('jeśli pas podłogowy NIE sięga do wallXWidthMm (wolna przestrzeń przy ścianie), prawy róg jest PUSTY (cornerDepth = 0)', () => {
      const modules = [
        createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'X', W: 600, D: 560 }),
      ];
      // Pas (600mm) NIE sięga do wallXWidthMm=3000 -> nic nie stoi w prawym rogu.
      expect(computeCornerDepthMm(modules, 600, 'right', 3000)).toBe(0);
    });

    it('pusta ściana X -> cornerDepth = 0 także dla side: "right"', () => {
      expect(computeCornerDepthMm([], 600, 'right', 3000)).toBe(0);
    });
  });
});

// Etap X, krok 2 — geometria pasa podłogowego ściany Y, PRZESUNIĘTEGO o cornerDepthMm, nigdy nie
// koliduje (bounding box) z pasem podłogowym ściany X w rogu (0,0) — reprodukuje DOKŁADNIE te same
// wzory na prostokąty, których używa WallElevationCanvas.jsx (renderPlanRect, x0=y0=0): ściana X
// (horizontal) -> {x:[xMm, xMm+W], y:[0, D]}; ściana Y (vertical, PO przesunięciu startu o
// cornerDepthMm) -> {x:[0, D], y:[xMm, xMm+W]}.
describe('Widok z góry — ściana X i ściana Y nigdy się nie nakładają w rogu (bounding box)', () => {
  const rectsOverlap = (a, b) => a.x[0] < b.x[1] && b.x[0] < a.x[1] && a.y[0] < b.y[1] && b.y[0] < a.y[1];

  it('Słupek w rogu ściany X (D=560) + 4 szafki ściany Y startujące od cornerDepthMm -> zero przecięć', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'X', W: 600 }), // róg, D=560
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'Y', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'Y', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'Y', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'Y', W: 400 }),
    ];
    const cornerDepthMm = computeCornerDepthMm(modules, 600);
    expect(cornerDepthMm).toBe(560); // Słupek bez blatu nad sobą -> własna głębokość, nie 600

    const floorX = layoutFloorBand(modules, 'X');
    const floorY = layoutFloorBand(modules, 'Y');

    const xRects = floorX.entries.map(entry => ({
      x: [entry.xMm, entry.xMm + entry.widthMm], y: [0, Number(entry.module.D) || 520],
    }));
    // Start pasa Y przesunięty o cornerDepthMm — dokładnie to, co WallElevationCanvas.jsx robi z
    // `floorYRaw.entries` przed narysowaniem (patrz `floorY` w komponencie, krok 2).
    const yRects = floorY.entries.map(entry => ({
      x: [0, Number(entry.module.D) || 520], y: [entry.xMm + cornerDepthMm, entry.xMm + cornerDepthMm + entry.widthMm],
    }));

    xRects.forEach((xRect) => {
      yRects.forEach((yRect) => {
        expect(rectsOverlap(xRect, yRect)).toBe(false);
      });
    });
    // Startowa współrzędna Y pierwszego szafki ściany Y musi być DOKŁADNIE cornerDepthMm (zgłoszenie
    // explicite woła o `startY === cornerDepthX`).
    expect(yRects[0].y[0]).toBe(cornerDepthMm);
  });

  it('BEZ przesunięcia (stare zachowanie, startY=0) te same szafki BY się nakładały — reprodukcja zgłoszenia', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', wall: 'X', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', wall: 'Y', W: 600 }),
    ];
    const floorX = layoutFloorBand(modules, 'X');
    const floorY = layoutFloorBand(modules, 'Y');
    const xRect = { x: [floorX.entries[0].xMm, floorX.entries[0].xMm + floorX.entries[0].widthMm], y: [0, 560] };
    // startY = 0 (BEZ cornerDepthMm) — dokładnie stary bug.
    const yRectUnfixed = { x: [0, 520], y: [floorY.entries[0].xMm, floorY.entries[0].xMm + floorY.entries[0].widthMm] };
    expect(rectsOverlap(xRect, yRectUnfixed)).toBe(true);
  });
});

// Etap U, krok 2 — Dolne + Słupki w JEDNYM rzędzie, w kolejności WYSTĘPOWANIA w `modules` (nie
// osobno per grupa) — jedyne źródło prawdy dla X-pozycji na rysunku i dla kolejności w tabeli.
describe('layoutFloorBand', () => {
  it('combines kitchen_bottom + kitchen_tall into one ordered row (array order, not per-group order)', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500 }),
    ];
    const { entries, totalWidthMm, leftTallOffsetMm } = layoutFloorBand(modules, 'X');
    expect(entries.map(e => e.module.group)).toEqual(['kitchen_bottom', 'kitchen_tall', 'kitchen_bottom']);
    expect(entries.map(e => e.xMm)).toEqual([0, 600, 1200]);
    expect(totalWidthMm).toBe(1700);
    expect(leftTallOffsetMm).toBe(0); // słupek NIE jest na początku rzędu
  });

  it('a Słupek placed at the very start of the row contributes to leftTallOffsetMm', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 2900 }),
    ];
    const { leftTallOffsetMm, totalWidthMm } = layoutFloorBand(modules, 'X');
    expect(leftTallOffsetMm).toBe(600);
    expect(totalWidthMm).toBe(3500);
  });

  it('a Słupek placed AFTER bottom cabinets (end of row) does not count towards leftTallOffsetMm', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500 }),
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
    ];
    const { leftTallOffsetMm, totalWidthMm } = layoutFloorBand(modules, 'X');
    expect(leftTallOffsetMm).toBe(0);
    expect(totalWidthMm).toBe(3500);
  });

  it('only consecutive LEADING Słupki count — a Słupek sandwiched between bottom cabinets does not', () => {
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }), // nie-wiodący, nie liczy się
    ];
    const { leftTallOffsetMm } = layoutFloorBand(modules, 'X');
    expect(leftTallOffsetMm).toBe(600);
  });

  it('respects the wall filter (corner_l) and "any" to ignore it (simple layout, orphaned wall field)', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'X' }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500, wall: 'Y' }),
    ];
    expect(layoutFloorBand(modules, 'X').totalWidthMm).toBe(600);
    expect(layoutFloorBand(modules, 'Y').totalWidthMm).toBe(500);
    expect(layoutFloorBand(modules, 'any').totalWidthMm).toBe(1100);
  });

  // Etap AD, krok 3 — zgłoszenie: wentszacht/słup konstrukcyjny ("Szyb wentylacyjny / Słup") zajmuje
  // NIEPRZESUWALNY odcinek ściany — szafka, która kolidowałaby z nim, musi "przeskoczyć" od razu ZA
  // niego, kontynuując dalej (nie staje NA nim, ani przed nim, zostawiając go wolnym).
  describe('omijanie słupa/szybu konstrukcyjnego (pillars)', () => {
    it('szafka kolidująca ze słupem przeskakuje od razu ZA niego, zamiast stanąć na nim', () => {
      const modules = [
        createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }), // [0,600], bez kolizji
        createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }), // kolidowałby z [600,1200] -> przeskakuje na 1200
      ];
      const pillar = { wall: 'X', xMm: 600, widthMm: 600 };
      const { entries, totalWidthMm } = layoutFloorBand(modules, 'X', [pillar]);
      expect(entries.map(e => e.xMm)).toEqual([0, 1200]);
      expect(totalWidthMm).toBe(1800);
    });

    it('szafka, która NIE koliduje ze słupem, zostaje na swojej naturalnej pozycji (żadnego zbędnego przeskoku)', () => {
      const modules = [
        createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 400 }), // [0,400] -> nie dotyka słupa [600,1200]
      ];
      const pillar = { wall: 'X', xMm: 600, widthMm: 600 };
      const { entries } = layoutFloorBand(modules, 'X', [pillar]);
      expect(entries[0].xMm).toBe(0);
    });

    it('2 słupy blisko siebie: przeskok za pierwszy, który wyląduje w kolizji z drugim, przeskakuje też za drugi', () => {
      const modules = [
        // [0,700] koliduje z pierwszym słupem [600,900] -> przeskok na 900; [900,1600] koliduje z
        // drugim słupem [900,1300] -> przeskok na 1300; [1300,2000] nie koliduje z żadnym -> koniec.
        createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 700 }),
      ];
      const pillars = [{ wall: 'X', xMm: 600, widthMm: 300 }, { wall: 'X', xMm: 900, widthMm: 400 }];
      const { entries } = layoutFloorBand(modules, 'X', pillars);
      expect(entries[0].xMm).toBe(1300);
    });

    it('słup na INNEJ ścianie nie wpływa na tę — pillars filtrowane są PRZEZ WOŁAJĄCEGO (layoutFloorBand bierze już przefiltrowaną listę)', () => {
      const modules = [createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600, wall: 'Y' })];
      // Słup z innej ściany, celowo NIE przekazany tutaj (wołający filtruje wcześniej) -> brak kolizji.
      const { entries } = layoutFloorBand(modules, 'Y', []);
      expect(entries[0].xMm).toBe(0);
    });
  });
});

// Etap V, krok 1 — zgłoszenie: Widok z góry liczył pozycję Szafek górnych WŁASNĄ, niezależną
// kumulacją od zera (zamiast dzielić tę samą matematykę co Widok X) — rysowały się w zupełnie innym
// miejscu niż na froncie. `layoutUpperRow` to teraz JEDYNE źródło prawdy, wołane identycznie przez
// WallElevationCanvas.jsx w OBU widokach (elewacja i rzut z góry) — ten test dowodzi, że dla TYCH
// SAMYCH danych wejściowych (modules, wall, groupKey, startXmm) wynik jest zawsze identyczny.
describe('layoutUpperRow', () => {
  it('lays out a single-group row starting at an arbitrary offset (e.g. leftTallOffsetMm from layoutFloorBand)', () => {
    const modules = [
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 600 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 500 }),
    ];
    const { entries, totalWidthMm } = layoutUpperRow(modules, 'X', 'kitchen_top', 600);
    expect(entries.map(e => e.xMm)).toEqual([600, 1200]);
    expect(entries.map(e => e.widthMm)).toEqual([600, 500]);
    expect(totalWidthMm).toBe(1700);
  });

  it('Antresole (kitchen_mezzanine) start at X=0, independent of Szafki górne (kitchen_top)', () => {
    const modules = [
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 1800 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_mezzanine', W: 600 }),
    ];
    const mezzanine = layoutUpperRow(modules, 'X', 'kitchen_mezzanine', 0);
    expect(mezzanine.entries[0].xMm).toBe(0); // NIE 1800 (koniec rzędu Górnych — dawny bug)
  });

  it('ignores other groups entirely (only the exact groupKey passed in)', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 500 }),
    ];
    expect(layoutUpperRow(modules, 'X', 'kitchen_top', 0).entries).toHaveLength(1);
    expect(layoutUpperRow(modules, 'X', 'kitchen_mezzanine', 0).entries).toHaveLength(0);
  });

  // Etap AD, krok 3 — Szafki górne/Antresole omijają słup/szyb TĄ SAMĄ drogą co pas podłogowy.
  it('omija słup/szyb konstrukcyjny (pillars), tak samo jak layoutFloorBand', () => {
    const modules = [createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 600 })];
    const pillar = { wall: 'X', xMm: 0, widthMm: 300 };
    const { entries } = layoutUpperRow(modules, 'X', 'kitchen_top', 0, [pillar]);
    expect(entries[0].xMm).toBe(300);
  });

  it('Widok X i Widok z góry wywołują layoutUpperRow z TYMI SAMYMI argumentami -> IDENTYCZNE X (reprodukcja zgłoszenia)', () => {
    // Odtwarza dokładnie scenariusz ze zgłoszenia: słupek na początku (600mm), potem 3 Dolne (600 każda)
    // = leftTallOffsetMm 600, Dolne razem 2300mm; Górne (3x 600) MUSZĄ zacząć się na 600, nie na 2300.
    const modules = [
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 600 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 600 }),
      createCabinetModule('wall_cabinet', { group: 'kitchen_top', W: 500 }),
    ];
    const floor = layoutFloorBand(modules, 'X');
    expect(floor.leftTallOffsetMm).toBe(600);
    expect(floor.totalWidthMm).toBe(2300);

    // Widok X (WallElevationCanvas, elewacja) i Widok z góry WOŁAJĄ TĘ SAMĄ funkcję z TYMI SAMYMI
    // argumentami (patrz WallElevationCanvas.jsx: buildRow('kitchen_top', leftTallOffsetMm) i
    // topXRaw = layoutUpperRow(modules, 'X', 'kitchen_top', floorX.leftTallOffsetMm)).
    const topFromElevation = layoutUpperRow(modules, 'X', 'kitchen_top', floor.leftTallOffsetMm);
    const topFromPlanView = layoutUpperRow(modules, 'X', 'kitchen_top', floor.leftTallOffsetMm);
    expect(topFromElevation).toEqual(topFromPlanView);
    expect(topFromElevation.entries.map(e => e.xMm)).toEqual([600, 1200, 1800]);
    expect(topFromElevation.totalWidthMm).toBe(2300);
  });
});

describe('layoutCountertopSegments', () => {
  it('Blat rysuje się tylko nad ciągłymi odcinkami Szafek dolnych — Słupek PRZERYWA segment', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500 }),
    ];
    const { entries } = layoutFloorBand(modules, 'X');
    const segments = layoutCountertopSegments(entries);
    expect(segments).toEqual([
      { start: 0, end: 1200 },
      { start: 1800, end: 2300 },
    ]);
  });

  it('a single contiguous run of bottom cabinets yields one segment', () => {
    const modules = [
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 600 }),
      createCabinetModule('base_doors', { group: 'kitchen_bottom', W: 500 }),
    ];
    const segments = layoutCountertopSegments(layoutFloorBand(modules, 'X').entries);
    expect(segments).toEqual([{ start: 0, end: 1100 }]);
  });

  it('no bottom cabinets (only a Słupek) yields no segments', () => {
    const modules = [createCabinetModule('tall_cabinet', { group: 'kitchen_tall', W: 600 })];
    const segments = layoutCountertopSegments(layoutFloorBand(modules, 'X').entries);
    expect(segments).toEqual([]);
  });
});
