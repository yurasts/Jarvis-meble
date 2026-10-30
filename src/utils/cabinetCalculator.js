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
const drawerBoxAreaM2 = (drawers) => Number(drawers || 0) * 0.35;
const drawerHdfAreaM2 = (widthMm, depthMm, drawers) => (
  Number(drawers || 0) * mm2ToM2(Number(widthMm) - 60, Number(depthMm) - 40)
);

// --- 1.2. Шесть базовых типов модулей ---------------------------------------------------------
// Каждый тип: defaults (стартовые размеры/счётчики) + build(dims) -> { panels, extraBodyAreaM2,
// extraHdfAreaM2, hinges, drawerSets, legs, hangers, countertopMeters } для ОДНОЙ единицы модуля
// (qty учитывается снаружи, в summarizeCabinetModules).

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
    defaults: { W: 600, H: 820, D: 520, drawers: 3, qty: 1 },
    build: ({ W, H, D, drawers = 0, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const drawerCount = Math.max(1, drawers);
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
      return {
        panels,
        extraBodyAreaM2: drawerBoxAreaM2(drawers),
        extraHdfAreaM2: drawerHdfAreaM2(W, D, drawers),
        drawerSets: drawers,
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
    defaults: { W: 600, H: 2100, D: 560, doors: 2, shelves: 4, drawers: 0, qty: 1 },
    build: ({ W, H, D, doors = 1, shelves = 0, drawers = 0, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        // Дно + крышка + связующие полки — (2 + shelves) горизонталей на полную глубину D.
        ...Array.from({ length: 2 + shelves }, () => panel('body', innerW, D, innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, H, 2 * (doorWidth + H))),
        panel('hdf', W, H, 0),
      ];
      return {
        panels,
        extraBodyAreaM2: drawerBoxAreaM2(drawers),
        extraHdfAreaM2: drawerHdfAreaM2(W, D, drawers),
        hinges: doors * getHingesPerDoor(H),
        drawerSets: drawers,
        legs: 4,
      };
    },
  },

  wardrobe_section: {
    id: 'wardrobe_section',
    label: 'Szafa / Garderoba',
    icon: '🧥',
    defaults: { W: 900, H: 2400, D: 600, doors: 2, shelves: 5, drawers: 2, qty: 1 },
    // Та же геометрия, что и tall_cabinet (секция шкафа — тот же каркас, просто другие
    // стартовые габариты) — ножки учитывают ширину, как у тумб.
    build: ({ W, H, D, doors = 1, shelves = 0, drawers = 0, t = DEFAULT_BOARD_THICKNESS_MM }) => {
      const innerW = W - 2 * t;
      const doorWidth = W / Math.max(1, doors);
      const panels = [
        panel('body', H, D, H),
        panel('body', H, D, H),
        ...Array.from({ length: 2 + shelves }, () => panel('body', innerW, D, innerW)),
        ...Array.from({ length: doors }, () => panel('front', doorWidth, H, 2 * (doorWidth + H))),
        panel('hdf', W, H, 0),
      ];
      return {
        panels,
        extraBodyAreaM2: drawerBoxAreaM2(drawers),
        extraHdfAreaM2: drawerHdfAreaM2(W, D, drawers),
        hinges: doors * getHingesPerDoor(H),
        drawerSets: drawers,
        legs: legsForWidth(W),
      };
    },
  },

  countertop: {
    id: 'countertop',
    label: 'Blat',
    icon: '🪵',
    defaults: { W: 2400, D: 600, qty: 1 },
    // Blat — не korpus: tylko jego własna площадь (для листов/распила) и видимый передний
    // продольный торец (кромка); погонные метры длины — отдельный, явный показатель.
    build: ({ W, D }) => ({
      panels: [panel('body', W, D, W)],
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

// Площадь, кромка и длина распила — для ОДНОЙ единицы модуля (без учёта qty).
export const computeModule = (module) => {
  const definition = CABINET_MODULE_TYPES[module?.type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${module?.type}`);
  const dims = { ...definition.defaults, ...module, t: DEFAULT_BOARD_THICKNESS_MM };
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
    drawerSets: built.drawerSets || 0,
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
    drawerSets: 0,
    legs: 0,
    hangers: 0,
    countertopMeters: 0,
  };

  (modules || []).forEach((module) => {
    const qty = Math.max(0, Number(module?.qty) || 0);
    if (qty === 0) return;
    const perUnit = computeModule(module);
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

// prices — цены уже ВЫБРАННЫХ пользователем позиций каталога (см. CabinetCalculator.jsx, Blok 1);
// любая отсутствующая цена трактуется как 0 (материал ещё не выбран — не должно падать).
export const calculateCabinetMaterialsCost = (summary, prices = {}) => {
  const price = (value) => Number(value) || 0;
  const materialsTotal = summary.bodySheets * price(prices.bodySheetPrice)
    + summary.frontSheets * price(prices.frontSheetPrice)
    + summary.edgeMeters * price(prices.edgePricePerMeter)
    + summary.hinges * price(prices.hingePrice)
    + summary.drawerSets * price(prices.drawerSetPrice)
    + summary.countertopMeters * price(prices.countertopPricePerMeter);
  const servicesTotal = summary.cuttingMeters * price(prices.cuttingServicePricePerMeter)
    + summary.edgeMeters * price(prices.edgingServicePricePerMeter);

  return { materialsTotal, servicesTotal };
};

// Та же формuła, что и в финансовой панели проекта (utils/projectPricing.js) — единый источник
// истины, здесь не дублируется.
export const calculateCabinetWycena = calculateProjectWycena;
