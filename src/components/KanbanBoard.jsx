import React from 'react';
import s from './KanbanBoard.module.css';

const STATUS_BORDER = {
  new:        '#e53e3e',
  design:     '#dd6b20',
  production: '#d69e2e',
  done:       '#38a169',
};

const STATUSES = ['new', 'design', 'production', 'done'];
const TITLES   = ['Nowe', 'Projektowanie / 3D', 'W produkcji', 'Montaż / Gotowe'];

const getDeadlineColor = (dateString, status) => {
  if (!dateString)        return '#a0aec0';
  if (status === 'done')  return '#38a169';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(dateString) - today) / 86400000);
  if (diff < 0)  return '#e53e3e';
  if (diff <= 3) return '#dd6b20';
  return '#38a169';
};

const calcCosts = (client) => {
  const mCost = (client.calc_materials || []).reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const sCost = (client.calc_services  || []).reduce((s, i) => s + Number(i.price) * Number(i.quantity || 1), 0);
  return mCost + sCost;
};

export default function KanbanBoard({
  clients,
  setActiveClient,
  handleDragStart,
  handleDragOver,
  handleDrop,
  profilesById = {},
}) {
  const getByStatus = (status) => clients.filter(c => c.status === status);

  return (
    <>
      <h1 className={s.pageTitle}>Projekty</h1>

      <div className="kanban-board">
        {STATUSES.map((status, index) => (
          <div
            key={status}
            className="kanban-column"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <h3>{TITLES[index]} ({getByStatus(status).length})</h3>

            {getByStatus(status).map(client => {
              const tCost    = calcCosts(client);
              const budget   = Number(client.budget) || 0;
              const zysk     = budget - tCost;
              const dColor   = getDeadlineColor(client.deadline, client.status);
              const isOverdue = client.deadline &&
                new Date(client.deadline).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
              const editor   = client.updated_by ? profilesById[client.updated_by] : null;

              return (
                <div
                  key={client.id}
                  className="client-card"
                  style={{ borderLeft: `4px solid ${STATUS_BORDER[client.status] || STATUS_BORDER.new}` }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, client.id)}
                  onClick={() => setActiveClient(client)}
                >
                  <h4 className={s.cardName}>👤 {client.client_name || client.full_name}</h4>
                  {client.project_name && (
                    <p className={s.cardProject}>🪚 {client.project_name}</p>
                  )}
                  <p className={s.cardPhone}>📞 {client.phone}</p>

                  {client.address && (
                    <p className={s.cardAddress}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                        target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className={s.addressLink}
                      >
                        📍 {client.address}
                      </a>
                    </p>
                  )}

                  <div
                    className={s.cardDeadline}
                    style={{ color: dColor, background: `${dColor}18` }}
                  >
                    📅 {client.deadline || 'Nie ustalono'}
                    {isOverdue && client.status !== 'done' && ' (Opóźnienie!)'}
                  </div>

                  <hr className={s.divider} />

                  <p className={s.cardBudget}>
                    💰 Budżet: <strong>{budget.toFixed(2)} PLN</strong>
                  </p>
                  <p className={s.cardKoszty}>
                    🛒 Koszty: <strong>{tCost.toFixed(2)} PLN</strong>
                  </p>
                  <p className={s.cardZysk}>
                    📈 Zysk: <strong>{zysk.toFixed(2)} PLN</strong>
                  </p>

                  {editor && (
                    <p className={s.cardEditor}>
                      ✎ {editor.full_name} • {new Date(client.updated_at).toLocaleString('pl-PL', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
