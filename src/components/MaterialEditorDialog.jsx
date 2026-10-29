import { useMemo, useState } from 'react';
import { normalizePreferredSupplierLinks } from '../utils/materialSuppliers';
import s from './MaterialEditorDialog.module.css';

const emptyMaterial = {
  name: '',
  symbol: '',
  category: 'Płyta',
  unit: 'szt',
  price: '',
};

const initialLinks = (material) => (material?.material_suppliers || []).map(link => ({
  supplier_id: link.supplier_id || link.supplier?.id || '',
  supplier_sku: link.supplier_sku || '',
  supplier_price: link.supplier_price ?? '',
  is_preferred: Boolean(link.is_preferred),
}));

export default function MaterialEditorDialog({ material, suppliers, onCreateSupplier, onSave, onClose }) {
  const [form, setForm] = useState(() => material ? {
    name: material.name || '',
    symbol: material.symbol || '',
    category: material.category || 'Płyta',
    unit: material.unit || 'szt',
    price: material.price ?? '',
  } : emptyMaterial);
  const [links, setLinks] = useState(() => initialLinks(material));
  const [supplierToAdd, setSupplierToAdd] = useState('');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickAddress, setQuickAddress] = useState('');
  const [createdSuppliers, setCreatedSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allSuppliers = useMemo(() => [...(suppliers || []), ...createdSuppliers]
    .filter((supplier, index, list) => list.findIndex(item => item.id === supplier.id) === index), [createdSuppliers, suppliers]);
  const availableSuppliers = useMemo(() => allSuppliers.filter(supplier => (
    !supplier.is_archived && !links.some(link => link.supplier_id === supplier.id)
  )), [allSuppliers, links]);
  const suppliersById = useMemo(() => new Map(allSuppliers.map(supplier => [supplier.id, supplier])), [allSuppliers]);

  const setField = field => event => setForm(current => ({ ...current, [field]: event.target.value }));
  const setLinkField = (supplierId, field, value) => setLinks(current => current.map(link => (
    link.supplier_id === supplierId ? { ...link, [field]: value } : link
  )));

  // Pierwszy przypisany dostawca automatycznie staje się domyślny (is_preferred) — zarówno tu,
  // jak i w bezpieczniku submit() poniżej muszą liczyć to tak samo.
  const newLinkEntry = (supplierId, currentLinks) => ({
    supplier_id: supplierId,
    supplier_sku: '',
    supplier_price: '',
    is_preferred: currentLinks.length === 0,
  });

  // Wybór w <select> dodaje dostawcę OD RAZU (onChange) — bez osobnego przycisku „Dodaj”, który
  // był pułapką UX: wybrany, widoczny w polu dostawca nie trafiał do links, dopóki ktoś nie
  // kliknął „Dodaj”, więc samo „Zapisz” go gubiło (zostawał pusty array, materiał zapisywał się
  // bez dostawcy).
  const addSupplier = (supplierId) => {
    if (!supplierId || links.some(link => link.supplier_id === supplierId)) return;
    setLinks(current => [...current, newLinkEntry(supplierId, current)]);
    setSupplierToAdd('');
  };

  const removeSupplier = (supplierId) => setLinks(current => {
    const next = current.filter(link => link.supplier_id !== supplierId);
    if (next.length > 0 && !next.some(link => link.is_preferred)) next[0] = { ...next[0], is_preferred: true };
    return next;
  });

  const makePreferred = (supplierId) => setLinks(current => current.map(link => ({
    ...link,
    is_preferred: link.supplier_id === supplierId,
  })));

  const quickSupplierPayload = () => ({
    name: quickName.trim(),
    address: quickAddress.trim(),
    google_maps_url: '',
    phone: '',
    email: '',
    contact_person: '',
    notes: '',
  });

  const createSupplier = async () => {
    if (!quickName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onCreateSupplier(quickSupplierPayload());
      setCreatedSuppliers(current => [...current, saved]);
      addSupplier(saved.id);
      setQuickCreateOpen(false);
      setQuickName('');
      setQuickAddress('');
    } catch (createError) {
      setError(createError?.message || 'Nie udało się utworzyć dostawcy.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      let pendingLinks = links;

      // Bezpiecznik: addSupplier() wyżej dodaje do links natychmiast przy onChange, więc w
      // normalnym użyciu supplierToAdd jest tu zawsze puste — ale Zapisz i tak nie może zgubić
      // wybranego dostawcy, gdyby selekcja z jakiegoś powodu nie trafiła jeszcze do listy.
      if (supplierToAdd && !pendingLinks.some(link => link.supplier_id === supplierToAdd)) {
        pendingLinks = [...pendingLinks, newLinkEntry(supplierToAdd, pendingLinks)];
      }

      // To samo dla otwartej, niezatwierdzonej mini-formy „+ Utwórz nowego” — Zapisz tworzy
      // i przypisuje tego dostawcę zamiast cicho go ignorować.
      let createdSupplier = null;
      if (quickCreateOpen && quickName.trim()) {
        createdSupplier = await onCreateSupplier(quickSupplierPayload());
        pendingLinks = [...pendingLinks, newLinkEntry(createdSupplier.id, pendingLinks)];
      }

      if (pendingLinks !== links) {
        setLinks(pendingLinks);
        setSupplierToAdd('');
      }
      if (createdSupplier) {
        setCreatedSuppliers(current => [...current, createdSupplier]);
        setQuickCreateOpen(false);
        setQuickName('');
        setQuickAddress('');
      }

      await onSave({
        fields: {
          name: form.name.trim(),
          symbol: form.symbol.trim() || null,
          category: form.category,
          unit: form.unit,
          price: Number(form.price),
        },
        links: normalizePreferredSupplierLinks(pendingLinks),
      });
      onClose();
    } catch (saveError) {
      setError(saveError?.message || 'Nie udało się zapisać materiału.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.overlay} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="material-editor-title">
        <header className={s.header}>
          <h2 id="material-editor-title">{material ? 'Edytuj materiał' : 'Nowy materiał'}</h2>
          <button type="button" className={s.closeButton} onClick={onClose} aria-label="Zamknij">×</button>
        </header>
        <form className={s.form} onSubmit={submit}>
          <label>Pełna nazwa<input required value={form.name} onChange={setField('name')} /></label>
          <div className={s.gridTwo}>
            <label>Artykuł<input value={form.symbol} onChange={setField('symbol')} /></label>
            <label>Cena brutto (PLN)<input required min="0" step="0.01" type="number" value={form.price} onChange={setField('price')} /></label>
          </div>
          <div className={s.gridTwo}>
            <label>Kategoria<select value={form.category} onChange={setField('category')}>
              {['Płyta', 'Obrzeże', 'Zawiasy', 'Prowadnice', 'HDF', 'Laminat', 'Akcesoria', 'Inne'].map(value => <option key={value}>{value}</option>)}
            </select></label>
            <label>Jm<select value={form.unit} onChange={setField('unit')}>
              <option value="szt">Sztuki</option><option value="mb">Metry bieżące</option><option value="m2">Metry kwadratowe</option><option value="kpl">Komplet</option>
            </select></label>
          </div>

          <fieldset className={s.suppliersFieldset}>
            <legend>Dostawcy</legend>
            <div className={s.addSupplierRow}>
              {/* Wybór dodaje dostawcę od razu (onChange) — nie czeka na osobny przycisk. */}
              <select aria-label="Dodaj dostawcę" value={supplierToAdd} onChange={event => addSupplier(event.target.value)}>
                <option value="">Wybierz dostawcę…</option>
                {availableSuppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <button type="button" className={s.linkButton} onClick={() => setQuickCreateOpen(current => !current)}>+ Utwórz nowego</button>
            </div>

            {quickCreateOpen && <div className={s.quickCreate}>
              <input aria-label="Nazwa nowego dostawcy" value={quickName} onChange={event => setQuickName(event.target.value)} placeholder="Nazwa dostawcy" />
              <input aria-label="Adres nowego dostawcy" value={quickAddress} onChange={event => setQuickAddress(event.target.value)} placeholder="Adres (opcjonalnie)" />
              <button type="button" className={s.secondaryButton} disabled={!quickName.trim() || saving} onClick={createSupplier}>Utwórz</button>
            </div>}

            <div className={s.linkList}>
              {links.map(link => {
                const supplier = suppliersById.get(link.supplier_id);
                return <div key={link.supplier_id} className={s.supplierLink}>
                  <div className={s.supplierLinkHeader}>
                    <strong>{supplier?.name || 'Nieznany dostawca'}</strong>
                    <label className={s.preferredLabel}><input type="radio" name="preferred-supplier" checked={link.is_preferred} onChange={() => makePreferred(link.supplier_id)} /> ★ Domyślny</label>
                    <button type="button" className={s.removeButton} onClick={() => removeSupplier(link.supplier_id)} aria-label={`Usuń dostawcę ${supplier?.name || ''}`}>×</button>
                  </div>
                  <div className={s.linkFields}>
                    <input aria-label={`SKU ${supplier?.name || ''}`} value={link.supplier_sku} onChange={event => setLinkField(link.supplier_id, 'supplier_sku', event.target.value)} placeholder="SKU u dostawcy" />
                    <input aria-label={`Cena ${supplier?.name || ''}`} type="number" min="0" step="0.01" value={link.supplier_price} onChange={event => setLinkField(link.supplier_id, 'supplier_price', event.target.value)} placeholder="Cena dostawcy" />
                  </div>
                </div>;
              })}
              {links.length === 0 && <p className={s.emptyLinks}>Brak przypisanych dostawców.</p>}
            </div>
          </fieldset>

          {error && <p className={s.error} role="alert">{error}</p>}
          <footer className={s.actions}>
            <button type="button" className={s.secondaryButton} onClick={onClose}>Anuluj</button>
            <button type="submit" className={s.primaryButton} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
