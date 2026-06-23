import React from 'react';
import s from './ProductionTab.module.css';

const STANDARD_STEPS = [
  { id: 'ciecie',      label: '🪚 Cięcie' },
  { id: 'oklejanie',   label: '📼 Oklejanie' },
  { id: 'nawiercanie', label: '🕳️ Nawiercanie' },
  { id: 'skladanie',   label: '🔧 Składanie' },
  { id: 'pakowanie',   label: '📦 Pakowanie' },
];

export default function ProductionTab({ clients, onToggleStep }) {
  const prodClients = clients.filter(c => c.status === 'production');

  return (
    <>
      <h1 className={s.title}>Panel Produkcyjny (Hala)</h1>

      {prodClients.length === 0 ? (
        <div className={s.empty}>
          Brak projektów na produkcji. Przeciągnij projekt do kolumny "W produkcji" na tablicy.
        </div>
      ) : (
        <div className={s.grid}>
          {prodClients.map(client => {
            const currentSteps = client.production_steps || {};
            const isAllDone    = STANDARD_STEPS.every(step => currentSteps[step.id]);

            return (
              <div key={client.id} className={[s.card, isAllDone ? s.allDone : ''].join(' ')}>
                <h3 className={s.cardName}>{client.full_name}</h3>
                <p className={s.cardDeadline}>Termin: {client.deadline || 'Nie ustalono'}</p>

                <div className={s.steps}>
                  {STANDARD_STEPS.map(step => {
                    const isDone = currentSteps[step.id];
                    return (
                      <button
                        key={step.id}
                        className={[s.stepBtn, isDone ? s.done : ''].join(' ')}
                        onClick={() => onToggleStep(client, step.id, !isDone)}
                      >
                        <span>{step.label}</span>
                        <span className={s.stepIcon}>{isDone ? '✅' : '⬜'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
