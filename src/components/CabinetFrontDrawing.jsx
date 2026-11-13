// Etap N, krok 3 — jeden, współdzielony rysunek proporcjonalny frontu szafki (SVG, jednostki = mm),
// używany DWUKROTNIE: w pełnej skali wewnątrz WallElevationCanvas i w miniaturze na kafelkach
// "+ Dodaj moduł" (patrz CabinetCalculator.jsx) — oba miejsca rysują TĘ SAMĄ logikę (podział na
// drzwi/szuflady, kreskowane półki, schematy piekarnika/zlewu/zmywarki), tylko w innej skali.
// Renderuje goły fragment <g> (nie własny <svg>) — rodzic decyduje o viewBox/skali.
export default function CabinetFrontDrawing({
  x = 0,
  y = 0,
  width,
  height,
  type,
  doors = 0,
  shelves = 0,
  externalDrawersHigh = 0,
  externalDrawersLow = 0,
  frontWidth,
  // Etap V, krok 2 — "Pod lodówkę" (fridge_tall_cabinet): linia podziału 2 NIERÓWNYCH frontów siedzi
  // na `bottomHeightMm` (od dołu, w jednej linii z górą sąsiednich Dolnych), a `fridgeNicheHeightMm`
  // rysuje pikowany kontur samego urządzenia wewnątrz (informacyjny, nie realna formatka).
  bottomHeightMm,
  fridgeNicheHeightMm,
  showLabel = true,
  labelText,
  labelFontSize,
  // Etap R, krok 1 — kafelki "+ Dodaj moduł" są BARDZO małe (viewBox = wymiary szafki w mm,
  // skurczone do ~44×36 CSS px) — domyślna, mm-proporcjonalna grubość linii (poniżej) tam wychodziła
  // grubości ułamka piksela, praktycznie niewidoczna. `strokeWidthPx`, gdy podane, narzuca STAŁĄ
  // grubość w px EKRANU (przez `vector-effect="non-scaling-stroke"`, niezależnie od skali viewBoxu)
  // — tylko dla wołającego, który to poda (kafelki); WallElevationCanvas w pełnej skali nie przekazuje
  // tego propa i zachowuje dawną, mm-proporcjonalną grubość (tam skala jest już liczona osobno, przez
  // `px()`/getScreenCTM w WallElevationCanvas.jsx).
  strokeWidthPx,
}) {
  const W = Math.max(1, Number(width) || 0);
  const H = Math.max(1, Number(height) || 0);
  const useFixedStroke = strokeWidthPx !== undefined;
  const strokeWidth = useFixedStroke ? strokeWidthPx : Math.max(0.6, Math.min(W, H) / 60);
  const thinStroke = useFixedStroke ? strokeWidthPx * 0.65 : strokeWidth * 0.55;
  const vectorEffect = useFixedStroke ? 'non-scaling-stroke' : undefined;
  const drawerCount = Math.max(0, Number(externalDrawersHigh) || 0) + Math.max(0, Number(externalDrawersLow) || 0);
  const isCountertop = type === 'countertop';

  const parts = [
    <rect key="frame" x={x} y={y} width={W} height={H} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />,
  ];

  if (!isCountertop && drawerCount > 0) {
    // Szuflady wysokie (E) dostają więcej wysokości pasma niż niskie (M) — proporcja 1.3:1,
    // tylko do wizualnego podziału frontu, nie do rzeczywistej geometrii (ta liczy się w jądrze).
    const weights = [
      ...Array.from({ length: Math.max(0, Number(externalDrawersHigh) || 0) }, () => 1.3),
      ...Array.from({ length: Math.max(0, Number(externalDrawersLow) || 0) }, () => 1),
    ];
    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
    let cursorY = y;
    weights.forEach((weight, index) => {
      const bandH = (H * weight) / totalWeight;
      if (index > 0) {
        parts.push(<line key={`dsep-${index}`} x1={x} y1={cursorY} x2={x + W} y2={cursorY} stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
      }
      parts.push(
        <line
          key={`dh-${index}`}
          x1={x + W * 0.3} y1={cursorY + bandH * 0.25}
          x2={x + W * 0.7} y2={cursorY + bandH * 0.25}
          stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect={vectorEffect}
        />,
      );
      cursorY += bandH;
    });
  } else if (!isCountertop && frontWidth) {
    // Narożna zaślepiona: widoczne drzwi tylko na `frontWidth`, reszta to głucha zaślepka korpusu
    // (zakreskowana ukośnie, konwencja rysunku technicznego).
    const blindWidth = Math.max(0, W - Number(frontWidth));
    if (blindWidth > 0) {
      parts.push(
        <line key="blind" x1={x} y1={y} x2={x + blindWidth} y2={y + H} stroke="currentColor" strokeWidth={thinStroke} strokeDasharray={`${Math.max(4, W / 20)} ${Math.max(2, W / 40)}`} vectorEffect={vectorEffect} />,
      );
      parts.push(<line key="blindsep" x1={x + blindWidth} y1={y} x2={x + blindWidth} y2={y + H} stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
    }
    const handleX = x + blindWidth + Number(frontWidth) * 0.85;
    parts.push(<line key="handle" x1={handleX} y1={y + H * 0.2} x2={handleX} y2={y + H * 0.8} stroke="currentColor" strokeWidth={strokeWidth * 1.4} strokeLinecap="round" vectorEffect={vectorEffect} />);
  } else if (!isCountertop && doors > 0) {
    const doorW = W / doors;
    for (let i = 1; i < doors; i += 1) {
      parts.push(<line key={`dsep-${i}`} x1={x + doorW * i} y1={y} x2={x + doorW * i} y2={y + H} stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
    }
    for (let i = 0; i < doors; i += 1) {
      const handleX = i % 2 === 0 ? x + doorW * i + doorW * 0.85 : x + doorW * i + doorW * 0.15;
      parts.push(<line key={`handle-${i}`} x1={handleX} y1={y + H * 0.15} x2={handleX} y2={y + H * 0.4} stroke="currentColor" strokeWidth={strokeWidth * 1.4} strokeLinecap="round" vectorEffect={vectorEffect} />);
    }
  }

  if (!isCountertop && shelves > 0 && type !== 'fridge_tall_cabinet') {
    for (let i = 1; i <= shelves; i += 1) {
      const shelfY = y + (H * i) / (shelves + 1);
      parts.push(
        <line
          key={`shelf-${i}`}
          x1={x + W * 0.05} y1={shelfY} x2={x + W * 0.95} y2={shelfY}
          stroke="currentColor" strokeWidth={thinStroke} strokeDasharray={`${Math.max(4, W / 15)} ${Math.max(2, W / 30)}`} vectorEffect={vectorEffect}
        />,
      );
    }
  }

  if (type === 'oven_cabinet') {
    const ovenW = W * 0.6;
    const ovenH = H * 0.32;
    parts.push(<rect key="oven" x={x + (W - ovenW) / 2} y={y + H * 0.46} width={ovenW} height={ovenH} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
    parts.push(<line key="oven-window" x1={x + (W - ovenW) / 2} y1={y + H * 0.46 + ovenH * 0.32} x2={x + (W + ovenW) / 2} y2={y + H * 0.46 + ovenH * 0.32} stroke="currentColor" strokeWidth={thinStroke} vectorEffect={vectorEffect} />);
  } else if (type === 'sink_cabinet') {
    const sinkW = W * 0.55;
    const sinkH = H * 0.12;
    parts.push(<rect key="sink" x={x + (W - sinkW) / 2} y={y + H * 0.04} width={sinkW} height={sinkH} rx={sinkH * 0.3} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
  } else if (type === 'dishwasher_front') {
    parts.push(<line key="dw-slot" x1={x + W * 0.1} y1={y + H * 0.1} x2={x + W * 0.9} y2={y + H * 0.1} stroke="currentColor" strokeWidth={thinStroke} vectorEffect={vectorEffect} />);
  } else if (type === 'fridge_tall_cabinet') {
    // Podział na 2 NIERÓWNE fronty: dolny ("zamrażarka") wysokości bottomHeightMm — w JEDNEJ LINII
    // z górą sąsiednich Dolnych — górny ("lodówka" + stała półka nad nią) resztę wysokości korpusu.
    const bottomH = Math.max(1, Math.min(H - 1, Number(bottomHeightMm) || H * 0.37));
    const dividerY = y + H - bottomH;
    parts.push(<line key="fridge-divider" x1={x} y1={dividerY} x2={x + W} y2={dividerY} stroke="currentColor" strokeWidth={strokeWidth} vectorEffect={vectorEffect} />);
    // Pikowany kontur SAMEGO URZĄDZENIA (informacyjny — nie realna formatka płyty), wysokości
    // fridgeNicheHeightMm, od podłogi (dołu korpusu) w górę, lekko wcięty względem boków szafki.
    const nicheH = Math.max(1, Math.min(H - 2, Number(fridgeNicheHeightMm) || H * 0.85));
    const nicheInsetX = W * 0.06;
    const nicheW = Math.max(1, W - nicheInsetX * 2);
    parts.push(
      <rect
        key="fridge-niche" x={x + nicheInsetX} y={y + H - nicheH} width={nicheW} height={nicheH}
        fill="none" stroke="currentColor" strokeWidth={thinStroke}
        strokeDasharray={`${Math.max(4, W / 15)} ${Math.max(2, W / 30)}`} vectorEffect={vectorEffect}
      />,
    );
    parts.push(<line key="handle-upper" x1={x + W * 0.85} y1={y + (dividerY - y) * 0.15} x2={x + W * 0.85} y2={y + (dividerY - y) * 0.4} stroke="currentColor" strokeWidth={strokeWidth * 1.4} strokeLinecap="round" vectorEffect={vectorEffect} />);
    parts.push(<line key="handle-lower" x1={x + W * 0.85} y1={dividerY + bottomH * 0.3} x2={x + W * 0.85} y2={dividerY + bottomH * 0.7} stroke="currentColor" strokeWidth={strokeWidth * 1.4} strokeLinecap="round" vectorEffect={vectorEffect} />);
  }

  if (showLabel) {
    const text = labelText || `${Math.round(W)}×${Math.round(H)}`;
    // Etap P, krok 1 — `labelFontSize` (opcjonalny) pozwala WOŁAJĄCEMU (WallElevationCanvas, pełna
    // skala) narzucić STAŁY rozmiar w px (patrz makePxToMm), żeby podpis "600×838" zawsze wyszedł
    // czytelny na ekranie niezależnie od tego, ile mm ma ściana — bez tego propa (kafelki "+ Dodaj
    // moduł" w CabinetCalculator.jsx, każdy ma WŁASNY mały viewBox) zostaje dawna formuła mm-proporcjonalna.
    const resolvedFontSize = labelFontSize !== undefined ? labelFontSize : Math.max(7, Math.min(W, H) * 0.1);
    parts.push(
      <text key="label" x={x + Math.max(2, W * 0.03)} y={y + H - Math.max(2, H * 0.04)} fontSize={resolvedFontSize} fontWeight={600} fill="currentColor" opacity={0.85}>
        {text}
      </text>,
    );
  }

  return parts;
}
