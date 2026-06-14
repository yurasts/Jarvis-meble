import React, { useState } from 'react';

const ProjectModal = ({ client, setClient, materials, servicesList, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('materials');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');

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
    const matchesSearch = 
      (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (m.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = filterCategory ? m.category === filterCategory : true;
    const matchesSup = filterSupplier ? m.supplier === filterSupplier : true;
    return matchesSearch && matchesCat && matchesSup;
  });

  const updateItems = (field, newItems) => {
    setClient({ ...client, [field]: newItems });
  };

  const handleAddItem = (field, currentItems, item) => {
    const existing = currentItems.find(i => i.id === item.id);
    if (existing) {
      updateItems(field, currentItems.map(i => i.id === item.id ? { ...i, quantity: (Number(i.quantity) || 1) + 1 } : i));
    } else {
      updateItems(field, [...currentItems, { ...item, quantity: 1 }]);
    }
  };

  const handleRemoveItem = (field, currentItems, indexToRemove) => {
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
    const price = parseFloat(prompt('Wpisz cenę za szt/usługę (PLN):') || '0');
    updateItems(field, [...currentItems, { id: Date.now(), name, price, quantity: 1, unit: 'szt', category: 'Inne', supplier: 'Brak' }]);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '30px', paddingBottom: '30px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: '10px', width: '95%', maxWidth: '1100px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', position: 'relative' }}>
        
        {/* Шапка окна */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #edf2f7', paddingBottom: '10px', marginBottom: '15px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#2d3748' }}>{client.full_name}</h2>
            <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>Budżet: <strong>{Number(client.budget || 0).toFixed(2)} PLN</strong> | Koszty całkowite: <strong style={{ color: '#e53e3e' }}>{totalProjectCost.toFixed(2)} PLN</strong></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Zamknij</button>
            <button onClick={onSave} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#3182ce', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Zapisz zmiany</button>
          </div>
        </div>

        {/* Навигация вкладок */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '15px', gap: '4px' }}>
          <button onClick={() => setActiveTab('materials')} style={{ flex: 1, padding: '8px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'materials' ? '#ebf8ff' : 'transparent', border: 'none', borderBottom: activeTab === 'materials' ? '3px solid #3182ce' : '3px solid transparent', color: activeTab === 'materials' ? '#2b6cb0' : '#4a5568', cursor: 'pointer', transition: 'all 0.2s' }}>
            📦 Materiały ({totalMaterials.toFixed(2)} PLN)
          </button>
          <button onClick={() => setActiveTab('services')} style={{ flex: 1, padding: '8px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'services' ? '#f0fff4' : 'transparent', border: 'none', borderBottom: activeTab === 'services' ? '3px solid #38a169' : '3px solid transparent', color: activeTab === 'services' ? '#276749' : '#4a5568', cursor: 'pointer', transition: 'all 0.2s' }}>
            🛠 Usługi ({totalServices.toFixed(2)} PLN)
          </button>
          <button onClick={() => setActiveTab('expenses')} style={{ flex: 1, padding: '8px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'expenses' ? '#fff5f5' : 'transparent', border: 'none', borderBottom: activeTab === 'expenses' ? '3px solid #e53e3e' : '3px solid transparent', color: activeTab === 'expenses' ? '#c53030' : '#4a5568', cursor: 'pointer', transition: 'all 0.2s' }}>
            💸 Wydatki ({totalExpenses.toFixed(2)} PLN)
          </button>
        </div>

        {/* КОНТЕНТ ВКЛАДОК */}
        <div style={{ minHeight: '350px' }}>

          {/* ВКЛАДКА: МАТЕРИАЛЫ */}
          {activeTab === 'materials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* Компактная панель фильтров */}
              <div style={{ background: '#f7fafc', padding: '10px 0', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                
                {/* СЕТКА ФИЛЬТРОВ (GRID) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 160px', gap: '10px', alignItems: 'center', padding: '0 10px' }}>
                  <input type="text" placeholder="Szukaj (nazwa, symbol)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }} />
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}>
                    <option value="">Wszystkie kat.</option>
                    {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}>
                    <option value="">Dostawcy</option>
                    {uniqueSuppliers.map(sup => <option key={sup} value={sup}>{sup}</option>)}
                  </select>
                  <div></div>
                </div>
                
                {/* СЕТКА СПИСКА (GRID) */}
                <div style={{ maxHeight: '180px', overflowY: 'auto', borderTop: '1px solid #e2e8f0', background: '#fff', marginTop: '10px' }}>
                  {filteredMaterials.slice(0, 50).map(m => {
                    const isSelected = calcMaterials.some(item => item.id === m.id);
                    return (
                      <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 160px', gap: '10px', padding: '4px 10px', borderBottom: '1px solid #edf2f7', fontSize: '12px', alignItems: 'center', backgroundColor: isSelected ? '#ebf8ff' : '#fff' }}>
                        
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', overflow: 'hidden' }}>
                          <span style={{ width: '100px', color: '#718096', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.symbol || '-'}</span>
                          <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        </div>
                        
                        <div style={{ color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.category}</div>
                        <div style={{ color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.supplier || 'Brak'}</div>
                        
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <strong style={{ color: '#2b6cb0' }}>{Number(m.price).toFixed(2)} PLN</strong>
                          <button onClick={() => handleAddItem('calc_materials', calcMaterials, m)} style={{ background: isSelected ? '#cbd5e0' : '#38a169', color: isSelected ? '#2d3748' : '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '70px' }}>
                            {isSelected ? '+ Kol.' : '+ Dodaj'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredMaterials.length === 0 && <div style={{ padding: '10px', textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>Brak wyników</div>}
                </div>
              </div>

              {/* Таблица добавленных материалов */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#edf2f7', textAlign: 'left', color: '#4a5568' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Kategoria</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Symbol</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Nazwa materiału</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Dostawca</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Cena j.</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Jm</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0', width: '60px' }}>Ilość</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Suma</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {calcMaterials.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ebf8ff' }}>
                      <td style={{ padding: '4px 8px' }}>{item.category || 'Inne'}</td>
                      <td style={{ padding: '4px 8px', color: '#718096' }}>{item.symbol || '-'}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 'bold' }}>{item.name}</td>
                      <td style={{ padding: '4px 8px' }}>{item.supplier || 'Brak'}</td>
                      <td style={{ padding: '4px 8px' }}>{Number(item.price).toFixed(2)}</td>
                      <td style={{ padding: '4px 8px' }}>{item.unit || 'szt'}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => handleQuantityChange('calc_materials', calcMaterials, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '12px', background: '#fff' }} />
                      </td>
                      <td style={{ padding: '4px 8px', fontWeight: 'bold', color: '#2b6cb0' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <button onClick={() => handleRemoveItem('calc_materials', calcMaterials, index)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '14px', padding: 0 }} title="Usuń">✖</button>
                      </td>
                    </tr>
                  ))}
                  {calcMaterials.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych materiałów</td></tr>}
                </tbody>
              </table>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => handleCustomAdd('calc_materials', calcMaterials)} style={{ background: '#edf2f7', color: '#2d3748', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Dodaj pozycję ręcznie</button>
              </div>
            </div>
          )}

          {/* ВКЛАДКА: УСЛУГИ */}
          {activeTab === 'services' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                <select id="service-select" style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', flex: 1, fontSize: '13px' }}>
                  <option value="">-- Wybierz usługę z bazy --</option>
                  {(servicesList || []).map(s => <option key={s.id} value={JSON.stringify(s)}>{s.name} ({s.price} PLN)</option>)}
                </select>
                <button onClick={() => {
                  const select = document.getElementById('service-select');
                  if(select.value) handleAddItem('calc_services', calcServices, JSON.parse(select.value));
                  select.value = '';
                }} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Dodaj z bazy</button>
                <button onClick={() => handleCustomAdd('calc_services', calcServices)} style={{ background: '#edf2f7', color: '#2d3748', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>+ Usługa niestandardowa</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f0fff4', textAlign: 'left', color: '#276749' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Nazwa usługi</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Cena jend. (PLN)</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5', width: '80px' }}>Ilość</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}>Suma</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #c6f6d5' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {calcServices.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px' }}>{item.name}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(item.price).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" min="1" value={item.quantity || 1} onChange={(e) => handleQuantityChange('calc_services', calcServices, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button onClick={() => handleRemoveItem('calc_services', calcServices, index)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '14px' }}>✖</button>
                      </td>
                    </tr>
                  ))}
                  {calcServices.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych usług</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ВКЛАДКА: РАСХОДЫ */}
          {activeTab === 'expenses' && (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <button onClick={() => handleCustomAdd('calc_expenses', calcExpenses)} style={{ background: '#fc8181', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>+ Dodaj wydatek (Paliwo, Zakupy itp.)</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#fff5f5', textAlign: 'left', color: '#c53030' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Opis wydatku</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Kwota bazowa (PLN)</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7', width: '80px' }}>Mnożnik / Ilość</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}>Suma Wydatku</th>
                    <th style={{ padding: '6px 8px', borderBottom: '2px solid #fed7d7' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {calcExpenses.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px' }}>{item.name}</td>
                      <td style={{ padding: '6px 8px' }}>{Number(item.price).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" min="1" step="any" value={item.quantity || 1} onChange={(e) => handleQuantityChange('calc_expenses', calcExpenses, index, e.target.value)} style={{ width: '50px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#c53030' }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button onClick={() => handleRemoveItem('calc_expenses', calcExpenses, index)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '14px' }}>✖</button>
                      </td>
                    </tr>
                  ))}
                  {calcExpenses.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodatkowych wydatków</td></tr>}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProjectModal;