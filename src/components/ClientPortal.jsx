import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabase';

const ClientPortal = () => {
  const { token } = useParams(); // Непредсказуемый portal_token из ссылки
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClient() {
      // Анонимам напрямую таблица clients недоступна (RLS) — единственный
      // путь к данным портала — эта функция, она отдаёт только безопасный
      // набор полей (без бюджета, телефона, адреса, заметок).
      const { data, error } = await supabase.rpc('get_portal_data', { p_token: token });
      if (!error && data && data.length > 0) setClient(data[0]);
      setLoading(false);
    }
    fetchClient();
  }, [token]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>⏳ Ładowanie projektu...</div>;
  if (!client) return <div style={{ padding: '40px', textAlign: 'center', color: 'red', fontFamily: 'sans-serif' }}>❌ Nie znaleziono projektu. Sprawdź poprawność linku.</div>;

  // Считаем итоговую стоимость
  const totalMatCost = (client.calc_materials || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const totalSrvCost = (client.calc_services || []).reduce((sum, item) => sum + (Number(item.price) * (Number(item.quantity) || 1)), 0);
  const totalCost = totalMatCost + totalSrvCost;

  return (
    <div style={{ fontFamily: 'Segoe UI, Roboto, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh', color: '#2d3748' }}>
      {/* Мобильный контейнер */}
      <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff', minHeight: '100vh', boxShadow: '0 0 20px rgba(0,0,0,0.05)' }}>
        
        {/* Шапка портала */}
        <div style={{ backgroundColor: '#1e1e2f', color: '#fff', padding: '30px 20px', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#4da6ff', letterSpacing: '1px' }}>JARVIS STUDIO</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>Panel Klienta</p>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Инфо о проекте */}
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h2 style={{ fontSize: '22px', margin: '0 0 10px 0', color: '#2d3748' }}>Projekt: {client.full_name}</h2>
            {client.deadline && (
              <div style={{ display: 'inline-block', backgroundColor: '#fff5f5', color: '#e53e3e', padding: '5px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', border: '1px solid #fed7d7' }}>
                📅 Planowany termin: {client.deadline}
              </div>
            )}
          </div>

          {/* Статус */}
          <div style={{ backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', padding: '15px', borderRadius: '10px', marginBottom: '25px', textAlign: 'center' }}>
            <span style={{ fontSize: '13px', color: '#2b6cb0', textTransform: 'uppercase', fontWeight: 'bold' }}>Aktualny status realizacji</span>
            <div style={{ fontSize: '20px', color: '#2c5282', fontWeight: 'bold', marginTop: '5px' }}>
              {client.status === 'new' ? 'Nowe zapytanie' : client.status}
            </div>
          </div>

          {/* Смета (Wycena) */}
          <h3 style={{ fontSize: '16px', color: '#4a5568', borderBottom: '2px solid #edf2f7', paddingBottom: '8px', marginBottom: '15px' }}>📊 Podsumowanie wyceny</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {/* Показываем материалы без подробных цен за единицу, чтобы не грузить клиента */}
            {(client.calc_materials || []).map((mat, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '5px' }}>
                <span>{mat.name} <span style={{ color: '#a0aec0', fontSize: '12px' }}>({mat.quantity} {mat.unit})</span></span>
              </div>
            ))}
            {(client.calc_services || []).map((srv, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '5px' }}>
                <span>{srv.name}</span>
              </div>
            ))}
          </div>

          {/* Итог */}
          <div style={{ backgroundColor: '#f0fff4', border: '1px solid #c6f6d5', padding: '15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#2f855a', fontWeight: 'bold', fontSize: '15px' }}>Do zapłaty:</span>
            <span style={{ color: '#276749', fontWeight: 'bold', fontSize: '22px' }}>{totalCost.toFixed(2)} PLN</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ClientPortal;
