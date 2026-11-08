import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CABINET_MODULE_ORDER,
  CABINET_MODULE_TYPES,
  EXTERNAL_DRAWER_TYPES,
  INTERNAL_DRAWER_TYPES,
  buildCabinetCostBreakdown,
  computeModule,
  createCabinetModule,
  detectDrawerSystem,
  drawerTypeToSystem,
  resolveCountertopQuantity,
  summarizeCabinetModules,
} from '../utils/cabinetCalculator';
import { findCabinetDefaultMaterial } from '../utils/cabinetMaterialDefaults';
import { sortCatalogByPriority } from '../utils/catalogPriority';
import CabinetCalculatorBreakdown from './CabinetCalculatorBreakdown';
import s from './CabinetCalculator.module.css';

const PLN = value => `${Number(value || 0).toFixed(2)} zł`;
const M2 = value => `${Number(value || 0).toFixed(2)} m²`;
const MB = value => `${Number(value || 0).toFixed(2)} mb`;

const DEFAULT_SETTINGS = {
  bodyFromFrontBoard: false,
  separateTopFrontBoard: false,
  edgeBodyFromFrontColor: false,
};

// Blok 1 — które materiały/usługi z katalogu Jarvis wolno wybrać pod każdą rolę kalkulatora.
// Katalog nie ma osobnej kategorii "Blat" — stąd heurystyka po nazwie z fallbackiem na całą listę
// płyt, żeby select nigdy nie był pusty, nawet jeśli nikt jeszcze nie opisał blatu jako takiego.
const byCategory = (materials, category) => (materials || []).filter(item => item.category === category);
const byNameHint = (items, hint) => {
  const matches = (items || []).filter(item => String(item.name || '').toLocaleLowerCase('pl').includes(hint));
  return matches.length > 0 ? matches : items;
};
const byNameHints = (items, hints) => {
  const matches = (items || []).filter(item => {
    const name = String(item.name || '').toLocaleLowerCase('pl');
    return hints.some(hint => name.includes(hint));
  });
  return matches.length > 0 ? matches : items;
};

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
// od tego, co wybrano globalnie w Bloku 1 (stąd dopasowanie po nazwie, nie po roli selecta).
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

const ROLE_OPTIONS = {
  bodyMaterial: {
    label: 'Płyta korpusu', pool: (materials) => byCategory(materials, 'Płyta'),
    visible: (settings) => !settings.bodyFromFrontBoard,
  },
  frontMaterial: { label: 'Płyta frontu', pool: (materials) => byCategory(materials, 'Płyta') },
  frontMaterialTop: {
    label: 'Płyta frontu (góra)', pool: (materials) => byCategory(materials, 'Płyta'),
    visible: (settings) => settings.separateTopFrontBoard,
  },
  edgeMaterialBody: { label: 'Obrzeże korpusu', pool: (materials) => byCategory(materials, 'Obrzeże') },
  edgeMaterialFront: { label: 'Obrzeże frontu', pool: (materials) => byCategory(materials, 'Obrzeże') },
  edgeMaterialTop: {
    label: 'Obrzeże frontu (góra)', pool: (materials) => byCategory(materials, 'Obrzeże'),
    visible: (settings) => settings.separateTopFrontBoard,
  },
  hinge: { label: 'Zawiasy', pool: (materials) => byCategory(materials, 'Zawiasy') },
  drawerRunnerExternal: { label: 'Szuflada / Prowadnica zewn.', pool: drawerPool },
  drawerRunnerInternal: { label: 'Szuflada / Prowadnica wewn.', pool: drawerPool },
  legFront: {
    label: 'Nogi przednie (zwykłe)',
    pool: (materials) => byNameHints(materials, ['nóżka meblowa cokołowa', 'standardowa', 'nogi zwykłe']),
  },
  legRearAxilo: { label: 'Nogi tylne (Axilo)', pool: (materials) => byNameHint(materials, 'axilo') },
  hdfMaterial: { label: 'HDF', pool: (materials) => byNameHint(materials, 'hdf') },
  hangerMaterial: { label: 'Zawieszki', pool: (materials) => byNameHint(materials, 'zawieszka') },
  tipOnMaterial: { label: 'TIP-ON', pool: (materials) => byNameHint(materials, 'tip-on') },
  countertop: { label: 'Blat', pool: (materials) => byNameHint(materials, 'blat') },
};

const SERVICE_ROLE_OPTIONS = {
  cuttingService: { label: 'Cięcie płyty', pool: (services) => byNameHint(services, 'cięcie').length ? byNameHint(services, 'cięcie') : byNameHint(services, 'ciecie') },
  edgingService: { label: 'Oklejanie PCV', pool: (services) => byNameHint(services, 'oklej') },
};

const suggestId = (items, excludeId) => {
  const pool = items || [];
  // Niektóre role czerpią z tej samej kategorii — domyślnie nie wolno im wskazać tej samej
  // pozycji (mylące: dwa różne selecty, jedna i ta sama płyta/kromka). Jeśli po wykluczeniu
  // zostanie choć jedna opcja, bierzemy z niej; inaczej (katalog ma tylko tę jedną pozycję) — z
  // pełnej puli, bo pusty wybór byłby gorszy niż powtórzony.
  const filtered = excludeId ? pool.filter(item => item.id !== excludeId) : pool;
  return sortCatalogByPriority(filtered.length > 0 ? filtered : pool)[0]?.id ?? '';
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

// Jedna zwarta linijka pod wierszem modułu — tylko niezerowe wielkości, w ustalonej kolejności.
const moduleLineSummary = (module, options) => {
  const perUnit = computeModule(module, resolveModuleDrawerSystems(module, options));
  const qty = Math.max(0, Number(module.qty) || 0);
  const edge = (perUnit.bodyEdgeMeters + perUnit.frontEdgeMeters) * qty;
  const parts = [
    perUnit.bodyAreaM2 > 0 && `Korpus: ${M2(perUnit.bodyAreaM2 * qty)}`,
    perUnit.frontAreaM2 > 0 && `Front: ${M2(perUnit.frontAreaM2 * qty)}`,
    edge > 0 && `Obrzeże: ${MB(edge)}`,
    perUnit.hinges > 0 && `Zawiasy: ${perUnit.hinges * qty} szt.`,
    perUnit.externalDrawerSets > 0 && `Szufl. zewn.: ${perUnit.externalDrawerSets * qty} kpl.`,
    perUnit.internalDrawerSets > 0 && `Szufl. wewn.: ${perUnit.internalDrawerSets * qty} kpl.`,
    (perUnit.frontLegs + perUnit.rearAxiloLegs) > 0 && `Nogi: ${(perUnit.frontLegs + perUnit.rearAxiloLegs) * qty} szt.`,
    perUnit.hangers > 0 && `Zawieszki: ${perUnit.hangers * qty} szt.`,
    perUnit.tipOnUnits > 0 && `TIP-ON: ${perUnit.tipOnUnits * qty} szt.`,
    perUnit.countertopMeters > 0 && `Blat: ${MB(perUnit.countertopMeters * qty)}`,
  ].filter(Boolean);
  return parts.length > 0 ? `↳ ${parts.join(' · ')}` : '↳ —';
};

// Pola geometrii/liczników widoczne w wierszu modułu — zależą od tego, co dany typ faktycznie
// liczy (np. countertop nie ma wysokości ani drzwi).
const moduleFieldsFor = (type) => {
  const defaults = CABINET_MODULE_TYPES[type].defaults;
  return {
    hasH: 'H' in defaults,
    hasDoors: 'doors' in defaults,
    hasShelves: 'shelves' in defaults,
    hasDrawers: 'externalDrawers' in defaults,
    hasBody: type !== 'countertop',
    hasTopFrontToggle: type === 'tall_cabinet' || type === 'wardrobe_section',
    hasTipOn: 'doors' in defaults,
  };
};

const EXTERNAL_DRAWER_TYPE_OPTIONS = [
  { value: 'inherit', label: '(domyślny wybór z Bloku 1)' },
  { value: 'merivobox_e', label: 'MERIVOBOX E wysoka' },
  { value: 'merivobox_m', label: 'MERIVOBOX M niska pod piekarnikiem' },
  { value: 'tandem', label: 'TANDEM' },
];
const INTERNAL_DRAWER_TYPE_OPTIONS = [
  { value: 'merivobox_m', label: 'MERIVOBOX M niska wewn.' },
  { value: 'merivobox_e', label: 'MERIVOBOX E wysoka wewn. ze szkłem' },
];

export default function CabinetCalculator({
  materials, servicesList, projectMultiplier, onAddToProject, initialState, onStateChange, saveStatus,
}) {
  const fieldsetId = useId();
  const [modules, setModules] = useState(() => initialState?.modules || []);
  const [selection, setSelection] = useState(() => initialState?.selection || {});
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(initialState?.settings || {}) }));
  const [addedFlash, setAddedFlash] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Autozapis do projektu (projects.calculator_state) — debounce i status "✓ Zapisano w
  // projekcie" robi rodzic (ProjectModal, useProjectItemsAutosave); tu tylko zgłaszamy KAŻDĄ
  // zmianę stanu, pomijając pierwszy render (inicjalizację z initialState, nie trzeba zapisywać
  // tego, co właśnie wczytaliśmy z tego samego projektu).
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return; }
    onStateChangeRef.current?.({ modules, selection, settings });
  }, [modules, selection, settings]);

  // Komponenty zestawów (MERIVOBOX i inne, is_kit_component=true) nie są samodzielną pozycją —
  // kalkulator proponuje wyłącznie gotowe komplety do wyboru, nigdy ich boczki/mocowania osobno.
  const selectableMaterials = useMemo(() => (materials || []).filter(item => !item.is_kit_component), [materials]);
  const materialPools = useMemo(() => (
    Object.fromEntries(Object.entries(ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(selectableMaterials))]
    )))
  ), [selectableMaterials]);
  const servicePools = useMemo(() => (
    Object.fromEntries(Object.entries(SERVICE_ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(servicesList))]
    )))
  ), [servicesList]);

  const selectedId = (role, pools) => {
    if (selection[role] !== undefined) return selection[role];
    const catalogueDefault = findCabinetDefaultMaterial(pools[role], role);
    if (catalogueDefault) return catalogueDefault.id;
    if (role === 'frontMaterial') return suggestId(pools[role], selectedId('bodyMaterial', pools));
    if (role === 'edgeMaterialFront') return suggestId(pools[role], selectedId('edgeMaterialBody', pools));
    if (role === 'drawerRunnerInternal') {
      // Domyślnie podsuń pozycję nazwaną "wewnętrzna" (np. MERIVOBOX M); jeśli katalog nie ma
      // takiej, bezpieczniej wziąć tę samą pozycję co zewnętrzna niż przypadkową z puli.
      const internalNamed = (pools[role] || []).filter(item => (
        String(item.name || '').toLocaleLowerCase('pl').includes('wewnętrzna')
      ));
      if (internalNamed.length > 0) return suggestId(internalNamed);
      return selectedId('drawerRunnerExternal', pools);
    }
    return suggestId(pools[role]);
  };
  const selectedItem = (role, pools, source) => (source || []).find(item => item.id === selectedId(role, pools));

  const setRole = (role, value) => setSelection(current => ({ ...current, [role]: value }));
  const toggleSetting = (key) => setSettings(current => ({ ...current, [key]: !current[key] }));

  const addModule = (type) => setModules(current => [...current, {
    id: nextModuleId(),
    ...createCabinetModule(type),
    ...((type === 'tall_cabinet' || type === 'wardrobe_section') ? { frontPosition: 'dol' } : {}),
  }]);
  const removeModule = (id) => setModules(current => current.filter(module => module.id !== id));
  const patchModule = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: Math.max(0, Number(value) || 0) } : module
  )));
  const setModuleField = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: value } : module
  )));
  const toggleModuleFlag = (id, field) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: !module[field] } : module
  )));
  const toggleInternalDrawer = (id) => setModules(current => current.map((module) => {
    if (module.id !== id) return module;
    const hasInternal = Number(module.internalDrawers) > 0;
    return { ...module, internalDrawers: hasInternal ? 0 : 1 };
  }));

  // Nie ma sensu memoizować — to kilka odczytów pola .price, tańsze niż porównywanie deps.
  // selections idzie wprost do buildCabinetCostBreakdown — on jest jedynym źródłem sum (tak samo
  // dla głównego wiersza Orientacyjna wycena, jak i dla modalu Szczegóły wyceny), żeby oba miejsca
  // nigdy nie mogły się rozjechać przez dwa niezależne sposoby liczenia.
  const selections = {
    bodyMaterial: selectedItem('bodyMaterial', materialPools, materials),
    frontMaterial: selectedItem('frontMaterial', materialPools, materials),
    frontMaterialTop: selectedItem('frontMaterialTop', materialPools, materials),
    edgeMaterialBody: selectedItem('edgeMaterialBody', materialPools, materials),
    edgeMaterialFront: selectedItem('edgeMaterialFront', materialPools, materials),
    edgeMaterialTop: selectedItem('edgeMaterialTop', materialPools, materials),
    hinge: selectedItem('hinge', materialPools, materials),
    drawerRunnerExternal: selectedItem('drawerRunnerExternal', materialPools, materials),
    drawerRunnerInternal: selectedItem('drawerRunnerInternal', materialPools, materials),
    legFront: selectedItem('legFront', materialPools, materials),
    legRearAxilo: selectedItem('legRearAxilo', materialPools, materials),
    hdfMaterial: selectedItem('hdfMaterial', materialPools, materials),
    hangerMaterial: selectedItem('hangerMaterial', materialPools, materials),
    tipOnMaterial: selectedItem('tipOnMaterial', materialPools, materials),
    countertop: selectedItem('countertop', materialPools, materials),
    cuttingService: selectedItem('cuttingService', servicePools, servicesList),
    edgingService: selectedItem('edgingService', servicePools, servicesList),
  };
  // Etap B: szuflady mogą mieć inny system PER MODUŁ (chip w wierszu) niż globalny wybór z Bloku
  // 1 — stąd oba warianty dla każdej z 4/3 możliwych "typów" (inherit + konkretne systemy),
  // rozwiązane tu raz, żeby modal i "Dodaj do projektu" korzystały z tych samych pozycji.
  const externalDrawerByType = {
    inherit: selections.drawerRunnerExternal,
    merivobox_e: findDrawerMaterial(selectableMaterials, 'merivobox_e', 'external'),
    merivobox_m: findDrawerMaterial(selectableMaterials, 'merivobox_m', 'external'),
    tandem: findDrawerMaterial(selectableMaterials, 'tandem', 'external'),
  };
  const internalDrawerByType = {
    inherit: selections.drawerRunnerInternal,
    merivobox_e: findDrawerMaterial(selectableMaterials, 'merivobox_e', 'internal'),
    merivobox_m: findDrawerMaterial(selectableMaterials, 'merivobox_m', 'internal'),
  };
  const breakdownSelections = { ...selections, externalDrawerByType, internalDrawerByType };

  // Geometria короba szuflady zależy od tego, CO wybrano w Bloku 1 (MERIVOBOX/TANDEMBOX/LEGRABOX
  // = gotowy metalowy bок, inaczej = drewniany korpus na zwykłych prowadnicach) — to ustawienie
  // kalkulatora, nie pojedynczego modułu, stąd liczone tu i przekazywane jako options. Prymitywy
  // (nie obiekt) w deps useMemo, żeby nie memoizować na referencji, która i tak zmienia się co render.
  const externalDrawerSystem = detectDrawerSystem(selections.drawerRunnerExternal?.name);
  const internalDrawerSystem = detectDrawerSystem(selections.drawerRunnerInternal?.name);
  const drawerSystemOptions = { externalDrawerSystem, internalDrawerSystem };
  const summaryOptions = { ...drawerSystemOptions, ...settings };
  // Jak selections/breakdown niżej — nie ma sensu memoizować: summarizeCabinetModules jest tanie
  // (kilkadziesiąt modułów na sesję), a zależałoby i tak od nie-memoizowanych selections.
  const summary = summarizeCabinetModules(modules, summaryOptions);
  const breakdown = buildCabinetCostBreakdown(summary, breakdownSelections, projectMultiplier);
  const wycena = breakdown.wycena;

  const handleAddToProject = () => {
    const countertopQuantity = resolveCountertopQuantity(summary.countertopMeters, selections.countertop?.unit);
    const materialLines = [
      [selections.bodyMaterial, summary.bodySheets],
      [selections.frontMaterial, summary.frontSheets],
      [selections.frontMaterialTop, summary.frontTopSheets],
      [selections.edgeMaterialBody, Math.ceil(summary.bodyEdgeMeters)],
      [selections.edgeMaterialFront, Math.ceil(summary.frontEdgeMeters)],
      [selections.edgeMaterialTop, Math.ceil(summary.frontEdgeMetersTop)],
      [selections.hinge, summary.hinges],
      ...EXTERNAL_DRAWER_TYPES.map(type => [externalDrawerByType[type], summary.externalDrawersByType?.[type]]),
      ...INTERNAL_DRAWER_TYPES.map(type => [internalDrawerByType[type], summary.internalDrawersByType?.[type]]),
      [selections.countertop, countertopQuantity],
      [selections.hdfMaterial, summary.hdfSheets],
      [selections.legFront, summary.frontLegs],
      [selections.legRearAxilo, summary.rearAxiloLegs],
      [selections.hangerMaterial, summary.hangers],
      [selections.tipOnMaterial, summary.tipOnUnits],
    ]
      .filter(([item, quantity]) => item && quantity > 0)
      .map(([item, quantity]) => ({ item, quantity }));

    const serviceLines = [
      [selections.cuttingService, Number(summary.cuttingMeters.toFixed(2))],
      [selections.edgingService, Number(summary.edgeMeters.toFixed(2))],
    ]
      .filter(([item, quantity]) => item && quantity > 0)
      .map(([item, quantity]) => ({ item, quantity }));

    if (materialLines.length === 0 && serviceLines.length === 0) return;
    onAddToProject({ materialLines, serviceLines });
    setAddedFlash(true);
    window.setTimeout(() => setAddedFlash(false), 2000);
  };

  const hasAnyHardwareToAdd = summary.bodySheets > 0 || summary.frontSheets > 0 || summary.frontTopSheets > 0
    || summary.edgeMeters > 0 || summary.hinges > 0 || summary.externalDrawerSets > 0 || summary.internalDrawerSets > 0
    || summary.countertopMeters > 0 || summary.hdfSheets > 0 || summary.frontLegs > 0 || summary.hangers > 0
    || summary.tipOnUnits > 0;

  const saveStatusText = saveStatus === 'saving' ? '⏳ Zapisywanie…'
    : saveStatus === 'error' ? '⚠ Błąd zapisu w projekcie'
    : saveStatus === 'saved' ? '✓ Zapisano w projekcie'
    : null;

  return (
    <div className={s.panel} aria-labelledby={fieldsetId}>
      {/* h4 zostaje bezpośrednim dziecku .panel (nie owijamy go w dodatkowy div) — e2e lokalizuje
          cały panel przez getByText(tytuł).locator('..'), dodatkowy wrapper by to złamał. */}
      <h4 id={fieldsetId} className={s.title}>📐 Kalkulator szafek — Szybka wycena</h4>
      {saveStatusText && <span role="status" className={s.saveStatus} data-variant={saveStatus}>{saveStatusText}</span>}

      {/* Blok 1 — materiały i usługi z katalogu pod wyliczone pozycje. */}
      <div className={s.materialsGrid}>
        {Object.entries(ROLE_OPTIONS).filter(([, config]) => !config.visible || config.visible(settings)).map(([role, config]) => (
          <label key={role} className={s.materialField}>
            <span>{config.label}</span>
            <select value={selectedId(role, materialPools)} onChange={event => setRole(role, event.target.value)}>
              <option value="">— nie wybrano —</option>
              {materialPools[role].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ))}
        {Object.entries(SERVICE_ROLE_OPTIONS).map(([role, config]) => (
          <label key={role} className={s.materialField}>
            <span>{config.label} (usługa)</span>
            <select value={selectedId(role, servicePools)} onChange={event => setRole(role, event.target.value)}>
              <option value="">— nie wybrano —</option>
              {servicePools[role].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ))}
      </div>

      {/* Lestnicza ustawień — opcje domyślnie zwinięte, nie przeszkadzają, kiedy nie są używane. */}
      <div className={s.ladderRow}>
        <label className={s.ladderCheckbox}>
          <input type="checkbox" checked={settings.bodyFromFrontBoard} onChange={() => toggleSetting('bodyFromFrontBoard')} />
          Korpus z płyty frontowej
        </label>
        <label className={s.ladderCheckbox}>
          <input type="checkbox" checked={settings.separateTopFrontBoard} onChange={() => toggleSetting('separateTopFrontBoard')} />
          Osobna płyta dla frontów górnych (3 rodzaje płyt)
        </label>
        <label className={s.ladderCheckbox}>
          <input type="checkbox" checked={settings.edgeBodyFromFrontColor} onChange={() => toggleSetting('edgeBodyFromFrontColor')} />
          Oklej przody korpusu obrzeżem frontowym
        </label>
      </div>

      {/* Blok 2 — dodawanie modułów w 1 klik. */}
      <div className={s.addModuleRow}>
        {CABINET_MODULE_ORDER.map((type) => {
          const definition = CABINET_MODULE_TYPES[type];
          return (
            <button key={type} type="button" className={s.addModuleButton} onClick={() => addModule(type)}>
              + {definition.icon} {definition.label}
            </button>
          );
        })}
      </div>

      {/* Blok 3 — lista dodanych modułów + żywe podsumowanie. */}
      {modules.length === 0 ? (
        <p className={s.empty}>Dodaj pierwszy moduł powyżej, żeby zobaczyć wyliczenie.</p>
      ) : (
        <ul className={s.moduleList}>
          {modules.map((module) => {
            const definition = CABINET_MODULE_TYPES[module.type];
            const fields = moduleFieldsFor(module.type);
            const hasInternalDrawer = Number(module.internalDrawers) > 0;
            return (
              <li key={module.id} className={s.moduleRow}>
                <div className={s.moduleRowMain}>
                  <span className={s.moduleName}>{definition.icon} {definition.label}</span>
                  <label className={s.dimField}>Szer. (mm)
                    <input type="number" min="0" value={module.W} onChange={event => patchModule(module.id, 'W', event.target.value)} />
                  </label>
                  {fields.hasH && (
                    <label className={s.dimField}>Wys. (mm)
                      <input type="number" min="0" value={module.H} onChange={event => patchModule(module.id, 'H', event.target.value)} />
                    </label>
                  )}
                  <label className={s.dimField}>Gł. (mm)
                    <input type="number" min="0" value={module.D} onChange={event => patchModule(module.id, 'D', event.target.value)} />
                  </label>
                  {fields.hasDoors && (
                    <label className={s.countField}>Drzwi
                      <input type="number" min="0" value={module.doors} onChange={event => patchModule(module.id, 'doors', event.target.value)} />
                    </label>
                  )}
                  {fields.hasShelves && (
                    <label className={s.countField}>Półki
                      <input type="number" min="0" value={module.shelves} onChange={event => patchModule(module.id, 'shelves', event.target.value)} />
                    </label>
                  )}
                  {fields.hasDrawers && (
                    <label className={s.countField}>Szufl. zewn.
                      <input type="number" min="0" value={module.externalDrawers} onChange={event => patchModule(module.id, 'externalDrawers', event.target.value)} />
                    </label>
                  )}
                  <label className={s.countField}>Ilość
                    <input type="number" min="0" value={module.qty} onChange={event => patchModule(module.id, 'qty', event.target.value)} />
                  </label>
                  <button type="button" className={s.removeButton} onClick={() => removeModule(module.id)} aria-label={`Usuń moduł ${definition.label}`}>×</button>
                </div>

                {/* Lestnicza chipów modułu — tylko te, które mają sens dla tego typu. */}
                <div className={s.chipsRow}>
                  {fields.hasBody && (
                    <label className={s.chip}>
                      <input
                        type="checkbox"
                        checked={Boolean(module.bodyFromFront)}
                        onChange={() => toggleModuleFlag(module.id, 'bodyFromFront')}
                      />
                      Korpus = Front
                    </label>
                  )}
                  {fields.hasBody && (
                    <label className={s.chip}>
                      <input
                        type="checkbox"
                        checked={Boolean(module.edgeFromFront)}
                        onChange={() => toggleModuleFlag(module.id, 'edgeFromFront')}
                      />
                      Obrzeże = Front
                    </label>
                  )}
                  {fields.hasTopFrontToggle && settings.separateTopFrontBoard && (
                    <div className={s.segmented} role="group" aria-label="Pozycja frontu">
                      <button
                        type="button"
                        data-active={module.frontPosition !== 'gora'}
                        onClick={() => setModuleField(module.id, 'frontPosition', 'dol')}
                      >Front dół</button>
                      <button
                        type="button"
                        data-active={module.frontPosition === 'gora'}
                        onClick={() => setModuleField(module.id, 'frontPosition', 'gora')}
                      >Front góra</button>
                    </div>
                  )}
                  {fields.hasDrawers && (
                    <label className={s.chipSelect}>Typ szuflady zewn.
                      <select
                        value={module.drawerType || 'inherit'}
                        onChange={event => setModuleField(module.id, 'drawerType', event.target.value === 'inherit' ? undefined : event.target.value)}
                      >
                        {EXTERNAL_DRAWER_TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {fields.hasDrawers && (
                    <label className={s.chip}>
                      <input type="checkbox" checked={hasInternalDrawer} onChange={() => toggleInternalDrawer(module.id)} />
                      + Szufl. wewnętrzna
                    </label>
                  )}
                  {fields.hasTipOn && (
                    <label className={s.chip}>
                      <input type="checkbox" checked={Boolean(module.tipOn)} onChange={() => toggleModuleFlag(module.id, 'tipOn')} />
                      + TIP-ON
                    </label>
                  )}
                </div>

                {hasInternalDrawer && (
                  <p className={s.innerDrawerStep}>
                    ↳ Wewnętrzna:
                    <input
                      type="number" min="1" className={s.innerDrawerCount}
                      aria-label="Szufl. wewn."
                      value={module.internalDrawers}
                      onChange={event => patchModule(module.id, 'internalDrawers', event.target.value)}
                    /> szt. · Typ:
                    <select
                      aria-label="Typ szuflady wewn."
                      value={module.internalDrawerType || 'merivobox_m'}
                      onChange={event => setModuleField(module.id, 'internalDrawerType', event.target.value)}
                    >
                      {INTERNAL_DRAWER_TYPE_OPTIONS.map((option) => {
                        const item = internalDrawerByType[option.value];
                        const priceLabel = item ? ` (${Number(item.price).toFixed(0)} zł)` : '';
                        return <option key={option.value} value={option.value}>{option.label}{priceLabel}</option>;
                      })}
                    </select>
                  </p>
                )}

                <p className={s.moduleLine}>{moduleLineSummary(module, drawerSystemOptions)}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className={s.summary}>
        <div className={s.summaryGrid}>
          <span>Korpus: {M2(summary.bodyAreaM2)} → <strong>{summary.bodySheets}</strong> ark.</span>
          <span>Front: {M2(summary.frontAreaM2)} → <strong>{summary.frontSheets}</strong> ark.</span>
          {settings.separateTopFrontBoard && (
            <span>Front góra: {M2(summary.frontTopAreaM2)} → <strong>{summary.frontTopSheets}</strong> ark.</span>
          )}
          <span>HDF: {M2(summary.hdfAreaM2)} → <strong>{summary.hdfSheets}</strong> ark.</span>
          <span>Zawiasy: <strong>{summary.hinges}</strong> szt.</span>
          <span>Szuflady zewn.: <strong>{summary.externalDrawerSets}</strong> kpl.</span>
          {summary.internalDrawerSets > 0 && <span>Szuflady wewn.: <strong>{summary.internalDrawerSets}</strong> kpl.</span>}
          <span>Nogi przednie: <strong>{summary.frontLegs}</strong> szt.</span>
          <span>Nogi Axilo: <strong>{summary.rearAxiloLegs}</strong> szt.</span>
          <span>Zawieszki: <strong>{summary.hangers}</strong> szt.</span>
          {summary.tipOnUnits > 0 && <span>TIP-ON: <strong>{summary.tipOnUnits}</strong> szt.</span>}
          <span>Cięcie płyty: {MB(summary.cuttingMeters)}</span>
          <span>Obrzeże ABS: {MB(summary.edgeMeters)}</span>
          {summary.countertopMeters > 0 && <span>Blat: {MB(summary.countertopMeters)}</span>}
        </div>
        <div className={s.wycenaRow}>
          <span className={s.wycenaLabel}>Orientacyjna wycena (×{Number(projectMultiplier) || 2}):</span>
          <button type="button" className={s.wycenaValue} onClick={() => setBreakdownOpen(true)}>
            {PLN(wycena)}
          </button>
        </div>
        <button
          type="button"
          className={s.detailsButton}
          disabled={!hasAnyHardwareToAdd}
          onClick={() => setBreakdownOpen(true)}
        >
          🔍 Szczegóły wyceny
        </button>
        <button
          type="button"
          className={s.addToProjectButton}
          disabled={!hasAnyHardwareToAdd}
          onClick={handleAddToProject}
        >
          {addedFlash ? '✓ Dodano!' : '📥 Dodaj wyliczone pozycje do projektu'}
        </button>
      </div>

      {breakdownOpen && (
        <CabinetCalculatorBreakdown breakdown={breakdown} onClose={() => setBreakdownOpen(false)} />
      )}
    </div>
  );
}
