
import React, { useState, useRef } from 'react';
import { supabase } from '../supabase';

export default function InvoiceScanner({ materials, onPricesUpdated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [image, setImage] = useState(null);       // { base64, type, preview }
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);   // [{material_id, material_name, old_price, new_price}]
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  const reset = () => { setImage(null); setResults(null); setError(null); };
  const close  = () => { setIsOpen(false); reset(); };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    reset();
    const reader = new FileReader();
    reader.onload = () => setImage({ base64: reader.result.split(',')[1], type: file.type, preview: reader.result });
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
        console.log('handleScan called', image) // ← добавьте эту строку
    if (!image) return;
    setScanning(true);
    setError(null);
    setResults(null);
    try {
        console.log('Calling edge function...')  // ← добавьте
      const { data, error: fnErr } = await supabase.functions.invoke('scan-invoice', {
        body: {
          imageBase64: image.base64,
          imageType: image.type,
          materials: materials.map(m => ({ id: m.id, name: m.name, symbol: m.symbol || null, price: m.price }))
        }
      });
        console.log('Result:', data, 'Error:', fnErr)  // ← добавьте
      if (fnErr) throw new Error(fnErr.message);
      setResults(data?.result || []);
    } catch (err) {
      setError(err.message);
    }
    setScanning(false);
  };

  const handleConfirmUpdate = async () => {
    if (!results?.length) return;
    setUpdating(true);
    const today = new Date().toISOString().split('T')[0];
    for (const item of results) {
      const mat = materials.find(m => m.id === item.material_id);
      if (!mat) continue;
      const history = [...(mat.price_history || []), { price: Number(mat.price), date: today }];
      await supabase.from('materials')
        .update({ price: Number(item.new_price), price_history: history })
        .eq('id', item.material_id);
    }
    await onPricesUpdated();
    setUpdating(false);
    close();
  };

  return (
    <>
      {/* Кнопка-триггер */}
      <button
        onClick={() => setIsOpen(true)}
        style={{ background: '#6b46c1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
      >
        📸 Skanuj fakturę
      </button>

      {/* Модал */}
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={close}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '600px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

            {/* Шапка */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#2d3748' }}>📸 Skanowanie faktury</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>
                  Wgraj zdjęcie faktury — Jarvis rozpozna ceny i zaproponuje aktualizację
                </p>
              </div>
              <button onClick={close} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#a0aec0' }}>✖</button>
            </div>

            {/* Загрузка фото */}
            {!image ? (
              <div
                onClick={() => fileInputRef.current.click()}
                style={{ border: '2px dashed #cbd5e0', borderRadius: '10px', padding: '40px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', transition: 'border-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6b46c1'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e0'}
              >
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
                <div style={{ color: '#4a5568', fontWeight: 'bold' }}>Kliknij aby wybrać zdjęcie faktury</div>
                <div style={{ color: '#a0aec0', fontSize: '12px', marginTop: '4px' }}>JPG, PNG — zdjęcie z telefonu działa świetnie</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                {/* Превью */}
                <img src={image.preview} alt="Faktura" style={{ width: '160px', height: '160px', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#38a169', fontWeight: 'bold', marginBottom: '10px' }}>✓ Zdjęcie wgrane</div>
                  <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: '1px solid #cbd5e0', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#718096', marginBottom: '12px' }}>
                    Zmień zdjęcie
                  </button>

                  {/* Результаты */}
                  {results === null && !scanning && !error && (
                    <button onClick={handleScan} style={{ display: 'block', width: '100%', background: '#6b46c1', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                      🔍 Analizuj fakturę
                    </button>
                  )}

                  {scanning && (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#6b46c1' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                      <div style={{ fontWeight: 'bold' }}>Jarvis analizuje fakturę...</div>
                      <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '4px' }}>To może potrwać 5-10 sekund</div>
                    </div>
                  )}

                  {error && (
                    <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#c53030' }}>
                      ❌ {error}
                      <button onClick={handleScan} style={{ display: 'block', marginTop: '8px', background: '#e53e3e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        Spróbuj ponownie
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageSelect} />

            {/* Результаты сравнения */}
            {results !== null && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontWeight: 'bold', color: '#2d3748', marginBottom: '12px', fontSize: '15px' }}>
                  {results.length === 0
                    ? '✅ Nie znaleziono zmian cen — wszystko aktualne'
                    : `🔄 Znaleziono ${results.length} zmian${results.length === 1 ? 'ę' : results.length < 5 ? 'y' : ''} cen`
                  }
                </div>

                {results.length > 0 && (
                  <>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: '#4a5568' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Materiał</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Stara cena</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Nowa cena</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Zmiana</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((item, i) => {
                            const diff = Number(item.new_price) - Number(item.old_price);
                            const pct = ((diff / Number(item.old_price)) * 100).toFixed(1);
                            const up = diff > 0;
                            return (
                              <tr key={i} style={{ borderBottom: i < results.length - 1 ? '1px solid #edf2f7' : 'none' }}>
                                <td style={{ padding: '8px 12px', color: '#2d3748' }}>{item.material_name}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#718096' }}>{Number(item.old_price).toFixed(2)} zł</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: up ? '#e53e3e' : '#38a169' }}>{Number(item.new_price).toFixed(2)} zł</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: up ? '#e53e3e' : '#38a169', fontWeight: 'bold' }}>
                                  {up ? '↑' : '↓'} {Math.abs(Number(diff.toFixed(2)))} zł ({pct}%)
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setResults(null); }} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Anuluj
                      </button>
                      <button onClick={handleConfirmUpdate} disabled={updating} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {updating ? '⏳ Aktualizuję...' : `✓ Zaktualizuj ${results.length} cen${results.length === 1 ? 'ę' : results.length < 5 ? 'y' : ''}`}
                      </button>
                    </div>
                  </>
                )}

                {results.length === 0 && (
                  <button onClick={close} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    OK, zamknij
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
