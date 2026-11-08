const searchableText = (item) => `${item?.name || ''} ${item?.symbol || ''}`
  .toLocaleLowerCase('pl')
  .replaceAll('×', 'x');

const includesAll = (...parts) => (item) => {
  const text = searchableText(item);
  return parts.every(part => text.includes(part));
};

const matchesAny = (...matchers) => (item) => matchers.some(matcher => matcher(item));

// Kolejność matcherów jest celowa: najpierw stabilny kod producenta/dekoru, a dopiero potem
// zgodność ze starszą nazwą. Dzięki temu literackie nazwy katalogowe nie zmieniają domyślnego
// wyposażenia kalkulatora, ale stare fixture'y i projekty pozostają obsługiwane.
const ROLE_DEFAULT_MATCHERS = {
  bodyMaterial: matchesAny(
    includesAll('w960', 'biały'),
    includesAll('w960', 'bialy'),
  ),
  edgeMaterialBody: matchesAny(
    includesAll('w960', '23x0,8'),
    includesAll('w960', '23x0.8'),
  ),
  hinge: includesAll('71b3550'),
  legFront: matchesAny(
    includesAll('nóżka meblowa cokołowa', 'standardowa'),
    includesAll('nogi zwykłe'),
  ),
  legRearAxilo: matchesAny(
    includesAll('axilo', 'h=100'),
    includesAll('axilo', 'h-100'),
  ),
  hdfMaterial: includesAll('hdf'),
  hangerMaterial: includesAll('camar 806'),
  tipOnMaterial: matchesAny(
    includesAll('956a1004'),
    includesAll('tip-on', 'długa', 'magnes'),
  ),
};

export const findCabinetDefaultMaterial = (items, role) => {
  const matcher = ROLE_DEFAULT_MATCHERS[role];
  return matcher ? (items || []).find(matcher) || null : null;
};
