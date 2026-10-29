import { materialSupplierLinks } from './materialSuppliers';

// Поставщик позиции материала ПРОЕКТА: явный выбор пользователя в рамках этого проекта
// (item.supplier_id — переключатель в строке материала, см. ProjectModal.jsx) имеет приоритет;
// иначе — is_preferred из каталога (material_suppliers), иначе первый привязанный поставщик.
// null — у материала в каталоге нет ни одного привязанного поставщика («Bez dostawcy»).
export const resolveMaterialSupplierLink = (item, catalogMaterial) => {
  const links = materialSupplierLinks(catalogMaterial);
  if (links.length === 0) return null;

  if (item?.supplier_id) {
    const chosen = links.find(link => link.supplier_id === item.supplier_id);
    if (chosen) return chosen;
  }

  return links.find(link => link.is_preferred) || links[0];
};

// Группирует позиции материалов проекта по поставщику (для панели «📦 Zamówienia»).
// materialsById — Map<item.id, catalogMaterial> (каталог, откуда берутся живые material_suppliers).
// Группа «Bez dostawcy» (supplierId: null) всегда идёт последней; остальные — по алфавиту (pl).
export const groupMaterialsBySupplier = (items, materialsById) => {
  const groups = new Map();
  const order = [];

  (items || []).forEach((item, index) => {
    const catalogMaterial = materialsById?.get(item.id);
    const link = resolveMaterialSupplierLink(item, catalogMaterial);
    const key = link ? link.supplier_id : 'none';

    if (!groups.has(key)) {
      groups.set(key, { supplierId: link?.supplier_id || null, supplier: link?.supplier || null, entries: [] });
      order.push(key);
    }
    groups.get(key).entries.push({
      item,
      index,
      supplierSku: link?.supplier_sku || '',
    });
  });

  return order
    .map(key => groups.get(key))
    .sort((left, right) => {
      if (!left.supplier) return 1;
      if (!right.supplier) return -1;
      return left.supplier.name.localeCompare(right.supplier.name, 'pl');
    });
};

// Текст заказа для WhatsApp/SMS/Gmail — специально БЕЗ цен (поставщик не должен видеть,
// за сколько материал продаётся клиенту). items: [{ name, supplier_sku, quantity, unit }].
export const formatSupplierOrderText = ({ items, projectName }) => {
  const lines = (items || []).map((entry, index) => {
    const code = entry.supplier_sku ? ` [Kod: ${entry.supplier_sku}]` : '';
    const unit = entry.unit || 'szt';
    return `${index + 1}. ${entry.name}${code} — ${entry.quantity} ${unit}`;
  });

  return [
    'Dzień dobry,',
    `proszę o przygotowanie zamówienia (Projekt: ${projectName}):`,
    '',
    ...lines,
    '',
    'Pozdrawiam',
  ].join('\n');
};
