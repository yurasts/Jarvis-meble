// Параметrуczny kalkulator szafek (Kalkulator szafek / Szybka wycena) — Etap A + Etap B
// (progresywne ustawienia, osobne nogi przód/tył, autozapis stanu).
// Czyste geometryczne jądro: deterministyczny przelicznik gabarytów modułów (W × H × D, mm) na
// powierzchnie formatek, metry bieżące kromki/rozpiłu i liczniki osprzętu. Bez efektów
// ubocznych i bez odwołań do Supabase/katalogu — kalkulator dostaje już wybrane ceny
// materiałów/usług z zewnątrz (ProjectModal.jsx / CabinetCalculator.jsx). To jądro zna tylko
// klucze typów (np. "merivobox_e"), nigdy nazwy konkretnych pozycji katalogu — dopasowanie do
// katalogu zostaje w CabinetCalculator.jsx.
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
// 50/50 dla wszystkich czterech typów podłogowych (base_doors/base_drawers/tall_cabinet/
// wardrobe_section; Etap A miał tall_cabinet na sztywno 4 szt — Etap B ujednolicił to z resztą).
const legsForWidth = (widthMm) => {
  const total = Number(widthMm) > 900 ? 6 : 4;
  return { frontLegs: total / 2, rearAxiloLegs: total / 2 };
};

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

// Etap B: typ szuflady wybrany PER MODUŁ (chip w wierszu, patrz CabinetCalculator.jsx) —
// 'inherit' (domyślnie, dziedziczy globalny wybór z Bloku 1) albo konkretny system, niezależnie od
// tego, co wybrano globalnie. Jądro zna tylko te klucze — dopasowanie klucza do konkretnej pozycji
// katalogu (np. "MERIVOBOX E wysoka szuflada zewnętrzna...") zostaje w CabinetCalculator.jsx.
export const EXTERNAL_DRAWER_TYPES = ['inherit', 'merivobox_e', 'merivobox_m', 'tandem'];
export const INTERNAL_DRAWER_TYPES = ['inherit', 'merivobox_e', 'merivobox_m'];
const DRAWER_TYPE_SYSTEM = { merivobox_e: 'metal', merivobox_m: 'metal', tandem: 'wood' };
export const drawerTypeToSystem = (type) => DRAWER_TYPE_SYSTEM[type] || null; // null = inherit (brak nadpisania)

// Starszy zapis modułu ({ drawers }) sprzed rozdzielenia na zewnętrzne/wewnętrzne — zachowanie
// wstecznie zgodne: drawers -> externalDrawers, internalDrawers = 0.
const normalizeDrawerFields = (module) => {
  if (!module || module.drawers === undefined) return module;
  if (module.externalDrawers !== undefined || module.internalDrawers !== undefined) return module;
  const { drawers, ...rest } = module;
  return { ...rest, externalDrawers: drawers, internalDrawers: 0 };
};

// Etap B: czy front TEGO modułu idzie do trzeciej puli "Płyta frontu (góra)" (tylko gdy ta pula
// w ogóle istnieje — patrz options.separateTopFrontBoard w summarizeCabinetModules). wall_cabinet
// z natury jest zawsze "góra" (szafka wisząca); tall_cabinet/wardrobe_section mają front na całą
// wysokość złożony z kilku sekcji — frontPosition (chip w wierszu) mówi, czy liczyć go z płyty
// górnej czy dolnej; pozostałe typy nie mają górnej pozycji.
const moduleUsesTopFront = (module) => {
  if (module?.type === 'wall_cabinet') return true;
  if (module?.type === 'tall_cabinet' || module?.type === 'wardrobe_section') return module?.frontPosition === 'gora';
  return false;
};

// --- 1.2. Шесть базовых типов модулей ---------------------------------------------------------
// Каждый тип: defaults (стартовые размеры/счётчики) + build(dims) -> { panels, extraBodyAreaM2,
// extraHdfAreaM2, hinges, externalDrawerSets, internalDrawerSets, frontLegs, rearAxiloLegs,
// hangers, countertopMeters } для ОДНОЙ единицы модуля (qty учитывается снаружи, в
// summarizeCabinetModules).

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
        ...legsForWidth(W),
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
        ...legsForWidth(W),
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
    // własną geometrię короba (jak w base_drawers).
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
        ...legsForWidth(W),
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
        ...legsForWidth(W),
      };
    },
  },

  countertop: {
    id: 'countertop',
    label: 'Blat',
    icon: '🪵',
    defaults: { W: 2400, D: 600, qty: 1 },
    // Blat NIE jest korpusem: nie ma żadnych forматok (zero m² w Korpus/Front/HDF, zero kromki
    // korpusu) — liczy się TYLKO jego własna długość. Blat kupuje się/wycenia osobno (jako
    // gotowy materiał w Bloku 1, patrz resolveCountertopQuantity niżej), nie z listu płyty
    // korpusu/fasady.
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
// detectDrawerSystem/drawerTypeToSystem) — уже РАЗРЕШЁННАЯ (с учётом per-module override) система
// короба, а не свойство самого модуля.
export const computeModule = (module, options = {}) => {
  const definition = CABINET_MODULE_TYPES[module?.type];
  if (!definition) throw new Error(`Nieznany typ modułu: ${module?.type}`);
  const normalized = normalizeDrawerFields(module);
  const dims = {
    ...definition.defaults,
    ...normalized,
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

  const doorsCount = 'doors' in dims ? Number(dims.doors) || 0 : 0;

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
    frontLegs: built.frontLegs || 0,
    rearAxiloLegs: built.rearAxiloLegs || 0,
    hangers: built.hangers || 0,
    countertopMeters: built.countertopMeters || 0,
    // Etap B: TIP-ON (chip "+ TIP-ON" w wierszu modułu) — 1 szt. na każde drzwi tego modułu, tylko
    // dla typów, które w ogóle mają drzwi (base_drawers/countertop -> 0, bo 'doors' w defaults nie ma).
    tipOnUnits: module?.tipOn ? doorsCount : 0,
  };
};

const sumKey = (totals, perUnit, qty, key) => (totals[key] += perUnit[key] * qty);

const DIRECT_SUM_KEYS = [
  'hdfAreaM2', 'cuttingMeters', 'hinges', 'frontLegs', 'rearAxiloLegs', 'hangers',
  'countertopMeters', 'externalDrawerSets', 'internalDrawerSets', 'tipOnUnits',
];

// Суммирует список модулей проекта в сводку Szybkiej wyceny: площади/листы по пулам плит, кромка
// по пулам (korpus/front/front góra), распил, счётчики фурнитуры, ящики по типу. options:
// { externalDrawerSystem, internalDrawerSystem — globalny system (patrz detectDrawerSystem),
//   bodyFromFrontBoard, separateTopFrontBoard, edgeBodyFromFrontColor — ustawienia Etapu B (patrz
//   ADR-010), usableSheetAreaM2, hdfUsableSheetAreaM2 }.
export const summarizeCabinetModules = (modules = [], options = {}) => {
  const usableSheetAreaM2 = Number(options.usableSheetAreaM2) || USABLE_SHEET_AREA_M2;
  const hdfUsableSheetAreaM2 = Number(options.hdfUsableSheetAreaM2) || HDF_USABLE_SHEET_AREA_M2;
  const bodyFromFrontDefault = Boolean(options.bodyFromFrontBoard);
  const edgeFromFrontDefault = Boolean(options.edgeBodyFromFrontColor);
  const separateTopFrontBoard = Boolean(options.separateTopFrontBoard);

  const totals = {
    bodyAreaM2: 0,
    frontAreaM2: 0,
    frontTopAreaM2: 0,
    hdfAreaM2: 0,
    bodyEdgeMeters: 0,
    frontEdgeMeters: 0,
    frontEdgeMetersTop: 0,
    cuttingMeters: 0,
    hinges: 0,
    externalDrawerSets: 0,
    internalDrawerSets: 0,
    frontLegs: 0,
    rearAxiloLegs: 0,
    hangers: 0,
    tipOnUnits: 0,
    countertopMeters: 0,
  };
  const externalDrawersByType = Object.fromEntries(EXTERNAL_DRAWER_TYPES.map(type => [type, 0]));
  const internalDrawersByType = Object.fromEntries(INTERNAL_DRAWER_TYPES.map(type => [type, 0]));

  (modules || []).forEach((module) => {
    const qty = Math.max(0, Number(module?.qty) || 0);
    if (qty === 0) return;

    const externalDrawerType = EXTERNAL_DRAWER_TYPES.includes(module?.drawerType) ? module.drawerType : 'inherit';
    const internalDrawerType = INTERNAL_DRAWER_TYPES.includes(module?.internalDrawerType) ? module.internalDrawerType : 'inherit';
    const perUnit = computeModule(module, {
      externalDrawerSystem: drawerTypeToSystem(externalDrawerType) || options.externalDrawerSystem || 'wood',
      internalDrawerSystem: drawerTypeToSystem(internalDrawerType) || options.internalDrawerSystem || 'wood',
    });

    DIRECT_SUM_KEYS.forEach(key => sumKey(totals, perUnit, qty, key));
    externalDrawersByType[externalDrawerType] += perUnit.externalDrawerSets * qty;
    internalDrawersByType[internalDrawerType] += perUnit.internalDrawerSets * qty;

    // Płyta korpusu: domyślnie z Płyty korpusu; globalna ["Korpus z płyty frontowej"] albo chip
    // modułu ["Korpus = Front"] (ma priorytet nad globalną) przekierowują na Płytę frontu.
    const bodyFromFront = module?.bodyFromFront ?? bodyFromFrontDefault;
    totals[bodyFromFront ? 'frontAreaM2' : 'bodyAreaM2'] += perUnit.bodyAreaM2 * qty;

    // Front: domyślnie "główna" płyta frontu; gdy włączona 3-płytowa opcja i ten moduł jest
    // "góra" (wall_cabinet zawsze, tall_cabinet/wardrobe_section przez frontPosition) — osobna
    // pula "Płyta frontu (góra)".
    const usesTopFront = separateTopFrontBoard && moduleUsesTopFront(module);
    totals[usesTopFront ? 'frontTopAreaM2' : 'frontAreaM2'] += perUnit.frontAreaM2 * qty;

    // Obrzeże korpusu: domyślnie białe (Obrzeże korpusu); globalne checkbox albo chip modułu
    // ["Obrzeże = Front"] przerzucają metraż do kromki pod kolor frontu.
    const edgeFromFront = module?.edgeFromFront ?? edgeFromFrontDefault;
    totals[edgeFromFront ? 'frontEdgeMeters' : 'bodyEdgeMeters'] += perUnit.bodyEdgeMeters * qty;

    // Obrzeże frontu: idzie do tej samej puli wysokości co sama płyta frontu (główna/góra).
    totals[usesTopFront ? 'frontEdgeMetersTop' : 'frontEdgeMeters'] += perUnit.frontEdgeMeters * qty;
  });

  const edgeMeters = totals.bodyEdgeMeters + totals.frontEdgeMeters + totals.frontEdgeMetersTop;

  return {
    ...totals,
    externalDrawersByType,
    internalDrawersByType,
    edgeMeters,
    bodySheets: Math.ceil(totals.bodyAreaM2 / usableSheetAreaM2) || 0,
    frontSheets: Math.ceil(totals.frontAreaM2 / usableSheetAreaM2) || 0,
    frontTopSheets: Math.ceil(totals.frontTopAreaM2 / usableSheetAreaM2) || 0,
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

// Та же формuła, что и в финансовой панели проекта (utils/projectPricing.js) — единый источник
// истины, здесь не дублируется.
export const calculateCabinetWycena = calculateProjectWycena;

// --- Postatejna расшифровка (modal «Szczegóły wyceny») -----------------------------------------

// selections — выбранные в Bloku 1 позиции каталога (null/undefined, если ещё не выбраны):
// { bodyMaterial, frontMaterial, frontMaterialTop, edgeMaterialBody, edgeMaterialFront,
//   edgeMaterialTop, hinge, externalDrawerByType: {inherit,merivobox_e,merivobox_m,tandem},
//   internalDrawerByType: {inherit,merivobox_e,merivobox_m}, legFront, legRearAxilo, hdfMaterial,
//   hangerMaterial, tipOnMaterial, countertop, cuttingService, edgingService } — każda to
// { name, price, unit } (unit potrzebny tylko u countertop).
// Суммы считаются СУММИРОВАНИЕМ строк (не повторным вызовом отдельной "cost"-функции), чтобы то,
// что видно построчно в модалке, гарантированно сходилось с «Razem» внизу. Строки с нулевым
// количеством отфильтрowywane на выходе — в расчёте показываются только реально задействованные
// в проекте позиции (patrz ADR-010, Etap B, krok 1.4).
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

export const buildCabinetCostBreakdown = (summary, selections = {}, multiplier) => {
  const price = (value) => Number(value) || 0;
  const safeMultiplier = Number(multiplier) > 0 ? Number(multiplier) : 2;
  const countertopUnit = selections.countertop?.unit;
  const countertopQuantity = resolveCountertopQuantity(summary.countertopMeters, countertopUnit);
  const countertopIsSheets = countertopQuantity > 0 && ['szt', 'szt.', 'sztuki']
    .includes(String(countertopUnit || '').trim().toLocaleLowerCase('pl'));
  const bodyEdgeMeters = Math.round(summary.bodyEdgeMeters * 100) / 100;
  const frontEdgeMeters = Math.round(summary.frontEdgeMeters * 100) / 100;
  const frontEdgeMetersTop = Math.round(summary.frontEdgeMetersTop * 100) / 100;
  const edgeMeters = Math.round(summary.edgeMeters * 100) / 100;
  const cuttingMeters = Math.round(summary.cuttingMeters * 100) / 100;

  const externalDrawerRows = EXTERNAL_DRAWER_TYPES.map(type => {
    const quantity = summary.externalDrawersByType?.[type] || 0;
    const item = selections.externalDrawerByType?.[type] || null;
    return {
      key: `drawerExt_${type}`, label: EXTERNAL_DRAWER_LABELS[type], item,
      quantity, quantityLabel: `${quantity} kpl.`, unitPrice: price(item?.price),
    };
  });
  const internalDrawerRows = INTERNAL_DRAWER_TYPES.map(type => {
    const quantity = summary.internalDrawersByType?.[type] || 0;
    const item = selections.internalDrawerByType?.[type] || null;
    return {
      key: `drawerInt_${type}`, label: INTERNAL_DRAWER_LABELS[type], item,
      quantity, quantityLabel: `${quantity} kpl.`, unitPrice: price(item?.price),
    };
  });

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
      key: 'frontTopSheet', label: 'Płyta frontu (góra)', item: selections.frontMaterialTop || null,
      quantity: summary.frontTopSheets,
      quantityLabel: `${summary.frontTopSheets} ark. (${summary.frontTopAreaM2.toFixed(2)} m²)`,
      unitPrice: price(selections.frontMaterialTop?.price),
    },
    {
      key: 'edgeBody', label: 'Obrzeże korpusu', item: selections.edgeMaterialBody || null,
      quantity: bodyEdgeMeters, quantityLabel: `${bodyEdgeMeters.toFixed(2)} mb`,
      unitPrice: price(selections.edgeMaterialBody?.price),
    },
    {
      key: 'edgeFront', label: 'Obrzeże frontu', item: selections.edgeMaterialFront || null,
      quantity: frontEdgeMeters, quantityLabel: `${frontEdgeMeters.toFixed(2)} mb`,
      unitPrice: price(selections.edgeMaterialFront?.price),
    },
    {
      key: 'edgeFrontTop', label: 'Obrzeże frontu (góra)', item: selections.edgeMaterialTop || null,
      quantity: frontEdgeMetersTop, quantityLabel: `${frontEdgeMetersTop.toFixed(2)} mb`,
      unitPrice: price(selections.edgeMaterialTop?.price),
    },
    {
      key: 'hinge', label: 'Zawiasy', item: selections.hinge || null,
      quantity: summary.hinges, quantityLabel: `${summary.hinges} szt.`,
      unitPrice: price(selections.hinge?.price),
    },
    ...externalDrawerRows,
    ...internalDrawerRows,
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
    {
      key: 'hanger', label: 'Zawieszki', item: selections.hangerMaterial || null,
      quantity: summary.hangers, quantityLabel: `${summary.hangers} szt.`,
      unitPrice: price(selections.hangerMaterial?.price),
    },
    {
      key: 'tipOn', label: 'TIP-ON', item: selections.tipOnMaterial || null,
      quantity: summary.tipOnUnits, quantityLabel: `${summary.tipOnUnits} szt.`,
      unitPrice: price(selections.tipOnMaterial?.price),
    },
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
