import s from './DesktopProjectItemsTable.module.css';

// Ширины колонок без строки заголовков (секции рабочей области). Сумма правых колонок одинакова
// у материалов и услуг (424 px), поэтому цена, количество и сумма стоят друг под другом.
// Это разметка таблицы (geometry), не тема/цвет — оставлены как инлайн-ширины <col>, т.к. колонки
// меняются по количеству (showUnit) и не ложатся на устойчивый nth-child-селектор.
const COLUMN_WIDTHS = {
  materials: [null, 110, 60, 90, 120, 44],
  services: [null, 170, 90, 120, 44],
  expenses: [null, 170, 90, 120, 44],
};

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
  // false — таблица внутри секции рабочей области (WorkspaceSection): рамку даёт сама секция.
  bordered = true,
  // false — без строки заголовков колонок (секции рабочей области: смысл колонок ясен из данных).
  showHeader = true,
  // Заливка строки тоном раздела (--section-*-tint). У materials заливка всегда (см. .module.css);
  // у services — только в рабочей области (workspace/embedded, mobile), modal-fallback (legacy
  // вкладки) её не использует — так было и в исходной вёрстке (rowBackground: bg vs var(--section-
  // services-tint)). У expenses заливки никогда не было (только modal-fallback, rowBackground: bg).
  sectionTint = true,
}) => {
  const config = TABLE_CONFIG[kind];
  const isMaterial = kind === 'materials';
  const columnCount = config.showUnit ? 6 : 5;
  const cellClass = isMaterial ? s.cellCompact : s.cell;
  const mutedCellClass = isMaterial ? s.mutedCellCompact : s.mutedCell;
  const sumCellClass = isMaterial ? s.sumCellCompact : s.sumCell;

  return (
    <div className={s.wrap} data-bordered={bordered} data-has-footer={!!footer}>
      <table className={s.table} data-kind={kind}>
        {!showHeader && (
          <colgroup>
            {COLUMN_WIDTHS[kind].map((width, index) => (
              <col key={index} style={width ? { width: `${width}px` } : undefined} />
            ))}
          </colgroup>
        )}
        {showHeader && (
        <thead>
          <tr className={s.headerRow}>
            {config.headers.map((header, index) => (
              <th
                key={header}
                className={s.headerCell}
                data-narrow={(config.showUnit ? index === 3 : index === 2) || undefined}
              >
                {header}
              </th>
            ))}
            <th className={s.headerCell} />
          </tr>
        </thead>
        )}
        <tbody>
          {entries.map(({ item, index }) => {
            const itemKey = item.id ?? index;
            const stateKey = `${config.prefix}-${index}`;
            const expandedKey = `${config.prefix}-${itemKey}`;
            const isReplacing = isMaterial && replacingIndex === index;

            return (
              <tr
                key={itemKey}
                className={s.row}
                data-kind={kind}
                data-tint={sectionTint || undefined}
                data-replacing={isReplacing || undefined}
                style={{ '--row-stripe': rowStripe(item) }}
              >
                <td
                  onClick={isMaterial ? undefined : () => onToggleExpanded(expandedKey)}
                  className={s.nameCell}
                  data-material={isMaterial || undefined}
                  data-expanded={expandedItemKey === expandedKey || undefined}
                  data-accent={isMaterial || undefined}
                >
                  <div className={s.nameRow}>
                    {isMaterial && (
                      <button
                        type="button"
                        aria-label={`Zamień materiał ${item.name}`}
                        title="Zamień materiał"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartReplacement(index);
                        }}
                        className={s.replaceBtn}
                      >
                        ✎
                      </button>
                    )}
                    <span
                      onClick={isMaterial ? () => onToggleExpanded(expandedKey) : undefined}
                      className={s.nameText}
                    >
                      {item.name}
                    </span>
                  </div>
                </td>
                <td className={cellClass}>
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
                      className={s.priceInput}
                    />
                  ) : (
                    <span
                      onClick={() => onStartPriceEdit(stateKey, item.price)}
                      className={s.priceDisplay}
                      data-accent={isMaterial}
                      title="Kliknij, aby zmienić cenę"
                    >
                      {Number(item.price).toFixed(2)}{isMaterial ? ' zł' : ''}
                    </span>
                  )}
                </td>
                {config.showUnit && (
                  <td className={mutedCellClass}>{item.unit || 'szt'}</td>
                )}
                <td className={cellClass}>
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
                    className={s.qtyInput}
                  />
                </td>
                <td className={sumCellClass}>
                  {(Number(item.price) * Number(item.quantity || 1)).toFixed(2)} zł
                </td>
                {renderDeleteCell(index)}
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={columnCount} className={s.emptyRow}>
                {config.emptyMessage}
              </td>
            </tr>
          )}
          {footer && (
            <tr>
              <td colSpan={columnCount} className={s.footerCell}>
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
