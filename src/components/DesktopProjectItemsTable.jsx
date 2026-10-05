const TABLE_CONFIG = {
  materials: {
    headers: ['Nazwa materiału', 'Cena j.', 'Jm', 'Ilość', 'Suma'],
    prefix: 'mat',
    emptyMessage: 'Brak dodanych materiałów',
    showUnit: true,
  },
  services: {
    headers: ['Nazwa usługi', 'Cena jedn. (zł)', 'Ilość', 'Suma'],
    prefix: 'srv',
    emptyMessage: 'Brak dodanych usług',
  },
  expenses: {
    headers: ['Opis wydatku', 'Kwota bazowa (zł)', 'Mnożnik / Ilość', 'Suma wydatku'],
    prefix: 'exp',
    emptyMessage: 'Brak dodatkowych wydatków',
  },
};

const DesktopProjectItemsTable = ({
  kind,
  entries,
  expandedItemKey,
  editingPrice,
  priceDraft,
  quantityDrafts,
  replacingIndex = null,
  colors,
  rowStripe,
  footer = null,
  onToggleExpanded,
  onStartReplacement,
  onStartPriceEdit,
  onPriceDraftChange,
  onPriceSave,
  onCancelPriceEdit,
  onQuantityFocus,
  onQuantityChange,
  onQuantityCommit,
  renderDeleteCell,
}) => {
  const config = TABLE_CONFIG[kind];
  const isMaterial = kind === 'materials';
  const columnCount = config.showUnit ? 6 : 5;

  return (
    <div style={{ overflow: footer ? 'visible' : undefined, overflowX: footer ? undefined : 'auto', border: `1px solid ${colors.border}`, borderRadius: '6px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
        <thead>
          <tr style={{ background: colors.headerBackground, textAlign: 'left', color: colors.headerText }}>
            {config.headers.map((header, index) => (
              <th
                key={header}
                style={{
                  padding: '6px 8px',
                  borderBottom: `2px solid ${colors.headerBorder}`,
                  ...((config.showUnit ? index === 3 : index === 2) ? { width: config.showUnit ? '60px' : '80px' } : {}),
                }}
              >
                {header}
              </th>
            ))}
            <th style={{ padding: '6px 8px', borderBottom: `2px solid ${colors.headerBorder}` }} />
          </tr>
        </thead>
        <tbody>
          {entries.map(({ item, index }) => {
            const itemKey = item.id ?? index;
            const stateKey = `${config.prefix}-${index}`;
            const expandedKey = `${config.prefix}-${itemKey}`;
            const isReplacing = isMaterial && replacingIndex === index;
            const cellPadding = isMaterial ? '4px 8px' : '6px 8px';

            return (
              <tr
                key={itemKey}
                style={{
                  borderBottom: `1px solid ${colors.border}`,
                  background: isReplacing ? colors.replacementBackground : colors.rowBackground,
                  borderLeft: `3px solid ${rowStripe(item)}`,
                  boxShadow: isReplacing ? 'inset 0 0 0 2px #3182ce' : 'none',
                }}
              >
                <td
                  onClick={isMaterial ? undefined : () => onToggleExpanded(expandedKey)}
                  style={{
                  padding: isMaterial ? '2px 8px' : cellPadding,
                  color: colors.nameText,
                  cursor: 'pointer',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: expandedItemKey === expandedKey ? 'normal' : 'nowrap',
                  ...(isMaterial ? { fontWeight: 400, fontSize: '14px', lineHeight: '18px' } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    {isMaterial && (
                      <button
                        type="button"
                        aria-label={`Zamień materiał ${item.name}`}
                        title="Zamień materiał"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartReplacement(index);
                        }}
                        style={{ flexShrink: 0, width: '18px', height: '18px', padding: 0, border: 'none', borderRadius: '3px', background: 'transparent', color: colors.accent, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                      >
                        ✎
                      </button>
                    )}
                    <span
                      onClick={isMaterial ? () => onToggleExpanded(expandedKey) : undefined}
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'inherit' }}
                    >
                      {item.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: cellPadding }}>
                  {editingPrice === stateKey ? (
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      value={priceDraft}
                      onChange={event => onPriceDraftChange(event.target.value)}
                      onBlur={() => onPriceSave(index)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') onPriceSave(index);
                        if (event.key === 'Escape') onCancelPriceEdit();
                      }}
                      style={{ width: '70px', padding: '2px 4px', border: '1px solid #4da6ff', borderRadius: '4px', fontSize: '12px', background: colors.inputBackground, color: colors.text }}
                    />
                  ) : (
                    <span
                      onClick={() => onStartPriceEdit(stateKey, item.price)}
                      style={{ cursor: 'pointer', color: isMaterial ? colors.accent : colors.text, borderBottom: '1px dashed #a0aec0' }}
                      title="Kliknij, aby zmienić cenę"
                    >
                      {Number(item.price).toFixed(2)}{isMaterial ? ' zł' : ''}
                    </span>
                  )}
                </td>
                {config.showUnit && (
                  <td style={{ padding: cellPadding, color: colors.mutedText }}>{item.unit || 'szt'}</td>
                )}
                <td style={{ padding: cellPadding }}>
                  <input
                    type="text"
                    value={quantityDrafts[stateKey] !== undefined ? quantityDrafts[stateKey] : (isMaterial ? item.quantity : (item.quantity || 1))}
                    onFocus={() => onQuantityFocus(stateKey, isMaterial ? item.quantity : (item.quantity || 1))}
                    onChange={event => onQuantityChange(stateKey, event.target.value)}
                    onBlur={() => onQuantityCommit(index, stateKey)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        onQuantityCommit(index, stateKey);
                        event.currentTarget.blur();
                      }
                    }}
                    title="Wpisz liczbę lub wyrażenie: 37+20+16"
                    style={{ width: '70px', padding: '2px 4px', border: `1px solid ${colors.border}`, borderRadius: '4px', fontSize: '12px', background: colors.inputBackground, color: colors.text }}
                  />
                </td>
                <td style={{ padding: cellPadding, fontWeight: 'bold', color: colors.accent }}>
                  {(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł
                </td>
                {renderDeleteCell(index)}
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={columnCount} style={{ textAlign: 'center', padding: '15px', color: '#a0aec0' }}>
                {config.emptyMessage}
              </td>
            </tr>
          )}
          {footer && (
            <tr>
              <td colSpan={columnCount} style={{ padding: 0, borderTop: `1px solid ${colors.border}`, textAlign: 'left' }}>
                {footer}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DesktopProjectItemsTable;
