export const materialSupplierLinks = (material) => (
  Array.isArray(material?.material_suppliers) ? material.material_suppliers : []
);

export const linkedSupplier = (link) => link?.supplier || null;

export const materialSupplierNames = (material) => {
  const names = materialSupplierLinks(material)
    .map(link => linkedSupplier(link)?.name)
    .filter(Boolean);

  if (names.length === 0 && material?.supplier) names.push(material.supplier);
  return [...new Set(names)];
};

export const materialHasSupplier = (material, supplierKey) => {
  if (!supplierKey) return true;
  const normalizedKey = String(supplierKey).trim().toLocaleLowerCase('pl-PL');

  return materialSupplierLinks(material).some(link => (
    String(link.supplier_id || '').toLocaleLowerCase('pl-PL') === normalizedKey
    || String(linkedSupplier(link)?.id || '').toLocaleLowerCase('pl-PL') === normalizedKey
    || String(linkedSupplier(link)?.name || '').trim().toLocaleLowerCase('pl-PL') === normalizedKey
  )) || String(material?.supplier || '').trim().toLocaleLowerCase('pl-PL') === normalizedKey;
};

export const normalizePreferredSupplierLinks = (links) => {
  const selected = (links || []).filter(link => link?.supplier_id);
  if (selected.length === 0) return [];

  const preferredIndex = selected.findIndex(link => link.is_preferred);
  const resolvedPreferredIndex = preferredIndex >= 0 ? preferredIndex : 0;
  return selected.map((link, index) => ({
    supplier_id: link.supplier_id,
    supplier_sku: link.supplier_sku?.trim() || '',
    supplier_price: link.supplier_price === '' || link.supplier_price == null
      ? null
      : Number(link.supplier_price),
    is_preferred: index === resolvedPreferredIndex,
  }));
};
