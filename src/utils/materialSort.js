const normalizeMaterialValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\u0142/g, 'l');

const materialPriority = (material) => {
  const name = normalizeMaterialValue(material?.name || material?.symbol);
  const category = normalizeMaterialValue(material?.category);
  const searchable = `${category} ${name}`;

  // Najpierw płyty meblowe (LDSP), następnie obrzeża ABS,
  // później zawiasy i prowadnice. Pozostałe pozycje trafiają na koniec.
  if (category.includes('plyt') || /^(pl|plyta)\b/.test(name)) return 0;
  if (category.includes('obrzez') || /\babs\b/.test(searchable)) return 1;
  if (searchable.includes('zawias')) return 2;
  if (/(prowadnic|tandem|movento|tandembox|metabox|legrabox)/.test(searchable)) return 3;
  return 4;
};

export const compareMaterialsByWorkflow = (a, b) => {
  const priorityDifference = materialPriority(a) - materialPriority(b);
  if (priorityDifference !== 0) return priorityDifference;

  const aName = String(a?.name || a?.symbol || '');
  const bName = String(b?.name || b?.symbol || '');
  return aName.localeCompare(bName, 'pl', { numeric: true, sensitivity: 'base' });
};

export const sortMaterialsByWorkflow = (materials = []) =>
  [...materials].sort(compareMaterialsByWorkflow);
