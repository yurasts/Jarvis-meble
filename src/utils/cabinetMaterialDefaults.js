const normalizeText = (value) => String(value || '')
  .toLocaleLowerCase('pl')
  .replaceAll('×', 'x');

const includesAll = (value, parts) => {
  const text = normalizeText(value);
  return parts.every(part => text.includes(part));
};

const inSymbol = (...parts) => (item) => includesAll(item?.symbol, parts);
const inCatalogueText = (...parts) => (item) => (
  includesAll(`${item?.name || ''} ${item?.symbol || ''}`, parts)
);

// Each role has ordered tiers: a stable manufacturer/decor symbol always wins over a textual
// fallback. This matters after articles such as 71B3550 move out of name into symbol.
const ROLE_DEFAULT_MATCHERS = {
  bodyMaterial: [
    inSymbol('w960'),
    inCatalogueText('w960', 'biały'),
    inCatalogueText('w960', 'bialy'),
  ],
  edgeMaterialBody: [
    inSymbol('abs', 'w960'),
    inCatalogueText('w960', '23x0,8'),
    inCatalogueText('w960', '23x0.8'),
  ],
  hinge: [
    (item) => normalizeText(item?.symbol).trim() === '71b3550',
    (item) => normalizeText(item?.symbol).trim() === '71t3550',
    inCatalogueText('71b3550'),
    inCatalogueText('71t3550'),
  ],
  legFront: [
    inCatalogueText('nóżka meblowa cokołowa', 'standardowa'),
    inCatalogueText('nogi zwykłe'),
  ],
  legRearAxilo: [
    inSymbol('axilo', 'h-100'),
    inCatalogueText('axilo', 'h=100'),
    inCatalogueText('axilo', 'h-100'),
  ],
  hdfMaterial: [inCatalogueText('hdf')],
  hangerMaterial: [
    inSymbol('camar 807'),
    inCatalogueText('camar 807'),
    inSymbol('camar 806'),
    inCatalogueText('camar 806'),
  ],
  tipOnMaterial: [
    (item) => normalizeText(item?.symbol).trim() === '956a1004',
    inCatalogueText('956a1004'),
    inCatalogueText('tip-on', 'długi', 'magnes'),
    inCatalogueText('tip-on', 'długa', 'magnes'),
  ],
};

export const findCabinetDefaultMaterial = (items, role) => {
  const matchers = ROLE_DEFAULT_MATCHERS[role];
  if (!matchers) return null;

  for (const matcher of matchers) {
    const match = (items || []).find(matcher);
    if (match) return match;
  }
  return null;
};
