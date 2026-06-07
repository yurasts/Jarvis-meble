import React from 'react';

export default function Dashboard({ clients }) {
  // 1. ЛОГИКА ДАШБОРДА (перенесена из App.jsx)
  const activeProjects = clients.filter(c => c.status !== 'done');
  const doneProjects = clients.filter(c => c.status === 'done');
  
  const totalPortfolio = activeProjects.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
  
  const expectedTotalProfit = activeProjects.reduce((sum, c) => {
    const mCost = (c.calc_materials || []).reduce((mSum, item) => mSum + (Number(item.price) * Number(item.quantity)), 0);
    const sCost = (c.calc_services || []).reduce((sSum, item) => sSum + Number(item.price), 0);
    return sum + ((Number(c.budget) || 0) - mCost - sCost);
  }, 0);

  const getClientsByStatus = (status) => clients.filter(c => c.status === status);

  // 2. ВЕРСТКА ДАШБОРДА (JSX)
  return (
    <>
      <div className="header-actions">
        <h1>Podsumowanie (Dashboard)</h1>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', borderLeft: '5px solid #4299e1' }}>
          <div style={{ color: '#718096', fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>Aktywne projekty</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748' }}>{activeProjects.length}</div>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', borderLeft: '5px solid #ecc94b' }}>
          <div style={{ color: '#718096', fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>Portfel zamówień</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748' }}>{totalPortfolio.toFixed(0)} <span style={{fontSize:'16px'}}>PLN</span></div>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', borderLeft: '5px solid #48bb78' }}>
          <div style={{ color: '#718096', fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>Szacowany zysk</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#38a169' }}>{expectedTotalProfit.toFixed(0)} <span style={{fontSize:'16px'}}>PLN</span></div>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', borderLeft: '5px solid #a0aec0' }}>
          <div style={{ color: '#718096', fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>Zrealizowane</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748' }}>{doneProjects.length}</div>
        </div>
      </div>

      <h3 style={{ marginTop: '30px', color: '#4a5568' }}>Lejek sprzedaży i produkcji</h3>
      <div style={{ display: 'flex', gap: '15px', background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        {['new', 'design', 'production', 'done'].map((status, index) => {
          const titles = ['Nowe', 'Projektowanie / 3D', 'W produkcji', 'Montaż / Gotowe'];
          const count = getClientsByStatus(status).length;
          const colors = ['#ebf8ff', '#faf089', '#c6f6d5', '#edf2f7'];
          const textColors = ['#2b6cb0', '#975a16', '#22543d', '#4a5568'];
          return (
            <div key={status} style={{ flex: 1, background: colors[index], color: textColors[index], padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>{titles[index]}</div>
              <div style={{ fontSize: '24px', fontWeight: '900' }}>{count}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}