import React, { useState } from 'react';
import Select from 'react-select';
import { generatePDF, generateShoppingListPDF } from '../utils/pdfGenerator';

const selectStyles = {
  control: (base) => ({ ...base, minHeight: '30px', height: '30px', fontSize: '13px', textAlign: 'left' }),
  valueContainer: (base) => ({ ...base, padding: '0 8px' }),
  input: (base) => ({ ...base, margin: '0', padding: '0' }),
  indicatorSeparator: () => ({ display: 'none' }),
  indicatorsContainer: (base) => ({ ...base, height: '30px' }),
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

  // --- МАТЕРИАЛЫ ---
  const addMaterialToProject = () => {
    if (!selectedMatId) return;
    const mat = materials.find(m => m.id.toString() === selectedMatId.toString());
    if (!mat) return;
    // Добавляем флаг isBought: false по умолчанию
    const newItem = { ...mat, quantity: Number(matQty), isBought: false };
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

  // Новая функция: Переключение статуса "Куплено"
  const toggleMaterialBought = (index) => {
    const currentItems = [...(client.calc_materials || [])];
    currentItems[index].isBought = !currentItems[index].isBought;
    setClient({ ...client, calc_materials: currentItems });
  };

  // Новая функция: Печать списков (фильтрует перед отправкой в PDF)
  const handlePrintShoppingList = (onlyToBuy = false) => {
    let clientToPrint = { ...client };
    if (onlyToBuy) {
      clientToPrint.calc_materials = (client.calc_materials || []).filter(m => !m.isBought);
    }
    generateShoppingListPDF(clientToPrint);
  };

  // --- УСЛУГИ ---
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

  // --- РАСЧЕТЫ ---
  const totalMatCost = (client?.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const leftToBuyCost = (client?.calc_materials || []).filter(m => !m.isBought).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  
  const totalSrvCost = (client?.calc_services || []).reduce((sum, item) => sum + (Number(item.price) * (Number(item.quantity) || 1)), 0);
  const totalCost = totalMatCost + totalSrvCost;
  const expectedProfit = (Number(client?.budget) || 0) - totalCost;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: '1400px', maxHeight: '95vh', overflowY: 'auto', overflowX: 'hidden', backgroundColor: '#fff', borderRadius: '8px', padding: '20px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
        
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '24px', color: '#a0aec0', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>

        {/* ШАПКА ПРОЕКТА */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '10px', paddingRight: '30px' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 style={{ margin: 0, wordWrap: 'break-word', color: '#2d3748', fontSize: '22px', lineHeight: '1.2' }}>{client.full_name}</h2>
            <input type="text" value={client.address || ''} onChange={(e) => setClient({...client, address: e.target.value})} placeholder="Adres montażu..." style={{ marginTop: '4px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', width: '100%', maxWidth: '400px', boxSizing: 'border-box', fontSize: '13px' }} />
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ textAlign: 'left' }}><span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold' }}>TERMIN:</span><br/><input type="date" value={client.deadline || ''} onChange={(e) => setClient({...client, deadline: e.target.value})} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '13px', background: '#fff', marginTop: '2px' }} /></div>
            <div style={{ paddingLeft: '10px', borderLeft: '1px solid #e2e8f0' }}><span style={{ fontSize: '11px', color: '#718096' }}>Budżet:</span><br/><strong style={{ fontSize: '18px', color: '#2d3748', lineHeight: '1' }}>{Number(client.budget).toFixed(2)} PLN</strong></div>
            <button type="button" onClick={() => generatePDF(client)} style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginLeft: '5px', fontSize: '13px' }}>Drukuj Ofertę</button>
          </div>
        </div>
        
        {/* КОЛОНКИ */}
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '10px' }}>
          
          {/* МАТЕРИАЛЫ */}
          <div style={{ flex: '1 1 450px', minWidth: 0, background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#2d3748', fontSize: '15px' }}>🛒 Materiały</h3>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button type="button" onClick={() => handlePrintShoppingList(true)} style={{ background: '#fff', border: '1px solid #38a169', color: '#38a169', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }} title="Drukuj tylko niekupione">🖨️ Do kupienia</button>
                <button type="button" onClick={() => handlePrintShoppingList(false)} style={{ background: '#fff', border: '1px solid #cbd5e0', color: '#4a5568', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }} title="Drukuj całą listę">🖨️ Wszystko</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <Select options={[...materials].sort((a,b) => a.name.localeCompare(b.name)).map(mat => ({ value: mat.id, label: mat.name, price: mat.price }))} formatOptionLabel={formatOptionWithPrice} value={selectedMatId ? { value: selectedMatId, label: materials.find(m => m.id === selectedMatId)?.name, price: materials.find(m => m.id === selectedMatId)?.price } : null} onChange={(opt) => setSelectedMatId(opt ? opt.value : '')} placeholder="Szukaj..." isSearchable isClearable styles={selectStyles} />
              </div>
              <input type="number" step="0.1" style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '13px', boxSizing: 'border-box', height: '30px' }} value={matQty} onChange={(e) => setMatQty(e.target.value)} placeholder="Ilość" />
              <button type="button" onClick={addMaterialToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '30px', fontSize: '13px' }}>Dodaj</button>
            </div>

            {(client.calc_materials || []).length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#718096', textAlign: 'left' }}>
                      <th style={{ padding: '4px 2px', width: '5%', textAlign: 'center' }}>✔</th>
                      <th style={{ padding: '4px 2px', width: '65%' }}>Nazwa</th>
                      <th style={{ padding: '4px 2px', width: '15%', textAlign: 'right' }}>Ilość</th>
                      <th style={{ padding: '4px 2px', width: '10%', textAlign: 'right' }}>Koszt</th>
                      <th style={{ padding: '4px 2px', width: '5%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(client.calc_materials || []).map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: item.isBought ? '#f0fff4' : 'transparent', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '3px 2px', textAlign: 'center' }}>
                          <input type="checkbox" checked={!!item.isBought} onChange={() => toggleMaterialBought(index)} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                        </td>
                        <td style={{ padding: '3px 2px', color: item.isBought ? '#a0aec0' : '#2d3748', lineHeight: '1.2', textDecoration: item.isBought ? 'line-through' : 'none' }}>{item.name}</td>
                        <td style={{ padding: '3px 2px', textAlign: 'right', color: item.isBought ? '#a0aec0' : '#4a5568' }}>{item.quantity} {item.unit}</td>
                        <td style={{ padding: '3px 2px', fontWeight: 'bold', textAlign: 'right', color: item.isBought ? '#a0aec0' : '#2d3748' }}>{(Number(item.price) * Number(item.quantity)).toFixed(2)}</td>
                        <td style={{ padding: '3px 2px', textAlign: 'center' }}><button onClick={() => confirmRemoveMaterial(index)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '14px', padding: 0 }} title="Usuń">✖</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
              <div style={{ color: '#718096' }}>Suma (Całość): <span style={{ color: '#4a5568' }}>{Number(totalMatCost).toFixed(2)} PLN</span></div>
              <div style={{ color: '#2d3748' }}>Do kupienia: <span style={{ color: leftToBuyCost > 0 ? '#e53e3e' : '#38a169' }}>{Number(leftToBuyCost).toFixed(2)} PLN</span></div>
            </div>
          </div>

          {/* УСЛУГИ И ВЫДАТКИ (Без изменений, просто подогнал ширину) */}
          <div style={{ flex: '1 1 300px', minWidth: 0, background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#2d3748', fontSize: '15px' }}>🛠 Usługi i Wydatki</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <Select options={servicesList.map(srv => ({ value: srv.id, label: srv.name, price: srv.price }))} formatOptionLabel={formatOptionWithPrice} value={selectedSrvId ? { value: selectedSrvId, label: servicesList.find(s => s.id === selectedSrvId)?.name, price: servicesList.find(s => s.id === selectedSrvId)?.price } : null} onChange={(opt) => setSelectedSrvId(opt ? opt.value : '')} placeholder="Wybierz..." isSearchable isClearable styles={selectStyles} />
              </div>
              <input type="number" step="0.1" style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '13px', boxSizing: 'border-box', height: '30px' }} value={srvQty} onChange={(e) => setSrvQty(e.target.value)} placeholder="Il." />
              <button type="button" onClick={addDbServiceToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '30px', fontSize: '13px' }}>Dodaj</button>
            </div>
            <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="text" style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '13px', boxSizing: 'border-box', height: '30px' }} value={manualSrvName} onChange={(e) => setManualSrvName(e.target.value)} placeholder="Inne (ręcznie)..." />
                <input type="number" step="0.01" style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '13px', boxSizing: 'border-box', height: '30px' }} value={manualSrvPrice} onChange={(e) => setManualSrvPrice(e.target.value)} placeholder="Cena" />
                <button type="button" onClick={addManualServiceToProject} style={{ background: '#3182ce', color: 'white', border: 'none', padding: '0 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '30px', fontSize: '13px' }}>Dodaj</button>
              </div>
            </div>
            {(client.calc_services || []).length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#718096', textAlign: 'left' }}>
                      <th style={{ padding: '4px 2px', width: '70%' }}>Nazwa</th>
                      <th style={{ padding: '4px 2px', width: '15%', textAlign: 'right' }}>Ilość</th>
                      <th style={{ padding: '4px 2px', width: '10%', textAlign: 'right' }}>Koszt</th>
                      <th style={{ padding: '4px 2px', width: '5%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(client.calc_services || []).map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '3px 2px', color: '#2d3748', lineHeight: '1.2' }}>{item.name}</td>
                        <td style={{ padding: '3px 2px', textAlign: 'right', color: '#4a5568' }}>{item.quantity || 1}</td>
                        <td style={{ padding: '3px 2px', fontWeight: 'bold', textAlign: 'right', color: '#2d3748' }}>{(Number(item.price) * (item.quantity || 1)).toFixed(2)}</td>
                        <td style={{ padding: '3px 2px', textAlign: 'center' }}><button onClick={() => confirmRemoveService(index)} style={{ background: 'none', border: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '14px', padding: 0 }} title="Usuń">✖</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '13px', fontWeight: 'bold', color: '#4a5568', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
              Suma usług: <span style={{ color: '#e53e3e', marginLeft: '6px' }}>{Number(totalSrvCost).toFixed(2)} PLN</span>
            </div>
          </div>
        </div>

        {/* ИТОГО И КНОПКИ СОХРАНЕНИЯ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', gap: '15px' }}>
          <div style={{ flex: 1, background: expectedProfit >= 0 ? '#f0fff4' : '#fff5f5', border: expectedProfit >= 0 ? '1px solid #c6f6d5' : '1px solid #fed7d7', padding: '10px 15px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ color: '#4a5568', fontSize: '13px' }}>Całkowity koszt: </span><strong style={{ color: '#e53e3e', fontSize: '16px', marginLeft: '6px' }}>{Number(totalCost).toFixed(2)} PLN</strong></div>
            <div style={{ fontSize: '18px' }}><span style={{ color: '#4a5568', fontSize: '14px' }}>ZYSK: </span><strong style={{ color: expectedProfit >= 0 ? '#38a169' : '#e53e3e', marginLeft: '6px' }}>{Number(expectedProfit).toFixed(2)} PLN</strong></div>
          </div>

          <form onSubmit={onSave} style={{ display: 'flex', gap: '10px', margin: 0 }}>
            <button type="button" onClick={onClose} style={{ background: '#edf2f7', color: '#4a5568', border: '1px solid #cbd5e0', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Anuluj</button>
            <button type="submit" style={{ background: '#38a169', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Zapisz projekt</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;