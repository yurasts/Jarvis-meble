import { createPortal } from 'react-dom';

const ServicePicker = ({
  compact = false,
  isMobileVariant,
  isOpen,
  searchTerm,
  highlightedIndex,
  services,
  selectedServices,
  pickerRef,
  searchInputRef,
  optionRefs,
  colors,
  onClose,
  onOpen,
  onManualAdd,
  onSearchFocus,
  onSearchChange,
  onSearchKeyDown,
  onHighlight,
  onSelectService,
}) => {
  const mobilePicker = compact && isMobileVariant;

  const pickerPanel = (
    <div
      ref={pickerRef}
      style={{
        position: mobilePicker ? 'fixed' : 'relative',
        zIndex: mobilePicker ? 1300 : 'auto',
        top: mobilePicker ? 'calc(env(safe-area-inset-top, 0px) + 6px)' : 'auto',
        left: mobilePicker ? 'calc(var(--mobile-landscape-nav-width, 0px) + 8px)' : 'auto',
        right: mobilePicker ? '8px' : 'auto',
        width: mobilePicker ? 'auto' : '100%',
        boxSizing: 'border-box',
        background: colors.bgInput,
        border: mobilePicker ? `1px solid ${colors.border}` : 'none',
        borderRadius: mobilePicker ? '8px' : 0,
        boxShadow: mobilePicker ? '0 8px 28px rgba(0,0,0,0.28)' : 'none',
        overflow: mobilePicker ? 'hidden' : 'visible',
      }}
    >
      {mobilePicker && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '26px', padding: '2px 7px 0 10px', color: colors.textLight, fontSize: '11px', fontWeight: 700 }}>
          <span>{'Us\u0142ugi z bazy'}</span>
          <button
            type="button"
            aria-label={'Zamknij wyszukiwanie us\u0142ug'}
            onClick={onClose}
            style={{ width: '32px', height: '32px', padding: 0, border: 'none', background: 'transparent', color: colors.text, fontSize: '20px', lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '5px' : '7px', padding: mobilePicker ? '2px 5px 5px' : compact ? '4px' : '5px' }}>
        <input
          ref={searchInputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="service-picker-options"
          aria-activedescendant={isOpen && services[highlightedIndex] ? `service-option-${highlightedIndex}` : undefined}
          placeholder={'\uD83D\uDD0D Szukaj us\u0142ugi w bazie\u2026'}
          value={searchTerm}
          onFocus={onSearchFocus}
          onChange={event => onSearchChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          style={{ flex: 1, minWidth: 0, height: mobilePicker ? '38px' : 'auto', boxSizing: 'border-box', padding: compact ? '6px 8px' : '5px 8px', border: `1px solid ${colors.border}`, borderRadius: '5px', fontSize: mobilePicker ? '16px' : compact ? '12.5px' : '12px', background: colors.bgInput, color: colors.text }}
        />
        <button
          type="button"
          onClick={onManualAdd}
          style={{ flexShrink: 0, minHeight: mobilePicker ? '38px' : compact ? '34px' : '30px', background: colors.bgHeader, color: colors.text, border: `1px solid ${colors.border}`, padding: compact ? '4px 8px' : '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
        >
          {'+ R\u0119cznie'}
        </button>
      </div>

      {isOpen && (
        <div
          id="service-picker-options"
          role="listbox"
          style={{
            position: mobilePicker ? 'relative' : 'absolute',
            zIndex: 20,
            top: mobilePicker ? 'auto' : '100%',
            left: 0,
            right: 0,
            maxHeight: mobilePicker ? 'min(45dvh, 320px)' : compact ? '208px' : '220px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            border: `1px solid ${colors.border}`,
            borderLeft: mobilePicker ? 'none' : `1px solid ${colors.border}`,
            borderRight: mobilePicker ? 'none' : `1px solid ${colors.border}`,
            borderBottom: mobilePicker ? 'none' : `1px solid ${colors.border}`,
            borderRadius: mobilePicker ? 0 : '0 0 6px 6px',
            boxShadow: mobilePicker ? 'none' : '0 6px 16px rgba(0,0,0,0.16)',
            background: colors.bgInput,
          }}
        >
          {services.map((service, index) => {
            const isSelected = selectedServices.some(item => item.id === service.id);
            const isHighlighted = highlightedIndex === index;
            return (
              <div
                key={service.id ?? `${service.name}-${index}`}
                id={`service-option-${index}`}
                role="option"
                aria-selected={isHighlighted}
                ref={node => { optionRefs.current[index] = node; }}
                onMouseEnter={() => onHighlight(index)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                  alignItems: 'center',
                  gap: compact ? '5px' : '8px',
                  minHeight: mobilePicker ? '32px' : compact ? '34px' : '32px',
                  padding: mobilePicker ? '2px 4px 2px 8px' : '2px 5px 2px 8px',
                  borderBottom: `1px solid ${colors.border}`,
                  background: isHighlighted ? colors.highlightBackground : (isSelected ? colors.selectedBackground : colors.bgInput),
                }}
              >
                <button
                  type="button"
                  title={service.name}
                  onClick={() => onSelectService(service)}
                  style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.text, fontFamily: 'inherit', fontSize: '12px', fontWeight: 700 }}
                >
                  {service.name}
                </button>
                <span style={{ whiteSpace: 'nowrap', color: colors.accent, fontSize: '10.5px', fontWeight: 700 }}>
                  {Number(service.price).toFixed(2)} {'z\u0142 \u00B7'} {service.unit || 'szt'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectService(service)}
                  style={{ background: isSelected ? '#718096' : '#38a169', color: '#fff', border: 'none', padding: '4px 7px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                >
                  {isSelected ? '+ 1' : '+ Dodaj'}
                </button>
              </div>
            );
          })}
          {services.length === 0 && (
            <div style={{ padding: '9px', textAlign: 'center', color: colors.textLight, fontSize: '12px' }}>{'Brak wynik\u00F3w'}</div>
          )}
        </div>
      )}
    </div>
  );

  if (!mobilePicker) return pickerPanel;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', padding: '4px', boxSizing: 'border-box', background: colors.bgInput }}>
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="service-picker-options"
          onClick={onOpen}
          style={{ flex: 1, minWidth: 0, height: '34px', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${colors.border}`, borderRadius: '5px', background: colors.bgInput, color: colors.textLight, fontFamily: 'inherit', fontSize: '12.5px', textAlign: 'left', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          🔍 Szukaj usługi w bazie…
        </button>
        <button
          type="button"
          onClick={onManualAdd}
          style={{ flexShrink: 0, minHeight: '34px', background: colors.bgHeader, color: colors.text, border: `1px solid ${colors.border}`, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
        >
          {'+ R\u0119cznie'}
        </button>
      </div>
      {isOpen && createPortal(pickerPanel, document.body)}
    </>
  );
};

export default ServicePicker;
