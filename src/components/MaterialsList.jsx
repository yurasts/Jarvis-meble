import { useState } from 'react';
import InvoiceScanner from './InvoiceScanner';
import { useIsDesktop } from '../utils/useIsDesktop';
import MobileMaterialsCatalog from './MobileMaterialsCatalog';
import CatalogFavoriteButton from './CatalogFavoriteButton';
import SuppliersDirectory from './SuppliersDirectory';
import { materialSupplierNames } from '../utils/materialSuppliers';
import s from './MaterialsList.module.css';

// Стрелка тренда цены
const PriceTrend = ({ mat }) => {
  const [showHistory, setShowHistory] = useState(false);
  const history = mat.price_history || [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  const bg     = 'var(--bg-card)';
  const border = 'var(--border)';
  const text   = 'var(--text-main)';
  const textMuted = 'var(--text-muted)';

  let arrow = null;
  if (last) {
    if (Number(mat.price) > Number(last.price))      arrow = { icon: '↑', color: '#e53e3e', title: 'Cena wzrosła' };
    else if (Number(mat.price) < Number(last.price)) arrow = { icon: '↓', color: '#38a169', title: 'Cena spadła' };
    else                                             arrow = { icon: '→', color: '#a0aec0', title: 'Cena bez zmian' };
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ fontWeight: 'bold', cursor: history.length > 0 ? 'pointer' : 'default' }}
        onClick={() => history.length > 0 && setShowHistory(!showHistory)}
        title={history.length > 0 ? 'Kliknij aby zobaczyć historię' : ''}>
        {Number(mat.price).toFixed(2)}
        {arrow && <span style={{ color: arrow.color, marginLeft: '3px', fontSize: '12px' }} title={arrow.title}>{arrow.icon}</span>}
      </span>
      {showHistory && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: bg, border: `1px solid ${border}`, borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', padding: '8px', minWidth: '160px', fontSize: '11px' }}
          onMouseLeave={() => setShowHistory(false)}>
          <div style={{ fontWeight: 'bold', color: textMuted, marginBottom: '6px', borderBottom: `1px solid ${border}`, paddingBottom: '4px' }}>Historia cen</div>
          {[...history].reverse().map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '2px 0', color: textMuted }}>
              <span>{h.date}</span>
              <span style={{ fontWeight: 'bold' }}>{Number(h.price).toFixed(2)} zł</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0 0 0', borderTop: `1px solid ${border}`, marginTop: '4px', color: text, fontWeight: 'bold' }}>
            <span>Aktualna</span>
            <span>{Number(mat.price).toFixed(2)} zł</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MaterialsList = ({
  materials,
  servicesList,
  suppliers,
  onAddMaterial,
  onEditMaterial,
  onCreateSupplier,
  onUpdateSupplier,
  onSetSupplierArchived,
  onPricesUpdated,
  onToggleFavorite,
  isDark = false,
}) => {
  const isDesktop = useIsDesktop();
  const c = (light, dark) => isDark ? dark : light;
  const bg       = 'var(--bg-card)';
  const bgCard   = 'var(--bg-kanban-col)';
  const bgInput  = 'var(--input-bg)';
  const text     = 'var(--text-main)';
  const textLight= 'var(--text-muted)';
  const border   = 'var(--border)';
  const stripe1  = 'var(--bg-card)';
  const stripe2  = 'var(--bg-kanban-col)';

  const [searchMat,     setSearchMat]     = useState('');
  const [filterCatMat,  setFilterCatMat]  = useState('');
  const [activeDirectory, setActiveDirectory] = useState('materials');

  if (activeDirectory === 'suppliers') {
    return <SuppliersDirectory
      suppliers={suppliers}
      onCreate={onCreateSupplier}
      onUpdate={onUpdateSupplier}
      onSetArchived={onSetSupplierArchived}
      onBack={() => setActiveDirectory('materials')}
    />;
  }

  if (!isDesktop) {
    return (
      <MobileMaterialsCatalog
        materials={materials}
        onPricesUpdated={onPricesUpdated}
        onAddMaterial={onAddMaterial}
        onShowSuppliers={() => setActiveDirectory('suppliers')}
        onToggleFavorite={onToggleFavorite}
        isDark={isDark}
      />
    );
  }

  return (
    <div style={{ padding: '20px', minHeight: '100%', background: bg }}>
      <nav className={s.directoryTabs} aria-label="Sekcje biblioteki">
        <button
          type="button"
          className={activeDirectory === 'materials' ? s.directoryTabActive : undefined}
          onClick={() => setActiveDirectory('materials')}
        >Materiały</button>
        <button
          type="button"
          className={activeDirectory === 'services' ? s.directoryTabActive : undefined}
          onClick={() => setActiveDirectory('services')}
        >Usługi</button>
        <button type="button" onClick={() => setActiveDirectory('suppliers')}>Dostawcy</button>
      </nav>

      {/* МАТЕРИАЛЫ — на всю ширину, активна по умолчанию. + Nowy materiał/Skanuj fakturę
          перенесены сюда из общей шапки (redesign 2026-10: 3 отдельные вкладки вместо заголовка
          Katalog i wspólnej siatki dwukolumnowej) — видны только на этой вкладce. */}
      {activeDirectory === 'materials' && (
        <div style={{ background: bgCard, padding: '15px', borderRadius: '8px', border: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, color: text, fontSize: '16px' }}>📦 Materiały</h3>
              <span style={{ fontSize: '12px', color: textLight }}>
                {(searchMat || filterCatMat)
                  ? `${materials.filter(m => { const q = searchMat.toLowerCase(); return (!q || (m.name||'').toLowerCase().includes(q) || (m.symbol||'').toLowerCase().includes(q)) && (!filterCatMat || m.category === filterCatMat); }).length} / ${materials.length}`
                  : `${materials.length} poz.`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <InvoiceScanner materials={materials} onPricesUpdated={onPricesUpdated} isDark={isDark} />
              <button onClick={onAddMaterial} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                + Nowy materiał
              </button>
            </div>
          </div>

          {/* Поиск + фильтр категории */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Szukaj nazwy lub artykułu..."
              value={searchMat}
              onChange={e => setSearchMat(e.target.value)}
              style={{ flex: 1, minWidth: '160px', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: bgInput, color: text, fontSize: '13px' }}
            />
            <select
              value={filterCatMat}
              onChange={e => setFilterCatMat(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '6px', border: `1px solid ${border}`, background: bgInput, color: text, fontSize: '13px' }}
            >
              <option value="">Wszystkie kat.</option>
              {[...new Set(materials.map(m => m.category).filter(Boolean))].sort().map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {(searchMat || filterCatMat) && (
              <button
                onClick={() => { setSearchMat(''); setFilterCatMat(''); }}
                style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color: textLight, cursor: 'pointer', fontSize: '12px' }}
              >✕ Wyczyść</button>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-kanban-col)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Kategoria</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Artykuł</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Nazwa materiału</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Jm</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Dostawcy</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }} aria-label="Akcje" />
                </tr>
              </thead>
              <tbody>
                {materials.filter(mat => {
                    const q = searchMat.toLowerCase();
                    const supplierSearch = materialSupplierNames(mat).join(' ').toLowerCase();
                    const matchSearch = !q || (mat.name || '').toLowerCase().includes(q) || (mat.symbol || '').toLowerCase().includes(q) || supplierSearch.includes(q);
                    const matchCat = !filterCatMat || mat.category === filterCatMat;
                    return matchSearch && matchCat;
                  }).map((mat, index) => (
                  <tr key={mat.id} style={{ background: index % 2 === 0 ? stripe1 : stripe2, lineHeight: '1.2' }}>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>{mat.category}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: text, fontWeight: 600, whiteSpace: 'nowrap' }}>{mat.symbol || '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: text }}>
                      <PriceTrend mat={mat} />
                    </td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: text }}>
                      <span className={s.catalogNameCell}>
                        <CatalogFavoriteButton item={mat} kind="material" onToggle={onToggleFavorite} compact />
                        <span>{mat.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>{mat.unit}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>
                      <span className={s.supplierBadges}>
                        {materialSupplierNames(mat).map(name => <span key={name}>{name}</span>)}
                        {materialSupplierNames(mat).length === 0 && '-'}
                      </span>
                    </td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}` }}>
                      <button type="button" className={s.editMaterialButton} onClick={() => onEditMaterial(mat)} aria-label={`Edytuj materiał ${mat.name}`}>✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* УСЛУГИ — на всю ширину, только на этой вкладce. */}
      {activeDirectory === 'services' && (
        <div style={{ background: bgCard, padding: '15px', borderRadius: '8px', border: `1px solid ${border}` }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: text, fontSize: '16px' }}>🛠 Usługi</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-kanban-col)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight, width: '30%' }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight, width: '70%' }}>Nazwa usługi</th>
                </tr>
              </thead>
              <tbody>
                {(servicesList || []).map((srv, index) => (
                  <tr key={srv.id || index} style={{ background: index % 2 === 0 ? stripe1 : stripe2, lineHeight: '1.2' }}>
                    {/* ✅ FIX: убрали хардкод #2b6cb0 — теперь с темой */}
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, fontWeight: 'bold', color: c('#2b6cb0','#63b3ed') }}>{Number(srv.price).toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: text }}>
                      <span className={s.catalogNameCell}>
                        <CatalogFavoriteButton item={srv} kind="service" onToggle={onToggleFavorite} compact />
                        <span>{srv.name}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialsList;
