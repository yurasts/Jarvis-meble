// Параметрический калькулятор шкафчиков (Kalkulator szafek / Szybka wycena) — Этап А.
// Чистое математическое ядро: детерминированный геометрический пересчёт габаритов модулей
// (W × H × D, мм) в площади форматок, погонные метры кромки/распила и количество фурнитуры.
// Без побочных эффектов и без обращений к Supabase/каталогу — калькулятор получает уже
// выбранные цены материалов/услуг снаружи (ProjectModal.jsx / CabinetCalculator.jsx).
// Архитектура и роудмап — docs/decisions/ADR-010-parametric-cabinet-calculator.md.

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

// Ножки: по умолчанию 4 шт, широкие тумбы (W > 900 мм) получают 6 — нужна дополнительная опора
// по центру. Переиспользуется base_doors/base_drawers/wardrobe_section.
const legsForWidth = (widthMm) => (Number(widthMm) > 900 ? 6 : 4);

const mm2ToM2 = (widthMm, heightMm) => (Number(widthMm) * Number(heightMm)) / 1_000_000;
const mmToM = (mm) => Number(mm) / 1000;

// Форматка для внутреннего реестра панелей модуля: width/height — геометрия листа (мм),
// edgeMm — длина кромки ABS, которую реально нужно наклеить на эту форматку (мм, до +10%
// запаса). Кромкуем только лицевые (видимые) торцы, а не весь периметр — так: у боковины это её
// высота (передний вертикальный торец), у горизонталей/полок — ширина в свету (W - 2t), у
// фасадов — весь перимет=0 панели (все 4 торца на виду). Длина распила (cuttingMeters) — принятая
// в раскрое упрощённая оценка «полупериметра» (W + H) на форматку: именно столько прямых резов
// нужно, чтобы выпилить прямоугольник из листа.
const panel = (group, widthMm, heightMm, edgeMm = 0) => ({
  group, // 'body' | 'front' | 'hdf'
  widthMm: Number(widthMm),
  heightMm: Number(heightMm),
  edgeMm: Number(edgeMm),
});

// Короб ящика считается упрощённо как площадь (не отдельные форматки) — задание прямо даёт
// константы на ящик, а не геометрию каждой стенки короба. Кромка/распил для коробов в Этапе А не
// считаются (внутренние, ненагруженные детали — попадут в калибровку Этапа Б).
//
// Две системы ящиков дают разную геометрию короба:
// - "wood" (classic TANDEM — обычные направляющие под самодельный деревянный ящик): 2 боковины
//   из корпусной плиты + дно из HDF (старые константы Этапа А, без изменений).
// - "metal" (MERIVOBOX/TANDEMBOX/LEGRABOX — готовый металлический бокс): боковины уже готовые
//   (не из плиты проекта), из корпусной плиты кроится только дно и задняя стенка; дно у этих
//   систем из плиты 16–18мм, а не из HDF — поэтому 0 м² HDF.
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
// TANDEMBOX/LEGRABOX) — zwykłe prowadnice TANDEM (bez "BOX") to wciąż "wood" (drewniany korpus
// szuflady budowany z płyty, prowadnica to tylko mechanizm jazdy).
export const detectDrawerSystem = (materialName) => {
  const name = String(materialName || '').toLocaleUpperCase('pl');
  if (name.includes('MERIVOBOX') || name.includes('TANDEMBOX') || name.includes('LEGRABOX')) return 'metal';
  return 'wood';
};

// Starszy zapis modułu ({ drawers }) sprzed rozdzielenia na zewnętrzne/wewnętrzne — zachowanie
// wstecznie zgodne: drawers -> externalDrawers, internalDrawers = 0.
const normalizeDrawerFields = (module) => {
  if (!module || module.drawers === undefined) return module;
  if (module.externalDrawers !== undefined || module.internalDrawers !== undefined) return module;
  const { drawers, ...rest } = module;
  return { ...rest, externalDrawers: drawers, internalDrawers: 0 };
};

// --- 1.2. Шесть базовых типов модулей ---------------------------------------------------------
// Каждый тип: defaults (стартовые размеры/счётчики) + build(dims) -> { panels, extraBodyAreaM2,
// extraHdfAreaM2, hinges, externalDrawerSets, internalDrawerSets, legs, hangers, countertopMeters }
// для ОДНОЙ единицы модуля (qty учитывается снаружи, в summarizeCabinetModules).

export const CABINET_MODULE_TYPES = {
  base_doors: {
    id: 'base_doors',
    label: 'Szafka dolna z drzwiami',
    icon: '🚪',
    defaults: { W: 600, H: 820, D: 520, doors: 1, shelves: 1, qty: 1 },
    build: ({ W, H, D, doors = 1, shelves = 0, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        panel('body', innerW, D, innerW),
        panel('body', innerW, D, innerW),
        ...Array.from({ length: shelves }, () => panel('body', innerW, D - 20, innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, H, 2 * (doorWidth + H))),
        panel('hdf', W, H, 0),
      ];
      return {
        panels,
        hinges: doors * getHingesPerDoor(H),
        legs: legsForWidth(W),
      };
    },
  },

  base_drawers: {
    id: 'base_drawers',
    label: 'Szafka dolna z szufladami',
    icon: '🗄️',
    defaults: { W: 600, H: 820, D: 520, externalDrawers: 3, internalDrawers: 0, qty: 1 },
    // Fronty daje tylko externalDrawers (dzielą W × H tumby — jak poprzednio dzieliły "drawers").
    // internalDrawers (np. MERIVOBOX M schowana za zewnętrznym frontem) NIE dodają własnego
    // frontu — stąd nie wchodzą do podziału wysokości.
    build: ({
      W, H, D, externalDrawers = 0, internalDrawers = 0, t = DEFAULT_BOARD_THICKNESS_MM,
      externalDrawerSystem = 'wood', internalDrawerSystem = 'wood',
    }) => {
      const drawerCount = Math.max(1, externalDrawers);
      const frontHeightPerDrawer = H / drawerCount;
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        panel('body', W - 2 * t, D, W - 2 * t),
        panel('body', W - 2 * t, D, W - 2 * t),
        ...Array.from({ length: drawerCount }, () => (
          panel('front', W, frontHeightPerDrawer, 2 * (W + frontHeightPerDrawer))
        )),
        panel('hdf', W, H, 0),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawers);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawers);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        externalDrawerSets: externalDrawers,
        internalDrawerSets: internalDrawers,
        legs: legsForWidth(W),
      };
    },
  },

  wall_cabinet: {
    id: 'wall_cabinet',
    label: 'Szafka górna',
    icon: '⬆️',
    defaults: { W: 600, H: 720, D: 320, doors: 1, shelves: 2, qty: 1 },
    build: ({ W, H, D, doors = 1, shelves = 0, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        panel('body', innerW, D, innerW),
        panel('body', innerW, D, innerW),
        ...Array.from({ length: shelves }, () => panel('body', innerW, D - 20, innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, H, 2 * (doorWidth + H))),
        panel('hdf', W, H, 0),
      ];
      return {
        panels,
        hinges: doors * getHingesPerDoor(H),
        // Zawieszki — 1 komplet (2 szt.) na szafkę górną, niezależnie od szerokości.
        hangers: 2,
      };
    },
  },

  tall_cabinet: {
    id: 'tall_cabinet',
    label: 'Słupek',
    icon: '📏',
    defaults: {
      W: 600, H: 2100, D: 560, doors: 2, shelves: 4, externalDrawers: 0, internalDrawers: 0, qty: 1,
    },
    // UWAGA: w słupku fasady są ułożone jedna NAD drugą (dół/środek/góra), a nie obok siebie —
    // inaczej niż w base_doors/wall_cabinet/wardrobe_section, gdzie doors dzielą SZEROKOŚĆ.
    // Dlatego wysokość pojedynczego frontu to H / doors (nie pełne H), co wprost wpływa na
    // getHingesPerDoor — bez tego np. H=2445, doors=3 liczyłby 3 fronty pełnej wysokości
    // (3 × 5 zawiasów = 15) zamiast 3 fronty ~815mm (3 × 2 = 6). Szuflady (zewn./wewn.) w słupku
    // to dodatkowy schowek za jednym z frontów — NIE wpływają na fronty/doors, tylko dodają
    // własną geometrię короба (jak w base_drawers).
    build: ({
      W, H, D, doors = 1, shelves = 0, externalDrawers = 0, internalDrawers = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', internalDrawerSystem = 'wood',
    }) => {
      const innerW = W - 2 * t;
      const doorHeight = H / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        // Дно + крышка + связующие полки — (2 + shelves) горизонталей на полную глубину D.
        ...Array.from({ length: 2 + shelves }, () => panel('body', innerW, D, innerW)),
        ...Array.from({ length: doors }, () => panel('front', W, doorHeight, 2 * (W + doorHeight))),
        panel('hdf', W, H, 0),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawers);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawers);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        hinges: doors * getHingesPerDoor(doorHeight),
        externalDrawerSets: externalDrawers,
        internalDrawerSets: internalDrawers,
        legs: 4,
      };
    },
  },

  wardrobe_section: {
    id: 'wardrobe_section',
    label: 'Szafa / Garderoba',
    icon: '🧥',
    defaults: {
      W: 900, H: 2400, D: 600, doors: 2, shelves: 5, externalDrawers: 2, internalDrawers: 0, qty: 1,
    },
    // Та же геометрия, что и tall_cabinet (секция шкафа — тот же каркас, просто другие
    // стартовые габариты) — ножки учитывают ширину, как у тумб. Szuflady (zewn./wewn.) tu też nie
    // wpływają na fronty/doors — tylko na własną geometrię короba.
    build: ({
      W, H, D, doors = 1, shelves = 0, externalDrawers = 0, internalDrawers = 0,
      t = DEFAULT_BOARD_THICKNESS_MM, externalDrawerSystem = 'wood', internalDrawerSystem = 'wood',
    }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        ...Array.from({ length: 2 + shelves }, () => panel('body', innerW, D, innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, H, 2 * (doorWidth + H))),
        panel('hdf', W, H, 0),
      ];
      const external = drawerBoxGeometry(externalDrawerSystem, W, D, externalDrawers);
      const internal = drawerBoxGeometry(internalDrawerSystem, W, D, internalDrawers);
      return {
        panels,
        extraBodyAreaM2: external.bodyAreaM2 + internal.bodyAreaM2,
        extraHdfAreaM2: external.hdfAreaM2 + internal.hdfAreaM2,
        hinges: doors * getHingesPerDoor(H),
        externalDrawerSets: externalDrawers,
        internalDrawerSets: internalDrawers,
        legs: legsForWidth(W),
      };
    },
  },

  countertop: {
    id: 'countertop',
    label: 'Blat',
    icon: '🪵',
    defaults: { W: 2400, D: 600, qty: 1 },
    // Blat NIE jest korpusem: nie ma żadnych forматок (zero m² w Korpus/Front/HDF, zero kromki
    // korpusu) — liczy się TYLKO jego własna długość. Blat kupuje się/wycenia osobno (jako
    // gotowy materiał w Bloku 1, patrz resolveCountertopQuantity niżej), nie z listu płyty
    // korpusu/fasady. (Poprzednia wersja błędnie dodawała W×D jako panel 'body' z kromką na całą
    // szerokość W — to podwajało listy korpusu i zawyżało Obrzeże ABS.)
    build: ({ W }) => ({
      panels: [],
      countertopMeters: mmToM(W),
    }),
  },
};

export const CABINET_MODULE_ORDER = [
  'base_doors', 'base_drawers', 'wall_cabinet', 'tall_cabinet', 'wardrobe_section', 'countertop',
];

export const createCabinetModule = (type, overrides = {}) => {
  const definition = CABINET_MODULE_TYPES[type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${type}`);
  return { type, ...definition.defaults, ...overrides };
};

// --- 1.3. Расчёт одного модуля (панели -> площади/кромка/распил/фурнитура) --------------------

// Площадь, кромка и длина распила — для ОДНОЙ единицы модуля (без учёта qty). options —
// глобальные для всего калькулятора ({ externalDrawerSystem, internalDrawerSystem }, см.
// detectDrawerSystem) — какой материал ящика выбран в Bloku 1, а не свойство самого модуля.
export const computeModule = (module, options = {}) => {
  const definition = CABINET_MODULE_TYPES[module?.type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${module?.type}`);
  const dims = {
    ...definition.defaults,
    ...normalizeDrawerFields(module),
    t: DEFAULT_BOARD_THICKNESS_MM,
    externalDrawerSystem: options.externalDrawerSystem || 'wood',
    internalDrawerSystem: options.internalDrawerSystem || 'wood',
  };
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

  return {
    bodyAreaM2: areaByGroup.body + (built.extraBodyAreaM2 || 0),
    frontAreaM2: areaByGroup.front,
    hdfAreaM2: areaByGroup.hdf + (built.extraHdfAreaM2 || 0),
    bodyEdgeMeters: mmToM(edgeByGroup.body) * EDGE_WASTE_FACTOR,
    frontEdgeMeters: mmToM(edgeByGroup.front) * EDGE_WASTE_FACTOR,
    cuttingMeters: mmToM(cuttingMm),
    hinges: built.hinges || 0,
    externalDrawerSets: built.externalDrawerSets || 0,
    internalDrawerSets: built.internalDrawerSets || 0,
    legs: built.legs || 0,
    hangers: built.hangers || 0,
    countertopMeters: built.countertopMeters || 0,
  };
};

const sumKey = (totals, perUnit, qty, key) => (totals[key] += perUnit[key] * qty);

// Суммирует список модулей проекта (каждый — { type, W, H, D, doors, shelves, drawers, qty })
// в сводку Szybkiej wyceny: площади/листы по группам, кромка, распил, счётчики фурнитуры.
export const summarizeCabinetModules = (modules = [], options = {}) => {
  const usableSheetAreaM2 = Number(options.usableSheetAreaM2) || USABLE_SHEET_AREA_M2;
  const hdfUsableSheetAreaM2 = Number(options.hdfUsableSheetAreaM2) || HDF_USABLE_SHEET_AREA_M2;

  const totals = {
    bodyAreaM2: 0,
    frontAreaM2: 0,
    hdfAreaM2: 0,
    bodyEdgeMeters: 0,
    frontEdgeMeters: 0,
    cuttingMeters: 0,
    hinges: 0,
    externalDrawerSets: 0,
    internalDrawerSets: 0,
    legs: 0,
    hangers: 0,
    countertopMeters: 0,
  };

  (modules || []).forEach((module) => {
    const qty = Math.max(0, Number(module?.qty) || 0);
    if (qty === 0) return;
    const perUnit = computeModule(module, options);
    Object.keys(totals).forEach(key => sumKey(totals, perUnit, qty, key));
  });

  const edgeMeters = totals.bodyEdgeMeters + totals.frontEdgeMeters;

  return {
    ...totals,
    edgeMeters,
    bodySheets: Math.ceil(totals.bodyAreaM2 / usableSheetAreaM2) || 0,
    frontSheets: Math.ceil(totals.frontAreaM2 / usableSheetAreaM2) || 0,
    hdfSheets: Math.ceil(totals.hdfAreaM2 / hdfUsableSheetAreaM2) || 0,
  };
};

// --- Стоимость материалов/услуг и итоговая Wycena ----------------------------------------------

// Blat bywa w katalogu wyceniony za mb ALBO za sztukę gotowego arkusza (np. ~4.1 m długości) —
// jednostka wybranego materiału (unit) mówi, które przeliczenie jest uczciwe. "szt"/"sztuki" ->
// liczba pełnych arkuszy (Math.ceil); każda inna jednostka (domyślnie "mb") -> metry bieżące z
// dokładnością do 2 miejsc (blat tnie się na dokładny wymiar, nie zaokrągla się w górę jak listwa).
export const resolveCountertopQuantity = (countertopMeters, unit) => {
  const meters = Number(countertopMeters) || 0;
  if (meters <= 0) return 0;
  const normalizedUnit = String(unit || '').trim().toLocaleLowerCase('pl');
  if (normalizedUnit === 'szt' || normalizedUnit === 'szt.' || normalizedUnit === 'sztuki') {
    return Math.ceil(meters / COUNTERTOP_SHEET_LENGTH_M);
  }
  return Math.round(meters * 100) / 100;
};

// prices — цены уже ВЫБРАННЫХ пользователем позиций каталога (см. CabinetCalculator.jsx, Blok 1);
// любая отсутствующая цена трактуется как 0 (материал ещё не выбран — не должно падать).
// countertopQuantity — уже переведённое в честную единицу количество (resolveCountertopQuantity
// выше); countertopPrice — цена ИМЕННО за эту единицу, как она указана в каталоге у материала.
export const calculateCabinetMaterialsCost = (summary, prices = {}) => {
  const price = (value) => Number(value) || 0;
  const materialsTotal = summary.bodySheets * price(prices.bodySheetPrice)
    + summary.frontSheets * price(prices.frontSheetPrice)
    + summary.edgeMeters * price(prices.edgePricePerMeter)
    + summary.hinges * price(prices.hingePrice)
    + summary.externalDrawerSets * price(prices.externalDrawerSetPrice)
    + summary.internalDrawerSets * price(prices.internalDrawerSetPrice)
    + price(prices.countertopQuantity) * price(prices.countertopPrice);
  const servicesTotal = summary.cuttingMeters * price(prices.cuttingServicePricePerMeter)
    + summary.edgeMeters * price(prices.edgingServicePricePerMeter);

  return { materialsTotal, servicesTotal };
};

// Та же формuła, что и в финансовой панели проекта (utils/projectPricing.js) — единый источник
// истины, здесь не дублируется.
export const calculateCabinetWycena = calculateProjectWycena;

// --- Postatejna расшифровка (modal «Szczegóły wyceny») -----------------------------------------

// selections — выбранные в Bloku 1 позиции каталога (или null/undefined, если ещё не выбраны):
// { bodyMaterial, frontMaterial, edgeMaterial, hinge, drawerRunnerExternal, drawerRunnerInternal,
//   countertop, cuttingService, edgingService }, каждая — { name, price, unit } (unit нужен
//   только у countertop).
// Суммы считаются СУММИРОВАНИЕМ строк (не повторным вызовом calculateCabinetMaterialsCost), чтобы
// то, что видно построчно в модалке, гарантированно сходилось с «Razem» внизу — без двух
// параллельных путей подсчёта, которые могли бы разъехаться.
export const buildCabinetCostBreakdown = (summary, selections = {}, multiplier) => {
  const price = (value) => Number(value) || 0;
  const safeMultiplier = Number(multiplier) > 0 ? Number(multiplier) : 2;
  const countertopUnit = selections.countertop?.unit;
  const countertopQuantity = resolveCountertopQuantity(summary.countertopMeters, countertopUnit);
  const countertopIsSheets = countertopQuantity > 0 && ['szt', 'szt.', 'sztuki']
    .includes(String(countertopUnit || '').trim().toLocaleLowerCase('pl'));
  const edgeMeters = Math.round(summary.edgeMeters * 100) / 100;
  const cuttingMeters = Math.round(summary.cuttingMeters * 100) / 100;

  const materialRows = [
    {
      key: 'bodySheet', label: 'Płyta korpusu', item: selections.bodyMaterial || null,
      quantity: summary.bodySheets,
      quantityLabel: `${summary.bodySheets} ark. (${summary.bodyAreaM2.toFixed(2)} m²)`,
      unitPrice: price(selections.bodyMaterial?.price),
    },
    {
      key: 'frontSheet', label: 'Płyta frontu', item: selections.frontMaterial || null,
      quantity: summary.frontSheets,
      quantityLabel: `${summary.frontSheets} ark. (${summary.frontAreaM2.toFixed(2)} m²)`,
      unitPrice: price(selections.frontMaterial?.price),
    },
    {
      key: 'edge', label: 'Obrzeże ABS', item: selections.edgeMaterial || null,
      quantity: edgeMeters, quantityLabel: `${edgeMeters.toFixed(2)} mb`,
      unitPrice: price(selections.edgeMaterial?.price),
    },
    {
      key: 'hinge', label: 'Zawiasy', item: selections.hinge || null,
      quantity: summary.hinges, quantityLabel: `${summary.hinges} szt.`,
      unitPrice: price(selections.hinge?.price),
    },
    {
      key: 'drawerRunnerExternal', label: 'Szuflada zewn.', item: selections.drawerRunnerExternal || null,
      quantity: summary.externalDrawerSets, quantityLabel: `${summary.externalDrawerSets} kpl.`,
      unitPrice: price(selections.drawerRunnerExternal?.price),
    },
    // Wewnętrzna (schowana za zewnętrznym frontem, np. MERIVOBOX M) — osobna pozycja w zestawieniu
    // tylko gdy projekt faktycznie ma takie szuflady; inaczej zbędny wiersz z samymi zerami.
    ...(summary.internalDrawerSets > 0 ? [{
      key: 'drawerRunnerInternal', label: 'Szuflada wewn.', item: selections.drawerRunnerInternal || null,
      quantity: summary.internalDrawerSets, quantityLabel: `${summary.internalDrawerSets} kpl.`,
      unitPrice: price(selections.drawerRunnerInternal?.price),
    }] : []),
    {
      key: 'countertop', label: 'Blat', item: selections.countertop || null,
      quantity: countertopQuantity,
      quantityLabel: countertopIsSheets
        ? `${countertopQuantity} szt.`
        : `${summary.countertopMeters.toFixed(2)} mb`,
      unitPrice: price(selections.countertop?.price),
    },
  ].map(row => ({ ...row, value: row.quantity * row.unitPrice }));

  // Informacyjnie — liczone, ale (Etap A) nie mają selecta w Bloku 1, więc nie wyceniamy.
  const infoRows = [
    { key: 'hdf', label: 'HDF', quantityLabel: `${summary.hdfSheets} ark.` },
    { key: 'legs', label: 'Nogi', quantityLabel: `${summary.legs} szt.` },
    { key: 'hangers', label: 'Zawieszki', quantityLabel: `${summary.hangers} szt.` },
  ];

  const serviceRows = [
    {
      key: 'cutting', label: 'Cięcie płyty', item: selections.cuttingService || null,
      quantity: cuttingMeters, unitPrice: price(selections.cuttingService?.price),
    },
    {
      key: 'edging', label: 'Oklejanie PCV', item: selections.edgingService || null,
      quantity: edgeMeters, unitPrice: price(selections.edgingService?.price),
    },
  ].map(row => ({ ...row, value: row.quantity * row.unitPrice }));

  const materialsTotal = materialRows.reduce((sum, row) => sum + row.value, 0);
  const servicesTotal = serviceRows.reduce((sum, row) => sum + row.value, 0);
  const materialsScaled = materialsTotal * safeMultiplier;

  return {
    materialRows: materialRows.map(row => ({ ...row, scaledValue: row.value * safeMultiplier })),
    infoRows,
    serviceRows,
    materialsTotal,
    materialsScaled,
    servicesTotal,
    multiplier: safeMultiplier,
    wycena: calculateCabinetWycena({ materialsTotal, servicesTotal, multiplier: safeMultiplier }),
  };
};
