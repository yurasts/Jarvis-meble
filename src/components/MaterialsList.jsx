import React from 'react';

const MaterialsList = ({ materials, servicesList, setIsMaterialModalOpen }) => {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Katalog: Materiały i Usługi</h2>
        <button className="btn-primary" onClick={() => setIsMaterialModalOpen(true)}>+ Nowy materiał</button>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* ЛЕВАЯ ЧАСТЬ - МАТЕРИАЛЫ */}
        <div style={{ flex: '2 1 600px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#2d3748', fontSize: '16px' }}>📦 Baza materiałów</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#edf2f7', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Kategoria</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Nazwa materiału</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Jm</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0' }}>Dostawca</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((mat, index) => (
                  <tr key={mat.id} style={{ background: index % 2 === 0 ? '#ffffff' : '#f1f5f9', lineHeight: '1.2' }}>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>{mat.category}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold' }}>{Number(mat.price).toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>{mat.name}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>{mat.unit}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#718096' }}>{mat.supplier || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ - УСЛУГИ */}
        <div style={{ flex: '1 1 350px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#2d3748', fontSize: '16px' }}>🛠 Stałe usługi</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#edf2f7', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0', width: '30%' }}>Cena, PLN</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #cbd5e0', width: '70%' }}>Nazwa usługi</th>
                </tr>
              </thead>
              <tbody>
                {(servicesList || []).map((srv, index) => (
                  <tr key={srv.id || index} style={{ background: index % 2 === 0 ? '#ffffff' : '#f1f5f9', lineHeight: '1.2' }}>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', color: '#2b6cb0' }}>{Number(srv.price).toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0' }}>{srv.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MaterialsList;