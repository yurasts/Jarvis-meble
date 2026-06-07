import { useEffect, useState } from 'react'
import Select from 'react-select'
import { supabase } from './supabase'
import Dashboard from './components/Dashboard'
import KanbanBoard from './components/KanbanBoard'
import MaterialsList from './components/MaterialsList'
import ProductionTab from './components/ProductionTab'
import './App.css'

// Стили для умного поиска (добавлено принудительное выравнивание по левому краю)
const selectStyles = {
  control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px', textAlign: 'left' }),
  option: (base) => ({ ...base, fontSize: '13px', padding: '2px 10px', lineHeight: '1.2', textAlign: 'left' }),
  singleValue: (base) => ({ ...base, fontSize: '13px', textAlign: 'left' }),
  menu: (base) => ({ ...base, fontSize: '13px', zIndex: 9999, textAlign: 'left' }),
  placeholder: (base) => ({ ...base, fontSize: '13px', textAlign: 'left' })
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [materials, setMaterials] = useState([])
  const [servicesList, setServicesList] = useState([])
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeClient, setActiveClient] = useState(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [budget, setBudget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [address, setAddress] = useState('')

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [matName, setMatName] = useState('')
  const [matCategory, setMatCategory] = useState('Płyta')
  const [matUnit, setMatUnit] = useState('szt')
  const [matPrice, setMatPrice] = useState('')

  const [selectedMatId, setSelectedMatId] = useState('')
  const [matQty, setMatQty] = useState(1)

  const [srvName, setSrvName] = useState('')
  const [srvPrice, setSrvPrice] = useState('')

  useEffect(() => {
    async function fetchData() {
      const { data: clientsData } = await supabase.from('clients').select('*')
      if (clientsData) setClients(clientsData)
      
      const { data: materialsData } = await supabase.from('materials').select('*')
      if (materialsData) {
        setMaterials(materialsData)
      }

      const { data: servicesData } = await supabase.from('services').select('*')
      if (servicesData) setServicesList(servicesData)
    }
    fetchData()
  }, [])

  async function handleAddClient(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('clients').insert([{ 
      full_name: name, 
      phone: phone, 
      budget: Number(budget) || 0, 
      deadline: deadline || null, 
      address: address,
      status: 'new' 
    }]).select()
    if (!error && data) {
      setClients([...clients, data[0]])
      setName(''); setPhone(''); setBudget(''); setDeadline(''); setAddress('')
      setIsModalOpen(false)
    }
  }

  async function handleUpdateClient(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('clients')
      .update({ 
        notes: activeClient.notes, 
        deadline: activeClient.deadline, 
        address: activeClient.address,
        calc_materials: activeClient.calc_materials || [], 
        calc_services: activeClient.calc_services || [] 
      })
      .eq('id', activeClient.id).select()
    if (!error && data) {
      setClients(clients.map(c => c.id === activeClient.id ? data[0] : c))
      setActiveClient(null)
    }
  }

  async function handleAddMaterial(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('materials').insert([{ name: matName, category: matCategory, unit: matUnit, price: Number(matPrice) }]).select()
    if (!error && data) {
      setMaterials([...materials, data[0]])
      setMatName(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    }
  }

  const addMaterialToProject = () => {
    if (!selectedMatId) return
    const mat = materials.find(m => m.id.toString() === selectedMatId.toString())
    if (!mat) return
    const newItem = { ...mat, quantity: Number(matQty) }
    const currentItems = activeClient.calc_materials || []
    setActiveClient({ ...activeClient, calc_materials: [...currentItems, newItem] })
    setMatQty(1)
    setSelectedMatId('') 
  }

  const confirmRemoveMaterial = (index) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten materiał z listy?')) {
      const currentItems = [...(activeClient.calc_materials || [])]
      currentItems.splice(index, 1)
      setActiveClient({ ...activeClient, calc_materials: currentItems })
    }
  }

  const addServiceToProject = () => {
    if (!srvName || !srvPrice) return
    const newService = { name: srvName, price: Number(srvPrice) }
    const currentServices = activeClient.calc_services || []
    setActiveClient({ ...activeClient, calc_services: [...currentServices, newService] })
    setSrvName('')
    setSrvPrice('')
  }

  const confirmRemoveService = (index) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę pozycję z kosztów?')) {
      const currentServices = [...(activeClient.calc_services || [])]
      currentServices.splice(index, 1)
      setActiveClient({ ...activeClient, calc_services: currentServices })
    }
  }

  const handleDragStart = (e, id) => e.dataTransfer.setData('clientId', id)
  const handleDragOver = (e) => e.preventDefault() 
  const handleDrop = async (e, newStatus) => {
    const id = e.dataTransfer.getData('clientId')
    setClients(clients.map(client => client.id.toString() === id ? { ...client, status: newStatus } : client))
    await supabase.from('clients').update({ status: newStatus }).eq('id', id)
  }

  async function handleToggleProductionStep(client, stepId, isDone) {
    const updatedSteps = { ...(client.production_steps || {}), [stepId]: isDone }
    setClients(clients.map(c => c.id === client.id ? { ...c, production_steps: updatedSteps } : c))

    const { error } = await supabase.from('clients')
      .update({ production_steps: updatedSteps })
      .eq('id', client.id)
    
    if (error) {
      console.error("Błąd aktualizacji kroku:", error)
      alert("Wystąpił błąd podczas zapisywania statusu!")
    }
  }

  const totalMatCost = (activeClient?.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0)
  const totalSrvCost = (activeClient?.calc_services || []).reduce((sum, item) => sum + Number(item.price), 0)
  const totalCost = totalMatCost + totalSrvCost
  const expectedProfit = (Number(activeClient?.budget) || 0) - totalCost

  const generatePDF = (client) => {
    const mCost = (client.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0)
    const sCost = (client.calc_services || []).reduce((sum, item) => sum + Number(item.price), 0)
    const tCost = mCost + sCost
    const today = new Date().toLocaleDateString('pl-PL')
    const printWindow = window.open('', '_blank')
    const html = `
      <!DOCTYPE html><html><head><title>Oferta - ${client.full_name}</title>
      <style>
        body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
        h1 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 30px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .client-info { margin-bottom: 40px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
        th, td { border: 1px solid #cbd5e0; padding: 10px; text-align: left; }
        th { background-color: #edf2f7; color: #4a5568; }
        .total-box { margin-top: 30px; text-align: right; padding: 20px; background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 8px; }
        .footer { margin-top: 50px; font-size: 12px; color: #a0aec0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        @media print { body { padding: 0; } @page { margin: 1cm; } }
      </style></head><body>
      <div class="header"><div><h1>OFERTA / WYCENA</h1><p>Data: <strong>${today}</strong></p></div>
      <div style="text-align: right;"><h3 style="margin-bottom: 5px; color: #4a5568;">Wykonawca</h3><p style="margin: 0; font-weight: bold; font-size: 18px;">Jarvis Meble</p><p style="margin: 5px 0 0 0;">Tel: +48 000 000 000</p></div></div>
      <div class="client-info"><h3 style="margin: 0 0 10px 0; color: #4a5568;">Dla klienta:</h3><p style="margin: 0; font-size: 18px;"><strong>${client.full_name}</strong></p><p style="margin: 5px 0 0 0;">Tel: ${client.phone}</p>
      ${client.address ? `<p style="margin: 5px 0 0 0;">Adres: ${client.address}</p>` : ''}</div>
      <h3 style="color: #2d3748;">1. Wykorzystane materiały</h3>
      <table><tr><th>Nazwa materiału</th><th>Ilość</th><th>Jm</th><th>Cena jedn. brutto</th><th>Wartość</th></tr>
      ${(client.calc_materials || []).map(m => `<tr><td>${m.name}</td><td>${m.quantity}</td><td>${m.unit}</td><td>${Number(m.price).toFixed(2)} PLN</td><td><strong>${(Number(m.price) * Number(m.quantity)).toFixed(2)} PLN</strong></td></tr>`).join('')}
      ${(client.calc_materials || []).length === 0 ? '<tr><td colspan="5" style="text-align:center;">Brak materiałów</td></tr>' : ''}</table>
      <h3 style="color: #2d3748;">2. Usługi i koszty dodatkowe</h3>
      <table><tr><th>Nazwa usługi / kosztu</th><th>Wartość</th></tr>
      ${(client.calc_services || []).map(s => `<tr><td>${s.name}</td><td><strong>${Number(s.price).toFixed(2)} PLN</strong></td></tr>`).join('')}
      ${(client.calc_services || []).length === 0 ? '<tr><td colspan="2" style="text-align:center;">Brak usług</td></tr>' : ''}</table>
      <div class="total-box"><div style="font-size: 16px; color: #4a5568; margin-bottom: 10px;">Suma kosztów składowych: ${Number(tCost).toFixed(2)} PLN</div>
      <div style="font-size: 24px; color: #2b6cb0; font-weight: bold;">CAŁKOWITY KOSZT PROJEKTU: ${Number(client.budget).toFixed(2)} PLN</div></div>
      <div class="footer">Wygenerowano automatycznie. Oferta ma charakter informacyjny.</div></body></html>`
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 250)
  }

  const generateShoppingListPDF = (client) => {
    const materials = client.calc_materials || [];
    if (materials.length === 0) {
      alert('Brak materiałów do zamówienia.');
      return;
    }

    const grouped = materials.reduce((acc, mat) => {
      const supplier = mat.supplier || 'Nieokreślony';
      if (!acc[supplier]) acc[supplier] = [];
      acc[supplier].push(mat);
      return acc;
    }, {});

    const today = new Date().toLocaleDateString('pl-PL');
    const printWindow = window.open('', '_blank');

    let tablesHtml = '';
    for (const [supplier, items] of Object.entries(grouped)) {
      tablesHtml += `
        <div class="supplier-section">
          <h3>Dostawca: ${supplier}</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 70%;">Nazwa materiału</th>
                <th style="width: 15%;">Ilość</th>
                <th style="width: 15%;">Jm</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(m => `
                <tr>
                  <td>${m.name}</td>
                  <td><strong>${m.quantity}</strong></td>
                  <td>${m.unit}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html><html><head><title>Lista zakupów - ${client.full_name}</title>
      <style>
        body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
        h1 { color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px; }
        .header p { margin: 5px 0; color: #4a5568; }
        .supplier-section { margin-top: 30px; page-break-inside: avoid; }
        .supplier-section h3 { background: #edf2f7; padding: 10px; margin: 0; border: 1px solid #cbd5e0; border-bottom: none; font-size: 16px; color: #2b6cb0; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
        th, td { border: 1px solid #cbd5e0; padding: 8px 10px; text-align: left; }
        th { background-color: #f8fafc; color: #4a5568; font-weight: bold; }
        @media print { body { padding: 0; } @page { margin: 1cm; } }
      </style></head><body>
      <div class="header">
        <h1>LISTA ZAKUPÓW</h1>
        <p>Projekt: <strong>${client.full_name}</strong></p>
        <p>Data wygenerowania: <strong>${today}</strong></p>
      </div>
      ${tablesHtml}
      <div style="margin-top: 40px; font-size: 12px; color: #a0aec0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        Wygenerowano automatycznie z systemu Jarvis.
      </div>
      </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print() }, 250);
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>Jarvis</h2>
        <div className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</div>
        <div className={`menu-item ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>📋 Projekty</div>
        <div className={`menu-item ${activeTab === 'production' ? 'active' : ''}`} onClick={() => setActiveTab('production')}>🛠 Produkcja</div>
        <div className={`menu-item ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>📦 Materiały</div>
        <div className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Ustawienia</div>
      </div>

      <div className="main-content">
        
        {activeTab === 'dashboard' && <Dashboard clients={clients} />}

        {activeTab === 'board' && (
          <KanbanBoard 
            clients={clients} 
            setIsModalOpen={setIsModalOpen} 
            setActiveClient={setActiveClient} 
            handleDragStart={handleDragStart} 
            handleDragOver={handleDragOver} 
            handleDrop={handleDrop} 
          />
        )}

        {activeTab === 'production' && (
          <ProductionTab 
            clients={clients} 
            onToggleStep={handleToggleProductionStep} 
          />
        )}

        {activeTab === 'materials' && (
          <MaterialsList 
            materials={materials} 
            setIsMaterialModalOpen={setIsMaterialModalOpen} 
          />
        )}

      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '600px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <h2>Dodaj projekt</h2>
            <form onSubmit={handleAddClient}>
              <div className="form-group"><label>Imię i nazwisko klienta</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="form-group"><label>Telefon</label><input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div className="form-group"><label>Adres montażu</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="np. Gdańsk, ul. Długa 12/4" /></div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}><label>Budżet (PLN)</label><input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Termin</label><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', height: '42px' }} /></div>
              </div>
              <div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Anuluj</button><button type="submit" className="btn-primary">Zapisz</button></div>
            </form>
          </div>
        </div>
      )}

      {activeClient && (
        <div className="modal-overlay" style={{ paddingLeft: '200px', boxSizing: 'border-box' }} onClick={() => setActiveClient(null)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '1400px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <h2 style={{ margin: 0, wordWrap: 'break-word' }}>Szczegóły: {activeClient.full_name}</h2>
                <input 
                  type="text" 
                  value={activeClient.address || ''} 
                  onChange={(e) => setActiveClient({...activeClient, address: e.target.value})} 
                  placeholder="Adres montażu..."
                  style={{ marginTop: '10px', padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box', fontSize: '13px' }} 
                />
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn-primary" onClick={() => generatePDF(activeClient)} style={{ background: '#3182ce', padding: '10px 15px', whiteSpace: 'nowrap' }}>📄 Drukuj Ofertę</button>
                <div style={{ textAlign: 'left' }}><span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold' }}>TERMIN:</span><br/><input type="date" value={activeClient.deadline || ''} onChange={(e) => setActiveClient({...activeClient, deadline: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', background: '#f8fafc' }} /></div>
                <div><span style={{ fontSize: '14px', color: '#718096' }}>Budżet:</span><br/><strong style={{ fontSize: '20px', color: '#2d3748' }}>{Number(activeClient.budget).toFixed(2)} PLN</strong></div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 400px', minWidth: 0, background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#2d3748', fontSize: '16px' }}>🛒 Materiały</h3>
                  <button type="button" className="btn-secondary" onClick={() => generateShoppingListPDF(activeClient)} style={{ padding: '6px 10px', fontSize: '12px', margin: 0 }}>
                    🖨️ Drukuj listę
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <Select
                      options={[...materials]
                        .sort((a,b) => a.name.localeCompare(b.name))
                        .map(mat => ({ value: mat.id, label: mat.name }))}
                      value={selectedMatId ? { value: selectedMatId, label: materials.find(m => m.id === selectedMatId)?.name } : null}
                      onChange={(opt) => setSelectedMatId(opt ? opt.value : '')}
                      placeholder="Szukaj materiału..."
                      isSearchable
                      isClearable
                      styles={selectStyles}
                    />
                  </div>
                  <input type="number" step="0.1" style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', height: '34px', boxSizing: 'border-box' }} value={matQty} onChange={(e) => setMatQty(e.target.value)} placeholder="Ilość" />
                  <button type="button" className="btn-primary" onClick={addMaterialToProject} style={{ padding: '0 10px', fontSize: '13px', height: '34px', boxSizing: 'border-box' }}>Dodaj</button>
                </div>
                {(activeClient.calc_materials || []).length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="materials-table" style={{ marginTop: '0', tableLayout: 'fixed', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '4px 6px', width: '65%' }}>Nazwa</th>
                          <th style={{ padding: '4px 6px', width: '10%', textAlign: 'center' }}>Ilość</th>
                          <th style={{ padding: '4px 6px', width: '15%', textAlign: 'right' }}>Koszt</th>
                          <th style={{ padding: '4px 6px', width: '10%', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeClient.calc_materials || []).map((item, index) => (
                          <tr key={index}>
                            <td style={{ padding: '2px 6px', fontSize: '12px', wordWrap: 'break-word', lineHeight: '1.1' }}>{item.name}</td>
                            <td style={{ padding: '2px 6px', fontSize: '12px', textAlign: 'center' }}>{item.quantity} {item.unit}</td>
                            <td style={{ padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}>{(Number(item.price) * Number(item.quantity)).toFixed(2)}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'center' }}><button onClick={() => confirmRemoveMaterial(index)} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '14px', padding: '0' }} title="Usuń">❌</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '14px', fontWeight: 'bold', color: '#4a5568' }}>Suma: <span style={{ color: '#e53e3e' }}>{Number(totalMatCost).toFixed(2)} PLN</span></div>
              </div>

              <div style={{ flex: '1 1 300px', minWidth: 0, background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#2d3748', fontSize: '16px' }}>🛠 Usługi i Koszty dodatkowe</h3>
                
                <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px dashed #cbd5e0' }}>
                  <Select
                    options={servicesList.map(srv => ({ 
                      value: `${srv.name}|${srv.price}`, 
                      label: `${srv.name} (${Number(srv.price).toFixed(2)} PLN)` 
                    }))}
                    value={null}
                    onChange={(opt) => {
                      if (!opt) return;
                      const [name, price] = opt.value.split('|');
                      const newService = { name, price: Number(price) };
                      const currentServices = activeClient.calc_services || [];
                      setActiveClient({ ...activeClient, calc_services: [...currentServices, newService] });
                    }}
                    placeholder="Wybierz usługę..."
                    isSearchable
                    styles={selectStyles}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '11px', color: '#718096', display: 'block', marginBottom: '5px', textTransform: 'uppercase', fontWeight: 'bold' }}>Dodatkowe koszty:</label>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <input type="text" style={{ flex: 1, minWidth: 0, padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }} value={srvName} onChange={(e) => setSrvName(e.target.value)} placeholder="np. Płatny parking, klej..." />
                    <input type="number" step="0.01" style={{ width: '70px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }} value={srvPrice} onChange={(e) => setSrvPrice(e.target.value)} placeholder="Kwota" />
                    <button type="button" className="btn-primary" onClick={addServiceToProject} style={{ padding: '6px 10px', fontSize: '13px' }}>Dodaj</button>
                  </div>
                </div>

                {(activeClient.calc_services || []).length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="materials-table" style={{ marginTop: '0', tableLayout: 'fixed', width: '100%' }}>
                      <tbody>
                        {(activeClient.calc_services || []).map((item, index) => (
                          <tr key={index}>
                            <td style={{ padding: '2px 6px', fontSize: '12px', wordWrap: 'break-word', lineHeight: '1.1', width: '65%' }}>{item.name}</td>
                            <td style={{ padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'right', width: '25%' }}>{Number(item.price).toFixed(2)}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'center', width: '10%' }}><button onClick={() => confirmRemoveService(index)} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '14px', padding: '0' }} title="Usuń">❌</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '14px', fontWeight: 'bold', color: '#4a5568' }}>Suma: <span style={{ color: '#e53e3e' }}>{Number(totalSrvCost).toFixed(2)} PLN</span></div>
              </div>
            </div>

            <div style={{ background: expectedProfit >= 0 ? '#f0fff4' : '#fff5f5', border: expectedProfit >= 0 ? '1px solid #c6f6d5' : '1px solid #fed7d7', padding: '15px', borderRadius: '8px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div><span style={{ color: '#4a5568', fontSize: '14px' }}>Całkowity koszt: </span><strong style={{ color: '#e53e3e', fontSize: '16px' }}>{Number(totalCost).toFixed(2)} PLN</strong></div>
              <div style={{ fontSize: '20px' }}><span style={{ color: '#4a5568' }}>Szacowany ZYSK: </span><strong style={{ color: expectedProfit >= 0 ? '#38a169' : '#e53e3e' }}>{Number(expectedProfit).toFixed(2)} PLN</strong></div>
            </div>

            <form onSubmit={handleUpdateClient} style={{ marginTop: '20px' }}>
              <div className="form-group"><label>Dodatkowe notatki i linki</label><textarea rows="2" value={activeClient.notes || ''} onChange={(e) => setActiveClient({...activeClient, notes: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
              <div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setActiveClient(null)}>Zamknij</button><button type="submit" className="btn-primary">Zapisz projekt</button></div>
            </form>
          </div>
        </div>
      )}

      {isMaterialModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMaterialModalOpen(false)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '500px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <h2>Dodaj nowy materiał</h2>
            <form onSubmit={handleAddMaterial}>
              <div className="form-group"><label>Pełna nazwa</label><input type="text" required value={matName} onChange={(e) => setMatName(e.target.value)} /></div>
              <div className="form-group"><label>Kategoria</label><select value={matCategory} onChange={(e) => setMatCategory(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}><option value="Płyta">Płyta</option><option value="Obrzeże">Obrzeże</option><option value="HDF">HDF</option><option value="Laminat">Laminat</option><option value="Akcesoria">Akcesoria (Okucia)</option><option value="Inne">Inne</option></select></div>
              <div className="form-group"><label>Jm</label><select value={matUnit} onChange={(e) => setMatUnit(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}><option value="szt">Sztuki</option><option value="mb">Metry bieżące</option><option value="m2">Metry kwadratowe</option><option value="kpl">Komplet</option></select></div>
              <div className="form-group"><label>Cena brutto (PLN)</label><input type="number" step="0.01" required value={matPrice} onChange={(e) => setMatPrice(e.target.value)} /></div>
              <div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setIsMaterialModalOpen(false)}>Anuluj</button><button type="submit" className="btn-primary">Zapisz</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App