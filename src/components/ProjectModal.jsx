import React, { useState, useEffect, useCallback } from 'react';
import FilesTab from './FilesTab';

// Лёгкая заливка фона по статусу проекта
const STATUS_OVERLAY = {
  new:        { light: 'rgba(229,62,62,0.04)',   dark: 'rgba(229,62,62,0.08)'   },
  design:     { light: 'rgba(221,107,32,0.04)',  dark: 'rgba(221,107,32,0.08)'  },
  production: { light: 'rgba(214,158,46,0.04)',  dark: 'rgba(214,158,46,0.08)'  },
  done:       { light: 'rgba(56,161,105,0.04)',  dark: 'rgba(56,161,105,0.08)'  },
};

const STATUS_BORDER_COLOR = {
  new:        '#e53e3e',
  design:     '#dd6b20',
  production: '#d69e2e',
  done:       '#38a169',
};

const ProjectModal = ({ client, originalClient, setClient, materials, servicesList, onClose, onSave, profilesById = {}, currentProfile = null, isDark = false, theme = 'light', onCoverChange, initialTab = 'materials', variant = 'modal' }) => {
  const isMobile = window.innerWidth < 640;
  // variant='embedded' — рабочая область справа на desktop (ADR-002, UX-фаза 2);
  // variant='modal' (по умолчанию) — прежнее поведение без изменений (адаптивный fallback на узком экране).
  // Вся внутренняя логика сметы ниже общая для обоих вариантов — меняется только внешняя обёртка.
  const isEmbedded = variant === 'embedded';

  // ✅ Нейтральный "хром" — через переменные темы (Jasny/Ciemny/Forest)
  const c = (light, dark) => isDark ? dark : light;
  const bg        = 'var(--modal-bg)';
  const bgHeader  = 'var(--bg-kanban-col)';
  const bgMatRow  = theme === 'forest' ? '#4f7057' : c('#ebf8ff', '#0f2236');
  const bgSrvRow  = c('#f0fff4', '#0f2a1a');
  const bgExpRow  = c('#fff5f5', '#2d1515');
  const bgSearch  = 'var(--bg-base)';
  const bgInput   = 'var(--input-bg)';
  const text      = 'var(--text-main)';
  const textLight = 'var(--text-muted)';
  const border    = 'var(--border)';
  const borderMat = c('#bee3f8', '#1a3a5c');
  const borderSrv = c('#c6f6d5', '#1a4a2e');
  const borderExp = c('#fed7d7', '#7b2020');

  const [activeTab, setActiveTab] = useState(initialTab);

  // ✅ При каждом открытии нового проекта или смене initialTab — переключаем вкладку
  useEffect(() => {
    setActiveTab(initialTab);
  }, [client.id, initialTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchService, setSearchService] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [qtyDraft, setQtyDraft] = useState({});

  // ✅ FIX: используем useEffect для синхронизации coefficient с client.budget_coefficient
  // чтобы при повторном открытии того же проекта значение восстанавливалось из БД
  const [coefficient, setCoefficient] = useState(Number(client.budget_coefficient) || 2.0);
  useEffect(() => {
    setCoefficient(Number(client.budget_coefficient) || 2.0);
  }, [client.id]); // перечитываем при смене проекта

  const evalQty = (expr) => {
    if (expr === '' || expr === null || expr === undefined) return null;
    const str = String(expr).replace(',', '.').replace(/[^0-9+\-*/.()\s]/g, '');
    try {
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + str + ')')();
      if (typeof result === 'number' && isFinite(result) && result > 0) return parseFloat(result.toFixed(4));
    } catch {}
    return null;
  };

  const handleQtyFocus = (key, currentValue) => {
    setQtyDraft(prev => ({ ...prev, [key]: String(currentValue ?? '') }));
  };
  const handleQtyChange = (key, value) => {
    setQtyDraft(prev => ({ ...prev, [key]: value }));
  };
  const handleQtyCommit = (field, currentItems, index, key) => {
    const raw = qtyDraft[key];
    if (raw === undefined) return;
    const computed = evalQty(raw);
    if (computed !== null) {
      handleQuantityChange(field, currentItems, index, computed);
      setQtyDraft(prev => ({ ...prev, [key]: String(computed) }));
    } else {
      setQtyDraft(prev => ({ ...prev, [key]: String(currentItems[index].quantity ?? 1) }));
    }
  };

  const calcMaterials = client.calc_materials || [];
  const calcServices  = client.calc_services  || [];
  const calcExpenses  = client.calc_expenses  || [];

  const totalMaterials    = calcMaterials.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const totalServices     = calcServices.reduce((s, i)  => s + Number(i.price) * Number(i.quantity || 1), 0);
  const totalExpenses     = calcExpenses.reduce((s, i)  => s + Number(i.price) * Number(i.quantity || 1), 0);
  const totalProjectCost  = totalMaterials + totalServices + totalExpenses;

  // isDirty: сравниваем только то что реально меняет пользователь.
  // budget и budget_coefficient НЕ сравниваем — они пересчитываются
  // автоматически в useEffect при открытии, что вызывало ложный isDirty.
  const isDirty = originalClient
    ? JSON.stringify({
        calc_materials: client.calc_materials || [],
        calc_services:  client.calc_services  || [],
        calc_expenses:  client.calc_expenses  || [],
        notes:         client.notes         || '',
        deadline:      client.deadline      || '',
        address:       client.address       || '',
        phone:         client.phone         || '',
        client_name:   client.client_name   || '',
        project_name:  client.project_name  || '',
      }) !== JSON.stringify({
        calc_materials: originalClient.calc_materials || [],
        calc_services:  originalClient.calc_services  || [],
        calc_expenses:  originalClient.calc_expenses  || [],
        notes:         originalClient.notes         || '',
        deadline:      originalClient.deadline      || '',
        address:       originalClient.address       || '',
        phone:         originalClient.phone         || '',
        client_name:   originalClient.client_name   || '',
        project_name:  originalClient.project_name  || '',
      })
    : false;

  const handleClose = useCallback(() => { isDirty ? setConfirmClose(true) : onClose(); }, [isDirty, onClose]);
  const handleSaveAndClose = async () => { await onSave(); onClose(); };

  // Escape w widoku embedded: idzie przez ten sam handleClose (z potwierdzeniem
  // niezapisanych zmian) — nigdy nie zamyka bezpośrednio przez onClose().
  useEffect(() => {
    if (!isEmbedded) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEmbedded, handleClose]);

  // Автопересчёт бюджета
  useEffect(() => {
    const coef = parseFloat(coefficient) || 1;
    const newBudget = parseFloat((totalProjectCost * coef).toFixed(2));
    setClient(prev => ({ ...prev, budget: newBudget, budget_coefficient: coef }));
  }, [totalProjectCost, coefficient]);

  const uniqueCategories = [...new Set((materials || []).map(m => m.category).filter(Boolean))];
  const uniqueSuppliers  = [...new Set((materials || []).map(m => m.supplier).filter(Boolean))];

  const filteredMaterials = (materials || []).filter(m => {
    const matchesSearch = (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (m.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = filterCategory ? m.category === filterCategory : true;
    const matchesSup = filterSupplier ? m.supplier === filterSupplier : true;
    return matchesSearch && matchesCat && matchesSup;
  });

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  const updateItems = (field, newItems) => setClient({ ...client, [field]: newItems });
  const authorMeta = () => ({ addedById: currentProfile?.id || null, addedByColor: currentProfile?.color || '#718096' });

  const handleAddItem = (field, currentItems, item) => {
    const existing = currentItems.find(i => i.id === item.id);
    if (existing) {
      updateItems(field, currentItems.map(i => i.id === item.id ? { ...i, quantity: (Number(i.quantity) || 1) + 1 } : i));
    } else {
      updateItems(field, [...currentItems, { ...item, quantity: 1, ...authorMeta() }]);
    }
  };

  const handleRemoveItem = (field, currentItems, indexToRemove) => {
    setConfirmDeleteKey(null);
    updateItems(field, currentItems.filter((_, idx) => idx !== indexToRemove));
  };

  const handleQuantityChange = (field, currentItems, index, newQuantity) => {
    const updated = [...currentItems];
    updated[index].quantity = newQuantity;
    updateItems(field, updated);
  };

  const handlePriceSave = (field, currentItems, index) => {
    const val = parseFloat(priceDraft);
    if (!isNaN(val) && val >= 0) {
      const updated = [...currentItems];
      updated[index] = { ...updated[index], price: val };
      updateItems(field, updated);
    }
    setEditingPrice(null);
  };

  const handleCustomAdd = (field, currentItems) => {
    const name = prompt('Wpisz nazwę:');
    if (!name) return;
    const price = parseFloat(prompt('Wpisz cenę za szt/usługę (zł):') || '0');
    updateItems(field, [...currentItems, { id: Date.now(), name, price, quantity: 1, unit: 'szt', category: 'Inne', supplier: 'Brak', ...authorMeta() }]);
  };

  const rowStripe = (item) => item.addedByColor || '#e2e8f0';

  // Кнопка удаления с подтверждением
  const renderDeleteBtn = (field, currentItems, index) => {
    const key = `${field}-${index}`;
    if (confirmDeleteKey === key) return (
      <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '11px', color: '#e53e3e', fontWeight: 'bold', marginRight: '4px' }}>Usunąć?</span>
        <button onClick={() => handleRemoveItem(field, currentItems, index)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', marginRight: '2px' }}>Tak</button>
        <button onClick={() => setConfirmDeleteKey(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
      </td>
    );
    return (
      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
        <button onClick={() => setConfirmDeleteKey(key)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
          onMouseEnter={e => e.target.style.color = '#e53e3e'} onMouseLeave={e => e.target.style.color = '#cbd5e0'} title="Usuń">✖</button>
      </td>
    );
  };

  // Стиль таба
  const tabBtn = (tab, activeColor, activeBorder, activeBg) => ({
    padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', border: 'none',
    borderBottom: activeTab === tab ? `3px solid ${activeBorder}` : '3px solid transparent',
    background: activeTab === tab ? (isDark ? activeBg.dark : activeBg.light) : 'transparent',
    color: activeTab === tab ? activeColor : textLight,
  });

  const outerStyle = isEmbedded
    ? { position: 'relative', width: '100%', height: '100%' }
    : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: isMobile ? 0 : '30px', paddingBottom: isMobile ? 0 : '30px', overflowY: 'auto' };

  const innerStyle = {
    background: bg,
    backgroundImage: `linear-gradient(${(STATUS_OVERLAY[client.status] || STATUS_OVERLAY.new)[isDark ? 'dark' : 'light']}, ${(STATUS_OVERLAY[client.status] || STATUS_OVERLAY.new)[isDark ? 'dark' : 'light']})`,
    borderRadius: isEmbedded ? '10px' : (isMobile ? 0 : '10px'),
    width: isEmbedded ? '100%' : '95%',
    maxWidth: isEmbedded ? '1400px' : '1100px',
    padding: '15px',
    boxShadow: isEmbedded ? 'none' : '0 10px 25px rgba(0,0,0,0.3)',
    position: 'relative',
    borderTop: `3px solid ${STATUS_BORDER_COLOR[client.status] || STATUS_BORDER_COLOR.new}`,
  };

  return (
    <div style={outerStyle} onClick={isEmbedded ? undefined : handleClose}>
      <div style={innerStyle} onClick={isEmbedded ? undefined : (e => e.stopPropagation())}>

        {isEmbedded && (
          <button
            onClick={handleClose}
            title="Wróć do poprzedniego widoku"
            aria-label="Wróć do poprzedniego widoku"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: textLight, fontSize: '13px', fontWeight: 'bold', padding: '4px 2px',
            }}
          >
            ← Wróć
          </button>
        )}

        {/* Шапка */}
        <div style={{ borderBottom: `2px solid ${border}`, paddingBottom: '10px', marginBottom: '10px', position: 'relative' }}>

          {/* 💾 Zapisz + переключатель Firma/Moje — всегда в правом верхнем углу */}
          <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: '6px', alignItems: 'center', zIndex: 1 }}>
            <div style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}>
              <button
                onClick={() => setClient(prev => ({ ...prev, project_scope: 'firma' }))}
                title="Projekt firmowy"
                style={{
                  padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                  background: (client.project_scope || 'firma') === 'firma' ? '#3182ce' : bg,
                  color: (client.project_scope || 'firma') === 'firma' ? '#fff' : textLight,
                }}
              >
                🏢
              </button>
              <button
                onClick={() => setClient(prev => ({ ...prev, project_scope: 'personal' }))}
                title="Mój projekt"
                style={{
                  padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                  background: client.project_scope === 'personal' ? '#3182ce' : bg,
                  color: client.project_scope === 'personal' ? '#fff' : textLight,
                }}
              >
                👤
              </button>
            </div>
            <button onClick={handleSaveAndClose} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#3182ce', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>💾 Zapisz</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '140px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0 }}>Klient:</span>
              <input
                value={client.client_name || ''}
                onChange={e => setClient(prev => ({ ...prev, client_name: e.target.value }))}
                placeholder="Imię klienta"
                style={{ fontSize: isMobile ? '15px' : '18px', fontWeight: 'bold', color: '#4da6ff', background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', minWidth: '80px', flex: 1 }}
              />
              <button
                onClick={() => setClientInfoOpen(true)}
                title="Informacje o kliencie"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: 0, flexShrink: 0 }}
              >
                ℹ️
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0 }}>Projekt:</span>
              <input
                value={client.project_name || ''}
                onChange={e => setClient(prev => ({ ...prev, project_name: e.target.value }))}
                placeholder="Nazwa projektu (szafa, kuchnia...)"
                style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 'bold', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', minWidth: '100px', flex: 1 }}
              />
            </div>

            {/* ✅ Koszty + коэффициент + Budżet — сразу под названием */}
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
              <span style={{ color: textLight }}>Koszty: <strong style={{ color: '#e53e3e' }}>{totalProjectCost.toFixed(2)} zł</strong></span>
              <span style={{ color: '#a0aec0' }}>×</span>
              <input
                type="number" min="1" max="10" step="0.1"
                value={coefficient}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setCoefficient(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    setClient({ ...client, budget: parseFloat((totalProjectCost * val).toFixed(2)), budget_coefficient: val });
                  }
                }}
                style={{ width: '55px', padding: '2px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', color: '#2b6cb0', textAlign: 'center', background: bgInput }}
              />
              <span style={{ background: bgMatRow, border: `1px solid ${borderMat}`, borderRadius: '6px', padding: '2px 10px', fontWeight: 'bold', color: theme === 'forest' ? '#eafff0' : c('#2b6cb0', '#63b3ed') }}>
                Budżet: {(totalProjectCost * (parseFloat(coefficient) || 1)).toFixed(2)} zł
              </span>
            </div>
          </div>
        </div>

        {/* Модалка редактируемой информации о клиенте */}
        {clientInfoOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setClientInfoOpen(false)}>
            <div style={{ background: bg, color: text, width: '100%', maxWidth: '380px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${border}`, fontSize: '13px', fontWeight: 'bold' }}>
                <span>👤 Informacje o kliencie</span>
                <button onClick={() => setClientInfoOpen(false)} style={{ background: 'none', border: 'none', color: text, fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📍 Adres:</span>
                  <input
                    value={client.address || ''}
                    onChange={e => setClient(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Adres montażu"
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                  {client.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                      target="_blank" rel="noreferrer"
                      title="Otwórz w Mapach Google"
                      style={{ flexShrink: 0, fontSize: '14px' }}
                    >
                      🗺️
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📞 Tel:</span>
                  <input
                    value={client.phone || ''}
                    onChange={e => setClient(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Telefon (opcjonalnie)"
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                  {client.phone && (
                    <a href={`tel:${client.phone}`} title="Zadzwoń" style={{ flexShrink: 0, fontSize: '14px' }}>📲</a>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>📅 Termin:</span>
                  <input
                    type="date"
                    value={client.deadline || ''}
                    onChange={e => setClient(prev => ({ ...prev, deadline: e.target.value }))}
                    style={{ flex: 1, fontSize: '13px', color: text, background: bgInput, border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#a0aec0', flexShrink: 0, width: '60px' }}>💬 Uwagi:</span>
                  <input
                    value={client.notes || ''}
                    onChange={e => setClient(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Dodatkowe informacje..."
                    style={{ flex: 1, fontSize: '13px', color: text, background: 'transparent', border: 'none', borderBottom: `1px dashed ${border}`, outline: 'none', padding: '2px 0' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Табы — тёмная тема */}
        <div style={{ display: 'flex', borderBottom: `2px solid ${border}`, marginBottom: '15px', overflowX: 'auto', whiteSpace: 'nowrap', gap: '2px' }}>
          <button onClick={() => setActiveTab('materials')} style={tabBtn('materials', c('#2b6cb0','#63b3ed'), '#3182ce', { light: '#ebf8ff', dark: '#0f2236' })}>
            📦 Materiały ({totalMaterials.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('services')} style={tabBtn('services', c('#276749','#68d391'), '#38a169', { light: '#f0fff4', dark: '#0f2a1a' })}>
            🛠 Usługi ({totalServices.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('expenses')} style={tabBtn('expenses', c('#c53030','#fc8181'), '#e53e3e', { light: '#fff5f5', dark: '#2d1515' })}>
            💸 Wydatki ({totalExpenses.toFixed(2)} zł)
          </button>
          <button onClick={() => setActiveTab('files')} style={tabBtn('files', c('#553c9a','#b794f4'), '#805ad5', { light: '#faf5ff', dark: '#1a102e' })}>
            📎 Pliki
          </button>
        </div>

        <div style={{ minHeight: '350px' }}>

          {/* МАТЕРИАЛЫ */}
          {activeTab === 'materials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: text }}>✅ Dodane pozycje</h3>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {calcMaterials.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych materiałów</div>}
                    {calcMaterials.map((item, index) => (
                      <div key={index} style={{ background: bgMatRow, borderRadius: '7px', border: `1px solid ${borderMat}`, borderLeft: `4px solid ${rowStripe(item)}`, padding: '8px 10px' }}>
                        <div style={{ fontWeight: 'bold', color: c('#2b6cb0','#63b3ed'), fontSize: '13px', marginBottom: '5px' }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {editingPrice === `mat-${index}` ? (
                            <input autoFocus type="number" step="0.01" value={priceDraft}
                              onChange={e => setPriceDraft(e.target.value)}
                              onBlur={() => handlePriceSave('calc_materials', calcMaterials, index)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_materials', calcMaterials, index); if (e.key === 'Escape') setEditingPrice(null); }}
                              style={{ width: '70px', padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                            />
                          ) : (
                            <span onClick={() => { setEditingPrice(`mat-${index}`); setPriceDraft(String(item.price)); }}
                              style={{ cursor: 'pointer', background: bgInput, border: '1px dashed #a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', color: textLight }}>
                              {Number(item.price).toFixed(2)} zł
                            </span>
                          )}
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>× {item.unit || 'szt'}</span>
                          <input type="text"
                            value={qtyDraft[`mat-${index}`] !== undefined ? qtyDraft[`mat-${index}`] : item.quantity}
                            onFocus={() => handleQtyFocus(`mat-${index}`, item.quantity)}
                            onChange={e => handleQtyChange(`mat-${index}`, e.target.value)}
                            onBlur={() => handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`)}
                            onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`); e.target.blur(); } }}
                            style={{ width: '65px', padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                          />
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>=</span>
                          <strong style={{ color: c('#2b6cb0','#63b3ed'), fontSize: '13px', flex: 1 }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</strong>
                          {renderDeleteBtn('calc_materials', calcMaterials, index)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ background: bgHeader, textAlign: 'left', color: textLight }}>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Nazwa materiału</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Cena j.</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Jm</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}`, width: '60px' }}>Ilość</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}>Suma</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${border}` }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcMaterials.map((item, index) => (
                          <tr key={index} style={{ borderBottom: `1px solid ${border}`, backgroundColor: bgMatRow, borderLeft: `3px solid ${rowStripe(item)}` }}>
                            <td onClick={() => toggleRow(`sel_${index}`)} style={{ padding: '4px 8px', fontWeight: 'bold', cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedRows[`sel_${index}`] ? 'normal' : 'nowrap', color: c('#2b6cb0','#63b3ed') }}>{item.name}</td>
                            <td style={{ padding: '4px 8px' }}>
                              {editingPrice === `mat-${index}` ? (
                                <input autoFocus type="number" step="0.01" value={priceDraft}
                                  onChange={e => setPriceDraft(e.target.value)}
                                  onBlur={() => handlePriceSave('calc_materials', calcMaterials, index)}
                                  onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_materials', calcMaterials, index); if (e.key === 'Escape') setEditingPrice(null); }}
                                  style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                                />
                              ) : (
                                <span onClick={() => { setEditingPrice(`mat-${index}`); setPriceDraft(String(item.price)); }}
                                  style={{ cursor: 'pointer', color: c('#2b6cb0','#63b3ed'), borderBottom: '1px dashed #a0aec0' }} title="Kliknij aby zmienić cenę">
                                  {Number(item.price).toFixed(2)} zł
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 8px', color: textLight }}>{item.unit || 'szt'}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <input type="text"
                                value={qtyDraft[`mat-${index}`] !== undefined ? qtyDraft[`mat-${index}`] : item.quantity}
                                onFocus={() => handleQtyFocus(`mat-${index}`, item.quantity)}
                                onChange={e => handleQtyChange(`mat-${index}`, e.target.value)}
                                onBlur={() => handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`)}
                                onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_materials', calcMaterials, index, `mat-${index}`); e.target.blur(); } }}
                                title="Wpisz liczbę lub wyrażenie: 37+20+16"
                                style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', fontWeight: 'bold', color: c('#2b6cb0','#63b3ed') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                            {renderDeleteBtn('calc_materials', calcMaterials, index)}
                          </tr>
                        ))}
                        {calcMaterials.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych materiałów</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button onClick={() => handleCustomAdd('calc_materials', calcMaterials)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Dodaj pozycję ręcznie</button>
                </div>
              </div>

              {/* Baza materiałów */}
              <div style={{ background: bgSearch, padding: '10px', borderRadius: '6px', border: `1px solid ${border}` }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: text }}>🔍 Baza materiałów</h3>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                  <input type="text" placeholder="Szukaj..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: '6px 8px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', minWidth: '140px', flex: 1, background: bgInput, color: text }} />
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '6px 8px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', minWidth: '110px', background: bgInput, color: text }}>
                    <option value="">Wszystkie kat.</option>
                    {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={{ padding: '6px 8px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', minWidth: '110px', background: bgInput, color: text }}>
                    <option value="">Dostawcy</option>
                    {uniqueSuppliers.map(sup => <option key={sup} value={sup}>{sup}</option>)}
                  </select>
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', borderTop: `1px solid ${border}`, background: bgInput, borderRadius: '4px' }}>
                  <div>
                    {filteredMaterials.slice(0, 50).map(m => {
                      const isSelected = calcMaterials.some(item => item.id === m.id);
                      const isExpanded = expandedMaterialId === m.id;
                      return (
                        <div key={m.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: isSelected ? bgMatRow : bgInput }}>
                          <div
                            onClick={() => setExpandedMaterialId(prev => prev === m.id ? null : m.id)}
                            style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                          >
                            <div style={{
                              flex: 1, fontWeight: 'bold', color: text,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: isExpanded ? 'normal' : 'nowrap',
                            }}>
                              {m.name}
                            </div>
                            <div style={{ width: '64px', flexShrink: 0, textAlign: 'left' }}>
                              <strong style={{ color: c('#2b6cb0','#63b3ed') }}>{Number(m.price).toFixed(2)} zł</strong>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddItem('calc_materials', calcMaterials, m); }}
                              style={{ background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '62px', flexShrink: 0 }}
                            >
                              {isSelected ? '+ Kol.' : '+ Dodaj'}
                            </button>
                          </div>
                          {isExpanded && (
                            <div style={{ padding: '0 8px 6px 8px', fontSize: '11px', color: textLight }}>
                              {m.supplier && <>Dostawca: {m.supplier} · </>}
                              Kategoria: {m.category || '-'}
                              {m.symbol && <> · Symbol: {m.symbol}</>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredMaterials.length === 0 && <div style={{ padding: '10px', textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>Brak wyników</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* УСЛУГИ */}
          {activeTab === 'services' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {calcServices.length === 0 && <div style={{ textAlign: 'center', padding: '15px', color: '#a0aec0', fontSize: '13px' }}>Brak dodanych usług</div>}
                    {calcServices.map((item, index) => (
                      <div key={index} style={{ background: bgSrvRow, borderRadius: '7px', border: `1px solid ${borderSrv}`, borderLeft: `4px solid ${rowStripe(item)}`, padding: '8px 10px' }}>
                        <div style={{ fontWeight: 'bold', color: c('#276749','#68d391'), fontSize: '13px', marginBottom: '5px' }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {editingPrice === `srv-${index}` ? (
                            <input autoFocus type="number" step="0.01" value={priceDraft}
                              onChange={e => setPriceDraft(e.target.value)}
                              onBlur={() => handlePriceSave('calc_services', calcServices, index)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_services', calcServices, index); if (e.key === 'Escape') setEditingPrice(null); }}
                              style={{ width: '70px', padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                            />
                          ) : (
                            <span onClick={() => { setEditingPrice(`srv-${index}`); setPriceDraft(String(item.price)); }}
                              style={{ cursor: 'pointer', background: bgInput, border: '1px dashed #a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '12px', color: textLight }}>
                              {Number(item.price).toFixed(2)} zł
                            </span>
                          )}
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>×</span>
                          <input type="text"
                            value={qtyDraft[`srv-${index}`] !== undefined ? qtyDraft[`srv-${index}`] : (item.quantity || 1)}
                            onFocus={() => handleQtyFocus(`srv-${index}`, item.quantity || 1)}
                            onChange={e => handleQtyChange(`srv-${index}`, e.target.value)}
                            onBlur={() => handleQtyCommit('calc_services', calcServices, index, `srv-${index}`)}
                            onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_services', calcServices, index, `srv-${index}`); e.target.blur(); } }}
                            style={{ width: '65px', padding: '3px 5px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '13px', background: bgInput, color: text }}
                          />
                          <span style={{ color: '#a0aec0', fontSize: '12px' }}>=</span>
                          <strong style={{ color: c('#276749','#68d391'), fontSize: '13px', flex: 1 }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</strong>
                          {renderDeleteBtn('calc_services', calcServices, index)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ background: bgSrvRow, textAlign: 'left', color: c('#276749','#68d391') }}>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Nazwa usługi</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Cena jend. (zł)</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}`, width: '80px' }}>Ilość</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}>Suma</th>
                          <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderSrv}` }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcServices.map((item, index) => (
                          <tr key={index} style={{ borderBottom: `1px solid ${border}`, background: bg, borderLeft: `3px solid ${rowStripe(item)}` }}>
                            <td style={{ padding: '6px 8px', color: text }}>{item.name}</td>
                            <td style={{ padding: '6px 8px' }}>
                              {editingPrice === `srv-${index}` ? (
                                <input autoFocus type="number" step="0.01" value={priceDraft}
                                  onChange={e => setPriceDraft(e.target.value)}
                                  onBlur={() => handlePriceSave('calc_services', calcServices, index)}
                                  onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_services', calcServices, index); if (e.key === 'Escape') setEditingPrice(null); }}
                                  style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                                />
                              ) : (
                                <span onClick={() => { setEditingPrice(`srv-${index}`); setPriceDraft(String(item.price)); }}
                                  style={{ cursor: 'pointer', borderBottom: '1px dashed #a0aec0', color: text }} title="Kliknij aby zmienić cenę">
                                  {Number(item.price).toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="text"
                                value={qtyDraft[`srv-${index}`] !== undefined ? qtyDraft[`srv-${index}`] : (item.quantity || 1)}
                                onFocus={() => handleQtyFocus(`srv-${index}`, item.quantity || 1)}
                                onChange={e => handleQtyChange(`srv-${index}`, e.target.value)}
                                onBlur={() => handleQtyCommit('calc_services', calcServices, index, `srv-${index}`)}
                                onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_services', calcServices, index, `srv-${index}`); e.target.blur(); } }}
                                title="Wpisz liczbę lub wyrażenie: 37+20+16"
                                style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 'bold', color: c('#276749','#68d391') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                            {renderDeleteBtn('calc_services', calcServices, index)}
                          </tr>
                        ))}
                        {calcServices.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodanych usług</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button onClick={() => handleCustomAdd('calc_services', calcServices)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Dodaj usługę ręcznie</button>
                </div>
              </div>

              {/* Baza usług */}
              <div style={{ background: bgSrvRow, padding: '10px', borderRadius: '6px', border: `1px solid ${borderSrv}` }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: c('#276749','#68d391') }}>🔍 Baza usług</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" placeholder="Szukaj usługi..." value={searchService} onChange={e => setSearchService(e.target.value)}
                    style={{ padding: '6px 8px', border: `1px solid ${borderSrv}`, borderRadius: '4px', fontSize: '12px', flex: 1, background: bgInput, color: text }} />
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', borderTop: `1px solid ${borderSrv}`, background: bgInput, borderRadius: '4px' }}>
                  {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.toLowerCase())).map(s => {
                    const isSelected = calcServices.some(item => item.id === s.id);
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: '10px', padding: '6px 10px', borderBottom: `1px solid ${border}`, fontSize: '12px', alignItems: 'center', backgroundColor: isSelected ? bgSrvRow : bgInput }}>
                        <div onClick={() => toggleRow(`avail_srv_${s.id}`)} style={{ flex: 1, fontWeight: 'bold', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedRows[`avail_srv_${s.id}`] ? 'normal' : 'nowrap', color: text }}>{s.name}</div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', width: '140px', flexShrink: 0 }}>
                          <strong style={{ color: c('#276749','#68d391') }}>{Number(s.price).toFixed(2)} zł</strong>
                          <button onClick={() => handleAddItem('calc_services', calcServices, s)} style={{ background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', width: '65px' }}>
                            {isSelected ? '+ Kol.' : '+ Dodaj'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(servicesList || []).filter(s => (s.name || '').toLowerCase().includes(searchService.toLowerCase())).length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#a0aec0', fontSize: '12px' }}>Brak wyników</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* РАСХОДЫ */}
          {activeTab === 'expenses' && (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <button onClick={() => handleCustomAdd('calc_expenses', calcExpenses)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>+ Dodaj wydatek (Paliwo, Zakupy itp.)</button>
              </div>
              <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: bgExpRow, textAlign: 'left', color: c('#c53030','#fc8181') }}>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Opis wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Kwota bazowa (zł)</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}`, width: '80px' }}>Mnożnik / Ilość</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}>Suma Wydatku</th>
                      <th style={{ padding: '6px 8px', borderBottom: `2px solid ${borderExp}` }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcExpenses.map((item, index) => (
                      <tr key={index} style={{ borderBottom: `1px solid ${border}`, background: bg, borderLeft: `3px solid ${rowStripe(item)}` }}>
                        <td style={{ padding: '6px 8px', color: text }}>{item.name}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {editingPrice === `exp-${index}` ? (
                            <input autoFocus type="number" step="0.01" value={priceDraft}
                              onChange={e => setPriceDraft(e.target.value)}
                              onBlur={() => handlePriceSave('calc_expenses', calcExpenses, index)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceSave('calc_expenses', calcExpenses, index); if (e.key === 'Escape') setEditingPrice(null); }}
                              style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                            />
                          ) : (
                            <span onClick={() => { setEditingPrice(`exp-${index}`); setPriceDraft(String(item.price)); }}
                              style={{ cursor: 'pointer', borderBottom: '1px dashed #a0aec0', color: text }} title="Kliknij aby zmienić cenę">
                              {Number(item.price).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="text"
                            value={qtyDraft[`exp-${index}`] !== undefined ? qtyDraft[`exp-${index}`] : (item.quantity || 1)}
                            onFocus={() => handleQtyFocus(`exp-${index}`, item.quantity || 1)}
                            onChange={e => handleQtyChange(`exp-${index}`, e.target.value)}
                            onBlur={() => handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`)}
                            onKeyDown={e => { if (e.key === 'Enter') { handleQtyCommit('calc_expenses', calcExpenses, index, `exp-${index}`); e.target.blur(); } }}
                            title="Wpisz liczbę lub wyrażenie: 37+20+16"
                            style={{ width: '70px', padding: '2px 4px', border: `1px solid ${border}`, borderRadius: '4px', fontSize: '12px', background: bgInput, color: text }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 'bold', color: c('#c53030','#fc8181') }}>{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł</td>
                        {renderDeleteBtn('calc_expenses', calcExpenses, index)}
                      </tr>
                    ))}
                    {calcExpenses.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>Brak dodatkowych wydatków</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ФАЙЛЫ */}
          {activeTab === 'files' && (
            <FilesTab clientId={client.id} currentProfile={currentProfile} coverUrl={client.cover_url} onCoverChange={(url) => { setClient(prev => ({ ...prev, cover_url: url })); onCoverChange?.(client.id, url); }} />
          )}

        </div>

        {/* Подтверждение закрытия */}
        {confirmClose && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: bg, borderRadius: '10px', padding: '28px 32px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', textAlign: 'center', maxWidth: '340px', border: `1px solid ${border}` }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px 0', color: text, fontSize: '16px' }}>Masz niezapisane zmiany</h3>
              <p style={{ margin: '0 0 20px 0', color: textLight, fontSize: '13px' }}>Czy na pewno chcesz zamknąć bez zapisania?</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button onClick={onClose} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Zamknij bez zapisania</button>
                <button onClick={() => { onSave(); setConfirmClose(false); onClose(); }} style={{ background: '#38a169', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Zapisz i zamknij</button>
                <button onClick={() => setConfirmClose(false)} style={{ background: bgHeader, color: text, border: `1px solid ${border}`, padding: '9px 14px', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Wróć</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectModal;
