import s from './MobileProjectItemRow.module.css';

// Цвета раздела (Materiały/Usługi/Rozliczenia) — через data-kind=field в CSS (--section-*
// токены из src/index.css), не через prop-drilling colors/accent (refactor/design-tokens-cleanup).
// rowStripe — единственное, что действительно динамическое (item.addedByColor, цвет сотрудника).
const MobileProjectItemRow = ({
  field,
  item,
  isExpanded,
  isConfirmingDelete,
  isReplacingMaterial,
  priceDraft,
  quantityDraft,
  rowStripe,
  onOpen,
  onFinishEditing,
  onPriceDraftChange,
  onPriceSave,
  onQuantityFocus,
  onQuantityChange,
  onQuantityCommit,
  onRequestDelete,
  onCancelDelete,
  onRemove,
  onStartMaterialReplacement,
}) => {
  const total = (Number(item.price) * Number(item.quantity || 1)).toFixed(2);
  const rowStyle = { '--row-stripe': rowStripe };

  if (isConfirmingDelete) {
    return (
      <div className={s.deleteConfirm} data-kind={field} data-replacing={isReplacingMaterial || undefined} style={rowStyle}>
        <span className={s.deleteConfirmText}>Usunąć „{item.name}”?</span>
        <div className={s.deleteConfirmActions}>
          <button type="button" onClick={onRemove} className={s.deleteConfirmYes}>Tak</button>
          <button type="button" onClick={onCancelDelete} className={s.deleteConfirmNo}>Nie</button>
        </div>
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div className={s.expanded} data-kind={field} data-replacing={isReplacingMaterial || undefined} style={rowStyle}>
        <button type="button" onClick={onFinishEditing} className={s.expandedName}>
          {item.name}
        </button>
        <div className={s.expandedControls}>
          {field === 'calc_materials' && (
            <button
              type="button"
              aria-label={`Zamień materiał ${item.name}`}
              title="Zamień materiał"
              onClick={(event) => { event.stopPropagation(); onStartMaterialReplacement(); }}
              className={s.expandedReplaceBtn}
            >
              ✎
            </button>
          )}
          <input
            autoFocus
            type="number"
            step="0.01"
            value={priceDraft}
            onChange={event => onPriceDraftChange(event.target.value)}
            onBlur={onPriceSave}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onPriceSave();
              if (event.key === 'Escape') {
                event.stopPropagation();
                onFinishEditing();
              }
            }}
            className={s.priceInput}
          />
          <input
            type="text"
            value={quantityDraft !== undefined ? quantityDraft : (item.quantity ?? 1)}
            onFocus={() => onQuantityFocus(item.quantity ?? 1)}
            onChange={event => onQuantityChange(event.target.value)}
            onBlur={onQuantityCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onQuantityCommit();
                event.target.blur();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                onFinishEditing();
              }
            }}
            className={s.qtyInput}
          />
          <strong className={s.expandedTotal}>{total} zł</strong>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
            className={s.removeBtn}
          >
            ✖
          </button>
        </div>
        <div className={s.doneRow}>
          <button type="button" onClick={onFinishEditing} aria-label="Zakończ edycję" className={s.doneBtn}>
            <span className={s.doneLabel}>Gotowe</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={s.row}
      data-kind={field}
      data-replacing={isReplacingMaterial || undefined}
      style={rowStyle}
    >
      {field === 'calc_materials' && (
        <button
          type="button"
          aria-label={`Zamień materiał ${item.name}`}
          title="Zamień materiał"
          onClick={(event) => { event.stopPropagation(); onStartMaterialReplacement(); }}
          className={s.replaceBtn}
        >
          ✎
        </button>
      )}
      <span className={s.name}>{item.name}</span>
      <span className={s.price}>{Number(item.price).toFixed(2)} zł</span>
      <span className={s.qty}>{item.quantity ?? 1}</span>
      <span className={s.total}>{total} zł</span>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
        className={s.removeBtn}
      >
        ✖
      </button>
    </div>
  );
};

export default MobileProjectItemRow;
