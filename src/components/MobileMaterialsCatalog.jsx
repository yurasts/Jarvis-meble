import { useState } from 'react';
import InvoiceScanner from './InvoiceScanner';
import s from './MaterialsList.module.css';

function MobileMaterialRow({ item, expanded, onToggle }) {
  return (
    <button type={'button'}
      className={[s.mobileMaterialRow, expanded ? s.mobileMaterialRowExpanded : ''].filter(Boolean).join(' ')}
      aria-expanded={expanded} onClick={onToggle}>
      <span className={s.mobileMaterialInfo}>
        <span className={s.mobileMaterialName}>{item.name || item.symbol || 'Bez nazwy'}</span>
        {expanded && (
          <span className={s.mobileMaterialDetails}>
            {[item.category, item.supplier, item.unit].filter(Boolean).join(' · ') || 'Brak informacji'}
          </span>
        )}
      </span>
      <span className={s.mobileMaterialPrice}>{Number(item.price || 0).toFixed(2)} zł</span>
      <span className={s.mobileChevron}>{expanded ? '⌃' : '⌄'}</span>
    </button>
  );
}

export default function MobileMaterialsCatalog({ materials, onPricesUpdated, onAddMaterial, isDark = false }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expandedKey, setExpandedKey] = useState(null);
  const [priceSort, setPriceSort] = useState(null);

  const categories = [...new Set(materials.map(item => item.category).filter(Boolean))].sort();
  const suppliers = [...new Set(materials.map(item => item.supplier).filter(Boolean))].sort();
  const query = search.trim().toLowerCase();
  const visibleMaterials = materials.filter(item => {
    const searchable = [item.name, item.symbol, item.category, item.supplier, item.description, item.notes]
      .filter(Boolean).join(' ').toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!category || item.category === category) &&
      (!supplier || item.supplier === supplier);
  });
  if (priceSort) {
    visibleMaterials.sort((a, b) =>
      (Number(a.price) - Number(b.price)) * (priceSort === 'asc' ? 1 : -1)
    );
  }

  const togglePriceSort = () => {
    setPriceSort(current => current === 'asc' ? 'desc' : 'asc');
  };

  return (
    <section className={s.mobileCatalog} aria-label={'Katalog materialow'}>
      <header className={s.mobileAppBar}>
        <h1>Materiały</h1>
        <div className={s.mobileActions}>
          <InvoiceScanner compact materials={materials} onPricesUpdated={onPricesUpdated} isDark={isDark} />
          <button type={'button'} className={s.addMaterialBtn} onClick={onAddMaterial}>+ Nowy</button>
        </div>
      </header>
      <div className={s.mobileControls}>
        <input type={'search'} className={s.mobileSearch} value={search}
          placeholder={'Szukaj nazwy, symbolu lub opisu...'}
          onChange={event => setSearch(event.target.value)} />
        <div className={s.mobileFilters}>
          <select aria-label={'Typ materialu'} value={category} onChange={event => setCategory(event.target.value)}>
            <option value={''}>Typ: Wszystkie</option>
            {categories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label={'Dostawca'} value={supplier} onChange={event => setSupplier(event.target.value)}>
            <option value={''}>Dostawca: Wszyscy</option>
            {suppliers.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className={s.mobileListMeta}>
          <span>{visibleMaterials.length} pozycji</span>
          <button type={'button'} onClick={togglePriceSort}>
            Cena {priceSort === 'asc' ? '↑' : priceSort === 'desc' ? '↓' : '↕'}
          </button>
        </div>
      </div>
      <div className={s.mobileList}>
        <div className={s.mobileListHeader}>
          <span>Nazwa materiału</span><span>Cena</span><span />
        </div>
        {visibleMaterials.length === 0 && (
          <div className={s.mobileEmpty}>Brak materiałów spełniających kryteria.</div>
        )}
        {visibleMaterials.map((item, index) => {
          const itemKey = item.id ?? ('material-' + index);
          return <MobileMaterialRow key={itemKey} item={item} expanded={expandedKey === itemKey}
            onToggle={() => setExpandedKey(expandedKey === itemKey ? null : itemKey)} />;
        })}
      </div>
    </section>
  );
}
