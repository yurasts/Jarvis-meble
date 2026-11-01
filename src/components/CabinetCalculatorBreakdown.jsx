import s from './CabinetCalculatorBreakdown.module.css';

const PLN = value => `${Number(value || 0).toFixed(2)} zł`;

// Modal «Szczegóły wyceny» — постатейная расшифровка Orientacyjna wycena из Kalkulator szafek.
// Чисто презентационный компонент: все суммы уже посчитаны в cabinetCalculator.js
// (buildCabinetCostBreakdown) — тут только отображение, никакой арифметики.
export default function CabinetCalculatorBreakdown({ breakdown, onClose }) {
  const { materialRows, infoRows, serviceRows, materialsTotal, materialsScaled, servicesTotal, multiplier, wycena } = breakdown;

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
          <h4 className={s.blockTitle}>Materiały (liczone × współczynnik)</h4>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Pozycja (Kategoria)</th>
                <th>Wybrany materiał</th>
                <th>Wyliczona ilość</th>
                <th>Cena jedn. (zł)</th>
                <th>Wartość (zł)</th>
                <th>Po współczynniku ×{multiplier} (zł)</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map(row => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.item?.name || <span className={s.muted}>— nie wybrano —</span>}</td>
                  <td>{row.quantityLabel}</td>
                  <td>{row.unitPrice.toFixed(2)}</td>
                  <td>{row.value.toFixed(2)}</td>
                  <td>{row.scaledValue.toFixed(2)}</td>
                </tr>
              ))}
              {infoRows.map(row => (
                <tr key={row.key} className={s.infoRow}>
                  <td>{row.label}</td>
                  <td className={s.muted}>—</td>
                  <td>{row.quantityLabel}</td>
                  <td colSpan={3}><span className={s.infoBadge}>informacyjnie (0.00 zł)</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className={s.blockTitle}>Usługi (bez mnożnika)</h4>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Usługa</th>
                <th>Wybrana pozycja</th>
                <th>Ilość</th>
                <th>Cena jedn. (zł)</th>
                <th>Wartość (zł)</th>
              </tr>
            </thead>
            <tbody>
              {serviceRows.map(row => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.item?.name || <span className={s.muted}>— nie wybrano —</span>}</td>
                  <td>{row.quantity.toFixed(2)} mb</td>
                  <td>{row.unitPrice.toFixed(2)}</td>
                  <td>{row.value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
