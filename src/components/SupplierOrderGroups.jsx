import { useEffect, useRef, useState } from 'react';
import { formatSupplierOrderText, groupMaterialsBySupplier } from '../utils/supplierOrderGroups';
import { getSupplierGoogleMapsUrl } from '../utils/supplierMaps';
import s from './SupplierOrderGroups.module.css';

const COPY_FLASH_MS = 2000;

// Панель «📦 Zamówienia» (Materiały, desktop workspace) — группирует позиции проекта по
// поставщику каталога (material_suppliers) и копирует текст заказа в буфер обмена в 1 клик.
// Отмеченность позиции (чекбокс «уже есть на складе») — состояние только этой панели, ничего
// не сохраняется в проект; закрыл/открыл панель — отметки сбрасываются к «все отмечены».
export default function SupplierOrderGroups({ items, materialsById, projectName }) {
  const [uncheckedIndices, setUncheckedIndices] = useState(() => new Set());
  const [copiedSupplierId, setCopiedSupplierId] = useState(null);
  const copyTimeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(copyTimeoutRef.current), []);

  const toggleItem = (index) => {
    setUncheckedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const groups = groupMaterialsBySupplier(items, materialsById);

  const handleCopy = async (group) => {
    const checkedEntries = group.entries.filter(entry => !uncheckedIndices.has(entry.index));
    const text = formatSupplierOrderText({
      projectName,
      items: checkedEntries.map(entry => ({
        name: entry.item.name,
        supplier_sku: entry.supplierSku,
        quantity: entry.item.quantity,
        unit: entry.item.unit,
      })),
    });

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Schowek może być niedostępny (brak uprawnień, stare środowisko) — status mimo to
      // pokazujemy optymistycznie, tekst i tak trafił do navigator.clipboard.writeText.
    }

    window.clearTimeout(copyTimeoutRef.current);
    setCopiedSupplierId(group.supplierId);
    copyTimeoutRef.current = window.setTimeout(() => setCopiedSupplierId(null), COPY_FLASH_MS);
  };

  if (groups.length === 0) {
    return <div className={s.empty}>Brak materiałów do zamówienia.</div>;
  }

  return (
    <div className={s.panel}>
      {groups.map((group) => {
        const key = group.supplierId || 'none';
        const checkedCount = group.entries.filter(entry => !uncheckedIndices.has(entry.index)).length;
        const mapsUrl = group.supplier ? getSupplierGoogleMapsUrl(group.supplier) : null;
        const contact = group.supplier
          ? [group.supplier.contact_person, group.supplier.phone].filter(Boolean).join(' · ')
          : '';
        const isCopied = copiedSupplierId === group.supplierId;

        return (
          <div key={key} className={s.group} data-testid={`supplier-group-${key}`} data-unassigned={!group.supplier || undefined}>
            <div className={s.groupHeader}>
              <span className={s.groupName}>{group.supplier ? group.supplier.name : 'Bez dostawcy'}</span>
              <span className={s.groupCount}>{checkedCount} / {group.entries.length} poz.</span>
              {contact && <span className={s.groupContact}>{contact}</span>}
              {group.supplier && mapsUrl && (
                <a className={s.mapBtn} href={mapsUrl} target="_blank" rel="noreferrer">
                  📍 Mapa
                </a>
              )}
              {group.supplier && (
                <button
                  type="button"
                  className={s.copyBtn}
                  data-copied={isCopied || undefined}
                  disabled={checkedCount === 0}
                  onClick={() => handleCopy(group)}
                >
                  {isCopied ? '✓ Skopiowano!' : '📋 Kopiuj zamówienie'}
                </button>
              )}
            </div>
            <ul className={s.itemList}>
              {group.entries.map((entry) => (
                <li key={entry.index} className={s.item}>
                  <label className={s.itemLabel}>
                    <input
                      type="checkbox"
                      checked={!uncheckedIndices.has(entry.index)}
                      onChange={() => toggleItem(entry.index)}
                    />
                    <span className={s.itemName} title={entry.item.name}>{entry.item.name}</span>
                    {entry.supplierSku && <span className={s.itemCode}>Kod: {entry.supplierSku}</span>}
                  </label>
                  <span className={s.itemQty}>{entry.item.quantity} {entry.item.unit || 'szt'}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
