import { useState } from 'react';
import { kitComponentsTotal } from '../utils/materialKits';
import s from './KitBreakdownPill.module.css';

// Pigułka pod nazwą materiału-zestawu (np. MERIVOBOX) — na żądanie rozwija listę komponentów
// wchodzących w jego skład, z ilością, ceną jednostkową i wyliczoną sumą. Czysto prezentacyjny:
// components (z materialKits.kitComponentsFor) to już gotowe { component, quantity } pary.
export default function KitBreakdownPill({ components }) {
  const [open, setOpen] = useState(false);
  if (!components || components.length === 0) return null;

  return (
    <div className={s.wrap}>
      <button type="button" className={s.pill} aria-expanded={open} onClick={() => setOpen(current => !current)}>
        🧩 Skład zestawu ({components.length} el.)
      </button>
      {open && (
        <ul className={s.list}>
          {components.map(({ component, quantity }) => (
            <li key={component.id} className={s.row}>
              <span className={s.name}>{component.name}</span>
              <span className={s.quantity}>{quantity} {component.unit || 'szt'}</span>
              <span className={s.price}>{Number(component.price || 0).toFixed(2)} zł</span>
              <span className={s.value}>{(quantity * Number(component.price || 0)).toFixed(2)} zł</span>
            </li>
          ))}
          <li className={s.total}>
            <span>Razem</span>
            <span>{kitComponentsTotal(components).toFixed(2)} zł</span>
          </li>
        </ul>
      )}
    </div>
  );
}
