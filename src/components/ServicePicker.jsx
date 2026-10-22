import { createPortal } from 'react-dom';
import s from './ServicePicker.module.css';

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
  const variant = mobilePicker ? 'mobile' : compact ? 'compact' : 'full';

  const pickerPanel = (
    <div ref={pickerRef} className={s.panel} data-variant={variant}>
      {mobilePicker && (
        <div className={s.mobileHeader}>
          <span>{'Usługi z bazy'}</span>
          <button type="button" aria-label={'Zamknij wyszukiwanie usług'} onClick={onClose} className={s.mobileHeaderClose}>
            ×
          </button>
        </div>
      )}

      <div className={s.searchRow}>
        <input
          ref={searchInputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="service-picker-options"
          aria-activedescendant={isOpen && services[highlightedIndex] ? `service-option-${highlightedIndex}` : undefined}
          placeholder={'🔍 Szukaj usługi w bazie…'}
          value={searchTerm}
          onFocus={onSearchFocus}
          onChange={event => onSearchChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          className={s.searchInput}
        />
        <button type="button" onClick={onManualAdd} className={s.manualAddBtn}>
          {'+ Ręcznie'}
        </button>
      </div>

      {isOpen && (
        <div id="service-picker-options" role="listbox" className={s.listbox}>
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
                className={s.option}
                data-selected={isSelected || undefined}
                data-highlighted={isHighlighted || undefined}
              >
                <button
                  type="button"
                  title={service.name}
                  onClick={() => onSelectService(service)}
                  className={s.optionLabel}
                >
                  {service.name}
                </button>
                <span className={s.optionPrice}>
                  {Number(service.price).toFixed(2)} {'zł ·'} {service.unit || 'szt'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectService(service)}
                  className={s.optionActionBtn}
                  data-selected={isSelected || undefined}
                >
                  {isSelected ? '+ 1' : '+ Dodaj'}
                </button>
              </div>
            );
          })}
          {services.length === 0 && (
            <div className={s.emptyState}>{'Brak wyników'}</div>
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
          aria-controls="service-picker-options"
          onClick={onOpen}
          className={s.mobileTriggerInput}
        >
          🔍 Szukaj usługi w bazie…
        </button>
        <button type="button" onClick={onManualAdd} className={s.mobileTriggerAdd}>
          {'+ Ręcznie'}
        </button>
      </div>
      {isOpen && createPortal(pickerPanel, document.body)}
    </>
  );
};

export default ServicePicker;
