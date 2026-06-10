import React from 'react';

export default function KanbanBoard({ 
  clients, 
  setIsModalOpen, 
  setActiveClient, 
  handleDragStart, 
  handleDragOver, 
  handleDrop 
}) {
  const getClientsByStatus = (status) => clients.filter(c => c.status === status);

  const getDeadlineColor = (dateString, status) => {
    if (!dateString) return '#a0aec0';
    if (status === 'done') return '#38a169';
    const today = new Date();
    today.setHours(0,0,0,0);
    const deadlineDate = new Date(dateString);
    const diffDays = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return '#e53e3e';
    if (diffDays <= 3) return '#dd6b20';
    return '#38a169';
  };

  return (
    <>
      <div className="header-actions">
        <h1>Projekty</h1>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>+ Nowy projekt</button>
      </div>
      <div className="kanban-board">
        {['new', 'design', 'production', 'done'].map((status, index) => {
          const titles = ['Nowe', 'Projektowanie / 3D', 'W produkcji', 'Montaż / Gotowe'];
          return (
            <div key={status} className="kanban-column" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, status)}>
              <h3>{titles[index]} ({getClientsByStatus(status).length})</h3>
              {getClientsByStatus(status).map(client => {
                const mCost = (client.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
                const sCost = (client.calc_services || []).reduce((sum, item) => sum + Number(item.price), 0);
                const tCost = mCost + sCost;
                const zysk = (Number(client.budget) || 0) - tCost;
                const dColor = getDeadlineColor(client.deadline, client.status);
                const isOverdue = client.deadline && new Date(client.deadline).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);

                return (
                  <div key={client.id} className="client-card" draggable onDragStart={(e) => handleDragStart(e, client.id)} onClick={() => setActiveClient(client)}>
                    <h4>👤 {client.full_name}</h4>
                    <p style={{ margin: '2px 0' }}>📞 {client.phone}</p>
                    {client.address && (
                      <p style={{ margin: '4px 0' }}>
                        <a href={`https://www.google.com/maps/search/?api=1&query=$$${encodeURIComponent(client.address)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#3182ce', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold' }}>
                          📍 {client.address}
                        </a>
                      </p>
                    )}
                    <p style={{ color: dColor, fontWeight: 'bold', fontSize: '12px', marginTop: '4px', background: `${dColor}15`, display: 'inline-block', padding: '2px 6px', borderRadius: '4px' }}>
                      📅 Termin: {client.deadline ? client.deadline : 'Nie ustalono'} {isOverdue && client.status !== 'done' ? ' (Opóźnienie!)' : ''}
                    </p>
                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '5px 0' }}/>
                    <p style={{ color: '#4a5568' }}>💰 Budżet: <strong>{Number(client.budget).toFixed(2)} PLN</strong></p>
                    <p style={{ color: '#e53e3e' }}>🛒 Koszty: <strong>{tCost.toFixed(2)} PLN</strong></p>
                    <p style={{ color: '#38a169', fontSize: '13px', marginTop: '4px' }}>📈 Zysk: <strong>{zysk.toFixed(2)} PLN</strong></p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}