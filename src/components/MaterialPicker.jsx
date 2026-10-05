import { createPortal } from 'react-dom';

const MaterialPicker = ({
  compact = false,
  isMobileVariant,
  isOpen,
  searchTerm,
  highlightedIndex,
  groups,
  categoryFilter,
  categoryOptions,
  supplierFilter,
  supplierOptions,
  expandedGroupId,
  replacingMaterialIndex,
  selectedMaterials,
  pickerRef,
  searchInputRef,
  optionRefs,
  offerButtonRefs,
  colors,
  onClose,
  onOpen,
  onManualAdd,
  onSearchFocus,
  onSearchChange,
  onSearchKeyDown,
  onCategoryChange,
  onSupplierChange,
  onHighlight,
  onToggleGroup,
  onSelectMaterial,
}) => {
  const mobilePicker = compact && isMobileVariant;
  const replacingMaterial = replacingMaterialIndex !== null
    ? selectedMaterials[replacingMaterialIndex]
    : null;

  const pickerPanel = (
    <div ref={pickerRef} style={{
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
    }}>
      {mobilePicker && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '26px', padding: '2px 7px 0 10px', color: colors.textLight, fontSize: '11px', fontWeight: 700 }}>
          <span>Materiały z bazy</span>
          <button
            type="button"
            aria-label="Zamknij wyszukiwanie materiałów"
            onClick={onClose}
            style={{ width: '32px', height: '32px', padding: 0, border: 'none', background: 'transparent', color: colors.text, fontSize: '20px', lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
      {replacingMaterial && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '30px', padding: '4px 8px', borderBottom: `1px solid ${colors.border}`, background: colors.replacementBackground, color: colors.text, fontSize: '11px' }}>
          <strong style={{ flexShrink: 0 }}>Zamiana:</strong>
          <span title={replacingMaterial.name} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {replacingMaterial.name}
          </span>
          <button type="button" onClick={onClose} style={{ flexShrink: 0, border: 'none', background: 'transparent', color: colors.textLight, cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
            Anuluj
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
          aria-controls="material-picker-options"
          aria-activedescendant={isOpen && groups[highlightedIndex] ? `material-option-${highlightedIndex}` : undefined}
          placeholder="🔍 Szukaj materiału w bazie…"
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
          + Ręcznie
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '5px', padding: '0 5px 5px' }}>
        <select
          aria-label="Typ materiału"
          value={categoryFilter}
          onChange={event => onCategoryChange(event.target.value)}
          style={{ minWidth: 0, height: mobilePicker ? '36px' : '30px', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: '5px', padding: '2px 7px', background: colors.bgInput, color: colors.text, fontSize: mobilePicker ? '16px' : '11px' }}
        >
          <option value="">Typ: wszystkie</option>
          {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        <select
          aria-label="Dostawca materiału"
          value={supplierFilter}
          onChange={event => onSupplierChange(event.target.value)}
          style={{ minWidth: 0, height: mobilePicker ? '36px' : '30px', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: '5px', padding: '2px 7px', background: colors.bgInput, color: colors.text, fontSize: mobilePicker ? '16px' : '11px' }}
        >
          <option value="">Dostawca: wszyscy</option>
          {supplierOptions.map(supplier => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </div>

      {isOpen && (
        <div
          id="material-picker-options"
          role="listbox"
          style={{ position: mobilePicker ? 'relative' : 'absolute', zIndex: 20, top: mobilePicker ? 'auto' : '100%', left: 0, right: 0, maxHeight: mobilePicker ? 'min(36dvh, 260px)' : compact ? '208px' : '220px', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', border: `1px solid ${colors.border}`, borderLeft: mobilePicker ? 'none' : `1px solid ${colors.border}`, borderRight: mobilePicker ? 'none' : `1px solid ${colors.border}`, borderBottom: mobilePicker ? 'none' : `1px solid ${colors.border}`, borderRadius: mobilePicker ? 0 : '0 0 6px 6px', boxShadow: mobilePicker ? 'none' : '0 6px 16px rgba(0,0,0,0.16)', background: colors.bgInput }}
        >
          {groups.map((group, index) => {
            const hasMultipleOffers = group.offers.length > 1;
            const isSelected = group.offers.some(offer => selectedMaterials.some(item => item.id === offer.id));
            const isExpanded = expandedGroupId === group.key;
            const primaryOffer = group.offers[0];

            return (
              <div
                key={group.key}
                id={`material-option-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                ref={node => { optionRefs.current[index] = node; }}
                onMouseEnter={() => onHighlight(index)}
                style={{ borderBottom: `1px solid ${colors.border}`, backgroundColor: highlightedIndex === index ? colors.highlightBackground : (isSelected ? colors.bgMaterialRow : colors.bgInput) }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: compact ? '5px' : '8px', minHeight: mobilePicker ? '30px' : compact ? '34px' : '32px', padding: mobilePicker ? '1px 4px 1px 8px' : compact ? '2px 4px 2px 8px' : '2px 5px 2px 8px' }}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleGroup(group.key)}
                    title={group.label}
                    style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.text, fontFamily: 'inherit', fontSize: '12px', fontWeight: 700 }}
                  >
                    {group.label}
                  </button>
                  <span style={{ whiteSpace: 'nowrap', color: colors.textLight, fontSize: compact ? '10.5px' : '11px', fontWeight: 400 }}>
                    {hasMultipleOffers
                      ? <>{group.offers.length} wariantów</>
                      : <><strong style={{ color: colors.blueText }}>{Number(primaryOffer.price).toFixed(2)} zł</strong>{' · '}{primaryOffer.unit || 'szt'}</>}
                  </span>
                  <button
                    type="button"
                    onClick={() => hasMultipleOffers ? onToggleGroup(group.key) : onSelectMaterial(primaryOffer)}
                    style={{ background: hasMultipleOffers || replacingMaterialIndex !== null ? colors.blueButton : (isSelected ? '#718096' : '#38a169'), color: '#fff', border: 'none', padding: '4px 7px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                  >
                    {hasMultipleOffers ? (isExpanded ? 'Zwiń' : 'Wybierz') : (replacingMaterialIndex !== null ? 'Zamień' : (isSelected ? '+ 1' : '+ Dodaj'))}
                  </button>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, background: colors.expandedBackground }}>
                    {group.offers.map((offer, offerIndex) => {
                      const offerKey = offer.id ?? `${group.key}-${offerIndex}`;
                      const offerSelected = selectedMaterials.some(item => item.id === offer.id);
                      return (
                        <div key={offerKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: '7px', minHeight: '38px', padding: '3px 5px 3px 12px', borderBottom: offerIndex < group.offers.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                          <div style={{ minWidth: 0 }}>
                            <div title={offer.name || ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.text, fontSize: '11px', fontWeight: 600 }}>
                              {offer.name}
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.textLight, fontSize: '9.5px' }}>
                              {offer.supplier || 'Dostawca nieokreślony'}{offer.category ? ` · ${offer.category}` : ''}{offer.symbol ? ` · ${offer.symbol}` : ''}
                            </div>
                          </div>
                          <span style={{ whiteSpace: 'nowrap', color: colors.blueText, fontSize: '10.5px', fontWeight: 700 }}>
                            {Number(offer.price).toFixed(2)} zł · {offer.unit || 'szt'}
                          </span>
                          <button
                            ref={node => { offerButtonRefs.current[`${group.key}-${offerIndex}`] = node; }}
                            type="button"
                            onClick={() => onSelectMaterial(offer)}
                            style={{ background: replacingMaterialIndex !== null ? colors.blueButton : (offerSelected ? '#718096' : '#38a169'), color: '#fff', border: 'none', padding: '4px 7px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10.5px', whiteSpace: 'nowrap' }}
                          >
                            {replacingMaterialIndex !== null ? 'Zamień' : (offerSelected ? '+ 1' : '+ Dodaj')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <div style={{ padding: '9px', textAlign: 'center', color: colors.textLight, fontSize: '12px' }}>Brak wyników</div>
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
          aria-controls="material-picker-options"
          onClick={onOpen}
          style={{ flex: 1, minWidth: 0, height: '34px', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${colors.border}`, borderRadius: '5px', background: colors.bgInput, color: colors.textLight, fontFamily: 'inherit', fontSize: '12.5px', textAlign: 'left', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          🔍 Szukaj materiału w bazie…
        </button>
        <button
          type="button"
          onClick={onManualAdd}
          style={{ flexShrink: 0, minHeight: '34px', background: colors.bgHeader, color: colors.text, border: `1px solid ${colors.border}`, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
        >
          + Ręcznie
        </button>
      </div>
      {isOpen && createPortal(pickerPanel, document.body)}
    </>
  );
};

export default MaterialPicker;
