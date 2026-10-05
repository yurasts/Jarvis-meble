const MobileProjectItemRow = ({
  field,
  item,
  isExpanded,
  isConfirmingDelete,
  isReplacingMaterial,
  priceDraft,
  quantityDraft,
  accent,
  colors,
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
  const rowBackground = isReplacingMaterial ? colors.replacementBackground : accent.bg;
  const replacementShadow = isReplacingMaterial ? 'inset 0 0 0 2px #3182ce' : 'none';

  if (isConfirmingDelete) {
    return (
      <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px', borderRadius: '5px', borderLeft: `3px solid ${colors.rowStripe}`, background: rowBackground, boxShadow: replacementShadow }}>
        <span style={{ fontSize: '12px', color: colors.text, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          Usunąć „{item.name}”?
        </span>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onRemove} style={{ flexShrink: 0, background: '#e53e3e', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Tak</button>
          <button type="button" onClick={onCancelDelete} style={{ flexShrink: 0, background: colors.bgHeader, color: colors.text, border: `1px solid ${colors.border}`, padding: '3px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
        </div>
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', minHeight: '64px', boxSizing: 'border-box', background: rowBackground, border: `1px solid ${accent.border}`, borderLeft: `4px solid ${colors.rowStripe}`, borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center', boxShadow: replacementShadow }}>
        <button
          type="button"
          onClick={onFinishEditing}
          style={{ display: 'block', width: '100%', maxWidth: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'bold', fontSize: '12.5px', color: accent.text, cursor: 'pointer', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {item.name}
        </button>
        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {field === 'calc_materials' && (
            <button
              type="button"
              aria-label={`Zamień materiał ${item.name}`}
              title="Zamień materiał"
              onClick={(event) => { event.stopPropagation(); onStartMaterialReplacement(); }}
              style={{ flexShrink: 0, width: '22px', height: '22px', padding: 0, border: `1px solid ${colors.border}`, borderRadius: '4px', background: colors.bgInput, color: accent.text, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
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
            style={{ width: '64px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '16px', background: colors.bgInput, color: colors.text }}
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
            style={{ width: '46px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, padding: '3px 5px', border: `1px solid ${colors.border}`, borderRadius: '4px', fontSize: '16px', background: colors.bgInput, color: colors.text }}
          />
          <strong style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '12.5px', color: accent.text }}>{total} zł</strong>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
            style={{ flexShrink: 0, background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
          >
            ✖
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onFinishEditing}
            aria-label="Zakończ edycję"
            style={{ minHeight: '40px', boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24px', padding: '0 12px', borderRadius: '5px', background: '#38a169', color: '#fff', fontSize: '12.5px', fontWeight: 'bold' }}>
              Gotowe
            </span>
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
      style={{ height: '24px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 6px', borderRadius: '5px', cursor: 'pointer', borderLeft: `3px solid ${colors.rowStripe}`, background: rowBackground, boxShadow: replacementShadow, fontSize: '11px', fontWeight: 400, color: colors.text }}
    >
      {field === 'calc_materials' && (
        <button
          type="button"
          aria-label={`Zamień materiał ${item.name}`}
          title="Zamień materiał"
          onClick={(event) => { event.stopPropagation(); onStartMaterialReplacement(); }}
          style={{ flexShrink: 0, width: '18px', height: '18px', padding: 0, border: 'none', borderRadius: '3px', background: 'transparent', color: accent.text, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
        >
          ✎
        </button>
      )}
      <span style={{ flex: 1, minWidth: 0, font: 'inherit', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
      <span style={{ flexShrink: 0, width: '54px', font: 'inherit', color: colors.textLight, textAlign: 'right' }}>{Number(item.price).toFixed(2)} zł</span>
      <span style={{ flexShrink: 0, width: '26px', font: 'inherit', color: colors.textLight, textAlign: 'right' }}>{item.quantity ?? 1}</span>
      <span style={{ flexShrink: 0, width: '60px', font: 'inherit', color: accent.text, textAlign: 'right' }}>{total} zł</span>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
        style={{ flexShrink: 0, background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '13px', padding: 0, lineHeight: 1 }}
      >
        ✖
      </button>
    </div>
  );
};

export default MobileProjectItemRow;
