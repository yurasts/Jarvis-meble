import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import s from './GlobalSearch.module.css';

const MAX_PER_GROUP = 6;

// Подсвечивает совпавшую подстроку в тексте
const Highlight = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={s.mark}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

export default function GlobalSearch({ clients = [], materials = [], onNavigate }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);

  // Ctrl+K / Cmd+K — фокус на поиск из любого места приложения
  useEffect(() => {
    const handleGlobalKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Закрытие по клику снаружи
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!clickedWrap && !clickedDropdown) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const result = [];

    // Клиенты — уникальные имена
    const clientNames = [...new Set(clients.map(c => c.client_name || c.full_name).filter(Boolean))];
    const clientMatches = clientNames
      .filter(name => name.toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP)
      .map(name => ({
        kind: 'client', icon: '👤', title: name, meta: 'Klient',
        action: () => onNavigate({ type: 'client', clientName: name }),
      }));
    if (clientMatches.length) result.push({ label: 'Klienci', items: clientMatches });

    // Проекты
    const projectMatches = clients
      .filter(c => (c.project_name || '').toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP)
      .map(c => ({
        kind: 'project', icon: '📁', title: c.project_name, meta: c.client_name || c.full_name,
        action: () => onNavigate({ type: 'project', client: c }),
      }));
    if (projectMatches.length) result.push({ label: 'Projekty', items: projectMatches });

    // Задачи
    const taskMatches = [];
    clients.forEach(c => {
      (c.tasks || []).forEach(t => {
        if ((t.text || '').toLowerCase().includes(q) && taskMatches.length < MAX_PER_GROUP) {
          taskMatches.push({
            kind: 'task', icon: '☐', title: t.text,
            meta: `${c.project_name || c.full_name} · ${c.client_name || c.full_name}`,
            action: () => onNavigate({ type: 'task', client: c, task: t }),
          });
        }
      });
    });
    if (taskMatches.length) result.push({ label: 'Zadania', items: taskMatches });

    // Материалы
    const materialMatches = materials
      .filter(m => (m.name || '').toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP)
      .map(m => ({
        kind: 'material', icon: '📦', title: m.name, meta: m.category || 'Materiał',
        action: () => onNavigate({ type: 'material' }),
      }));
    if (materialMatches.length) result.push({ label: 'Materiały', items: materialMatches });

    return result;
  }, [query, clients, materials]);

  // Плоский список для навигации стрелками
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const handleSelect = (item) => {
    item.action();
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); return; }
    if (!flatItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(flatItems[activeIndex]);
    }
  };

  let runningIndex = -1;

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.inputBox}>
        <span className={s.searchIcon}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search clients, projects, tasks or materials..."
          className={s.input}
        />
        <span className={s.kbd}>Ctrl+K</span>
      </div>

      {isOpen && query.trim() && createPortal(
        <div
          ref={dropdownRef}
          className={s.dropdown}
          style={{
            position: 'absolute',
            top: (wrapRef.current?.getBoundingClientRect().bottom || 0) + 6,
            left: wrapRef.current?.getBoundingClientRect().left || 0,
            width: wrapRef.current?.getBoundingClientRect().width || 400,
          }}
        >
          {groups.length === 0 ? (
            <div className={s.empty}>Brak wyników dla "{query}"</div>
          ) : (
            groups.map(group => (
              <div key={group.label} className={s.group}>
                <div className={s.groupLabel}>{group.label}</div>
                {group.items.map(item => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <div
                      key={idx}
                      className={`${s.resultRow} ${idx === activeIndex ? s.resultRowActive : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => handleSelect(item)}
                    >
                      <span className={s.resultIcon}>{item.icon}</span>
                      <div className={s.resultText}>
                        <div className={s.resultTitle}>
                          <Highlight text={item.title} query={query} />
                        </div>
                        <div className={s.resultMeta}>{item.meta}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
