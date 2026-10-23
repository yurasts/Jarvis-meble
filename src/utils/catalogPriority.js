export const normalizeCatalogName = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pl');

const catalogId = (value) => String(value ?? '');

export const enrichCatalogWithUsage = (items = [], projects = [], field) => {
  const counts = new Map();

  projects.forEach((project) => {
    const usedInProject = new Set((project?.[field] || [])
      .map(item => catalogId(item?.id))
      .filter(Boolean));
    usedInProject.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  });

  return items.map(item => ({
    ...item,
    usage_count: counts.get(catalogId(item.id)) || 0,
  }));
};

export const compareCatalogPriority = (left, right) => {
  const favoriteDelta = Number(Boolean(right?.is_favorite)) - Number(Boolean(left?.is_favorite));
  if (favoriteDelta) return favoriteDelta;

  const leftUsage = Number(left?.usage_count) || 0;
  const rightUsage = Number(right?.usage_count) || 0;
  const usageDelta = rightUsage - leftUsage;
  if (usageDelta) return usageDelta;

  return String(left?.name || '').localeCompare(String(right?.name || ''), 'pl');
};

export const sortCatalogByPriority = (items = []) => [...items].sort(compareCatalogPriority);

export const createOrReuseCatalogItem = async ({ kind, draft, items = [], repository }) => {
  const name = String(draft?.name || '').trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeCatalogName(name);
  if (!normalizedName) throw new Error('Nazwa jest wymagana.');

  const existing = items.find(item => normalizeCatalogName(item.name) === normalizedName);
  if (existing) {
    return {
      item: {
        ...existing,
        unit: existing.unit || 'szt',
        category: existing.category || 'Inne',
      },
      created: false,
    };
  }

  const price = Number(draft?.price);
  const common = {
    name,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    is_favorite: false,
  };

  const item = kind === 'material'
    ? await repository.createMaterial({
      ...common,
      category: draft?.category || 'Inne',
      unit: draft?.unit || 'szt',
      supplier: draft?.supplier || 'Brak',
      symbol: draft?.symbol || null,
      price_history: [],
    })
    : await repository.createService(common);

  return {
    item: {
      ...item,
      unit: item.unit || 'szt',
      category: item.category || 'Inne',
    },
    created: true,
  };
};
