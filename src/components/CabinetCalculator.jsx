import { useId, useMemo, useState } from 'react';
import {
  CABINET_MODULE_ORDER,
  CABINET_MODULE_TYPES,
  buildCabinetCostBreakdown,
  computeModule,
  createCabinetModule,
  detectDrawerSystem,
  resolveCountertopQuantity,
  summarizeCabinetModules,
} from '../utils/cabinetCalculator';
import { sortCatalogByPriority } from '../utils/catalogPriority';
import CabinetCalculatorBreakdown from './CabinetCalculatorBreakdown';
import s from './CabinetCalculator.module.css';

const PLN = value => `${Number(value || 0).toFixed(2)} zł`;
const M2 = value => `${Number(value || 0).toFixed(2)} m²`;
const MB = value => `${Number(value || 0).toFixed(2)} mb`;

// Blok 1 — które materiały/usługi z katalogu Jarvis wolno wybrać pod każdą rolę kalkulatora.
// Katalog nie ma osobnej kategorii "Blat" — stąd heurystyka po nazwie z fallbackiem na całą listę
// płyt, żeby select nigdy nie był pusty, nawet jeśli nikt jeszcze nie opisał blatu jako takiego.
const byCategory = (materials, category) => (materials || []).filter(item => item.category === category);
const byNameHint = (items, hint) => {
  const matches = (items || []).filter(item => String(item.name || '').toLocaleLowerCase('pl').includes(hint));
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

const ROLE_OPTIONS = {
  bodyMaterial: { label: 'Płyta korpusu', pool: (materials) => byCategory(materials, 'Płyta') },
  frontMaterial: { label: 'Płyta frontu', pool: (materials) => byCategory(materials, 'Płyta') },
  edgeMaterial: { label: 'Obrzeże ABS', pool: (materials) => byCategory(materials, 'Obrzeże') },
  hinge: { label: 'Zawiasy', pool: (materials) => byCategory(materials, 'Zawiasy') },
  drawerRunnerExternal: { label: 'Szuflada / Prowadnica zewn.', pool: drawerPool },
  drawerRunnerInternal: { label: 'Szuflada / Prowadnica wewn.', pool: drawerPool },
  countertop: { label: 'Blat', pool: (materials) => byNameHint(materials, 'blat') },
};

const SERVICE_ROLE_OPTIONS = {
  cuttingService: { label: 'Cięcie płyty', pool: (services) => byNameHint(services, 'cięcie').length ? byNameHint(services, 'cięcie') : byNameHint(services, 'ciecie') },
  edgingService: { label: 'Oklejanie PCV', pool: (services) => byNameHint(services, 'oklej') },
};

const suggestId = (items, excludeId) => {
  const pool = items || [];
  // Płyta korpusu i Płyta frontu czerpią z tej samej kategorii — domyślnie nie wolno im wskazać
  // tej samej pozycji (mylące: dwa różne selecty, jedna i ta sama płyta). Jeśli po wykluczeniu
  // zostanie choć jedna opcja, bierzemy z niej; inaczej (katalog ma tylko tę jedną płytę) — z
  // pełnej puli, bo pusty wybór byłby gorszy niż powtórzony.
  const filtered = excludeId ? pool.filter(item => item.id !== excludeId) : pool;
  return sortCatalogByPriority(filtered.length > 0 ? filtered : pool)[0]?.id ?? '';
};

let moduleSeq = 0;
const nextModuleId = () => {
  moduleSeq += 1;
  return `cab-${Date.now()}-${moduleSeq}`;
};

// Jedna zwarta linijka pod wierszem modułu — tylko niezerowe wielkości, w ustalonej kolejności.
// options — wybrany w Bloku 1 system szuflad (metal/wood), patrz detectDrawerSystem.
const moduleLineSummary = (module, options) => {
  const perUnit = computeModule(module, options);
  const qty = Math.max(0, Number(module.qty) || 0);
  const edge = (perUnit.bodyEdgeMeters + perUnit.frontEdgeMeters) * qty;
  const parts = [
    perUnit.bodyAreaM2 > 0 && `Korpus: ${M2(perUnit.bodyAreaM2 * qty)}`,
    perUnit.frontAreaM2 > 0 && `Front: ${M2(perUnit.frontAreaM2 * qty)}`,
    edge > 0 && `Obrzeże: ${MB(edge)}`,
    perUnit.hinges > 0 && `Zawiasy: ${perUnit.hinges * qty} szt.`,
    perUnit.externalDrawerSets > 0 && `Szufl. zewn.: ${perUnit.externalDrawerSets * qty} kpl.`,
    perUnit.internalDrawerSets > 0 && `Szufl. wewn.: ${perUnit.internalDrawerSets * qty} kpl.`,
    perUnit.legs > 0 && `Nogi: ${perUnit.legs * qty} szt.`,
    perUnit.hangers > 0 && `Zawieszki: ${perUnit.hangers * qty} szt.`,
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
  };
};

export default function CabinetCalculator({ materials, servicesList, projectMultiplier, onAddToProject }) {
  const fieldsetId = useId();
  const [modules, setModules] = useState([]);
  const [selection, setSelection] = useState({});
  const [addedFlash, setAddedFlash] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

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
    if (role === 'frontMaterial') return suggestId(pools[role], selectedId('bodyMaterial', pools));
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

  const addModule = (type) => setModules(current => [...current, { id: nextModuleId(), ...createCabinetModule(type) }]);
  const removeModule = (id) => setModules(current => current.filter(module => module.id !== id));
  const patchModule = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: Math.max(0, Number(value) || 0) } : module
  )));

  // Nie ma sensu memoizować — to kilka odczytów pola .price, tańsze niż porównywanie deps.
  // selections idzie wprost do buildCabinetCostBreakdown — on jest jedynym źródłem sum (tak samo
  // dla głównego wiersza Orientacyjna wycena, jak i dla modalu Szczegóły wyceny), żeby oba miejsca
  // nigdy nie mogły się rozjechać przez dwa niezależne sposoby liczenia.
  const selections = {
    bodyMaterial: selectedItem('bodyMaterial', materialPools, materials),
    frontMaterial: selectedItem('frontMaterial', materialPools, materials),
    edgeMaterial: selectedItem('edgeMaterial', materialPools, materials),
    hinge: selectedItem('hinge', materialPools, materials),
    drawerRunnerExternal: selectedItem('drawerRunnerExternal', materialPools, materials),
    drawerRunnerInternal: selectedItem('drawerRunnerInternal', materialPools, materials),
    countertop: selectedItem('countertop', materialPools, materials),
    cuttingService: selectedItem('cuttingService', servicePools, servicesList),
    edgingService: selectedItem('edgingService', servicePools, servicesList),
  };
  // Geometria короba szuflady zależy od tego, CO wybrano w Bloku 1 (MERIVOBOX/TANDEMBOX/LEGRABOX
  // = gotowy metalowy bок, inaczej = drewniany korpus na zwykłych prowadnicach) — to ustawienie
  // kalkulatora, nie pojedynczego modułu, stąd liczone tu i przekazywane jako options. Prymitywy
  // (nie obiekt) w deps useMemo, żeby nie memoizować na referencji, która i tak zmienia się co render.
  const externalDrawerSystem = detectDrawerSystem(selections.drawerRunnerExternal?.name);
  const internalDrawerSystem = detectDrawerSystem(selections.drawerRunnerInternal?.name);
  const drawerSystemOptions = { externalDrawerSystem, internalDrawerSystem };
  // Jak selections/breakdown niżej — nie ma sensu memoizować: summarizeCabinetModules jest tanie
  // (kilkadziesiąt modułów na sesję), a zależałoby i tak od nie-memoizowanych selections.
  const summary = summarizeCabinetModules(modules, drawerSystemOptions);
  const breakdown = buildCabinetCostBreakdown(summary, selections, projectMultiplier);
  const wycena = breakdown.wycena;

  const handleAddToProject = () => {
    const countertopQuantity = resolveCountertopQuantity(summary.countertopMeters, selections.countertop?.unit);
    const materialLines = [
      [selections.bodyMaterial, summary.bodySheets],
      [selections.frontMaterial, summary.frontSheets],
      [selections.edgeMaterial, Math.ceil(summary.edgeMeters)],
      [selections.hinge, summary.hinges],
      [selections.drawerRunnerExternal, summary.externalDrawerSets],
      [selections.drawerRunnerInternal, summary.internalDrawerSets],
      [selections.countertop, countertopQuantity],
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

  const hasAnyHardwareToAdd = summary.bodySheets > 0 || summary.frontSheets > 0 || summary.edgeMeters > 0
    || summary.hinges > 0 || summary.externalDrawerSets > 0 || summary.internalDrawerSets > 0
    || summary.countertopMeters > 0;

  return (
    <div className={s.panel} aria-labelledby={fieldsetId}>
      <h4 id={fieldsetId} className={s.title}>📐 Kalkulator szafek — Szybka wycena</h4>

      {/* Blok 1 — materiały i usługi z katalogu pod wyliczone pozycje. */}
      <div className={s.materialsGrid}>
        {Object.entries(ROLE_OPTIONS).map(([role, config]) => (
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
                    <>
                      <label className={s.countField}>Szufl. zewn.
                        <input type="number" min="0" value={module.externalDrawers} onChange={event => patchModule(module.id, 'externalDrawers', event.target.value)} />
                      </label>
                      <label className={s.countField}>Szufl. wewn.
                        <input type="number" min="0" value={module.internalDrawers} onChange={event => patchModule(module.id, 'internalDrawers', event.target.value)} />
                      </label>
                    </>
                  )}
                  <label className={s.countField}>Ilość
                    <input type="number" min="0" value={module.qty} onChange={event => patchModule(module.id, 'qty', event.target.value)} />
                  </label>
                  <button type="button" className={s.removeButton} onClick={() => removeModule(module.id)} aria-label={`Usuń moduł ${definition.label}`}>×</button>
                </div>
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
          <span>HDF: {M2(summary.hdfAreaM2)} → <strong>{summary.hdfSheets}</strong> ark.</span>
          <span>Zawiasy: <strong>{summary.hinges}</strong> szt.</span>
          <span>Szuflady zewn.: <strong>{summary.externalDrawerSets}</strong> kpl.</span>
          {summary.internalDrawerSets > 0 && <span>Szuflady wewn.: <strong>{summary.internalDrawerSets}</strong> kpl.</span>}
          <span>Nogi: <strong>{summary.legs}</strong> szt.</span>
          <span>Zawieszki: <strong>{summary.hangers}</strong> szt.</span>
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
