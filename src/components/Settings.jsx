import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import s from './Settings.module.css';

const PALETTE = [
  { hex: '#e53e3e', label: 'Czerwony'  },
  { hex: '#dd6b20', label: 'Pomarańcz' },
  { hex: '#d69e2e', label: 'Złoty'     },
  { hex: '#38a169', label: 'Zielony'   },
  { hex: '#3182ce', label: 'Niebieski' },
  { hex: '#805ad5', label: 'Fioletowy' },
  { hex: '#d53f8c', label: 'Różowy'    },
  { hex: '#00b5d8', label: 'Turkusowy' },
  { hex: '#ed8936', label: 'Brązowy'   },
  { hex: '#718096', label: 'Szary'     },
];

const initials = (name) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const Settings = ({ profile, profilesById, onColorUpdate }) => {
  const { isDark, updateTheme } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const allProfiles = Object.values(profilesById);

  const handleColorSelect = async (hex) => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ color: hex }).eq('id', profile.id);
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
    <div className={s.page}>
      <h2 className={s.pageTitle}>⚙️ Ustawienia</h2>

      {/* ТЕМА */}
      <div className={s.section}>
        <h3 className={s.sectionTitle}>🌓 Motyw interfejsu</h3>
        <p className={s.sectionDesc}>Wybierz jasny lub ciemny motyw dla swojego konta.</p>

        <div className={s.themeRow}>
          {/* Светлая тема */}
          <div
            className={[s.themeOption, !isDark ? s.active : ''].join(' ')}
            onClick={() => updateTheme('light')}
          >
            <div className={s.previewLight}>
              <div className={[s.previewBar, s.previewBarLight].join(' ')}>
                <div className={s.previewDot} />
                <div className={[s.previewLine, s.previewLineLight].join(' ')} />
              </div>
              <div className={[s.previewCard, s.previewCardLight].join(' ')}>
                <div className={[s.previewCardTitle, s.previewCardTitleLight].join(' ')} />
                <div className={[s.previewCardBody,  s.previewCardBodyLight].join(' ')} />
              </div>
            </div>
            <div className={[s.themeLabel, !isDark ? s.active : ''].join(' ')}>
              {!isDark ? '✓ ' : ''}Jasny
            </div>
          </div>

          {/* Тёмная тема */}
          <div
            className={[s.themeOption, isDark ? s.active : ''].join(' ')}
            onClick={() => updateTheme('dark')}
          >
            <div className={s.previewDark}>
              <div className={[s.previewBar, s.previewBarDark].join(' ')}>
                <div className={s.previewDot} />
                <div className={[s.previewLine, s.previewLineDark].join(' ')} />
              </div>
              <div className={[s.previewCard, s.previewCardDark].join(' ')}>
                <div className={[s.previewCardTitle, s.previewCardTitleDark].join(' ')} />
                <div className={[s.previewCardBody,  s.previewCardBodyDark].join(' ')} />
              </div>
            </div>
            <div className={[s.themeLabel, isDark ? s.active : ''].join(' ')}>
              {isDark ? '✓ ' : ''}Ciemny
            </div>
          </div>
        </div>
      </div>

      {/* ЦВЕТ */}
      <div className={s.section}>
        <h3 className={s.sectionTitle}>🎨 Mój kolor identyfikacyjny</h3>
        <p className={s.sectionDesc}>Widoczny przy wszystkich Twoich zadaniach i zmianach.</p>

        <div className={s.profilePreview}>
          <div className={s.profileAvatar} style={{ background: currentColor }} />
          <div>
            <div className={s.profileName}>{profile.full_name}</div>
            <div className={s.profileMeta}>{profile.role} • {currentColor}</div>
          </div>
          {saved && <div className={s.savedBadge}>✓ Zapisano</div>}
        </div>

        <div className={s.palette}>
          {PALETTE.map(({ hex, label }) => (
            <button
              key={hex}
              className={[s.colorBtn, currentColor === hex ? s.selected : ''].join(' ')}
              style={{
                background: hex,
                boxShadow: currentColor === hex
                  ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${hex}`
                  : '0 2px 4px rgba(0,0,0,0.15)',
              }}
              onClick={() => handleColorSelect(hex)}
              disabled={saving}
              title={label}
            />
          ))}
        </div>
      </div>

      {/* ЛЕГЕНДА */}
      <div className={s.section}>
        <h3 className={s.sectionTitle}>👥 Legenda — kolory pracowników</h3>
        <div className={s.legendList}>
          {allProfiles.map(p => (
            <div key={p.id} className={s.legendItem}>
              <div
                className={s.legendAvatar}
                style={{
                  background: p.color || '#718096',
                  boxShadow: `0 0 0 3px ${(p.color || '#718096')}44, 0 2px 8px ${(p.color || '#718096')}66`,
                }}
              >
                {initials(p.full_name)}
              </div>
              <div>
                <div className={s.legendName}>
                  {p.full_name}
                  {p.id === profile.id && <span className={s.legendMe}>(ja)</span>}
                </div>
                <div className={s.legendRole}>
                  {p.role} • {p.theme === 'dark' ? '🌙 Ciemny' : '☀️ Jasny'}
                </div>
              </div>
              <div
                className={s.legendSwatch}
                style={{
                  background: p.color || '#718096',
                  boxShadow: `0 2px 6px ${(p.color || '#718096')}88`,
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ЛЕГЕНДА СТАТУСОВ */}
      <div className={s.section}>
        <h3 className={s.sectionTitle}>🚦 Legenda statusów projektów</h3>
        <p className={s.sectionDesc}>Kolor ramki karty projektu na Dashboard i Kanban.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { color: '#e53e3e', status: 'new',        label: 'Nowy / Nieokreślony',              desc: 'Zapytanie, wycena, brak decyzji' },
            { color: '#dd6b20', status: 'design',     label: 'Umowa podpisana / Projektowanie',  desc: 'Start projektu, zakup materiałów' },
            { color: '#d69e2e', status: 'production', label: 'Produkcja / Składanie',            desc: 'Elementy w produkcji lub na hali' },
            { color: '#38a169', status: 'done',       label: 'Montaż / Gotowe',                  desc: 'Montaż u klienta lub zakończony' },
          ].map(({ color, status, label, desc }) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-base)', borderRadius: '8px', borderLeft: `4px solid ${color}` }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '13px' }}>{label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg-kanban-col)', padding: '2px 6px', borderRadius: '4px' }}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;
