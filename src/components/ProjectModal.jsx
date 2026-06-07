import React, { useState } from 'react';
import Select from 'react-select';
import { generatePDF, generateShoppingListPDF } from '../utils/pdfGenerator';

const selectStyles = {
  control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px', textAlign: 'left' }),
  option: (base) => ({ ...base, fontSize: '13px', padding: '4px 10px', lineHeight: '1.2', textAlign: 'left' }),
  singleValue: (base) => ({ ...base, fontSize: '13px', textAlign: 'left' }),
  menu: (base) => ({ ...base, fontSize: '13px', zIndex: 9999, textAlign: 'left' }),
  placeholder: (base) => ({ ...base, fontSize: '13px', textAlign: 'left' })
};

const formatOptionWithPrice = ({ label, price }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '10px' }}>{label}</span>
    <span style={{ fontWeight: 'bold', color: '#2b6cb0', whiteSpace: 'nowrap' }}>{Number(price || 0).toFixed(2)} PLN</span>
  </div>
);

const ProjectModal = ({ client, setClient, materials, servicesList, onClose, onSave }) => {
  const [selectedMatId, setSelectedMatId] = useState('');
  const [matQty, setMatQty] = useState(1);
  const [selectedSrvId, setSelectedSrvId] = useState('');
  const [srvQty, setSrvQty] = useState(1);
  const [manualSrvName, setManualSrvName] = useState('');
  const [manualSrvPrice, setManualSrvPrice] = useState('');

  const addMaterialToProject = () => {
    if (!selectedMatId) return;
    const mat = materials.find(m => m.id.toString() === selectedMatId.toString());
    if (!mat) return;
    const newItem = { ...mat, quantity: Number(matQty) };
    setClient({ ...client, calc_materials: [...(client.calc_materials || []), newItem] });
    setMatQty(1); setSelectedMatId('');
  };

  const confirmRemoveMaterial = (index) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten materiał z listy?')) {
      const currentItems = [...(client.calc_materials || [])];
      currentItems.splice(index, 1);
      setClient({ ...client, calc_materials: currentItems });
    }
  };

  const addDbServiceToProject = () => {
    if (!selectedSrvId) return;
    const srv = servicesList.find(s => s.id.toString() === selectedSrvId.toString());
    if (!srv) return;
    const newService = { name: srv.name, price: Number(srv.price), quantity: Number(srvQty) };
    setClient({ ...client, calc_services: [...(client.calc_services || []), newService] });
    setSrvQty(1); setSelectedSrvId('');
  };

  const addManualServiceToProject = () => {
    if (!manualSrvName || !manualSrvPrice) return;
    const newService = { name: manualSrvName, price: Number(manualSrvPrice), quantity: 1 };
    setClient({ ...client, calc_services: [...(client.calc_services || []), newService] });
    setManualSrvName(''); setManualSrvPrice('');
  };

  const confirmRemoveService = (index) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę pozycję z kosztów?')) {
      const currentServices = [...(client.calc_services || [])];
      currentServices.splice(index, 1);
      setClient({ ...client, calc_services: currentServices });
    }
  };

  const totalMatCost = (client?.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const totalSrvCost = (client?.calc_services || []).reduce((sum, item) => sum + (Number(item.price) * (Number(item.quantity) || 1)), 0);
  const totalCost = totalMatCost + totalSrvCost;
  const expectedProfit = (Number(client?.budget) || 0) - totalCost;

  return (
    // 1. ИСПРАВЛЕННЫЙ ФОН: Теперь он 100% перекрывает весь экран и центрирует контент
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }} onClick={onClose}>
      
      {/* 2. ИСПРАВЛЕННОЕ ОКНО: Ограничено по высоте, красивый скролл, белый фон */}
      <div style={{ width: '100%', maxWidth: '1400px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', backgroundColor: '#fff', borderRadius: '12px', padding: '30px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
        
        {/* КНОПКА ЗАКРЫТИЯ ОКНА (КРЕСТИК) */}
        <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '25px', background: 'none', border: 'none', fontSize: '28px', color: '#a0aec0', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          &times;
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px', paddingRight: '40px' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 style={{ margin: 0, wordWrap: 'break-word', color: '#2d3748' }}>Projekt: {client.full_name}</h2>
            <input 
              type="text" 
              value={client.address || ''} 
              onChange={(e) => setClient({...client, address: e.target.value})} 
              placeholder="Adres montażu..."
              style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', width: '100%', maxWidth: '400px', boxSizing: 'border-box', fontSize: '14px' }} 
            />
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold' }}>TERMIN:</span><br/>
              <input type="date" value={client.deadline || ''} onChange={(e) => setClient({...client, deadline: e.target.value})} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '14px', background: '#fff', marginTop: '4px' }} />
            </div>
            <div style={{ paddingLeft: '15px', borderLeft: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '13px', color: '#718096' }}>Budżet:</span><br/>
              <strong style={{ fontSize: '22px', color: '#2d3748' }}>{Number(client.budget).toFixed(2)} PLN</strong>
            </div>
            <button type="button" onClick={() => generatePDF(client)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginLeft: '10px' }}>
              📄 Drukuj Ofertę
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '25px' }}>
          
          <div style={{ flex: '1 1 400px', minWidth: 0, background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#2d3748', fontSize: '18px' }}>🛒 Materiały</h3>
              <button type="button" onClick={() => generateShoppingListPDF(client)} style={{ background: '#fff', border: '1px solid #cbd5e0', color: '#4a5568', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                🖨️ Drukuj listę
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <Select
                  options={[...materials].sort((a,b) => a.name.localeCompare(b.name)).map(mat => ({ value: mat.id, label: mat.name, price: mat.price }))}
                  formatOptionLabel={formatOptionWithPrice}
                  value={selectedMatId ? { value: selectedMatId, label: materials.find(m => m.id === selectedMatId)?.name, price: materials.find(m => m.id === selectedMatId)?.price } : null}
                  onChange={(opt) => setSelectedMatId(opt ? opt.value : '')}
                  placeholder="Szukaj materiału..."
                  isSearchable
                  isClearable
                  styles={selectStyles}
                />
              </div>
              <input type="number" step="0.1" style={{ width: '70px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '14px', boxSizing: 'border-box' }} value={matQty} onChange={(e) => setMatQty(e.target.value)} placeholder="Ilość" />
              <button type="button" onClick={addMaterialToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Dodaj</button>
            </div>

            {(client.calc_materials || []).length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '10px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#718096', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px', width: '55%' }}>Nazwa</th>
                      <th style={{ padding: '8px 6px', width: '20%', textAlign: 'center' }}>Ilość</th>
                      <th style={{ padding: '8px 6px', width: '20%', textAlign: 'right' }}>Koszt</th>
                      <th style={{ padding: '8px 6px', width: '5%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(client.calc_materials || []).map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 6px', color: '#2d3748' }}>{item.name}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', color: '#4a5568' }}>{item.quantity} {item.unit}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 'bold', textAlign: 'right', color: '#2d3748' }}>{(Number(item.price) * Number(item.quantity)).toFixed(2)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}><button onClick={() => confirmRemoveMaterial(index)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '16px' }} title="Usuń">✖</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: '15px', fontSize: '15px', fontWeight: 'bold', color: '#4a5568', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              Suma materiałów: <span style={{ color: '#e53e3e', marginLeft: '10px' }}>{Number(totalMatCost).toFixed(2)} PLN</span>
            </div>
          </div>

          <div style={{ flex: '1 1 300px', minWidth: 0, background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#2d3748', fontSize: '18px' }}>🛠 Usługi i Wydatki</h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <Select
                  options={servicesList.map(srv => ({ value: srv.id, label: srv.name, price: srv.price }))}
                  formatOptionLabel={formatOptionWithPrice}
                  value={selectedSrvId ? { value: selectedSrvId, label: servicesList.find(s => s.id === selectedSrvId)?.name, price: servicesList.find(s => s.id === selectedSrvId)?.price } : null}
                  onChange={(opt) => setSelectedSrvId(opt ? opt.value : '')}
                  placeholder="Wybierz usługę..."
                  isSearchable
                  isClearable
                  styles={selectStyles}
                />
              </div>
              <input type="number" step="0.1" style={{ width: '60px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '14px', boxSizing: 'border-box' }} value={srvQty} onChange={(e) => setSrvQty(e.target.value)} placeholder="Ilość" />
              <button type="button" onClick={addDbServiceToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Dodaj</button>
            </div>

            <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '11px', color: '#718096', display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Inne / Ręczne dodanie:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" style={{ flex: 1, minWidth: 0, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '14px', boxSizing: 'border-box' }} value={manualSrvName} onChange={(e) => setManualSrvName(e.target.value)} placeholder="Nazwa wydatku" />
                <input type="number" step="0.01" style={{ width: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '14px', boxSizing: 'border-box' }} value={manualSrvPrice} onChange={(e) => setManualSrvPrice(e.target.value)} placeholder="Cena" />
                <button type="button" onClick={addManualServiceToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Dodaj</button>
              </div>
            </div>

            {(client.calc_services || []).length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#718096', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px', width: '55%' }}>Nazwa</th>
                      <th style={{ padding: '8px 6px', width: '20%', textAlign: 'center' }}>Ilość</th>
                      <th style={{ padding: '8px 6px', width: '20%', textAlign: 'right' }}>Koszt</th>
                      <th style={{ padding: '8px 6px', width: '5%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(client.calc_services || []).map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 6px', color: '#2d3748' }}>{item.name}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', color: '#4a5568' }}>{item.quantity || 1}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 'bold', textAlign: 'right', color: '#2d3748' }}>{(Number(item.price) * (item.quantity || 1)).toFixed(2)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}><button onClick={() => confirmRemoveService(index)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '16px' }} title="Usuń">✖</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: '15px', fontSize: '15px', fontWeight: 'bold', color: '#4a5568', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              Suma usług: <span style={{ color: '#e53e3e', marginLeft: '10px' }}>{Number(totalSrvCost).toFixed(2)} PLN</span>
            </div>
          </div>
        </div>

        <div style={{ background: expectedProfit >= 0 ? '#f0fff4' : '#fff5f5', border: expectedProfit >= 0 ? '1px solid #c6f6d5' : '1px solid #fed7d7', padding: '20px', borderRadius: '10px', marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div><span style={{ color: '#4a5568', fontSize: '15px' }}>Całkowity koszt projektu: </span><strong style={{ color: '#e53e3e', fontSize: '18px', marginLeft: '10px' }}>{Number(totalCost).toFixed(2)} PLN</strong></div>
          <div style={{ fontSize: '22px' }}><span style={{ color: '#4a5568' }}>Szacowany ZYSK: </span><strong style={{ color: expectedProfit >= 0 ? '#38a169' : '#e53e3e', marginLeft: '10px' }}>{Number(expectedProfit).toFixed(2)} PLN</strong></div>
        </div>

        <form onSubmit={onSave} style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#4a5568', marginBottom: '8px' }}>Dodatkowe notatki i linki do plików:</label>
            <textarea rows="3" value={client.notes || ''} onChange={(e) => setClient({...client, notes: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e0', boxSizing: 'border-box', fontSize: '14px', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} style={{ background: '#edf2f7', color: '#4a5568', border: '1px solid #cbd5e0', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Anuluj</button>
            <button type="submit" style={{ background: '#38a169', color: '#fff', border: 'none', padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Zapisz projekt</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectModal;