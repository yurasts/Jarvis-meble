import React, { useState, useEffect } from 'react';
import InvoiceScanner from './InvoiceScanner';
import { supabase } from '../supabase';

// Стрелка тренда цены
const PriceTrend = ({ mat }) => {
  const [showHistory, setShowHistory] = useState(false);
  const history = mat.price_history || [];
  const last = history.length > 0 ? history[history.length - 1] : null;

  let arrow = null;
  if (last) {
    if (Number(mat.price) > Number(last.price)) arrow = { icon: '↑', color: '#e53e3e', title: 'Cena wzrosła' };
    else if (Number(mat.price) < Number(last.price)) arrow = { icon: '↓', color: '#38a169', title: 'Cena spadła' };
    else arrow = { icon: '→', color: '#a0aec0', title: 'Cena bez zmian' };
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span
        style={{ fontWeight: 'bold', cursor: history.length > 0 ? 'pointer' : 'default' }}
        onClick={() => history.length > 0 && setShowHistory(!showHistory)}
        title={history.length > 0 ? 'Kliknij aby zobaczyć historię' : ''}
      >
        {Number(mat.price).toFixed(2)}
        {arrow && (
          <span style={{ color: arrow.color, marginLeft: '3px', fontSize: '12px' }} title={arrow.title}>
            {arrow.icon}
          </span>
        )}
      </span>
      {showHistory && (
        <div
          style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '8px', minWidth: '160px', fontSize: '11px' }}
          onMouseLeave={() => setShowHistory(false)}
        >
          <div style={{ fontWeight: 'bold', color: '#4a5568', marginBottom: '6px', borderBottom: '1px solid #edf2f7', paddingBottom: '4px' }}>Historia cen</div>
          {[...history].reverse().map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '2px 0', color: '#718096' }}>
              <span>{h.date}</span>
              <span style={{ fontWeight: 'bold' }}>{Number(h.price).toFixed(2)} zł</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0 0 0', borderTop: '1px solid #edf2f7', marginTop: '4px', color: '#2d3748', fontWeight: 'bold' }}>
            <span>Aktualna</span>
            <span>{Number(mat.price).toFixed(2)} zł</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MaterialsList = ({ materials, servicesList, setIsMaterialModalOpen, onPricesUpdated, isDark = false }) => {
  const c = (light, dark) => isDark ? dark : light;
  const bg = c('#fff', '#1e293b');
  const bgCard = c('#f8fafc', '#162032');
  const text = c('#2d3748', '#e2e8f0');
  const textLight = c('#4a5568', '#94a3b8');
  const border = c('#e2e8f0', '#334155');
  const stripe1 = c('#ffffff', '#1a2535');
  const stripe2 = c('#f1f5f9', '#111827');
  const [suppliers, setSuppliers] = useState([]);
  const [isSupModalOpen, setIsSupModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supForm, setSupForm] = useState({ name: '', category: 'Płyty i Blaty', phone: '', hours: '', address: '', notes: '' });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    if (data) setSuppliers(data);
  }

  const openAddModal = () => {
    setEditingSupplierId(null);
    setSupForm({ name: '', category: 'Płyty i Blaty', phone: '', hours: '', address: '', notes: '' });
    setIsSupModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplierId(supplier.id);
    setSupForm({ name: supplier.name || '', category: supplier.category || 'Inne', phone: supplier.phone || '', hours: supplier.hours || '', address: supplier.address || '', notes: supplier.notes || '' });
    setIsSupModalOpen(true);
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (editingSupplierId) {
      const { data, error } = await supabase.from('suppliers').update(supForm).eq('id', editingSupplierId).select();
      if (error) { alert("Błąd aktualizacji: " + error.message); return; }
      if (data) setSuppliers(suppliers.map(s => s.id === editingSupplierId ? data[0] : s));
    } else {
      const { data, error } = await supabase.from('suppliers').insert([supForm]).select();
      if (error) { alert("Błąd zapisu: " + error.message); return; }
      if (data) setSuppliers([...suppliers, data[0]]);
    }
    setIsSupModalOpen(false);
  };

  const handleDeleteSupplier = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tego dostawcę z bazy?')) {
      await supabase.from('suppliers').delete().eq('id', id);
      setSuppliers(suppliers.filter(s => s.id !== id));
    }
  };

  return (
    <div style={{ padding: '20px', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: text }}>Katalog: Materiały i Usługi</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <InvoiceScanner materials={materials} onPricesUpdated={onPricesUpdated} />
          <button className="btn-primary" onClick={() => setIsMaterialModalOpen(true)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + Nowy materiał
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* МАТЕРИАЛЫ */}
        <div style={{ flex: '2 1 600px', background: bgCard, padding: '15px', borderRadius: '8px', border: `1px solid ${border}` }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: text, fontSize: '16px' }}>📦 Baza materiałów</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c('#edf2f7','#253347'), textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Kategoria</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Nazwa materiału</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Jm</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight }}>Dostawca</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((mat, index) => (
                  <tr key={mat.id} style={{ background: index % 2 === 0 ? stripe1 : stripe2, lineHeight: '1.2' }}>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>{mat.category}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>
                      <PriceTrend mat={mat} />
                    </td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: text }}>{mat.name}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>{mat.unit}</td>
                    <td style={{ padding: '3px 8px', borderBottom: `1px solid ${border}`, color: textLight }}>{mat.supplier || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* УСЛУГИ */}
        <div style={{ flex: '1 1 350px', background: bgCard, padding: '15px', borderRadius: '8px', border: `1px solid ${border}` }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: text, fontSize: '16px' }}>🛠 Stałe usługi</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c('#edf2f7','#253347'), textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight, width: '30%' }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, color: textLight, width: '70%' }}>Nazwa usługi</th>
                </tr>
              </thead>
              <tbody>
                {(servicesList || []).map((srv, index) => (
                  <tr key={srv.id || index} style={{ background: index % 2 === 0 ? stripe1 : stripe2, lineHeight: '1.2' }}>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', color: '#2b6cb0' }}>{Number(srv.price).toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>{srv.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ПОСТАВЩИКИ */}
      <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: text, fontSize: '20px' }}>🏭 Baza Dostawców</h2>
          <button onClick={openAddModal} style={{ background: '#38a169', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            + Nowy dostawca
          </button>
        </div>

        {suppliers.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#a0aec0', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px dashed #cbd5e0' }}>
            Brak dostawców w bazie.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {suppliers.map(supplier => (
              <div key={supplier.id} style={{ background: bg, padding: '15px', borderRadius: '8px', border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                  <button onClick={() => openEditModal(supplier)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Edytuj">✏️</button>
                  <button onClick={() => handleDeleteSupplier(supplier.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Usuń">🗑️</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingRight: '40px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: text }}>{supplier.name}</h3>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', background: '#edf2f7', color: '#4a5568', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{supplier.category}</span>
                </div>
                <div style={{ fontSize: '13px', color: textLight, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {supplier.phone && <div>📞 <a href={`tel:${supplier.phone}`} style={{ color: '#3182ce', textDecoration: 'none', fontWeight: 'bold' }}>{supplier.phone}</a></div>}
                  {supplier.hours && <div>🕒 {supplier.hours}</div>}
                  {supplier.address && <div>📍 <a href={`https://www.google.com/maps?q=${encodeURIComponent(supplier.address)}`} target="_blank" rel="noreferrer" style={{ color: '#3182ce', textDecoration: 'none' }}>{supplier.address}</a></div>}
                </div>
                {supplier.notes && (
                  <div style={{ marginTop: '10px', padding: '8px', background: '#fffff0', border: '1px solid #fefcbf', borderRadius: '6px', fontSize: '12px', color: '#744210' }}>
                    💡 {supplier.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* МОДАЛ ПОСТАВЩИКА */}
      {isSupModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '15px' }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#2d3748' }}>{editingSupplierId ? 'Edytuj dostawcę' : 'Nowy dostawca'}</h2>
            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Nazwa (Firma)</label><input required type="text" value={supForm.name} onChange={e => setSupForm({...supForm, name: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} /></div>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Kategoria</label><select value={supForm.category} onChange={e => setSupForm({...supForm, category: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }}><option value="Płyty i Blaty">Płyty i Blaty</option><option value="Okucia i Akcesoria">Okucia i Akcesoria</option><option value="Szklarz / Lustra">Szklarz / Lustra</option><option value="Lakiernia">Lakiernia</option><option value="Kamieniarz (Blaty)">Kamieniarz (Blaty)</option><option value="Inne">Inne</option></select></div>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Telefon</label><input type="text" value={supForm.phone} onChange={e => setSupForm({...supForm, phone: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} placeholder="np. +48 500 123 456" /></div>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Godziny otwarcia</label><input type="text" value={supForm.hours} onChange={e => setSupForm({...supForm, hours: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} placeholder="np. Pn-Pt 08:00 - 16:00" /></div>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Adres</label><input type="text" value={supForm.address} onChange={e => setSupForm({...supForm, address: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} /></div>
              <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>Dodatkowe notatki</label><textarea value={supForm.notes} onChange={e => setSupForm({...supForm, notes: e.target.value})} rows="3" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Osoba kontaktowa, rabaty..."></textarea></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsSupModalOpen(false)} style={{ background: '#edf2f7', color: '#4a5568', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Anuluj</button>
                <button type="submit" style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Zapisz</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialsList;
