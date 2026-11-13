// Etap J, krok 2/3 — proste, konturowe ikony SVG (viewBox 36x36, stroke=currentColor) zastępują
// emoji na kafelkach "+ Dodaj moduł" i w nagłówku karty dodanej szafki. Nie są to realistyczne
// rysunki techniczne — tylko czytelne, schematyczne sylwetki (drzwi/szuflady/piekarnik/zlew/...),
// wystarczające do rozpoznania typu modułu w 36px. Wspólny `Shell` rysuje zewnętrzny kontur
// korpusu, żeby wszystkie ikony miały spójną grubość linii/zaokrąglenie rogów.
const STROKE = 1.6;

const Svg = ({ children, className }) => (
  <svg viewBox="0 0 36 36" width="100%" height="100%" className={className} aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);

export const IconDoors = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="23" y1="15" x2="23" y2="21" />
  </Svg>
);

export const IconDrawers = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="6" y1="13" x2="30" y2="13" />
    <line x1="6" y1="22" x2="30" y2="22" />
    <line x1="14" y1="8.5" x2="22" y2="8.5" />
    <line x1="14" y1="17.5" x2="22" y2="17.5" />
    <line x1="14" y1="26.5" x2="22" y2="26.5" />
  </Svg>
);

export const IconOven = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <circle cx="18" cy="14" r="6.5" />
    <circle cx="18" cy="14" r="3.5" />
    <line x1="6" y1="25" x2="30" y2="25" />
    <line x1="14" y1="29" x2="22" y2="29" />
  </Svg>
);

export const IconSink = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="11" width="24" height="21" rx="1.5" />
    <ellipse cx="18" cy="10" rx="10" ry="2.6" />
    <path d="M14 10 V5.5 Q14 4 16 4 H19" />
  </Svg>
);

export const IconDishwasher = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="9" y1="9.5" x2="27" y2="9.5" />
    <rect x="9" y="13" width="18" height="15" rx="1" />
    <line x1="15" y1="16" x2="21" y2="16" />
  </Svg>
);

export const IconCorner = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="16" y1="4" x2="16" y2="32" />
    <line x1="9" y1="8" x2="13" y2="12" />
    <line x1="9" y1="14" x2="13" y2="18" />
    <line x1="9" y1="20" x2="13" y2="24" />
    <line x1="9" y1="26" x2="13" y2="30" />
    <line x1="23" y1="14" x2="23" y2="20" />
  </Svg>
);

export const IconWallDoors = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="11" width="24" height="16" rx="1.5" />
    <line x1="23" y1="16" x2="23" y2="22" />
  </Svg>
);

export const IconHood = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="15" width="24" height="12" rx="1.5" />
    <path d="M12 10 L18 5 L24 10" />
    <line x1="23" y1="18" x2="23" y2="24" />
  </Svg>
);

export const IconFlapUp = ({ className }) => (
  <Svg className={className}>
    <rect x="8" y="16" width="20" height="10" rx="1.5" />
    <path d="M8 16 L4 6 L24 6" />
  </Svg>
);

export const IconFlapOnPillar = ({ className }) => (
  <Svg className={className}>
    <rect x="8" y="18" width="20" height="9" rx="1.5" />
    <path d="M8 18 L5 9 L23 9" />
    <line x1="4" y1="31" x2="32" y2="31" />
  </Svg>
);

export const IconPillarShelves = ({ className }) => (
  <Svg className={className}>
    <rect x="11" y="2" width="14" height="32" rx="1.5" />
    <line x1="11" y1="11" x2="25" y2="11" />
    <line x1="11" y1="19" x2="25" y2="19" />
    <line x1="11" y1="27" x2="25" y2="27" />
    <line x1="22" y1="14" x2="22" y2="16" />
  </Svg>
);

export const IconPillarDrawers = ({ className }) => (
  <Svg className={className}>
    <rect x="11" y="2" width="14" height="32" rx="1.5" />
    <line x1="11" y1="10" x2="25" y2="10" />
    <line x1="11" y1="18" x2="25" y2="18" />
    <line x1="11" y1="26" x2="25" y2="26" />
    <line x1="15" y1="6" x2="21" y2="6" />
    <line x1="15" y1="14" x2="21" y2="14" />
    <line x1="15" y1="22" x2="21" y2="22" />
    <line x1="15" y1="30" x2="21" y2="30" />
  </Svg>
);

// Etap V, krok 2 — "Pod lodówkę": linia podziału frontów na wysokości dolnych szafek (dolny front
// węższy — "morozilka" w jednej linii z sąsiadami, górny wyższy — lodówka) + pikowany kontur
// urządzenia wewnątrz górnej komory.
export const IconFridge = ({ className }) => (
  <Svg className={className}>
    <rect x="9" y="2" width="18" height="32" rx="1.5" />
    <line x1="9" y1="24" x2="27" y2="24" />
    <rect x="12" y="5" width="12" height="16" strokeDasharray="2 2" />
    <line x1="22" y1="9" x2="22" y2="14" />
    <line x1="22" y1="27" x2="22" y2="31" />
  </Svg>
);

export const IconCountertop = ({ className }) => (
  <Svg className={className}>
    <rect x="4" y="15" width="28" height="6" rx="1" />
    <line x1="4" y1="21" x2="4" y2="25" />
    <line x1="32" y1="21" x2="32" y2="25" />
  </Svg>
);

export const IconVanityDrawers = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="13" width="24" height="19" rx="1.5" />
    <ellipse cx="18" cy="12" rx="10" ry="2.6" />
    <line x1="6" y1="22.5" x2="30" y2="22.5" />
    <line x1="14" y1="17.5" x2="22" y2="17.5" />
    <line x1="14" y1="27" x2="22" y2="27" />
  </Svg>
);

export const IconRod = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="10" y1="10" x2="26" y2="10" />
    <line x1="23" y1="18" x2="23" y2="24" />
  </Svg>
);

export const IconOpenShelf = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="4" width="24" height="28" rx="1.5" />
    <line x1="6" y1="12" x2="30" y2="12" />
    <line x1="6" y1="20" x2="30" y2="20" />
    <line x1="6" y1="28" x2="30" y2="28" />
  </Svg>
);

// Etap Q, krok 2 — blendy/cokół jako zwykłe moduły dostają własne, odrębne od "szafki" glify: wąska
// pionowa/pozioma listwa, bez drzwi/szuflad/półek w ogóle (to tylko płaska formatka płyty).
export const IconSideFiller = ({ className }) => (
  <Svg className={className}>
    <rect x="14" y="4" width="8" height="28" rx="1" />
    <line x1="18" y1="4" x2="18" y2="32" />
  </Svg>
);

export const IconTopFiller = ({ className }) => (
  <Svg className={className}>
    <rect x="4" y="6" width="28" height="8" rx="1" />
    <line x1="4" y1="18" x2="32" y2="18" strokeDasharray="2 2.5" />
  </Svg>
);

export const IconPlinth = ({ className }) => (
  <Svg className={className}>
    <line x1="4" y1="18" x2="32" y2="18" strokeDasharray="2 2.5" />
    <rect x="4" y="24" width="28" height="7" rx="1" />
  </Svg>
);

// Rejestr slug -> komponent (moduł-prywatny — react-refresh wymaga, żeby plik eksportujący
// komponenty nie eksportował też zwykłych stałych; CABINET_MODULE_TYPE_ICON, dla którego to by
// było potrzebne, mieszka w utils/cabinetCalculator.js). Jedyny eksport "nie-komponentowy" stąd
// to nie byłby potrzebny, bo wszystko inne woła przez <CabinetModuleIcon slug=.../>.
const MODULE_ICONS = {
  doors: IconDoors,
  drawers: IconDrawers,
  oven: IconOven,
  sink: IconSink,
  dishwasher: IconDishwasher,
  corner: IconCorner,
  wallDoors: IconWallDoors,
  hood: IconHood,
  flapUp: IconFlapUp,
  flapOnPillar: IconFlapOnPillar,
  pillarShelves: IconPillarShelves,
  pillarDrawers: IconPillarDrawers,
  fridge: IconFridge,
  countertop: IconCountertop,
  vanityDrawers: IconVanityDrawers,
  rod: IconRod,
  openShelf: IconOpenShelf,
  sideFiller: IconSideFiller,
  topFiller: IconTopFiller,
  plinth: IconPlinth,
};

// Etap J, krok 2/3 — jedyny publiczny sposób narysowania ikony modułu: kafelek "+ Dodaj moduł"
// (36px) i miniatura w nagłówku dodanej karty (mniejsza) wołają to samo, różnym `className`.
export const CabinetModuleIcon = ({ slug, className }) => {
  const Icon = MODULE_ICONS[slug] || IconDoors;
  return <Icon className={className} />;
};
