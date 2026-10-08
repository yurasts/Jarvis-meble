const normalizeMaterialValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\u0141\u0142]/g, 'l');

const materialPriority = (material) => {
  const name = normalizeMaterialValue(material?.name || material?.symbol);
  const category = normalizeMaterialValue(material?.category);
  const searchable = `${category} ${name}`;

  // Najpierw płyty meblowe (LDSP), następnie obrzeża ABS,
  // później zawiasy i prowadnice. Pozostałe pozycje trafiają na koniec.
  if (category.includes('plyt') || /^(pl|plyta)\b/.test(name)) return 0;
  if (category.includes('obrzez') || /\babs\b/.test(searchable)) return 1;
  if (category.includes('zawias') || (searchable.includes('zawias') && !/\bprowadnik\b/.test(searchable))) return 2;
  if (/\bprowadnik\b/.test(searchable)) return 3;
  if (/\btip[\s-]*on\b/.test(searchable)) return 4;
  if (category.includes('prowadnic') || /\bprowadnic[aeęy]?\b/.test(searchable)) return 5;
  return 6;
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
