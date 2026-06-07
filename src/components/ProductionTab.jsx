import React from 'react';

// Наш стандартный конвейер
const STANDARD_STEPS = [
  { id: 'ciecie', label: '🪚 Cięcie' },
  { id: 'oklejanie', label: '📼 Oklejanie' },
  { id: 'nawiercanie', label: '🕳️ Nawiercanie' },
  { id: 'skladanie', label: '🔧 Składanie' },
  { id: 'pakowanie', label: '📦 Pakowanie' }
];

export default function ProductionTab({ clients, onToggleStep }) {
  // Показываем только проекты со статусом "W produkcji"
  const prodClients = clients.filter(c => c.status === 'production');

  return (
    <>
      <div className="header-actions">
        <h1>Panel Produkcyjny (Hala)</h1>
      </div>
      
      {prodClients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a0aec0', fontSize: '18px' }}>
          Brak projektów na produkcji. Przeciągnij projekt do kolumny "W produkcji" na tablicy.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {prodClients.map(client => {
            const currentSteps = client.production_steps || {};
            // Проверяем, завершены ли все этапы
            const isAllDone = STANDARD_STEPS.every(s => currentSteps[s.id]);

            return (
              <div key={client.id} style={{ 
                background: 'white', padding: '20px', borderRadius: '12px', 
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
                border: isAllDone ? '2px solid #48bb78' : '1px solid #e2e8f0' 
              }}>
                <h3 style={{ margin: '0 0 5px 0', color: '#2d3748', fontSize: '20px' }}>
                  {client.full_name}
                </h3>
                <p style={{ margin: '0 0 20px 0', color: '#718096', fontSize: '14px', fontWeight: 'bold' }}>
                  Termin: {client.deadline || 'Nie ustalono'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {STANDARD_STEPS.map(step => {
                    const isDone = currentSteps[step.id];
                    return (
                      <button
                        key={step.id}
                        onClick={() => onToggleStep(client, step.id, !isDone)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: isDone ? '#c6f6d5' : '#edf2f7',
                          color: isDone ? '#22543d' : '#4a5568',
                          fontSize: '16px', fontWeight: 'bold', transition: 'background 0.2s'
                        }}
                      >
                        <span>{step.label}</span>
                        <span style={{ fontSize: '22px' }}>{isDone ? '✅' : '⬜'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  );
}