import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import s from './MaterialPicker.module.css';
import CatalogFavoriteButton from './CatalogFavoriteButton';
import { materialSupplierNames } from '../utils/materialSuppliers';

const actionVariant = (emphasis, selected) => (emphasis ? 'emphasis' : selected ? 'selected' : 'default');

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
  onToggleFavorite,
}) => {
  const mobilePicker = compact && isMobileVariant;
  const variant = mobilePicker ? 'mobile' : compact ? 'compact' : 'full';
  const replacingMaterial = replacingMaterialIndex !== null
    ? selectedMaterials[replacingMaterialIndex]
    : null;
  const isReplacing = replacingMaterialIndex !== null;

  const pickerPanel = (
    <div ref={pickerRef} className={s.panel} data-variant={variant}>
      {mobilePicker && (
        <div className={s.mobileHeader}>
          <span>Materiały z bazy</span>
          <button type="button" aria-label="Zamknij wyszukiwanie materiałów" onClick={onClose} className={s.mobileHeaderClose}>
            ×
          </button>
        </div>
      )}
      {replacingMaterial && (
        <div className={s.replaceBanner}>
          <strong className={s.replaceBannerLabel}>Zamiana:</strong>
          <span title={replacingMaterial.name} className={s.replaceBannerName}>
            {replacingMaterial.name}
          </span>
          <button type="button" onClick={onClose} className={s.replaceBannerCancel}>
            Anuluj
          </button>
        </div>
      )}
      <div className={s.searchRow}>
        <div className={s.searchFieldWrap}>
          <Search aria-hidden="true" size={14} className={s.searchIcon} />
          <input
            ref={searchInputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls="material-picker-options"
            aria-activedescendant={isOpen && groups[highlightedIndex] ? `material-option-${highlightedIndex}` : undefined}
            placeholder="Szukaj materiału w bazie…"
            value={searchTerm}
            onFocus={onSearchFocus}
            onChange={event => onSearchChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            className={s.searchInput}
          />
        </div>
        <button type="button" onClick={onManualAdd} className={s.manualAddBtn}>
          + Ręcznie
        </button>
      </div>
      <div className={s.filters}>
        <select
          aria-label="Typ materiału"
          value={categoryFilter}
          onChange={event => onCategoryChange(event.target.value)}
          className={s.filterSelect}
        >
          <option value="">Typ: wszystkie</option>
          {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        <select
          aria-label="Dostawca materiału"
          value={supplierFilter}
          onChange={event => onSupplierChange(event.target.value)}
          className={s.filterSelect}
        >
          <option value="">Dostawca: wszyscy</option>
          {supplierOptions.map(supplier => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </div>

      {isOpen && (
        <div id="material-picker-options" role="listbox" className={s.listbox}>
          {groups.map((group, index) => {
            const hasMultipleOffers = group.offers.length > 1;
            const isSelected = group.offers.some(offer => selectedMaterials.some(item => item.id === offer.id));
            const isExpanded = expandedGroupId === group.key;
            const primaryOffer = group.offers[0];
            const emphasis = hasMultipleOffers || isReplacing;
            const groupSupplierNames = [...new Set(group.offers.flatMap(materialSupplierNames))];

            return (
              <div
                key={group.key}
                id={`material-option-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                ref={node => { optionRefs.current[index] = node; }}
                onMouseEnter={() => onHighlight(index)}
                className={s.option}
                data-selected={isSelected || undefined}
                data-highlighted={highlightedIndex === index || undefined}
              >
                <div className={s.optionRow}>
                  <CatalogFavoriteButton item={primaryOffer} kind="material" onToggle={onToggleFavorite} compact />
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleGroup(group.key)}
                    title={group.label}
                    className={s.optionLabel}
                  >
                    {group.label}
                  </button>
                  <span className={s.optionMeta}>
                    {groupSupplierNames.length > 0 && <span className={s.optionSupplierBadges}>
                      {groupSupplierNames.map(name => <span key={name}>{name}</span>)}
                    </span>}
                    {hasMultipleOffers
                      ? <>{group.offers.length} wariantów</>
                      : <><strong className={s.optionMetaPrice}>{Number(primaryOffer.price).toFixed(2)} zł</strong>{' · '}{primaryOffer.unit || 'szt'}</>}
                  </span>
                  <button
                    type="button"
                    onClick={() => hasMultipleOffers ? onToggleGroup(group.key) : onSelectMaterial(primaryOffer)}
                    className={s.optionActionBtn}
                    data-variant={actionVariant(emphasis, isSelected)}
                  >
                    {hasMultipleOffers ? (isExpanded ? 'Zwiń' : 'Wybierz') : (isReplacing ? 'Zamień' : (isSelected ? '+ 1' : '+ Dodaj'))}
                  </button>
                </div>
                {isExpanded && (
                  <div className={s.offers}>
                    {group.offers.map((offer, offerIndex) => {
                      const offerKey = offer.id ?? `${group.key}-${offerIndex}`;
                      const offerSelected = selectedMaterials.some(item => item.id === offer.id);
                      return (
                        <div key={offerKey} className={s.offerRow} data-last={offerIndex === group.offers.length - 1}>
                          <CatalogFavoriteButton item={offer} kind="material" onToggle={onToggleFavorite} compact />
                          <div className={s.offerInfo}>
                            <div title={offer.name || ''} className={s.offerName}>
                              {offer.name}
                            </div>
                            <div className={s.offerSupplier}>
                              <span className={s.offerSuppliers}>
                                {(materialSupplierNames(offer).length ? materialSupplierNames(offer) : ['Dostawca nieokreślony'])
                                  .map(name => <span key={name}>{name}</span>)}
                              </span>
                              {offer.category ? ` · ${offer.category}` : ''}{offer.symbol ? ` · ${offer.symbol}` : ''}
                            </div>
                          </div>
                          <span className={s.offerPrice}>
                            {Number(offer.price).toFixed(2)} zł · {offer.unit || 'szt'}
                          </span>
                          <button
                            ref={node => { offerButtonRefs.current[`${group.key}-${offerIndex}`] = node; }}
                            type="button"
                            onClick={() => onSelectMaterial(offer)}
                            className={s.optionActionBtn}
                            data-variant={actionVariant(isReplacing, offerSelected)}
                          >
                            {isReplacing ? 'Zamień' : (offerSelected ? '+ 1' : '+ Dodaj')}
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
            <div className={s.emptyState}>Brak wyników</div>
          )}
        </div>
      )}
    </div>
  );

  if (!mobilePicker) return pickerPanel;

  return (
    <>
      <div className={s.mobileTrigger}>
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="material-picker-options"
          onClick={onOpen}
          className={s.mobileTriggerInput}
        >
          🔍 Szukaj materiału w bazie…
        </button>
        <button type="button" onClick={onManualAdd} className={s.mobileTriggerAdd}>
          + Ręcznie
        </button>
      </div>
      {isOpen && createPortal(pickerPanel, document.body)}
    </>
  );
};

export default MaterialPicker;
