const normalizeMaterialText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .trim()
    .toLowerCase();

const normalizeKey = (value) => normalizeMaterialText(value)
  .replace(/[?*]/g, 'x')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getMaterialKind = (material) => {
  const category = normalizeMaterialText(material?.category);
  const name = normalizeMaterialText(material?.name || material?.symbol);
  const searchable = `${category} ${name}`;

  if (category.includes('obrzez') || /\babs\b/.test(searchable)) return { key: 'abs', label: 'ABS' };
  if (category.includes('laminat') || /^laminat\b/.test(name)) return { key: 'laminate', label: 'Laminat' };
  if (category.includes('hdf') || /^hdf\b/.test(name)) return { key: 'hdf', label: 'HDF' };
  if (category.includes('plyt') || /^(pl|plyta)\b/.test(name) || /\b[WUH]\d{3,4}\b/i.test(name)) {
    return { key: 'board', label: 'Płyta' };
  }

  const label = String(material?.category || 'Inne').trim() || 'Inne';
  return { key: normalizeMaterialText(label) || 'inne', label };
};

const extractDecorCode = (material) => {
  for (const value of [material?.symbol, material?.name]) {
    const match = String(value || '').toUpperCase().match(/\b([WUH]\d{3,4})\b/);
    if (match) return match[1];
  }
  return '';
};

const getBareNumericCode = (material) => {
  for (const value of [material?.symbol, material?.name]) {
    const match = String(value || '').trim().match(/^(\d{3,4})$/);
    if (match) return match[1];
  }
  return '';
};

const extractDimension = (material) => {
  const normalized = String(material?.name || '').replace(/,/g, '.').replace(/[?*]/g, 'x');
  const matches = normalized.match(/\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?/gi) || [];
  if (!matches.length) return '';
  return matches
    .map(value => value.replace(/\s+/g, '').toLowerCase())
    .sort((a, b) => a.length - b.length)[0];
};

const normalizeProductCode = (value) => {
  let normalized = normalizeKey(value).replace(/\s+/g, '');
  if (/^bl(?=\d)/.test(normalized)) normalized = normalized.slice(2);
  if (/^70t\d+tl$/.test(normalized)) normalized = normalized.slice(0, -2);
  return normalized;
};

const extractProductCode = (material) => {
  const symbol = normalizeProductCode(material?.symbol);
  if (symbol && /[a-z]/.test(symbol) && /\d/.test(symbol)) return symbol;

  const name = String(material?.name || '').toUpperCase();
  const embedded = name.match(/\b(?:(?:HAF|BL)-[A-Z0-9.]+|\d{2}[A-Z]\d+(?:\.[A-Z0-9]+)?|\d{3}[A-Z]\d+|\d{3}\.\d+)\b/);
  return embedded ? normalizeProductCode(embedded[0]) : '';
};
const buildIdentityContext = (materials) => {
  const exactNameCounts = new Map();
  const explicitBoardCodes = new Map();
  const absDimensions = new Map();

  materials.forEach((material) => {
    const kind = getMaterialKind(material);
    const exactName = `${kind.key}|${normalizeKey(material?.name || material?.symbol || material?.id)}`;
    exactNameCounts.set(exactName, (exactNameCounts.get(exactName) || 0) + 1);

    const code = extractDecorCode(material);
    if (kind.key === 'board' && code) {
      const digits = code.match(/\d{3,4}$/)?.[0];
      if (digits) {
        const counts = explicitBoardCodes.get(digits) || new Map();
        counts.set(code, (counts.get(code) || 0) + 1);
        explicitBoardCodes.set(digits, counts);
      }
    }
    if (kind.key === 'abs' && code) {
      const dimension = extractDimension(material);
      if (dimension) {
        const dimensions = absDimensions.get(code) || new Set();
        dimensions.add(dimension);
        absDimensions.set(code, dimensions);
      }
    }
  });

  return { exactNameCounts, explicitBoardCodes, absDimensions };
};

const dominantBoardCode = (material, context) => {
  const digits = getBareNumericCode(material);
  const candidates = digits ? context.explicitBoardCodes.get(digits) : null;
  if (!candidates?.size) return '';
  const ranked = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1]);
  return ranked.length === 1 || ranked[0][1] > ranked[1][1] ? ranked[0][0] : '';
};

const getMaterialIdentity = (material, context) => {
  const kind = getMaterialKind(material);
  const exactName = normalizeKey(material?.name || material?.symbol || material?.id);
  const code = extractDecorCode(material);

  if (kind.key === 'board') {
    const boardCode = code || dominantBoardCode(material, context);
    return { key: boardCode ? `board|${boardCode}` : `board|name|${exactName}`, kind, code: boardCode };
  }

  if (kind.key === 'abs') {
    let dimension = extractDimension(material);
    const knownDimensions = code ? context.absDimensions.get(code) : null;
    if (!dimension && knownDimensions?.size === 1) dimension = Array.from(knownDimensions)[0];
    return {
      key: code ? `abs|${code}|${dimension || 'unknown'}` : `abs|name|${exactName}`,
      kind,
      code,
      dimension,
    };
  }

  if (kind.key === 'laminate') {
    const dimension = extractDimension(material);
    return {
      key: code ? `laminate|${code}|${dimension || exactName}` : `laminate|name|${exactName}`,
      kind,
      code,
      dimension,
    };
  }

  const exactNameKey = `${kind.key}|${exactName}`;
  if ((context.exactNameCounts.get(exactNameKey) || 0) > 1) {
    return { key: `${kind.key}|name|${exactName}`, kind, code: '' };
  }

  const productCode = extractProductCode(material);
  return {
    key: productCode ? `${kind.key}|symbol|${productCode}` : `${kind.key}|name|${exactName}`,
    kind,
    code: productCode,
  };
};

export const materialMatchesQuery = (material, query) => {
  const normalizedQuery = normalizeMaterialText(query);
  if (!normalizedQuery) return true;
  return [material?.name, material?.symbol, material?.category, material?.supplier]
    .some(value => normalizeMaterialText(value).includes(normalizedQuery));
};

export const groupMaterialsForPicker = (materials = []) => {
  const context = buildIdentityContext(materials);
  const groups = new Map();

  materials.forEach((material) => {
    const identity = getMaterialIdentity(material, context);
    const existing = groups.get(identity.key);
    if (existing) {
      existing.offers.push(material);
      return;
    }

    const suffix = identity.dimension ? ` · ${identity.dimension.replace(/x/g, '×')}` : '';
    groups.set(identity.key, {
      key: identity.key,
      kind: identity.kind.key,
      kindLabel: identity.kind.label,
      code: identity.code,
      label: identity.code
        ? `${identity.kind.label} · ${identity.code.toUpperCase()}${suffix}`
        : String(material?.name || material?.symbol || 'Materiał'),
      offers: [material],
    });
  });

  return Array.from(groups.values());
};

export const findEquivalentMaterial = (materials = [], candidate) => {
  const contextMaterials = [...materials, candidate];
  const context = buildIdentityContext(contextMaterials);
  const candidateKey = getMaterialIdentity(candidate, context).key;
  return materials.find(material => getMaterialIdentity(material, context).key === candidateKey) || null;
};
