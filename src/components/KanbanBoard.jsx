import React, { useState } from 'react';

export default function KanbanBoard({ 
  clients, 
  setActiveClient, 
  handleDragStart, 
  handleDragOver, 
  handleDrop,
  profilesById = {},
  onUpdateClient,
}) {
  const [editing, setEditing] = useState(null); // { clientId, field }
  const [draft, setDraft] = useState('');

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

  const startEdit = (e, clientId, field, currentValue) => {
    e.stopPropagation();
    setEditing({ clientId, field });
    setDraft(currentValue || '');
  };

  const commitEdit = (clientId, field) => {
    if (onUpdateClient) onUpdateClient(clientId, { [field]: draft });
    setEditing(null);
  };

  const isEditing = (clientId, field) => editing?.clientId === clientId && editing?.field === field;

  const inputStyle = {
    width: '100%', padding: '2px 5px', border: '1px solid #4da6ff',
    borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box',
    fontFamily: 'inherit', outline: 'none',
  };

  // Обёртка для редактируемого текстового поля
  const EditableField = ({ clientId, field, value, display, style = {}, stopCardClick = true }) => {
    if (isEditing(clientId, field)) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commitEdit(clientId, field)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit(clientId, field);
            if (e.key === 'Escape') setEditing(null);
          }}
          onClick={e => e.stopPropagation()}
          style={inputStyle}
        />
      );
    }
    return (
      <span
        onClick={e => startEdit(e, clientId, field, value)}
        title="Kliknij aby edytować"
        style={{ cursor: 'text', borderBottom: '1px dashed #cbd5e0', display: 'inline-block', minWidth: '40px', ...style }}
      >
        {display || value || <span style={{ color: '#a0aec0', fontStyle: 'italic' }}>—</span>}
      </span>
    );
  };

  return (
    <>
      <div className="header-actions">
        <h1>Projekty</h1>
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
                const editor = client.updated_by ? profilesById[client.updated_by] : null;

                return (
                  <div
                    key={client.id}
                    className="client-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, client.id)}
                    onClick={() => { if (!editing) setActiveClient(client); }}
                  >
                    {/* Имя клиента */}
                    <h4 style={{ margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      👤 <EditableField clientId={client.id} field="full_name" value={client.full_name} style={{ fontWeight: 'bold', fontSize: '14px', color: '#2d3748' }} />
                    </h4>

                    {/* Телефон */}
                    <p style={{ margin: '3px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      📞 <EditableField clientId={client.id} field="phone" value={client.phone} style={{ color: '#4a5568' }} />
                    </p>

                    {/* Адрес */}
                    <p style={{ margin: '3px 0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      📍{' '}
                      {isEditing(client.id, 'address') ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => commitEdit(client.id, 'address')}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(client.id, 'address');
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          style={inputStyle}
                        />
                      ) : (
                        <span
                          onClick={e => startEdit(e, client.id, 'address', client.address)}
                          title="Kliknij aby edytować"
                          style={{ cursor: 'text', borderBottom: '1px dashed #cbd5e0' }}
                        >
                          {client.address
                            ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#3182ce', textDecoration: 'none', fontWeight: 'bold' }}>{client.address}</a>
                            : <span style={{ color: '#a0aec0', fontStyle: 'italic' }}>Brak adresu</span>
                          }
                        </span>
                      )}
                    </p>

                    {/* Дедлайн */}
                    <p style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      📅{' '}
                      {isEditing(client.id, 'deadline') ? (
                        <input
                          autoFocus
                          type="date"
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => commitEdit(client.id, 'deadline')}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(client.id, 'deadline');
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ ...inputStyle, width: 'auto' }}
                        />
                      ) : (
                        <span
                          onClick={e => startEdit(e, client.id, 'deadline', client.deadline || '')}
                          title="Kliknij aby edytować"
                          style={{ cursor: 'text', color: dColor, fontWeight: 'bold', fontSize: '12px', background: `${dColor}15`, padding: '2px 6px', borderRadius: '4px', borderBottom: '1px dashed ' + dColor }}
                        >
                          {client.deadline ? client.deadline : 'Nie ustalono'}
                          {isOverdue && client.status !== 'done' ? ' ⚠️' : ''}
                        </span>
                      )}
                    </p>

                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />

                    <p style={{ color: '#4a5568', margin: '2px 0' }}>💰 Budżet: <strong>{Number(client.budget).toFixed(2)} PLN</strong></p>
                    <p style={{ color: '#e53e3e', margin: '2px 0' }}>🛒 Koszty: <strong>{tCost.toFixed(2)} PLN</strong></p>
                    <p style={{ color: '#38a169', fontSize: '13px', margin: '4px 0' }}>📈 Zysk: <strong>{zysk.toFixed(2)} PLN</strong></p>

                    {editor && (
                      <p style={{ color: '#a0aec0', fontSize: '11px', marginTop: '6px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                        ✎ {editor.full_name} • {new Date(client.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    {/* Кнопка открыть проект */}
                    <button
                      onClick={e => { e.stopPropagation(); setActiveClient(client); }}
                      style={{ marginTop: '8px', width: '100%', background: '#ebf8ff', color: '#2b6cb0', border: '1px solid #bee3f8', borderRadius: '5px', padding: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      Otwórz projekt →
                    </button>
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
