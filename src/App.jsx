import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Dashboard from './components/Dashboard'
import KanbanBoard from './components/KanbanBoard'
import MaterialsList from './components/MaterialsList'
import ProductionTab from './components/ProductionTab'
import ProjectModal from './components/ProjectModal'

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

  useEffect(() => {
    async function fetchData() {
      const { data: clientsData } = await supabase.from('clients').select('*')
      if (clientsData) setClients(clientsData)
      
      const { data: materialsData } = await supabase.from('materials').select('*')
      if (materialsData) setMaterials(materialsData)

      const { data: servicesData } = await supabase.from('services').select('*')
      if (servicesData) setServicesList(servicesData)
    }
    fetchData()
  }, [])

  // Универсальная функция для обновления любых полей клиента (используется Дашбордом для задач)
  async function updateClientFields(clientId, updatedFields) {
    setClients(clients.map(c => c.id === clientId ? { ...c, ...updatedFields } : c))
    await supabase.from('clients').update(updatedFields).eq('id', clientId)
  }

  async function handleAddClient(e) {
    e.preventDefault()
    const { data, error } = await supabase.from('clients').insert([{ 
      full_name: name, phone, budget: Number(budget) || 0, deadline: deadline || null, address, status: 'new' 
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
        calc_services: activeClient.calc_services || [],
        calc_expenses: activeClient.calc_expenses || [] // <- ДОБАВИЛИ ЭТУ СТРОЧКУ
      })
      .eq('id', activeClient.id).select()
    if (!error && data) {
      setClients(clients.map(c => c.id === activeClient.id ? data[0] : c))
      //setActiveClient(null)
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
    await supabase.from('clients').update({ production_steps: updatedSteps }).eq('id', client.id)
  }

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
        {activeTab === 'dashboard' && (
          <Dashboard 
            clients={clients} 
            updateClient={updateClientFields} 
            openProjectModal={setActiveClient} 
            setIsModalOpen={setIsModalOpen} 
          />
        )}
        {activeTab === 'board' && (
          <KanbanBoard 
            clients={clients} 
            setActiveClient={setActiveClient} 
            handleDragStart={handleDragStart} 
            handleDragOver={handleDragOver} 
            handleDrop={handleDrop} 
          />
        )}
        {activeTab === 'production' && <ProductionTab clients={clients} onToggleStep={handleToggleProductionStep} />}
        {activeTab === 'materials' && <MaterialsList materials={materials} servicesList={servicesList} setIsMaterialModalOpen={setIsMaterialModalOpen} />}
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
        <ProjectModal 
          client={activeClient} 
          setClient={setActiveClient} 
          materials={materials} 
          servicesList={servicesList} 
          onClose={() => setActiveClient(null)} 
          onSave={handleUpdateClient} 
        />
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