import React, { useState } from 'react';
import FilesTab from './FilesTab';

const ProjectModal = ({ client, setClient, materials, servicesList, onClose, onSave, profilesById = {}, currentProfile = null }) => {
  const [activeTab, setActiveTab] = useState('materials');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null); // 'materials-2', 'services-0' и т.д.

  const calcMaterials = client.calc_materials || [];
  const calcServices = client.calc_services || [];
  const calcExpenses = client.calc_expenses || [];

  const totalMaterials = calcMaterials.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const totalServices = calcServices.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
  const totalExpenses = calcExpenses.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
  const totalProjectCost = totalMaterials + totalServices + totalExpenses;

  const uniqueCategories = [...new Set((materials || []).map(m => m.category).filter(Boolean))];
  const uniqueSuppliers = [...new Set((materials || []).map(m => m.supplier).filter(Boolean))];

  const filteredMaterials = (materials || []).filter(m => {
    const matchesSearch = (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (m.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = filterCategory ? m.category === filterCategory : true;
    const matchesSup = filterSupplier ? m.supplier === filterSupplier : true;
    return matchesSearch && matchesCat && matchesSup;
  });

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  const updateItems = (field, newItems) => setClient({ ...client, [field]: newItems });

  // Метка автора — сохраняется в каждом элементе при добавлении
  const authorMeta = () => ({
    addedById: currentProfile?.id || null,
    addedByColor: currentProfile?.color || '#718096',
  });

  const handleAddItem = (field, currentItems, item) => {
    const existing = currentItems.find(i => i.id === item.id);
    if (existing) {
      updateItems(field, currentItems.map(i => i.id === item.id ? { ...i, quantity: (Number(i.quantity) || 1) + 1 } : i));
    } else {
      updateItems(field, [...currentItems, { ...item, quantity: 1, ...authorMeta() }]);
    }
  };

  const handleRemoveItem = (field, currentItems, indexToRemove) => {
    setConfirmDeleteKey(null);
    updateItems(field, currentItems.filter((_, idx) => idx !== indexToRemove));
  };

  const handleQuantityChange = (field, currentItems, index, newQuantity) => {
    const updated = [...currentItems];
    updated[index].quantity = newQuantity;
    updateItems(field, updated);
  };

  const handleCustomAdd = (field, currentItems) => {
    const name = prompt('Wpisz nazwę:');
    if (!name) return;
    const price = parseFloat(prompt('Wpisz cenę za szt/usługę (zł):') || '0');
    updateItems(field, [...currentItems, { id: Date.now(), name, price, quantity: 1, unit: 'szt', category: 'Inne', supplier: 'Brak', ...authorMeta() }]);
  };

  const handleCopyPortalLink = async () => {
    if (!client.portal_token) {
      alert('Ten projekt nie ma jeszcze portal_token. Sprawdź, czy migracja SQL została wykonana, albo odśwież stronę.');
      return;
    }
    const url = `${window.location.origin}/portal/${client.portal_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      alert(url);
    }
  };

  const editor = client.updated_by ? profilesById[client.updated_by] : null;

  // Кнопка удаления с подтверждением — без изменения высоты строки
  const renderDeleteBtn = (field, currentItems, index) => {
    const key = `${field}-${index}`;
    if (confirmDeleteKey === key) return (
      <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '11px', color: '#e53e3e', fontWeight: 'bold', marginRight: '4px' }}>Usunąć?</span>
        <button onClick={() => handleRemoveItem(field, currentItems, index)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', marginRight: '2px' }}>Tak</button>
        <button onClick={() => setConfirmDeleteKey(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
      </td>
    );
    return (
      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
        <button onClick={() => setConfirmDeleteKey(key)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1, transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color='#e53e3e'} onMouseLeave={e => e.target.style.color='#cbd5e0'} title="Usuń">✖</button>
      </td>
    );
  };

  // Тонкая цветная полоска слева — берём цвет автора строки или дефолт
  const rowStripe = (item) => item.addedByColor || '#e2e8f0';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '30px', paddingBottom: '30px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '10px', width: '95%', maxWidth: '1100px', padding: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', position: 'relative' }} onClick={e => e.stopPropagation()}>
        
        {/* Шапка */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #edf2f7', paddingBottom: '10px', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#2d3748' }}>{client.full_name}</h2>
            <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
              Budżet: <strong>{Number(client.budget || 0).toFixed(2)} zł</strong> | Koszty całkowite: <strong style={{ color: '#e53e3e' }}>{totalProjectCost.toFixed(2)} zł</strong>
            </div>
            {editor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: editor.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>
                  {(editor.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                  {editor.full_name} • {client.updated_at ? new Date(client.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCopyPortalLink} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: linkCopied ? '#c6f6d5' : '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
              {linkCopied ? '✓ Skopiowano' : '🔗 Link dla klienta'}
            </button>
            <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Zamknij</button>
            <button onClick={onSave} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#3182ce', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Zapisz zmiany</button>
          </div>
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '15px', overflowX: 'auto', whiteSpace: 'nowrap', gap: '2px' }}>
          <button onClick={() => setActiveTab('materials')} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', background: activeTab === 'materials' ? '#ebf8ff' : 'transparent', border: 'none', borderBottom: activeTab === 'materials' ? '3px solid #3182ce' : '3px solid transparent', color: activeTab === 'materials' ? '#2b6cb0' : '#4a5568', cursor: 'pointer' }}>
            📦 Materiały ({totalMaterials.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('services')} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', background: activeTab === 'services' ? '#f0fff4' : 'transparent', border: 'none', borderBottom: activeTab === 'services' ? '3px solid #38a169' : '3px solid transparent', color: activeTab === 'services' ? '#276749' : '#4a5568', cursor: 'pointer' }}>
            🛠 Usługi ({totalServices.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('expenses')} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', background: activeTab === 'expenses' ? '#fff5f5' : 'transparent', border: 'none', borderBottom: activeTab === 'expenses' ? '3px solid #e53e3e' : '3px solid transparent', color: activeTab === 'expenses' ? '#c53030' : '#4a5568', cursor: 'pointer' }}>
            💸 Wydatki ({totalExpenses.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('files')} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', background: activeTab === 'files' ? '#faf5ff' : 'transparent', border: 'none', borderBottom: activeTab === 'files' ? '3px solid #805ad5' : '3px solid transparent', color: activeTab === 'files' ? '#553c9a' : '#4a5568', cursor: 'pointer' }}>
            📎 Pliki
          </button>
        </div>

        <div style={{ minHeight: '350px' }}>

          {/* МАТЕРИАЛЫ */}
          {activeTab === 'materials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#2d3748' }}>✅ Dodane pozycje</h3>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e0', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#edf2f7', textAlign: 'left', color: '#4a5568' }}>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Nazwa materiału</th>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Cena j.</th>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Jm</th>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0', width: '60px' }}>Ilość</th>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Suma</th>
                        <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcMaterials.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ebf8ff', borderLeft: `3px solid ${rowStripe(item)}` }}>
                          <td onClick={() => toggleRow(`sel_${index}`) style={{ padding: '4px 8px', fontWeight: 'bold', cursor: 'pointer', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedRows[`sel_${index}`] ? 'normal' : 'nowrap', color: '#2b6cb0' }}>{item.name}</td>
                          <td style={{ padding: '4px 8px' }}>{Number(item.price).toFixed(2)} zł</td>
                          <td style={{ padding: '4px 8px' }}>{item.unit || 'szt'}</td>
                          <td style={{ padding: '4px 8px' }}>
                            <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => handleQuantityChange('calc_materials', calcMaterials, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '12px', background: '#fff' }} />
                          </td>
                          <td style={{ padding: '4px 8px', fontWeight: 'bold', color: '#2b6cb0' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                          {renderDeleteBtn('calc_materials', calcMaterials, index)}
                        </tr>
                      ))}
                      {calcMaterials.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych materiałów</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button onClick={() => handleCustomAdd('calc_materials', calcMaterials)} style={{ background: '#edf2f7', color: '#2d3748', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Dodaj pozycję ręcznie</button>
                </div>
              </div>

              <div style={{ background: '#f7fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#2d3748' }}>🔍 Baza materiałów</h3>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                  <input type="text" placeholder="Szukaj..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '12px', minWidth: '140px', flex: 1 }} />
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '12px', minWidth: '110px' }}>
                    <option value="">Wszystkie kat.</option>
                    {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '12px', minWidth: '110px' }}>
                    <option value="">Dostawcy</option>
                    {uniqueSuppliers.map(sup => <option key={sup} value={sup}>{sup}</option>)}
                  </select>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', overflowX: 'auto', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ minWidth: '500px' }}>
                    {filteredMaterials.slice(0, 50).map(m => {
                      const isSelected = calcMaterials.some(item => item.id === m.id);
                      return (
                        <div key={m.id} style={{ display: 'flex', gap: '10px', padding: '6px 10px', borderBottom: '1px solid #edf2f7', fontSize: '12px', alignItems: 'center', backgroundColor: isSelected ? '#ebf8ff' : '#fff' }}>
                          <div style={{ width: '80px', color: '#718096', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.symbol || '-'}</div>
                          <div onClick={() => toggleRow(`avail_${m.id}`)} style={{ flex: 1, fontWeight: 'bold', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedRows[`avail_${m.id}`] ? 'normal' : 'nowrap' }}>{m.name}</div>
                          <div style={{ width: '70px', color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.category}</div>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', width: '140px', flexShrink: 0 }}>
                            <strong style={{ color: '#2b6cb0' }}>{Number(m.price).toFixed(2)} zł</strong>
                            <button onClick={() => handleAddItem('calc_materials', calcMaterials, m)} style={{ background: isSelected ? '#cbd5e0' : '#38a169', color: isSelected ? '#2d3748' : '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '65px' }}>
                              {isSelected ? '+ Kol.' : '+ Dodaj'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {filteredMaterials.length === 0 && <div style={{ padding: '10px', textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>Brak wyników</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* УСЛУГИ */}
          {activeTab === 'services' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <select id="service-select" style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', flex: 1, minWidth: '200px', fontSize: '13px' }}>
                  <option value="">-- Wybierz usługę z bazy --</option>
                  {(servicesList || []).map(s => <option key={s.id} value={JSON.stringify(s)}>{s.name} ({s.price} zł)</option>)}
                </select>
                <button onClick={() => { const sel = document.getElementById('service-select'); if(sel.value) handleAddItem('calc_services', calcServices, JSON.parse(sel.value)); sel.value = ''; }} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Dodaj z bazy</button>
                <button onClick={() => handleCustomAdd('calc_services', calcServices)} style={{ background: '#edf2f7', color: '#2d3748', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ Usługa niestandardowa</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#f0fff4', textAlign: 'left', color: '#276749' }}>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Nazwa usługi</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Cena jend. (zł)</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5', width: '80px' }}>Ilość</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Suma</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcServices.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', borderLeft: `3px solid ${rowStripe(item)}` }}>
                        <td style={{ padding: '6px 8px' }}>{item.name}</td>
                        <td style={{ padding: '6px 8px' }}>{Number(item.price).toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" min="1" value={item.quantity || 1} onChange={(e) => handleQuantityChange('calc_services', calcServices, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                        {renderDeleteBtn('calc_services', calcServices, index)}
                      </tr>
                    ))}
                    {calcServices.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych usług</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* РАСХОДЫ */}
          {activeTab === 'expenses' && (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <button onClick={() => handleCustomAdd('calc_expenses', calcExpenses)} style={{ background: '#fc8181', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>+ Dodaj wydatek (Paliwo, Zakupy itp.)</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#fff5f5', textAlign: 'left', color: '#c53030' }}>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Opis wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Kwota bazowa (zł)</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7', width: '80px' }}>Mnożnik / Ilość</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Suma Wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcExpenses.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', borderLeft: `3px solid ${rowStripe(item)}` }}>
                        <td style={{ padding: '6px 8px' }}>{item.name}</td>
                        <td style={{ padding: '6px 8px' }}>{Number(item.price).toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" min="1" step="any" value={item.quantity || 1} onChange={(e) => handleQuantityChange('calc_expenses', calcExpenses, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#c53030' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                        {renderDeleteBtn('calc_expenses', calcExpenses, index)}
                      </tr>
                    ))}
                    {calcExpenses.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodatkowych wydatków</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ФАЙЛЫ */}
          {activeTab === 'files' && (
            <FilesTab clientId={client.id} currentProfile={currentProfile} />
          )}

        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
