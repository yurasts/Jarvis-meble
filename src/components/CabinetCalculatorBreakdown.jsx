import s from './CabinetCalculatorBreakdown.module.css';

const PLN = value => `${Number(value || 0).toFixed(2)} zł`;

// Modal «Szczegóły wyceny» — постатейная расшифровка Orientacyjna wycena из Kalkulator szafek.
// Чисто презентационный компонент: все суммы уже посчитаны в cabinetCalculator.js
// (buildCabinetCostBreakdown) — тут только отображение, никакой арифметики. Строки с нулевым
// количеством туда уже не попадают (Etap B, krok 1.4) — показываем только то, что пришло.
export default function CabinetCalculatorBreakdown({ breakdown, onClose }) {
  const { materialRows, serviceRows, materialsTotal, materialsScaled, servicesTotal, multiplier, wycena } = breakdown;

  return (
    <div className={s.overlay} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="cabinet-breakdown-title">
        <header className={s.header}>
          <h3 id="cabinet-breakdown-title">Szczegółowa kalkulacja wyceny</h3>
          <button type="button" className={s.closeButton} onClick={onClose} aria-label="Zamknij">×</button>
        </header>

        <div className={s.body}>
          <h4 className={s.blockTitle}>Materiały (× współczynnik)</h4>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <colgroup>
                <col className={s.colPozycja} />
                <col className={s.colMaterial} />
                <col className={s.colIlosc} />
                <col className={s.colCena} />
                <col className={s.colWartosc} />
                <col className={s.colPoX} />
              </colgroup>
              <thead>
                <tr>
                  <th>Pozycja</th>
                  <th>Wybrany materiał</th>
                  <th>Ilość</th>
                  <th>Cena jedn.</th>
                  <th>Wartość</th>
                  <th>Po ×{multiplier}</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.map(row => (
                  <tr key={row.key}>
                    <td data-label="Pozycja">{row.label}</td>
                    <td data-label="Wybrany materiał" className={s.materialCell}>
                      {row.item?.name || <span className={s.muted}>— nie wybrano —</span>}
                    </td>
                    <td data-label="Ilość">{row.quantityLabel}</td>
                    <td data-label="Cena jedn.">{row.unitPrice.toFixed(2)}</td>
                    <td data-label="Wartość">{row.value.toFixed(2)}</td>
                    <td data-label={`Po ×${multiplier}`} className={s.poX}>{row.scaledValue.toFixed(2)}</td>
                  </tr>
                ))}
                {materialRows.length === 0 && (
                  <tr><td colSpan={6} className={s.muted}>Brak pozycji — dodaj moduł, żeby zobaczyć rozliczenie.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 className={s.blockTitle}>Usługi (bez mnożnika)</h4>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Usługa</th>
                  <th>Wybrana pozycja</th>
                  <th>Ilość</th>
                  <th>Cena jedn.</th>
                  <th>Wartość</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map(row => (
                  <tr key={row.key}>
                    <td data-label="Usługa">{row.label}</td>
                    <td data-label="Wybrana pozycja" className={s.materialCell}>
                      {row.item?.name || <span className={s.muted}>— nie wybrano —</span>}
                    </td>
                    <td data-label="Ilość">{row.quantity.toFixed(2)} mb</td>
                    <td data-label="Cena jedn.">{row.unitPrice.toFixed(2)}</td>
                    <td data-label="Wartość">{row.value.toFixed(2)}</td>
                  </tr>
                ))}
                {serviceRows.length === 0 && (
                  <tr><td colSpan={5} className={s.muted}>Brak usług.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={s.totals}>
            <div className={s.totalRow}>
              <span>Suma materiałów (netto/bazowa):</span>
              <strong>{PLN(materialsTotal)}</strong>
            </div>
            <div className={s.totalRow}>
              <span>Materiały × współczynnik (×{multiplier}):</span>
              <strong>{PLN(materialsScaled)}</strong>
            </div>
            <div className={s.totalRow}>
              <span>Suma usług:</span>
              <strong>{PLN(servicesTotal)}</strong>
            </div>
            <div className={`${s.totalRow} ${s.grandTotal}`}>
              <span>RAZEM ORIENTACYJNA WYCENA:</span>
              <strong>{PLN(wycena)}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
