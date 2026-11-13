// Параметrуczny kalkulator szafek (Kalkulator szafek / Szybka wycena) — Etap A + Etap B
// (progresywne ustawienia, osobne nogi przód/tył, autozapis stanu, materiały per szafka).
// Czyste geometryczne jądro: deterministyczny przelicznik gabarytów modułów (W × H × D, mm) na
// powierzchnie formatek, metry bieżące kromki/rozpiłu i liczniki osprzętu. Bez efektów
// ubocznych i bez odwołań do Supabase/katalogu — kalkulator dostaje już wybrane ceny
// materiałów/usług z zewnątrz (ProjectModal.jsx / CabinetCalculator.jsx). To jądro zna tylko
// klucze/id (np. "merivobox_e" albo surowe material.id z modułu), nigdy same obiekty katalogu —
// dopasowanie klucza/id do konkretnej pozycji katalogu zostaje w CabinetCalculator.jsx.
// Architektura i roadmapa — docs/decisions/ADR-010-parametric-cabinet-calculator.md.

import { calculateProjectWycena } from './projectPricing';

// --- 1.1. Константы по умолчанию -------------------------------------------------------------

// Толщина плиты корпуса/фасада (мм).
export const DEFAULT_BOARD_THICKNESS_MM = 18;

// Полезная площадь одного стандартного листа 2800×2070 мм (5.796 м²) с учётом раскроя и
// обрезков — не вся площадь листа идёт в дело.
export const USABLE_SHEET_AREA_M2 = 4.4;

// HDF (плечи/задние стенки) кроятся из отдельного, более тонкого листа — здесь задан его
// полезный выход как самостоятельная константа (не выводится из USABLE_SHEET_AREA_M2).
export const HDF_USABLE_SHEET_AREA_M2 = 5.0;

// Запас на кромку ABS — обрезки/подгонка при наклейке.
export const EDGE_WASTE_FACTOR = 1.1;

// Typowa długość gotowego arkusza blatu sprzedawanego "na sztuki" (np. 4.1 m) — potrzebna, żeby
// uczciwie przeliczyć metry bieżące blatu na ilość wg jednostki WYBRANEGO materiału (patrz
// resolveCountertopQuantity), zamiast zawsze zakładać sprzedaż za mb.
export const COUNTERTOP_SHEET_LENGTH_M = 4.1;

// Автоподбор количества петель на одну дверь по её высоте (мм).
export const getHingesPerDoor = (doorHeightMm) => {
  const h = Number(doorHeightMm) || 0;
  if (h <= 900) return 2;
  if (h <= 1600) return 3;
  if (h <= 2100) return 4;
  return 5;
};

// Nogi: domyślnie 4 szt (2 przód + 2 tył), szerokie tumby (W > 900 mm) dostają 6 (3+3) — potrzebne
// dodatkowe wsparcie na środku. Przód = zwykłe, tył = Axilo (regulowane kluczem) — ten sam podział
// 50/50 dla wszystkich czterech typów podłogowych.
const legsForWidth = (widthMm) => {
  const total = Number(widthMm) > 900 ? 6 : 4;
  return { frontLegs: total / 2, rearAxiloLegs: total / 2 };
};

const mm2ToM2 = (widthMm, heightMm) => (Number(widthMm) * Number(heightMm)) / 1_000_000;
const mmToM = (mm) => Number(mm) / 1000;

// Форматка для внутреннего реестра панелей модуля: width/height — геометрия листа (мм),
// edgeMm — длина кромки ABS, которую реально нужно наклеить на эту форматку (мм, до +10%
// запаса). Кромкуем только лицевые (видимые) торцы, а не весь периметр.
const panel = (group, widthMm, heightMm, edgeMm = 0) => ({
  group, // 'body' | 'front' | 'hdf'
  widthMm: Number(widthMm),
  heightMm: Number(heightMm),
  edgeMm: Number(edgeMm),
});

// Etap E — sposób montażu HDF (plecy) wpływa i na wymiar samej płyty HDF, i na to, czy tylny
// torec dna/wieńca zostaje odsłonięty (wymaga kromki). "Wpuszczany" (w rowek 8mm z każdej strony)
// -> HDF mniejsze niż pełne W×H, wchodzi w rowek wyfrezowany w bokach/dnie/wieńcu; "nakładany"
// (na styk, od tyłu) -> HDF pełne W×H, zakrywa tylny torec dna/wieńca całkowicie.
const hdfPanelDims = (W, H, t, hdfInGroove) => (
  hdfInGroove
    ? { widthMm: W - 2 * t + 16, heightMm: H - 2 * t + 16 }
    : { widthMm: W, heightMm: H }
);
const hdfPanel = (W, H, t, hdfInGroove) => {
  const { widthMm, heightMm } = hdfPanelDims(W, H, t, hdfInGroove);
  return panel('hdf', widthMm, heightMm, 0);
};

// Boczki korpusu (2 na każdy moduł) ZAWSZE oklejane z TRZECH stron jednym, tym samym typem ABS —
// przedni pionowy torec (H) + górny i dolny poziomy torec (D każdy). Na produkcji nikt nie oklei
// przodu boczku inną kromką niż jego góry/dołu — to jedna, ciągła operacja jednym materiałem.
const sideEdgeMm = (H, D) => H + 2 * D;

// Dno/wieniec (poziome formatki korpusu): przedni torec zawsze; tylny torec DODATKOWO tylko gdy
// HDF jest wpuszczane w rowek — wtedy tylny torec zostaje odsłonięty za rowkiem (nakładane HDF
// zakrywa go całkowicie, więc kromka tam niepotrzebna).
const horizontalEdgeMm = (innerWidthMm, hdfInGroove) => (hdfInGroove ? 2 * innerWidthMm : innerWidthMm);

// Półki wewnętrzne: głębokość skrócona o 20mm (zapas pod rowek) tylko przy wpuszczanym HDF;
// kromkowane wyłącznie po przednim torcu (nigdy po tylnym — nie stykają się z rowkiem HDF).
const shelfDepthMm = (D, hdfInGroove) => (hdfInGroove ? D - 20 : D);

// Etap G, krok 2 — "Opuszczany front" (zaniżony fasad ze zwisem) potrzebuje +20mm wysokości
// formatki frontu na uchwyt dłoni (nie ma osobnego uchwytu ani TIP-ON) — wpływa na AREĘ, kromkę
// (obwód frontu) i próg liczby zawiasów (fizycznie front jest wyżej, może przekroczyć granicę
// 900/1600/2100mm z getHingesPerDoor).
const frontHeightBonusMm = (openingMethod) => (openingMethod === 'opuszczany_front' ? 20 : 0);

// Короб ящика считается упрощённо как площадь (не отдельные форматки).
const woodDrawerBoxAreaM2 = (count) => Number(count || 0) * 0.35;
const woodDrawerHdfAreaM2 = (widthMm, depthMm, count) => (
  Number(count || 0) * mm2ToM2(Number(widthMm) - 60, Number(depthMm) - 40)
);
const metalDrawerBoxAreaM2 = (widthMm, depthMm, count) => (
  Number(count || 0) * (
    mm2ToM2(Number(widthMm) - 75, Number(depthMm) - 20) + mm2ToM2(Number(widthMm) - 87, 135)
  )
);

const drawerBoxGeometry = (system, widthMm, depthMm, count) => {
  const safeCount = Number(count) || 0;
  if (safeCount <= 0) return { bodyAreaM2: 0, hdfAreaM2: 0 };
  if (system === 'metal') {
    return { bodyAreaM2: metalDrawerBoxAreaM2(widthMm, depthMm, safeCount), hdfAreaM2: 0 };
  }
  return {
    bodyAreaM2: woodDrawerBoxAreaM2(safeCount),
    hdfAreaM2: woodDrawerHdfAreaM2(widthMm, depthMm, safeCount),
  };
};

// Z jakich materiałów katalogu w Bloku 1 wynika geometria "metal" (gotowy bок MERIVOBOX/
// TANDEMBOX/LEGRABOX) — zwykłe prowadnice TANDEM (bez "BOX") to wciąż "wood".
export const detectDrawerSystem = (materialName) => {
  const name = String(materialName || '').toLocaleUpperCase('pl');
  if (name.includes('MERIVOBOX') || name.includes('TANDEMBOX') || name.includes('LEGRABOX')) return 'metal';
  return 'wood';
};

export const EXTERNAL_DRAWER_TYPES = ['inherit', 'merivobox_e', 'merivobox_m', 'tandem'];
export const INTERNAL_DRAWER_TYPES = ['inherit', 'merivobox_e', 'merivobox_m'];
const DRAWER_TYPE_SYSTEM = { merivobox_e: 'metal', merivobox_m: 'metal', tandem: 'wood' };
export const drawerTypeToSystem = (type) => DRAWER_TYPE_SYSTEM[type] || null; // null = inherit (brak nadpisania)

// Migracja starszych zapisów modułu (zachowana wstecznie zgodność z calculator_state zapisanym
// PRZED każdym kolejnym etapem): { drawers } (sprzed Etapu A rozdzielenia zewn./wewn.) ->
// { externalDrawers, internalDrawers } (Etap A-E) -> { externalDrawersHigh/Low,
// internalDrawersHigh/Low } (Etap F, krok 4 — szuflady różnej wysokości w jednej szafce). Stary,
// pojedynczy licznik ląduje CAŁY w "niskie (M)" — to bezpieczny, neutralny wybór (M to najczęstsza
// "zwykła" wysokość), użytkownik w 1 klik przesunie część do "wysokie" jeśli trzeba.
const normalizeDrawerFields = (module) => {
  let result = module;
  if (result && result.drawers !== undefined && result.externalDrawers === undefined && result.externalDrawersHigh === undefined) {
    const { drawers, ...rest } = result;
    result = { ...rest, externalDrawers: drawers, internalDrawers: 0 };
  }
  if (result && result.externalDrawers !== undefined && result.externalDrawersHigh === undefined) {
    const { externalDrawers, ...rest } = result;
    result = { ...rest, externalDrawersHigh: 0, externalDrawersLow: externalDrawers };
  }
  if (result && result.internalDrawers !== undefined && result.internalDrawersHigh === undefined) {
    const { internalDrawers, ...rest } = result;
    result = { ...rest, internalDrawersHigh: 0, internalDrawersLow: internalDrawers };
  }
  return result;
};

// Etap G, krok 2 — sposób otwierania drzwi (per moduł) zastępuje starą pojedynczą flagę "tipOn"
// (chip "+ TIP-ON"): decyduje i o podziale zawiasów (spowalniacz/sprężyna), i o dodatkowym
// osprzęcie (uchwyty / TIP-ON / profil HAFELE). Migracja wsteczna: stare moduły z `tipOn: true`
// (sprzed tego etapu) dostają `openingMethod: 'tip_on'`; moduły bez żadnego z tych pól dostają
// `undefined` tutaj i spadają na domyślną wartość typu (CABINET_MODULE_TYPES[type].defaults
// .openingMethod) w dalszym przetwarzaniu — nigdy pustkę.
const normalizeOpeningMethod = (module) => {
  if (!module || module.openingMethod !== undefined) return module;
  if (module.tipOn) {
    const rest = { ...module };
    delete rest.tipOn;
    return { ...rest, openingMethod: 'tip_on' };
  }
  return module;
};

// --- Grupowanie "po wybranym materiale" (ten moduł patrz, STRONA 2026-11-02): każdy moduł może
// mieć WŁASNY materiał dla płyty/kromki/zawiasów ("🎨 Własne materiały szafki") — jądro nie zna
// konkretnych materiałów, tylko ich id z modułu. Brak nadpisania -> klucz 'default' (globalny
// wybór z Bloku 1). Klucz jest ZAWSZE Stringiem — porównanie number/string id to realny bug
// (select onChange daje string, materials.id z bazy jest number) i nie może się powtórzyć tu.
const DEFAULT_BUCKET = 'default';
const bucketKeyFor = (overrideId) => (
  overrideId !== undefined && overrideId !== null && overrideId !== '' ? String(overrideId) : DEFAULT_BUCKET
);
const addToBucket = (buckets, key, amount) => {
  if (!amount) { buckets[key] = buckets[key] || 0; return; }
  buckets[key] = (buckets[key] || 0) + amount;
};
const sumBucketsWithPrefix = (buckets, prefix) => Object.entries(buckets)
  .filter(([key]) => key.startsWith(`${prefix}:`))
  .reduce((sum, [, value]) => sum + value, 0);

// --- 1.2. Шесть базовых типов модулей ---------------------------------------------------------

export const CABINET_MODULE_TYPES = {
  base_doors: {
    id: 'base_doors',
    label: 'Szafka dolna z drzwiami',
    icon: '🚪',
    defaults: { W: 600, H: 820, D: 520, doors: 1, shelves: 1, qty: 1, hdfInGroove: false, openingMethod: 'uchwyt' },
    build: ({ W, H, D, doors = 1, shelves = 0, t = DEFAULT_BOARD_THICKNESS_MM, hdfInGroove = false, openingMethod = 'uchwyt' }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const doorHeight = H + frontHeightBonusMm(openingMethod);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: shelves }, () => panel('body', innerW, shelfDepthMm(D, hdfInGroove), innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, doorHeight, 2 * (doorWidth + doorHeight))),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      return {
        panels,
        hinges: doors * getHingesPerDoor(doorHeight),
        ...legsForWidth(W),
      };
    },
  },

  base_drawers: {
    id: 'base_drawers',
    label: 'Szafka dolna z szufladami',
    icon: '🗄️',
    // Etap F, krok 4 — standardowa tumba od razu ma szuflady różnej wysokości: 2 wysokie (E) + 1
    // niska (M), tak jak w realnym projekcie (np. 2x szuflada na naczynia + 1 cokołowa).
    defaults: {
      W: 600, H: 820, D: 520, externalDrawersHigh: 2, externalDrawersLow: 1,
      internalDrawersHigh: 0, internalDrawersLow: 0, qty: 1, hdfInGroove: false,
    },
    build: ({
      W, H, D, externalDrawersHigh = 0, externalDrawersLow = 0, internalDrawersHigh = 0, internalDrawersLow = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', internalDrawerSystem = 'wood', hdfInGroove = false,
    }) => {
      const externalDrawersTotal = externalDrawersHigh + externalDrawersLow;
      const internalDrawersTotal = internalDrawersHigh + internalDrawersLow;
      const drawerCount = Math.max(1, externalDrawersTotal);
      const frontHeightPerDrawer = H / drawerCount;
      const innerW = W - 2 * t;
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: drawerCount }, () => (
          panel('front', W, frontHeightPerDrawer, 2 * (W + frontHeightPerDrawer))
        )),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawersTotal);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawersTotal);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        externalDrawerSets: externalDrawersTotal,
        internalDrawerSets: internalDrawersTotal,
        externalDrawerSetsHigh: externalDrawersHigh,
        externalDrawerSetsLow: externalDrawersLow,
        internalDrawerSetsHigh: internalDrawersHigh,
        internalDrawerSetsLow: internalDrawersLow,
        ...legsForWidth(W),
      };
    },
  },

  wall_cabinet: {
    id: 'wall_cabinet',
    label: 'Szafka górna',
    icon: '⬆️',
    // Etap G, krok 2 — szafka górna domyślnie "Opuszczany front" (zaniżony fasad ze zwisem pod
    // dłoń) — typowe rozwiązanie bez uchwytów dla górnych szafek, w odróżnieniu od pozostałych 3
    // typów (domyślnie "Uchwyt").
    defaults: { W: 600, H: 720, D: 320, doors: 1, shelves: 2, qty: 1, hdfInGroove: true, openingMethod: 'opuszczany_front', hangerCount: 2 },
    build: ({
      W, H, D, doors = 1, shelves = 0, t = DEFAULT_BOARD_THICKNESS_MM, hdfInGroove = true,
      openingMethod = 'opuszczany_front', hangerCount = 2,
    }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const doorHeight = H + frontHeightBonusMm(openingMethod);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: shelves }, () => panel('body', innerW, shelfDepthMm(D, hdfInGroove), innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, doorHeight, 2 * (doorWidth + doorHeight))),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      return {
        panels,
        hinges: doors * getHingesPerDoor(doorHeight),
        // Etap I, krok 3 — zawieszki konfigurowalne (domyślnie 2, jak dotychczas): antresola
        // "nad słupkiem/lodówką" stoi na pieniu i nie wisi na ściance, więc jej quick-add preset
        // nadpisuje to na 0, bez potrzeby osobnego typu modułu.
        hangers: hangerCount,
      };
    },
  },

  tall_cabinet: {
    id: 'tall_cabinet',
    label: 'Słupek',
    icon: '📏',
    defaults: {
      W: 600, H: 2100, D: 560, doors: 2, shelves: 4,
      externalDrawersHigh: 0, externalDrawersLow: 0, internalDrawersHigh: 0, internalDrawersLow: 0, qty: 1,
      hdfInGroove: true, openingMethod: 'uchwyt',
    },
    build: ({
      W, H, D, doors = 1, shelves = 0, externalDrawersHigh = 0, externalDrawersLow = 0,
      internalDrawersHigh = 0, internalDrawersLow = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', internalDrawerSystem = 'wood',
      hdfInGroove = true, openingMethod = 'uchwyt', hangerCount = 0,
    }) => {
      const externalDrawersTotal = externalDrawersHigh + externalDrawersLow;
      const internalDrawersTotal = internalDrawersHigh + internalDrawersLow;
      const innerW = W - 2 * t;
      // Drzwi słupka są UŁOŻONE JEDNO NAD DRUGIM (dzielą wysokość) — bonus "Opuszczany front"
      // dotyczy więc KAŻDEJO z podzielonych frontów z osobna, nie całej wysokości na raz.
      const doorHeight = H / Math.max(1, doors) + frontHeightBonusMm(openingMethod);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: shelves }, () => panel('body', innerW, shelfDepthMm(D, hdfInGroove), innerW)),
        ...Array.from({ length: doors }, () => panel('front', W, doorHeight, 2 * (W + doorHeight))),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawersTotal);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawersTotal);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        hinges: doors * getHingesPerDoor(doorHeight),
        externalDrawerSets: externalDrawersTotal,
        internalDrawerSets: internalDrawersTotal,
        externalDrawerSetsHigh: externalDrawersHigh,
        externalDrawerSetsLow: externalDrawersLow,
        internalDrawerSetsHigh: internalDrawersHigh,
        internalDrawerSetsLow: internalDrawersLow,
        // Etap I, krok 3 — "Słupek łazienkowy" dodatkowo mocuje się do ściany (hangerCount: 2
        // w swoim presecie) — pozostałe słupki (kuchenne) nie mają zawieszek (domyślnie 0).
        hangers: hangerCount,
        ...legsForWidth(W),
      };
    },
  },

  // Etap V, krok 2 — pod WBUDOWANY sprzęt chłodniczy (178/194/194 XXL, patrz FRIDGE_STANDARD_OPTIONS
  // niżej): 2 NIERÓWNE fronty (dolny — "morozilka", w jednej linii z sąsiednimi Dolnymi; górny —
  // lodówka + stała półka nad nią), BEZ pleców HDF (obowiązkowy kanał wentylacyjny za urządzeniem)
  // i z półkami skróconymi o 60mm głębokości (miejsce na skraplacz z tyłu urządzenia).
  fridge_tall_cabinet: {
    id: 'fridge_tall_cabinet',
    label: 'Pod lodówkę',
    icon: '❄️',
    defaults: {
      W: 600, H: 2100, D: 560, shelves: 1, qty: 1,
      fridgeStandard: 'standard_178', fridgeNicheHeightMm: 1780,
      // Etap V, krok 2 — nadpisywane REAKTYWNIE przez syncModuleHeights (jak `H` dla `heightRole`),
      // żeby dolny front zawsze został w jednej linii z aktualną wysokością sąsiednich Dolnych.
      bottomHeightMm: 771,
    },
    build: ({ W, H, D, shelves = 0, bottomHeightMm = 771, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const innerW = W - 2 * t;
      // Półki NAD lodówką skrócone o 60mm (zamiast standardowych 20mm przy hdfInGroove) — za
      // urządzeniem biegnie kanał wentylacyjny/skraplacz, półka nie może go zasłaniać na całej Gł.
      const ventilatedDepthMm = Math.max(1, D - 60);
      const lowerFrontHeightMm = Math.max(1, Math.min(H - 1, Number(bottomHeightMm) || H * 0.4));
      const upperFrontHeightMm = Math.max(1, H - lowerFrontHeightMm);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, innerW), // dno
        panel('body', innerW, D, innerW), // wieniec górny (dach)
        // 1 SZTYWNA półka NAD lodówką (konstrukcyjna, zawsze) + `shelves` dodatkowych w przedziale
        // nad nią (domyślnie 1, user-editable jak w pozostałych słupkach).
        ...Array.from({ length: 1 + Math.max(0, shelves) }, () => panel('body', innerW, ventilatedDepthMm, innerW)),
        panel('front', W, lowerFrontHeightMm, 2 * (W + lowerFrontHeightMm)),
        panel('front', W, upperFrontHeightMm, 2 * (W + upperFrontHeightMm)),
        // CELOWO bez hdfPanel(...) — brak pleców, kanał wentylacyjny za urządzeniem jest obowiązkowy.
      ];
      return {
        panels,
        hinges: getHingesPerDoor(lowerFrontHeightMm) + getHingesPerDoor(upperFrontHeightMm),
        // Brak pola "doors" w defaults (fronty mają STAŁY, nierówny podział — nie dzielą się
        // równo jak u innych typów) — frontCount mówi computeModule, że mimo to są 2 fronty do
        // wyceny uchwytu/TIP-ON/profilu HAFELE (patrz dishwasher_front/corner_blind_cabinet).
        frontCount: 2,
        ...legsForWidth(W),
      };
    },
  },

  wardrobe_section: {
    id: 'wardrobe_section',
    label: 'Szafa / Garderoba',
    icon: '🧥',
    defaults: {
      W: 900, H: 2400, D: 600, doors: 2, shelves: 5,
      externalDrawersHigh: 1, externalDrawersLow: 1, internalDrawersHigh: 0, internalDrawersLow: 0, qty: 1,
      hdfInGroove: false, openingMethod: 'uchwyt', legsEnabled: true,
    },
    build: ({
      W, H, D, doors = 1, shelves = 0, externalDrawersHigh = 0, externalDrawersLow = 0,
      internalDrawersHigh = 0, internalDrawersLow = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', internalDrawerSystem = 'wood',
      hdfInGroove = false, openingMethod = 'uchwyt', legsEnabled = true,
    }) => {
      const externalDrawersTotal = externalDrawersHigh + externalDrawersLow;
      const internalDrawersTotal = internalDrawersHigh + internalDrawersLow;
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const doorHeight = H + frontHeightBonusMm(openingMethod);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: shelves }, () => panel('body', innerW, shelfDepthMm(D, hdfInGroove), innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, doorHeight, 2 * (doorWidth + doorHeight))),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawersTotal);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawersTotal);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        hinges: doors * getHingesPerDoor(doorHeight),
        externalDrawerSets: externalDrawersTotal,
        internalDrawerSets: internalDrawersTotal,
        externalDrawerSetsHigh: externalDrawersHigh,
        externalDrawerSetsLow: externalDrawersLow,
        internalDrawerSetsHigh: internalDrawersHigh,
        internalDrawerSetsLow: internalDrawersLow,
        // Etap I, krok 3 — "Pawlacz / Nadstawka" wisi NAD szafą (na zawieszkach/łącznikach do
        // korpusu niżej), nie stoi na podłodze — jej quick-add preset wyłącza nogi (legsEnabled:
        // false); pozostałe moduły szafy/garderoby zostają z nogami jak dotychczas.
        ...(legsEnabled ? legsForWidth(W) : { frontLegs: 0, rearAxiloLegs: 0 }),
      };
    },
  },

  // Etap H, krok 3 — 4 nowe typy kuchenne.
  oven_cabinet: {
    id: 'oven_cabinet',
    label: 'Szafka pod piekarnik',
    icon: '🔥',
    // Domyślnie 1 niska szuflada zewn. ("pod piekarnikiem", patrz EXTERNAL_DRAWER_TYPE_OPTIONS) —
    // te same 2 liczniki (externalDrawersHigh/Low) co base_drawers, więc Układ szuflad/routing po
    // materiale działają identycznie, bez żadnej specjalnej logiki.
    defaults: { W: 600, H: 820, D: 520, qty: 1, hdfInGroove: true, externalDrawersHigh: 0, externalDrawersLow: 1 },
    build: ({
      W, H, D, t = DEFAULT_BOARD_THICKNESS_MM, hdfInGroove = true,
      externalDrawersHigh = 0, externalDrawersLow = 0, externalDrawerSystem = 'wood',
    }) => {
      const externalDrawersTotal = externalDrawersHigh + externalDrawersLow;
      const innerW = W - 2 * t;
      // Piekarnik zajmuje większość wysokości korpusu — widoczny front to TYLKO niska szuflada
      // pod nim (~140mm), nie pełne W×H.
      const frontHeightMm = 140;
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        // Nośna półka pod piekarnik — zawsze skrócona o 20mm (zapas), niezależnie od hdfInGroove.
        panel('body', innerW, D - 20, innerW),
        // Górne planki/царги — wąskie (100mm), kromkowane TYLKO z przodu (w odróżnieniu od dna,
        // które graniczy z rowkiem HDF na całej głębokości, te nie sięgają tylnej ściany).
        panel('body', innerW, 100, innerW),
        panel('body', innerW, 100, innerW),
        panel('front', W, frontHeightMm, 2 * (W + frontHeightMm)),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawersTotal);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2,
        externalDrawerSets: externalDrawersTotal,
        externalDrawerSetsHigh: externalDrawersHigh,
        externalDrawerSetsLow: externalDrawersLow,
        frontLegs: 2,
        rearAxiloLegs: 2,
      };
    },
  },

  sink_cabinet: {
    id: 'sink_cabinet',
    label: 'Szafka pod zlew',
    icon: '🚰',
    // Bez półek (zlewozmywak zajmuje całe wnętrze) i bez HDF (tylna ściana zasłonięta syfonem/
    // rurami, nie opłaca się jej kłaść) — stąd brak pól shelves/hdfInGroove w defaults w ogóle.
    defaults: { W: 600, H: 820, D: 520, doors: 1, qty: 1, openingMethod: 'uchwyt' },
    build: ({ W, H, D, doors = 1, t = DEFAULT_BOARD_THICKNESS_MM, openingMethod = 'uchwyt' }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const doorHeight = H + frontHeightBonusMm(openingMethod);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, innerW),
        panel('body', innerW, 100, innerW),
        panel('body', innerW, 100, innerW),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, doorHeight, 2 * (doorWidth + doorHeight))),
      ];
      return {
        panels,
        hinges: doors * getHingesPerDoor(doorHeight),
        ...legsForWidth(W),
      };
    },
  },

  dishwasher_front: {
    id: 'dishwasher_front',
    label: 'Zabudowa zmywarki',
    icon: '🍽️',
    // Etap AB, krok 3 — zgłoszenie (zmywarka.jpg): zmywarka to WOLNO STOJĄCY sprzęt AGD z WŁASNYM
    // korpusem — nie ma ŻADNYCH formatek korpusu mebli (ani boczków/dna, ani dawnych 2 dystansowych
    // traweres), TYLKO front meblowy maskujący urządzenie; bez zawiasów (drzwi otwiera mechanizm
    // zmywarki) i bez nóg (zmywarka stoi na własnych regulowanych nóżkach).
    defaults: { W: 600, H: 720, D: 520, qty: 1, openingMethod: 'uchwyt' },
    build: ({ W, H }) => {
      const panels = [
        panel('front', W, H, 2 * (W + H)),
      ];
      return {
        panels,
        hinges: 0,
        // Brak pola "doors" (nie ma zawiasów do liczenia) — frontCount mówi computeModule, że mimo
        // to jest dokładnie 1 "front" do wyceny uchwytu/TIP-ON/profilu HAFELE wg sposobu otwierania.
        frontCount: 1,
      };
    },
  },

  corner_blind_cabinet: {
    id: 'corner_blind_cabinet',
    label: 'Narożna zaślepiona',
    icon: '📐',
    // W — CAŁKOWITA szerokość narożnika; frontWidth — szerokość otwieranych drzwi (reszta, W -
    // frontWidth, to głucha zaślepka korpusu + widoczna 100mm blenda frontu w rogu).
    defaults: { W: 1000, H: 820, D: 520, frontWidth: 450, shelves: 1, qty: 1, hdfInGroove: false, openingMethod: 'uchwyt' },
    build: ({
      W, H, D, frontWidth = 450, shelves = 0, t = DEFAULT_BOARD_THICKNESS_MM,
      hdfInGroove = false, openingMethod = 'uchwyt',
    }) => {
      const innerW = W - 2 * t;
      const doorHeight = H + frontHeightBonusMm(openingMethod);
      const blindWidth = Math.max(0, W - frontWidth);
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        panel('body', innerW, D, horizontalEdgeMm(innerW, hdfInGroove)),
        ...Array.from({ length: shelves }, () => panel('body', innerW, shelfDepthMm(D, hdfInGroove), innerW)),
        // Głucha zaślepka korpusu — widoczna z boku, kromkowana po całym obwodzie.
        panel('body', blindWidth, H, 2 * (blindWidth + H)),
        panel('front', frontWidth, doorHeight, 2 * (frontWidth + doorHeight)),
        // Widoczna narożna blenda frontu (stały pasek 100mm) — kromkowana po całym obwodzie.
        panel('front', 100, doorHeight, 2 * (100 + doorHeight)),
        hdfPanel(W, H, t, hdfInGroove),
      ];
      return {
        panels,
        hinges: getHingesPerDoor(doorHeight),
        frontCount: 1,
        ...legsForWidth(W),
      };
    },
  },

  // Etap I, krok 3 — szafka łazienkowa pod umywalkę: podwieszana (zawieszki, bez nóg — jak
  // wall_cabinet), Z SZUFLADAMI (jak base_drawers), ale BEZ HDF w ogóle (syfon/rury zasłaniają
  // tylną ściankę, nie opłaca się jej kłaść — stąd brak hdfPanel() w panelach, jak w sink_cabinet).
  vanity_cabinet: {
    id: 'vanity_cabinet',
    label: 'Szafka pod umywalkę',
    icon: '🚰',
    defaults: {
      W: 800, H: 550, D: 460, externalDrawersHigh: 2, externalDrawersLow: 0,
      internalDrawersHigh: 0, internalDrawersLow: 0, qty: 1, hangerCount: 2,
    },
    build: ({
      W, H, D, externalDrawersHigh = 0, externalDrawersLow = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', hangerCount = 2,
    }) => {
      const externalDrawersTotal = externalDrawersHigh + externalDrawersLow;
      const drawerCount = Math.max(1, externalDrawersTotal);
      const frontHeightPerDrawer = H / drawerCount;
      const innerW = W - 2 * t;
      const panels = [
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', H, D, sideEdgeMm(H, D)),
        panel('body', innerW, D, innerW),
        panel('body', innerW, D, innerW),
        ...Array.from({ length: drawerCount }, () => (
          panel('front', W, frontHeightPerDrawer, 2 * (W + frontHeightPerDrawer))
        )),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawersTotal);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2,
        externalDrawerSets: externalDrawersTotal,
        externalDrawerSetsHigh: externalDrawersHigh,
        externalDrawerSetsLow: externalDrawersLow,
        hangers: hangerCount,
      };
    },
  },

  countertop: {
    id: 'countertop',
    label: 'Blat',
    icon: '🪵',
    defaults: { W: 2400, D: 600, qty: 1 },
    build: ({ W }) => ({
      panels: [],
      countertopMeters: mmToM(W),
    }),
  },

  // Etap Q, krok 2 — blendy/cokół PRZESTAJĄ być osobną "instalacyjną" formułą (computeTrims,
  // usunięte) i stają się ZWYKŁYMI modułami: zajmują miejsce w rzędzie na ścianie (side_filler —
  // szerokość w mm, jak każda inna szafka), dają się przeciągnąć/przestawić na WallElevationCanvas
  // jak każdy inny moduł, a ich powierzchnia/kromka liczy się przez TEN SAM computeModule co reszta
  // projektu — żadnej specjalnej ścieżki w summarizeCabinetModules/buildCabinetCostBreakdown.
  side_filler: {
    id: 'side_filler',
    label: 'Blenda boczna',
    icon: '📐',
    // Wąska pionowa listwa z Płyty FRONTU (widoczna, boczna krawędź zestawu) — kromkowana po OBU
    // pionowych torcach (przód i tył listwy widoczne z boku), bez płyty korpusu w ogóle.
    defaults: { W: 50, H: 757, D: 18, qty: 1 },
    build: ({ W, H }) => ({
      panels: [panel('front', W, H, 2 * H)],
    }),
  },
  top_filler: {
    id: 'top_filler',
    label: 'Blenda górna (pod sufit)',
    icon: '📐',
    // Pozioma listwa pod sufitem, na całą szerokość rzędu — z Płyty frontu, kromkowana po górnym
    // I dolnym torcu (listwa "wisi" w powietrzu, oba widoczne).
    defaults: { W: 600, H: 50, D: 18, qty: 1 },
    build: ({ W, H }) => ({
      panels: [panel('front', W, H, 2 * W)],
    }),
  },
  plinth_strip: {
    id: 'plinth_strip',
    label: 'Cokół',
    icon: '📐',
    // Pozioma listwa wysokości nóg, na całą szerokość rzędu dolnego — z płyty KORPUSU albo FRONTU
    // (wybór per moduł, `source`), kromkowana tylko po 1 widocznej (górnej) krawędzi.
    defaults: { W: 2400, H: 105, D: 18, qty: 1, source: 'body' },
    build: ({ W, H, source = 'body' }) => ({
      panels: [panel(source === 'front' ? 'front' : 'body', W, H, W)],
    }),
  },
};

export const CABINET_MODULE_ORDER = [
  'base_doors', 'base_drawers', 'wall_cabinet', 'tall_cabinet', 'fridge_tall_cabinet', 'wardrobe_section',
  'oven_cabinet', 'sink_cabinet', 'dishwasher_front', 'corner_blind_cabinet', 'vanity_cabinet', 'countertop',
  'side_filler', 'top_filler', 'plinth_strip',
];
// Etap Q, krok 2 — grupy, w których blendy/cokół mają sens (patrz CATEGORY_GROUPS w
// CabinetCalculator.jsx dla faktycznych presetów quick-add per grupa).
export const FILLER_MODULE_TYPES = ['side_filler', 'top_filler', 'plinth_strip'];

// Etap J, krok 2/3 — domyślny slug ikony SVG (patrz components/CabinetModuleIcons.jsx) per TYP —
// fallback dla modułu bez własnego `module.icon` (np. stary calculator_state sprzed tej zmiany,
// albo moduł utworzony programowo w teście bez presetu). Quick-add presety zwykle nadpisują to
// swoim WŁASNYM slugiem (np. "Szafka nad okap" dostaje 'hood', nie domyślny 'wallDoors' typu
// wall_cabinet) — ten sam mechanizm co `module.label` dla etykiety presetu.
export const CABINET_MODULE_TYPE_ICON = {
  base_doors: 'doors',
  base_drawers: 'drawers',
  wall_cabinet: 'wallDoors',
  tall_cabinet: 'pillarShelves',
  fridge_tall_cabinet: 'fridge',
  wardrobe_section: 'doors',
  oven_cabinet: 'oven',
  sink_cabinet: 'sink',
  dishwasher_front: 'dishwasher',
  corner_blind_cabinet: 'corner',
  vanity_cabinet: 'vanityDrawers',
  countertop: 'countertop',
  side_filler: 'sideFiller',
  top_filler: 'topFiller',
  plinth_strip: 'plinth',
};

// Etap V, krok 2 — 3 standardy wbudowanych lodówek (⚙️ "Standard lodówki do zabudowy" w wierszu
// `fridge_tall_cabinet`) — wybór nadpisuje W/D/fridgeNicheHeightMm modułu NARAZ (patrz
// applyFridgeStandard w CabinetCalculator.jsx); XXL jest celowo SZERSZY (750mm) niż pozostałe 2
// (600mm), bo mieści szerszą (75cm) lodówkę side-by-side.
export const FRIDGE_STANDARD_OPTIONS = [
  {
    value: 'standard_178', label: 'Standard 178 cm (szafka 600 mm, wnęka 564×1780 mm)',
    W: 600, D: 560, fridgeNicheHeightMm: 1780,
  },
  {
    value: 'xl_194', label: 'Wysoka XL 194 cm (szafka 600 mm, wnęka 564×1940 mm)',
    W: 600, D: 560, fridgeNicheHeightMm: 1940,
  },
  {
    value: 'xxl_75_194', label: 'Szeroka XXL 75 cm / 194 cm (szafka 750 mm, wnęka 714×1940 mm)',
    W: 750, D: 560, fridgeNicheHeightMm: 1940,
  },
];

// --- Etap L, krok 1 — wysokości bazowe kuchni (panel "Wymiary wysokościowe kuchni") ------------
// Czysta funkcja: z garści parametrów stolarskich (sufit/blat/nogi/pas roboczy/antresola) liczy
// REKOMENDOWANE wysokości korpusów 4 grup kuchennych (dolne/górne/słupki/antresole) — żeby user nie
// musiał ręcznie liczyć "900 - 38 - 105" za każdym razem, gdy zmieni wysokość blatu. Zwraca OBIE
// warianty dla górnych/słupków (z antresolą i bez) — to UI (CabinetCalculator.jsx) decyduje, który
// wariant jest "aktualny" (zależy od tego, czy projekt ma już jakiś moduł w grupie kitchen_mezzanine).
// Etap N, krok 1 — `wallWidthMm`/`countertopDepthMm` dołączone tu (Obszar 1/2 panelu wymiarów w
// UI), żeby cały zestaw parametrów instalacji zostawał JEDNYM obiektem w `calculator_state.heights`
// — `countertopDepthMm` nie wpływa na żadną z wysokości niżej (to wymiar w głąb, nie w pionie),
// zostaje czystą daną do rysunku/przyszłego widoku z góry. Etap O, krok 3 — `wallYWidthMm` (druga
// ściana kuchni narożnej L) z tego samego powodu: jeden obiekt, nawet gdy `roomLayout` (osobny stan
// w CabinetCalculator.jsx) jest "simple" i pole w ogóle nie jest widoczne w UI. Etap AD, krok 2 —
// `wallY2WidthMm` to TA SAMA zasada dla drugiej ściany Y, ale PRAWEJ (`roomLayout: 'corner_l_right'`
// albo `'u_layout'`).
export const DEFAULT_KITCHEN_HEIGHTS = {
  wallWidthMm: 3000,
  wallYWidthMm: 2200,
  wallY2WidthMm: 2200,
  ceilingHeight: 2600,
  countertopHeight: 900,
  countertopThickness: 38,
  countertopDepthMm: 600,
  legHeight: 105,
  backsplashHeight: 600,
  mezzanineHeight: 400,
  ceilingGap: 20,
};

export const computeKitchenHeights = (input = {}) => {
  const h = { ...DEFAULT_KITCHEN_HEIGHTS, ...input };
  const ceilingHeight = Number(h.ceilingHeight) || 0;
  const countertopHeight = Number(h.countertopHeight) || 0;
  const countertopThickness = Number(h.countertopThickness) || 0;
  const legHeight = Number(h.legHeight) || 0;
  const backsplashHeight = Number(h.backsplashHeight) || 0;
  const mezzanineHeight = Number(h.mezzanineHeight) || 0;
  const ceilingGap = Number(h.ceilingGap) || 0;

  // Szafki dolne (i PMM, skrzynie zmywarki itd.) — od podłogi, nad nogami, pod blatem.
  const bottomHeight = Math.max(400, countertopHeight - countertopThickness - legHeight);

  // Słupki/pеnały — pod sufit (z zapasem `ceilingGap`), minus wysokość nóg; jeśli nad nimi stoi
  // antresola, słupek jest krótszy o jej wysokość.
  const tallFullHeight = ceilingHeight - ceilingGap - legHeight;
  const tallHeightWithMezzanine = tallFullHeight - mezzanineHeight;

  // Szafki górne — strefa między górą blatu (+ pas roboczy/backsplash) a sufitem; jeśli nad nimi
  // stoi antresola, szafka górna jest krótsza o jej wysokość.
  const wallZoneFull = ceilingHeight - ceilingGap - countertopHeight - backsplashHeight;
  const wallHeightWithMezzanine = wallZoneFull - mezzanineHeight;

  return {
    bottomHeight,
    tallFullHeight,
    tallHeightWithMezzanine,
    wallZoneFull,
    wallHeightWithMezzanine,
    mezzanineHeight,
  };
};

// Etap N, krok 3 — przestawianie szafek (WallElevationCanvas: myszką/Pointer Events; tabela:
// strzałki ◀/▶) — czysta, generyczna funkcja przesunięcia elementu w tablicy, bez mutacji. UI woła
// ją na PODLIŚCIE modułów JEDNEJ grupy (modules.filter(m => m.group === groupKey)), potem wkleja
// wynik z powrotem na te same pozycje w pełnej liście modułów (patrz reorderModuleInGroup).
export const reorderItems = (items, fromIndex, toIndex) => {
  const list = [...(items || [])];
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return list;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
};

// Etap O, krok 1 — reaktywna synchronizacja wysokości: moduł z `heightRole` (bottom/wall/mezzanine/
// tall) i BEZ ręcznej blokady (`customHeight`) ZAWSZE ma wysokość równą żywej rekomendacji panelu
// (heightForRole) — user już nie musi klikać "↻ Zastosuj wysokości" po każdej zmianie blatu/sufitu.
// Moduł z `customHeight: true` (user ręcznie wpisał Wys. (mm) w tabeli) jest pomijany — zostaje przy
// swojej własnej wartości, dopóki user nie kliknie przycisku resetu (↺, per moduł) albo masowego
// "Resetuj ręczne wysokości do standardu" (patrz CabinetCalculator.jsx). Czysta funkcja — UI woła ją
// w useEffect za każdym razem, gdy zmienia się heightForRole (nie `modules`, żeby uniknąć pętli).
export const syncModuleHeights = (modules, heightForRole) => (modules || []).map((module) => {
  let next = module;
  if (module.heightRole && !module.customHeight) {
    const target = heightForRole?.[module.heightRole];
    if (target !== undefined && target !== null && Number(next.H) !== Number(target)) {
      next = { ...next, H: target };
    }
  }
  // Etap V, krok 2 — dolny front pieca/lodówki (`fridge_tall_cabinet`) musi zostać W JEDNEJ LINII z
  // górą sąsiednich Dolnych — ten sam mechanizm co `H`/heightRole wyżej, tylko dla jednego,
  // konkretnego typu (nie ma sensu jako ogólny `heightRole`, bo to NIE jest jego własna wysokość
  // całkowita, tylko wysokość podziału DWÓCH frontów wewnątrz tej samej, stałej wysokości słupka).
  if (module.type === 'fridge_tall_cabinet') {
    const targetBottom = heightForRole?.bottom;
    if (targetBottom !== undefined && targetBottom !== null && Number(next.bottomHeightMm) !== Number(targetBottom)) {
      next = { ...next, bottomHeightMm: targetBottom };
    }
  }
  return next;
});

// Etap U, krok 2/3 — Dolne (`kitchen_bottom`) i Słupki (`kitchen_tall`) stoją fizycznie w JEDNYM,
// wspólnym napodłogowym rzędzie (identyczna kotwica wysokości, patrz ANCHORS.kitchen_bottom/
// kitchen_tall w WallElevationCanvas.jsx) — ich kolejność w tym rzędzie to kolejność WYSTĘPOWANIA w
// `modules`, nie osobna "swoja" kolejność każdej grupy z osobna. To jedyne źródło prawdy dla
// X-pozycji na rysunku, dla "Zajęte" (computeWallFreeSpace) i dla tabeli (CabinetCalculator.jsx) —
// scalone w jedną czystą funkcję, żeby WSZYSTKIE trzy miejsca liczyły DOKŁADNIE to samo (bug ze
// zgłoszenia: antresola sumowała się z Szafki górne, bo dwa miejsca liczyły szerokość inaczej).
// `wall` = 'X' | 'Y' | 'any' ('any' pomija filtr ściany — używane w układzie PROSTYM, gdzie pole
// `wall` jest nieaktywne/niewidoczne w UI, patrz komentarz przy computeWallFreeSpace niżej).
//
// Etap AD, krok 2 — zgłoszenie: druga ściana Y mogła dotąd stać TYLKO z lewej strony ściany X
// (narożnik w (0,0)). Dochodzi `'Y2'` — ta sama ściana Y, ale PRZYCZEPIONA do prawego końca ściany
// X (narożnik w (wallWidthX, 0)) — używana przez `Narożny L — ściana Y z prawej` i `Układ U` (oba
// narożniki naraz). `normalizeModuleWall` to JEDYNE miejsce, które wie, że "każda wartość inna niż
// 'Y'/'Y2' liczy się jak 'X'" — wcześniej ta sama reguła była powielona osobno w layoutFloorBand/
// layoutUpperRow/computeWallFreeSpace/CabinetCalculator.jsx (effectiveModuleWall), co groziło, że
// dodanie 'Y2' zostanie przeoczone w którymś z nich.
export const normalizeModuleWall = (module) => (
  module?.wall === 'Y' || module?.wall === 'Y2' ? module.wall : 'X'
);
// Etap AD, krok 3 — zgłoszenie: wentszacht/słup konstrukcyjny ("Szyb wentylacyjny / Słup") zajmuje
// NIEPRZESUWALNY odcinek [pillar.xMm, pillar.xMm+widthMm] na swojej ścianie — szafka, której
// najbliższa wolna pozycja (`cursor`) kolidowałaby z tym odcinkiem, musi "przeskoczyć" od razu ZA
// niego, zamiast się na nim fizycznie oprzeć. Pętla (nie pojedyncze `if`) obsługuje PRZYPADEK kilku
// słupów blisko siebie — przeskok za pierwszy może wylądować w kolizji z drugim.
const advancePastPillars = (startMm, widthMm, pillars) => {
  if (!pillars || pillars.length === 0) return startMm;
  let pos = startMm;
  let changed = true;
  while (changed) {
    changed = false;
    pillars.forEach((pillar) => {
      const pillarStart = Number(pillar.xMm) || 0;
      const pillarEnd = pillarStart + Math.max(0, Number(pillar.widthMm) || 0);
      if (pos < pillarEnd && pos + widthMm > pillarStart) {
        pos = pillarEnd;
        changed = true;
      }
    });
  }
  return pos;
};

export const FLOOR_BAND_GROUPS = ['kitchen_bottom', 'kitchen_tall'];
export const layoutFloorBand = (modules, wall, pillars = []) => {
  const items = (modules || []).filter(m => FLOOR_BAND_GROUPS.includes(m.group)
    && (wall === 'any' || normalizeModuleWall(m) === wall));
  let cursor = 0;
  let leftTallOffsetMm = 0;
  let inLeadingTallRun = true;
  const entries = items.map((module) => {
    const widthMm = Math.max(0, Number(module.W) || 0);
    cursor = advancePastPillars(cursor, widthMm, pillars);
    const entry = { module, xMm: cursor, widthMm };
    if (inLeadingTallRun && module.group === 'kitchen_tall') leftTallOffsetMm += widthMm;
    else inLeadingTallRun = false;
    cursor += widthMm;
    return entry;
  });
  return { entries, totalWidthMm: cursor, leftTallOffsetMm };
};

// Etap X, krok 2 — kuchnia narożna (L): "честная мебельная геометрия угла" — szafka/pas Y nie
// może fizycznie zaczynać się od y=0, jeśli w rogu (x=0 ściany X) stoi już jakiś pas podłogowy
// (Dolne/Słupki): jego GŁĘBOKOŚĆ (korpus, a jeśli blat go przykrywa — głębokość blatu, która
// zwykle jest większa niż korpus) fizycznie zajmuje ten sam róg na ścianie Y. Zwraca mm, o które
// trzeba przesunąć START pierwszego elementu pasa podłogowego ściany Y (patrz startOffsetMm w
// layoutFloorBand) — 0, gdy róg ściany X jest pusty (nic nie koliduje).
//
// Etap AD, krok 2 — `side: 'right'` liczy ten sam narożnik, ale dla ściany Y2 (prawa): zajęty jest
// róg na PRAWYM końcu ściany X, więc patrzymy na OSTATNI element jej pasa podłogowego — ALE, w
// odróżnieniu od lewego rogu (gdzie PIERWSZY element ZAWSZE zaczyna się w x=0, czyli dokładnie w
// rogu, z definicji layoutFloorBand), ostatni element fizycznie DOTYKA prawego rogu TYLKO wtedy, gdy
// pas podłogowy ściany X faktycznie SIĘGA do jej `wallXWidthMm` (koniec ostatniej szafki >= ściana).
// Jeśli między ostatnią szafką a ścianą jest wolna przestrzeń (typowy przypadek, patrz freeZone),
// prawy róg jest PUSTY mimo że floorX ma jakieś elementy — stąd wymagany tu `wallXWidthMm`.
export const computeCornerDepthMm = (modules, countertopDepthMm = 0, side = 'left', wallXWidthMm = Infinity) => {
  const floorX = layoutFloorBand(modules, 'X');
  let cornerModule;
  if (side === 'right') {
    const last = floorX.entries[floorX.entries.length - 1];
    cornerModule = (last && last.xMm + last.widthMm >= Number(wallXWidthMm) - 0.01) ? last.module : null;
  } else {
    cornerModule = floorX.entries[0]?.module;
  }
  if (!cornerModule) return 0;
  const bodyDepthMm = Math.max(0, Number(cornerModule.D) || 520);
  // Blat rysuje się TYLKO nad kitchen_bottom (patrz layoutCountertopSegments) — Słupek w rogu
  // (kitchen_tall) nie ma blatu nad sobą, więc tylko jego WŁASNA głębokość liczy się do rogu.
  const countertopCoversCorner = cornerModule.group === 'kitchen_bottom';
  return Math.max(bodyDepthMm, countertopCoversCorner ? Math.max(0, Number(countertopDepthMm) || 0) : 0);
};

// Blat (countertopStrip na rysunku) rysuje się TYLKO nad ciągłymi odcinkami Szafek dolnych — Słupek
// stoi w tym samym rzędzie, ale sięga prawie pod sufit (bez blatu nad sobą), więc łamie ciągły
// odcinek na osobne segmenty (patrz WallElevationCanvas.jsx, renderowanie `countertopStrip`).
export const layoutCountertopSegments = (floorEntries) => {
  const segments = [];
  let current = null;
  (floorEntries || []).forEach((entry) => {
    if (entry.module.group === 'kitchen_bottom') {
      if (!current) current = { start: entry.xMm, end: entry.xMm + entry.widthMm };
      else current.end = entry.xMm + entry.widthMm;
    } else if (current) {
      segments.push(current);
      current = null;
    }
  });
  if (current) segments.push(current);
  return segments;
};

// Etap V, krok 1 — Szafki górne (`kitchen_top`) i Antresole (`kitchen_mezzanine`) stoją w SWOICH
// WŁASNYCH, niezależnych rzędach (nie w rzędzie podłogowym) — ale muszą zaczynać się na TEJ SAMEJ
// współrzędnej X na KAŻDYM widoku (Widok X, Widok Y, Widok z góry), inaczej dwa rysunki tego samego
// projektu się rozjeżdżają (zgłoszenie: Widok z góry liczył pozycję Górnych OSOBNĄ, niezależną
// kumulacją od zera, zamiast dzielić TĘ SAMĄ matematykę co Widok X — rysowały się w zupełnie innym
// miejscu). Górne zaczynają się za WIODĄCYMI słupkami z lewej (`startXmm` = `leftTallOffsetMm` z
// `layoutFloorBand`); Antresole zaczynają się od zera (`startXmm = 0`) — WOŁAJĄCY decyduje który.
export const layoutUpperRow = (modules, wall, groupKey, startXmm = 0, pillars = []) => {
  const items = (modules || []).filter(m => m.group === groupKey
    && (wall === 'any' || normalizeModuleWall(m) === wall));
  let cursor = startXmm;
  const entries = items.map((module) => {
    const widthMm = Math.max(0, Number(module.W) || 0);
    cursor = advancePastPillars(cursor, widthMm, pillars);
    const entry = { module, xMm: cursor, widthMm };
    cursor += widthMm;
    return entry;
  });
  return { entries, totalWidthMm: cursor };
};

// Etap O, krok 3 — kuchnia narożna (L): dwie ściany, `X` (główna) i `Y` (druga, prostopadła pod
// 90°) — każdy moduł ma pole `wall` ('X'/'Y', domyślnie 'X'). Zajęte miejsce liczy się PER ŚCIANA,
// jako NAJSZERSZY jarus tej ściany (ta sama logika co occupiedWallWidthMm w CabinetCalculator.jsx,
// tylko osobno dla X i Y). W układzie narożnym pierwsze `cornerDepthMm` mm ściany Y jest "zajęte"
// przez GŁĘBOKOŚĆ narożnika stojącego na ścianie X (fizycznie blat/korpus wystaje w róg) — odejmuje
// się to od dostępnej (nie: zajętej) długości ściany Y, zanim policzy się jej własny wolny odcinek.
//
// Etap AD, krok 2 — `layout: 'corner_l_right'` (druga ściana TYLKO z prawej, `wall: 'Y2'`) i
// `layout: 'u_layout'` (OBIE naraz, Y z lewej + Y2 z prawej — układ U) dochodzą jako warianty: każda
// obecna ściana (Y i/lub Y2) dostaje WŁASNY komplet liczb (occupiedY2/wallY2WidthMm/itd.), licząc
// się dokładnie tą samą drogą co Y, tylko pod innym kluczem ściany.
export const computeWallFreeSpace = (modules, {
  wallXWidthMm = 0, wallYWidthMm = 0, wallY2WidthMm = 0, layout = 'simple', cornerDepthMm = 0, cornerDepth2Mm = 0,
  pillars = [],
} = {}) => {
  const hasWallY = layout === 'corner_l' || layout === 'u_layout';
  const hasWallY2 = layout === 'corner_l_right' || layout === 'u_layout';
  const isCorner = hasWallY || hasWallY2;
  // W układzie PROSTYM (1 ściana) pole `wall` jest nieaktywne/niewidoczne w UI — moduł "osierocony"
  // na ścianie Y (np. po przełączeniu z powrotem z Narożnego L) ma nadal liczyć się do ściany X, a
  // nie milcząco zniknąć z "Zajęte" tylko dlatego, że jego `wall` wciąż jest ustawione na 'Y'.
  const widthForGroupWall = (groupKey, wall) => (modules || [])
    .filter(m => m.group === groupKey && (!isCorner || normalizeModuleWall(m) === wall))
    .reduce((sum, m) => sum + (Number(m.W) || 0), 0);
  // Etap AD, krok 3 — "Zajęte" musi liczyć TĘ SAMĄ geometrię co rysunek: jeśli słup/szyb konstrukcyjny
  // zajmuje kawałek pasa podłogowego, floor.totalWidthMm (z layoutFloorBand, patrz advancePastPillars)
  // już uwzględnia przeskok za niego — bez tego ten bejdż i rysunek rozjechałyby się liczbowo.
  const widestTierFor = (wall) => {
    const wallPillars = (pillars || []).filter(p => (p.wall === 'Y' || p.wall === 'Y2' ? p.wall : 'X') === wall);
    const floor = layoutFloorBand(modules, isCorner ? wall : 'any', isCorner ? wallPillars : (pillars || []));
    const topWidth = widthForGroupWall('kitchen_top', wall);
    const mezzanineWidth = widthForGroupWall('kitchen_mezzanine', wall);
    return Math.max(floor.totalWidthMm, floor.leftTallOffsetMm + topWidth, mezzanineWidth);
  };

  const occupiedX = widestTierFor('X');
  const wallX = Number(wallXWidthMm) || 0;
  const occupiedY = hasWallY ? widestTierFor('Y') : 0;
  const wallY = hasWallY ? (Number(wallYWidthMm) || 0) : 0;
  const cornerDeductionMm = hasWallY ? Math.max(0, Number(cornerDepthMm) || 0) : 0;
  const availableY = Math.max(0, wallY - cornerDeductionMm);
  const occupiedY2 = hasWallY2 ? widestTierFor('Y2') : 0;
  const wallY2 = hasWallY2 ? (Number(wallY2WidthMm) || 0) : 0;
  const cornerDeduction2Mm = hasWallY2 ? Math.max(0, Number(cornerDepth2Mm) || 0) : 0;
  const availableY2 = Math.max(0, wallY2 - cornerDeduction2Mm);

  return {
    occupiedX,
    wallXWidthMm: wallX,
    freeX: wallX - occupiedX,
    occupiedY,
    wallYWidthMm: wallY,
    cornerDeductionMm,
    availableY,
    freeY: hasWallY ? availableY - occupiedY : 0,
    occupiedY2,
    wallY2WidthMm: wallY2,
    cornerDeduction2Mm,
    availableY2,
    freeY2: hasWallY2 ? availableY2 - occupiedY2 : 0,
  };
};

export const createCabinetModule = (type, overrides = {}) => {
  const definition = CABINET_MODULE_TYPES[type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${type}`);
  return { type, ...definition.defaults, ...overrides };
};

// --- Etap Y, krok 2 — "Wykaz formatek do rozkroju" (zgłoszenie: modal ustawień szafki ma pokazywać
// REALNY rozkrój produkcyjny — dokładne wymiary piłowania D×S, ilości i strony oklejki ABS, jak w
// karcie rozkroju z Nowego Rozkroju) — ŚWIADOMIE osobny, prostszy model od panel()/build() wyżej:
// ten liczy ZAGREGOWANE metry kromki (do WYCENY), ten tu woła o to, KTÓRA z 4 krawędzi (D1/D2/S1/S2)
// dostaje ABS (do PRODUKCJI/rozkroju) — dwa różne odbiorcy tej samej geometrii, nie refaktoryzacja
// jednego w drugi. D1/D2 = dłuższe krawędzie (wzdłuż `lengthMm`), S1/S2 = krótsze (wzdłuż `widthMm`);
// D1/S1 to zawsze strona WIDOCZNA (przednia/górna), D2/S2 — ukryta (tylna/dolna).
const CABINET_PART_MATERIAL = { body: 'Korpus W960', front: 'Front H1367', hdf: 'HDF' };

const cabinetPart = (element, group, { count, lengthMm, widthMm, edges }) => {
  const safeLength = Math.max(0, Math.round(Number(lengthMm) || 0));
  const safeWidth = Math.max(0, Math.round(Number(widthMm) || 0));
  const safeCount = Math.max(0, Number(count) || 0);
  return {
    element,
    group,
    material: CABINET_PART_MATERIAL[group],
    count: safeCount,
    lengthMm: safeLength,
    widthMm: safeWidth,
    edges: { d1: false, d2: false, s1: false, s2: false, ...edges },
    areaM2: mm2ToM2(safeLength, safeWidth) * safeCount,
  };
};

// Typowy odciąg geometrii skrzynki szuflady od wnętrza korpusu dla systemu prowadnic kulkowych
// pełnego wysuwu (np. Blum Tandembox/Merivobox) — dno/tył szuflady są węższe niż `innerW`/`D` o te
// stałe (udokumentowane, nie wyprowadzone z konkretnego katalogu prowadnic — przybliżenie "typowego"
// systemu, zgodnie z przykładem zadania: W=600/D=520 -> dno szuflady 513×474).
const DRAWER_BOX_WIDTH_DEDUCTION_MM = 51;
const DRAWER_BOX_DEPTH_DEDUCTION_MM = 46;
const DRAWER_BOX_BACK_HEIGHT_MM = 184;

export const computeCabinetParts = (cabinet, { boardThickness = 18, hdfThickness = 3 } = {}) => {
  const W = Math.max(0, Number(cabinet?.W) || 0);
  const H = Math.max(0, Number(cabinet?.H) || 0);
  const D = Math.max(0, Number(cabinet?.D) || 0);
  const t = Number(boardThickness) || 18;
  const hdfInGroove = !!cabinet?.hdfInGroove;
  const innerW = Math.max(0, W - 2 * t);
  const definition = CABINET_MODULE_TYPES[cabinet?.type];
  const hasHdfConcept = !!definition && 'hdfInGroove' in definition.defaults;

  const parts = [];
  const ALL_SIDES = { d1: true, d2: true, s1: true, s2: true };

  // Etap AB, krok 3 — zgłoszenie (zmywarka.jpg): "Zabudowa zmywarki" (dishwasher_front) to WOLNO
  // STOJĄCY sprzęt AGD z WŁASNYM korpusem — nie ma żadnych formatek korpusu mebli (Bok/Dno/Trawers/
  // Plecy HDF), TYLKO 1 front meblowy maskujący urządzenie. Ta gałąź wraca WCZEŚNIEJ, zanim
  // dołożą się jakiekolwiek formatki korpusu niżej.
  if (cabinet?.type === 'dishwasher_front') {
    parts.push(cabinetPart('Front zmywarki', 'front', { count: 1, lengthMm: W - 4, widthMm: H, edges: ALL_SIDES }));
    return parts;
  }

  const isFridgeTall = cabinet?.type === 'fridge_tall_cabinet';

  // 1. Boki — PRODUKCYJNY standard: oklejane z 3 stron (przedni pionowy torec D1 + górny/dolny
  // poziomy torec S1/S2, każdy o długości D) — jedyna strona BEZ kromki to tylna (D2), przylegająca
  // do ściany/HDF. Zgłoszenie (Screenshot_6_2.jpg): poprzednia wersja kromkowała tylko D1, co nie
  // zgadzało się z realnym rozkrojem (i z `sideEdgeMm(H,D) = H + 2*D` w panel()/build() wyżej — TA
  // SAMA 3-stronna konwencja, tylko tam liczona jako zagregowane metry, nie per-strona flagi).
  parts.push(cabinetPart('Bok', 'body', { count: 2, lengthMm: H, widthMm: D, edges: { d1: true, s1: true, s2: true } }));

  // 2. Dno (wieniec dolny) — przedni torec zawsze; tylny krawędź (S) jest o 1mm krótsza, gdy HDF
  // NIE jest wpuszczane w rowek (zostaje widoczna szczelina 1mm na grubość nakładanych plecków).
  parts.push(cabinetPart('Dno', 'body', {
    count: 1, lengthMm: innerW, widthMm: D - (hdfInGroove ? 0 : 1), edges: { d1: true },
  }));

  // Etap AB, krok 2 — zgłoszenie (холодильник.jpg): "Pod lodówkę" (fridge_tall_cabinet) nie ma
  // trawers pod blatem (nie stoi pod blatem — to słupek od podłogi po sufit) — ma za to PEŁNĄ
  // cryszę korpusu (Wieniec górny, ta sama geometria co Dno — patrz CABINET_MODULE_TYPES
  // .fridge_tall_cabinet.build, "wieniec górny (dach)"), kromkowaną TYLKO z przodu.
  if (isFridgeTall) {
    parts.push(cabinetPart('Wieniec górny', 'body', {
      count: 1, lengthMm: innerW, widthMm: D - (hdfInGroove ? 0 : 1), edges: { d1: true },
    }));
  } else {
    // 3. Trawersy (царги pod blatem) — wąskie (100mm), kromkowane TYLKO z przodu.
    parts.push(cabinetPart('Trawers', 'body', { count: 2, lengthMm: innerW, widthMm: 100, edges: { d1: true } }));
  }

  // 4. Fronty — zależnie od tego, co NAPRAWDĘ ma ten moduł (szuflady / drzwi / 2 nierówne fronty
  // Pod lodówkę / szeroki front Narożnej zaślepionej) — zawsze kromkowane z 4 stron (widoczny front).
  const externalDrawersHigh = Number(cabinet?.externalDrawersHigh) || 0;
  const externalDrawersLow = Number(cabinet?.externalDrawersLow) || 0;
  const drawerCount = externalDrawersHigh + externalDrawersLow;
  const doors = Number(cabinet?.doors) || 0;

  if (isFridgeTall) {
    // Etap V, krok 2 (patrz CABINET_MODULE_TYPES.fridge_tall_cabinet.build) — 2 NIERÓWNE fronty,
    // dolny front W JEDNEJ LINII z sąsiednimi Dolnymi (bottomHeightMm), górny = reszta wysokości.
    const bottomFrontH = Math.max(1, Math.min(H - 1, Number(cabinet?.bottomHeightMm) || H * 0.4));
    const topFrontH = Math.max(1, H - bottomFrontH);
    parts.push(cabinetPart('Front (dolny)', 'front', { count: 1, lengthMm: W, widthMm: bottomFrontH, edges: ALL_SIDES }));
    parts.push(cabinetPart('Front (górny)', 'front', { count: 1, lengthMm: W, widthMm: topFrontH, edges: ALL_SIDES }));
  } else if (drawerCount > 0) {
    // Przykład zadania (3 jednakowe szuflady, H=771): frontH = round((771 - 3*3) / 3) = 254mm;
    // frontW = 600 - 4 = 596mm. Uproszczenie: WSZYSTKIE fronty szuflad tej szafki dzielą wysokość
    // równo (ignoruje różnicę wysokie/niskie z Bloku 2 — nie podano formuły na podział nierówny).
    const frontH = Math.round((H - drawerCount * 3) / drawerCount);
    const frontW = W - 4;
    parts.push(cabinetPart('Front (szuflada)', 'front', { count: drawerCount, lengthMm: frontW, widthMm: frontH, edges: ALL_SIDES }));

    // 5. Elementy szuflad (korpus szuflady z płyty/Merivobox) — 1 dno + 1 tył PER szuflada.
    const drawerBottomLengthMm = innerW - DRAWER_BOX_WIDTH_DEDUCTION_MM;
    const drawerBottomWidthMm = D - DRAWER_BOX_DEPTH_DEDUCTION_MM;
    parts.push(cabinetPart('Dno szuflady', 'body', {
      count: drawerCount, lengthMm: drawerBottomLengthMm, widthMm: drawerBottomWidthMm, edges: {},
    }));
    parts.push(cabinetPart('Tył szuflady', 'body', {
      count: drawerCount, lengthMm: drawerBottomLengthMm, widthMm: DRAWER_BOX_BACK_HEIGHT_MM, edges: { d1: true },
    }));
  } else if (doors > 0) {
    parts.push(cabinetPart('Front (drzwi)', 'front', { count: doors, lengthMm: W / doors, widthMm: H, edges: ALL_SIDES }));
  } else if (Number(cabinet?.frontWidth) > 0) {
    parts.push(cabinetPart('Front', 'front', { count: 1, lengthMm: Number(cabinet.frontWidth), widthMm: H, edges: ALL_SIDES }));
  }

  // 6. Plecy HDF — tylko dla typów, które w ogóle MAJĄ koncepcję pleców (patrz `hasHdf` w
  // moduleFieldsFor, CabinetCalculator.jsx — ten sam warunek: pole `hdfInGroove` w defaults typu).
  // "Nakładane" (hdfInGroove: false) -> pełne W×H z 2mm zapasem na stronę (4mm łącznie), żeby
  // płyta nie wystawała przy niewielkim rozjechaniu; "wpuszczane" -> mniejsze niż otwór korpusu,
  // wchodzi w rowek 8mm z każdej strony (ta sama geometria co hdfPanelDims() wyżej).
  if (hasHdfConcept) {
    const hdfLengthMm = hdfInGroove ? (H - 2 * t + 16) : (H - 4);
    const hdfWidthMm = hdfInGroove ? (W - 2 * t + 16) : (W - 4);
    parts.push(cabinetPart('Plecy HDF', 'hdf', { count: 1, lengthMm: hdfLengthMm, widthMm: hdfWidthMm, edges: {} }));
  }

  // `hdfThickness` nie zmienia geometrii formatek (grubość HDF nie wpływa na rozmiar rowka, tylko
  // na jego głębokość frezowania) — przyjmowany dla kompletności API/przyszłych rozszerzeń (np.
  // waga/powierzchnia wg grubości), zgodnie z sygnaturą zadania.
  void hdfThickness;

  return parts;
};

// --- 1.3. Расчёт одного модуля (панели -> площади/кромка/распил/фурнитура) --------------------

// Etap AD, krok 1 — zgłoszenie (fronty.jpg): "Opuszczany front" (+20mm, patrz frontHeightBonusMm)
// ma sens WYŁĄCZNIE dla Szafek górnych kuchni (kitchen_top) — kuchenne dolne/słupki/antresole
// (nawet ze starym, zapisanym wcześniej `module.openingMethod: 'opuszczany_front'`) spadają na
// 'uchwyt'. Celowo NIE dotyka Szafy/Łazienki/RTV — poza zakresem tego zgłoszenia.
const KITCHEN_NON_TOP_GROUPS = new Set(['kitchen_bottom', 'kitchen_tall', 'kitchen_mezzanine']);

export const computeModule = (module, options = {}) => {
  const definition = CABINET_MODULE_TYPES[module?.type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${module?.type}`);
  const normalized = normalizeOpeningMethod(normalizeDrawerFields(module));
  const dims = {
    ...definition.defaults,
    ...normalized,
    t: DEFAULT_BOARD_THICKNESS_MM,
    externalDrawerSystem: options.externalDrawerSystem || 'wood',
    internalDrawerSystem: options.internalDrawerSystem || 'wood',
  };
  if (dims.openingMethod === 'opuszczany_front' && KITCHEN_NON_TOP_GROUPS.has(module?.group)) {
    dims.openingMethod = 'uchwyt';
  }
  const built = definition.build(dims);
  const panels = built.panels || [];

  const areaByGroup = { body: 0, front: 0, hdf: 0 };
  const edgeByGroup = { body: 0, front: 0 };
  let cuttingMm = 0;
  panels.forEach((p) => {
    areaByGroup[p.group] += mm2ToM2(p.widthMm, p.heightMm);
    if (p.group === 'body' || p.group === 'front') edgeByGroup[p.group] += p.edgeMm;
    cuttingMm += p.widthMm + p.heightMm;
  });

  // Etap H, krok 3 — liczba "frontów" do wyceny uchwytu/TIP-ON/profilu HAFELE: zwykle to wprost
  // liczba drzwi, ale typy bez pola "doors" (np. dishwasher_front, corner_blind_cabinet — stały,
  // niekonfigurowalny 1 front) zwracają z build() jawne `frontCount`, które ma pierwszeństwo.
  const doorsCount = built.frontCount !== undefined
    ? Number(built.frontCount) || 0
    : ('doors' in dims ? Number(dims.doors) || 0 : 0);
  const openingMethod = doorsCount > 0 ? (dims.openingMethod || 'uchwyt') : null;

  // Etap F, krok 3 / Etap G, krok 2 — na produkcji połowa zawiasów szafki dostaje spowalniacz
  // (BLUMOTION), połowa zwykłą sprężynę (przy nieparzystej liczbie — Math.ceil ze spowalniaczem,
  // Math.floor ze sprężyną). Sposób otwierania "TIP-ON" wyklucza spowalniacz na tej szafce
  // (mechanizm TIP-ON i BLUMOTION się wykluczają) — WTEDY 100% zawiasów liczy się jako
  // "ze sprężyną / zwykłe". Pozostałe 3 sposoby otwierania (uchwyt / opuszczany front / profil
  // HAFELE) zawsze dzielą zawiasy 50/50 — różnią się tylko dodatkowym osprzętem poniżej.
  const hingesTotal = built.hinges || 0;
  const tipOnActive = openingMethod === 'tip_on';

  return {
    bodyAreaM2: areaByGroup.body + (built.extraBodyAreaM2 || 0),
    frontAreaM2: areaByGroup.front,
    hdfAreaM2: areaByGroup.hdf + (built.extraHdfAreaM2 || 0),
    bodyEdgeMeters: mmToM(edgeByGroup.body) * EDGE_WASTE_FACTOR,
    frontEdgeMeters: mmToM(edgeByGroup.front) * EDGE_WASTE_FACTOR,
    cuttingMeters: mmToM(cuttingMm),
    hinges: hingesTotal,
    softCloseHinges: tipOnActive ? 0 : Math.ceil(hingesTotal / 2),
    springHinges: tipOnActive ? hingesTotal : Math.floor(hingesTotal / 2),
    externalDrawerSets: built.externalDrawerSets || 0,
    internalDrawerSets: built.internalDrawerSets || 0,
    // Etap F, krok 4 — szuflady różnej wysokości w jednej szafce (np. 2 wysokie E + 1 niska M):
    // rozbicie potrzebne, żeby summarizeCabinetModules mógł wycenić każdą grupę swoim materiałem.
    externalDrawerSetsHigh: built.externalDrawerSetsHigh || 0,
    externalDrawerSetsLow: built.externalDrawerSetsLow || 0,
    internalDrawerSetsHigh: built.internalDrawerSetsHigh || 0,
    internalDrawerSetsLow: built.internalDrawerSetsLow || 0,
    frontLegs: built.frontLegs || 0,
    rearAxiloLegs: built.rearAxiloLegs || 0,
    hangers: built.hangers || 0,
    countertopMeters: built.countertopMeters || 0,
    tipOnUnits: tipOnActive ? doorsCount : 0,
    // Etap G, krok 2 — dodatkowy osprzęt zależny od sposobu otwierania drzwi: uchwyt (1 szt. na
    // drzwi) i profil HAFELE (metry bieżące na szerokość szafki, razy qty liczone wyżej w summary).
    handleUnits: openingMethod === 'uchwyt' ? doorsCount : 0,
    hafeleProfileMeters: openingMethod === 'profil_hafele' ? mmToM(Number(dims.W) || 0) : 0,
  };
};

const sumKey = (totals, perUnit, qty, key) => (totals[key] += perUnit[key] * qty);

const DIRECT_SUM_KEYS = [
  'hdfAreaM2', 'cuttingMeters', 'frontLegs', 'rearAxiloLegs', 'hangers',
  'countertopMeters', 'externalDrawerSets', 'internalDrawerSets', 'tipOnUnits',
  'softCloseHinges', 'springHinges', 'handleUnits', 'hafeleProfileMeters',
];

// Суммирует список модулей проекта в сводку Szybkiej wyceny. options:
// { externalDrawerSystem, internalDrawerSystem — globalny system (patrz detectDrawerSystem),
//   usableSheetAreaM2, hdfUsableSheetAreaM2 }. Etap H/I — dawne globalne ustawienia
// (bodyFromFrontBoard/separateTopFrontBoard/edgeBodyFromFrontColor) usunięte: moduł decyduje o
// bodyFromFront/edgeFromFront (wstrzykiwane przez UI z konfiguracji GRUPY, do której należy —
// patrz CabinetCalculator.jsx, resolveBoardGroupKey/effectiveBoardId), bez globalnego fallbacku.
export const summarizeCabinetModules = (modules = [], options = {}) => {
  const usableSheetAreaM2 = Number(options.usableSheetAreaM2) || USABLE_SHEET_AREA_M2;
  const hdfUsableSheetAreaM2 = Number(options.hdfUsableSheetAreaM2) || HDF_USABLE_SHEET_AREA_M2;

  const totals = {
    hdfAreaM2: 0,
    cuttingMeters: 0,
    frontLegs: 0,
    rearAxiloLegs: 0,
    hangers: 0,
    tipOnUnits: 0,
    countertopMeters: 0,
    externalDrawerSets: 0,
    internalDrawerSets: 0,
    softCloseHinges: 0,
    springHinges: 0,
    handleUnits: 0,
    hafeleProfileMeters: 0,
  };
  const boardAreaByBucket = {};
  const edgeMetersByBucket = {};
  // Zachowujemy stałe klucze Etapu B (wszystkie typy = 0, gdy nieużyte) — nadpisania per-moduł
  // (drawerRunnerExternalId) dokładają do tej samej mapy dynamiczne klucze "id:<materialId>".
  const externalDrawersByType = Object.fromEntries(EXTERNAL_DRAWER_TYPES.map(type => [type, 0]));
  const internalDrawersByType = Object.fromEntries(INTERNAL_DRAWER_TYPES.map(type => [type, 0]));

  (modules || []).forEach((module) => {
    const qty = Math.max(0, Number(module?.qty) || 0);
    if (qty === 0) return;

    const perUnit = computeModule(module, {
      externalDrawerSystem: drawerTypeToSystem(module?.drawerType) || options.externalDrawerSystem || 'wood',
      internalDrawerSystem: drawerTypeToSystem(module?.internalDrawerType) || options.internalDrawerSystem || 'wood',
    });

    DIRECT_SUM_KEYS.forEach(key => sumKey(totals, perUnit, qty, key));

    // Etap F, krok 4 — bez nadpisania (ani per-moduł materiału, ani wymuszonego typu enum), szuflady
    // dzielą się domyślnie na wysokie (MERIVOBOX E) i niskie (MERIVOBOX M) wg DWÓCH liczników
    // modułu (externalDrawersHigh/Low), nie wg jednego wspólnego typu dla całej szafki. Nadpisanie
    // (drawerRunnerExternalId per moduł ALBO wymuszony chip drawerType) nadal łączy WSZYSTKIE
    // szuflady modułu (wysokie+niskie razem) w JEDEN bucket — to świadomy wybór "cała ta szafka
    // dostaje inny, konkretny model", nie da się go rozbić z powrotem na wysokie/niskie.
    if (module?.drawerRunnerExternalId) {
      addToBucket(externalDrawersByType, `id:${bucketKeyFor(module.drawerRunnerExternalId)}`, perUnit.externalDrawerSets * qty);
    } else if (EXTERNAL_DRAWER_TYPES.includes(module?.drawerType) && module.drawerType !== 'inherit') {
      addToBucket(externalDrawersByType, module.drawerType, perUnit.externalDrawerSets * qty);
    } else {
      addToBucket(externalDrawersByType, 'merivobox_e', perUnit.externalDrawerSetsHigh * qty);
      addToBucket(externalDrawersByType, 'merivobox_m', perUnit.externalDrawerSetsLow * qty);
    }
    if (INTERNAL_DRAWER_TYPES.includes(module?.internalDrawerType) && module.internalDrawerType !== 'inherit') {
      addToBucket(internalDrawersByType, module.internalDrawerType, perUnit.internalDrawerSets * qty);
    } else {
      addToBucket(internalDrawersByType, 'merivobox_e', perUnit.internalDrawerSetsHigh * qty);
      addToBucket(internalDrawersByType, 'merivobox_m', perUnit.internalDrawerSetsLow * qty);
    }

    const bodyFromFront = Boolean(module?.bodyFromFront);
    const edgeFromFront = Boolean(module?.edgeFromFront);
    const frontBoardBucket = `front:${bucketKeyFor(module?.frontMaterialId)}`;
    const frontEdgeBucket = `front:${bucketKeyFor(module?.edgeMaterialFrontId)}`;

    // Płyta korpusu: domyślnie z Płyty korpusu (per-moduł/per-grupa bodyMaterialId); checkbox
    // grupy ["Korpus = Front"] przekierowuje CAŁY korpus na Płytę frontu — wtedy liczy się jako
    // front (razem z frontMaterialId tej samej grupy, nie bodyMaterialId).
    if (bodyFromFront) {
      addToBucket(boardAreaByBucket, frontBoardBucket, perUnit.bodyAreaM2 * qty);
    } else {
      addToBucket(boardAreaByBucket, `body:${bucketKeyFor(module?.bodyMaterialId)}`, perUnit.bodyAreaM2 * qty);
    }

    // Front: "główna" płyta frontu tej grupy (frontMaterialId). Etap I — dawna osobna pula
    // "Płyta frontu (drugi kolor)" (checkbox per moduł) jest zbędna: każda grupa ma teraz WŁASNY
    // wybór materiału, więc różne kolory frontu wynikają po prostu z przynależności do różnych grup.
    addToBucket(boardAreaByBucket, frontBoardBucket, perUnit.frontAreaM2 * qty);

    // Obrzeże korpusu: domyślnie białe (per-moduł/per-grupa edgeMaterialBodyId); checkbox grupy
    // ["Obrzeże = Front"] przerzuca metraż do kromki pod kolor frontu (liczy się razem z
    // edgeMaterialFrontId tej samej grupy).
    if (edgeFromFront) {
      addToBucket(edgeMetersByBucket, frontEdgeBucket, perUnit.bodyEdgeMeters * qty);
    } else {
      addToBucket(edgeMetersByBucket, `body:${bucketKeyFor(module?.edgeMaterialBodyId)}`, perUnit.bodyEdgeMeters * qty);
    }
    // Obrzeże frontu: idzie do tej samej puli co front panel tej grupy.
    addToBucket(edgeMetersByBucket, frontEdgeBucket, perUnit.frontEdgeMeters * qty);
  });

  const bodyAreaM2 = sumBucketsWithPrefix(boardAreaByBucket, 'body');
  const frontAreaM2 = sumBucketsWithPrefix(boardAreaByBucket, 'front');
  const bodyEdgeMeters = sumBucketsWithPrefix(edgeMetersByBucket, 'body');
  const frontEdgeMeters = sumBucketsWithPrefix(edgeMetersByBucket, 'front');
  const hinges = totals.softCloseHinges + totals.springHinges;
  const edgeMeters = bodyEdgeMeters + frontEdgeMeters;

  // Листы считаются НА КАЖДЫЙ бакет (материал) отдельно и суммируются — 5 шкафчиков на одной
  // плите + 1 на другой это 2 округления, не 1 общее (patrz komentarz funkcji wyżej).
  const sheetsFor = (buckets, prefix, usable) => Object.entries(buckets)
    .filter(([key]) => key.startsWith(`${prefix}:`))
    .reduce((sum, [, area]) => sum + (Math.ceil(area / usable) || 0), 0);

  return {
    ...totals,
    bodyAreaM2,
    frontAreaM2,
    bodyEdgeMeters,
    frontEdgeMeters,
    hinges,
    edgeMeters,
    boardAreaByBucket,
    edgeMetersByBucket,
    // softCloseHinges/springHinges już są w ...totals (DIRECT_SUM_KEYS) — `hinges` wyżej to ich
    // suma, do szybkich sprawdzeń typu `summary.hinges > 0`.
    externalDrawersByType,
    internalDrawersByType,
    bodySheets: sheetsFor(boardAreaByBucket, 'body', usableSheetAreaM2),
    frontSheets: sheetsFor(boardAreaByBucket, 'front', usableSheetAreaM2),
    hdfSheets: Math.ceil(totals.hdfAreaM2 / hdfUsableSheetAreaM2) || 0,
  };
};

// Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu do rozliczenia: te 2 funkcje tylko NAZYWAJĄ i
// udostępniają wprost (łatwe do jednostkowego przetestowania) sumy, które summarizeCabinetModules
// już liczy per moduł (frontLegs/rearAxiloLegs z legsForWidth w build() każdego typu; external/
// internalDrawerSets z liczników Wysokie/Niskie) — bez duplikowania samej logiki liczenia.
export const computeLegsCount = (modules, options = {}) => {
  const summary = summarizeCabinetModules(modules, options);
  return summary.frontLegs + summary.rearAxiloLegs;
};
export const computeDrawersCount = (modules, options = {}) => {
  const summary = summarizeCabinetModules(modules, options);
  return summary.externalDrawerSets + summary.internalDrawerSets;
};

// --- Стоимость материалов/услуг и итоговая Wycena ----------------------------------------------

export const resolveCountertopQuantity = (countertopMeters, unit) => {
  const meters = Number(countertopMeters) || 0;
  if (meters <= 0) return 0;
  const normalizedUnit = String(unit || '').trim().toLocaleLowerCase('pl');
  if (normalizedUnit === 'szt' || normalizedUnit === 'szt.' || normalizedUnit === 'sztuki') {
    return Math.ceil(meters / COUNTERTOP_SHEET_LENGTH_M);
  }
  return Math.round(meters * 100) / 100;
};

export const calculateCabinetWycena = calculateProjectWycena;

// --- Postatejna расшифровка (modal «Szczegóły wyceny») -----------------------------------------

// selections — выбранные глобальные позиции каталога для фурнитуры/услуг (плиты/кромка теперь
// per-grupa, patrz CabinetCalculator.jsx):
// { bodyMaterial, frontMaterial, edgeMaterialBody, edgeMaterialFront, hinge,
//   externalDrawerByType: {inherit,merivobox_e,merivobox_m,tandem},
//   internalDrawerByType: {inherit,merivobox_e,merivobox_m}, legFront, legRearAxilo, hdfMaterial,
//   hangerMaterial, tipOnMaterial, countertop, cuttingService, edgingService,
//   materialsById: Map<String(id), material> } — do rozwiązania nadpisań per szafka (bucket !=
//   'default'/nie zaczynający się od typu szuflady).
const EXTERNAL_DRAWER_LABELS = {
  inherit: 'Szuflada zewn.',
  merivobox_e: 'Szuflada zewn. (MERIVOBOX E)',
  merivobox_m: 'Szuflada zewn. (MERIVOBOX M)',
  tandem: 'Szuflada zewn. (TANDEM)',
};
const INTERNAL_DRAWER_LABELS = {
  inherit: 'Szuflada wewn.',
  merivobox_e: 'Szuflada wewn. (MERIVOBOX E)',
  merivobox_m: 'Szuflada wewn. (MERIVOBOX M)',
};

const resolveBucketItem = (materialKey, defaultItem, materialsById) => (
  materialKey === DEFAULT_BUCKET ? (defaultItem || null) : (materialsById?.get(materialKey) || null)
);

// Dla bucketa 'default' (brak nadpisania per-moduł) zachowujemy stałe nazwy kluczy z Etapu B
// (np. "bodySheet", "edgeBody") — żeby nie łamać istniejących konsumentów/testów w typowym
// przypadku "jeden globalny wybór materiału". Realne nadpisanie per-moduł dostaje własny,
// dynamiczny klucz "<baseKey>_<materialId>".
const bucketRowKey = (baseKey, materialKey) => (materialKey === DEFAULT_BUCKET ? baseKey : `${baseKey}_${materialKey}`);

const boardRowsFor = (buckets, prefix, { label, baseKey, defaultItem, materialsById, usableSheetAreaM2 }) => (
  Object.entries(buckets)
    .filter(([key]) => key.startsWith(`${prefix}:`))
    .map(([key, area]) => {
      const materialKey = key.slice(prefix.length + 1);
      const item = resolveBucketItem(materialKey, defaultItem, materialsById);
      const sheets = Math.ceil(area / usableSheetAreaM2) || 0;
      return {
        key: bucketRowKey(baseKey, materialKey), label, item,
        quantity: sheets, quantityLabel: `${sheets} ark. (${area.toFixed(2)} m²)`,
        unitPrice: Number(item?.price) || 0,
      };
    })
);

const edgeRowsFor = (buckets, prefix, { label, baseKey, defaultItem, materialsById }) => (
  Object.entries(buckets)
    .filter(([key]) => key.startsWith(`${prefix}:`))
    .map(([key, meters]) => {
      const materialKey = key.slice(prefix.length + 1);
      const item = resolveBucketItem(materialKey, defaultItem, materialsById);
      const roundedMeters = Math.round(meters * 100) / 100;
      return {
        key: bucketRowKey(baseKey, materialKey), label, item,
        quantity: roundedMeters, quantityLabel: `${roundedMeters.toFixed(2)} mb`,
        unitPrice: Number(item?.price) || 0,
      };
    })
);

// Etap N, krok 4 — `includeHardware: false` (domyślnie TRUE — stara, pełna wycena) chowa WSZYSTKIE
// pozycje osprzętu (zawiasy/szuflady-prowadnice/nogi/zawieszki/uchwyty/TIP-ON/profil HAFELE) z
// rozliczenia, zostawiając TYLKO płyty/kromkę/HDF/blat + usługi rozpiłu/oklejania — zgodnie z
// "tymczasowym" uproszczeniem kalkulatora do samych formatek. To jedna flaga, nie usunięcie kodu:
// `summarizeCabinetModules` nadal liczy WSZYSTKO (osprzęt też), więc przywrócenie pełnej wyceny to
// zmiana jednego booleana w CabinetCalculator.jsx, nie odkopywanie usuniętej logiki.
export const buildCabinetCostBreakdown = (summary, selections = {}, multiplier, options = {}) => {
  const price = (value) => Number(value) || 0;
  const safeMultiplier = Number(multiplier) > 0 ? Number(multiplier) : 2;
  const usableSheetAreaM2 = Number(options.usableSheetAreaM2) || USABLE_SHEET_AREA_M2;
  const includeHardware = options.includeHardware !== false;
  // Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu do rozliczenia: nóżki i komplety szuflad
  // (prowadnice) wracają NIEZALEŻNIE od reszty osprzętu (zawiasy/zawieszki/uchwyty/TIP-ON/profil
  // HAFELE, dalej schowane za `includeHardware: false`) — osobne flagi, domyślnie wyłączone jak
  // `includeHardware`, żeby wołający musiał świadomie włączyć KAŻDĄ grupę z osobna.
  const includeLegs = options.includeLegs !== false;
  const includeDrawerSets = options.includeDrawerSets !== false;
  const countertopUnit = selections.countertop?.unit;
  const countertopQuantity = resolveCountertopQuantity(summary.countertopMeters, countertopUnit);
  const countertopIsSheets = countertopQuantity > 0 && ['szt', 'szt.', 'sztuki']
    .includes(String(countertopUnit || '').trim().toLocaleLowerCase('pl'));
  const edgeMeters = Math.round(summary.edgeMeters * 100) / 100;
  const cuttingMeters = Math.round(summary.cuttingMeters * 100) / 100;
  const materialsById = selections.materialsById;

  const externalDrawerRows = Object.entries(summary.externalDrawersByType || {}).map(([key, quantity]) => {
    const isIdOverride = key.startsWith('id:');
    const item = isIdOverride
      ? resolveBucketItem(key.slice(3), null, materialsById)
      : (selections.externalDrawerByType?.[key] || null);
    const label = isIdOverride ? 'Szuflada zewn.' : (EXTERNAL_DRAWER_LABELS[key] || 'Szuflada zewn.');
    return {
      key: `drawerExt_${key}`, label, item,
      quantity, quantityLabel: `${quantity} kpl.`, unitPrice: price(item?.price),
    };
  });
  const internalDrawerRows = Object.entries(summary.internalDrawersByType || {}).map(([key, quantity]) => ({
    key: `drawerInt_${key}`, label: INTERNAL_DRAWER_LABELS[key] || 'Szuflada wewn.',
    item: selections.internalDrawerByType?.[key] || null,
    quantity, quantityLabel: `${quantity} kpl.`, unitPrice: price(selections.internalDrawerByType?.[key]?.price),
  }));

  const materialRows = [
    ...boardRowsFor(summary.boardAreaByBucket || {}, 'body', {
      label: 'Płyta korpusu', baseKey: 'bodySheet', defaultItem: selections.bodyMaterial, materialsById, usableSheetAreaM2,
    }),
    ...boardRowsFor(summary.boardAreaByBucket || {}, 'front', {
      label: 'Płyta frontu', baseKey: 'frontSheet', defaultItem: selections.frontMaterial, materialsById, usableSheetAreaM2,
    }),
    ...edgeRowsFor(summary.edgeMetersByBucket || {}, 'body', {
      label: 'Obrzeże korpusu', baseKey: 'edgeBody', defaultItem: selections.edgeMaterialBody, materialsById,
    }),
    ...edgeRowsFor(summary.edgeMetersByBucket || {}, 'front', {
      label: 'Obrzeże frontu', baseKey: 'edgeFront', defaultItem: selections.edgeMaterialFront, materialsById,
    }),
    ...(includeHardware ? [
      {
        key: 'hingeSoftClose', label: 'Zawiasy (cichy domyk)', item: selections.hingeSoftClose || null,
        quantity: summary.softCloseHinges, quantityLabel: `${summary.softCloseHinges} szt.`,
        unitPrice: price(selections.hingeSoftClose?.price),
      },
      {
        key: 'hingeSpring', label: 'Zawiasy (ze sprężyną / do TIP-ON)', item: selections.hingeSpring || null,
        quantity: summary.springHinges, quantityLabel: `${summary.springHinges} szt.`,
        unitPrice: price(selections.hingeSpring?.price),
      },
    ] : []),
    // Etap AA, krok 4 — "Komplet szuflad (prowadnice + boki)": per typ (wysokie/niskie, zewn./wewn.)
    // — każdy typ to inny katalogowy komplet (inna cena), więc zostaje osobną pozycją w rozliczeniu,
    // nie jedną zlepioną sumą (ta sama granulacja co reszta tabeli — płyta korpusu/frontu też nie
    // jest jedną pozycją, tylko po jednej per wybrany materiał).
    ...(includeDrawerSets ? [...externalDrawerRows, ...internalDrawerRows] : []),
    {
      key: 'countertop', label: 'Blat', item: selections.countertop || null,
      quantity: countertopQuantity,
      quantityLabel: countertopIsSheets
        ? `${countertopQuantity} szt.`
        : `${summary.countertopMeters.toFixed(2)} mb`,
      unitPrice: price(selections.countertop?.price),
    },
    {
      key: 'hdf', label: 'HDF', item: selections.hdfMaterial || null,
      quantity: summary.hdfSheets,
      quantityLabel: `${summary.hdfSheets} ark. (${summary.hdfAreaM2.toFixed(2)} m²)`,
      unitPrice: price(selections.hdfMaterial?.price),
    },
    // Etap AA, krok 4 — "Nóżki meblowe": przednie (zwykłe) i tylne (Axilo) to w realnym katalogu
    // RÓŻNE, osobno wycenione pozycje (zwykłe nogi są tańsze niż regulowane Axilo) — zostają 2
    // osobnymi wierszami, nie 1 zlepioną sumą "Nóżki meblowe H=100mm" bez rozróżnienia ceny.
    ...(includeLegs ? [
      {
        key: 'legFront', label: 'Nogi przednie (zwykłe)', item: selections.legFront || null,
        quantity: summary.frontLegs, quantityLabel: `${summary.frontLegs} szt.`,
        unitPrice: price(selections.legFront?.price),
      },
      {
        key: 'legRearAxilo', label: 'Nogi tylne (Axilo)', item: selections.legRearAxilo || null,
        quantity: summary.rearAxiloLegs, quantityLabel: `${summary.rearAxiloLegs} szt.`,
        unitPrice: price(selections.legRearAxilo?.price),
      },
    ] : []),
    ...(includeHardware ? [
      {
        key: 'hanger', label: 'Zawieszki', item: selections.hangerMaterial || null,
        quantity: summary.hangers, quantityLabel: `${summary.hangers} szt.`,
        unitPrice: price(selections.hangerMaterial?.price),
      },
      {
        key: 'handle', label: 'Uchwyty', item: selections.handleMaterial || null,
        quantity: summary.handleUnits, quantityLabel: `${summary.handleUnits} szt.`,
        unitPrice: price(selections.handleMaterial?.price),
      },
      {
        key: 'tipOn', label: 'TIP-ON', item: selections.tipOnMaterial || null,
        quantity: summary.tipOnUnits, quantityLabel: `${summary.tipOnUnits} szt.`,
        unitPrice: price(selections.tipOnMaterial?.price),
      },
      {
        key: 'hafeleProfile', label: 'Profil HAFELE', item: selections.hafeleProfileMaterial || null,
        quantity: summary.hafeleProfileMeters,
        quantityLabel: `${summary.hafeleProfileMeters.toFixed(2)} mb`,
        unitPrice: price(selections.hafeleProfileMaterial?.price),
      },
    ] : []),
  ]
    .map(row => ({ ...row, value: row.quantity * row.unitPrice }))
    // Etap B, krok 1.4: w rozliczeniu widać tylko pozycje realnie użyte w projekcie.
    .filter(row => row.quantity > 0);

  const serviceRows = [
    {
      key: 'cutting', label: 'Cięcie płyty', item: selections.cuttingService || null,
      quantity: cuttingMeters, unitPrice: price(selections.cuttingService?.price),
    },
    {
      key: 'edging', label: 'Oklejanie PCV', item: selections.edgingService || null,
      quantity: edgeMeters, unitPrice: price(selections.edgingService?.price),
    },
  ]
    .map(row => ({ ...row, value: row.quantity * row.unitPrice }))
    .filter(row => row.quantity > 0);

  const materialsTotal = materialRows.reduce((sum, row) => sum + row.value, 0);
  const servicesTotal = serviceRows.reduce((sum, row) => sum + row.value, 0);
  const materialsScaled = materialsTotal * safeMultiplier;

  return {
    materialRows: materialRows.map(row => ({ ...row, scaledValue: row.value * safeMultiplier })),
    serviceRows,
    materialsTotal,
    materialsScaled,
    servicesTotal,
    multiplier: safeMultiplier,
    wycena: calculateCabinetWycena({ materialsTotal, servicesTotal, multiplier: safeMultiplier }),
  };
};
