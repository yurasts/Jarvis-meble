import { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../useAuth';
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

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Właściciel' },
  { value: 'designer', label: 'Projektant' },
  { value: 'assembler', label: 'Monter' },
  { value: 'installer', label: 'Instalator' },
];

const SCOPE_OPTIONS = [
  { value: 'personal', label: 'Moje' },
  { value: 'firma', label: 'GGS' },
];

const EMPLOYEE_ADMIN_NAMES = new Set(['yury', 'yuryshab']);

const initials = (name) =>
  (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const Settings = ({
  profile, profilesById, scopeView, setScopeView,
  onlineUsers = [], tabLabels = {}, onSignOut,
}) => {
  const { isDark, theme, updateTheme, refreshProfiles } = useAuth();
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('installer');
  const [newScope, setNewScope] = useState('firma');
  const [newColor, setNewColor] = useState(PALETTE[0].hex);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const [employeeSavingId, setEmployeeSavingId] = useState(null);
  const [employeeNotice, setEmployeeNotice] = useState(null);

  const allProfiles = Object.values(profilesById)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pl'));


  const handleAddEmployee = async () => {
    setAddError('');
    setAddSuccess(false);

    if (!newName || !newEmail || !newPassword) {
      setAddError('Wypełnij imię, e-mail i hasło.');
      return;
    }
    if (newPassword.length < 6) {
      setAddError('Hasło musi mieć co najmniej 6 znaków.');
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-employee', {
        body: {
          email: newEmail,
          password: newPassword,
          full_name: newName,
          role: newRole,
          color: newColor,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.id) {
        const { error: scopeError } = await supabase
          .from('profiles')
          .update({ default_scope: newScope })
          .eq('id', data.id);
        if (scopeError) throw scopeError;
      }

      await refreshProfiles();
      setAddSuccess(true);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('installer');
      setNewScope('firma');
      setNewColor(PALETTE[0].hex);
      setTimeout(() => setAddSuccess(false), 4000);
    } catch (err) {
      setAddError(err.message || 'Nie udało się dodać pracownika.');
    } finally {
      setAdding(false);
    }
  };

  const handleEmployeeUpdate = async (employee, field, value) => {
    if (employee.id === profile.id && field === 'role') {
      setEmployeeNotice({ type: 'error', text: 'Nie możesz zmienić własnej roli.' });
      return;
    }

    setEmployeeSavingId(employee.id);
    setEmployeeNotice(null);
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', employee.id);

    if (error) {
      setEmployeeNotice({ type: 'error', text: 'Nie udało się zapisać zmiany.' });
    } else {
      const { error: refreshError } = await refreshProfiles();
      setEmployeeNotice(refreshError
        ? { type: 'error', text: 'Zmiana zapisana, ale lista nie została odświeżona.' }
        : { type: 'success', text: 'Zmiana zapisana.' });
    }
    setEmployeeSavingId(null);
  };

  if (!profile) return null;

  const canManageEmployees = profile.role === 'owner'
    && EMPLOYEE_ADMIN_NAMES.has((profile.full_name || '').trim().toLowerCase());

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
            className={[s.themeOption, theme === 'light' ? s.active : ''].join(' ')}
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
            <div className={[s.themeLabel, theme === 'light' ? s.active : ''].join(' ')}>
              {theme === 'light' ? '✓ ' : ''}Jasny
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

          {/* Forest */}
          <div
            className={[s.themeOption, theme === 'forest' ? s.active : ''].join(' ')}
            onClick={() => updateTheme('forest')}
          >
            <div className={s.previewForest}>
              <div className={[s.previewBar, s.previewBarForest].join(' ')}>
                <div className={s.previewDot} />
                <div className={[s.previewLine, s.previewLineForest].join(' ')} />
              </div>
              <div className={[s.previewCard, s.previewCardForest].join(' ')}>
                <div className={[s.previewCardTitle, s.previewCardTitleForest].join(' ')} />
                <div className={[s.previewCardBody,  s.previewCardBodyForest].join(' ')} />
              </div>
            </div>
            <div className={[s.themeLabel, theme === 'forest' ? s.active : ''].join(' ')}>
              {theme === 'forest' ? '✓ ' : ''}Forest
            </div>
          </div>
        </div>
      </div>

      {/* ДОБАВИТЬ СОТРУДНИКА — только владелец */}
      {canManageEmployees && (
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Zarządzanie pracownikami</h3>
          <p className={s.sectionDesc}>Zmieniaj role, kolor identyfikacyjny i domyślną grupę projektów pracowników.</p>

          {employeeNotice && (
            <div className={employeeNotice.type === 'error' ? s.formError : s.employeeSuccess}>
              {employeeNotice.text}
            </div>
          )}

          <div className={s.employeeList}>
            {allProfiles.map((employee) => {
              const isSelf = employee.id === profile.id;
              const isSavingEmployee = employeeSavingId === employee.id;
              return (
                <div key={employee.id} className={s.employeeRow}>
                  <div className={s.employeeIdentity}>
                    <div className={s.employeeAvatar} style={{ background: employee.color || '#718096' }}>
                      {initials(employee.full_name)}
                    </div>
                    <div className={s.employeeText}>
                      <strong>{employee.full_name || 'Bez nazwy'}</strong>
                      <span>{isSelf ? 'Twoje konto' : 'Pracownik'}</span>
                    </div>
                  </div>

                  <label className={s.employeeField}>
                    <span>Rola</span>
                    <select
                      className={s.employeeSelect}
                      value={employee.role || 'installer'}
                      disabled={isSelf || isSavingEmployee}
                      onChange={(event) => handleEmployeeUpdate(employee, 'role', event.target.value)}
                      aria-label={`Rola: ${employee.full_name}`}
                      title={isSelf ? 'Własnej roli nie można zmienić tutaj' : undefined}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={s.employeeField}>
                    <span>Grupa domyślna</span>
                    <select
                      className={s.employeeSelect}
                      value={employee.default_scope === 'personal' ? 'personal' : 'firma'}
                      disabled={isSavingEmployee}
                      onChange={(event) => handleEmployeeUpdate(employee, 'default_scope', event.target.value)}
                      aria-label={`Grupa projektów: ${employee.full_name}`}
                    >
                      {SCOPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={s.employeeField}>
                    <span>Kolor identyfikacyjny</span>
                    <select
                      className={s.employeeSelect}
                      value={employee.color || '#718096'}
                      disabled={isSavingEmployee}
                      onChange={(event) => handleEmployeeUpdate(employee, 'color', event.target.value)}
                      aria-label={`Kolor identyfikacyjny: ${employee.full_name}`}
                    >
                      {PALETTE.map(({ hex, label }) => (
                        <option key={hex} value={hex}>{label}</option>
                      ))}
                    </select>
                  </label>
                  {isSavingEmployee && (
                    <div className={s.employeeState} aria-live="polite">Zapisywanie…</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {canManageEmployees && (
        <div className={s.section}>
          <h3 className={s.sectionTitle}>➕ Dodaj pracownika</h3>
          <p className={s.sectionDesc}>Utwórz nowe konto logowania dla członka zespołu.</p>

          <div className={s.addEmployeeForm}>
            <input
              className={s.formInput}
              placeholder="Imię i nazwisko"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <input
              className={s.formInput}
              type="email"
              placeholder="E-mail"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <input
              className={s.formInput}
              type="password"
              placeholder="Hasło (min. 6 znaków)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />

            <select
              className={s.formInput}
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              aria-label="Rola nowego pracownika"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <select
              className={s.formInput}
              value={newScope}
              onChange={e => setNewScope(e.target.value)}
              aria-label="Domyślna grupa projektów nowego pracownika"
            >
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>Grupa: {option.label}</option>
              ))}
            </select>

            <div className={s.palette}>
              {PALETTE.map(({ hex, label }) => (
                <button
                  key={hex}
                  type="button"
                  className={[s.colorBtn, newColor === hex ? s.selected : ''].join(' ')}
                  style={{
                    background: hex,
                    boxShadow: newColor === hex
                      ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${hex}`
                      : '0 2px 4px rgba(0,0,0,0.15)',
                  }}
                  onClick={() => setNewColor(hex)}
                  title={label}
                />
              ))}
            </div>

            {addError && <div className={s.formError}>{addError}</div>}
            {addSuccess && <div className={s.savedBadge}>✓ Pracownik dodany. Odśwież stronę, aby zobaczyć go w legendzie.</div>}

            <button className={s.submitBtn} onClick={handleAddEmployee} disabled={adding}>
              {adding ? 'Dodawanie...' : '+ Dodaj pracownika'}
            </button>
          </div>
        </div>
      )}

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
                  {p.role} • {p.theme === 'dark' ? '🌙 Ciemny' : p.theme === 'forest' ? '🌲 Forest' : '☀️ Jasny'}
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

      {/* Служебный блок убран из боковой панели и собран в одном месте. */}
      <div className={s.section}>
        <h3 className={s.sectionTitle}>Konto i obecność</h3>

        <div className={s.accountCard}>
          <div className={s.accountAvatar} style={{ background: profile.color || '#718096' }}>
            {initials(profile.full_name)}
          </div>
          <div className={s.accountText}>
            <div className={s.accountName}>{profile.full_name}</div>
            <div className={s.accountRole}>{profile.role}</div>
          </div>
          <button type="button" className={s.settingsLogoutBtn} onClick={onSignOut}>Wyloguj</button>
        </div>

        <div className={s.onlineSettingsBlock}>
          <div className={s.onlineSettingsTitle}>Online ({onlineUsers.length})</div>
          {onlineUsers.length === 0 ? (
            <div className={s.sectionDesc}>Brak użytkowników online.</div>
          ) : onlineUsers.map((user) => (
            <div key={user.userId} className={s.onlineSettingsRow}>
              <span className={s.onlineDot} />
              <div className={s.onlineSettingsAvatar} style={{ background: user.color || '#718096' }}>
                {initials(user.fullName)}
              </div>
              <div className={s.onlineSettingsText}>
                <strong>{user.userId === profile.id ? 'Ja' : user.fullName}</strong>
                <span>{tabLabels[user.activeTab] || user.activeTab}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Выбор рабочей группы намеренно расположен последним: это настройка, а не ежедневная навигация. */}
      <div className={`${s.section} ${s.scopeSection}`}>
        <h3 className={s.sectionTitle}>Grupa projektów</h3>
        <p className={s.sectionDesc}>
          Wybierz grupę widoczną w bieżącej sesji. Po następnym logowaniu aplikacja użyje grupy
          domyślnej przypisanej do Twojego konta przez właściciela.
        </p>
        <div className={s.scopeToggle} role="tablist" aria-label="Grupa projektów">
          <button
            type="button"
            role="tab"
            aria-selected={scopeView === 'personal'}
            className={`${s.scopeBtn} ${scopeView === 'personal' ? s.scopeBtnActive : ''}`}
            onClick={() => setScopeView?.('personal')}
          >
            Moje
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scopeView === 'firma'}
            className={`${s.scopeBtn} ${scopeView === 'firma' ? s.scopeBtnActive : ''}`}
            onClick={() => setScopeView?.('firma')}
          >
            GGS
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
