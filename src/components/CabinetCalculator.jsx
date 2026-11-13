import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CABINET_MODULE_TYPE_ICON,
  CABINET_MODULE_TYPES,
  DEFAULT_KITCHEN_HEIGHTS,
  EXTERNAL_DRAWER_TYPES,
  FLOOR_BAND_GROUPS,
  FRIDGE_STANDARD_OPTIONS,
  INTERNAL_DRAWER_TYPES,
  buildCabinetCostBreakdown,
  computeCabinetParts,
  computeKitchenHeights,
  computeModule,
  computeWallFreeSpace,
  createCabinetModule,
  detectDrawerSystem,
  drawerTypeToSystem,
  layoutFloorBand,
  normalizeModuleWall,
  reorderItems,
  summarizeCabinetModules,
  syncModuleHeights,
} from '../utils/cabinetCalculator';
import { sortCatalogByPriority } from '../utils/catalogPriority';
import CabinetFrontDrawing from './CabinetFrontDrawing';
import { CabinetModuleIcon } from './CabinetModuleIcons';
import SearchableMaterialSelect from './SearchableMaterialSelect';
import WallElevationCanvas from './WallElevationCanvas';
import s from './CabinetCalculator.module.css';

const PLN = value => `${Number(value || 0).toFixed(2)} zł`;

// `settings` zostaje jako pusty, przyszłościowy kontener w kształcie calculator_state ({ modules,
// selection, settings, boards, activeCategory }) — ProjectModal/autosave nie muszą wiedzieć, że
// akurat teraz jest pusty.
const DEFAULT_SETTINGS = {};

// Blok 1 — które materiały/usługi z katalogu Jarvis wolno wybrać pod każdą rolę kalkulatora.
// Katalog nie ma osobnej kategorii "Blat" — stąd heurystyka po nazwie z fallbackiem na całą listę
// płyt, żeby select nigdy nie był pusty, nawet jeśli nikt jeszcze nie opisał blatu jako takiego.
const byCategory = (materials, category) => (materials || []).filter(item => item.category === category);
const byNameHint = (items, hint) => {
  const matches = (items || []).filter(item => String(item.name || '').toLocaleLowerCase('pl').includes(hint));
  return matches.length > 0 ? matches : items;
};

// Domyślny wybór (nie dostępna pula!) dla Płyty/Obrzeża korpusu/frontu: korpus domyślnie szuka
// białej płyty/kromki (W960/Biały — najczęstszy korpus w produkcji), front domyślnie szuka
// KOLOROWEJ/drewnopodobnej (czyli po prostu nie-białej), żeby od razu zaproponować sensowną,
// realistyczną parę zamiast przypadkowych dwóch pierwszych pozycji z kategorii. Select nadal
// pokazuje WSZYSTKIE pozycje z kategorii — to tylko zawęża, co jest PROPONOWANE jako wartość
// początkowa, dopóki użytkownik nie wybierze czegoś innego.
const WHITE_HINTS = ['biały', 'bialy', 'w960'];
// Etap Q, krok 1 — krótki "kod dekoru" z nazwy materiału (np. "PL W960 SM Biały" -> "W960",
// "U702 ST9 Kaszmir" -> "U702") — pokazywany na przycisku "⚙️ Materiały", żeby bez rozwijania
// całego panelu było widać, jaki dekor ma grupa.
const DECOR_CODE_PATTERN = /\b[A-Z]{1,2}\d{2,4}\b/;
const decorCodeFromName = (name) => (String(name || '').match(DECOR_CODE_PATTERN) || [])[0];
// Etap F, krok 3 — domyślny wybór dla 2 nowych ról zawiasów (połowa szafki ze spowalniaczem,
// połowa ze zwykłą sprężyną/pod TIP-ON): szukamy po nazwie typowych pozycji katalogowych Blum
// (np. "71B3550" ze spowalniaczem, "71T3550" ze sprężyną).
const SOFT_CLOSE_HINGE_HINTS = ['spowalniacz', 'blumotion', '71b'];
const SPRING_HINGE_HINTS = ['sprężyn', '71t'];
// Etap F, krok 4 — 4 role szuflad (wysoka/niska x zewn./wewn.) domyślnie szukają pozycji, których
// nazwa zawiera OBA słowa naraz (np. "wysoka" I "zewnętrzna") — inaczej niż preferByNameHints
// (które wystarczy, że dopasuje JEDEN hint), żeby nie pomylić wysokiej zewnętrznej z wysoką
// wewnętrzną.
const DRAWER_SIZE_ROLE_HINTS = {
  drawerExternalHigh: ['wysoka', 'zewnętrzna'],
  drawerExternalLow: ['niska', 'zewnętrzna'],
  drawerInternalHigh: ['wysoka', 'wewnętrzna'],
  drawerInternalLow: ['niska', 'wewnętrzna'],
};
const preferByAllNameHints = (items, hints) => {
  const matches = (items || []).filter(item => hints.every(hint => String(item.name || '').toLocaleLowerCase('pl').includes(hint)));
  return matches.length > 0 ? matches : (items || []);
};
const preferByNameHints = (items, hints) => {
  const matches = (items || []).filter(item => hints.some(hint => String(item.name || '').toLocaleLowerCase('pl').includes(hint)));
  return matches.length > 0 ? matches : (items || []);
};
const avoidByNameHints = (items, hints) => {
  const rest = (items || []).filter(item => !hints.some(hint => String(item.name || '').toLocaleLowerCase('pl').includes(hint)));
  return rest.length > 0 ? rest : (items || []);
};

// Etap AC, krok 2 — zgłoszenie (Screenshot_2_3.jpg/Screenshot_1_3.jpg): "Nogi przednie (zwykłe)"
// podstawiało zawias ("Blum CLIP top BLUMOTION..."), bo katalog usera nie ma pozycji dosłownie
// zawierającej hint ("nogi zwykłe"/"axilo") — `byNameHint` spada wtedy na CAŁĄ, niefiltrowaną listę
// materiałów (patrz jej fallback wyżej), a jej pierwsza pozycja bywa zawiasem. Role nóżek dostają
// więc WŁASNY pool: najpierw TWARDO wycina wszystko, co wygląda na zawias (kategoria "Zawiasy" albo
// słowo "zawias" w nazwie), DOPIERO na tej oczyszczonej liście szuka hinta — fallback (brak
// trafienia) nigdy więc nie wróci zawiasu, co najwyżej inną (nie-zawiasową) pozycję.
const isHingeMaterial = (item) => item?.category === 'Zawiasy' || /zawias/i.test(String(item?.name || ''));
const legPool = (materials, hint) => byNameHint((materials || []).filter(item => !isHingeMaterial(item)), hint);

// Szuflady zewnętrzne (z widocznym frontem, np. MERIVOBOX E) i wewnętrzne (schowane za frontem,
// np. MERIVOBOX M) wybiera się z tej samej puli katalogu — kategoria `Prowadnice` plus wszystko,
// co po nazwie wygląda na system szuflad (nawet jeśli ktoś je skatalogował w innej kategorii).
const DRAWER_HINT_WORDS = ['szuflada zewnętrzna', 'szuflada wewnętrzna', 'merivobox', 'tandembox', 'legrabox', 'tandem'];
const drawerPool = (materials) => {
  const byNameHints = (materials || []).filter(item => (
    DRAWER_HINT_WORDS.some(hint => String(item.name || '').toLocaleLowerCase('pl').includes(hint))
  ));
  const merged = [...byCategory(materials, 'Prowadnice'), ...byNameHints]
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  return merged.length > 0 ? merged : (materials || []);
};

// Etap B: rozwiązanie konkretnej pozycji katalogu dla chipa typu szuflady PER MODUŁ — niezależnie
// od tego, co wybrano globalnie. Zostaje w jądrze (patrz summarizeCabinetModules) jako obsługiwana,
// choć żaden element UI nie wystawia już tego wyboru per szafka (Etap I, krok 4) — bezpieczne dla
// zapisanych wcześniej calculator_state i istniejących testów jądra.
const DRAWER_MATERIAL_MATCHERS = {
  merivobox_e: {
    external: name => name.includes('merivobox e') && name.includes('zewnętrzna'),
    internal: name => name.includes('merivobox e') && name.includes('wewnętrzna'),
  },
  merivobox_m: {
    external: name => name.includes('merivobox m') && name.includes('zewnętrzna'),
    internal: name => name.includes('merivobox m') && name.includes('wewnętrzna'),
  },
  tandem: {
    external: name => name.includes('tandem') && !name.includes('tandembox') && !name.includes('merivobox'),
    internal: null,
  },
};
const findDrawerMaterial = (materials, type, placement) => {
  const matcher = DRAWER_MATERIAL_MATCHERS[type]?.[placement];
  if (!matcher) return null;
  return (materials || []).find(item => matcher(String(item.name || '').toLocaleLowerCase('pl'))) || null;
};

// Etap I, krok 4 — Płyta korpusu/frontu i Obrzeże korpusu/frontu NIE są już globalnymi rolami:
// każda GRUPA (patrz BOARD_GROUPS) ma własny wybór tych 4 pól, przechowywany w `boardsByKey`, nie
// w `selection`. ROLE_OPTIONS zostaje tylko dla pozycji, które NADAL są globalne/współdzielone
// (osprzęt, usługi, blat) niezależnie od grupy/kategorii szafki.
const ROLE_OPTIONS = {
  hingeSoftClose: { label: 'Zawiasy (cichy domyk)', pool: (materials) => byCategory(materials, 'Zawiasy') },
  hingeSpring: { label: 'Zawiasy (ze sprężyną / do TIP-ON)', pool: (materials) => byCategory(materials, 'Zawiasy') },
  // Etap F, krok 4 — szuflady różnej wysokości w jednej szafce: osobno wysoka(E)/niska(M) x
  // zewn./wewn. Domyślny wybór szuka pozycji po nazwie (patrz DRAWER_SIZE_ROLE_HINTS w selectedId).
  drawerExternalHigh: { label: 'Szuflada zewn. wysoka (E)', pool: drawerPool },
  drawerExternalLow: { label: 'Szuflada zewn. niska (M)', pool: drawerPool },
  drawerInternalHigh: { label: 'Szuflada wewn. wysoka (E)', pool: drawerPool },
  drawerInternalLow: { label: 'Szuflada wewn. niska (M)', pool: drawerPool },
  legFront: { label: 'Nogi przednie (zwykłe)', pool: (materials) => legPool(materials, 'nogi zwykłe') },
  legRearAxilo: { label: 'Nogi tylne (Axilo)', pool: (materials) => legPool(materials, 'axilo') },
  hdfMaterial: { label: 'HDF', pool: (materials) => byNameHint(materials, 'hdf') },
  hangerMaterial: { label: 'Zawieszki', pool: (materials) => byNameHint(materials, 'zawieszka') },
  // Etap G, krok 2 — osprzęt zależny od sposobu otwierania drzwi (module.openingMethod): uchwyt dla
  // "Uchwyt", TIP-ON dla "TIP-ON", profil HAFELE dla "Profil HAFELE". "Opuszczany front" nie dodaje
  // żadnego z nich (sam zwis frontu służy jako uchwyt). Etap N, krok 4 — te 3 pozycje nie mają już
  // własnego wiersza w rozliczeniu (includeHardware:false), ale kod zostaje — jedna zmiana flagi w
  // buildCabinetCostBreakdown przywraca pełną wycenę, patrz jądro.
  handleMaterial: { label: 'Uchwyty', pool: (materials) => byNameHint(materials, 'uchwyt') },
  tipOnMaterial: { label: 'TIP-ON', pool: (materials) => byNameHint(materials, 'tip-on') },
  hafeleProfileMaterial: { label: 'Profil HAFELE', pool: (materials) => preferByAllNameHints(materials, ['profil', 'hafele']) },
  countertop: { label: 'Blat', pool: (materials) => byNameHint(materials, 'blat') },
};

// Etap I, krok 4 — 4 pola "płyty/kromki" per GRUPA (nie globalna rola) — patrz BOARD_GROUPS,
// effectiveBoardId, setBoardField niżej. Nazwa pola = ten sam klucz, co bucketKeyFor w jądrze
// (module.bodyMaterialId itd.) — grupa wstrzykuje go wprost w effectiveModules.
const BOARD_FIELDS = {
  bodyMaterialId: { label: 'Płyta korpusu', pool: (materials) => byCategory(materials, 'Płyta') },
  frontMaterialId: { label: 'Płyta frontu', pool: (materials) => byCategory(materials, 'Płyta') },
  edgeMaterialBodyId: { label: 'Obrzeże korpusu', pool: (materials) => byCategory(materials, 'Obrzeże') },
  edgeMaterialFrontId: { label: 'Obrzeże frontu', pool: (materials) => byCategory(materials, 'Obrzeże') },
};

const SERVICE_ROLE_OPTIONS = {
  cuttingService: { label: 'Cięcie płyty', pool: (services) => byNameHint(services, 'cięcie').length ? byNameHint(services, 'cięcie') : byNameHint(services, 'ciecie') },
  edgingService: { label: 'Oklejanie PCV', pool: (services) => byNameHint(services, 'oklej') },
};

// "Opcjonalne" role — gdy użytkownik jawnie wyczyści select (value=""), kalkulator ma prawo
// policzyć je jako 0.00 zł/nieużyte. Każda INNA rola jest "wymagana": jeśli zapisany
// calculator_state ma dla niej null/undefined/"" ALBO id, którego już nie ma w katalogu (bo np.
// materiał usunięto), wymuszamy sensowny domyślny wybór z katalogu — nigdy nie wolno pokazać
// "— nie wybrano — / 0.00 zł", kiedy select wizualnie pokazuje jakiś materiał.
const OPTIONAL_ROLES = new Set([
  'countertop', 'tipOnMaterial', 'hangerMaterial', 'drawerInternalHigh', 'drawerInternalLow',
  'handleMaterial', 'hafeleProfileMaterial',
]);

// Postgres (PostgREST) serializuje materials.id jako JS number; wartość z <select onChange> jest
// zawsze stringiem. Porównanie przez === między nimi zawsze zawodzi — select wizualnie pokazuje
// wybraną opcję (DOM-y porównują po stringu), ale JS-owe dopasowanie zwraca undefined, więc dalsze
// liczenie ceny widzi "brak materiału". Jedyny bezpieczny sposób porównania: String(...) === String(...).
const findInPool = (pool, id) => (pool || []).find(item => String(item.id) === String(id));

const suggestId = (items, excludeId, preferFn) => {
  const pool = items || [];
  // Niektóre role czerpią z tej samej kategorii — domyślnie nie wolno im wskazać tej samej
  // pozycji (mylące: dwa różne selecty, jedna i ta sama płyta/kromka). Jeśli po wykluczeniu
  // zostanie choć jedna opcja, bierzemy z niej; inaczej (katalog ma tylko tę jedną pozycję) — z
  // pełnej puli, bo pusty wybór byłby gorszy niż powtórzony.
  const filtered = excludeId !== undefined && excludeId !== null && excludeId !== ''
    ? pool.filter(item => String(item.id) !== String(excludeId))
    : pool;
  const candidates = filtered.length > 0 ? filtered : pool;
  const preferred = preferFn ? preferFn(candidates) : candidates;
  return sortCatalogByPriority(preferred.length > 0 ? preferred : candidates)[0]?.id ?? '';
};

let moduleSeq = 0;
const nextModuleId = () => {
  moduleSeq += 1;
  return `cab-${Date.now()}-${moduleSeq}`;
};

// Etap B: typ szuflady zapisany w module (drawerType/internalDrawerType) wpływa i na geometrię
// (metal/wood), i na to, która pozycja katalogu go wycenia — ale tu, w podglądzie 1 wiersza,
// potrzebujemy tylko geometrii (system), identycznie jak robi to summarizeCabinetModules.
const resolveModuleDrawerSystems = (module, options) => {
  const externalType = EXTERNAL_DRAWER_TYPES.includes(module?.drawerType) ? module.drawerType : 'inherit';
  const internalType = INTERNAL_DRAWER_TYPES.includes(module?.internalDrawerType) ? module.internalDrawerType : 'inherit';
  return {
    externalDrawerSystem: drawerTypeToSystem(externalType) || options.externalDrawerSystem || 'wood',
    internalDrawerSystem: drawerTypeToSystem(internalType) || options.internalDrawerSystem || 'wood',
  };
};

// Moduł zapisany PRZED wprowadzeniem hdfInGroove (stary calculator_state) nie ma tego pola wcale
// — jądro (computeModule) i tak liczy geometrię z domyślną wartością typu (definition.defaults),
// więc UI musi pokazywać TĘ SAMĄ efektywną wartość, nie goły `module.hdfInGroove` (który byłby
// `undefined` -> fałszywie "nakładany" nawet dla wall_cabinet/tall_cabinet, których domyślna to
// "wpuszczany").
const effectiveHdfInGroove = (module) => (
  module?.hdfInGroove !== undefined
    ? Boolean(module.hdfInGroove)
    : Boolean(CABINET_MODULE_TYPES[module?.type]?.defaults?.hdfInGroove)
);

// Etap G, krok 2 — sposób otwierania drzwi per szafka (zastępuje starą flagę `tipOn`). Moduł
// zapisany PRZED tą funkcją ma albo `tipOn: true` (migrujemy na wyświetlanie jako 'tip_on',
// identycznie jak normalizeOpeningMethod w jądrze), albo żadnego z tych pól (spada na domyślną
// wartość typu).
const effectiveOpeningMethod = (module) => {
  if (module?.openingMethod) return module.openingMethod;
  if (module?.tipOn) return 'tip_on';
  return CABINET_MODULE_TYPES[module?.type]?.defaults?.openingMethod || 'uchwyt';
};

// Etap G, krok 3 — presety (schematy) szuflad zewnętrznych per szafka: wybór presetu ZAPISUJE
// konkretne externalDrawersHigh/Low (i, dla "1 wysoka + 1 wewn.", internalDrawersLow) PROSTO w
// module — jądro (summarizeCabinetModules) nigdy nie musi wiedzieć o presetach, czyta tylko te
// konkretne liczniki. "wlasny" nie nadpisuje nic — odkrywa ręczne liczniki Wysokie/Niskie.
const DRAWER_PRESET_OPTIONS = [
  { value: '2_wysokie_1_niska', label: '2 wysokie ze szkłem + 1 niska', apply: { externalDrawersHigh: 2, externalDrawersLow: 1 } },
  { value: '3_wysokie', label: '3 jednakowe ze szkłem (3 x wysoka)', apply: { externalDrawersHigh: 3, externalDrawersLow: 0 } },
  { value: '2_wysokie', label: '2 wysokie ze szkłem (2 x wysoka)', apply: { externalDrawersHigh: 2, externalDrawersLow: 0 } },
  { value: '1_wysoka_1_wewn', label: '1 wysoka zewn. + 1 wewnętrzna', apply: { externalDrawersHigh: 1, externalDrawersLow: 0, internalDrawersHigh: 0, internalDrawersLow: 1 } },
  { value: 'wlasny', label: 'Własny układ...', apply: null },
];

// Dopasowanie PO externalDrawersHigh/Low (nie dotykamy internalDrawers* — "Dodatkowa szuflada
// wewnętrzna" jest niezależnym checkboxem, dostępnym dla KAŻDEGO presetu), więc 4 nazwane presety
// mają rozłączne pary (wysokie,niskie) i dopasowanie jest jednoznaczne. Moduł, który nigdy nie
// dotknął drawerPreset (świeżo utworzony albo ze starego calculator_state), wnioskuje nazwany
// preset wprost z aktualnych liczników; jeśli nic nie pasuje — "wlasny".
const effectiveDrawerPreset = (module) => {
  if (module?.drawerPreset) return module.drawerPreset;
  const high = Number(module?.externalDrawersHigh) || 0;
  const low = Number(module?.externalDrawersLow) || 0;
  const matched = DRAWER_PRESET_OPTIONS.find(option => (
    option.apply && option.apply.externalDrawersHigh === high && option.apply.externalDrawersLow === low
  ));
  return matched ? matched.value : 'wlasny';
};


// Etap AD, krok 1 — zgłoszenie (fronty.jpg): "Opuszczany front (+20 mm)" ma sens WYŁĄCZNIE dla
// Szafek górnych kuchni (kitchen_top) — dla kuchennych dolnych/słupków/antresoli checkbox znika
// CAŁKOWICIE, a moduł nie może się już przełączyć na 'opuszczany_front' (patrz frontHeightBonusMm w
// jądrze). Celowo NIE dotyka Szafy/Łazienki/RTV (`wardrobe`/`bathroom`/`rtv`) — te kategorie nie są
// częścią tego zgłoszenia, a ich typy (np. wall_cabinet) od dawna poprawnie liczą +20mm domyślnie.
const KITCHEN_NON_TOP_GROUPS = new Set(['kitchen_bottom', 'kitchen_tall', 'kitchen_mezzanine']);
const allowsOpeningMethodChoice = (group) => !KITCHEN_NON_TOP_GROUPS.has(group);

// Etap AD, krok 2 — przełącznik "Ściana" per szafka: binarny X/Y dla 'corner_l' (bez zmian), binarny
// X/Y dla 'corner_l_right' (ale wartość to 'Y2', nie 'Y' — druga ściana jest TYLKO z prawej), i
// 3-wartościowy X/Y(L)/Y(P) dla 'u_layout' (obie ściany naraz). Pusta tablica dla 'simple' (bez
// przełącznika w ogóle, jak dotychczas).
const wallToggleOptionsFor = (roomLayout) => {
  if (roomLayout === 'u_layout') return [{ value: 'X', label: 'X' }, { value: 'Y', label: 'Y (L)' }, { value: 'Y2', label: 'Y (P)' }];
  if (roomLayout === 'corner_l_right') return [{ value: 'X', label: 'X' }, { value: 'Y2', label: 'Y' }];
  if (roomLayout === 'corner_l') return [{ value: 'X', label: 'X' }, { value: 'Y', label: 'Y' }];
  return [];
};

// Pola geometrii/liczników widoczne w wierszu modułu — zależą od tego, co dany typ faktycznie
// liczy (np. countertop nie ma wysokości ani drzwi).
const moduleFieldsFor = (module) => {
  const type = module?.type ?? module;
  const defaults = CABINET_MODULE_TYPES[type].defaults;
  return {
    hasH: 'H' in defaults,
    hasDoors: 'doors' in defaults,
    hasFrontWidth: 'frontWidth' in defaults,
    hasShelves: 'shelves' in defaults,
    hasDrawers: 'externalDrawersHigh' in defaults,
    // Etap H, krok 3 — niezależne od "doors": dishwasher_front/corner_blind_cabinet mają
    // openingMethod (wpływa na uchwyt) bez pola "doors" w ogóle (stały, 1 front — patrz frontCount
    // w jądrze).
    hasOpeningMethod: 'openingMethod' in defaults && allowsOpeningMethodChoice(module?.group),
    // Etap H, krok 2/3 — tylko typy, których build() faktycznie liczy HDF, dostają checkbox
    // "HDF wpuszczany" (sink_cabinet/dishwasher_front/vanity_cabinet nie mają HDF w ogóle).
    hasHdf: 'hdfInGroove' in defaults,
    // Etap Q, krok 2 — tylko plinth_strip ("Cokół") ma pole `source` (z której płyty: korpusu czy
    // frontu liczy się jego powierzchnia/kromka — patrz panel(..) w jądrze).
    hasSource: 'source' in defaults,
    // Etap V, krok 2 — tylko fridge_tall_cabinet ("Pod lodówkę") ma pole `fridgeStandard` (wybór
    // 178/194/194 XXL cm nadpisuje W/D/fridgeNicheHeightMm naraz, patrz applyFridgeStandard).
    hasFridgeStandard: 'fridgeStandard' in defaults,
  };
};
// Etap Q, krok 4 — czy ten typ ma w ogóle COKOLWIEK do pokazania za przyciskiem "⚙️" (inaczej gear
// byłby pustym, mylącym przyciskiem — np. dla side_filler/top_filler/countertop, które nie mają
// żadnego z tych pól, komórka zostaje gołym "—", jak dawniej).
const hasAnyConstructionField = fields => (
  fields.hasFrontWidth || fields.hasDoors || fields.hasShelves || fields.hasDrawers
  || fields.hasOpeningMethod || fields.hasSource || fields.hasHdf || fields.hasFridgeStandard
);
// Etap Q, krok 4 — krótki podsumowujący podpis NA SAMYM przycisku "⚙️" (np. "2W+1N"/"1D·1P"), żeby
// zawartość popoveru była choć częściowo widoczna bez klikania — D=drzwi, P=półki, W/N=szuflady
// wysokie/niskie zewnętrzne.
const summarizeConstructionCell = (module, fields) => {
  const parts = [];
  if (fields.hasFrontWidth) {
    const frontWidth = Math.round(Number(module.frontWidth) || 0);
    if (frontWidth > 0) parts.push(`${frontWidth}mm`);
  } else if (fields.hasDoors) {
    const doors = Number(module.doors) || 0;
    if (doors > 0) parts.push(`${doors}D`);
  }
  if (fields.hasShelves) {
    const shelves = Number(module.shelves) || 0;
    if (shelves > 0) parts.push(`${shelves}P`);
  }
  if (fields.hasDrawers) {
    const high = Number(module.externalDrawersHigh) || 0;
    const low = Number(module.externalDrawersLow) || 0;
    if (high > 0 || low > 0) parts.push(`${high}W+${low}N`);
  }
  if (fields.hasOpeningMethod && effectiveOpeningMethod(module) === 'opuszczany_front') parts.push('⬇20mm');
  if (fields.hasSource) parts.push(module.source === 'front' ? 'front' : 'korpus');
  if (fields.hasFridgeStandard) {
    const standard = FRIDGE_STANDARD_OPTIONS.find(option => option.value === module.fridgeStandard);
    if (standard) parts.push(standard.value === 'xxl_75_194' ? '75/194cm' : standard.value === 'xl_194' ? '194cm' : '178cm');
  }
  return parts.join('·');
};

// Etap R, krok 2 — Szer./Wys./Gł. w wierszu tabeli: domyślnie czysta, duża cyfra z ✎ (nie <input>
// ze strzałkami, który rozpychał tabelę tak, że Obrzeże (mb) się obcinało) — klik zamienia ją w mały,
// od razu zaznaczony (select()) input bez natywnych spinnerów; Enter/blur zapisują nową wartość i
// wracają do czystej cyfry, Escape anuluje i porzuca szkic bez zapisu. `<div role="button">` (jak
// SearchableMaterialSelect), nie prawdziwy <button> — pozwala sąsiadującemu "↺" (Wys.) żyć obok bez
// zagnieżdżania interaktywnych elementów.
const InlineEditableNumberCell = ({ value, onCommit, ariaLabel }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const startEditing = () => {
    setDraft(String(Math.round(Number(value) || 0)));
    setEditing(true);
  };
  const commit = () => { onCommit(draft); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min="0" className={s.inlineEditInput} aria-label={ariaLabel}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          // `stopPropagation` (nie tylko preventDefault!) — bez niej Escape leci dalej do
          // globalnego handlera "Escape zamyka projekt" (ten sam bug/fix co w
          // SearchableMaterialSelect.jsx), zamykając cały widok projektu w trakcie edycji.
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(false); }
        }}
      />
    );
  }
  return (
    <div
      className={s.inlineEditTrigger} role="button" tabIndex={0} aria-label={ariaLabel}
      onClick={startEditing}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); startEditing(); } }}
    >
      <span className={s.inlineEditValue}>{Math.round(Number(value) || 0)}</span>
    </div>
  );
};

// Etap Y, krok 3/4 — "📋 Formatki i okleinowanie ABS": symbol bejdża (jedno spojrzenie, bez liczenia
// liter D1/D2/S1/S2) + tytuł (hover/screen reader) dla kombinacji stron oklejonych ABS zwróconych
// przez computeCabinetParts (jądro, cabinetCalculator.js).
// Etap Z, krok 1 — Bok (boczny panel korpusu) ma SWÓJ WŁASNY symbol ("⊔", 3 oklejone strony: przód
// + góra + dół, patrz computeCabinetParts) — musi być sprawdzony PRZED "||" (2 strony), bo `s1 &&
// s2` samo w sobie pasuje do OBU przypadków (Bok ma s1/s2 TEŻ aktywne, tylko DODATKOWO d1).
const isSideBandingPattern = (edges) => !!(edges.d1 && edges.s1 && edges.s2 && !edges.d2);
const edgeBadgeSymbol = (edges) => {
  const count = ['d1', 'd2', 's1', 's2'].filter(key => edges[key]).length;
  if (count === 0) return 'Brak';
  if (count === 4) return '═';
  if (isSideBandingPattern(edges)) return '⊔';
  if (count === 2 && edges.s1 && edges.s2) return '||';
  return '─';
};
const edgeBadgeTitle = (edges) => {
  if (isSideBandingPattern(edges)) return '3 str. (przód, góra, dół)';
  const active = ['d1', 'd2', 's1', 's2'].filter(key => edges[key]).map(key => key.toUpperCase());
  return active.length === 0 ? 'Brak oklejki ABS' : `Oklejka ABS: ${active.join(', ')}`;
};
// Kolor kromki na diagramie formatki — niebieski dla korpusu/HDF (ta sama konwencja co na reszcie
// rysunków w tym pliku, patrz WallElevationCanvas), zielony dla frontów (inny materiał — Front H1367).
const PART_EDGE_COLOR = { body: '#2563eb', hdf: '#2563eb', front: '#16a34a' };
// Mini-diagram JEDNEJ formatki (nie całej szafki na raz — jak w realnej karcie rozkroju z nestingu,
// gdzie każda formatka ma WŁASNY rysunek z oklejonymi torcami) — prostokąt w skali (lengthMm ×
// widthMm, dopasowany do stałego boxa), z pogrubioną krawędzią w kolorze materiału na KAŻDEJ
// stronie, którą `part.edges` oznacza jako oklejoną (d1=dół, d2=góra, s1=lewo, s2=prawo).
const PartDiagram = ({ part, active }) => {
  // Etap Z, krok 3 — zgłoszenie: podpisy typu "Front (szuflada)"/"Dno szuflady" obcinały się
  // wielokropkiem przy starym, ciasnym boxie (64×44) — większy box (80×54) + etykieta mogąca
  // zawinąć się do 2 linii (patrz .partDiagramLabel) usuwa obcinanie bez zmiany skali rysunku.
  const boxW = 80;
  const boxH = 54;
  const scale = Math.min(boxW / Math.max(1, part.lengthMm), boxH / Math.max(1, part.widthMm));
  const w = Math.max(2, part.lengthMm * scale);
  const h = Math.max(2, part.widthMm * scale);
  const color = PART_EDGE_COLOR[part.group] || 'var(--text-muted)';
  const edgeWidth = active ? 4 : 2.5;
  return (
    <svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} className={s.partDiagramSvg} aria-hidden="true">
      <g transform={`translate(${(boxW - w) / 2}, ${(boxH - h) / 2})`}>
        <rect x={0} y={0} width={w} height={h} fill="none" stroke={active ? color : 'var(--border)'} strokeWidth={active ? 2 : 1} />
        {part.edges.d2 && <line x1={0} y1={0} x2={w} y2={0} stroke={color} strokeWidth={edgeWidth} strokeLinecap="round" />}
        {part.edges.d1 && <line x1={0} y1={h} x2={w} y2={h} stroke={color} strokeWidth={edgeWidth} strokeLinecap="round" />}
        {part.edges.s1 && <line x1={0} y1={0} x2={0} y2={h} stroke={color} strokeWidth={edgeWidth} strokeLinecap="round" />}
        {part.edges.s2 && <line x1={w} y1={0} x2={w} y2={h} stroke={color} strokeWidth={edgeWidth} strokeLinecap="round" />}
      </g>
    </svg>
  );
};

// Etap W, krok 2 — "⚙️" dowolnego wiersza otwiera TERAZ jedno, wspólne, WYŚRODKOWANE modalne okno
// (zgłoszenie: wąski, zaczepiony o wiersz popover był niewygodny) — position: fixed + backdrop,
// zamyka się przez ×, klik w backdrop albo Escape. Escape łapiemy na WŁASNYM <div onKeyDown>
// (React synthetic — bubbluje po DRZEWIE REACT, nie po surowym DOM-ie, więc mimo portalu do
// document.body dociera NAJPIERW tutaj, zanim zdążyłby zamknąć cały pełnoekranowy kalkulator —
// `stopPropagation()` to gwarantuje), nie `document.addEventListener` — ten sam, już sprawdzony
// mechanizm co InlineEditableNumberCell/handleOverlayKeyDown. Autofocus przycisku "×" przy
// otwarciu przenosi fokus FIZYCZNIE do wnętrza modala (inaczej Escape wciśnięty zanim user
// kliknie cokolwiek w środku bąbelkowałby z przycisku "⚙️" w TLE, poza drzewem modala, i zamykał
// cały kalkulator zamiast samego modala).
const CabinetSettingsModal = ({
  module, fields, wall, roomLayout, hdfInGroove, hasInternalDrawer, perUnit,
  onClose, onDuplicate, onRemove, onSetWall,
  onPatchField, onSetModuleField, onPatchHeight, onResetHeight, onToggleHdf,
  onApplyDrawerPreset, onToggleInternalDrawer, onApplyFridgeStandard,
}) => {
  const closeButtonRef = useRef(null);
  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  // Etap Y, krok 3/4 — "📋 Formatki i okleinowanie ABS": zwinięta domyślnie (ten sam wzorzec co
  // inne drugorzędne panele w tej aplikacji, np. "⚙️ Materiały — <grupa>"); `hoveredPartIndex`
  // łączy hover wiersza tabeli z jego mini-diagramem (i odwrotnie — oba miejsca wołają ten sam setter).
  const [partsExpanded, setPartsExpanded] = useState(false);
  const [hoveredPartIndex, setHoveredPartIndex] = useState(null);
  const cabinetParts = useMemo(() => computeCabinetParts(module), [module]);

  const definition = CABINET_MODULE_TYPES[module.type];
  const displayLabel = module.label || definition.label;
  const displayIconSlug = module.icon || CABINET_MODULE_TYPE_ICON[module.type];
  const qty = Math.max(0, Number(module.qty) || 0);
  const edgeMb = (perUnit.bodyEdgeMeters + perUnit.frontEdgeMeters) * qty;

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={s.settingsModalBackdrop}
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        className={s.settingsModal} role="dialog" aria-modal="true"
        aria-label={`Ustawienia szafki: ${displayLabel}`}
        data-testid="cabinet-settings-modal"
      >
        <div className={s.settingsModalHeader}>
          <span className={s.cardHeaderIcon}><CabinetModuleIcon slug={displayIconSlug} /></span>
          <h3 className={s.settingsModalTitle}>
            ⚙️ Ustawienia szafki: {displayLabel}
            {wallToggleOptionsFor(roomLayout).length > 0 ? ` (Ściana ${wall})` : ''}
          </h3>
          <button
            ref={closeButtonRef}
            type="button" className={s.settingsModalCloseButton}
            onClick={onClose} aria-label="Zamknij ustawienia szafki"
          >
            ×
          </button>
        </div>

        <div className={s.settingsModalBody}>
          <section className={s.settingsModalSection}>
            <h4 className={s.settingsModalSectionTitle}>Gabaryty i rozmieszczenie</h4>
            <div className={s.settingsModalGrid}>
              {wallToggleOptionsFor(roomLayout).length > 0 && (
                <label className={s.settingsModalField}>
                  Ściana
                  <div className={s.wallToggle}>
                    {wallToggleOptionsFor(roomLayout).map(({ value: wallOption, label: wallLabel }) => (
                      <button
                        key={wallOption} type="button"
                        className={`${s.wallToggleButton} ${wallOption === 'X' ? s.wallToggleX : s.wallToggleY} ${wall === wallOption ? s.wallToggleActive : ''}`}
                        aria-pressed={wall === wallOption}
                        onClick={() => onSetWall(wallOption)}
                      >
                        {wallLabel}
                      </button>
                    ))}
                  </div>
                </label>
              )}
              <label className={s.settingsModalField}>
                Szerokość (mm)
                <input type="number" min="0" className={s.settingsModalInput} aria-label="Szerokość (mm)" value={module.W} onChange={event => onPatchField('W', event.target.value)} />
              </label>
              {fields.hasH && (
                <label className={s.settingsModalField}>
                  Wysokość (mm)
                  <span className={s.heightCellInner}>
                    <input type="number" min="0" className={s.settingsModalInput} aria-label="Wysokość (mm)" value={module.H} onChange={event => onPatchHeight(event.target.value)} />
                    {module.customHeight && (
                      <button
                        type="button" className={s.resetHeightButton} onClick={onResetHeight}
                        title="Ręczna wysokość — kliknij, aby wrócić do standardu"
                      >
                        ↺ Auto
                      </button>
                    )}
                  </span>
                </label>
              )}
              <label className={s.settingsModalField}>
                Głębokość (mm)
                <input type="number" min="0" className={s.settingsModalInput} aria-label="Głębokość (mm)" value={module.D} onChange={event => onPatchField('D', event.target.value)} />
              </label>
            </div>
          </section>

          {(hasAnyConstructionField(fields) || fields.hasHdf) && (
            <section className={s.settingsModalSection}>
              <h4 className={s.settingsModalSectionTitle}>Konstrukcja i wypełnienie</h4>
              <div className={s.settingsModalFields}>
                {fields.hasFrontWidth && (
                  <label className={s.settingsModalField}>
                    Szerokość frontu (mm)
                    <input type="number" min="0" className={s.settingsModalInput} aria-label="Szerokość frontu (mm)" value={module.frontWidth} onChange={event => onPatchField('frontWidth', event.target.value)} />
                  </label>
                )}
                {!fields.hasFrontWidth && fields.hasDoors && (
                  <label className={s.settingsModalField}>
                    Liczba drzwi
                    <input type="number" min="0" className={s.settingsModalInput} aria-label="Liczba drzwi" value={module.doors} onChange={event => onPatchField('doors', event.target.value)} />
                  </label>
                )}
                {fields.hasShelves && (
                  <label className={s.settingsModalField}>
                    {fields.hasFridgeStandard ? 'Liczba półek nad lodówką' : 'Liczba półek'}
                    <input type="number" min="0" className={s.settingsModalInput} aria-label={fields.hasFridgeStandard ? 'Liczba półek nad lodówką' : 'Liczba półek'} value={module.shelves} onChange={event => onPatchField('shelves', event.target.value)} />
                  </label>
                )}
                {fields.hasOpeningMethod && (
                  <label className={s.settingsModalCheckboxField}>
                    <input
                      type="checkbox" checked={effectiveOpeningMethod(module) === 'opuszczany_front'}
                      onChange={() => onSetModuleField('openingMethod', effectiveOpeningMethod(module) === 'opuszczany_front' ? 'uchwyt' : 'opuszczany_front')}
                      aria-label="Opuszczany front (+20 mm)"
                    />
                    Opuszczany front (+20 mm)
                  </label>
                )}
                {fields.hasSource && (
                  <label className={s.settingsModalField}>
                    Cokół — źródło płyty
                    <select
                      className={s.settingsModalSelect} aria-label="Cokół — źródło płyty"
                      value={module.source || 'body'}
                      onChange={event => onSetModuleField('source', event.target.value)}
                    >
                      <option value="body">z płyty korpusu</option>
                      <option value="front">z płyty frontu</option>
                    </select>
                  </label>
                )}
                {fields.hasFridgeStandard && (
                  <label className={`${s.settingsModalField} ${s.settingsModalFieldWide}`}>
                    Standard lodówki do zabudowy
                    <select
                      className={s.settingsModalSelect} aria-label="Standard lodówki do zabudowy"
                      value={module.fridgeStandard || 'standard_178'}
                      onChange={event => onApplyFridgeStandard(event.target.value)}
                    >
                      {FRIDGE_STANDARD_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {fields.hasDrawers && (
                  <>
                    <label className={`${s.settingsModalField} ${s.settingsModalFieldWide}`}>
                      Układ szuflad zewnętrznych
                      <select
                        className={s.settingsModalSelect} aria-label="Układ szuflad zewnętrznych"
                        value={effectiveDrawerPreset(module)}
                        onChange={event => onApplyDrawerPreset(event.target.value)}
                      >
                        {DRAWER_PRESET_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {effectiveDrawerPreset(module) === 'wlasny' && (
                      <>
                        <label className={s.settingsModalField}>
                          Szuflady wysokie (szt.)
                          <input type="number" min="0" className={s.settingsModalInput} aria-label="Szuflady wysokie (szt.)" value={module.externalDrawersHigh} onChange={event => onPatchField('externalDrawersHigh', event.target.value)} />
                        </label>
                        <label className={s.settingsModalField}>
                          Szuflady niskie (szt.)
                          <input type="number" min="0" className={s.settingsModalInput} aria-label="Szuflady niskie (szt.)" value={module.externalDrawersLow} onChange={event => onPatchField('externalDrawersLow', event.target.value)} />
                        </label>
                      </>
                    )}
                    <label className={s.settingsModalCheckboxField}>
                      <input type="checkbox" checked={hasInternalDrawer} onChange={onToggleInternalDrawer} aria-label="Dodatkowa szuflada wewnętrzna" />
                      Dodatkowa szuflada wewnętrzna
                    </label>
                    {hasInternalDrawer && (
                      <>
                        <label className={s.settingsModalField}>
                          Wewn. wysokie (szt.)
                          <input type="number" min="0" className={s.settingsModalInput} aria-label="Wewn. wysokie (szt.)" value={module.internalDrawersHigh} onChange={event => onPatchField('internalDrawersHigh', event.target.value)} />
                        </label>
                        <label className={s.settingsModalField}>
                          Wewn. niskie (szt.)
                          <input type="number" min="0" className={s.settingsModalInput} aria-label="Wewn. niskie (szt.)" value={module.internalDrawersLow} onChange={event => onPatchField('internalDrawersLow', event.target.value)} />
                        </label>
                      </>
                    )}
                  </>
                )}
                {fields.hasHdf && (
                  <label className={s.settingsModalCheckboxField}>
                    <input type="checkbox" checked={hdfInGroove} onChange={onToggleHdf} aria-label="HDF wpuszczany" />
                    HDF wpuszczany
                  </label>
                )}
              </div>
            </section>
          )}

          <section className={s.settingsModalSection} data-testid="cabinet-parts-section">
            <button
              type="button" className={s.partsSectionToggle}
              aria-expanded={partsExpanded}
              onClick={() => setPartsExpanded(current => !current)}
            >
              <h4 className={s.settingsModalSectionTitle}>📋 Formatki i okleinowanie ABS ({cabinetParts.length} poz.)</h4>
              <span aria-hidden="true">{partsExpanded ? '▾' : '▸'}</span>
            </button>
            {partsExpanded && (
              <div className={s.partsSectionBody}>
                <div className={s.partsLegend}>
                  <span className={s.partsLegendItem}><span className={s.partsLegendSwatch} style={{ background: PART_EDGE_COLOR.body }} />ABS 0.8 — Korpus</span>
                  <span className={s.partsLegendItem}><span className={s.partsLegendSwatch} style={{ background: PART_EDGE_COLOR.front }} />ABS 0.8 — Front</span>
                </div>
                <div className={s.partsDiagramGrid}>
                  {cabinetParts.map((part, i) => (
                    <div
                      key={`${part.element}-${i}`}
                      className={`${s.partDiagramCell} ${hoveredPartIndex === i ? s.partDiagramCellActive : ''}`}
                      onMouseEnter={() => setHoveredPartIndex(i)}
                      onMouseLeave={() => setHoveredPartIndex(current => (current === i ? null : current))}
                    >
                      <PartDiagram part={part} active={hoveredPartIndex === i} />
                      <span className={s.partDiagramLabel}>{part.element}</span>
                    </div>
                  ))}
                </div>
                <table className={s.partsTable} data-testid="cabinet-parts-table">
                  <thead>
                    <tr>
                      <th>Element</th>
                      <th>Materiał</th>
                      <th>Ilość (szt.)</th>
                      <th>Długość (mm)</th>
                      <th>Szerokość (mm)</th>
                      <th>Okleina ABS (strony)</th>
                      <th>Powierzchnia (m²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cabinetParts.map((part, i) => (
                      <tr
                        key={`${part.element}-${i}`}
                        className={hoveredPartIndex === i ? s.partsTableRowActive : ''}
                        onMouseEnter={() => setHoveredPartIndex(i)}
                        onMouseLeave={() => setHoveredPartIndex(current => (current === i ? null : current))}
                      >
                        <td>{part.element}</td>
                        <td>{part.material}</td>
                        <td>{part.count}</td>
                        <td>{part.lengthMm}</td>
                        <td>{part.widthMm}</td>
                        <td>
                          <span className={s.edgeBadgeSymbol} title={edgeBadgeTitle(part.edges)}>{edgeBadgeSymbol(part.edges)}</span>
                          <span className={s.edgeBadgeLetters}>
                            {['d1', 'd2', 's1', 's2'].map(key => (
                              <span key={key} className={`${s.edgeBadgeLetter} ${part.edges[key] ? s.edgeBadgeLetterActive : ''}`}>{key.toUpperCase()}</span>
                            ))}
                          </span>
                        </td>
                        <td>{part.areaM2.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.settingsModalSection}>
            <div className={s.settingsModalSummary}>
              Korpus: {(perUnit.bodyAreaM2 * qty).toFixed(2)} m² · Front: {(perUnit.frontAreaM2 * qty).toFixed(2)} m² · Obrzeże: {edgeMb.toFixed(2)} mb · HDF: {perUnit.hdfAreaM2.toFixed(2)} m²
            </div>
          </section>
        </div>

        {/* Etap AB, krok 4 — zgłoszenie (zmywarka.jpg): "◀ Przesuń w lewo"/"Przesuń w prawo ▶"
            usunięte z footera — przestawianie żyje teraz TYLKO na rysunku (drag&drop), nikt nie
            używał tych przycisków przez modal. Lewa strona footera: Duplikuj/Usuń; prawa: Gotowe. */}
        <div className={s.settingsModalActions}>
          <button type="button" className={s.settingsModalActionButton} onClick={onDuplicate} aria-label={`Duplikuj moduł ${displayLabel}`}>⧉ Duplikuj szafkę</button>
          <button type="button" className={`${s.settingsModalActionButton} ${s.settingsModalDangerButton}`} onClick={onRemove} aria-label={`Usuń moduł ${displayLabel}`}>🗑️ Usuń szafkę</button>
          <button type="button" className={s.settingsModalDoneButton} onClick={onClose}>Gotowe</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Etap N, krok 2 — panel wysokości kuchni rozbity na 3 logiczne obszary (zamiast 1 płaskiego
// rzędu 7 pól): Obszar zabudowy (ściana) / Parametry szafek i blatu / Blendy i cokół (patrz niżej,
// trims). `mezzanineHeight`/`ceilingGap` zostają w `kitchenHeights`/computeKitchenHeights (jądro się
// nie zmieniło), tylko przestają mieć WŁASNE pole w UI — upraszcza nawigację, jak chce zadanie.
const AREA1_FIELDS = [
  { field: 'wallWidthMm', label: 'Szerokość ściany / zabudowy (mm)' },
  { field: 'ceilingHeight', label: 'Wysokość sufitu (mm)' },
  { field: 'backsplashHeight', label: 'Pas roboczy / fartuch (mm)' },
];
const AREA2_FIELDS = [
  { field: 'countertopHeight', label: 'Wysokość blatu (mm)' },
  { field: 'countertopThickness', label: 'Grubość blatu (mm)' },
  { field: 'countertopDepthMm', label: 'Głębokość blatu (mm)' },
  { field: 'legHeight', label: 'Wysokość nóżek / cokołu (mm)' },
];
const HEIGHT_ROLE_FIELDS = [
  { role: 'bottom', label: 'Wys. szafek dolnych (mm)' },
  { role: 'wall', label: 'Wys. szafek górnych (mm)' },
  { role: 'tall', label: 'Wys. słupków (mm)' },
  { role: 'mezzanine', label: 'Wys. antresoli (mm)' },
];

// Etap Q, krok 1 — pola Obszaru 1/2 ("Obszar zabudowy (ściana)" / "Parametry szafek i blatu")
// dostają TEN SAM kompaktowy format "✎ Etykieta: wartość" co wiersz materiału grupy
// (SearchableMaterialSelect variant="compact") — różnica: wartość to zawsze-widoczny, edytowalny
// <input>/<select>, nie popover z katalogu (user wpisuje liczbę, nie wybiera z listy pozycji).
// `aria-label` jest JAWNY (nie z tekstu <label>, który dla czytelności nosi dodatkowo ✎ i ":") —
// to dokładnie ten sam zabieg, co już wcześniej stosowało pole "Układ ścian".
const CompactNumberField = ({ label, value, onChange }) => (
  <span className={s.compactNumberField}>
    <span className={s.compactPencil} aria-hidden="true">✎</span>
    <span className={s.compactNumberLabel}>{label}:</span>
    <input
      type="number" min="0" className={s.compactNumberInput} aria-label={label}
      value={value} onChange={event => onChange(event.target.value)}
    />
  </span>
);

const CompactSelectField = ({ label, value, onChange, children }) => (
  <span className={s.compactNumberField}>
    <span className={s.compactPencil} aria-hidden="true">✎</span>
    <span className={s.compactNumberLabel}>{label}:</span>
    <select className={s.compactNumberInput} aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
      {children}
    </select>
  </span>
);

// Etap I, krok 1 — wybór typu zabudowy, teraz jako kompaktowy dropdown (patrz renderowanie) zamiast
// 4 wkładek-przycisków, żeby po wyborze typu nie wisiały obok zbędne, nieużywane przyciski.
const CATEGORY_TABS = [
  { key: 'kitchen', label: '🍳 Kuchnia' },
  { key: 'wardrobe', label: '🚪 Szafa / Garderoba' },
  { key: 'bathroom', label: '🛁 Łazienka' },
  { key: 'rtv', label: '📺 RTV' },
];

// Etap I, krok 2 — GRUPY z własnym (albo dziedziczonym) wyborem płyty/kromki: 4 grupy kuchenne +
// po jednej "grupie" na każdą z pozostałych 3 kategorii (ich nagłówek materiałów jest wspólny dla
// całej kategorii, czyli dokładnie to samo co "jedna grupa"). `inheritOptions`, gdy obecne, dają
// przełącznik "Materiały grupy:" — pierwsza opcja to wartość domyślna.
const BOARD_GROUPS = {
  kitchen_bottom: { label: '⬇️ Szafki dolne' },
  kitchen_top: {
    label: '⬆️ Szafki górne',
    inheritOptions: [
      { value: 'own', label: 'Własne materiały' },
      { value: 'dolne', label: 'Jak w: Szafki dolne' },
    ],
  },
  kitchen_mezzanine: {
    label: '⏫ Antresole / Górny rząd pod sufit',
    inheritOptions: [
      { value: 'dolne', label: 'Jak w: Szafki dolne' },
      { value: 'gorne', label: 'Jak w: Szafki górne' },
      { value: 'own', label: 'Własne materiały' },
    ],
  },
  kitchen_tall: {
    label: '📏 Słupki / Wysoka zabudowa',
    inheritOptions: [
      { value: 'dolne', label: 'Jak w: Szafki dolne' },
      { value: 'gorne', label: 'Jak w: Szafki górne' },
      { value: 'own', label: 'Własne materiały' },
    ],
  },
  wardrobe: { label: '🚪 Szafa / Garderoba' },
  bathroom: { label: '🛁 Łazienka' },
  rtv: { label: '📺 RTV' },
};

const COUNTERTOP_GROUP_LABEL = '🪵 Blat';

// Etap S, krok 1 — krótkie podpisy na zakładkach karuzeli (5 grup kuchennych w JEDNYM kontenerze,
// zamiast długiej pionowej wstęgi) — krótsze niż pełne BOARD_GROUPS[...].label/COUNTERTOP_GROUP_LABEL
// (te zostają BEZ zmian wewnątrz slajdu — nagłówek grupy, aria-labele pól materiałowych itd., żeby
// nie złamać istniejącego słownictwa a11y/testów).
const GROUP_TAB_LABELS = {
  kitchen_bottom: '⬇️ Dolne',
  kitchen_top: '⬆️ Górne',
  kitchen_mezzanine: '⏫ Antresole',
  kitchen_tall: '📏 Słupki',
  kitchen_countertop: '🪵 Blat',
};
const KITCHEN_GROUP_KEYS = Object.keys(GROUP_TAB_LABELS);

// Etap U, krok 1 — tabela po prawej pokazuje TERAZ wszystkie podrozdziały kuchni naraz naraz,
// zgrupowane PER ŚCIANA (X/Y) i wewnątrz niej PER JARUS (nie per `module.group` z osobna — Dolne i
// Słupki dzielą JEDEN wspólny napodłogowy jarus, patrz layoutFloorBand w jądrze).
const FLOOR_TIER_LABEL = '⬇️ Pas dolny i słupki (Dolne + Słupki)';
const TOP_TIER_LABEL = '⬆️ Szafki górne';
const MEZZANINE_TIER_LABEL = '⏫ Antresole (pod sufit)';
const COUNTERTOP_TIER_LABEL = '🪵 Blat';

// Etap I, krok 3 — przyciski szybkiego dodawania, pogrupowane jak w Kroku 2/3 zadania: Kuchnia ma
// 5 sekcji (4 grupy płytowe + Blat), pozostałe 3 kategorie — jedną płaską listę modułów pod jedną
// wspólną grupą materiałową. Większość "nowych" modułów to w rzeczywistości ISTNIEJĄCE typy z
// innymi wymiarami domyślnymi (overrides) — nowej geometrii wymagał tylko vanity_cabinet (patrz
// jądro, Etap I, krok 3) + hangerCount/legsEnabled na wall_cabinet/tall_cabinet/wardrobe_section.
// Etap J, krok 2 — `icon` jest teraz SLUGIEM do rejestru SVG (components/CabinetModuleIcons.jsx),
// nie emoji: kafelek "+ Dodaj moduł" i nagłówek dodanej karty rysują tę samą ikonę. Etykiety 10
// presetów kuchennych skrócone (bez powtarzania słów "Szafka"/"dolna"/"górna"/"Słupek" — to już
// mówi nazwa grupy) — pozostałe kategorie (Szafa/Łazienka/RTV) zostają z pełnymi nazwami, zadanie
// tego nie wymagało dla nich.
// Etap L, krok 1 — `heightRole` (patrz panel "Wymiary wysokościowe kuchni") mówi, że TA pozycja ma
// dostać AUTOMATYCZNIE wyliczoną wysokość korpusu (bottom/wall/mezzanine/tall) zamiast wymiaru
// zahardkodowanego w presetcie/typie — tylko dla "generycznych" przedstawicieli swojej grupy.
// Presety z CELOWO inną, stałą wysokością ("Nad okap" — niżej dla wyciągu, "Nad słupkiem" — krótsza
// antresola, bo stoi na pieniu) heightRole NIE dostają i zostają przy swoim własnym `overrides.H`.
const CATEGORY_GROUPS = {
  kitchen: [
    {
      groupKey: 'kitchen_bottom',
      presets: [
        { label: 'Z drzwiami', icon: 'doors', type: 'base_doors', heightRole: 'bottom', overrides: {} },
        { label: 'Z szufladami', icon: 'drawers', type: 'base_drawers', heightRole: 'bottom', overrides: { drawerPreset: '2_wysokie_1_niska' } },
        { label: 'Pod piekarnik', icon: 'oven', type: 'oven_cabinet', heightRole: 'bottom', overrides: {} },
        { label: 'Pod zlew', icon: 'sink', type: 'sink_cabinet', heightRole: 'bottom', overrides: {} },
        { label: 'Zabudowa zmywarki', icon: 'dishwasher', type: 'dishwasher_front', heightRole: 'bottom', overrides: {} },
        { label: 'Narożna zaślepiona', icon: 'corner', type: 'corner_blind_cabinet', heightRole: 'bottom', overrides: {} },
        { label: 'Blenda boczna', icon: 'sideFiller', type: 'side_filler', heightRole: 'bottom', overrides: {} },
        { label: 'Cokół', icon: 'plinth', type: 'plinth_strip', overrides: {} },
      ],
    },
    {
      groupKey: 'kitchen_top',
      presets: [
        { label: 'Klasyczna (z drzwiami)', icon: 'wallDoors', type: 'wall_cabinet', heightRole: 'wall', overrides: {} },
        { label: 'Nad okap', icon: 'hood', type: 'wall_cabinet', overrides: { H: 450, shelves: 1, openingMethod: 'tip_on' } },
        { label: 'Blenda boczna', icon: 'sideFiller', type: 'side_filler', heightRole: 'wall', overrides: {} },
        { label: 'Blenda górna', icon: 'topFiller', type: 'top_filler', overrides: {} },
      ],
    },
    {
      groupKey: 'kitchen_mezzanine',
      presets: [
        { label: 'Klapa pod sufit', icon: 'flapUp', type: 'wall_cabinet', heightRole: 'mezzanine', overrides: { D: 560, shelves: 0, openingMethod: 'tip_on' } },
        { label: 'Nad słupkiem / lodówką', icon: 'flapOnPillar', type: 'wall_cabinet', overrides: { H: 350, D: 560, shelves: 0, openingMethod: 'tip_on', hangerCount: 0 } },
        { label: 'Blenda boczna', icon: 'sideFiller', type: 'side_filler', heightRole: 'mezzanine', overrides: {} },
        { label: 'Blenda górna', icon: 'topFiller', type: 'top_filler', overrides: {} },
      ],
    },
    {
      groupKey: 'kitchen_tall',
      presets: [
        { label: 'Z półkami', icon: 'pillarShelves', type: 'tall_cabinet', heightRole: 'tall', overrides: {} },
        { label: 'Z szufladami', icon: 'pillarDrawers', type: 'tall_cabinet', heightRole: 'tall', overrides: { shelves: 3, drawerPreset: '2_wysokie_1_niska', externalDrawersHigh: 2, externalDrawersLow: 1 } },
        { label: 'Pod lodówkę', icon: 'fridge', type: 'fridge_tall_cabinet', heightRole: 'tall', overrides: {} },
        { label: 'Blenda boczna', icon: 'sideFiller', type: 'side_filler', heightRole: 'tall', overrides: {} },
      ],
    },
    {
      groupKey: 'kitchen_countertop',
      isCountertop: true,
      presets: [
        { label: 'Blat', icon: 'countertop', type: 'countertop', overrides: {} },
      ],
    },
  ],
  wardrobe: [
    {
      groupKey: 'wardrobe',
      presets: [
        { label: 'Sekcja z drzwiami i półkami', icon: 'doors', type: 'wardrobe_section', overrides: { doors: 2, shelves: 5, externalDrawersHigh: 0, externalDrawersLow: 0 } },
        { label: 'Sekcja z drążkiem', icon: 'rod', type: 'wardrobe_section', overrides: { doors: 2, shelves: 1, externalDrawersHigh: 0, externalDrawersLow: 0 } },
        { label: 'Sekcja z szufladami', icon: 'drawers', type: 'wardrobe_section', overrides: { doors: 2, shelves: 3, drawerPreset: '2_wysokie_1_niska', externalDrawersHigh: 2, externalDrawersLow: 1 } },
        { label: 'Pawlacz / Nadstawka', icon: 'wallDoors', type: 'wardrobe_section', overrides: { W: 900, H: 450, D: 600, doors: 2, shelves: 0, openingMethod: 'tip_on', legsEnabled: false, externalDrawersHigh: 0, externalDrawersLow: 0 } },
        { label: 'Regał otwarty', icon: 'openShelf', type: 'wardrobe_section', overrides: { W: 600, H: 2400, D: 400, doors: 0, shelves: 6, externalDrawersHigh: 0, externalDrawersLow: 0 } },
        { label: 'Blenda boczna', icon: 'sideFiller', type: 'side_filler', overrides: {} },
      ],
    },
  ],
  bathroom: [
    {
      groupKey: 'bathroom',
      presets: [
        { label: 'Szafka pod umywalkę (podwieszana)', icon: 'vanityDrawers', type: 'vanity_cabinet', overrides: {} },
        { label: 'Słupek łazienkowy', icon: 'pillarShelves', type: 'tall_cabinet', overrides: { W: 400, H: 1700, D: 350, doors: 2, shelves: 4, hdfInGroove: true, hangerCount: 2 } },
        { label: 'Szafka wisząca nad umywalką', icon: 'wallDoors', type: 'wall_cabinet', overrides: { W: 600, H: 750, D: 180, doors: 1, shelves: 2 } },
        { label: 'Blat łazienkowy', icon: 'countertop', type: 'countertop', overrides: { W: 800, D: 470 } },
      ],
    },
  ],
  rtv: [
    {
      groupKey: 'rtv',
      presets: [
        { label: 'Szafka RTV podwieszana', icon: 'wallDoors', type: 'wall_cabinet', overrides: { W: 1800, H: 400, D: 400, doors: 3, shelves: 0, openingMethod: 'tip_on' } },
        { label: 'Szafka RTV stojąca', icon: 'drawers', type: 'tall_cabinet', overrides: { W: 1800, H: 500, D: 420, doors: 2, shelves: 1, drawerPreset: '2_wysokie', externalDrawersHigh: 2, externalDrawersLow: 0, openingMethod: 'tip_on' } },
        { label: 'Szafka wisząca RTV', icon: 'wallDoors', type: 'wall_cabinet', overrides: { W: 1200, H: 350, D: 300, doors: 1, shelves: 1, openingMethod: 'tip_on' } },
      ],
    },
  ],
};

// Etap H, krok 1 — tabela wyceny jest JEDYNYM miejscem wyboru materiału DLA OSPRZĘTU/USŁUG: komórka
// "Wybrany materiał" dostaje żywy SearchableMaterialSelect dla tych wierszy, zamiast gołego tekstu.
// Etap I, krok 4 — Płyta/Obrzeże korpusu/frontu NIE mają tu już roli: ich materiał wybiera się w
// nagłówku GRUPY (patrz BOARD_GROUPS/renderBoardGroupSection), więc w tabeli te wiersze zostają
// czystym tekstem (bucket nigdy nie jest 'default' — każdy moduł dostaje jawny id z grupy, więc
// klucz wiersza to zawsze "bodySheet_<id>" itp., bez wpisu w tej mapie).
const MATERIAL_ROW_ROLE = {
  hingeSoftClose: 'hingeSoftClose',
  hingeSpring: 'hingeSpring',
  hdf: 'hdfMaterial',
  legFront: 'legFront',
  legRearAxilo: 'legRearAxilo',
  hanger: 'hangerMaterial',
  handle: 'handleMaterial',
  tipOn: 'tipOnMaterial',
  hafeleProfile: 'hafeleProfileMaterial',
  countertop: 'countertop',
  drawerExt_merivobox_e: 'drawerExternalHigh',
  drawerExt_merivobox_m: 'drawerExternalLow',
  drawerInt_merivobox_e: 'drawerInternalHigh',
  drawerInt_merivobox_m: 'drawerInternalLow',
};
const SERVICE_ROW_ROLE = { cutting: 'cuttingService', edging: 'edgingService' };

// Etap L/N/O — wysokości REKOMENDOWANE per rola ('bottom'/'wall'/'mezzanine'/'tall'), z panelu
// "Wymiary wysokościowe kuchni" (Obszar 2) + ręcznych nadpisań (heightOverrides). Funkcja modułowa
// (nie metoda komponentu), żeby dało się ją wołać dwukrotnie w tym samym evencie: raz do SAMEGO
// renderu (`heightForRole`), raz wewnątrz setterów (Etap O, krok 1 — `syncHeightsFor` niżej) z
// JESZCZE NIE-zapisanymi `nextKitchenHeights`/`nextOverrides`, żeby zsynchronizować szafki w TYM
// SAMYM tyknięciu co zmianę panelu, nie klatkę później.
const resolveHeightForRole = (kitchenHeightsValue, overridesValue, hasMezzanine) => {
  const computed = computeKitchenHeights(kitchenHeightsValue);
  const recommended = {
    bottom: computed.bottomHeight,
    wall: hasMezzanine ? computed.wallHeightWithMezzanine : computed.wallZoneFull,
    tall: hasMezzanine ? computed.tallHeightWithMezzanine : computed.tallFullHeight,
    mezzanine: computed.mezzanineHeight,
  };
  return Object.fromEntries(Object.entries(recommended).map(([role, rec]) => (
    [role, overridesValue[role] !== undefined && overridesValue[role] !== null ? overridesValue[role] : rec]
  )));
};

export default function CabinetCalculator({
  materials, servicesList, projectMultiplier, onAddToProject, initialState, onStateChange, saveStatus, onClose,
}) {
  const fieldsetId = useId();
  const [activeCategory, setActiveCategory] = useState(() => initialState?.activeCategory || 'kitchen');
  const [modules, setModules] = useState(() => initialState?.modules || []);
  const [selection, setSelection] = useState(() => initialState?.selection || {});
  // Etap I, krok 2 — wybór płyty/kromki + 2 checkboxy ("Korpus/Obrzeże z płyty frontowej") PER
  // GRUPA (kluczowane przez BOARD_GROUPS), zamiast jednego globalnego `selection`. Kształt wartości:
  // { [groupKey]: { bodyMaterialId, frontMaterialId, edgeMaterialBodyId, edgeMaterialFrontId,
  //   bodyFromFront, edgeFromFront, inherit } }.
  const [boardsByKey, setBoardsByKey] = useState(() => initialState?.boards || {});
  // Etap L, krok 1 — panel "Wymiary wysokościowe kuchni" (sufit/blat/nogi/pas roboczy/antresola) —
  // nowy top-level klucz `heights` w calculator_state, obok modules/selection/boards.
  const [kitchenHeights, setKitchenHeights] = useState(() => ({ ...DEFAULT_KITCHEN_HEIGHTS, ...(initialState?.heights || {}) }));
  // Etap N, krok 2 — nadpisania "rozliczonych wysokości jarusów" (panel, Obszar 2): domyślnie `null`
  // = używa żywej wartości rekomendowanej (heightForRole/computedHeights), user może ją ręcznie
  // przestawić (np. żeby dodać kolejne szafki NIŻSZE niż rekomendacja), bez zmiany sufitu/blatu/nóg.
  const [heightOverrides, setHeightOverrides] = useState(() => initialState?.heightOverrides || {});
  // Etap O, krok 3 — kuchnia narożna L: 'simple' (1 ściana, domyślnie) albo 'corner_l' (ściana X +
  // prostopadła ściana Y) — sterownie wyborem "Układ ścian" w Obszarze 1. Etap AD, krok 2 — 2 nowe
  // warianty: 'corner_l_right' (druga ściana TYLKO z prawej, `wall: 'Y2'`) i 'u_layout' (OBIE naraz —
  // 'Y' z lewej + 'Y2' z prawej, układ U). `hasWallY`/`hasWallY2` to JEDYNE miejsce, które wie, KTÓRA
  // kombinacja layoutów ma którą ścianę — wszystko inne (tabela/rysunek/panel wymiarów) pyta TYLKO je.
  const [roomLayout, setRoomLayout] = useState(() => initialState?.roomLayout || 'simple');
  const hasWallY = roomLayout === 'corner_l' || roomLayout === 'u_layout';
  const hasWallY2 = roomLayout === 'corner_l_right' || roomLayout === 'u_layout';
  const isCornerLayout = hasWallY || hasWallY2;
  // Etap AD, krok 3 — "Szyb wentylacyjny / Słup": nieprzesuwalne elementy konstrukcyjne ściany
  // (nie szafki — brak materiałów/wyceny), każdy `{id, name, wall, xMm, widthMm, depthMm, heightMm}`.
  // Szafki na tej samej ścianie omijają ich odcinek [xMm, xMm+widthMm] (patrz advancePastPillars w
  // jądrze) — ten sam mechanizm w tabeli (layoutFloorBand/computeWallFreeSpace) i na rysunku.
  const [pillars, setPillars] = useState(() => initialState?.pillars || []);
  // Etap AD, krok 4 — punkt zerowy (0) per ściana ('left'/'right' róg, od którego liczy się
  // "Odległość od punktu 0" KAŻDEGO punktu instalacji tej ściany) + same punkty instalacji
  // (`{id, type: 'socket'|'led'|'water', wall, distanceMm, heightMm, description}`).
  const [zeroPoints, setZeroPoints] = useState(() => initialState?.zeroPoints || { X: 'left', Y: 'left', Y2: 'left' });
  const [installationPoints, setInstallationPoints] = useState(() => initialState?.installationPoints || []);
  const [settings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(initialState?.settings || {}) }));
  const [addedFlash, setAddedFlash] = useState(false);
  // Grupy bez żadnego dodanego modułu startują "zwinięte" (widoczna tylko szapka + przyciski
  // dodawania) — rozwijają się same, gdy dostaną 1. moduł, albo po kliknięciu nagłówka.
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  // Etap N, krok 3 — klik na szafce w WallElevationCanvas podświetla i przewija do jej wiersza w
  // tabeli (patrz useEffect niżej, przy renderModuleTable) — czysto wizualny stan UI, nie wchodzi
  // do calculator_state.
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  // Etap S, krok 1 — 5 grup kuchennych żyją teraz w JEDNYM kontenerze z zakładkami u góry (karuzela
  // slajdów) zamiast długiej pionowej wstęgi — który slajd jest aktywny to czysto wizualny stan UI,
  // nie wchodzi do calculator_state (jak selectedModuleId/canvasView).
  const [activeGroupKey, setActiveGroupKey] = useState(() => CATEGORY_GROUPS.kitchen[0].groupKey);
  // Etap T, krok 2 — DWIE karuzele (paleta u góry + tabela w prawej kolumnie) dzielą TEN SAM indeks,
  // żeby ich tory przesuwały się dokładnie razem — liczony raz, nie osobno w każdym torze.
  const activeGroupIndex = CATEGORY_GROUPS.kitchen.findIndex(entry => entry.groupKey === activeGroupKey);
  // Etap S, krok 1 (bonus) — klik na szafce NA RYSUNKU przełącza slajder na grupę tej szafki, nie
  // tylko podświetla/przewija do jej wiersza (patrz useEffect niżej) — użytkownik nie musi ręcznie
  // szukać właściwej zakładki.
  // Etap AA, krok 3 — zgłoszenie: klik na JUŻ wybranej (podświetlonej) szafce na rysunku otwiera
  // TERAZ od razu CabinetSettingsModal (ten sam modal co "⚙️" w wierszu) — pierwszy klik na jakiejś
  // INNEJ szafce tylko ją wybiera/podświetla (jak dotychczas, żeby nie otwierać modala przy zwykłym
  // przeglądaniu/eksploracji rysunku), DOPIERO drugi klik na TĘ SAMĄ, już aktywną szafkę traktujemy
  // jako jednoznaczny zamiar "pokaż mi szczegóły".
  const selectModuleFromCanvas = (moduleId) => {
    if (selectedModuleId === moduleId) {
      setSettingsModuleId(moduleId);
      return;
    }
    setSelectedModuleId(moduleId);
    const clickedModule = modules.find(module => module.id === moduleId);
    if (clickedModule) setActiveGroupKey(clickedModule.group);
  };
  // Etap T, krok 3 — podświetlenie NAVEDENIA (hover), osobne od "wybranego" (selectedModuleId, klik
  // — trwałe, przewija): dwustronne, synchroniczne między tabelą a rysunkiem w OBIE strony.
  const [hoveredModuleId, setHoveredModuleId] = useState(null);
  // Etap W, krok 2 — klik na "⚙️" dowolnego wiersza otwiera TERAZ jedno, wspólne, wyśrodkowane
  // modalne okno (CabinetSettingsModal, portal do document.body) zamiast wąskiego popoveru
  // zaczepionego o wiersz — trzyma się tylko ID szafki, liczone ŚWIEŻO z `modules` przy KAŻDYM
  // renderze (nie zapamiętane przy otwarciu), żeby moduł (i jego `wall`) nigdy nie
  // zdezaktualizował się po przestawieniu w trakcie otwartego modala. Czysto wizualny stan UI,
  // nie wchodzi do calculator_state (jak selectedModuleId/canvasView).
  const [settingsModuleId, setSettingsModuleId] = useState(null);
  // Etap O, krok 3 — przełącznik widoku rysunku (Widok X / Widok Y / Widok z góry) — czysto
  // wizualny stan UI, nie wchodzi do calculator_state (podobnie jak selectedModuleId).
  const [canvasView, setCanvasView] = useState('x');
  // Etap Q, krok 1 — panel "Wymiary ściany i wysokości" żyje teraz za GEAR-przyciskiem w nagłówku
  // (obok "Typ zabudowy"), zwinięty DOMYŚLNIE — czysto wizualny stan UI, nie wchodzi do calculator_state.
  const [heightsPanelExpanded, setHeightsPanelExpanded] = useState(false);
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedModuleId) return;
    panelRef.current?.querySelector?.(`[data-module-row="${selectedModuleId}"]`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selectedModuleId]);

  // Autozapis do projektu (projects.calculator_state) — debounce i status "✓ Zapisano w
  // projekcie" robi rodzic (ProjectModal, useProjectItemsAutosave); tu tylko zgłaszamy KAŻDĄ
  // zmianę stanu, pomijając pierwszy render (inicjalizację z initialState, nie trzeba zapisywać
  // tego, co właśnie wczytaliśmy z tego samego projektu).
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return; }
    onStateChangeRef.current?.({
      modules, selection, settings, boards: boardsByKey, activeCategory,
      heights: kitchenHeights, heightOverrides, roomLayout, pillars, zeroPoints, installationPoints,
    });
  }, [
    modules, selection, settings, boardsByKey, activeCategory, kitchenHeights, heightOverrides, roomLayout,
    pillars, zeroPoints, installationPoints,
  ]);

  // Komponenty zestawów (MERIVOBOX i inne, is_kit_component=true) nie są samodzielną pozycją —
  // kalkulator proponuje wyłącznie gotowe komplety do wyboru, nigdy ich boczki/mocowania osobno.
  const selectableMaterials = useMemo(() => (materials || []).filter(item => !item.is_kit_component), [materials]);
  // Słownik PEŁNEGO katalogu (nie przefiltrowanego per-rola) po String(id) — rozwiązuje materiały
  // per-grupa (bodyMaterialId itd. wstrzyknięte przez grupę) na konkretną pozycję katalogu w tabeli.
  const materialsById = useMemo(() => (
    new Map(selectableMaterials.map(item => [String(item.id), item]))
  ), [selectableMaterials]);
  const materialPools = useMemo(() => (
    Object.fromEntries(Object.entries(ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(selectableMaterials))]
    )))
  ), [selectableMaterials]);
  const boardPools = useMemo(() => (
    Object.fromEntries(Object.entries(BOARD_FIELDS).map(([field, config]) => (
      [field, sortCatalogByPriority(config.pool(selectableMaterials))]
    )))
  ), [selectableMaterials]);
  const servicePools = useMemo(() => (
    Object.fromEntries(Object.entries(SERVICE_ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(servicesList))]
    )))
  ), [servicesList]);

  const selectedId = (role, pools) => {
    const pool = pools[role] || [];
    const stored = selection[role];
    const storedIsValid = stored !== undefined && stored !== null && stored !== '' && Boolean(findInPool(pool, stored));
    if (storedIsValid) return stored;
    // Rola opcjonalna, jawnie wyczyszczona przez użytkownika (value="") — zostaje pusta, to
    // świadomy wybór "brak tego materiału w projekcie", nie błąd stanu do naprawienia.
    if (OPTIONAL_ROLES.has(role) && stored === '') return '';

    if (role === 'hingeSoftClose') {
      return suggestId(pool, undefined, c => preferByNameHints(c, SOFT_CLOSE_HINGE_HINTS));
    }
    if (role === 'hingeSpring') {
      return suggestId(pool, undefined, c => preferByNameHints(c, SPRING_HINGE_HINTS));
    }
    if (DRAWER_SIZE_ROLE_HINTS[role]) {
      return suggestId(pool, undefined, c => preferByAllNameHints(c, DRAWER_SIZE_ROLE_HINTS[role]));
    }
    return suggestId(pool);
  };
  const selectedItem = (role, pools, source) => findInPool(source, selectedId(role, pools)) || null;

  const setRole = (role, value) => setSelection(current => ({ ...current, [role]: value }));

  // Etap I, krok 2 — rozwiązuje łańcuch "Materiały grupy: Jak w..." do GRUPY, która faktycznie ma
  // własny wybór materiału (co najwyżej 2 poziomy: dolne/górne nigdy same nie dziedziczą, więc
  // pętla nie może zapętlić się w nieskończoność — depth to tylko zabezpieczenie).
  const resolveBoardGroupKey = (groupKey, depth = 0) => {
    const config = BOARD_GROUPS[groupKey];
    if (!config?.inheritOptions || depth > 3) return groupKey;
    const board = boardsByKey[groupKey] || {};
    const inherit = board.inherit || config.inheritOptions[0].value;
    if (inherit === 'own') return groupKey;
    const targetKey = inherit === 'dolne' ? 'kitchen_bottom' : 'kitchen_top';
    if (targetKey === groupKey) return groupKey;
    return resolveBoardGroupKey(targetKey, depth + 1);
  };

  // Jak selectedId, ale per-grupa (z rozwiązaniem dziedziczenia) i tylko dla 4 pól płyty/kromki.
  const effectiveBoardId = (groupKey, field) => {
    const resolvedKey = resolveBoardGroupKey(groupKey);
    const pool = boardPools[field] || [];
    const stored = (boardsByKey[resolvedKey] || {})[field];
    const storedIsValid = stored !== undefined && stored !== null && stored !== '' && Boolean(findInPool(pool, stored));
    if (storedIsValid) return stored;
    if (field === 'bodyMaterialId' || field === 'edgeMaterialBodyId') {
      return suggestId(pool, undefined, c => preferByNameHints(c, WHITE_HINTS));
    }
    if (field === 'frontMaterialId') {
      return suggestId(pool, effectiveBoardId(groupKey, 'bodyMaterialId'), c => avoidByNameHints(c, WHITE_HINTS));
    }
    if (field === 'edgeMaterialFrontId') {
      return suggestId(pool, effectiveBoardId(groupKey, 'edgeMaterialBodyId'), c => avoidByNameHints(c, WHITE_HINTS));
    }
    return suggestId(pool);
  };
  const effectiveBoardFlag = (groupKey, field) => Boolean((boardsByKey[resolveBoardGroupKey(groupKey)] || {})[field]);

  const setBoardField = (groupKey, field, value) => setBoardsByKey(current => ({
    ...current, [groupKey]: { ...(current[groupKey] || {}), [field]: value },
  }));
  const toggleBoardFlag = (groupKey, field) => setBoardField(groupKey, field, !(boardsByKey[groupKey] || {})[field]);

  // Etap Q, krok 1 — krótki podpis dekoru ("W960 / H1367") na przycisku "⚙️ Materiały", żeby bez
  // rozwijania panelu było widać, CZY grupa ma już sensowny wybór płyty. Bierze pierwszy kod
  // dekoru (litera(y) + 2-4 cyfry) z nazwy Płyty korpusu i Płyty frontu; identyczne kody (korpus
  // i front z tej samej płyty) pokazują się tylko raz.
  const groupDecorHint = (groupKey) => {
    const bodyName = materialsById.get(String(effectiveBoardId(groupKey, 'bodyMaterialId')))?.name;
    const frontName = materialsById.get(String(effectiveBoardId(groupKey, 'frontMaterialId')))?.name;
    const codes = [decorCodeFromName(bodyName), decorCodeFromName(frontName)].filter(Boolean);
    return [...new Set(codes)].join(' / ');
  };

  // Etap Q, krok 1 — panel materiałów grupy żyje teraz za WŁASNYM gear-przyciskiem ("⚙️ Materiały")
  // w nagłówku grupy, zwinięty DOMYŚLNIE — usunięte dawne auto-rozwinięcie "grupa ma już moduł"
  // (moduleCountForGroup(groupKey) > 0), żeby panel kalkulatora został kompaktowy nawet z wieloma
  // dodanymi szafkami.
  const isGroupMaterialsExpanded = (groupKey) => expandedGroups.has(groupKey);
  const toggleGroupExpanded = (groupKey) => setExpandedGroups((current) => {
    const next = new Set(current);
    if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
    return next;
  });

  // Etap L, krok 1 — wysokości REKOMENDOWANE per rola ('bottom'/'wall'/'mezzanine'/'tall'), z
  // panelu "Wymiary wysokościowe kuchni". "Górne"/"słupki" są krótsze o wysokość antresoli TYLKO
  // gdy projekt ma już choć 1 moduł w grupie kitchen_mezzanine — bez niej liczy się pełna wysokość
  // pod sufit.
  const hasMezzanineModules = modules.some(module => module.group === 'kitchen_mezzanine');
  const heightForRole = resolveHeightForRole(kitchenHeights, heightOverrides, hasMezzanineModules);

  // Etap O, krok 1 — reaktywna synchronizacja wysokości, BEZ efektu (pętla setState-w-efekcie jest
  // niezalecana — patrz "You Might Not Need an Effect"): każdy SETTER, który może zmienić żywą
  // rekomendację (pole panelu, ręczne nadpisanie Obszaru 2, DODANIE/USUNIĘCIE modułu — to ostatnie
  // zmienia `hasMezzanineModules`!), od razu w TYM SAMYM evencie doklei wywołanie syncModuleHeights
  // (jądro) z PRZYSZŁYM stanem (jeszcze nie zapisanym przez poprzedni setState w tej samej funkcji).
  // Szafka z `customHeight: true` (patrz patchModuleHeight) jest przez syncModuleHeights pomijana.
  const syncHeightsFor = (list, nextKitchenHeights = kitchenHeights, nextOverrides = heightOverrides) => {
    const hasMezzanine = list.some(module => module.group === 'kitchen_mezzanine');
    return syncModuleHeights(list, resolveHeightForRole(nextKitchenHeights, nextOverrides, hasMezzanine));
  };
  const setKitchenHeightField = (field, value) => {
    const nextHeights = { ...kitchenHeights, [field]: Math.max(0, Number(value) || 0) };
    setKitchenHeights(nextHeights);
    setModules(current => syncHeightsFor(current, nextHeights, heightOverrides));
  };
  const setHeightOverride = (role, value) => {
    const nextOverrides = { ...heightOverrides, [role]: Math.max(0, Number(value) || 0) };
    setHeightOverrides(nextOverrides);
    setModules(current => syncHeightsFor(current, kitchenHeights, nextOverrides));
  };
  // Jedyne pozostałe zadanie tego przycisku: zdjąć `customHeight` ze WSZYSTKICH zablokowanych
  // szafek i od razu zsynchronizować ich wysokość z bieżącą rekomendacją.
  const resetAllCustomHeights = () => setModules((current) => {
    const cleared = current.map(module => (module.customHeight ? { ...module, customHeight: false } : module));
    return syncHeightsFor(cleared);
  });
  // Etap O, krok 1 — ręczna edycja "Wys. (mm)" w wierszu tabeli BLOKUJE tę jedną szafkę
  // (`customHeight: true`) — reaktywna synchronizacja wyżej już jej nie dotyka, dopóki user nie
  // kliknie "↺" przy tej konkretnej szafce (resetModuleHeight).
  const patchModuleHeight = (id, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, H: Math.max(0, Number(value) || 0), customHeight: true } : module
  )));
  const resetModuleHeight = (id) => setModules((current) => {
    const cleared = current.map(module => (module.id === id ? { ...module, customHeight: false } : module));
    return syncHeightsFor(cleared);
  });

  // Etap N/O — szerokość ściany zajęta przez najszerszy rząd kuchni (dolne/górne/antresole/słupki),
  // osobno dla ściany X i (w układzie narożnym L) ściany Y — wskaźnik "Zajęte" (Obszar 1), rysunek
  // WallElevationCanvas i widok z góry liczą z TEGO SAMEGO źródła (computeWallFreeSpace, jądro), żeby
  // liczby nigdy nie mogły się rozjechać. `cornerDepthMm` = głębokość blatu (narożnik "zjada" tyle
  // samo miejsca na ścianie Y, ile blat wystaje w róg).
  const wallFreeSpace = computeWallFreeSpace(modules, {
    wallXWidthMm: kitchenHeights.wallWidthMm,
    wallYWidthMm: kitchenHeights.wallYWidthMm,
    wallY2WidthMm: kitchenHeights.wallY2WidthMm,
    layout: roomLayout,
    cornerDepthMm: kitchenHeights.countertopDepthMm,
    cornerDepth2Mm: kitchenHeights.countertopDepthMm,
    pillars,
  });

  // Etap I, krok 3 — wiele presetów dzieli JEDEN typ bazowy (np. "Antresola" i "Szafka nad okap"
  // to oba wall_cabinet, tylko z innymi wymiarami domyślnymi) — bez zapisania własnej etykiety/
  // ikony presetu na module, karta pokazałaby zawsze generyczną nazwę typu (CABINET_MODULE_TYPES
  // [type].label), nie tę, którą user faktycznie kliknął. Etap L, krok 1 — `heightRole` (jeśli
  // preset je ma) wstrzykuje ŻYWĄ rekomendowaną wysokość zamiast zahardkodowanego H typu/presetu.
  // Etap N, krok 3 — `insertAt` (opcjonalny indeks WEWNĄTRZ grupy) pozwala wstawić nowy moduł w
  // KONKRETNE miejsce rzędu, nie tylko na koniec — używane przez WallElevationCanvas (przeciągnięcie
  // kafelka presetu na rysunek, upuszczone w konkretnym punkcie X danego rzędu). Klik na kafelku
  // (bez insertAt) zachowuje dawne zachowanie — dopisanie na koniec grupy.
  const addModule = ({ category, group, type, label, icon, heightRole, overrides, insertAt, wall }) => {
    const newModule = {
      id: nextModuleId(),
      category,
      group,
      label,
      icon,
      heightRole,
      // Etap O, krok 3 — przeciągnięcie presetu na "Widok Y" rysunku dodaje szafkę od razu na
      // ścianie Y (patrz WallElevationCanvas.handleDrop); klik na kafelku (bez `wall`) i reszta
      // ścieżek dodawania zostają na domyślnej ścianie X (effectiveModuleWall traktuje `undefined`
      // identycznie jak jawne 'X').
      ...(wall ? { wall } : {}),
      ...createCabinetModule(type, heightRole ? { ...overrides, H: heightForRole[heightRole] } : overrides),
    };
    setModules((current) => {
      let next;
      if (insertAt === undefined || insertAt === null) {
        next = [...current, newModule];
      } else {
        // Etap U, krok 3 — Dolne+Słupki dzielą JEDEN wspólny rząd (patrz layoutFloorBand w jądrze);
        // `insertAt` upuszczony na rysunku (WallElevationCanvas.handleDrop) to pozycja w TYM
        // wspólnym rzędzie, nie w samej grupie `group` — indeksy muszą więc patrzeć na OBIE grupy
        // razem (na tej samej ścianie), inaczej upuszczenie słupka "między" dwiema szafkami dolnymi
        // ignorowało realną pozycję i zawsze lądowało na końcu.
        const newModuleWall = newModule.wall === 'Y' ? 'Y' : 'X';
        const matchesSlot = FLOOR_BAND_GROUPS.includes(group)
          ? module => FLOOR_BAND_GROUPS.includes(module.group) && (module.wall === 'Y' ? 'Y' : 'X') === newModuleWall
          : module => module.group === group;
        const groupIndices = [];
        current.forEach((module, index) => { if (matchesSlot(module)) groupIndices.push(index); });
        if (insertAt >= groupIndices.length) {
          next = [...current, newModule];
        } else {
          const absoluteIndex = groupIndices[insertAt];
          next = [...current.slice(0, absoluteIndex), newModule, ...current.slice(absoluteIndex)];
        }
      }
      // Dodanie PIERWSZEGO modułu do kitchen_mezzanine zmienia zalecaną wysokość górnych/słupków
      // (patrz hasMezzanineModules) — zsynchronizuj resztę od razu, nie dopiero po następnej zmianie
      // panelu wysokości.
      return syncHeightsFor(next);
    });
  };
  // Usunięcie OSTATNIEGO modułu z kitchen_mezzanine MA analogiczny efekt odwrotny — stąd też
  // syncHeightsFor, nie goły filter.
  const removeModule = (id) => setModules(current => syncHeightsFor(current.filter(module => module.id !== id)));
  // Etap Q, krok 4 — zastępuje usuniętą kolumnę "Ilość": klon tego samego modułu (nowe `id`), wstawiony
  // TUŻ PO oryginale w pełnej liście `modules` — to wystarczy, żeby trafił do tej samej grupy/ściany,
  // zaraz obok źródła, niezależnie od tego, gdzie w tablicy leżą inne grupy.
  const duplicateModule = (id) => setModules((current) => {
    const index = current.findIndex(module => module.id === id);
    if (index === -1) return current;
    const clone = { ...current[index], id: nextModuleId() };
    return syncHeightsFor([...current.slice(0, index + 1), clone, ...current.slice(index + 1)]);
  });
  // Etap AB, krok 4 — zgłoszenie: "◀ Przesuń w lewo"/"Przesuń w prawo ▶" usunięte z footera modala
  // (nieużywane — przestawianie przez canvas drag&drop pokrywa Kuchnię). `reorderModuleInGroup`
  // (dawny fallback dla kategorii BEZ rysunku — Szafa/Łazienka/RTV — patrz .calculatorLayout niżej,
  // te kategorie nie mają WallElevationCanvas) nie ma już żadnego wywołującego — usunięte jako
  // martwy kod. UWAGA: te 3 kategorie zostają bez JAKIEGOKOLWIEK mechanizmu przestawiania kolejności
  // modułów do czasu, aż dostaną własny canvas albo inny zamiennik.
  // Etap P, krok 3 — kuchnia narożna L: tabela grupuje wiersze PER ŚCIANA (X blok, potem Y blok,
  // patrz renderModuleTable) — strzałki ◀/▶ muszą więc przestawiać WEWNĄTRZ tego samego bloku
  // ściany, nie całej (mieszanej X+Y) grupy, inaczej kliknięcie "▶" na ostatniej szafce bloku X
  // przeskoczyłoby ją w sam środek bloku Y na ekranie bez żadnej wizualnej zapowiedzi.
  const reorderModuleInWall = (groupKey, wall, fromIndex, toIndex) => setModules((current) => {
    const wallIndices = [];
    current.forEach((module, index) => { if (module.group === groupKey && effectiveModuleWall(module) === wall) wallIndices.push(index); });
    if (fromIndex < 0 || fromIndex >= wallIndices.length || toIndex < 0 || toIndex >= wallIndices.length) return current;
    const wallModules = wallIndices.map(index => current[index]);
    const reordered = reorderItems(wallModules, fromIndex, toIndex);
    const next = [...current];
    wallIndices.forEach((absoluteIndex, position) => { next[absoluteIndex] = reordered[position]; });
    return next;
  });
  // Etap U, krok 3 — Dolne (kitchen_bottom) + Słupki (kitchen_tall) na TEJ SAMEJ ścianie dzielą
  // JEDEN wspólny napodłogowy rząd (patrz layoutFloorBand w jądrze) — przestawianie (strzałki ◀/▶
  // w tabeli, przeciąganie myszką na rysunku) musi więc działać na OBU grupach razem, pozwalając
  // postawić Słupek na początku, na końcu albo między dowolnymi szafkami dolnymi.
  const reorderFloorBand = (wall, fromIndex, toIndex) => setModules((current) => {
    const bandIndices = [];
    current.forEach((module, index) => {
      if (FLOOR_BAND_GROUPS.includes(module.group) && effectiveModuleWall(module) === wall) bandIndices.push(index);
    });
    if (fromIndex < 0 || fromIndex >= bandIndices.length || toIndex < 0 || toIndex >= bandIndices.length) return current;
    const bandModules = bandIndices.map(index => current[index]);
    const reordered = reorderItems(bandModules, fromIndex, toIndex);
    const next = [...current];
    bandIndices.forEach((absoluteIndex, position) => { next[absoluteIndex] = reordered[position]; });
    return next;
  });
  // Etap U, krok 3 — jedno wejście dla WallElevationCanvas: "kitchen_floor" (syntetyczny klucz
  // wspólnego rzędu Dolne+Słupki, patrz WallElevationCanvas.jsx) idzie do reorderFloorBand, każda
  // inna grupa (Górne/Antresole) do reorderModuleInWall — ZAWSZE per ścianę (wall wstrzykuje sam
  // rysunek, wie, którą aktualnie pokazuje), żeby przestawianie w kuchni narożnej L nigdy nie
  // mieszało szafek z obu ścian (dawny bug — reorderModuleInGroup ignorował wall przy drag&drop).
  const reorderFromCanvas = (groupKey, fromIndex, toIndex, wall) => (
    groupKey === 'kitchen_floor'
      ? reorderFloorBand(wall, fromIndex, toIndex)
      : reorderModuleInWall(groupKey, wall, fromIndex, toIndex)
  );
  const patchModule = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: Math.max(0, Number(value) || 0) } : module
  )));
  const setModuleField = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: value } : module
  )));
  // Etap O, krok 3 — przełącznik "Ściana: X|Y" per szafka (kuchnia narożna L); domyślnie 'X'
  // (effectiveModuleWall, nie goły `module.wall`, bo stare calculator_state sprzed tego pola ma je
  // `undefined` — ma się zachowywać identycznie jak jawne 'X', nie jak "brak ściany"). Etap AD,
  // krok 2 — teraz tylko cienki alias na współdzieloną `normalizeModuleWall` (jądro), która zna też
  // `'Y2'` (druga ściana Y, z prawej — Narożny L z prawej / Układ U).
  const effectiveModuleWall = (module) => normalizeModuleWall(module);
  const setModuleWall = (id, wall) => setModuleField(id, 'wall', wall);

  // Etap AD, krok 3 — "+ Dodaj szyb / słup konstrukcyjny": domyślnie 600×600mm w rogu (x=0) ściany X,
  // wysoki na cały bieżący sufit (user może go później obniżyć, np. dla niskiego krótkiego krótkiego
  // szybu — stąd zwykłe, niereaktywne pole, nie "żywa" rekomendacja jak heightForRole).
  const addPillar = () => setPillars(current => [...current, {
    id: nextModuleId(), name: 'Szyb wentylacyjny', wall: 'X', xMm: 0, widthMm: 600, depthMm: 600,
    heightMm: Math.round(Number(kitchenHeights.ceilingHeight) || 2600),
  }]);
  const patchPillarField = (id, field, value) => setPillars(current => current.map(pillar => (
    pillar.id === id ? { ...pillar, [field]: field === 'name' || field === 'wall' ? value : Math.max(0, Number(value) || 0) } : pillar
  )));
  const removePillar = (id) => setPillars(current => current.filter(pillar => pillar.id !== id));
  const pillarsForWall = (wall) => pillars.filter(pillar => (pillar.wall === 'Y' || pillar.wall === 'Y2' ? pillar.wall : 'X') === wall);

  // Etap AD, krok 4 — "+ Dodaj punkt instalacji": domyślna wysokość H zależy od typu (gniazdko na
  // fartuchu/1100mm, LED pod szafkami górnymi/1520mm, woda pod zlewem/550mm) — user i tak może ją
  // dowolnie zmienić (np. gniazdko w cokole pod piekarnik/PMM na 300mm).
  const INSTALLATION_POINT_DEFAULTS = {
    socket: { label: '⚡ Gniazdko 230V / Siła', heightMm: 1100 },
    led: { label: '💡 Punkt LED / zasilacz', heightMm: 1520 },
    water: { label: '💧 Woda + odpływ (kan.)', heightMm: 550 },
  };
  const addInstallationPoint = () => setInstallationPoints(current => [...current, {
    id: nextModuleId(), type: 'socket', wall: 'X', distanceMm: 0,
    heightMm: INSTALLATION_POINT_DEFAULTS.socket.heightMm, description: '',
  }]);
  const patchInstallationPointField = (id, field, value) => setInstallationPoints(current => current.map((point) => {
    if (point.id !== id) return point;
    if (field === 'wall' || field === 'description') return { ...point, [field]: value };
    if (field === 'type') return { ...point, type: value, heightMm: INSTALLATION_POINT_DEFAULTS[value]?.heightMm ?? point.heightMm };
    return { ...point, [field]: Math.max(0, Number(value) || 0) };
  }));
  const removeInstallationPoint = (id) => setInstallationPoints(current => current.filter(point => point.id !== id));
  const setZeroPointSide = (wall, side) => setZeroPoints(current => ({ ...current, [wall]: side }));
  // hdfInGroove osobno: stary moduł z calculator_state sprzed tej funkcji ma to pole `undefined`,
  // ale efektywnie liczy się jak domyślne dla typu (patrz effectiveHdfInGroove) — zwykłe `!module
  // [field]` negowałoby `undefined` zamiast tego, co user WIDZI na checkboxie, i checkbox wizualnie
  // by się nie zmienił po kliknięciu dla takiego modułu.
  const toggleHdfInGroove = (id) => setModules(current => current.map(module => (
    module.id === id ? { ...module, hdfInGroove: !effectiveHdfInGroove(module) } : module
  )));
  const toggleInternalDrawer = (id) => setModules(current => current.map((module) => {
    if (module.id !== id) return module;
    const hasInternal = Number(module.internalDrawersHigh) > 0 || Number(module.internalDrawersLow) > 0;
    return hasInternal
      ? { ...module, internalDrawersHigh: 0, internalDrawersLow: 0 }
      : { ...module, internalDrawersHigh: 0, internalDrawersLow: 1 };
  }));
  // Etap G, krok 3 — wybór presetu "Układ szuflad" od razu ZAPISUJE konkretne liczniki
  // (externalDrawersHigh/Low, i dla "1 wysoka + 1 wewn." internalDrawersLow) na module — jądro nie
  // musi w ogóle wiedzieć o presetach. "wlasny" niczego nie nadpisuje, tylko odkrywa ręczne liczniki.
  const applyDrawerPreset = (id, presetValue) => setModules(current => current.map((module) => {
    if (module.id !== id) return module;
    if (presetValue === 'wlasny') return { ...module, drawerPreset: 'wlasny' };
    const preset = DRAWER_PRESET_OPTIONS.find(option => option.value === presetValue);
    if (!preset?.apply) return module;
    return { ...module, drawerPreset: presetValue, ...preset.apply };
  }));
  // Etap V, krok 2 — wybór standardu lodówki (⚙️ "Standard lodówki do zabudowy") nadpisuje
  // W/D/fridgeNicheHeightMm NARAZ (np. XXL 75cm zmienia szerokość szafki z 600 na 750mm) — ten sam
  // wzorzec co applyDrawerPreset, tylko dane (FRIDGE_STANDARD_OPTIONS) żyją w jądrze, nie tutaj.
  const applyFridgeStandard = (id, standardValue) => setModules(current => current.map((module) => {
    if (module.id !== id) return module;
    const standard = FRIDGE_STANDARD_OPTIONS.find(option => option.value === standardValue);
    if (!standard) return module;
    return {
      ...module, fridgeStandard: standardValue, W: standard.W, D: standard.D, fridgeNicheHeightMm: standard.fridgeNicheHeightMm,
    };
  }));

  // Nie ma sensu memoizować — to kilka odczytów pola .price, tańsze niż porównywanie deps.
  // selections idzie wprost do buildCabinetCostBreakdown — on jest jedynym źródłem sum, żeby
  // główny wiersz "Orientacyjna wycena" i tabela nigdy nie mogły się rozjechać przez dwa
  // niezależne sposoby liczenia.
  const selections = {
    hingeSoftClose: selectedItem('hingeSoftClose', materialPools, materials),
    hingeSpring: selectedItem('hingeSpring', materialPools, materials),
    drawerExternalHigh: selectedItem('drawerExternalHigh', materialPools, materials),
    drawerExternalLow: selectedItem('drawerExternalLow', materialPools, materials),
    drawerInternalHigh: selectedItem('drawerInternalHigh', materialPools, materials),
    drawerInternalLow: selectedItem('drawerInternalLow', materialPools, materials),
    legFront: selectedItem('legFront', materialPools, materials),
    legRearAxilo: selectedItem('legRearAxilo', materialPools, materials),
    hdfMaterial: selectedItem('hdfMaterial', materialPools, materials),
    hangerMaterial: selectedItem('hangerMaterial', materialPools, materials),
    handleMaterial: selectedItem('handleMaterial', materialPools, materials),
    tipOnMaterial: selectedItem('tipOnMaterial', materialPools, materials),
    hafeleProfileMaterial: selectedItem('hafeleProfileMaterial', materialPools, materials),
    countertop: selectedItem('countertop', materialPools, materials),
    cuttingService: selectedItem('cuttingService', servicePools, servicesList),
    edgingService: selectedItem('edgingService', servicePools, servicesList),
  };
  // Etap F, krok 4 — bucket 'merivobox_e'/'merivobox_m' wycenia się WYBRANĄ przez użytkownika
  // pozycją (Szuflada zewn./wewn. wysoka/niska), nie ślepym wyszukiwaniem po katalogu. 'tandem' nie
  // ma własnego selecta (to tylko wymuszenie per moduł w jądrze, bez UI od Etapu I) — zostaje
  // niezależnym wyszukiwaniem po nazwie. 'inherit' już nigdy nie dostaje niezerowej ilości, więc
  // jego wartość tutaj nie ma znaczenia.
  const externalDrawerByType = {
    inherit: selections.drawerExternalLow,
    merivobox_e: selections.drawerExternalHigh,
    merivobox_m: selections.drawerExternalLow,
    tandem: findDrawerMaterial(selectableMaterials, 'tandem', 'external'),
  };
  const internalDrawerByType = {
    inherit: selections.drawerInternalLow,
    merivobox_e: selections.drawerInternalHigh,
    merivobox_m: selections.drawerInternalLow,
  };
  const breakdownSelections = { ...selections, externalDrawerByType, internalDrawerByType, materialsById };

  // Geometria короba szuflady zależy od tego, CO wybrano (MERIVOBOX/TANDEMBOX/LEGRABOX = gotowy
  // metalowy bок, inaczej = drewniany korpus na zwykłych prowadnicach) — to ustawienie
  // kalkulatora, nie pojedynczego modułu, stąd liczone tu i przekazywane jako options. Domyślne
  // wysokie (E) zawsze wskazują na MERIVOBOX (metal) — stąd system wykrywamy po "wysokiej" roli.
  const externalDrawerSystem = detectDrawerSystem(selections.drawerExternalHigh?.name);
  const internalDrawerSystem = detectDrawerSystem(selections.drawerInternalHigh?.name);
  const drawerSystemOptions = { externalDrawerSystem, internalDrawerSystem };
  const summaryOptions = { ...drawerSystemOptions, ...settings };

  // Etap I, krok 4 — przed podsumowaniem wstrzykujemy do KAŻDEGO modułu materiał/checkboxy płyty
  // rozwiązane z GRUPY, do której należy (z uwzględnieniem dziedziczenia "Jak w: ..."). Dzięki temu
  // jądro (summarizeCabinetModules) grupuje płytę/kromkę po REALNYM materialId — dwie grupy z
  // różnym dekorem frontu automatycznie dają dwa osobne wiersze w tabeli (patrz ADR-010, Etap I).
  // Blat (kitchen_countertop) nie ma żadnej płyty/kromki (countertop.build() zwraca panels: []),
  // więc nie ma sensu (i nie ma czego) wstrzykiwać dla niego materiału grupy.
  const effectiveModules = modules.map((module) => {
    if (!BOARD_GROUPS[module.group]) return module;
    return {
      ...module,
      bodyMaterialId: effectiveBoardId(module.group, 'bodyMaterialId'),
      frontMaterialId: effectiveBoardId(module.group, 'frontMaterialId'),
      edgeMaterialBodyId: effectiveBoardId(module.group, 'edgeMaterialBodyId'),
      edgeMaterialFrontId: effectiveBoardId(module.group, 'edgeMaterialFrontId'),
      bodyFromFront: effectiveBoardFlag(module.group, 'bodyFromFront'),
      edgeFromFront: effectiveBoardFlag(module.group, 'edgeFromFront'),
    };
  });
  // Etap Q, krok 2 — blendy/cokół to teraz ZWYKŁE moduły (side_filler/top_filler/plinth_strip),
  // więc ich m²/mb wchodzą do summary przez TEN SAM effectiveModules/summarizeCabinetModules co
  // reszta projektu — nie trzeba już dokleić ich osobno (było: applyTrimsToSummary/computeTrims).
  const summary = summarizeCabinetModules(effectiveModules, summaryOptions);
  // Etap N, krok 4 — "tymczasowo" bez osprzętu: zob. komentarz przy buildCabinetCostBreakdown
  // (jądro) — jedna flaga, łatwa do odwrócenia, gdy osprzęt wróci do kalkulatora.
  // Etap AA, krok 4 — PIERWSZY etap powrotu: nóżki meblowe + komplety szuflad (prowadnice) wracają
  // do rozliczenia teraz; reszta osprzętu (zawiasy/zawieszki/uchwyty/TIP-ON/profil HAFELE) zostaje
  // schowana (`includeHardware: false`) do kolejnego etapu.
  const breakdown = buildCabinetCostBreakdown(summary, breakdownSelections, projectMultiplier, {
    includeHardware: false, includeLegs: true, includeDrawerSets: true,
  });
  const wycena = breakdown.wycena;

  // breakdown.materialRows/serviceRows to JEDYNE źródło pozycji — zgrupowane po konkretnym
  // materialId, więc tabela i "Dodaj do projektu" nigdy nie mogą się rozjechać. Kromka zamawiana
  // jest w pełnych metrach (zaokrąglenie w górę) — w samej wycenie liczy się dokładnie, do 2 miejsc.
  const handleAddToProject = () => {
    const materialLines = breakdown.materialRows
      .filter(row => row.item)
      .map(row => ({ item: row.item, quantity: row.key.startsWith('edge') ? Math.ceil(row.quantity) : row.quantity }))
      .filter(line => line.quantity > 0);
    const serviceLines = breakdown.serviceRows
      .filter(row => row.item && row.quantity > 0)
      .map(row => ({ item: row.item, quantity: row.quantity }));

    if (materialLines.length === 0 && serviceLines.length === 0) return;
    onAddToProject({ materialLines, serviceLines });
    setAddedFlash(true);
    window.setTimeout(() => setAddedFlash(false), 2000);
  };

  const hasAnyHardwareToAdd = summary.bodySheets > 0 || summary.frontSheets > 0
    || summary.edgeMeters > 0 || summary.hinges > 0 || summary.externalDrawerSets > 0 || summary.internalDrawerSets > 0
    || summary.countertopMeters > 0 || summary.hdfSheets > 0 || summary.frontLegs > 0 || summary.hangers > 0
    || summary.tipOnUnits > 0 || summary.handleUnits > 0 || summary.hafeleProfileMeters > 0;

  const saveStatusText = saveStatus === 'saving' ? '⏳ Zapisywanie…'
    : saveStatus === 'error' ? '⚠ Błąd zapisu w projekcie'
    : saveStatus === 'saved' ? '✓ Zapisano w projekcie'
    : null;

  // Etap H, krok 1 / Etap I, krok 4 — komórka "Wybrany materiał"/"Wybrana pozycja": żywy
  // SearchableMaterialSelect dla wierszy osprzętu/usług (patrz MATERIAL_ROW_ROLE/SERVICE_ROW_ROLE),
  // zwykły tekst dla wierszy płyty/kromki (ich materiał wybiera się w nagłówku GRUPY, nie w tabeli).
  const materialRowCell = (row) => {
    const role = MATERIAL_ROW_ROLE[row.key];
    if (!role) return row.item?.name || <span className={s.muted}>— nie wybrano —</span>;
    return (
      <SearchableMaterialSelect
        items={materialPools[role]}
        value={selectedId(role, materialPools)}
        onChange={value => setRole(role, value)}
        ariaLabel={ROLE_OPTIONS[role]?.label || row.label}
      />
    );
  };
  const serviceRowCell = (row) => {
    const role = SERVICE_ROW_ROLE[row.key];
    if (!role) return row.item?.name || <span className={s.muted}>— nie wybrano —</span>;
    return (
      <SearchableMaterialSelect
        items={servicePools[role]}
        value={selectedId(role, servicePools)}
        onChange={value => setRole(role, value)}
        ariaLabel={SERVICE_ROLE_OPTIONS[role]?.label || row.label}
      />
    );
  };


  // Etap M, krok 2 — jeden wiersz tabeli dodanych szafek (zastępuje dawną kartę .moduleRow z Etapu
  // J): te same dane, ale bez powtarzania etykiet "Szer./Wys./Gł./Ilość" w każdej karcie — szapka
  // kolumn tabeli (patrz renderBoardGroupSection/renderCountertopSection) żyje tylko raz na grupę.
  // Etap P, krok 3 — `onReorder`/`wall` wstrzykuje WOŁAJĄCY (renderModuleTable): w kuchni narożnej L
  // to wall-scoped reorderModuleInWall (strzałki przestawiają WEWNĄTRZ bloku tej samej ściany, nie
  // całej mieszanej grupy X+Y), w prostym układzie — zwykły reorderModuleInGroup jak dawniej.
  const renderModuleTableRow = (module, wall) => {
    const definition = CABINET_MODULE_TYPES[module.type];
    const fields = moduleFieldsFor(module);
    const displayLabel = module.label || definition.label;
    const displayIconSlug = module.icon || CABINET_MODULE_TYPE_ICON[module.type];
    const perUnit = computeModule(module, resolveModuleDrawerSystems(module, drawerSystemOptions));
    const qty = Math.max(0, Number(module.qty) || 0);
    const edgeMb = (perUnit.bodyEdgeMeters + perUnit.frontEdgeMeters) * qty;
    // Etap P, krok 3 — podświetl wiersz lekkim tonem, kiedy jego ściana jest TĄ, którą właśnie
    // pokazuje rysunek (Widok X/Widok Y) — tylko w układzie narożnym (inaczej "ściana" nic nie znaczy).
    // Etap AD, krok 2 — 'y2' (rysunek) <-> 'Y2' (ściana) dochodzi obok istniejącej pary x/X, y/Y.
    const isActiveWallView = isCornerLayout && (
      (canvasView === 'x' && wall === 'X') || (canvasView === 'y' && wall === 'Y') || (canvasView === 'y2' && wall === 'Y2')
    );
    // Etap U, krok 1 — tabela pokazuje TERAZ wszystkie podrozdziały naraz (patrz
    // renderUnifiedKitchenTable); zakładka u góry nie filtruje już wierszy, tylko PODŚWIETLA te,
    // które należą do jej grupy (`activeGroupKey`) — osobno od "wybranego"/"najechanego" elementu
    // (selectedModuleId/hoveredModuleId, patrz Etap T). Klik na wierszu INNEJ grupy przełącza
    // zakładkę na jego grupę (tylko kuchnia — activeGroupKey trzyma zawsze klucz kuchennej grupy,
    // patrz KITCHEN_GROUP_KEYS).
    const isActiveGroupRow = activeGroupKey === module.group;

    return (
      <tr
        key={module.id}
        data-module-row={module.id}
        data-row-group={module.group}
        className={[
          selectedModuleId === module.id && s.rowHighlighted,
          hoveredModuleId === module.id && s.rowHovered,
          isActiveWallView && s.wallRowActive,
          isActiveGroupRow && s.rowActiveGroup,
        ].filter(Boolean).join(' ') || undefined}
        onClick={() => {
          setSelectedModuleId(module.id);
          if (KITCHEN_GROUP_KEYS.includes(module.group)) setActiveGroupKey(module.group);
        }}
        onMouseEnter={() => setHoveredModuleId(module.id)}
        onMouseLeave={() => setHoveredModuleId(current => (current === module.id ? null : current))}
      >
        <td data-label="Moduł">
          <div className={s.moduleCellInner}>
            {/* Etap AA, krok 2 — zgłoszenie: kolumna ▲/▼ myliła ("stale sugerowała, że to JEDYNY
                sposób przestawiania") i zabierała miejsce nazwie — w kuchni przestawianie żyje
                teraz na rysunku (drag&drop, WallElevationCanvas); Etap AB, krok 4 — modal stracił
                swoje "Przesuń" (nieużywane), więc Szafa/Łazienka/RTV (kategorie bez rysunku) nie
                mają już żadnego zamiennika — patrz komentarz przy usuniętym reorderModuleInGroup. */}
            <span className={s.cardHeaderIcon}><CabinetModuleIcon slug={displayIconSlug} /></span>
            <span className={s.moduleName}>{displayLabel}</span>
          </div>
        </td>
        {wallToggleOptionsFor(roomLayout).length > 0 && (
          <td data-label="Ściana">
            <div className={s.wallToggle}>
              {wallToggleOptionsFor(roomLayout).map(({ value: wallOption, label: wallLabel }) => (
                <button
                  key={wallOption} type="button"
                  className={`${s.wallToggleButton} ${wallOption === 'X' ? s.wallToggleX : s.wallToggleY} ${effectiveModuleWall(module) === wallOption ? s.wallToggleActive : ''}`}
                  aria-pressed={effectiveModuleWall(module) === wallOption}
                  onClick={() => setModuleWall(module.id, wallOption)}
                >
                  {wallLabel}
                </button>
              ))}
            </div>
          </td>
        )}
        <td data-label="Szer. (mm)">
          <InlineEditableNumberCell value={module.W} ariaLabel="Szer. (mm)" onCommit={value => patchModule(module.id, 'W', value)} />
        </td>
        <td data-label="Wys. (mm)">
          {fields.hasH ? (
            <span className={s.heightCellInner}>
              <InlineEditableNumberCell value={module.H} ariaLabel="Wys. (mm)" onCommit={value => patchModuleHeight(module.id, value)} />
              {/* Etap O, krok 1 — ręczna edycja wyżej ustawiła customHeight:true (patrz
                  patchModuleHeight) — ta szafka przestała gonić żywą rekomendację panelu; "↺"
                  zdejmuje blokadę i od razu wraca do bieżącego standardu (resetModuleHeight). */}
              {module.customHeight && (
                <button
                  type="button" className={s.resetHeightButton}
                  onClick={() => resetModuleHeight(module.id)}
                  aria-label={`Resetuj ręczną wysokość — ${displayLabel}`}
                  title="Ręczna wysokość — kliknij, aby wrócić do standardu"
                >↺</button>
              )}
            </span>
          ) : <span className={s.muted}>—</span>}
        </td>
        <td data-label="Gł. (mm)">
          <InlineEditableNumberCell value={module.D} ariaLabel="Gł. (mm)" onCommit={value => patchModule(module.id, 'D', value)} />
        </td>
        {/* Etap W, krok 1 — jednostki ("m²"/"mb") żyją teraz TYLKO w nagłówku kolumny (.colUnit) —
            tu, w komórce, zostaje czysta liczba (bez dublowania jednostki, bez pogrubienia). */}
        <td data-label="Korpus (m²)" className={s.numCell}>{perUnit.bodyAreaM2 > 0 ? (perUnit.bodyAreaM2 * qty).toFixed(2) : '—'}</td>
        <td data-label="Front (m²)" className={s.numCell}>{perUnit.frontAreaM2 > 0 ? (perUnit.frontAreaM2 * qty).toFixed(2) : '—'}</td>
        <td data-label="Obrzeże (mb)" className={s.numCell}>{edgeMb > 0 ? edgeMb.toFixed(2) : '—'}</td>
        <td data-label="Akcje">
          {/* Etap R, krok 3 — prawa strona wiersza zostaje CZYSTA: tylko "⚙️" (ikona, bez tekstowego
              ogona — podpis jako title) i "×". Strzałki ◀▶ żyją teraz w komórce "Moduł" (patrz wyżej).
              Etap W, krok 2 — "⚙️" otwiera teraz szerokie, wyśrodkowane modalne okno
              (CabinetSettingsModal) zamiast wąskiego popoveru zaczepionego o wiersz. */}
          <div className={s.rowActions}>
            <button
              type="button" className={s.settingsGearButton}
              aria-label={`Konstrukcja, szuflady, półki, HDF — ${displayLabel}`}
              title={summarizeConstructionCell(module, fields) ? `Konstrukcja, szuflady, półki, HDF (${summarizeConstructionCell(module, fields)})` : 'Konstrukcja, szuflady, półki, HDF'}
              onClick={() => setSettingsModuleId(module.id)}
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            <button type="button" className={s.removeButton} onClick={() => removeModule(module.id)} aria-label={`Usuń moduł ${displayLabel}`}>×</button>
          </div>
        </td>
      </tr>
    );
  };

  // Szapka kolumn tabeli dodanych szafek — 1x na grupę (patrz renderBoardGroupSection/
  // renderCountertopSection), więc nie duplikuje się per wiersz jak dawne etykiety kart.
  // Etap P, krok 3 — szerokość zajęta przez PODZBIÓR wierszy (podnagłówek "zajęte X mm" per ściana w
  // obrębie TEJ grupy, nie całej ściany budynku — to osobna liczba niż wallFreeSpace.occupiedX/Y).
  const sumModuleWidthMm = (items) => items.reduce((sum, module) => sum + (Number(module.W) || 0), 0);

  // Etap P, krok 3 — `table-layout: fixed` + szerokości w % sumujące się do 100 (nigdy mniej, nigdy
  // więcej) — jedyny sposób, żeby WSZYSTKIE kolumny zawsze mieściły się w kontenerze bez poziomego
  // obcinania prawej krawędzi (dawne "Okucia"/"Front" jako osobne kolumny, i stały min-width:1080px
  // wymuszający scroll, właśnie to psuły — patrz zgłoszenie, obcięte "Front (m²)"/"Obrzeże (mb)").
  // Etap Q, krok 4 — "Ilość" usunięta (1 wiersz = 1 szafka, patrz ⧉ Duplikuj); "Konstrukcja /
  // Szuflady" i "HDF" scalone w "Akcje" (gear "⚙️" + ⧉ + ×) — tabela mieści się teraz w znacznie
  // węższej, prawej kolumnie 2-kolumnowego układu (patrz .calculatorLayout w CSS).
  // Etap R, krok 1/3 — nagłówki SKRÓCONE (bez jednostek — te zostają na `data-label`/aria-label
  // pól, patrz niżej), żeby żaden się nie obcinał wielokropkiem; ◀▶ przeniesione do "Moduł", więc
  // ostatnia kolumna (teraz tylko "⚙️"/"×") zostaje bez nagłówka, jak dawna wąska kolumna "usuń".
  // Etap R, krok 4 / Etap S, krok 2 — % PRZELICZONE z realnych zmierzonych pikseli (Playwright,
  // patrz .calculatorLayout w CSS) — Korpus/Front/Obrzeże dostają więcej niż "wyglądałoby na
  // wystarczające", bo krótkie liczby w pogrubionej, tabularnej czcionce (np. "10.82 mb") są
  // szersze, niż się wydaje. Etap S, krok 2 — zmierzone PONOWNIE wewnątrz węższego slajdu karuzeli
  // (ma własny padding) — "Ściana" i "Obrzeże" dostały więcej, żeby ich nagłówek nigdy się nie
  // obcinał; "Moduł" NIE musi już mieścić całą nazwę (patrz .moduleName flex+min-width:0 w CSS —
  // za długa nazwa ładnie skraca się wielokropkiem, zamiast "najeżdżać" na sąsiednią kolumnę).
  // Etap T, krok 2 — % PONOWNIE PRZELICZONE z realnych zmierzonych pikseli: panel jest teraz
  // pełnoekranowy, ale .moduleCellInner (ikona 20px + ◀▶ 2×20px + gapy — patrz CSS) zjadał tyle z
  // komórki "Moduł", że .moduleName dostawał tylko ~46px, mimo że "Z szufladami"/"Pod piekarnik"
  // realnie potrzebują ~70-75px — ucinały się do "Z szuflad…" mimo szerszego, pełnoekranowego
  // panelu. Reszta kolumn (Szer./Wys./Gł./Korpus/Front) ma już ZEROWY zapas (zmierzone: trigger
  // "✎ 600" potrzebuje dokładnie tyle miejsca, ile dostaje) — nie da się ich dalej skurczyć, więc
  // dodatkowe px dla "Moduł" idą częściowo z Akcje/Obrzeże (miały zapas), częściowo z samego
  // .calculatorLayout (54/46 zamiast 56/44 — patrz CSS, tabeli dano więcej bezwzględnych px).
  // Etap W, krok 1 — zgłoszenie: nazwy modułów ucinały się do 1-2 liter ("Z...", "Po...", "N...").
  // Jednostki ("m²"/"mb") przeniesione do NAGŁÓWKA (patrz `unit` + .colUnit w <th> niżej) — komórki
  // tbody są teraz czystymi, NIEPOGRUBIONYMI liczbami (patrz .numCell) — i stały "✎" przed Szer./
  // Wys./Gł. usunięty (patrz InlineEditableNumberCell) — oba razem uwalniają sporo szerokości,
  // oddanej niżej kolumnie "Moduł" (było 28%, teraz 38% — ~145-170px na typowej szerokości tabeli).
  const TABLE_COLUMNS = [
    { label: 'Moduł', width: '36%' },
    { label: 'Szer.', width: '8%' },
    // Etap W, krok 1 — "Wys." dostaje 1% więcej niż Szer./Gł.: to JEDYNA z trzech, która czasem
    // pokazuje "↺" (reset ręcznej wysokości, patrz .heightCellInner) OBOK 4-cyfrowej liczby
    // ("2075↺") — zmierzone realnie, bez tego 1% ten konkretny kombo się ucinał.
    { label: 'Wys.', width: '10%' },
    { label: 'Gł.', width: '8%' },
    { label: 'Korpus', unit: 'm²', width: '9%' },
    { label: 'Front', unit: 'm²', width: '9%' },
    { label: 'Obrzeże', unit: 'mb', width: '11%' },
    { label: '', width: '9%' },
  ];

  // Etap P, krok 3 — "Ściana" jest DRUGĄ kolumną (zaraz po "Moduł"), żeby przynależność była widoczna
  // od pierwszego rzutu oka, bez przewijania w prawo — Moduł/Akcje oddają jej trochę % szerokości.
  const tableColumns = isCornerLayout
    ? [
      { ...TABLE_COLUMNS[0], width: '27%' },
      { label: 'Ściana', width: '9%' },
      ...TABLE_COLUMNS.slice(1, 7),
      { ...TABLE_COLUMNS[7], width: '9%' },
    ]
    : TABLE_COLUMNS;

  const renderModuleTable = (groupModules) => {
    const columnCount = tableColumns.length;
    const tableHead = (
      <thead>
        <tr>
          {tableColumns.map(column => (
            <th key={column.label || 'usuń'}>
              {column.label}
              {column.unit && <span className={s.colUnit}>{column.unit}</span>}
            </th>
          ))}
        </tr>
      </thead>
    );
    const colgroup = (
      <colgroup>
        {tableColumns.map(column => (
          <col key={column.label || 'usuń'} style={{ width: column.width }} />
        ))}
      </colgroup>
    );

    // Etap P, krok 3 — w prostym układzie (1 ściana) zostaje PŁASKA lista, dokładnie jak dawniej —
    // podział na bloki X/Y i podnagłówki mają sens TYLKO, gdy druga ściana w ogóle istnieje.
    if (!isCornerLayout) {
      return (
        <div className={s.moduleTableScroll}>
          <table className={s.moduleTable}>
            {colgroup}
            {tableHead}
            <tbody>
              {groupModules.map(module => renderModuleTableRow(module))}
            </tbody>
          </table>
        </div>
      );
    }

    // Etap AD, krok 2 — Układ U ma OBIE ściany boczne naraz (Y lewa + Y2 prawa); "Narożny L z
    // prawej" ma TYLKO Y2. Bloki renderują się warunkowo per-ścianę, w stałej kolejności X -> Y -> Y2.
    const xItems = groupModules.filter(module => effectiveModuleWall(module) === 'X');
    const yItems = hasWallY ? groupModules.filter(module => effectiveModuleWall(module) === 'Y') : [];
    const y2Items = hasWallY2 ? groupModules.filter(module => effectiveModuleWall(module) === 'Y2') : [];
    return (
      <div className={s.moduleTableScroll}>
        <table className={s.moduleTable}>
          {colgroup}
          {tableHead}
          <tbody>
            {xItems.length > 0 && (
              <tr className={s.wallSubheaderRow}>
                <td colSpan={columnCount}>📐 Ściana X — Główna ({xItems.length} {xItems.length === 1 ? 'szafka' : 'szafek'}, zajęte {sumModuleWidthMm(xItems)} mm)</td>
              </tr>
            )}
            {xItems.map(module => renderModuleTableRow(module, 'X'))}
            {yItems.length > 0 && (
              <tr className={s.wallSubheaderRow}>
                <td colSpan={columnCount}>📐 Ściana Y — Boczna, lewa ({yItems.length} {yItems.length === 1 ? 'szafka' : 'szafek'}, zajęte {sumModuleWidthMm(yItems)} mm)</td>
              </tr>
            )}
            {yItems.map(module => renderModuleTableRow(module, 'Y'))}
            {y2Items.length > 0 && (
              <tr className={s.wallSubheaderRow}>
                <td colSpan={columnCount}>📐 Ściana Y2 — Boczna, prawa ({y2Items.length} {y2Items.length === 1 ? 'szafka' : 'szafek'}, zajęte {sumModuleWidthMm(y2Items)} mm)</td>
              </tr>
            )}
            {y2Items.map(module => renderModuleTableRow(module, 'Y2'))}
          </tbody>
        </table>
      </div>
    );
  };

  // Etap N, krok 3 — kafelek "+ Dodaj moduł" rysuje PROPORCJONALNĄ miniaturę (CabinetFrontDrawing,
  // ta sama logika co w pełnej skali na WallElevationCanvas) zamiast gołej ikony — wspiera KLIK
  // (dopisuje na koniec rzędu, jak dawniej) ORAZ przeciągnięcie na rysunek (natywne HTML5 Drag and
  // Drop; WallElevationCanvas.handleDrop odczytuje JSON i wstawia moduł w punkcie upuszczenia).
  const renderAddModuleTile = (category, groupKey, preset, index) => {
    const previewH = preset.heightRole ? heightForRole[preset.heightRole] : (preset.overrides?.H ?? CABINET_MODULE_TYPES[preset.type].defaults.H ?? 600);
    const previewModule = createCabinetModule(preset.type, { ...preset.overrides, H: previewH });
    const previewW = Math.max(1, Number(previewModule.W) || 1);
    const previewHeight = Math.max(1, Number(previewModule.H) || previewH || 1);
    // Etap P, krok 3 — kafelek dodany KLIKIEM (nie przeciągnięciem — to ma własną, dokładniejszą
    // logikę w WallElevationCanvas.handleDrop) trafia na ścianę, którą aktualnie pokazuje rysunek:
    // "Widok Y"/"Widok Y2" w układzie narożnym -> od razu `wall: 'Y'/'Y2'`, każdy inny przypadek ->
    // domyślne 'X' (effectiveModuleWall traktuje brak pola tak samo jak jawne 'X').
    const clickWall = (hasWallY && canvasView === 'y') ? 'Y' : (hasWallY2 && canvasView === 'y2') ? 'Y2' : undefined;
    const payload = {
      category, group: groupKey, type: preset.type, label: preset.label, icon: preset.icon,
      heightRole: preset.heightRole, overrides: preset.overrides, ...(clickWall ? { wall: clickWall } : {}),
    };
    // Etap Q, krok 2 — "Cokół" nie ma sensownego STATYCZNEGO domyślnego W (zawsze powinien ciągnąć
    // się na całą bieżącą szerokość dolnego rzędu) — tylko KLIK liczy ją na bieżąco (suma W modułów
    // już dodanych do tej grupy, z fallbackiem na domyślne 2400mm, gdy rząd jest jeszcze pusty).
    // Przeciągnięcie na rysunek (handleDrop w WallElevationCanvas) dostaje statyczny `payload` bez
    // tej korekty — upuszczenie w konkretnym miejscu i tak wymaga ręcznej korekty szerokości.
    const handleClick = () => {
      if (preset.type !== 'plinth_strip') { addModule(payload); return; }
      const rowWidthMm = modules
        .filter(module => module.group === groupKey)
        .reduce((sum, module) => sum + (Number(module.W) || 0), 0);
      addModule({
        ...payload,
        overrides: { ...preset.overrides, W: rowWidthMm || CABINET_MODULE_TYPES.plinth_strip.defaults.W },
      });
    };
    return (
      <button
        key={index}
        type="button"
        className={s.addModuleTile}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/json', JSON.stringify(payload));
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={handleClick}
        title={`${preset.label} — kliknij, aby dodać na koniec rzędu, albo przeciągnij na rysunek`}
      >
        <svg viewBox={`0 0 ${previewW} ${previewHeight}`} className={s.addModuleTilePreview} aria-hidden="true">
          <CabinetFrontDrawing
            x={0} y={0} width={previewW} height={previewHeight} type={preset.type}
            doors={previewModule.doors} shelves={previewModule.shelves}
            externalDrawersHigh={previewModule.externalDrawersHigh} externalDrawersLow={previewModule.externalDrawersLow}
            frontWidth={previewModule.frontWidth}
            bottomHeightMm={previewModule.bottomHeightMm} fridgeNicheHeightMm={previewModule.fridgeNicheHeightMm}
            showLabel={false}
            strokeWidthPx={1.6}
          />
        </svg>
        <span className={s.addModuleTileCaption}>{preset.label}</span>
      </button>
    );
  };

  // Nagłówek materiałów jednej GRUPY płytowej (patrz BOARD_GROUPS) + jej przyciski dodawania +
  // lista jej modułów. Używane dla WSZYSTKICH 4 grup kuchennych i dla jedynej "grupy" każdej z
  // pozostałych 3 kategorii (Szafa/Łazienka/RTV) — ta sama struktura, inny zestaw presetów.
  const renderBoardGroupSection = (category, groupKey, presets) => {
    const config = BOARD_GROUPS[groupKey];
    const board = boardsByKey[groupKey] || {};
    const inheritValue = board.inherit || config.inheritOptions?.[0]?.value || 'own';
    const showOwnFields = !config.inheritOptions || inheritValue === 'own';
    const expanded = isGroupMaterialsExpanded(groupKey);
    const groupModules = modules.filter(module => module.group === groupKey);

    return (
      <div key={groupKey} className={s.groupSection}>
        <div className={s.groupHeaderRow}>
          <button
            type="button"
            className={s.groupToggle}
            aria-expanded={expanded}
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            {expanded ? '▾' : '▸'} {config.label}
            {groupModules.length > 0 && <span className={s.groupCount}>({groupModules.length})</span>}
          </button>
          {/* Etap Q, krok 1 — panel materiałów (4 pola płyty/kromki + 2 checkboxy) żyje teraz za
              TYM gear-przyciskiem, zwinięty domyślnie; krótki podpis dekoru pokazuje, co jest
              wybrane, bez rozwijania. Woła TEN SAM toggle co nagłówek grupy (jedna, wspólna flaga
              widoczności materiałów) — to tylko drugi, bardziej odkrywalny punkt wejścia do niej. */}
          <button
            type="button"
            className={s.materialsGearButton}
            aria-expanded={expanded}
            aria-label={`Materiały — ${config.label}`}
            title="Materiały grupy (płyta/kromka korpusu i frontu)"
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            ⚙️ Materiały
            {groupDecorHint(groupKey) && <span className={s.materialsGearHint}>{groupDecorHint(groupKey)}</span>}
          </button>
        </div>

        {expanded && (
          <div className={s.groupMaterials}>
            {config.inheritOptions && (
              <label className={s.chipSelect}>Materiały grupy:
                <select
                  value={inheritValue}
                  onChange={event => setBoardField(groupKey, 'inherit', event.target.value)}
                  aria-label={`Materiały grupy: — ${config.label}`}
                >
                  {config.inheritOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            {showOwnFields && (
              <div className={s.boardRows}>
                {Object.entries(BOARD_FIELDS).map(([field, fieldConfig]) => (
                  <SearchableMaterialSelect
                    key={field}
                    variant="compact"
                    label={fieldConfig.label}
                    items={boardPools[field]}
                    value={effectiveBoardId(groupKey, field)}
                    onChange={value => setBoardField(groupKey, field, value)}
                    ariaLabel={`${fieldConfig.label} — ${config.label}`}
                  />
                ))}
              </div>
            )}
            {showOwnFields && (
              <div className={s.groupCheckboxRow}>
                <label className={s.ladderCheckbox}>
                  <input
                    type="checkbox"
                    checked={Boolean(board.bodyFromFront)}
                    onChange={() => toggleBoardFlag(groupKey, 'bodyFromFront')}
                    aria-label={`Korpus z płyty frontowej — ${config.label}`}
                  />
                  Korpus z płyty frontowej
                </label>
                <label className={s.ladderCheckbox}>
                  <input
                    type="checkbox"
                    checked={Boolean(board.edgeFromFront)}
                    onChange={() => toggleBoardFlag(groupKey, 'edgeFromFront')}
                    aria-label={`Obrzeże korpusu w kolorze frontu — ${config.label}`}
                  />
                  Obrzeże korpusu w kolorze frontu
                </label>
              </div>
            )}
          </div>
        )}

        <div className={s.addModuleRow}>
          {presets.map((preset, index) => renderAddModuleTile(category, groupKey, preset, index))}
        </div>

        {groupModules.length > 0 && renderModuleTable(groupModules)}
      </div>
    );
  };

  // Etap T, krok 2 — pod wkładką Kuchnia paleta (nagłówek + materiały + kafelki dodawania) żyje w
  // JEDNYM wspólnym pasku NAD oboma kolumnami (rysunek + tabela), a tabela osobno w prawej kolumnie
  // — stąd SPLIT na 2 samodzielne funkcje (paleta / tabela), każda z WŁASNYM `.groupSection`.
  // `renderBoardGroupSection` (wyżej) zostaje NIETKNIĘTA i dalej łączy obie części w 1 kawałku dla
  // pozostałych kategorii (Szafa/Łazienka/RTV — bez zakładek, bez tego podziału).
  const renderBoardGroupPalette = (category, groupKey, presets) => {
    const config = BOARD_GROUPS[groupKey];
    const board = boardsByKey[groupKey] || {};
    const inheritValue = board.inherit || config.inheritOptions?.[0]?.value || 'own';
    const showOwnFields = !config.inheritOptions || inheritValue === 'own';
    const expanded = isGroupMaterialsExpanded(groupKey);
    const groupModules = modules.filter(module => module.group === groupKey);

    return (
      <div key={groupKey} className={s.groupSection} data-group-palette={groupKey}>
        <div className={s.groupHeaderRow}>
          <button
            type="button"
            className={s.groupToggle}
            aria-expanded={expanded}
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            {expanded ? '▾' : '▸'} {config.label}
            {groupModules.length > 0 && <span className={s.groupCount}>({groupModules.length})</span>}
          </button>
          <button
            type="button"
            className={s.materialsGearButton}
            aria-expanded={expanded}
            aria-label={`Materiały — ${config.label}`}
            title="Materiały grupy (płyta/kromka korpusu i frontu)"
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            ⚙️ Materiały
            {groupDecorHint(groupKey) && <span className={s.materialsGearHint}>{groupDecorHint(groupKey)}</span>}
          </button>
        </div>

        {expanded && (
          <div className={s.groupMaterials}>
            {config.inheritOptions && (
              <label className={s.chipSelect}>Materiały grupy:
                <select
                  value={inheritValue}
                  onChange={event => setBoardField(groupKey, 'inherit', event.target.value)}
                  aria-label={`Materiały grupy: — ${config.label}`}
                >
                  {config.inheritOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            {showOwnFields && (
              <div className={s.boardRows}>
                {Object.entries(BOARD_FIELDS).map(([field, fieldConfig]) => (
                  <SearchableMaterialSelect
                    key={field}
                    variant="compact"
                    label={fieldConfig.label}
                    items={boardPools[field]}
                    value={effectiveBoardId(groupKey, field)}
                    onChange={value => setBoardField(groupKey, field, value)}
                    ariaLabel={`${fieldConfig.label} — ${config.label}`}
                  />
                ))}
              </div>
            )}
            {showOwnFields && (
              <div className={s.groupCheckboxRow}>
                <label className={s.ladderCheckbox}>
                  <input
                    type="checkbox"
                    checked={Boolean(board.bodyFromFront)}
                    onChange={() => toggleBoardFlag(groupKey, 'bodyFromFront')}
                    aria-label={`Korpus z płyty frontowej — ${config.label}`}
                  />
                  Korpus z płyty frontowej
                </label>
                <label className={s.ladderCheckbox}>
                  <input
                    type="checkbox"
                    checked={Boolean(board.edgeFromFront)}
                    onChange={() => toggleBoardFlag(groupKey, 'edgeFromFront')}
                    aria-label={`Obrzeże korpusu w kolorze frontu — ${config.label}`}
                  />
                  Obrzeże korpusu w kolorze frontu
                </label>
              </div>
            )}
          </div>
        )}

        <div className={s.addModuleRow}>
          {presets.map((preset, index) => renderAddModuleTile(category, groupKey, preset, index))}
        </div>
      </div>
    );
  };

  const renderCountertopPalette = (category, groupKey, presets) => {
    const expanded = isGroupMaterialsExpanded(groupKey);
    const groupModules = modules.filter(module => module.group === groupKey);
    return (
      <div key={groupKey} className={s.groupSection} data-group-palette={groupKey}>
        <div className={s.groupHeaderRow}>
          <button
            type="button"
            className={s.groupToggle}
            aria-expanded={expanded}
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            {expanded ? '▾' : '▸'} {COUNTERTOP_GROUP_LABEL}
            {groupModules.length > 0 && <span className={s.groupCount}>({groupModules.length})</span>}
          </button>
          <button
            type="button"
            className={s.materialsGearButton}
            aria-expanded={expanded}
            aria-label={`Materiały — ${COUNTERTOP_GROUP_LABEL}`}
            title="Materiał blatu"
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            ⚙️ Materiały
            {decorCodeFromName(selectedItem('countertop', materialPools, materials)?.name) && (
              <span className={s.materialsGearHint}>
                {decorCodeFromName(selectedItem('countertop', materialPools, materials)?.name)}
              </span>
            )}
          </button>
        </div>

        {expanded && (
          <div className={s.groupMaterials}>
            <div className={s.materialField}>
              <span>Blat</span>
              <SearchableMaterialSelect
                items={materialPools.countertop}
                value={selectedId('countertop', materialPools)}
                onChange={value => setRole('countertop', value)}
                ariaLabel="Blat"
                emptyLabel="Domyślna z projektu"
              />
            </div>
          </div>
        )}

        <div className={s.addModuleRow}>
          {presets.map((preset, index) => renderAddModuleTile(category, groupKey, preset, index))}
        </div>
      </div>
    );
  };

  // Etap U, krok 1 — tabela po prawej TERAZ ZAWSZE pokazuje WSZYSTKIE dodane szafki kuchenne razem
  // (zgrupowane: Ściana X/Y -> jarus -> wiersze), zamiast filtrować do jednej grupy naraz (dawna
  // karuzela slajdów tabeli, Etap S/T) — zakładki u góry (nad paletą) tylko PODŚWIETLAJĄ swoją
  // grupę (patrz isActiveGroupRow w renderModuleTableRow), nie chowają reszty. Dolne+Słupki dzielą
  // JEDEN wspólny jarus "Pas dolny i słupki" (patrz layoutFloorBand w jądrze — ta sama funkcja,
  // której używa WallElevationCanvas, więc kolejność w tabeli ZAWSZE zgadza się z rysunkiem).
  const renderUnifiedKitchenTable = () => {
    const hasAnyModule = modules.some(module => KITCHEN_GROUP_KEYS.includes(module.group));
    if (!hasAnyModule) {
      return <div className={s.groupSection}><p className={s.muted}>Brak dodanych szafek.</p></div>;
    }
    const columnCount = tableColumns.length;
    const tableHead = (
      <thead>
        <tr>
          {tableColumns.map(column => (
            <th key={column.label || 'usuń'}>
              {column.label}
              {column.unit && <span className={s.colUnit}>{column.unit}</span>}
            </th>
          ))}
        </tr>
      </thead>
    );
    const colgroup = (
      <colgroup>
        {tableColumns.map(column => (
          <col key={column.label || 'usuń'} style={{ width: column.width }} />
        ))}
      </colgroup>
    );

    // Etap AA, krok 2 — zgłoszenie: kolumna ▲/▼ usunięta z tabeli (przestawianie w kuchni żyje
    // teraz na rysunku, drag&drop) — `tiersForWall` nie musi już budować WŁASNEGO `onReorder` tylko
    // po to, by przekazać go do (usuniętych) przycisków w renderModuleTableRow.
    const tiersForWall = (wall) => [
      {
        key: 'floor', label: FLOOR_TIER_LABEL, activeGroups: ['kitchen_bottom', 'kitchen_tall'],
        items: layoutFloorBand(modules, wall, pillarsForWall(wall)).entries.map(entry => entry.module),
      },
      {
        key: 'top', label: TOP_TIER_LABEL, activeGroups: ['kitchen_top'],
        items: modules.filter(module => module.group === 'kitchen_top' && effectiveModuleWall(module) === wall),
      },
      {
        key: 'mezzanine', label: MEZZANINE_TIER_LABEL, activeGroups: ['kitchen_mezzanine'],
        items: modules.filter(module => module.group === 'kitchen_mezzanine' && effectiveModuleWall(module) === wall),
      },
      {
        key: 'countertop', label: COUNTERTOP_TIER_LABEL, activeGroups: ['kitchen_countertop'],
        items: modules.filter(module => module.group === 'kitchen_countertop' && effectiveModuleWall(module) === wall),
      },
    ];

    // Etap AD, krok 2 — Układ U renderuje WSZYSTKIE 3 ściany naraz (X, Y lewa, Y2 prawa); "Narożny L
    // z prawej" tylko X + Y2 (bez Y w ogóle) — dokładnie te same `hasWallY`/`hasWallY2`, co wszędzie
    // indziej w tym komponencie.
    const wallsToRender = ['X', ...(hasWallY ? ['Y'] : []), ...(hasWallY2 ? ['Y2'] : [])];
    const WALL_SUBHEADER_LABEL = { X: '📐 Ściana X — Główna', Y: '📐 Ściana Y — Boczna, lewa', Y2: '📐 Ściana Y2 — Boczna, prawa' };

    return (
      <div className={s.groupSection}>
        <div className={s.moduleTableScroll}>
          <table className={s.moduleTable}>
            {colgroup}
            {tableHead}
            <tbody>
              {wallsToRender.flatMap((wall) => {
                const tiers = tiersForWall(wall).filter(tier => tier.items.length > 0);
                if (tiers.length === 0) return [];
                const rows = [];
                if (isCornerLayout) {
                  const wallCount = tiers.reduce((sum, tier) => sum + tier.items.length, 0);
                  // Etap P, krok 3 (zachowane) — "zajęte X mm" na poziomie ściany to NAJSZERSZY jarus
                  // tej ściany (ta sama logika co computeWallFreeSpace.occupiedX/Y w jądrze), nie suma
                  // wszystkich jarusów (które fizycznie stoją JEDEN NAD DRUGIM, nie obok siebie).
                  const floorForWall = layoutFloorBand(modules, wall, pillarsForWall(wall));
                  const topWidthForWall = sumModuleWidthMm(modules.filter(module => module.group === 'kitchen_top' && effectiveModuleWall(module) === wall));
                  const mezzanineWidthForWall = sumModuleWidthMm(modules.filter(module => module.group === 'kitchen_mezzanine' && effectiveModuleWall(module) === wall));
                  const wallOccupiedMm = Math.max(floorForWall.totalWidthMm, floorForWall.leftTallOffsetMm + topWidthForWall, mezzanineWidthForWall);
                  const wallLabel = WALL_SUBHEADER_LABEL[wall];
                  rows.push(
                    <tr key={`wall-${wall}`} className={s.wallSubheaderRow} data-wall-header={wall}>
                      <td colSpan={columnCount}>{wallLabel} ({wallCount} {wallCount === 1 ? 'szafka' : 'szafek'}, zajęte {wallOccupiedMm} mm)</td>
                    </tr>,
                  );
                }
                tiers.forEach((tier) => {
                  const tierActive = tier.activeGroups.includes(activeGroupKey);
                  rows.push(
                    <tr
                      key={`tier-${wall}-${tier.key}`}
                      className={`${s.tierSubheaderRow} ${tierActive ? s.tierSubheaderActive : ''}`}
                      data-tier-header={tier.key}
                    >
                      <td colSpan={columnCount}>{tier.label} ({tier.items.length})</td>
                    </tr>,
                  );
                  tier.items.forEach((module) => {
                    rows.push(renderModuleTableRow(module, wall));
                  });
                });
                return rows;
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Grupa 5 Kuchni ("🪵 Blat") nie ma płyty/kromki korpusu/frontu — tylko wspólny, globalny wybór
  // materiału blatu (ta sama rola `countertop`, co dotąd), bez przełącznika dziedziczenia.
  const renderCountertopSection = (category, groupKey, presets) => {
    const expanded = isGroupMaterialsExpanded(groupKey);
    const groupModules = modules.filter(module => module.group === groupKey);
    return (
      <div key={groupKey} className={s.groupSection}>
        <div className={s.groupHeaderRow}>
          <button
            type="button"
            className={s.groupToggle}
            aria-expanded={expanded}
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            {expanded ? '▾' : '▸'} {COUNTERTOP_GROUP_LABEL}
            {groupModules.length > 0 && <span className={s.groupCount}>({groupModules.length})</span>}
          </button>
          <button
            type="button"
            className={s.materialsGearButton}
            aria-expanded={expanded}
            aria-label={`Materiały — ${COUNTERTOP_GROUP_LABEL}`}
            title="Materiał blatu"
            onClick={() => toggleGroupExpanded(groupKey)}
          >
            ⚙️ Materiały
            {decorCodeFromName(selectedItem('countertop', materialPools, materials)?.name) && (
              <span className={s.materialsGearHint}>
                {decorCodeFromName(selectedItem('countertop', materialPools, materials)?.name)}
              </span>
            )}
          </button>
        </div>

        {expanded && (
          <div className={s.groupMaterials}>
            <div className={s.materialField}>
              <span>Blat</span>
              <SearchableMaterialSelect
                items={materialPools.countertop}
                value={selectedId('countertop', materialPools)}
                onChange={value => setRole('countertop', value)}
                ariaLabel="Blat"
                emptyLabel="Domyślna z projektu"
              />
            </div>
          </div>
        )}

        <div className={s.addModuleRow}>
          {presets.map((preset, index) => renderAddModuleTile(category, groupKey, preset, index))}
        </div>

        {groupModules.length > 0 && renderModuleTable(groupModules)}
      </div>
    );
  };

  // Etap T, krok 1 — Escape zamyka pełnoekranowy kalkulator, ALE NIE wtedy, gdy jakiś WEWNĘTRZNY
  // popover/pole edycji (SearchableMaterialSelect, InlineEditableNumberCell, CabinetSettingsModal)
  // właśnie konsumuje ten sam klawisz — te wołają `event.stopPropagation()` na SWOIM Escape (patrz
  // np. InlineEditableNumberCell), więc zdarzenie w ogóle nie dotrze tutaj, dopóki coś wewnątrz jest
  // otwarte. Ten sam mechanizm, który już chroni przed globalnym "Escape zamyka projekt"
  // (useProjectCloseLifecycle) — `stopPropagation()` tutaj też go zatrzymuje.
  const handleOverlayKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose?.();
  };

  // Etap W, krok 2 — dane dla jedynego, globalnego CabinetSettingsModal (patrz settingsModuleId
  // wyżej) — liczone ŚWIEŻO z `modules` przy KAŻDYM renderze (nigdy nie zapamiętane z chwili
  // otwarcia), żeby zawsze pokazywały BIEŻĄCY stan modułu, nawet po przestawieniu/edycji w trakcie
  // otwartego modala.
  const settingsModule = settingsModuleId ? modules.find(module => module.id === settingsModuleId) : null;
  // Etap AB, krok 4 — modal nie przestawia już modułów (przyciski "Przesuń" usunięte z footera,
  // patrz CabinetSettingsModal) — jedyne, czego wciąż potrzebuje z "kontekstu ściany", to sama
  // `wall` (dla przełącznika "Ściana: X|Y" w Bloku 1, układ narożny L).
  const settingsModuleWall = settingsModule ? effectiveModuleWall(settingsModule) : null;

  return createPortal(
    <div className={s.fullscreenOverlay} onKeyDown={handleOverlayKeyDown}>
      <div className={s.panel} aria-labelledby={fieldsetId} ref={panelRef}>
      {/* h4 zostaje bezpośrednim dziecku .panel (nie owijamy go w dodatkowy div) — e2e lokalizuje
          cały panel przez getByText(tytuł).locator('..'), dodatkowy wrapper by to złamał. Dropdown
          "Typ zabudowy" jest więc OSOBNYM, bezpośrednim dzieckiem .panel (nie w tym samym wierszu
          flex co h4) — ta sama zasada, co dawne .categoryTabs tuż pod nagłówkiem. */}
      <h4 id={fieldsetId} className={s.title}>📐 Kalkulator</h4>
      {/* Etap N, krok 1 — 4 wkładki-przyciski zastąpione kompaktowym dropdownem: po wybraniu typu
          zabudowy nie zostają obok żadne nieużywane przyciski innych kategorii. */}
      <div className={s.topHeaderRow}>
        <label className={s.categorySelectLabel}>Typ zabudowy:
          <select
            className={s.categorySelect}
            value={activeCategory}
            onChange={event => setActiveCategory(event.target.value)}
            aria-label="Typ zabudowy"
          >
            {CATEGORY_TABS.map(tab => (
              <option key={tab.key} value={tab.key}>{tab.label}</option>
            ))}
          </select>
        </label>
        {/* Etap Q, krok 1 — Obszar 1/2 ("Obszar zabudowy (ściana)" / "Parametry szafek i blatu")
            żyją teraz za TYM gear-przyciskiem, zwinięte domyślnie — podpis pokazuje na bieżąco
            szerokość×wysokość ściany i wysokość blatu, bez rozwijania panelu. Tylko pod wkładką
            Kuchnia (reszta kategorii nie ma koncepcji "blat/sufit/antresola"). */}
        {activeCategory === 'kitchen' && (
          <button
            type="button"
            className={s.materialsGearButton}
            aria-expanded={heightsPanelExpanded}
            onClick={() => setHeightsPanelExpanded(current => !current)}
            title="Wymiary ściany i wysokości korpusów"
          >
            ⚙️ Wymiary ściany i wysokości
            <span className={s.materialsGearHint}>
              ({kitchenHeights.wallWidthMm}×{kitchenHeights.ceilingHeight}, blat {kitchenHeights.countertopHeight})
            </span>
          </button>
        )}
        {saveStatusText && <span role="status" className={s.saveStatus} data-variant={saveStatus}>{saveStatusText}</span>}
        {/* Etap T, krok 1 — prawa strona nagłówka pełnoekranowego kalkulatora: bejdż sumy wyceny +
            powrót do projektu. `margin-left: auto` na bejdżu (patrz CSS) spycha oba w prawo, bez
            dodatkowego wrappera (h4 MUSI zostać bezpośrednim dzieckiem .panel — patrz komentarz
            wyżej — więc ten pasek to WCIĄŻ ten sam .topHeaderRow, tylko z 2 nowymi elementami). */}
        <span className={s.fullscreenWycenaBadge}>{PLN(wycena)}</span>
        <button type="button" className={s.closeCalculatorButton} onClick={() => onClose?.()}>
          ← Wróć do projektu
        </button>
      </div>

      {/* Etap N, krok 2 — panel wysokości kuchni, 2 logiczne obszary — tylko pod wkładką Kuchnia,
          i tylko gdy rozwinięty za gear-przyciskiem powyżej (Etap Q, krok 1). */}
      {activeCategory === 'kitchen' && heightsPanelExpanded && (
        <div className={s.heightsPanel}>
          <div className={s.heightsAreaBlock}>
            <h5 className={s.heightsAreaTitle}>📏 Obszar zabudowy (ściana)</h5>
            <div className={s.heightsInputsRow}>
              {AREA1_FIELDS.map(({ field, label }) => (
                <CompactNumberField
                  key={field} label={label} value={kitchenHeights[field]}
                  onChange={value => setKitchenHeightField(field, value)}
                />
              ))}
              {/* Etap O, krok 3 — kuchnia narożna L: druga, prostopadła ściana Y. Pole "Szerokość
                  ściany Y" pojawia się TYLKO gdy układ to "Narożny L" (dla "Prosty" nie ma znaczenia).
                  Etap AD, krok 2 — 2 nowe warianty: "z prawej" (TYLKO Y2) i "Układ U" (Y i Y2 naraz). */}
              <CompactSelectField label="Układ ścian" value={roomLayout} onChange={setRoomLayout}>
                <option value="simple">Prosty (Ściana X)</option>
                <option value="corner_l">Narożny L — ściana Y z lewej</option>
                <option value="corner_l_right">Narożny L — ściana Y z prawej</option>
                <option value="u_layout">Układ U — ściana Y1 (lewa) + Y2 (prawa)</option>
              </CompactSelectField>
              {hasWallY && (
                <CompactNumberField
                  label="Szerokość ściany Y (mm)" value={kitchenHeights.wallYWidthMm}
                  onChange={value => setKitchenHeightField('wallYWidthMm', value)}
                />
              )}
              {hasWallY2 && (
                <CompactNumberField
                  label="Szerokość ściany Y prawa (mm)" value={kitchenHeights.wallY2WidthMm}
                  onChange={value => setKitchenHeightField('wallY2WidthMm', value)}
                />
              )}
            </div>
            <div className={s.trimsRow}>
              <span className={s.occupiedWidthBadge}>
                Zajęte (ściana X): <strong>{wallFreeSpace.occupiedX}</strong> / {wallFreeSpace.wallXWidthMm} mm
                {' '}({wallFreeSpace.freeX >= 0 ? `zostało ${wallFreeSpace.freeX} mm` : `przekroczono o ${Math.abs(wallFreeSpace.freeX)} mm`})
              </span>
              {hasWallY && (
                <span className={s.occupiedWidthBadge}>
                  Zajęte (ściana Y): <strong>{wallFreeSpace.occupiedY}</strong> / {wallFreeSpace.availableY} mm dostępne
                  {' '}({wallFreeSpace.freeY >= 0 ? `zostało ${wallFreeSpace.freeY} mm` : `przekroczono o ${Math.abs(wallFreeSpace.freeY)} mm`})
                  {wallFreeSpace.cornerDeductionMm > 0 && ` — narożnik zajmuje ${wallFreeSpace.cornerDeductionMm} mm`}
                </span>
              )}
              {hasWallY2 && (
                <span className={s.occupiedWidthBadge}>
                  Zajęte (ściana Y prawa): <strong>{wallFreeSpace.occupiedY2}</strong> / {wallFreeSpace.availableY2} mm dostępne
                  {' '}({wallFreeSpace.freeY2 >= 0 ? `zostało ${wallFreeSpace.freeY2} mm` : `przekroczono o ${Math.abs(wallFreeSpace.freeY2)} mm`})
                  {wallFreeSpace.cornerDeduction2Mm > 0 && ` — narożnik zajmuje ${wallFreeSpace.cornerDeduction2Mm} mm`}
                </span>
              )}
            </div>
          </div>

          <div className={s.heightsAreaBlock}>
            <h5 className={s.heightsAreaTitle}>🗄️ Parametry szafek i blatu</h5>
            <div className={s.heightsInputsRow}>
              {AREA2_FIELDS.map(({ field, label }) => (
                <CompactNumberField
                  key={field} label={label} value={kitchenHeights[field]}
                  onChange={value => setKitchenHeightField(field, value)}
                />
              ))}
            </div>
            <div className={s.heightsInputsRow}>
              {HEIGHT_ROLE_FIELDS.map(({ role, label }) => (
                <CompactNumberField
                  key={role} label={label} value={heightForRole[role]}
                  onChange={value => setHeightOverride(role, value)}
                />
              ))}
            </div>
            <button type="button" className={s.applyHeightsButton} onClick={resetAllCustomHeights}>
              ↻ Resetuj ręczne wysokości do standardu
            </button>
          </div>

          {/* Etap AD, krok 3 — "Szyb wentylacyjny / Słup": nieprzesuwalny element konstrukcyjny
              ściany (NIE szafka — brak materiałów/wyceny). Szafki na TEJ SAMEJ ścianie automatycznie
              omijają jego odcinek [xMm, xMm+widthMm], patrz pillarsForWall/advancePastPillars. */}
          <div className={s.heightsAreaBlock}>
            <h5 className={s.heightsAreaTitle}>🧱 Konstrukcja i instalacje</h5>
            {pillars.map((pillar, index) => {
              const n = index + 1;
              return (
                <div key={pillar.id} className={s.heightsInputsRow}>
                  <label className={s.settingsModalField}>
                    Nazwa
                    <input
                      type="text" className={s.settingsModalInput}
                      aria-label={`Nazwa — szyb/słup #${n}`}
                      value={pillar.name}
                      onChange={event => patchPillarField(pillar.id, 'name', event.target.value)}
                    />
                  </label>
                  <label className={s.settingsModalField}>
                    Ściana
                    <select
                      className={s.settingsModalSelect}
                      aria-label={`Ściana — szyb/słup #${n}`}
                      value={pillar.wall}
                      onChange={event => patchPillarField(pillar.id, 'wall', event.target.value)}
                    >
                      <option value="X">X</option>
                      {hasWallY && <option value="Y">Y</option>}
                      {hasWallY2 && <option value="Y2">Y2</option>}
                    </select>
                  </label>
                  <CompactNumberField
                    label={`Pozycja od lewej (X, mm) — szyb/słup #${n}`} value={pillar.xMm}
                    onChange={value => patchPillarField(pillar.id, 'xMm', value)}
                  />
                  <CompactNumberField
                    label={`Szerokość (mm) — szyb/słup #${n}`} value={pillar.widthMm}
                    onChange={value => patchPillarField(pillar.id, 'widthMm', value)}
                  />
                  <CompactNumberField
                    label={`Głębokość (mm) — szyb/słup #${n}`} value={pillar.depthMm}
                    onChange={value => patchPillarField(pillar.id, 'depthMm', value)}
                  />
                  <CompactNumberField
                    label={`Wysokość (mm) — szyb/słup #${n}`} value={pillar.heightMm}
                    onChange={value => patchPillarField(pillar.id, 'heightMm', value)}
                  />
                  <button
                    type="button" className={s.removeButton}
                    aria-label={`Usuń szyb/słup ${pillar.name || n}`}
                    onClick={() => removePillar(pillar.id)}
                  >×</button>
                </div>
              );
            })}
            <button type="button" className={s.applyHeightsButton} onClick={addPillar}>
              + Dodaj szyb / słup konstrukcyjny
            </button>
          </div>

          {/* Etap AD, krok 4 — punkt zerowy (0) per ściana + punkty instalacji (gniazdka/LED/woda),
              rysowane na Widoku X/Y/Y2 z wyniesieniem i podpisem "X: .../H: ...". Odległość KAŻDEGO
              punktu liczy się od wybranego tu rogu (patrz installationPointAbsoluteXMm niżej). */}
          <div className={s.heightsAreaBlock}>
            <h5 className={s.heightsAreaTitle}>🔌 Instalacje i punkt zerowy (0)</h5>
            <div className={s.heightsInputsRow}>
              <CompactSelectField
                label="Punkt zerowy (0) dla ściany X" value={zeroPoints.X}
                onChange={value => setZeroPointSide('X', value)}
              >
                <option value="left">Lewy róg (0 →)</option>
                <option value="right">Prawy róg (← 0)</option>
              </CompactSelectField>
              {hasWallY && (
                <CompactSelectField
                  label="Punkt zerowy (0) dla ściany Y" value={zeroPoints.Y}
                  onChange={value => setZeroPointSide('Y', value)}
                >
                  <option value="left">Lewy róg (0 →)</option>
                  <option value="right">Prawy róg (← 0)</option>
                </CompactSelectField>
              )}
              {hasWallY2 && (
                <CompactSelectField
                  label="Punkt zerowy (0) dla ściany Y2" value={zeroPoints.Y2}
                  onChange={value => setZeroPointSide('Y2', value)}
                >
                  <option value="left">Lewy róg (0 →)</option>
                  <option value="right">Prawy róg (← 0)</option>
                </CompactSelectField>
              )}
            </div>
            {installationPoints.map((point, index) => {
              const n = index + 1;
              return (
                <div key={point.id} className={s.heightsInputsRow}>
                  <label className={s.settingsModalField}>
                    Typ
                    <select
                      className={s.settingsModalSelect}
                      aria-label={`Typ — punkt instalacji #${n}`}
                      value={point.type}
                      onChange={event => patchInstallationPointField(point.id, 'type', event.target.value)}
                    >
                      <option value="socket">{INSTALLATION_POINT_DEFAULTS.socket.label}</option>
                      <option value="led">{INSTALLATION_POINT_DEFAULTS.led.label}</option>
                      <option value="water">{INSTALLATION_POINT_DEFAULTS.water.label}</option>
                    </select>
                  </label>
                  <label className={s.settingsModalField}>
                    Ściana
                    <select
                      className={s.settingsModalSelect}
                      aria-label={`Ściana — punkt instalacji #${n}`}
                      value={point.wall}
                      onChange={event => patchInstallationPointField(point.id, 'wall', event.target.value)}
                    >
                      <option value="X">X</option>
                      {hasWallY && <option value="Y">Y</option>}
                      {hasWallY2 && <option value="Y2">Y2</option>}
                    </select>
                  </label>
                  <CompactNumberField
                    label={`Odległość od punktu 0 (mm) — punkt instalacji #${n}`} value={point.distanceMm}
                    onChange={value => patchInstallationPointField(point.id, 'distanceMm', value)}
                  />
                  <CompactNumberField
                    label={`Wysokość od podłogi H (mm) — punkt instalacji #${n}`} value={point.heightMm}
                    onChange={value => patchInstallationPointField(point.id, 'heightMm', value)}
                  />
                  <label className={s.settingsModalField}>
                    Opis
                    <input
                      type="text" className={s.settingsModalInput}
                      aria-label={`Opis — punkt instalacji #${n}`}
                      value={point.description}
                      placeholder="np. Zmywarka, Okap"
                      onChange={event => patchInstallationPointField(point.id, 'description', event.target.value)}
                    />
                  </label>
                  <button
                    type="button" className={s.removeButton}
                    aria-label={`Usuń punkt instalacji #${n}`}
                    onClick={() => removeInstallationPoint(point.id)}
                  >×</button>
                </div>
              );
            })}
            <button type="button" className={s.applyHeightsButton} onClick={addInstallationPoint}>
              + Dodaj punkt instalacji
            </button>
          </div>
        </div>
      )}

      {/* Etap T, krok 2 — pod wkładką Kuchnia: WSPÓLNY pasek zakładek+palety NA CAŁĄ SZEROKOŚĆ, NAD
          obiema kolumnami (dawniej: tylko nad prawą tabelą, przez co tabela "zjeżdżała" niżej niż
          rysunek) — dopiero POD nim rysunek (lewo) i tabela (prawo), patrz .calculatorLayout w CSS.
          Pozostałe kategorie (bez rysunku/zakładek) zostają 1-kolumnowe, jak dawniej. */}
      {activeCategory === 'kitchen' ? (
        <>
          {/* Etap S, krok 1 / Etap T, krok 2 — 5 grup kuchennych dzielą JEDEN pasek zakładek u góry
              (karuzela slajdów) — slajd niesie teraz tylko PALETĘ (nagłówek+materiały+kafelki); SAMA
              TABELA jedzie OSOBNĄ, zsynchronizowaną karuzelą w prawej kolumnie niżej (ten sam
              activeGroupKey/indeks -> oba tory przesuwają się RAZEM). Wszystkie slajdy ZOSTAJĄ w
              DOM-ie naraz (tylko nieaktywne są wizualnie przesunięte poza viewport przez `transform`
              na wspólnym "torze") — świadomy wybór: nie `display:none`/`aria-hidden`, żeby nie łamać
              istniejącej dostępności/testów (np. addModuleInGroup bez klikania zakładki). */}
          <div className={s.groupTabsWrap}>
            <div className={s.groupTabsBar} role="tablist" aria-label="Grupy szafek kuchennych">
              {CATEGORY_GROUPS.kitchen.map((entry) => {
                const count = modules.filter(module => module.group === entry.groupKey).length;
                const isActive = activeGroupKey === entry.groupKey;
                return (
                  <button
                    key={entry.groupKey}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-group-tab={entry.groupKey}
                    className={`${s.groupTabButton} ${isActive ? s.groupTabActive : ''}`}
                    onClick={() => setActiveGroupKey(entry.groupKey)}
                  >
                    {GROUP_TAB_LABELS[entry.groupKey]}
                    <span className={`${s.groupTabCount} ${count > 0 ? s.groupTabCountActive : ''}`}>({count})</span>
                  </button>
                );
              })}
            </div>
            <div className={s.groupSlidesViewport}>
              <div
                className={s.groupSlidesTrack}
                style={{ transform: `translateX(-${activeGroupIndex * 100}%)` }}
              >
                {CATEGORY_GROUPS.kitchen.map(entry => (
                  <div
                    key={entry.groupKey}
                    role="tabpanel"
                    data-group-slide={entry.groupKey}
                    data-active={activeGroupKey === entry.groupKey}
                    className={`${s.groupSlide} ${activeGroupKey === entry.groupKey ? s.groupSlideActive : ''}`}
                  >
                    {entry.isCountertop
                      ? renderCountertopPalette('kitchen', entry.groupKey, entry.presets)
                      : renderBoardGroupPalette('kitchen', entry.groupKey, entry.presets)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={s.calculatorLayout}>
            <div className={s.canvasColumn}>
              {/* Etap N, krok 3 — rysunek 2D elewacji ściany kuchennej, 1:1 w milimetrach, z
                  przestawianiem myszką (patrz WallElevationCanvas.jsx). */}
              <WallElevationCanvas
                modules={modules}
                heights={kitchenHeights}
                selectedModuleId={selectedModuleId}
                hoveredModuleId={hoveredModuleId}
                onSelectModule={selectModuleFromCanvas}
                onHoverModule={setHoveredModuleId}
                onReorder={reorderFromCanvas}
                onDropPreset={(preset, { group, index, wall }) => addModule({ ...preset, group, insertAt: index, wall })}
                roomLayout={roomLayout}
                view={canvasView}
                onViewChange={setCanvasView}
                pillars={pillars}
                zeroPoints={zeroPoints}
                installationPoints={installationPoints}
              />
            </div>
            <div className={s.groupsColumn}>
              {renderUnifiedKitchenTable()}
            </div>
          </div>
        </>
      ) : (
        CATEGORY_GROUPS[activeCategory].map(entry => (
          entry.isCountertop
            ? renderCountertopSection(activeCategory, entry.groupKey, entry.presets)
            : renderBoardGroupSection(activeCategory, entry.groupKey, entry.presets)
        ))
      )}

      {/* Etap H, krok 1 — jedna tabela kalkulacji (widoczna od razu, żywy SearchableMaterialSelect
          dla osprzętu/usług), agregująca WSZYSTKIE kategorie/grupy naraz (nie tylko aktywną
          wkładkę) — "Kalkulator szafek" liczy JEDEN, cały projekt. */}
      <h5 className={s.quoteTableTitle}>Materiały (× współczynnik {Number(projectMultiplier) || 2})</h5>
      <div className={s.tableScroll}>
        <table className={s.table}>
          <colgroup>
            <col className={s.colPozycja} />
            <col className={s.colMaterial} />
            <col className={s.colIlosc} />
            <col className={s.colCena} />
            <col className={s.colWartosc} />
            <col className={s.colPoX} />
          </colgroup>
          <thead>
            <tr>
              <th>Pozycja</th>
              <th>Wybrany materiał</th>
              <th>Ilość</th>
              <th>Cena jedn.</th>
              <th>Wartość</th>
              <th>Po ×{breakdown.multiplier}</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.materialRows.map(row => (
              <tr key={row.key}>
                <td data-label="Pozycja">{row.label}</td>
                <td data-label="Wybrany materiał" className={s.materialCell}>{materialRowCell(row)}</td>
                <td data-label="Ilość">{row.quantityLabel}</td>
                <td data-label="Cena jedn.">{row.unitPrice.toFixed(2)}</td>
                <td data-label="Wartość">{row.value.toFixed(2)}</td>
                <td data-label={`Po ×${breakdown.multiplier}`} className={s.poX}>{row.scaledValue.toFixed(2)}</td>
              </tr>
            ))}
            {breakdown.materialRows.length === 0 && (
              <tr><td colSpan={6} className={s.muted}>Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h5 className={s.quoteTableTitle}>Usługi (bez mnożnika)</h5>
      <div className={s.tableScroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Usługa</th>
              <th>Wybrana pozycja</th>
              <th>Ilość</th>
              <th>Cena jedn.</th>
              <th>Wartość</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.serviceRows.map(row => (
              <tr key={row.key}>
                <td data-label="Usługa">{row.label}</td>
                <td data-label="Wybrana pozycja" className={s.materialCell}>{serviceRowCell(row)}</td>
                <td data-label="Ilość">{row.quantity.toFixed(2)} mb</td>
                <td data-label="Cena jedn.">{row.unitPrice.toFixed(2)}</td>
                <td data-label="Wartość">{row.value.toFixed(2)}</td>
              </tr>
            ))}
            {breakdown.serviceRows.length === 0 && (
              <tr><td colSpan={5} className={s.muted}>Brak usług.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={s.totals}>
        <div className={s.totalRow}>
          <span>Suma materiałów (netto/bazowa):</span>
          <strong>{PLN(breakdown.materialsTotal)}</strong>
        </div>
        <div className={s.totalRow}>
          <span>Materiały × współczynnik (×{breakdown.multiplier}):</span>
          <strong>{PLN(breakdown.materialsScaled)}</strong>
        </div>
        <div className={s.totalRow}>
          <span>Suma usług:</span>
          <strong>{PLN(breakdown.servicesTotal)}</strong>
        </div>
        <div className={`${s.totalRow} ${s.grandTotal}`}>
          <span>RAZEM ORIENTACYJNA WYCENA:</span>
          <strong>{PLN(wycena)}</strong>
        </div>
      </div>
      <button
        type="button"
        className={s.addToProjectButton}
        disabled={!hasAnyHardwareToAdd}
        onClick={handleAddToProject}
      >
        {addedFlash ? '✓ Dodano!' : '📥 Dodaj wyliczone pozycje do projektu'}
      </button>
      </div>
      {settingsModule && (
        <CabinetSettingsModal
          module={settingsModule}
          fields={moduleFieldsFor(settingsModule)}
          wall={settingsModuleWall}
          roomLayout={roomLayout}
          hdfInGroove={effectiveHdfInGroove(settingsModule)}
          hasInternalDrawer={Number(settingsModule.internalDrawersHigh) > 0 || Number(settingsModule.internalDrawersLow) > 0}
          perUnit={computeModule(settingsModule, resolveModuleDrawerSystems(settingsModule, drawerSystemOptions))}
          onClose={() => setSettingsModuleId(null)}
          onDuplicate={() => duplicateModule(settingsModule.id)}
          onRemove={() => { removeModule(settingsModule.id); setSettingsModuleId(null); }}
          onSetWall={wallValue => setModuleWall(settingsModule.id, wallValue)}
          onPatchField={(field, value) => patchModule(settingsModule.id, field, value)}
          onSetModuleField={(field, value) => setModuleField(settingsModule.id, field, value)}
          onPatchHeight={value => patchModuleHeight(settingsModule.id, value)}
          onResetHeight={() => resetModuleHeight(settingsModule.id)}
          onToggleHdf={() => toggleHdfInGroove(settingsModule.id)}
          onApplyDrawerPreset={value => applyDrawerPreset(settingsModule.id, value)}
          onToggleInternalDrawer={() => toggleInternalDrawer(settingsModule.id)}
          onApplyFridgeStandard={value => applyFridgeStandard(settingsModule.id, value)}
        />
      )}
    </div>,
    document.body,
  );
}
