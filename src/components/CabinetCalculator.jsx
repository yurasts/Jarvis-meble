import { useId, useMemo, useState } from 'react';
import {
  CABINET_MODULE_ORDER,
  CABINET_MODULE_TYPES,
  calculateCabinetMaterialsCost,
  calculateCabinetWycena,
  computeModule,
  createCabinetModule,
  summarizeCabinetModules,
} from '../utils/cabinetCalculator';
import { sortCatalogByPriority } from '../utils/catalogPriority';
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

const ROLE_OPTIONS = {
  bodyMaterial: { label: 'Płyta korpusu', pool: (materials) => byCategory(materials, 'Płyta') },
  frontMaterial: { label: 'Płyta frontu', pool: (materials) => byCategory(materials, 'Płyta') },
  edgeMaterial: { label: 'Obrzeże ABS', pool: (materials) => byCategory(materials, 'Obrzeże') },
  hinge: { label: 'Zawiasy', pool: (materials) => byCategory(materials, 'Zawiasy') },
  drawerRunner: { label: 'Prowadnice', pool: (materials) => byCategory(materials, 'Prowadnice') },
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
const moduleLineSummary = (module) => {
  const perUnit = computeModule(module);
  const qty = Math.max(0, Number(module.qty) || 0);
  const edge = (perUnit.bodyEdgeMeters + perUnit.frontEdgeMeters) * qty;
  const parts = [
    perUnit.bodyAreaM2 > 0 && `Korpus: ${M2(perUnit.bodyAreaM2 * qty)}`,
    perUnit.frontAreaM2 > 0 && `Front: ${M2(perUnit.frontAreaM2 * qty)}`,
    edge > 0 && `Obrzeże: ${MB(edge)}`,
    perUnit.hinges > 0 && `Zawiasy: ${perUnit.hinges * qty} szt.`,
    perUnit.drawerSets > 0 && `Prowadnice: ${perUnit.drawerSets * qty} kpl.`,
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
    hasDrawers: 'drawers' in defaults,
  };
};

export default function CabinetCalculator({ materials, servicesList, projectMultiplier, onAddToProject }) {
  const fieldsetId = useId();
  const [modules, setModules] = useState([]);
  const [selection, setSelection] = useState({});
  const [addedFlash, setAddedFlash] = useState(false);

  const materialPools = useMemo(() => (
    Object.fromEntries(Object.entries(ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(materials))]
    )))
  ), [materials]);
  const servicePools = useMemo(() => (
    Object.fromEntries(Object.entries(SERVICE_ROLE_OPTIONS).map(([role, config]) => (
      [role, sortCatalogByPriority(config.pool(servicesList))]
    )))
  ), [servicesList]);

  const selectedId = (role, pools) => {
    if (selection[role] !== undefined) return selection[role];
    if (role === 'frontMaterial') return suggestId(pools[role], selectedId('bodyMaterial', pools));
    return suggestId(pools[role]);
  };
  const selectedItem = (role, pools, source) => (source || []).find(item => item.id === selectedId(role, pools));

  const setRole = (role, value) => setSelection(current => ({ ...current, [role]: value }));

  const addModule = (type) => setModules(current => [...current, { id: nextModuleId(), ...createCabinetModule(type) }]);
  const removeModule = (id) => setModules(current => current.filter(module => module.id !== id));
  const patchModule = (id, field, value) => setModules(current => current.map(module => (
    module.id === id ? { ...module, [field]: Math.max(0, Number(value) || 0) } : module
  )));

  const summary = useMemo(() => summarizeCabinetModules(modules), [modules]);
  // Nie ma sensu memoizować — to kilka odczytów pola .price, tańsze niż porównywanie deps.
  const prices = {
    bodySheetPrice: selectedItem('bodyMaterial', materialPools, materials)?.price,
    frontSheetPrice: selectedItem('frontMaterial', materialPools, materials)?.price,
    edgePricePerMeter: selectedItem('edgeMaterial', materialPools, materials)?.price,
    hingePrice: selectedItem('hinge', materialPools, materials)?.price,
    drawerSetPrice: selectedItem('drawerRunner', materialPools, materials)?.price,
    countertopPricePerMeter: selectedItem('countertop', materialPools, materials)?.price,
    cuttingServicePricePerMeter: selectedItem('cuttingService', servicePools, servicesList)?.price,
    edgingServicePricePerMeter: selectedItem('edgingService', servicePools, servicesList)?.price,
  };
  const cost = calculateCabinetMaterialsCost(summary, prices);
  const wycena = calculateCabinetWycena({
    materialsTotal: cost.materialsTotal,
    servicesTotal: cost.servicesTotal,
    multiplier: projectMultiplier,
  });

  const handleAddToProject = () => {
    const materialLines = [
      [selectedItem('bodyMaterial', materialPools, materials), summary.bodySheets],
      [selectedItem('frontMaterial', materialPools, materials), summary.frontSheets],
      [selectedItem('edgeMaterial', materialPools, materials), Math.ceil(summary.edgeMeters)],
      [selectedItem('hinge', materialPools, materials), summary.hinges],
      [selectedItem('drawerRunner', materialPools, materials), summary.drawerSets],
      [selectedItem('countertop', materialPools, materials), Math.ceil(summary.countertopMeters)],
    ]
      .filter(([item, quantity]) => item && quantity > 0)
      .map(([item, quantity]) => ({ item, quantity }));

    const serviceLines = [
      [selectedItem('cuttingService', servicePools, servicesList), Number(summary.cuttingMeters.toFixed(2))],
      [selectedItem('edgingService', servicePools, servicesList), Number(summary.edgeMeters.toFixed(2))],
    ]
      .filter(([item, quantity]) => item && quantity > 0)
      .map(([item, quantity]) => ({ item, quantity }));

    if (materialLines.length === 0 && serviceLines.length === 0) return;
    onAddToProject({ materialLines, serviceLines });
    setAddedFlash(true);
    window.setTimeout(() => setAddedFlash(false), 2000);
  };

  const hasAnyHardwareToAdd = summary.bodySheets > 0 || summary.frontSheets > 0 || summary.edgeMeters > 0
    || summary.hinges > 0 || summary.drawerSets > 0 || summary.countertopMeters > 0;

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
                    <label className={s.countField}>Szuflady
                      <input type="number" min="0" value={module.drawers} onChange={event => patchModule(module.id, 'drawers', event.target.value)} />
                    </label>
                  )}
                  <label className={s.countField}>Ilość
                    <input type="number" min="0" value={module.qty} onChange={event => patchModule(module.id, 'qty', event.target.value)} />
                  </label>
                  <button type="button" className={s.removeButton} onClick={() => removeModule(module.id)} aria-label={`Usuń moduł ${definition.label}`}>×</button>
                </div>
                <p className={s.moduleLine}>{moduleLineSummary(module)}</p>
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
          <span>Prowadnice: <strong>{summary.drawerSets}</strong> kpl.</span>
          <span>Nogi: <strong>{summary.legs}</strong> szt.</span>
          <span>Zawieszki: <strong>{summary.hangers}</strong> szt.</span>
          <span>Cięcie płyty: {MB(summary.cuttingMeters)}</span>
          <span>Obrzeże ABS: {MB(summary.edgeMeters)}</span>
          {summary.countertopMeters > 0 && <span>Blat: {MB(summary.countertopMeters)}</span>}
        </div>
        <div className={s.wycenaRow}>
          <span className={s.wycenaLabel}>Orientacyjna wycena (×{Number(projectMultiplier) || 2}):</span>
          <strong className={s.wycenaValue}>{PLN(wycena)}</strong>
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
    </div>
  );
}
