import { useMemo, useState } from 'react';
import { getSupplierGoogleMapsUrl } from '../utils/supplierMaps';
import s from './SuppliersDirectory.module.css';

const emptyForm = () => ({
  name: '',
  address: '',
  google_maps_url: '',
  phone: '',
  email: '',
  contact_person: '',
  notes: '',
});

function SupplierDialog({ supplier, onClose, onSave }) {
  const [form, setForm] = useState(() => supplier ? {
    name: supplier.name || '',
    address: supplier.address || '',
    google_maps_url: supplier.google_maps_url || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    contact_person: supplier.contact_person || '',
    notes: supplier.notes || '',
  } : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (field) => (event) => setForm(current => ({
    ...current,
    [field]: event.target.value,
  }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim()]),
      ));
      onClose();
    } catch (saveError) {
      setError(saveError?.message || 'Nie udało się zapisać dostawcy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.overlay} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title">
        <header className={s.dialogHeader}>
          <h2 id="supplier-dialog-title">{supplier ? 'Edytuj dostawcę' : 'Nowy dostawca'}</h2>
          <button type="button" className={s.iconButton} onClick={onClose} aria-label="Zamknij">×</button>
        </header>
        <form className={s.form} onSubmit={submit}>
          <label>Nazwa<input required value={form.name} onChange={setField('name')} /></label>
          <label>Adres<input value={form.address} onChange={setField('address')} /></label>
          <label>Link Google Maps (opcjonalnie)<input type="url" value={form.google_maps_url} onChange={setField('google_maps_url')} placeholder="https://…" /></label>
          <div className={s.formGrid}>
            <label>Telefon<input value={form.phone} onChange={setField('phone')} /></label>
            <label>E-mail<input type="email" value={form.email} onChange={setField('email')} /></label>
          </div>
          <label>Osoba kontaktowa<input value={form.contact_person} onChange={setField('contact_person')} /></label>
          <label>Notatki<textarea rows="3" value={form.notes} onChange={setField('notes')} /></label>
          {error && <p className={s.error} role="alert">{error}</p>}
          <footer className={s.dialogActions}>
            <button type="button" className={s.secondaryButton} onClick={onClose}>Anuluj</button>
            <button type="submit" className={s.primaryButton} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function SuppliersDirectory({ suppliers, onCreate, onUpdate, onSetArchived, onBack }) {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(undefined);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const visibleSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pl-PL');
    return (suppliers || []).filter(supplier => (
      (showArchived || !supplier.is_archived)
      && (!query || [
        supplier.name,
        supplier.address,
        supplier.phone,
        supplier.email,
        supplier.contact_person,
      ].some(value => value?.toLocaleLowerCase('pl-PL').includes(query)))
    ));
  }, [search, showArchived, suppliers]);

  const toggleArchived = async (supplier) => {
    setBusyId(supplier.id);
    setError('');
    try {
      await onSetArchived(supplier.id, !supplier.is_archived);
    } catch (archiveError) {
      setError(archiveError?.message || 'Nie udało się zmienić statusu dostawcy.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={s.directory} aria-label="Dostawcy">
      <header className={s.header}>
        <div className={s.titleGroup}>
          {onBack && <button type="button" className={s.backButton} onClick={onBack}>← Materiały</button>}
          <div><h2>Dostawcy</h2><p>{visibleSuppliers.length} w kartotece</p></div>
        </div>
        <button type="button" className={s.primaryButton} onClick={() => setEditingSupplier(null)}>+ Nowy dostawca</button>
      </header>

      <div className={s.controls}>
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Szukaj dostawcy, adresu lub kontaktu…" aria-label="Szukaj dostawcy" />
        <label className={s.archiveFilter}><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Pokaż archiwalne</label>
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.cards}>
        {visibleSuppliers.map(supplier => {
          const mapUrl = getSupplierGoogleMapsUrl(supplier);
          return (
            <article key={supplier.id} className={`${s.card} ${supplier.is_archived ? s.archivedCard : ''}`}>
              <div className={s.cardHeader}>
                <div><h3>{supplier.name}</h3>{supplier.is_archived && <span className={s.archivedBadge}>Archiwalny</span>}</div>
                <span className={s.materialCount}>{Number(supplier.material_count || 0)} mat.</span>
              </div>
              <div className={s.details}>
                {supplier.contact_person && <span>👤 {supplier.contact_person}</span>}
                {supplier.phone && <a href={`tel:${supplier.phone}`}>☎ {supplier.phone}</a>}
                {supplier.email && <a href={`mailto:${supplier.email}`}>✉ {supplier.email}</a>}
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">📍 {supplier.address || 'Mapa'}</a>}
              </div>
              {supplier.notes && <p className={s.notes}>{supplier.notes}</p>}
              <footer className={s.cardActions}>
                {mapUrl && <a className={s.mapButton} href={mapUrl} target="_blank" rel="noopener noreferrer">📍 Mapa</a>}
                <button type="button" className={s.secondaryButton} onClick={() => setEditingSupplier(supplier)}>Edytuj</button>
                <button type="button" className={s.secondaryButton} disabled={busyId === supplier.id} onClick={() => toggleArchived(supplier)}>
                  {supplier.is_archived ? 'Przywróć' : 'Archiwizuj'}
                </button>
              </footer>
            </article>
          );
        })}
        {visibleSuppliers.length === 0 && <p className={s.empty}>Brak dostawców spełniających kryteria.</p>}
      </div>

      {editingSupplier !== undefined && (
        <SupplierDialog
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(undefined)}
          onSave={fields => editingSupplier ? onUpdate(editingSupplier.id, fields) : onCreate(fields)}
        />
      )}
    </section>
  );
}
