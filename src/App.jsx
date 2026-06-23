import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import KanbanBoard from './components/KanbanBoard'
import MaterialsList from './components/MaterialsList'
import ProductionTab from './components/ProductionTab'
import ProjectModal from './components/ProjectModal'
import Settings from './components/Settings'

function App() {
  const { session, profile: authProfile, profilesById, isDark, loadingSession, awaitingAccess, signOut } = useAuth()
  const [localProfile, setLocalProfile] = useState(null)

  const [activeTab, setActiveTab] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [materials, setMaterials] = useState([])
  const [servicesList, setServicesList] = useState([])
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeClient, setActiveClient] = useState(null)
  // ✅ FIX: храним оригинал клиента для определения isDirty в ProjectModal
  const [originalClient, setOriginalClient] = useState(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [budget, setBudget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [address, setAddress] = useState('')

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [duplicateFound, setDuplicateFound] = useState(null)
  const [matName, setMatName] = useState('')
  const [matCategory, setMatCategory] = useState('Płyta')
  const [matUnit, setMatUnit] = useState('szt')
  const [matPrice, setMatPrice] = useState('')

  useEffect(() => {
    if (!session) return
    async function fetchData() {
      const { data: clientsData } = await supabase.from('clients').select('*')
      if (clientsData) setClients(clientsData)
      const { data: materialsData } = await supabase.from('materials').select('*')
      if (materialsData) setMaterials(materialsData)
      const { data: servicesData } = await supabase.from('services').select('*')
      if (servicesData) setServicesList(servicesData)
    }
    fetchData()
  }, [session])

  // ✅ FIX: при открытии проекта запоминаем оригинал (для isDirty)
  const openProjectModal = (client) => {
    setActiveClient(client)
    setOriginalClient(JSON.parse(JSON.stringify(client))) // глубокая копия
  }

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
    if (e && e.preventDefault) e.preventDefault()
    // ✅ FIX: добавлены budget и budget_coefficient — они теперь сохраняются в БД
    const { data, error } = await supabase.from('clients')
      .update({ 
        notes: activeClient.notes, 
        deadline: activeClient.deadline, 
        address: activeClient.address, 
        calc_materials: activeClient.calc_materials || [], 
        calc_services: activeClient.calc_services || [],
        calc_expenses: activeClient.calc_expenses || [],
        budget: activeClient.budget || 0,
        budget_coefficient: activeClient.budget_coefficient || 2.0,
      })
      .eq('id', activeClient.id).select()
    if (!error && data) {
      setClients(clients.map(c => c.id === activeClient.id ? data[0] : c))
      // обновляем оригинал после сохранения — isDirty снова false
      setOriginalClient(JSON.parse(JSON.stringify(data[0])))
    }
  }

  async function handleAddMaterial(e) {
    e.preventDefault()
    const { data: existing } = await supabase
      .from('materials')
      .select('*')
      .ilike('name', matName.trim())
      .maybeSingle()

    if (existing) {
      if (Math.abs(Number(existing.price) - Number(matPrice)) < 0.001) {
        setDuplicateFound({ existing, newPrice: Number(matPrice), samePrice: true })
        return
      }
      setDuplicateFound({ existing, newPrice: Number(matPrice), samePrice: false })
      return
    }

    const { data, error } = await supabase
      .from('materials')
      .insert([{ name: matName, category: matCategory, unit: matUnit, price: Number(matPrice), price_history: [] }])
      .select()
    if (!error && data) {
      setMaterials([...materials, data[0]])
      setMatName(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    }
  }

  async function handleConfirmPriceUpdate() {
    const { existing, newPrice } = duplicateFound
    const today = new Date().toISOString().split('T')[0]
    const history = [...(existing.price_history || []), { price: existing.price, date: today }]
    const { data, error } = await supabase
      .from('materials')
      .update({ price: newPrice, price_history: history })
      .eq('id', existing.id)
      .select()
    if (!error && data) {
      setMaterials(materials.map(m => m.id === existing.id ? data[0] : m))
      setDuplicateFound(null)
      setMatName(''); setMatCategory('Płyta'); setMatUnit('szt'); setMatPrice('')
      setIsMaterialModalOpen(false)
    }
  }

  async function reloadMaterials() {
    const { data } = await supabase.from('materials').select('*')
    if (data) setMaterials(data)
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

  // --- ЭКРАНЫ АВТОРИЗАЦИИ ---

  if (loadingSession) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096' }}>⏳ Sprawdzanie sesji...</div>
  }

  if (!session) {
    return <Login />
  }

  if (awaitingAccess) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
        <div>
          <h2 style={{ color: '#2d3748' }}>Konto zalogowane, ale bez przypisanej roli</h2>
          <p style={{ color: '#718096' }}>Poproś właściciela (owner) o dodanie Twojego konta do tabeli profiles.</p>
          <button className="btn-secondary" onClick={signOut} style={{ marginTop: '15px' }}>Wyloguj</button>
        </div>
      </div>
    )
  }

  const profile = localProfile ?? authProfile
  const canCreate = profile?.role === 'owner' || profile?.role === 'assembler'

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>Jarvis</h2>
        <div className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</div>
        <div className={`menu-item ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>📋 Projekty</div>
        <div className={`menu-item ${activeTab === 'production' ? 'active' : ''}`} onClick={() => setActiveTab('production')}>🛠 Produkcja</div>
        <div className={`menu-item ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>📦 Materiały</div>
        <div className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Ustawienia</div>

        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: `1px solid ${isDark ? '#1e293b' : '#3b3b54'}`, fontSize: '13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: profile?.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>
              {(profile?.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <span style={{ color: '#a0aec0' }}>{profile?.full_name || session.user.email}</span>
          </div>
          <div style={{ color: '#718096', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>{profile?.role}</div>
          <button onClick={signOut} className="btn-secondary" style={{ width: '100%', padding: '6px', fontSize: '12px' }}>Wyloguj</button>
        </div>
      </div>

      <div className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
            clients={clients} 
            updateClient={updateClientFields} 
            openProjectModal={openProjectModal}
            setIsModalOpen={setIsModalOpen} 
            profilesById={profilesById}
            canCreate={canCreate}
            currentProfile={profile}
            isDark={isDark}
          />
        )}
        {activeTab === 'board' && (
          <KanbanBoard 
            clients={clients} 
            setActiveClient={openProjectModal}
            handleDragStart={handleDragStart} 
            handleDragOver={handleDragOver} 
            handleDrop={handleDrop} 
            profilesById={profilesById}
            isDark={isDark}
          />
        )}
        {activeTab === 'production' && <ProductionTab clients={clients} onToggleStep={handleToggleProductionStep} />}
        {activeTab === 'materials' && <MaterialsList materials={materials} servicesList={servicesList} setIsMaterialModalOpen={setIsMaterialModalOpen} onPricesUpdated={reloadMaterials} isDark={isDark} />}
        {activeTab === 'settings' && <Settings profile={profile} profilesById={profilesById} onColorUpdate={(hex) => setLocalProfile(p => ({ ...(p ?? profile), color: hex }))} />}
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

      {/* ✅ FIX: добавлены isDark и originalClient */}
      {activeClient && (
        <ProjectModal 
          client={activeClient}
          originalClient={originalClient}
          setClient={setActiveClient} 
          materials={materials} 
          servicesList={servicesList} 
          onClose={() => { setActiveClient(null); setOriginalClient(null) }} 
          onSave={handleUpdateClient}
          currentProfile={profile} 
          profilesById={profilesById}
          isDark={isDark}
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
              {duplicateFound && (
                <div style={{ margin: '10px 0', padding: '12px', borderRadius: '8px', background: duplicateFound.samePrice ? '#fffbeb' : '#fff5f5', border: `1px solid ${duplicateFound.samePrice ? '#f6e05e' : '#feb2b2'}` }}>
                  {duplicateFound.samePrice ? (
                    <div style={{ fontSize: '13px', color: '#744210' }}>
                      ⚠️ Materiał <strong>{duplicateFound.existing.name}</strong> już istnieje z tą samą ceną ({duplicateFound.existing.price} zł).
                      <button onClick={() => setDuplicateFound(null)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>OK</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#742a2a' }}>
                      🔄 Znaleziono istniejący materiał!<br />
                      <strong>{duplicateFound.existing.name}</strong><br />
                      <span style={{ color: '#718096' }}>Stara cena:</span> <strong>{duplicateFound.existing.price} zł</strong> → <span style={{ color: '#718096' }}>Nowa cena:</span> <strong style={{ color: '#e53e3e' }}>{duplicateFound.newPrice} zł</strong>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button onClick={handleConfirmPriceUpdate} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Zaktualizuj cenę</button>
                        <button onClick={() => setDuplicateFound(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Anuluj</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => { setIsMaterialModalOpen(false); setDuplicateFound(null); }}>Anuluj</button><button type="submit" className="btn-primary">Zapisz</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
