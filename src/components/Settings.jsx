import React, { useState } from 'react';
import { supabase } from '../supabase';

// Палитра фирменных цветов — достаточно разных чтобы 5 человек не путались
const PALETTE = [
  { hex: '#c05621', label: 'Brązowy' },
  { hex: '#2b6cb0', label: 'Niebieski' },
  { hex: '#276749', label: 'Zielony' },
  { hex: '#6b46c1', label: 'Fioletowy' },
  { hex: '#c53030', label: 'Czerwony' },
  { hex: '#b7791f', label: 'Złoty' },
  { hex: '#2c7a7b', label: 'Turkusowy' },
  { hex: '#97266d', label: 'Różowy' },
  { hex: '#1a202c', label: 'Czarny' },
  { hex: '#718096', label: 'Szary' },
];

const Settings = ({ profile, profilesById, onColorUpdate }) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const allProfiles = Object.values(profilesById);

  const handleColorSelect = async (hex) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ color: hex })
      .eq('id', profile.id);
    if (!error) {
      onColorUpdate(hex);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (!profile) return null;

  const currentColor = profile.color || '#718096';

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '10px' }}>
      <h2 style={{ color: '#2d3748', marginBottom: '30px' }}>⚙️ Ustawienia</h2>

      {/* БЛОК: МОЙ ЦВЕТ */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '25px', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: '#2d3748' }}>🎨 Mój kolor identyfikacyjny</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#718096' }}>
          Ten kolor będzie widoczny przy wszystkich Twoich zadaniach i zmianach w projekcie.
        </p>

        {/* Текущий цвет — превью */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: currentColor, flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
          <div>
            <div style={{ fontWeight: 'bold', color: '#2d3748' }}>{profile.full_name}</div>
            <div style={{ fontSize: '12px', color: '#718096' }}>{profile.role} • {currentColor}</div>
          </div>
          {saved && <div style={{ marginLeft: 'auto', color: '#38a169', fontWeight: 'bold', fontSize: '13px' }}>✓ Zapisano</div>}
        </div>

        {/* Палитра */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {PALETTE.map(({ hex, label }) => (
            <button
              key={hex}
              onClick={() => handleColorSelect(hex)}
              disabled={saving}
              title={label}
              style={{
                width: '44px', height: '44px', borderRadius: '50%', background: hex,
                border: currentColor === hex ? '3px solid #2d3748' : '3px solid transparent',
                cursor: 'pointer', transition: 'transform 0.15s, border 0.15s',
                boxShadow: currentColor === hex ? '0 0 0 2px white, 0 0 0 4px ' + hex : '0 2px 4px rgba(0,0,0,0.15)',
                transform: currentColor === hex ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>

      {/* ЛЕГЕНДА: ВСЕ СОТРУДНИКИ */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '25px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#2d3748' }}>👥 Legenda — kolory pracowników</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {allProfiles.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
              {/* Цветной кружок с инициалами */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: p.color || '#718096',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 'bold', fontSize: '14px', flexShrink: 0
              }}>
                {(p.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#2d3748', fontSize: '14px' }}>
                  {p.full_name}
                  {p.id === profile.id && <span style={{ fontSize: '11px', color: '#718096', marginLeft: '6px' }}>(ja)</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>{p.role}</div>
              </div>
              <div style={{ marginLeft: 'auto', width: '20px', height: '20px', borderRadius: '4px', background: p.color || '#718096' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;
