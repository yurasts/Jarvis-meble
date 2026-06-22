import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';

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
  const { isDark, updateTheme } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const allProfiles = Object.values(profilesById);

  const handleColorSelect = async (hex) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ color: hex }).eq('id', profile.id);
    if (!error) { onColorUpdate(hex); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  };

  const handleThemeSelect = async (theme) => {
    await updateTheme(theme);
  };

  if (!profile) return null;

  const bg = isDark ? '#1e293b' : '#fff';
  const cardBg = isDark ? '#0f172a' : '#f8fafc';
  const text = isDark ? '#e2e8f0' : '#2d3748';
  const textLight = isDark ? '#94a3b8' : '#718096';
  const border = isDark ? '#334155' : '#e2e8f0';

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '10px' }}>
      <h2 style={{ color: text, marginBottom: '30px' }}>⚙️ Ustawienia</h2>

      {/* ТЕМА */}
      <div style={{ background: bg, borderRadius: '10px', border: `1px solid ${border}`, padding: '25px', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: text }}>🌓 Motyw interfejsu</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: textLight }}>Wybierz jasny lub ciemny motyw dla swojego konta.</p>

        <div style={{ display: 'flex', gap: '16px' }}>
          {/* Светлая тема */}
          <div
            onClick={() => handleThemeSelect('light')}
            style={{ flex: 1, cursor: 'pointer', borderRadius: '10px', border: `2px solid ${!isDark ? '#4da6ff' : border}`, overflow: 'hidden', transition: 'border-color 0.2s', boxShadow: !isDark ? '0 0 0 3px rgba(77,166,255,0.2)' : 'none' }}
          >
            {/* Превью светлой темы */}
            <div style={{ background: '#f4f7f6', padding: '10px' }}>
              <div style={{ background: '#1e1e2f', borderRadius: '4px', padding: '6px 8px', marginBottom: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4da6ff' }} />
                <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#3b3b54' }} />
              </div>
              <div style={{ background: '#fff', borderRadius: '4px', padding: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ width: '60%', height: '6px', borderRadius: '2px', background: '#2b6cb0', marginBottom: '4px' }} />
                <div style={{ width: '80%', height: '4px', borderRadius: '2px', background: '#e2e8f0' }} />
              </div>
            </div>
            <div style={{ padding: '8px', textAlign: 'center', background: bg, borderTop: `1px solid ${border}` }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: !isDark ? '#4da6ff' : textLight }}>
                {!isDark ? '✓ ' : ''}Jasny
              </span>
            </div>
          </div>

          {/* Тёмная тема */}
          <div
            onClick={() => handleThemeSelect('dark')}
            style={{ flex: 1, cursor: 'pointer', borderRadius: '10px', border: `2px solid ${isDark ? '#4da6ff' : border}`, overflow: 'hidden', transition: 'border-color 0.2s', boxShadow: isDark ? '0 0 0 3px rgba(77,166,255,0.2)' : 'none' }}
          >
            {/* Превью тёмной темы */}
            <div style={{ background: '#0f172a', padding: '10px' }}>
              <div style={{ background: '#0d1117', borderRadius: '4px', padding: '6px 8px', marginBottom: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4da6ff' }} />
                <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#1e293b' }} />
              </div>
              <div style={{ background: '#1e293b', borderRadius: '4px', padding: '6px' }}>
                <div style={{ width: '60%', height: '6px', borderRadius: '2px', background: '#4da6ff', marginBottom: '4px' }} />
                <div style={{ width: '80%', height: '4px', borderRadius: '2px', background: '#334155' }} />
              </div>
            </div>
            <div style={{ padding: '8px', textAlign: 'center', background: bg, borderTop: `1px solid ${border}` }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: isDark ? '#4da6ff' : textLight }}>
                {isDark ? '✓ ' : ''}Ciemny
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ЦВЕТ */}
      <div style={{ background: bg, borderRadius: '10px', border: `1px solid ${border}`, padding: '25px', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: text }}>🎨 Mój kolor identyfikacyjny</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: textLight }}>Widoczny przy wszystkich Twoich zadaniach i zmianach.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', padding: '12px', background: cardBg, borderRadius: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: profile.color || '#718096', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
          <div>
            <div style={{ fontWeight: 'bold', color: text }}>{profile.full_name}</div>
            <div style={{ fontSize: '12px', color: textLight }}>{profile.role} • {profile.color || '#718096'}</div>
          </div>
          {saved && <div style={{ marginLeft: 'auto', color: '#38a169', fontWeight: 'bold', fontSize: '13px' }}>✓ Zapisano</div>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {PALETTE.map(({ hex, label }) => (
            <button key={hex} onClick={() => handleColorSelect(hex)} disabled={saving} title={label}
              style={{ width: '44px', height: '44px', borderRadius: '50%', background: hex, border: (profile.color || '#718096') === hex ? '3px solid #2d3748' : '3px solid transparent', cursor: 'pointer', transition: 'transform 0.15s', boxShadow: (profile.color || '#718096') === hex ? `0 0 0 2px ${isDark ? '#0f172a' : 'white'}, 0 0 0 4px ${hex}` : '0 2px 4px rgba(0,0,0,0.15)', transform: (profile.color || '#718096') === hex ? 'scale(1.15)' : 'scale(1)' }}
            />
          ))}
        </div>
      </div>

      {/* ЛЕГЕНДА */}
      <div style={{ background: bg, borderRadius: '10px', border: `1px solid ${border}`, padding: '25px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: text }}>👥 Legenda — kolory pracowników</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {allProfiles.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: cardBg, borderRadius: '8px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: p.color || '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px', flexShrink: 0 }}>
                {(p.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: text, fontSize: '14px' }}>
                  {p.full_name}
                  {p.id === profile.id && <span style={{ fontSize: '11px', color: textLight, marginLeft: '6px' }}>(ja)</span>}
                </div>
                <div style={{ fontSize: '12px', color: textLight }}>{p.role} • {p.theme === 'dark' ? '🌙 Ciemny' : '☀️ Jasny'}</div>
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
