import { useEffect, useId, useMemo, useRef, useState } from 'react';
import s from './SearchableMaterialSelect.module.css';

const normalize = value => String(value || '').toLocaleLowerCase('pl');

const formatPrice = (item) => {
  const price = Number(item?.price);
  if (!Number.isFinite(price)) return '';
  const unit = item?.unit ? ` / ${item.unit}` : '';
  return `${price.toFixed(2)} zł${unit}`;
};

const hasActiveTextSelection = () => {
  try {
    return String(window.getSelection?.() || '').length > 0;
  } catch {
    return false;
  }
};

// Zastępuje gołe <select> wszędzie, gdzie użytkownik wybiera 1 pozycję z katalogu (Blok 1 i
// "🎨 Własne materiały szafki"): przycisk-wyzwalacz pokazuje nazwę + cenę, otwarty popover ma pole
// szukajki (filtruje po nazwie/symbolu) i listę z ceną przy każdej pozycji, zaznaczoną ✓. Trigger
// jest <div role="button"> (nie <button>) — pozwala to na zagnieżdżenie prawdziwego <button>
// kopiującego nazwę bez łamania HTML (interaktywny element wewnątrz <button> jest nielegalny).
export default function SearchableMaterialSelect({
  items, value, onChange, placeholder = '— nie wybrano —', emptyLabel, ariaLabel, disabled = false, allowEmpty = true,
  // Etap J, krok 1 — `variant="compact"` renderuje wyzwalacz jako gołą linię tekstu z ołówkiem
  // ✎ zamiast pudełka z ramką (nagłówek grupy: 4 pozycje materiału jedna pod drugą). `label`
  // dopisuje się przed nazwą materiału ("Płyta korpusu: ..."). Popover/szukajka/klawiatura —
  // dokładnie ten sam kod co w wariancie domyślnym, zmienia się tylko znacznik wyzwalacza.
  variant = 'default', label,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const copyTimerRef = useRef(null);
  const listId = useId();

  const pool = useMemo(() => items || [], [items]);
  const selected = useMemo(() => (
    pool.find(item => String(item.id) === String(value)) || null
  ), [pool, value]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    if (!term) return pool;
    return pool.filter(item => normalize(item.name).includes(term) || normalize(item.symbol).includes(term));
  }, [pool, search]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  // Fokus SYNCHRONICZNIE w efekcie (bez setTimeout!) — searchRef jest już zamontowany, kiedy ten
  // efekt biegnie (po commitcie popover do DOM-u). setTimeout(…, 0) otwierał realny wyścig: szybki
  // Escape (np. z testu e2e) mógł trafić zanim focus się przełożył, więc handler Escape na inpucie
  // (niżej) nigdy się nie odpalał, a klawisz leciał dalej do globalnego "Escape zamyka projekt"
  // (window.addEventListener w useProjectCloseLifecycle) — i zamykał cały widok projektu.
  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    return undefined;
  }, [open]);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const commit = (id) => {
    onChange(id);
    setOpen(false);
  };

  // Nazwę wybranego materiału można zaznaczyć myszką do skopiowania (user-select: text na
  // .triggerName) — kliknięcie KOŃCZĄCE takie zaznaczenie nie powinno otworzyć listy, inaczej
  // każda próba zaznaczenia tekstu od razu zasłaniałaby go popoverem.
  const toggleOpen = () => {
    if (disabled || hasActiveTextSelection()) return;
    if (!open) {
      setSearch('');
      setHighlighted(0);
    }
    setOpen(current => !current);
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleOpen();
    }
  };

  const handleCopyClick = (event) => {
    event.stopPropagation();
    if (!selected) return;
    const text = selected.name;
    const writeToClipboard = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error('Clipboard API niedostępne'));
    writeToClipboard
      .then(() => {
        setCopied(true);
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => Math.min(filtered.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[highlighted];
      if (item) commit(item.id);
    }
  };

  const emptyOptionLabel = emptyLabel || placeholder;
  const isCompact = variant === 'compact';

  return (
    <div ref={rootRef} className={isCompact ? s.compactRoot : s.root}>
      {isCompact ? (
        <div
          className={s.compactTrigger}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-disabled={disabled || undefined}
          data-disabled={disabled || undefined}
          title="Zmień materiał"
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className={s.compactPencil} aria-hidden="true">✎</span>
          {/* Etap P, krok 2 — kolumna etykiety ZAWSZE się renderuje (nawet pusta), żeby siatka CSS
              Grid na .compactTrigger (patrz CSS) miała zawsze dokładnie te same 4 kolumny —
              inaczej auto-placement przesunąłby wartość materiału w miejsce brakującej etykiety. */}
          <span className={s.compactLabel}>{label ? `${label}:` : ''}</span>
          <span className={s.compactText} data-empty={!selected || undefined}>
            {selected ? selected.name : emptyOptionLabel}
            {selected && <span className={s.compactPrice}> — {formatPrice(selected)}</span>}
          </span>
          {selected && (
            <button
              type="button"
              className={s.copyButton}
              title="Kopiuj nazwę materiału"
              aria-label="Kopiuj nazwę materiału"
              onClick={handleCopyClick}
            >
              {copied ? '✓' : '📋'}
            </button>
          )}
        </div>
      ) : (
        <div
          className={s.trigger}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-disabled={disabled || undefined}
          data-disabled={disabled || undefined}
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className={s.triggerName} data-empty={!selected || undefined}>
            {selected ? selected.name : emptyOptionLabel}
          </span>
          {selected && (
            <button
              type="button"
              className={s.copyButton}
              title="Kopiuj nazwę materiału"
              aria-label="Kopiuj nazwę materiału"
              onClick={handleCopyClick}
            >
              {copied ? '✓' : '📋'}
            </button>
          )}
          {selected && <span className={s.triggerPrice}>{formatPrice(selected)}</span>}
          <span className={s.triggerCaret} aria-hidden="true">▾</span>
        </div>
      )}
      {open && !disabled && (
        <div className={s.popover}>
          <input
            ref={searchRef}
            type="text"
            className={s.searchInput}
            placeholder="🔍 Szukaj po nazwie lub kodzie…"
            value={search}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(event) => { setSearch(event.target.value); setHighlighted(0); }}
            onKeyDown={handleSearchKeyDown}
          />
          <div id={listId} role="listbox" className={s.list}>
            {allowEmpty && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={s.option}
                onClick={() => commit('')}
              >
                <span className={s.optionName}>{emptyOptionLabel}</span>
                {!value && <span className={s.optionCheck} aria-hidden="true">✓</span>}
              </button>
            )}
            {filtered.map((item, index) => {
              const isSelected = String(item.id) === String(value);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={s.option}
                  data-highlighted={highlighted === index || undefined}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(item.id)}
                >
                  <span className={s.optionName} title={item.name}>
                    {item.name}{item.symbol ? ` · ${item.symbol}` : ''}
                  </span>
                  <span className={s.optionPrice}>{formatPrice(item)}</span>
                  {isSelected && <span className={s.optionCheck} aria-hidden="true">✓</span>}
                </button>
              );
            })}
            {filtered.length === 0 && <div className={s.empty}>Brak wyników</div>}
          </div>
        </div>
      )}
    </div>
  );
}
