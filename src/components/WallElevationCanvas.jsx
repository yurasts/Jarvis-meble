import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import CabinetFrontDrawing from './CabinetFrontDrawing';
import { computeCornerDepthMm, layoutCountertopSegments, layoutFloorBand, layoutUpperRow } from '../utils/cabinetCalculator';
import s from './WallElevationCanvas.module.css';

// Etap P, krok 1 — podpisy na rysunku muszą być czytelne na EKRANIE (px), niezależnie od tego, ile
// milimetrów ściany mieści viewBox. NIE wolno liczyć skali z samej szerokości BOXA <svg> (CSS
// width:100%) podzielonej przez viewBoxWidth — `.canvasSvg` ma `height:auto; max-height:520px`, a
// `preserveAspectRatio="meet"` przy wysokim/kwadratowym viewBox (duże marginesy na linie wymiarowe)
// dociska skalę do WYSOKOŚCI, nie szerokości, więc content renderuje się WĘŻSZY niż cały box — taki
// policzony mmPerPx wychodził za mały, podpisy wciąż mikroskopijne mimo "stałych 14px". Jedyne
// poprawne źródło realnej skali to `getScreenCTM()` (dokładnie ta transformacja, której przeglądarka
// faktycznie użyła do narysowania viewBoxu na ekranie).
const DEFAULT_SCREEN_SCALE = 0.32; // rozsądne domyślne (px na 1 jednostkę viewBox=mm), zanim zmierzymy CTM
const useScreenScale = (ref) => {
  const [scale, setScale] = useState(DEFAULT_SCREEN_SCALE);
  useLayoutEffect(() => {
    const el = ref.current;
    const measure = () => {
      const ctm = el?.getScreenCTM?.();
      if (!ctm) return;
      const measured = Math.hypot(ctm.a, ctm.b);
      if (measured > 0) setScale(current => (Math.abs(current - measured) > 0.001 ? measured : current));
    };
    measure();
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // Bez tablicy zależności celowo (patrz niżej) — ResizeObserver łapie zmiany rozmiaru KONTENERA
    // bez renderu Reacta (np. zwinięcie panelu bocznego aplikacji); zmiany samego viewBoxu (dodanie
    // szafki, inny widok...) i tak wywołują nowy render tego komponentu, co re-uruchamia ten efekt.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return scale;
};
// `px(14)` -> rozmiar fonta w jednostkach viewBox (mm), który na ekranie wyjdzie jako ~14 realnych
// pikseli, niezależnie od aktualnej skali tego konkretnego widoku (elewacja/przekrój/rzut mają
// zupełnie inne viewBoxy, każdy woła makePxToMm z WŁASNĄ parą viewBoxWidth/screenScale).
const makePxToMm = (screenScale) => (desiredPx) => Math.max(0.1, desiredPx / Math.max(0.001, screenScale));

// Etap N, krok 3 — rysunek 2D elewacji ściany kuchennej, 1:1 w milimetrach (viewBox SVG = jednostki
// mm, bez żadnego ręcznego przeliczania skali). 4 "rzędy" (grupy BOARD_GROUPS kuchni) mają stałą
// kotwicę wysokości, z której liczy się każdy moduł (patrz ANCHORS niżej) — pozycja X w rzędzie to
// suma szerokości poprzednich modułów TEJ SAMEJ grupy, w kolejności z `modules` (ta sama kolejność,
// którą przestawia reorderItems/reorderModuleInGroup w CabinetCalculator.jsx).
const ANCHORS = {
  // 'bottom' — dolna krawędź modułu siedzi na kotwicy, moduł rośnie W GÓRĘ o swoje H.
  // 'top' — górna krawędź modułu siedzi na kotwicy, moduł rośnie W DÓŁ o swoje H.
  kitchen_bottom: { type: 'bottom', mmFromFloor: heights => heights.legHeight },
  kitchen_tall: { type: 'bottom', mmFromFloor: heights => heights.legHeight },
  // Etap U, krok 3 — Dolne+Słupki stoją w JEDNYM wspólnym rzędzie (patrz layoutFloorBand w jądrze);
  // kotwica rzędu jest identyczna z obiema grupami z osobna (ta sama formuła), więc to tylko ALIAS
  // używany przy rysowaniu/drag&drop CAŁEGO rzędu (ROW_GROUPS/bandFor niżej), nie osobna wysokość.
  kitchen_floor: { type: 'bottom', mmFromFloor: heights => heights.legHeight },
  kitchen_top: { type: 'bottom', mmFromFloor: heights => heights.countertopHeight + heights.backsplashHeight },
  kitchen_mezzanine: { type: 'top', mmFromFloor: heights => heights.ceilingHeight - heights.ceilingGap },
};
const ROW_GROUPS = ['kitchen_floor', 'kitchen_top', 'kitchen_mezzanine'];
const ROW_LABELS = {
  kitchen_bottom: 'szafki dolne', kitchen_tall: 'słupki', kitchen_top: 'szafki górne', kitchen_mezzanine: 'antresola',
};
// Etap AD, krok 2 — przyciski widoku zależą od tego, KTÓRA druga ściana istnieje: 'corner_l' (bez
// zmian, wartość 'y'), 'corner_l_right' (TA SAMA etykieta "Widok Y", ale pod wartością 'y2' — jedyna
// druga ściana, więc nie trzeba jej numerować), 'u_layout' (OBIE naraz, osobno ponumerowane Y1/Y2).
const viewOptionsFor = (hasWallY, hasWallY2) => {
  const options = [{ value: 'x', label: '📐 Widok X (Przód)' }];
  if (hasWallY && hasWallY2) {
    options.push({ value: 'y', label: '📐 Widok Y1 (Bok, lewa ściana)' });
    options.push({ value: 'y2', label: '📐 Widok Y2 (Bok, prawa ściana)' });
  } else if (hasWallY2) {
    options.push({ value: 'y2', label: '📐 Widok Y (Bok / Druga ściana)' });
  } else {
    options.push({ value: 'y', label: '📐 Widok Y (Bok / Druga ściana)' });
  }
  options.push({ value: 'top', label: '🗺️ Widok z góry (Rzut / Głębokości)' });
  return options;
};

const moduleWidthMm = (module) => Math.max(0, Number(module?.W) || 0);
const moduleHeightMm = (module) => Math.max(0, Number(module?.H) || 0);
const moduleDepthMm = (module) => Math.max(0, Number(module?.D) || 0);

// Punkt kliencki (clientX/clientY) -> współrzędne użytkownika SVG (mm) — jedyne bezpieczne
// przeliczenie niezależne od tego, jak bardzo przeglądarka przeskalowała/przesunęła rysunek. jsdom
// (testy komponentowe) nie liczy geometrii SVG — getScreenCTM() wraca null, więc wołający MUSI
// sam ochronić się przed `null` (patrz pointerToUserSpace -> null poniżej).
const pointerToUserSpace = (svgEl, clientX, clientY) => {
  if (!svgEl || typeof svgEl.createSVGPoint !== 'function') return null;
  const ctm = svgEl.getScreenCTM?.();
  if (!ctm) return null;
  const point = svgEl.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
};

// --- Etap O, krok 2 — architektoniczne linie wymiarowe (strzałki + zasieczki, jak w PRO100/CAD) ---
// Etap P, krok 1 — `fontSize` to teraz ZAWSZE wynik `px(...)` (patrz makePxToMm) — stały rozmiar na
// ekranie; grubsza czcionka (font-weight 600) dla czytelności na jasnym tle.
// Etap Q, krok 3 — ISO/ЕСКД: linia wymiarowa niesie TYLKO liczbę (bez słów/jednostki), a cyfra siedzi
// ściśle NAD linią (poziome) albo PRZY linii, obrócona -90° (pionowe) — `gapMm` to stały, w px ekranu
// wyrażony odstęp cyfry od linii (patrz makePxToMm), nie ułamek fontSize (ten dawał niestabilny,
// zależny-od-skali odstęp, który dla dużych ścian/sufitów bywał za mały i obcinał górną liczbę).
const Arrowhead = ({ x, y, angleDeg, size }) => (
  <polygon points={`0,0 ${-size},${-size * 0.4} ${-size},${size * 0.4}`} transform={`translate(${x} ${y}) rotate(${angleDeg})`} />
);
const HorizontalDimension = ({ x1, x2, y, label, fontSize, gapMm, className }) => {
  const tick = fontSize * 0.5;
  const arrow = fontSize * 0.45;
  const gap = gapMm ?? fontSize * 0.3;
  return (
    <g className={className}>
      <line x1={x1} y1={y} x2={x2} y2={y} strokeWidth={Math.max(1, fontSize * 0.08)} />
      <Arrowhead x={x1} y={y} angleDeg={180} size={arrow} />
      <Arrowhead x={x2} y={y} angleDeg={0} size={arrow} />
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} strokeWidth={Math.max(1, fontSize * 0.05)} />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} strokeWidth={Math.max(1, fontSize * 0.05)} />
      <text x={(x1 + x2) / 2} y={y - gap} textAnchor="middle" fontSize={fontSize} fontWeight={600} stroke="none">{label}</text>
    </g>
  );
};
const VerticalDimension = ({ y1, y2, x, label, fontSize, gapMm, className }) => {
  const tick = fontSize * 0.5;
  const arrow = fontSize * 0.45;
  const gap = gapMm ?? fontSize * 0.3;
  const midY = (y1 + y2) / 2;
  const textX = x - gap;
  return (
    <g className={className}>
      <line x1={x} y1={y1} x2={x} y2={y2} strokeWidth={Math.max(1, fontSize * 0.08)} />
      <Arrowhead x={x} y={y1} angleDeg={-90} size={arrow} />
      <Arrowhead x={x} y={y2} angleDeg={90} size={arrow} />
      <line x1={x - tick} y1={y1} x2={x + tick} y2={y1} strokeWidth={Math.max(1, fontSize * 0.05)} />
      <line x1={x - tick} y1={y2} x2={x + tick} y2={y2} strokeWidth={Math.max(1, fontSize * 0.05)} />
      {/* Cyfra obrócona -90° (czyta się od dołu do góry, jak w ЕСКД) wokół WŁASNEGO środka — stąd
          textAnchor/dominantBaseline "middle": środek tekstu po obrocie zostaje dokładnie w (textX, midY). */}
      <text
        x={textX} y={midY} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={600} stroke="none"
        transform={`rotate(-90 ${textX} ${midY})`}
      >
        {label}
      </text>
    </g>
  );
};
// Etap P, krok 1 — plakietka z nieprzezroczystym tłem ("Wolne: ... mm" / "Przekroczono o ... mm!"),
// żeby tekst nigdy nie "ginął" na tle linii rysunku szafek ani nie nakładał się na inne podpisy —
// szerokość liczona z długości tekstu (SVG nie daje realnego pomiaru tekstu bez layoutu przeglądarki).
const Badge = ({ x, y, text, fontSize, className }) => {
  const paddingX = fontSize * 0.7;
  const width = text.length * fontSize * 0.58 + paddingX * 2;
  const height = fontSize * 1.9;
  return (
    <g>
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height * 0.22} className={className} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={700} fill="#fff" stroke="none">{text}</text>
    </g>
  );
};

export default function WallElevationCanvas({
  modules, heights, selectedModuleId, hoveredModuleId, onSelectModule, onHoverModule, onReorder, onDropPreset,
  roomLayout = 'simple', view = 'x', onViewChange, pillars = [],
  onAddPillar, onPatchPillar,
  zeroPoints = { X: 'left', Y: 'left', Y2: 'left' }, installationPoints = [],
  onAddInstallationPoint,
  pillarPanelRows, zeroPointSelectors, installationPanelRows,
}) {
  const svgRef = useRef(null);
  const [dragState, setDragState] = useState(null); // { id, group, overIndex }
  const screenScale = useScreenScale(svgRef);
  // Etap AF, krok 2 — zgłoszenie: user nie mógł znaleźć, jak dodać szyb/punkt instalacji (ukryte
  // głęboko w "Wymiary ściany i wysokości") — 2 przyciski z bejdżem liczby TUŻ NAD rysunkiem, w
  // jednym rzędzie z przełącznikiem widoku, otwierają kompaktowy panel zamiast (albo obok) starej
  // sekcji. Tylko JEDEN panel na raz — otwarcie drugiego zamyka pierwszy (mniej bałaganu na ekranie).
  const [openQuickPanel, setOpenQuickPanel] = useState(null); // null | 'pillar' | 'install'
  // Etap AF, krok 2 — szyb kliknięty wprost na rysunku (Widok X/Y/Y2/z góry) otwiera panel
  // WYSTARTOWANY na TYM konkretnym słupie (przewinięty/podświetlony — patrz pillarFocusId niżej).
  const [pillarFocusId, setPillarFocusId] = useState(null);
  // Etap AF, krok 2 — przeciąganie słupa myszką wzdłuż ściany (tylko Widok X/Y/Y2 — tam oś poprzeczna
  // rysunku ZAWSZE jest długością ściany, niezależnie od tego, która to ściana).
  const [pillarDragState, setPillarDragState] = useState(null); // { pillarId, pointerId, moved }
  // Etap AF, krok 2 — kliknięcie słupa na rysunku otwiera panel i przewija do JEGO wiersza (lokalnie,
  // WEWNĄTRZ małego panelu — nie dotyka scrolla strony, patrz Etap AF krok 1 wyżej w tym pliku).
  const pillarPanelRef = useRef(null);
  useEffect(() => {
    if (!pillarFocusId || openQuickPanel !== 'pillar') return;
    pillarPanelRef.current?.querySelector?.(`[data-pillar-row="${pillarFocusId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [pillarFocusId, openQuickPanel]);
  const handlePillarClick = (pillarId) => {
    setOpenQuickPanel('pillar');
    setPillarFocusId(pillarId);
  };

  // Etap AD, krok 2 — 'corner_l' (Y z lewej), 'corner_l_right' (Y2 z prawej) i 'u_layout' (OBIE naraz)
  // — `hasWallY`/`hasWallY2` to JEDYNE miejsce, które wie, KTÓRA ściana istnieje w którym wariancie
  // (ta sama reguła co w CabinetCalculator.jsx).
  const hasWallY = roomLayout === 'corner_l' || roomLayout === 'u_layout';
  const hasWallY2 = roomLayout === 'corner_l_right' || roomLayout === 'u_layout';
  // Etap AF, krok 2 — "aktywna ściana" dla szybkiego dodania z przycisku nad rysunkiem — ta sama
  // formuła co `elevationWall` niżej (zdefiniowana później, bo zależy od gałęzi widoku), ale
  // potrzebna już TU, we wspólnym nagłówku renderowanym we WSZYSTKICH 3 gałęziach (łącznie z
  // Widokiem z góry, gdzie `elevationWall` w ogóle nie istnieje — stąd własna, niezależna kopia).
  const activeWallForQuickAdd = view === 'y' ? 'Y' : view === 'y2' ? 'Y2' : 'X';
  // Etap AD, krok 3 — "Szyb wentylacyjny / Słup": szafki na TEJ SAMEJ ścianie omijają jego odcinek
  // (patrz advancePastPillars w jądrze, wołane z layoutFloorBand/layoutUpperRow niżej).
  const pillarsForWall = (wall) => (pillars || []).filter(p => (p.wall === 'Y' || p.wall === 'Y2' ? p.wall : 'X') === wall);
  // Etap AD, krok 4 — punkty instalacji (gniazdka/LED/woda): "Odległość od punktu 0" liczy się od
  // rogu wybranego w `zeroPoints[wall]` ('left'/'right') — `installationPointAbsoluteXMm` zamienia
  // ją na ABSOLUTNĄ (zawsze-od-lewej) współrzędną, w TEJ SAMEJ przestrzeni co cabinet-y/słupy.
  const installationPointsForWall = (wall) => (installationPoints || []).filter(p => (
    (p.wall === 'Y' || p.wall === 'Y2' ? p.wall : 'X') === wall
  ));
  const installationPointAbsoluteXMm = (point, nominalWallWidthMmForWall) => {
    const distanceMm = Number(point.distanceMm) || 0;
    const side = zeroPoints?.[point.wall === 'Y' || point.wall === 'Y2' ? point.wall : 'X'] || 'left';
    return side === 'right' ? Math.max(0, nominalWallWidthMmForWall - distanceMm) : distanceMm;
  };
  const INSTALLATION_POINT_STYLE = {
    socket: { icon: '⚡', color: '#dc2626' },
    led: { icon: '💡', color: '#ea580c' },
    water: { icon: '💧', color: '#2563eb' },
  };
  const isTopView = view === 'top';
  // "Widok Y" dla PROSTEGO układu (1 ściana) nie ma żadnej drugiej ściany do pokazania — zamiast
  // tego pokazuje przekrój boczny (głębokości) TEJ SAMEJ ściany X.
  const isSideSection = view === 'y' && roomLayout === 'simple';
  const elevationWall = view === 'y' ? 'Y' : view === 'y2' ? 'Y2' : 'X';

  const ceilingHeight = Math.max(1, Number(heights.ceilingHeight) || 1);
  // `lineScaleMm` skaluje GRUBOŚCI linii/przerywań (geometria, nie tekst) proporcjonalnie do mm —
  // cienkie linie przy dużej skali są mniej krytyczne niż podpisy (zgłoszenie dotyczyło TEKSTU);
  // rzeczywisty rozmiar czcionek liczy `px(...)` niżej, osobno w każdym z 3 widoków (różne viewBoxy).
  const lineScaleMm = Math.max(28, ceilingHeight * 0.016);

  // Etap AF, krok 2 — WSPÓLNY nagłówek (przełącznik widoku + 2 przyciski szybkiego dostępu +
  // rozwijane panele) — IDENTYCZNY w all 3 gałęziach widoku (Widok z góry/przekrój boczny/elewacja),
  // więc żyje raz tutaj zamiast być powielony 3×. Panel sam w sobie nie wie NIC o samej geometrii
  // rysunku (tylko listy/CRUD) — bezpiecznie działa niezależnie od tego, która gałąź go wywołuje.
  const renderCanvasHeader = () => {
    if (!onViewChange) return null;
    const togglePanel = (key) => setOpenQuickPanel(current => (current === key ? null : key));
    return (
      <>
        <div className={s.canvasHeader}>
          {viewOptionsFor(hasWallY, hasWallY2).map(option => (
            <button key={option.value} type="button" className={s.viewButton} aria-pressed={view === option.value} onClick={() => onViewChange(option.value)}>
              {option.label}
            </button>
          ))}
          <div className={s.canvasHeaderActions}>
            <button
              type="button" className={s.quickAccessButton} aria-pressed={openQuickPanel === 'pillar'}
              onClick={() => togglePanel('pillar')}
            >
              🧱 + Szyb / Słup
              <span className={s.quickAccessBadge}>{pillars.length}</span>
            </button>
            <button
              type="button" className={s.quickAccessButton} aria-pressed={openQuickPanel === 'install'}
              onClick={() => togglePanel('install')}
            >
              🔌 Instalacje / Punkt 0
              <span className={s.quickAccessBadge}>{installationPoints.length}</span>
            </button>
          </div>
        </div>
        {openQuickPanel === 'pillar' && (
          <div className={s.quickPanel} data-testid="pillar-quick-panel" ref={pillarPanelRef}>
            <button
              type="button" className={s.quickPanelAddButton}
              onClick={() => onAddPillar?.(activeWallForQuickAdd)}
            >
              ➕ Dodaj 600×600 na ścianę {activeWallForQuickAdd}
            </button>
            {pillarPanelRows}
          </div>
        )}
        {openQuickPanel === 'install' && (
          <div className={s.quickPanel} data-testid="installation-quick-panel">
            {zeroPointSelectors}
            <button
              type="button" className={s.quickPanelAddButton}
              onClick={() => onAddInstallationPoint?.(activeWallForQuickAdd)}
            >
              ➕ Dodaj punkt instalacji na ścianę {activeWallForQuickAdd}
            </button>
            {installationPanelRows}
          </div>
        )}
      </>
    );
  };

  // ================================================================================================
  // WIDOK Z GÓRY (Rzut/Głębokości) — statyczny, bez drag&drop; ściana X pozioma, ściana Y pionowa
  // pod 90° w rogu (0,0). Każdy moduł rysuje się W PLANIE: szerokość wzdłuż ściany, GŁĘBOKOŚĆ
  // (Gł.) prostopadle — to jedyny widok, w którym `D` modułu w ogóle jest widoczne na rysunku.
  // ================================================================================================
  if (isTopView) {
    const wallXWidthMm = Math.max(1, Number(heights.wallWidthMm) || 1);
    const wallYWidthMm = hasWallY ? Math.max(1, Number(heights.wallYWidthMm) || 1) : 0;
    // Etap AD, krok 2 — ściana Y2 (prawa): TA SAMA logika co Y (lewa) niżej, tylko przyczepiona do
    // PRAWEGO końca ściany X (x = wallXWidthMm, głębokość "do wewnątrz" w stronę MALEJĄCEGO x — patrz
    // `renderPlanRect`'s `depthDir` niżej) i narożnik liczony od OSTATNIEGO (nie pierwszego) elementu
    // pasa podłogowego ściany X (`computeCornerDepthMm(..., 'right')`).
    const wallY2WidthMm = hasWallY2 ? Math.max(1, Number(heights.wallY2WidthMm) || 1) : 0;
    const depthFor = (module) => moduleDepthMm(module) || (module.group === 'kitchen_top' ? 320 : module.group === 'kitchen_mezzanine' ? 560 : 520);
    const countertopDepthMm = Math.max(1, Number(heights.countertopDepthMm) || 1);

    // Etap V, krok 1 — TA SAMA matematyka co Widok X/Y (layoutFloorBand/layoutUpperRow z jądra) —
    // Widok z góry MUSI pokazywać szafki na DOKŁADNIE tych samych X, inaczej dwa rysunki tego
    // samego projektu się rozjeżdżają (zgłoszenie: Górne rysowały się PO PRAWEJ za Dolnymi, bo
    // liczyły pozycję OSOBNĄ, niezależną kumulacją od zera, zamiast dzielić tę samą funkcję).
    // Etap AD, krok 3 — słupy/szyby ściany X omijane WPROST (ta ściana nie ma żadnego przesunięcia
    // narożnika) — wall Y/Y2 niżej dostają WŁASNY, przesunięty o -cornerDeductionMm komplet (patrz
    // yPillarsShifted/y2PillarsShifted), żeby unikanie działało na TYCH SAMYCH, absolutnych
    // współrzędnych co faktyczne rysowanie słupa (bez przesunięcia dwa razy albo wcale).
    const floorX = layoutFloorBand(modules, 'X', pillarsForWall('X'));
    // Etap X, krok 2 — narożnik: pierwsze `cornerDeductionMm` ściany Y jest fizycznie "pod"
    // GŁĘBOKOŚCIĄ tego, co REALNIE stoi w rogu ściany X (korpus, albo blat nad nim, jeśli głębszy —
    // patrz computeCornerDepthMm w jądrze; dawniej liczone na ślepo jako zawsze = głębokość blatu,
    // co dawało zły odcinek, gdy w rogu stał Słupek bez blatu nad sobą). Pas podłogowy ściany Y
    // (Dolne+Słupki) fizycznie NIE MOŻE zaczynać się od y=0 w tym wypadku — jego start przesuwa się
    // o `cornerDeductionMm` (startOffsetMm poniżej), więc jego prostokąty nigdy nie nakładają się na
    // prostokąt rogu ściany X (zgłoszenie: Screenshot_6.jpg, dwie szafki narysowane jedna na drugiej).
    const cornerDeductionMm = hasWallY ? computeCornerDepthMm(modules, countertopDepthMm, 'left') : 0;
    const cornerDeduction2Mm = hasWallY2 ? computeCornerDepthMm(modules, countertopDepthMm, 'right', wallXWidthMm) : 0;
    const yPillarsShifted = pillarsForWall('Y').map(p => ({ ...p, xMm: (Number(p.xMm) || 0) - cornerDeductionMm }));
    const y2PillarsShifted = pillarsForWall('Y2').map(p => ({ ...p, xMm: (Number(p.xMm) || 0) - cornerDeduction2Mm }));
    const floorYRaw = hasWallY ? layoutFloorBand(modules, 'Y', yPillarsShifted) : { entries: [], totalWidthMm: 0, leftTallOffsetMm: 0 };
    const floorY = cornerDeductionMm > 0
      ? {
        ...floorYRaw,
        entries: floorYRaw.entries.map(entry => ({ ...entry, xMm: entry.xMm + cornerDeductionMm })),
        totalWidthMm: floorYRaw.totalWidthMm + cornerDeductionMm,
      }
      : floorYRaw;
    const floorY2Raw = hasWallY2 ? layoutFloorBand(modules, 'Y2', y2PillarsShifted) : { entries: [], totalWidthMm: 0, leftTallOffsetMm: 0 };
    const floorY2 = cornerDeduction2Mm > 0
      ? {
        ...floorY2Raw,
        entries: floorY2Raw.entries.map(entry => ({ ...entry, xMm: entry.xMm + cornerDeduction2Mm })),
        totalWidthMm: floorY2Raw.totalWidthMm + cornerDeduction2Mm,
      }
      : floorY2Raw;
    const topXRaw = layoutUpperRow(modules, 'X', 'kitchen_top', floorX.leftTallOffsetMm, pillarsForWall('X'));
    const topYRaw = hasWallY ? layoutUpperRow(modules, 'Y', 'kitchen_top', floorY.leftTallOffsetMm, yPillarsShifted) : { entries: [], totalWidthMm: 0 };
    const topY2Raw = hasWallY2 ? layoutUpperRow(modules, 'Y2', 'kitchen_top', floorY2.leftTallOffsetMm, y2PillarsShifted) : { entries: [], totalWidthMm: 0 };
    const mezzanineXRaw = layoutUpperRow(modules, 'X', 'kitchen_mezzanine', 0, pillarsForWall('X'));
    const mezzanineYRaw = hasWallY ? layoutUpperRow(modules, 'Y', 'kitchen_mezzanine', 0, yPillarsShifted) : { entries: [], totalWidthMm: 0 };
    const mezzanineY2Raw = hasWallY2 ? layoutUpperRow(modules, 'Y2', 'kitchen_mezzanine', 0, y2PillarsShifted) : { entries: [], totalWidthMm: 0 };

    const withDepth = layout => layout.entries.map(entry => ({ ...entry, depthMm: depthFor(entry.module) }));
    const xLayout = withDepth(floorX);
    const yLayout = withDepth(floorY);
    const y2Layout = withDepth(floorY2);
    const xTopLayout = withDepth(topXRaw);
    const yTopLayout = withDepth(topYRaw);
    const y2TopLayout = withDepth(topY2Raw);
    const xMezzanineLayout = withDepth(mezzanineXRaw);
    const yMezzanineLayout = withDepth(mezzanineYRaw);
    const y2MezzanineLayout = withDepth(mezzanineY2Raw);
    const countertopSegmentsX = layoutCountertopSegments(floorX.entries);

    // Zajęta szerokość/długość ściany = NAJSZERSZY jarus (ten sam wniosek co computeWallFreeSpace),
    // nie tylko rząd podłogowy — Górne/Antresole mogą (teoretycznie) sięgać dalej niż Dolne+Słupki.
    const occupiedXMm = Math.max(floorX.totalWidthMm, topXRaw.totalWidthMm, mezzanineXRaw.totalWidthMm);
    const occupiedYMm = hasWallY ? Math.max(floorY.totalWidthMm, topYRaw.totalWidthMm, mezzanineYRaw.totalWidthMm) : 0;
    const occupiedY2Mm = hasWallY2 ? Math.max(floorY2.totalWidthMm, topY2Raw.totalWidthMm, mezzanineY2Raw.totalWidthMm) : 0;
    const wallExtentXMm = Math.max(wallXWidthMm, occupiedXMm, 1);
    const wallExtentYMm = hasWallY ? Math.max(wallYWidthMm, occupiedYMm, 1) : 0;
    const wallExtentY2Mm = hasWallY2 ? Math.max(wallY2WidthMm, occupiedY2Mm, 1) : 0;

    const maxDepthX = Math.max(countertopDepthMm, ...xLayout.map(e => e.depthMm), ...xTopLayout.map(e => e.depthMm), ...xMezzanineLayout.map(e => e.depthMm), 1);
    const maxDepthY = hasWallY ? Math.max(1, ...yLayout.map(e => e.depthMm), ...yTopLayout.map(e => e.depthMm), ...yMezzanineLayout.map(e => e.depthMm)) : 0;
    const maxDepthY2 = hasWallY2 ? Math.max(1, ...y2Layout.map(e => e.depthMm), ...y2TopLayout.map(e => e.depthMm), ...y2MezzanineLayout.map(e => e.depthMm)) : 0;
    // Narożnik: szafki ściany Y "wystają" w głąb na osi X (swoją głębokością), więc szerokość
    // całego planu musi uwzględnić i zajętą długość ściany X, I głębokość narożnika od ściany Y (Y2
    // "wystaje" w głąb od PRAWEGO końca — ten sam zapas, patrz depthDir w renderPlanRect).
    const planWidthMm = Math.max(wallExtentXMm, maxDepthY, maxDepthY2, 1);
    const planHeightMm = Math.max(maxDepthX, wallExtentYMm, wallExtentY2Mm, 1);
    const px = makePxToMm(screenScale);

    // Etap V, krok 2 — 3 jarusy na TYM SAMYM odcinku X (Górne Gł.320 / Dolne Gł.520 / Antresole
    // Gł.560) "zagnieżdżają się" (wszystkie zaczynają się od ściany, y=0, każdy sięga w głąb o
    // swoją głębokość) — ich PODPISY muszą więc siedzieć w swoim WYŁĄCZNYM pasie głębokości,
    // inaczej nachodzą jeden na drugi ("600×520" na "600×560"). Górne (najpłytsze) -> środek
    // SWOJEGO pełnego pasa (0..320); Dolne -> środek pasa 320..520 (jedyny fragment NIEpokryty
    // przez Górne); Antresole -> środek pasa 520..560 (fragment NIEpokryty przez Dolne).
    const topLabelDepthMm = 160;
    const bottomLabelDepthMm = 425;
    const mezzanineLabelDepthMm = 540;

    // Etap V, krok 3 — linie wymiarowe BARE NUMBER (bez słów "Wolne X:"/"mm"), dwupasmowy łańcuch
    // (pełna ściana / zajęte) + zielona strefa wolnego miejsca (albo czerwona, gdy przekroczono) +
    // plakietka — DOKŁADNIE jak Widok X (patrz topDimLineY/bottomDimLineY niżej w elewacji).
    const dimFontMm = px(15);
    const dimGapMm = px(4);
    const dimRowHeightMm = dimGapMm + dimFontMm;
    const dimRowSpacingMm = px(14);
    const dimTopPaddingMm = px(20);
    const topDimLineY = -(dimRowHeightMm + dimRowSpacingMm + dimRowHeightMm);
    const bottomDimLineY = -dimRowHeightMm;
    const topMarginMm = -topDimLineY + dimTopPaddingMm;
    const margin = Math.max(160, planWidthMm * 0.08);
    // Narożnik L dostaje TEN SAM dwupasmowy łańcuch wymiarowy wzdłuż ściany Y, po lewej — potrzebuje
    // więc więcej miejsca niż prosty układ (tylko oddech na "0"/lewą krawędź planu). Dwie osobne
    // kolumny (pełna ściana Y dalej od planu, zajęte Y bliżej) — ta sama proporcja co elewacja
    // (patrz wallExtentWidthMm + rightMarginMm*0.3/*0.72 w widoku X), tylko lustrzanie w LEWO.
    const leftMarginMm = hasWallY ? Math.max(260, planWidthMm * 0.1) + px(20) : margin + px(34);
    const yDimLineOuterX = -leftMarginMm * 0.72;
    const yDimLineInnerX = -leftMarginMm * 0.32;
    // Etap AD, krok 2 — ściana Y2 (prawa) dostaje TEN SAM łańcuch wymiarowy, tylko po PRAWEJ stronie
    // planu (lustrzane odbicie leftMarginMm/yDimLineOuterX/yDimLineInnerX względem planWidthMm).
    const rightSideMarginMm = hasWallY2 ? Math.max(260, planWidthMm * 0.1) + px(20) : margin;
    const y2DimLineOuterX = planWidthMm + rightSideMarginMm * 0.72;
    const y2DimLineInnerX = planWidthMm + rightSideMarginMm * 0.32;
    const viewBoxX = -leftMarginMm;
    const viewBoxY = -topMarginMm;
    const viewBoxWidth = planWidthMm + leftMarginMm + rightSideMarginMm;
    const viewBoxHeight = planHeightMm + topMarginMm + margin;

    // Etap X, krok 1 — linia frontu (+ uchwyt) na Widoku z góry: zgłoszenie — fronty/uchwyty ściany Y
    // rysowały się po stronie ŚCIANY (lewa grań, x=x0), a powinny być po stronie WNĘTRZA (prawa grań,
    // x=x0+depthMm), bo tył korpusu stoi przy ścianie, front otwiera się DO kuchni. Front to zawsze
    // krawędź NAJDALEJ od ściany (x0/y0, gdzie zawsze stoi 0 w tym komponencie) — stąd ten sam wzór
    // dla obu orientacji: "+depthMm" od krawędzi przyściennej, nie od geometrycznego środka/innej grani.
    // Etap AD, krok 2 — `depthDir` (domyślnie 1, ściana Y lewa): kierunek, w który rośnie głębokość
    // prostokąta PIONOWEGO (horizontal:false) od `x0`. Ściana Y2 (prawa) ma `x0 = wallXWidthMm` i
    // `depthDir: -1` — ta sama ściana wzorca, tylko korpus "wchodzi" w stronę MALEJĄCEGO x, front
    // (najdalej od ściany) wypada więc po LEWEJ (`x = x0 - depthMm`), nie po prawej.
    const renderPlanRect = ({ module, xMm, widthMm, depthMm }, { x0, y0, horizontal, dashed, strokeScale = 1, strokeOpacity = 1, labelDepthMm, depthDir = 1 }) => {
      const label = `${Math.round(moduleWidthMm(module))}×${Math.round(depthMm)}`;
      const rectProps = horizontal
        ? { x: x0 + xMm, y: y0, width: widthMm, height: depthMm }
        : { x: depthDir === 1 ? x0 : x0 - depthMm, y: y0 + xMm, width: depthMm, height: widthMm };
      const labelPos = horizontal
        ? { x: rectProps.x + rectProps.width / 2, y: y0 + labelDepthMm }
        : { x: x0 + depthDir * labelDepthMm, y: rectProps.y + rectProps.height / 2 };
      const frontLine = horizontal
        ? { x1: rectProps.x, y1: rectProps.y + rectProps.height, x2: rectProps.x + rectProps.width, y2: rectProps.y + rectProps.height }
        : depthDir === 1
          ? { x1: rectProps.x + rectProps.width, y1: rectProps.y, x2: rectProps.x + rectProps.width, y2: rectProps.y + rectProps.height }
          : { x1: rectProps.x, y1: rectProps.y, x2: rectProps.x, y2: rectProps.y + rectProps.height };
      const handleTickLenMm = lineScaleMm * 0.9 * strokeScale;
      const handleAlongMm = (horizontal ? rectProps.width : rectProps.height) * 0.15;
      const handleTick = horizontal
        ? { x1: rectProps.x + handleAlongMm, y1: frontLine.y1, x2: rectProps.x + handleAlongMm, y2: frontLine.y1 + handleTickLenMm }
        : { x1: frontLine.x1, y1: rectProps.y + handleAlongMm, x2: frontLine.x1 + depthDir * handleTickLenMm, y2: rectProps.y + handleAlongMm };
      const isSelected = selectedModuleId === module.id;
      const isHovered = hoveredModuleId === module.id;
      const planClassName = [s.planCabinetGroup, isSelected && s.cabinetSelected, isHovered && s.cabinetHovered].filter(Boolean).join(' ');
      return (
        <g
          key={module.id}
          className={planClassName}
          role="button"
          tabIndex={0}
          aria-label={`${module.label || module.type} ${Math.round(moduleWidthMm(module))}×${Math.round(depthMm)} mm`}
          data-module-id={module.id}
          onClick={() => onSelectModule?.(module.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectModule?.(module.id); }}
          onMouseEnter={() => onHoverModule?.(module.id)}
          onMouseLeave={() => onHoverModule?.(current => (current === module.id ? null : current))}
        >
          <rect
            {...rectProps} fill="none" stroke="currentColor" strokeOpacity={strokeOpacity}
            strokeWidth={Math.max(1, lineScaleMm * 0.05 * strokeScale)}
            strokeDasharray={dashed ? `${lineScaleMm * 0.5 * strokeScale} ${lineScaleMm * 0.3 * strokeScale}` : undefined}
          />
          <line
            {...frontLine} className={s.planFrontLine} strokeOpacity={strokeOpacity}
            strokeWidth={Math.max(1.5, lineScaleMm * 0.16 * strokeScale)}
            data-front-edge={horizontal ? 'bottom' : (depthDir === 1 ? 'right' : 'left')}
          />
          <line {...handleTick} className={s.planFrontHandle} strokeOpacity={strokeOpacity} strokeWidth={Math.max(1, lineScaleMm * 0.1 * strokeScale)} />
          <text
            x={labelPos.x} y={labelPos.y}
            textAnchor="middle" dominantBaseline="middle" fontSize={px(14)} fontWeight={600} fill="currentColor"
          >
            {label}
          </text>
        </g>
      );
    };

    // Etap AD, krok 3 — "Szyb wentylacyjny / Słup" na Widoku z góry: footprint w PLANIE (jak
    // cabinet rect, ale bez roli/interakcji — to nie szafka), z ukośną kreskowaną (betonowy/murowany
    // charakter) i podpisem "Nazwa SxD". `wall` decyduje TYLKO o orientacji/zaczepieniu (X=poziomo od
    // ściany górnej, Y=pionowo od lewej, Y2=pionowo od prawej, depth "do wewnątrz" w stronę X malejącego).
    const renderPillarPlanRect = (pillar, wall) => {
      const widthMm = Math.max(1, Number(pillar.widthMm) || 1);
      const depthMm = Math.max(1, Number(pillar.depthMm) || 1);
      const xMm = Number(pillar.xMm) || 0;
      const rectProps = wall === 'X'
        ? { x: xMm, y: 0, width: widthMm, height: depthMm }
        : wall === 'Y'
          ? { x: 0, y: xMm, width: depthMm, height: widthMm }
          : { x: wallXWidthMm - depthMm, y: xMm, width: depthMm, height: widthMm };
      const clipId = `pillar-hatch-${pillar.id}`;
      const hatchSpacingMm = Math.max(30, Math.max(widthMm, depthMm) / 6);
      const diag = rectProps.width + rectProps.height;
      const hatchOffsets = [];
      for (let offset = 0; offset < diag; offset += hatchSpacingMm) hatchOffsets.push(offset);
      const labelX = rectProps.x + rectProps.width / 2;
      const labelY = rectProps.y + rectProps.height / 2;
      return (
        <g
          key={pillar.id}
          role="button" tabIndex={0} aria-label={`${pillar.name || 'Szyb'} ${Math.round(widthMm)}×${Math.round(depthMm)} mm`}
          className={s.pillarGroup}
          onClick={() => handlePillarClick(pillar.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') handlePillarClick(pillar.id); }}
        >
          <clipPath id={clipId}><rect {...rectProps} /></clipPath>
          <rect {...rectProps} className={s.pillarBlock} />
          <g clipPath={`url(#${clipId})`} className={s.pillarHatch}>
            {hatchOffsets.map(offset => (
              <line key={offset} x1={rectProps.x + offset} y1={rectProps.y} x2={rectProps.x + offset - rectProps.height} y2={rectProps.y + rectProps.height} />
            ))}
          </g>
          <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontSize={px(12)} fontWeight={700} fill="currentColor">
            {`${pillar.name || 'Szyb'} ${Math.round(widthMm)}×${Math.round(depthMm)}`}
          </text>
        </g>
      );
    };

    // Etap AD, krok 4 — zgłoszenie: gniazdko/woda w zonie zmywarki (Zabudowa zmywarki, wolno stojący
    // sprzęt AGD) nie mają gdzie fizycznie wejść — podświetlamy ⚠️ obok podpisu takiego punktu.
    const inDishwasherZone = (absoluteXMm, layout) => layout.some(entry => (
      entry.module.type === 'dishwasher_front' && absoluteXMm >= entry.xMm && absoluteXMm <= entry.xMm + entry.widthMm
    ));

    // Etap AD, krok 4 — punkt instalacji na Widoku z góry: Widok z góry nie ma osi wysokości (H) —
    // tylko sama pozycja wzdłuż ściany (kropka NA linii ściany + krótki wynosnik + podpis "X: ###"),
    // czerwono-pomarańczowy dla prądu/LED, niebieski dla wody (patrz INSTALLATION_POINT_STYLE).
    // `warn` (np. w zonie zmywarki) dostaje dodatkowy ⚠️ obok podpisu.
    const renderInstallationPointPlan = (point, wall, warn) => {
      const absoluteXMm = installationPointAbsoluteXMm(point, wall === 'X' ? wallXWidthMm : wall === 'Y' ? wallYWidthMm : wallY2WidthMm);
      const style = INSTALLATION_POINT_STYLE[point.type] || INSTALLATION_POINT_STYLE.socket;
      const leaderLenMm = Math.max(40, planWidthMm * 0.025);
      const dotProps = wall === 'X'
        ? { x: absoluteXMm, y: 0, leaderX2: absoluteXMm, leaderY2: -leaderLenMm, labelX: absoluteXMm, labelY: -leaderLenMm }
        : wall === 'Y'
          ? { x: 0, y: absoluteXMm, leaderX2: -leaderLenMm, leaderY2: absoluteXMm, labelX: -leaderLenMm, labelY: absoluteXMm }
          : { x: wallXWidthMm, y: absoluteXMm, leaderX2: wallXWidthMm + leaderLenMm, leaderY2: absoluteXMm, labelX: wallXWidthMm + leaderLenMm, labelY: absoluteXMm };
      return (
        <g key={point.id}>
          <line x1={dotProps.x} y1={dotProps.y} x2={dotProps.leaderX2} y2={dotProps.leaderY2} stroke={style.color} strokeDasharray="6 4" strokeWidth={1.5} />
          <circle cx={dotProps.x} cy={dotProps.y} r={Math.max(6, planWidthMm * 0.006)} fill={style.color} />
          <text x={dotProps.labelX} y={dotProps.labelY} textAnchor="middle" dominantBaseline="middle" fontSize={px(13)} fontWeight={700} fill={style.color}>
            {`${style.icon} ${Math.round(Number(point.distanceMm) || 0)}${warn ? ' ⚠️' : ''}`}
          </text>
        </g>
      );
    };

    return (
      <div className={s.canvasWrap}>
        {renderCanvasHeader()}
        <svg
          ref={svgRef}
          className={s.canvasSvg} role="img" aria-label="Widok z góry (rzut, głębokości szafek), w milimetrach"
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Ściana X — pozioma, od narożnika (0,0) w prawo. */}
          <line
            x1={0} y1={0} x2={wallXWidthMm} y2={0}
            stroke={occupiedXMm > wallXWidthMm ? 'var(--tone-danger, #d33)' : 'currentColor'}
            strokeWidth={Math.max(2, planWidthMm / 500)}
          />
          {hasWallY && (
            <line
              x1={0} y1={0} x2={0} y2={wallYWidthMm}
              stroke={occupiedYMm > wallYWidthMm ? 'var(--tone-danger, #d33)' : 'currentColor'}
              strokeWidth={Math.max(2, planWidthMm / 500)}
            />
          )}
          {/* Etap AD, krok 2 — ściana Y2 (prawa), przyczepiona do PRAWEGO końca ściany X. */}
          {hasWallY2 && (
            <line
              x1={wallXWidthMm} y1={0} x2={wallXWidthMm} y2={wallY2WidthMm}
              stroke={occupiedY2Mm > wallY2WidthMm ? 'var(--tone-danger, #d33)' : 'currentColor'}
              strokeWidth={Math.max(2, planWidthMm / 500)}
            />
          )}
          {/* Blat — segmenty bez wypełnienia, TYLKO nad ciągłymi odcinkami Szafek dolnych (Słupek
              przerywa segment — patrz layoutCountertopSegments, ta sama logika co Widok X). */}
          {countertopSegmentsX.map(segment => (
            <rect
              key={segment.start} x={segment.start} y={0} width={Math.max(1, segment.end - segment.start)} height={countertopDepthMm}
              fill="none" stroke="currentColor" strokeOpacity={0.5} strokeDasharray={`${lineScaleMm * 0.3} ${lineScaleMm * 0.3}`}
            />
          ))}
          {/* Etap V, krok 2 — kolejność rysowania (antresole/górne/dolne) nie ma znaczenia dla
              naложenia TEKSTU (każdy jarus ma własny, wyłączny pas głębokości na etykietę — patrz
              topLabelDepthMm/bottomLabelDepthMm/mezzanineLabelDepthMm), ale antresole (najgłębsze,
              najcieńsza kreska) rysują się jako PIERWSZE, żeby nigdy nie przykryły Dolnych/Górnych. */}
          {xMezzanineLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: true, dashed: true, strokeScale: 0.6, strokeOpacity: 0.55, labelDepthMm: mezzanineLabelDepthMm }))}
          {xTopLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: true, dashed: true, strokeScale: 1, strokeOpacity: 0.8, labelDepthMm: topLabelDepthMm }))}
          {xLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: true, dashed: false, labelDepthMm: bottomLabelDepthMm }))}
          {pillarsForWall('X').map(pillar => renderPillarPlanRect(pillar, 'X'))}
          {installationPointsForWall('X').map(point => renderInstallationPointPlan(
            point, 'X', inDishwasherZone(installationPointAbsoluteXMm(point, wallXWidthMm), xLayout),
          ))}

          <HorizontalDimension x1={0} x2={wallXWidthMm} y={topDimLineY} label={Math.round(wallXWidthMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
          <HorizontalDimension x1={0} x2={occupiedXMm} y={bottomDimLineY} label={Math.round(occupiedXMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
          {occupiedXMm > wallXWidthMm && (
            <>
              <rect x={wallXWidthMm} y={0} width={occupiedXMm - wallXWidthMm} height={planHeightMm} className={s.overflowZone} />
              <Badge x={(wallXWidthMm + occupiedXMm) / 2} y={bottomDimLineY} text={String(Math.round(occupiedXMm - wallXWidthMm))} fontSize={px(15)} className={s.overflowBadge} />
            </>
          )}
          {occupiedXMm < wallXWidthMm && (
            <>
              <rect x={occupiedXMm} y={0} width={wallXWidthMm - occupiedXMm} height={planHeightMm} className={s.freeZone} />
              <Badge x={(occupiedXMm + wallXWidthMm) / 2} y={bottomDimLineY} text={String(Math.round(wallXWidthMm - occupiedXMm))} fontSize={px(15)} className={s.freeBadge} />
            </>
          )}

          {hasWallY && (
            <>
              {/* Etap X, krok 2 — kwadrat (0..cornerDeductionMm w OBU osiach) = dokładnie ten sam
                  martwy róg, o który przesuwa się start yLayout wyżej — dawniej szerokość tego
                  prostokąta brała maxDepthX (głębokość NAJGŁĘBSZEGO jarusu całej ściany X, nie tego,
                  co realnie stoi w rogu), co dawało nieprawdziwy kształt rogu. */}
              {cornerDeductionMm > 0 && (
                <rect
                  x={0} y={0} width={cornerDeductionMm} height={cornerDeductionMm}
                  className={s.cornerSlice}
                />
              )}
              {yMezzanineLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: false, dashed: true, strokeScale: 0.6, strokeOpacity: 0.55, labelDepthMm: mezzanineLabelDepthMm }))}
              {yTopLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: false, dashed: true, strokeScale: 1, strokeOpacity: 0.8, labelDepthMm: topLabelDepthMm }))}
              {yLayout.map(entry => renderPlanRect(entry, { x0: 0, y0: 0, horizontal: false, dashed: false, labelDepthMm: bottomLabelDepthMm }))}
              {pillarsForWall('Y').map(pillar => renderPillarPlanRect(pillar, 'Y'))}
              {installationPointsForWall('Y').map(point => renderInstallationPointPlan(
                point, 'Y', inDishwasherZone(installationPointAbsoluteXMm(point, wallYWidthMm), yLayout),
              ))}

              <VerticalDimension y1={wallYWidthMm} y2={0} x={yDimLineOuterX} label={Math.round(wallYWidthMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
              <VerticalDimension y1={occupiedYMm} y2={0} x={yDimLineInnerX} label={Math.round(occupiedYMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
              {occupiedYMm > wallYWidthMm && (
                <>
                  <rect x={0} y={wallYWidthMm} width={planWidthMm} height={occupiedYMm - wallYWidthMm} className={s.overflowZone} />
                  <Badge x={yDimLineInnerX} y={(wallYWidthMm + occupiedYMm) / 2} text={String(Math.round(occupiedYMm - wallYWidthMm))} fontSize={px(15)} className={s.overflowBadge} />
                </>
              )}
              {occupiedYMm < wallYWidthMm && (
                <>
                  <rect x={0} y={occupiedYMm} width={planWidthMm} height={wallYWidthMm - occupiedYMm} className={s.freeZone} />
                  <Badge x={yDimLineInnerX} y={(occupiedYMm + wallYWidthMm) / 2} text={String(Math.round(wallYWidthMm - occupiedYMm))} fontSize={px(15)} className={s.freeBadge} />
                </>
              )}
            </>
          )}
          {/* Etap AD, krok 2 — ściana Y2 (prawa): TA SAMA logika co Y (lewa) wyżej, tylko narożnik i
              szafki zaczepione o PRAWY koniec ściany X (`x0: wallXWidthMm, depthDir: -1`), a łańcuch
              wymiarowy po PRAWEJ stronie planu (y2DimLineOuterX/InnerX, patrz wyżej). */}
          {hasWallY2 && (
            <>
              {cornerDeduction2Mm > 0 && (
                <rect
                  x={wallXWidthMm - cornerDeduction2Mm} y={0} width={cornerDeduction2Mm} height={cornerDeduction2Mm}
                  className={s.cornerSlice}
                />
              )}
              {y2MezzanineLayout.map(entry => renderPlanRect(entry, { x0: wallXWidthMm, y0: 0, horizontal: false, dashed: true, strokeScale: 0.6, strokeOpacity: 0.55, labelDepthMm: mezzanineLabelDepthMm, depthDir: -1 }))}
              {y2TopLayout.map(entry => renderPlanRect(entry, { x0: wallXWidthMm, y0: 0, horizontal: false, dashed: true, strokeScale: 1, strokeOpacity: 0.8, labelDepthMm: topLabelDepthMm, depthDir: -1 }))}
              {y2Layout.map(entry => renderPlanRect(entry, { x0: wallXWidthMm, y0: 0, horizontal: false, dashed: false, labelDepthMm: bottomLabelDepthMm, depthDir: -1 }))}
              {pillarsForWall('Y2').map(pillar => renderPillarPlanRect(pillar, 'Y2'))}
              {installationPointsForWall('Y2').map(point => renderInstallationPointPlan(
                point, 'Y2', inDishwasherZone(installationPointAbsoluteXMm(point, wallY2WidthMm), y2Layout),
              ))}

              <VerticalDimension y1={wallY2WidthMm} y2={0} x={y2DimLineOuterX} label={Math.round(wallY2WidthMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
              <VerticalDimension y1={occupiedY2Mm} y2={0} x={y2DimLineInnerX} label={Math.round(occupiedY2Mm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine} />
              {occupiedY2Mm > wallY2WidthMm && (
                <>
                  <rect x={0} y={wallY2WidthMm} width={planWidthMm} height={occupiedY2Mm - wallY2WidthMm} className={s.overflowZone} />
                  <Badge x={y2DimLineInnerX} y={(wallY2WidthMm + occupiedY2Mm) / 2} text={String(Math.round(occupiedY2Mm - wallY2WidthMm))} fontSize={px(15)} className={s.overflowBadge} />
                </>
              )}
              {occupiedY2Mm < wallY2WidthMm && (
                <>
                  <rect x={0} y={occupiedY2Mm} width={planWidthMm} height={wallY2WidthMm - occupiedY2Mm} className={s.freeZone} />
                  <Badge x={y2DimLineInnerX} y={(occupiedY2Mm + wallY2WidthMm) / 2} text={String(Math.round(wallY2WidthMm - occupiedY2Mm))} fontSize={px(15)} className={s.freeBadge} />
                </>
              )}
            </>
          )}
        </svg>
      </div>
    );
  }

  // ================================================================================================
  // PRZEKRÓJ BOCZNY Y (głębokości) — tylko dla układu PROSTEGO (1 ściana), statyczny, bez drag&drop.
  // Oś pozioma = głębokość (od ściany w stronę wnętrza), oś pionowa = ta sama wysokość co Widok X.
  // ================================================================================================
  if (isSideSection) {
    const depthForGroup = (groupKey, fallback) => {
      const candidates = modules.filter(m => m.group === groupKey).map(moduleDepthMm).filter(d => d > 0);
      return candidates.length > 0 ? Math.max(...candidates) : fallback;
    };
    const legHeight = Number(heights.legHeight) || 0;
    const countertopHeight = Number(heights.countertopHeight) || 0;
    const countertopThickness = Number(heights.countertopThickness) || 0;
    const backsplashHeight = Number(heights.backsplashHeight) || 0;
    const countertopDepthMm = Math.max(1, Number(heights.countertopDepthMm) || 1);
    const bottomD = depthForGroup('kitchen_bottom', 520);
    const topD = depthForGroup('kitchen_top', 320);
    const mezzanineD = depthForGroup('kitchen_mezzanine', 560);
    const hasBottomModules = modules.some(m => m.group === 'kitchen_bottom');
    const hasTopModules = modules.some(m => m.group === 'kitchen_top');
    const hasMezzanineModules = modules.some(m => m.group === 'kitchen_mezzanine');
    const bottomHeightMm = modules.find(m => m.group === 'kitchen_bottom')?.H || (countertopHeight - countertopThickness - legHeight);
    const topHeightMm = modules.find(m => m.group === 'kitchen_top')?.H || 720;
    const mezzanineHeightMm = Number(heights.mezzanineHeight) || 400;
    const mezzanineTopMm = ceilingHeight - (Number(heights.ceilingGap) || 0);

    const planDepthMm = Math.max(bottomD, countertopDepthMm, topD, mezzanineD, 1);
    const margin = Math.max(140, ceilingHeight * 0.1);
    const sideViewBoxWidth = planDepthMm + margin * 2;
    const px = makePxToMm(screenScale);
    const svgYFor = mm => ceilingHeight - mm;

    const profile = (labelText, x0, widthMm, bottomMm, topMm, opts = {}) => (
      <g key={labelText}>
        <rect x={x0} y={svgYFor(topMm)} width={widthMm} height={Math.max(1, topMm - bottomMm)} fill="none" stroke="currentColor" strokeWidth={Math.max(1, lineScaleMm * 0.05)} strokeDasharray={opts.dashed ? `${lineScaleMm * 0.4} ${lineScaleMm * 0.3}` : undefined} />
        <text x={x0 + widthMm / 2} y={svgYFor((topMm + bottomMm) / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={px(14)} fontWeight={600} fill="currentColor">
          {`${labelText} ${Math.round(widthMm)} mm`}
        </text>
      </g>
    );

    return (
      <div className={s.canvasWrap}>
        {renderCanvasHeader()}
        <svg
          ref={svgRef}
          className={s.canvasSvg} role="img" aria-label="Przekrój boczny Y (głębokości szafek), w milimetrach"
          viewBox={`${-margin} ${-margin} ${sideViewBoxWidth} ${ceilingHeight + margin * 2}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Cokół/Blat/Fartuch to instalacja (zawsze pokazane, niezależnie od tego, co dodano) —
              Dolna/Górna/Antresola to KONKRETNE dodane szafki, więc rysują się tylko gdy realnie
              istnieją w projekcie (inaczej pokazywałyby hipotetyczną szafkę, której wcale nie ma). */}
          {hasBottomModules && profile('Cokół', 0, bottomD, 0, legHeight)}
          {hasBottomModules && profile('Dolna', 0, bottomD, legHeight, legHeight + bottomHeightMm)}
          {profile('Blat', 0, countertopDepthMm, countertopHeight - countertopThickness, countertopHeight)}
          {profile('Fartuch', 0, Math.max(20, countertopDepthMm * 0.03), countertopHeight, countertopHeight + backsplashHeight)}
          {hasTopModules && profile('Górna', 0, topD, countertopHeight + backsplashHeight, countertopHeight + backsplashHeight + topHeightMm)}
          {hasMezzanineModules && profile('Antresola', 0, mezzanineD, mezzanineTopMm - mezzanineHeightMm, mezzanineTopMm, { dashed: true })}
          <VerticalDimension y1={0} y2={ceilingHeight} x={-margin * 0.55} label={`Wysokość sufitu: ${Math.round(ceilingHeight)} mm`} fontSize={px(15)} className={s.dimensionLine} />
        </svg>
      </div>
    );
  }

  // ================================================================================================
  // WIDOK X / WIDOK Y (elewacja) — pełna geometria 1:1 jak dotychczas (Etap N), plus Etap O, krok 2:
  // linie wymiarowe gabarytów + podświetlony wolny odcinek ściany / Etap O, krok 3: filtr po ścianie.
  // ================================================================================================
  const nominalWallWidthMm = Math.max(1, Number(
    elevationWall === 'Y' ? heights.wallYWidthMm : elevationWall === 'Y2' ? heights.wallY2WidthMm : heights.wallWidthMm,
  ) || 1);
  const countertopDepthMm = Math.max(1, Number(heights.countertopDepthMm) || 1);
  // Etap AC, krok 1 — zgłoszenie (Screenshot_2_3.jpg/Screenshot_1_3.jpg): na Widoku z góry ściana X
  // (pozioma) i ściana Y (pionowa, LEWA) schodzą się w rogu (0,0) — patrząc FRONTALNIE na ścianę Y
  // (lewą), ten róg (z narożnikiem ściany X wchodzącym w jej przestrzeń) jest PO PRAWEJ, wolny
  // koniec ściany Y PO LEWEJ (odwrotna "porcja" niż Widok X — fizyczny efekt obrotu o 90° w rogu
  // pomieszczenia). `mirrorWallY` włącza lustrzane odbicie całej zawartości (patrz mirrorSpanX/
  // mirrorPointX niżej) + korytarz narożnika (cornerDepthX, TA SAMA funkcja co Widok z góry, Etap X)
  // rezerwuje miejsce na prawym końcu zamiast lewego.
  //
  // Etap AD, krok 2 — ściana Y2 (PRAWA) jest geometrycznym LUSTRZANYM ODBICIEM ściany Y (lewej)
  // WZGLĘDEM samego pomieszczenia — patrząc frontalnie na NIĄ, oba te odbicia się ZNOSZĄ: narożnik
  // wypada PO LEWEJ, szafki rosną W PRAWO (dokładnie jak Widok X, naturalny, BEZ mirrorSpanX/
  // mirrorPointX). `cornerDepthX` nadal trzeba policzyć (przesuwa start floorLayout, żeby pas
  // podłogowy nie nachodził na narożnik) — tylko bez następującego po nim odbicia, i liczony od
  // PRAWEGO (nie lewego) końca ściany X (`computeCornerDepthMm(..., 'right')`).
  const mirrorWallY = elevationWall === 'Y' && hasWallY;
  const needsCornerOffset = mirrorWallY || (elevationWall === 'Y2' && hasWallY2);
  const cornerDepthX = needsCornerOffset
    ? computeCornerDepthMm(
      modules, countertopDepthMm, elevationWall === 'Y2' ? 'right' : 'left',
      Math.max(1, Number(heights.wallWidthMm) || 1),
    )
    : 0;

  const rowItems = {};
  const rowWidthMm = {};
  // Etap U, krok 2/3 — Dolne+Słupki stoją w JEDNYM wspólnym napodłogowym rzędzie, w kolejności
  // WYSTĘPOWANIA w `modules` (layoutFloorBand w jądrze — JEDYNE źródło prawdy, współdzielone z
  // computeWallFreeSpace/tabelą, żeby nigdy znowu nie rozjechały się 2 różne liczby "zajętej
  // szerokości"). Szafki górne zaczynają się DOPIERO za WIODĄCYMI słupkami z lewej strony rzędu
  // (leftTallOffsetMm) — jeśli słupek stoi na KOŃCU rzędu (po prawej), górne i tak zaczynają się
  // od zera. Antresole mają WŁASNY, niezależny rząd od X=0 (dawny bug: kontynuowały rząd Górnych,
  // sumując się z nim zamiast stać NAD nim — occupiedWidth wychodził zawyżony).
  // Etap AD, krok 3 — "Szyb wentylacyjny / Słup" tej ściany: tak jak na Widoku z góry, odejmujemy
  // `cornerDepthX` od jego `xMm` PRZED oddaniem go do layoutFloorBand/layoutUpperRow (unikanie liczy
  // się na "surowym" cursorze, od 0, identycznie jak dla cabinet-ów), a renderowanie niżej używa
  // ORYGINALNEGO (nieprzesuniętego) `pillarsForWall(elevationWall)` — po jednolitym przesunięciu
  // CAŁEGO rzędu o +cornerDepthX efektywna pozycja słupa wraca dokładnie do tego, co wpisał user.
  const elevationPillars = pillarsForWall(elevationWall);
  const elevationPillarsShifted = cornerDepthX > 0
    ? elevationPillars.map(p => ({ ...p, xMm: (Number(p.xMm) || 0) - cornerDepthX }))
    : elevationPillars;
  const floorLayoutRaw = layoutFloorBand(modules, elevationWall, elevationPillarsShifted);
  // Etap AC, krok 1 — pas podłogowy ściany Y zaczyna się DOPIERO za narożnikiem ściany X (TA SAMA
  // logika jak Widok z góry, Etap X) — bez tego pierwszy szafka ściany Y nakładałaby się na
  // boczną projekcję narożnika rysowaną niżej po prawej.
  const floorLayout = cornerDepthX > 0
    ? {
      ...floorLayoutRaw,
      entries: floorLayoutRaw.entries.map(entry => ({ ...entry, xMm: entry.xMm + cornerDepthX })),
      totalWidthMm: floorLayoutRaw.totalWidthMm + cornerDepthX,
    }
    : floorLayoutRaw;
  rowItems.kitchen_floor = floorLayout.entries.map(entry => ({ ...entry, heightMm: moduleHeightMm(entry.module) }));
  rowWidthMm.kitchen_floor = floorLayout.totalWidthMm;
  const leftTallOffsetMm = floorLayout.leftTallOffsetMm;

  // Etap V, krok 1 — `layoutUpperRow` (jądro) zamiast lokalnej kumulacji — TA SAMA funkcja woła
  // Widok z góry niżej, więc Górne/Antresole ZAWSZE stoją na identycznym X na obu widokach.
  const buildRow = (groupKey, startXmm) => {
    const layout = layoutUpperRow(modules, elevationWall, groupKey, startXmm, elevationPillarsShifted);
    rowItems[groupKey] = layout.entries.map(entry => ({ ...entry, heightMm: moduleHeightMm(entry.module) }));
    rowWidthMm[groupKey] = layout.totalWidthMm;
  };
  buildRow('kitchen_top', leftTallOffsetMm);
  buildRow('kitchen_mezzanine', 0);

  // Blat (countertopStrip niżej) rysuje się TYLKO nad ciągłymi odcinkami Szafek dolnych — Słupek
  // przerywa segment (sięga prawie pod sufit, bez blatu nad sobą). Jawne moduły grupy "Blat"
  // (kitchen_countertop, osobna wkładka) mogą zażądać WIĘCEJ niż realnie zajmują Dolne — wtedy
  // dorysowujemy dodatkowy segment na końcu, żeby ich sumaryczna szerokość i tak była widoczna.
  const explicitCountertopWidthMm = modules.filter(m => m.group === 'kitchen_countertop').reduce((sum, m) => sum + moduleWidthMm(m), 0);
  const countertopSegments = elevationWall === 'X' ? (() => {
    const segments = layoutCountertopSegments(rowItems.kitchen_floor);
    const segmentsWidthMm = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    if (explicitCountertopWidthMm <= segmentsWidthMm) return segments;
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
    return [...segments, { start: lastEnd, end: lastEnd + (explicitCountertopWidthMm - segmentsWidthMm) }];
  })() : [];
  const countertopWidthMm = elevationWall === 'X' ? Math.max(rowWidthMm.kitchen_floor || 0, explicitCountertopWidthMm) : 0;
  const occupiedWidthMm = Math.max(0, ...ROW_GROUPS.map(g => rowWidthMm[g] || 0), countertopWidthMm);
  const overflowMm = occupiedWidthMm - nominalWallWidthMm;
  const wallExtentWidthMm = Math.max(nominalWallWidthMm, occupiedWidthMm, 1);

  // Etap AC, krok 1 — lustrzane odbicie X: KAŻDA pozycja narysowana na tym widoku (szafki, strefy
  // wolne/przekroczone, linie wymiarowe, wskaźnik przeciągania) musi przejść przez jeden z tych 2
  // helperów, żeby konsekwentnie zamienić stronami lewo/prawo — bez tego np. szafki rysowałyby się
  // poprawnie, ale wskaźnik "Wolne"/"Zajęte" albo drag&drop zostałyby PO STAREJ (nielustrzanej)
  // stronie. `mirrorSpanX` dla prostokątów/elementów o szerokości (zachowuje szerokość, odwraca
  // pozycję); `mirrorPointX` dla pojedynczych punktów (x1/x2 wymiarów, środek plakietki) — obie są
  // SAMOODWROTNE (mirrorPointX(mirrorPointX(x)) === x), więc tej samej funkcji używamy też do
  // przeliczenia kliknięcia myszką (ekran -> logika) w handlePointerMove/handleDrop niżej.
  const mirrorSpanX = (xMm, widthMm) => (mirrorWallY ? wallExtentWidthMm - xMm - widthMm : xMm);
  const mirrorPointX = (xMm) => (mirrorWallY ? wallExtentWidthMm - xMm : xMm);

  // Pasmo [dolna, górna] krawędź (mm od podłogi) każdego rzędu — do rysowania szafek i do
  // znalezienia, na który rząd upuszczono nowy preset (patrz handleDrop).
  const bandFor = (groupKey, heightMm) => {
    const anchor = ANCHORS[groupKey];
    const mm = anchor.mmFromFloor(heights);
    return anchor.type === 'bottom'
      ? { bottom: mm, top: mm + heightMm }
      : { bottom: mm - heightMm, top: mm };
  };
  const svgYFor = (mmFromFloor) => ceilingHeight - mmFromFloor;

  const rowMaxTopMm = {};
  ROW_GROUPS.forEach((groupKey) => {
    const tops = rowItems[groupKey].map(({ heightMm }) => bandFor(groupKey, heightMm).top);
    rowMaxTopMm[groupKey] = tops.length > 0 ? Math.max(...tops) : null;
  });
  // Etap U, krok 2 — Dolne i Słupki dzielą X (jeden rząd), ale NIE dzielą wysokości (słupek np.
  // 2075mm vs szafka dolna 757mm) — do linijki (ticks niżej) potrzebne są DWA osobne szczyty, więc
  // liczymy je tu osobno z tego samego, już-policzonego rzędu `rowItems.kitchen_floor`.
  rowMaxTopMm.kitchen_bottom = (() => {
    const tops = rowItems.kitchen_floor.filter(({ module }) => module.group === 'kitchen_bottom').map(({ heightMm }) => bandFor('kitchen_bottom', heightMm).top);
    return tops.length > 0 ? Math.max(...tops) : null;
  })();
  rowMaxTopMm.kitchen_tall = (() => {
    const tops = rowItems.kitchen_floor.filter(({ module }) => module.group === 'kitchen_tall').map(({ heightMm }) => bandFor('kitchen_tall', heightMm).top);
    return tops.length > 0 ? Math.max(...tops) : null;
  })();
  const countertopTopMm = Number(heights.countertopHeight) || 0;
  const countertopBottomMm = countertopTopMm - (Number(heights.countertopThickness) || 0);
  const backsplashHeight = Number(heights.backsplashHeight) || 0;

  // Etap AA, krok 1 — zgłoszenie: zbyt wiele blisko siebie stojących poziomów (spód/wierzch blatu,
  // wierzch fartucha, wierzch Dolnych — wszystkie w odstępie ~60mm wokół "900") tworzyło nieczytelny
  // "gąszcz" kresek i cyfr na linijce. Zostaje JEDEN poziom na strefę: podłoga, cokół, blat, dołu
  // Górnych, dołu Antresoli, sufit — dokładnie te, których fizyczna granica jest widoczna na samym
  // rysunku szafek (fartuch/wierzch Dolnych nie dostają już WŁASNEJ kreski, bo i tak pokrywają się
  // wzrokowo z sąsiednim poziomem o 20-40mm obok).
  const rawTicks = [
    { mm: 0, label: null },
    { mm: heights.legHeight, label: null },
    { mm: countertopTopMm, label: null },
    rowMaxTopMm.kitchen_tall !== null && { mm: rowMaxTopMm.kitchen_tall, label: ROW_LABELS.kitchen_tall },
    rowMaxTopMm.kitchen_top !== null && { mm: rowMaxTopMm.kitchen_top, label: ROW_LABELS.kitchen_top },
    rowItems.kitchen_mezzanine.length > 0 && { mm: ANCHORS.kitchen_mezzanine.mmFromFloor(heights), label: ROW_LABELS.kitchen_mezzanine },
    { mm: ceilingHeight, label: null },
  ].filter(Boolean);
  const ticks = rawTicks
    .filter((tick, index, all) => all.findIndex(other => Math.round(other.mm) === Math.round(tick.mm)) === index)
    .sort((a, b) => a.mm - b.mm);

  const px = makePxToMm(screenScale);
  // Etap T, krok 2 — poprzedni mechanizm (wcięcie w PRAWO, naprzemiennie) przesuwał kolidujący tick w
  // X, ale dwie etykiety leżące PRAWIE na tej samej wysokości (np. "2580" antresoli tuż pod "2600"
  // sufitu) i tak siadały wzrokowo "na styk" — różne X, ale praktycznie ta sama linia Y. Zamiast X,
  // wymuszamy minimalny odstęp W Y (stały, w px ekranu) między środkami KOLEJNYCH etykiet na linijce,
  // idąc od najniższej (mm=0, dół ściany) do najwyższej (mm=ceilingHeight, sufit) — `ticks` jest już
  // posortowane rosnąco po mm (czyli malejąco po svgY/ekranowej wysokości). Kolidująca etykieta
  // "ucieka" wyżej (mniejszy Y); kreskowana linia wymiarowa zostaje na SWOJEJ prawdziwej wysokości,
  // przesuwa się tylko sama cyfra.
  const minTickLabelStepMm = px(14);
  const tickLabelYs = ticks.reduce((acc, tick) => {
    const lastY = acc.length > 0 ? acc[acc.length - 1] : null;
    const naturalY = svgYFor(tick.mm) - px(4);
    const y = (lastY !== null && lastY - naturalY < minTickLabelStepMm) ? lastY - minTickLabelStepMm : naturalY;
    acc.push(y);
    return acc;
  }, []);

  const rulerMm = Math.max(220, wallExtentWidthMm * 0.1) + px(34);
  // Etap Q, krok 3 (b) — margines U GÓRY liczony z RZECZYWISTYCH, w px ekranu wyrażonych wymiarów
  // 2 poziomych "pasów" wymiarowych (pełna szerokość ściany + zajęte/wolne), nie z ułamka mm sufitu
  // (ten dawał niestabilny, zależny od skali margines, który dla wysokich/wąskich widoków obcinał
  // górną liczbę "3000" — patrz dimFontMm/dimGapMm niżej, oba są screen-px-stabilne jak fontSize).
  const dimFontMm = px(15);
  const dimGapMm = px(4);
  const dimRowHeightMm = dimGapMm + dimFontMm; // od linii do GÓRNEJ krawędzi jej cyfry
  const dimRowSpacingMm = px(14); // odstęp między 2 poziomymi pasami
  // Etap S, krok 2 — 10px NIE WYSTARCZAŁO: baseline cyfry siedzi `dimGapMm` nad linią, a sama cyfra
  // (pogrubiona, ~0.8 × fontSize) rośnie JESZCZE WYŻEJ ponad baseline — "3000" realnie potrzebuje
  // dimGapMm + ~0.8×dimFontMm ≈ 4+12 = 16px zapasu nad linią, żeby się zmieścić; 10px realnie
  // UCINAŁO górę cyfry o różnicę. 20px (zamiast wyliczonych "w sam raz" 16px) zostawia margines
  // bezpieczeństwa na różnice renderowania czcionki między przeglądarkami/systemami.
  const dimTopPaddingMm = px(20); // oddech nad najwyższym pasem, żeby nic nie dotykało krawędzi viewBoxu
  const topDimLineY = -(dimRowHeightMm + dimRowSpacingMm + dimRowHeightMm); // "Szerokość ściany" (zewnętrzny pas)
  const bottomDimLineY = -dimRowHeightMm; // "Zajęte"/"Wolne" (pas bliżej ściany)
  const topMarginMm = -topDimLineY + dimTopPaddingMm;
  const rightMarginMm = Math.max(260, wallExtentWidthMm * 0.1) + px(20);
  const overflowMarginMm = overflowMm > 0 ? overflowMm + rulerMm : 0;
  const viewBoxX = -rulerMm;
  const viewBoxY = -topMarginMm;
  const viewBoxWidth = wallExtentWidthMm + rulerMm + rightMarginMm + overflowMarginMm;
  const viewBoxHeight = ceilingHeight + topMarginMm;

  // --- Przestawianie myszką/pointerem WEWNĄTRZ rzędu (patrz onReorder — woła reorderModuleInGroup
  // w CabinetCalculator.jsx) — przeciąganie kafelka presetu Z PALETY na rysunek obsługuje natywne
  // HTML5 Drag and Drop (handleDragOver/handleDrop), to osobny, niezależny mechanizm.
  const handlePointerDown = (event, groupKey, index) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({ groupKey, fromIndex: index, overIndex: index, pointerId: event.pointerId });
  };
  // Etap AF, krok 2 — przeciąganie słupa wzdłuż ściany: ta sama `pointerToUserSpace` co dla szafek,
  // tylko bez żadnego "przeskakiwania" na siebie innych elementów — słup po prostu podąża za
  // kursorem (środek słupa pod kursorem), aktualizując `xMm` NA ŻYWO przy każdym ruchu.
  const handlePillarPointerDown = (event, pillar) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPillarDragState({ pillarId: pillar.id, pointerId: event.pointerId, widthMm: Math.max(1, Number(pillar.widthMm) || 1) });
  };
  const handlePointerMove = (event) => {
    if (pillarDragState && event.pointerId === pillarDragState.pointerId) {
      const point = pointerToUserSpace(svgRef.current, event.clientX, event.clientY);
      if (!point) return;
      // `mirrorSpanX` jest SAMOODWROTNA przy tej samej szerokości — ten sam wzór, co użyty do
      // narysowania słupa (Etap AD, krok 3), tylko w drugą stronę (ekran -> logiczne xMm).
      const newXMm = mirrorSpanX(point.x - pillarDragState.widthMm / 2, pillarDragState.widthMm);
      onPatchPillar?.(pillarDragState.pillarId, 'xMm', Math.round(newXMm));
      return;
    }
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const point = pointerToUserSpace(svgRef.current, event.clientX, event.clientY);
    if (!point) return;
    // Etap AC, krok 1 — `item.xMm` zostaje w LOGICZNEJ (nielustrzanej) przestrzeni; punkt wskaźnika
    // (już w przestrzeni EKRANU/rysunku, czyli lustrzanej dla Widoku Y) trzeba więc najpierw
    // odbić z powrotem (mirrorPointX jest SAMOODWROTNY) przed porównaniem z xMm.
    const logicalPointX = mirrorPointX(point.x);
    const items = rowItems[dragState.groupKey];
    let overIndex = items.findIndex(item => logicalPointX < item.xMm + item.widthMm / 2);
    if (overIndex === -1) overIndex = items.length - 1;
    if (overIndex !== dragState.overIndex) setDragState(current => (current ? { ...current, overIndex } : current));
  };
  const endDrag = () => {
    if (pillarDragState) { setPillarDragState(null); return; }
    if (dragState && dragState.overIndex !== dragState.fromIndex) {
      onReorder?.(dragState.groupKey, dragState.fromIndex, dragState.overIndex, elevationWall);
    }
    setDragState(null);
  };

  // --- Upuszczenie kafelka presetu z palety "+ Dodaj moduł" na rysunek -----------------------------
  const handleDragOver = (event) => { event.preventDefault(); };
  const handleDrop = (event) => {
    event.preventDefault();
    let preset;
    try {
      preset = JSON.parse(event.dataTransfer.getData('application/json') || 'null');
    } catch {
      preset = null;
    }
    if (!preset) return;
    const point = pointerToUserSpace(svgRef.current, event.clientX, event.clientY);
    if (!point) { onDropPreset?.(preset, { group: preset.group, index: undefined, wall: elevationWall }); return; }
    const dropMm = ceilingHeight - point.y;
    const logicalPointX = mirrorPointX(point.x); // patrz komentarz w handlePointerMove
    let targetGroup = ROW_GROUPS[0];
    let bestDistance = Infinity;
    ROW_GROUPS.forEach((groupKey) => {
      const anchor = ANCHORS[groupKey].mmFromFloor(heights);
      const distance = Math.abs(dropMm - anchor);
      if (distance < bestDistance) { bestDistance = distance; targetGroup = groupKey; }
    });
    const items = rowItems[targetGroup];
    let index = items.findIndex(item => logicalPointX < item.xMm + item.widthMm / 2);
    if (index === -1) index = items.length;
    // Etap U, krok 3 — "kitchen_floor" to SYNTETYCZNY klucz rzędu (Dolne+Słupki razem, patrz wyżej)
    // — upuszczony kafelek musi dostać swoją PRAWDZIWĄ grupę (Dolne albo Słupki), nie ten alias.
    // Kafelek INNEJ grupy (np. "Szafki górne") upuszczony tutaj domyślnie trafia do Dolnych — tak
    // samo jak dawniej, kiedy najbliższy rząd decydował o docelowej grupie.
    const finalGroup = targetGroup === 'kitchen_floor'
      ? (preset.group === 'kitchen_tall' ? 'kitchen_tall' : 'kitchen_bottom')
      : targetGroup;
    onDropPreset?.(preset, { group: finalGroup, index, wall: elevationWall });
  };

  const renderCabinet = (groupKey, entry, index) => {
    const { module, xMm: logicalXMm, widthMm, heightMm } = entry;
    const xMm = mirrorSpanX(logicalXMm, widthMm);
    const band = bandFor(groupKey, heightMm);
    const svgY = svgYFor(band.top);
    const isSelected = selectedModuleId === module.id;
    const isHovered = hoveredModuleId === module.id;
    const isDragSource = dragState?.groupKey === groupKey && dragState.fromIndex === index;
    return (
      <g
        key={module.id}
        className={`${s.cabinetGroup} ${isSelected ? s.cabinetSelected : ''} ${isHovered ? s.cabinetHovered : ''} ${isDragSource ? s.cabinetDragging : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${module.label || module.type} ${Math.round(widthMm)}×${Math.round(heightMm)} mm`}
        data-module-id={module.id}
        onPointerDown={event => handlePointerDown(event, groupKey, index)}
        onClick={() => onSelectModule?.(module.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectModule?.(module.id); }}
        onMouseEnter={() => onHoverModule?.(module.id)}
        onMouseLeave={() => onHoverModule?.(current => (current === module.id ? null : current))}
      >
        {/* Niewidoczny, ale "trafialny" obszar na CAŁY prostokąt szafki — CabinetFrontDrawing rysuje
            ramkę z fill="none" (puste wnętrze nie reaguje na kliknięcia/pointer w SVG), więc bez tej
            warstwy klik/drag trafiałby tylko w same linie rysunku (np. szafka bez półki w środku
            w ogóle nie dałaby się kliknąć na środku). */}
        <rect x={xMm} y={svgY} width={widthMm} height={heightMm} fill="transparent" />
        <CabinetFrontDrawing
          x={xMm} y={svgY} width={widthMm} height={heightMm} type={module.type}
          doors={module.doors} shelves={module.shelves}
          externalDrawersHigh={module.externalDrawersHigh} externalDrawersLow={module.externalDrawersLow}
          frontWidth={module.frontWidth}
          bottomHeightMm={module.bottomHeightMm} fridgeNicheHeightMm={module.fridgeNicheHeightMm}
          labelFontSize={px(14)}
        />
        {Number(module.qty) > 1 && (
          <text x={xMm + widthMm - 4} y={svgY + Math.max(10, heightMm * 0.12)} textAnchor="end" fontSize={px(14)} fontWeight={600} fill="currentColor">
            ×{module.qty}
          </text>
        )}
      </g>
    );
  };

  // Etap AD, krok 3 — "Szyb wentylacyjny / Słup" na elewacji (Widok X/Y/Y2): blok od podłogi (y=0)
  // do jego WŁASNEJ wysokości (zwykle = sufit, ale user może go obniżyć), na jego absolutnym `xMm`
  // (ta sama logiczna przestrzeń co cabinet-y — `mirrorSpanX` zajmuje się ewentualnym odbiciem Y).
  const renderPillarElevation = (pillar) => {
    const widthMm = Math.max(1, Number(pillar.widthMm) || 1);
    const heightMm = Math.max(1, Number(pillar.heightMm) || ceilingHeight);
    const xMm = mirrorSpanX(Number(pillar.xMm) || 0, widthMm);
    const svgY = svgYFor(heightMm);
    const clipId = `pillar-elevation-hatch-${pillar.id}`;
    const hatchSpacingMm = Math.max(40, widthMm / 4);
    const hatchOffsets = [];
    for (let offset = -heightMm; offset < widthMm + heightMm; offset += hatchSpacingMm) hatchOffsets.push(offset);
    const labelX = xMm + widthMm / 2;
    const isDraggingThis = pillarDragState?.pillarId === pillar.id;
    return (
      <g
        key={pillar.id}
        role="button" tabIndex={0} aria-label={`${pillar.name || 'Szyb'} ${Math.round(widthMm)}×${Math.round(heightMm)} mm`}
        className={`${s.pillarGroup} ${isDraggingThis ? s.pillarDragging : ''}`}
        onPointerDown={event => handlePillarPointerDown(event, pillar)}
        onClick={() => handlePillarClick(pillar.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') handlePillarClick(pillar.id); }}
      >
        <clipPath id={clipId}><rect x={xMm} y={svgY} width={widthMm} height={heightMm} /></clipPath>
        <rect x={xMm} y={svgY} width={widthMm} height={heightMm} className={s.pillarBlock} />
        <g clipPath={`url(#${clipId})`} className={s.pillarHatch}>
          {hatchOffsets.map(offset => (
            <line key={offset} x1={xMm + offset} y1={svgY} x2={xMm + offset + heightMm} y2={svgY + heightMm} />
          ))}
        </g>
        <text x={labelX} y={svgY + px(20)} textAnchor="middle" fontSize={px(13)} fontWeight={700} fill="currentColor">
          {pillar.name || 'Szyb'}
        </text>
        <text x={labelX} y={svgY + px(40)} textAnchor="middle" fontSize={px(13)} fontWeight={700} fill="currentColor">
          {`${Math.round(widthMm)}×${Math.round(heightMm)}`}
        </text>
      </g>
    );
  };

  // Etap AD, krok 4 — punkt instalacji na elewacji (Widok X/Y/Y2): kropka DOKŁADNIE w (X,H),
  // pionowy wynosnik kreskowany do podłogi (pokazuje H wizualnie), poziomy wynosnik kreskowany do
  // podpisu z ikoną + "X: .../H: ..." (dokładne współrzędne, zgłoszenie). `warn` (np. zona zmywarki)
  // dokleja ⚠️ przy H. `sideCollision` (zgłoszenie po REVIEW PASSED: punkt w ±40mm od lewej/prawej
  // krawędzi jakiejkolwiek szafki na TYM SAMYM ярусie wysokości) dokleja osobną linię "⚠️ Kolizja z
  // bokiem szafki" pod spodem.
  const renderInstallationPointElevation = (point, warn, sideCollision) => {
    const absoluteXMm = installationPointAbsoluteXMm(point, nominalWallWidthMm);
    const screenX = mirrorPointX(absoluteXMm);
    const heightMm = Math.max(0, Number(point.heightMm) || 0);
    const svgY = svgYFor(heightMm);
    const style = INSTALLATION_POINT_STYLE[point.type] || INSTALLATION_POINT_STYLE.socket;
    const dotR = Math.max(5, wallExtentWidthMm * 0.0035);
    const labelGapMm = Math.max(16, wallExtentWidthMm * 0.012);
    const iconX = screenX + labelGapMm;
    const textX = iconX + px(18);
    return (
      <g key={point.id}>
        <line x1={screenX} y1={svgY} x2={screenX} y2={svgYFor(0)} stroke={style.color} strokeDasharray="5 4" strokeWidth={1.2} opacity={0.55} />
        <line x1={screenX} y1={svgY} x2={iconX} y2={svgY} stroke={style.color} strokeDasharray="5 4" strokeWidth={1.2} opacity={0.55} />
        <circle cx={screenX} cy={svgY} r={dotR} fill={style.color} stroke="#fff" strokeWidth={1} />
        <text x={iconX} y={svgY} dominantBaseline="middle" fontSize={px(16)}>{style.icon}</text>
        <text x={textX} y={svgY - px(4)} fontSize={px(12)} fontWeight={700} fill={style.color}>
          {`X: ${Math.round(Number(point.distanceMm) || 0)}`}
        </text>
        <text x={textX} y={svgY + px(13)} fontSize={px(12)} fontWeight={700} fill={style.color}>
          {`H: ${Math.round(heightMm)}${warn ? ' ⚠️' : ''}`}
        </text>
        {sideCollision && (
          <text x={textX} y={svgY + px(30)} fontSize={px(12)} fontWeight={700} fill="var(--tone-danger, #d33)">
            ⚠️ Kolizja z bokiem szafki
          </text>
        )}
      </g>
    );
  };

  return (
    <div className={s.canvasWrap}>
      {renderCanvasHeader()}
      <svg
        ref={svgRef}
        className={s.canvasSvg}
        role="img"
        aria-label={`Rysunek 2D elewacji ściany ${elevationWall}, w milimetrach`}
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMinYMin meet"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Etap O, krok 2 — kontur ściany: CZERWONY i zatrzymany na nominalnej szerokości, gdy
            szafki wyszły poza ścianę (overflowMm > 0) — rzeczywisty rysunek i tak jedzie dalej
            (wallExtentWidthMm), żeby było widać, O ILE user przekroczył ścianę. */}
        <rect
          x={mirrorSpanX(0, nominalWallWidthMm)} y={0} width={nominalWallWidthMm} height={ceilingHeight} fill="none"
          stroke={overflowMm > 0 ? 'var(--tone-danger, #d33)' : 'currentColor'}
          strokeWidth={Math.max(2, wallExtentWidthMm / 500)}
        />
        {/* Etap P, krok 1 — tylko podświetlenie strefy TUTAJ (fill, bez tekstu) — plakietka
            "Przekroczono"/"Wolne" żyje w górnym pasie wymiarowym (patrz Badge niżej), żeby nigdy nie
            nachodzić na linie rysunku szafek ani na pionowe wymiary po prawej. */}
        {overflowMm > 0 && <rect x={mirrorSpanX(nominalWallWidthMm, overflowMm)} y={0} width={overflowMm} height={ceilingHeight} className={s.overflowZone} />}
        {overflowMm <= 0 && occupiedWidthMm < nominalWallWidthMm && (
          <rect x={mirrorSpanX(occupiedWidthMm, nominalWallWidthMm - occupiedWidthMm)} y={0} width={nominalWallWidthMm - occupiedWidthMm} height={ceilingHeight} className={s.freeZone} />
        )}

        {ticks.map((tick, index) => (
          <g key={tick.mm}>
            <line x1={viewBoxX} y1={svgYFor(tick.mm)} x2={wallExtentWidthMm} y2={svgYFor(tick.mm)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="8 8" strokeWidth={Math.max(1, wallExtentWidthMm / 1200)} />
            {/* Etap T, krok 2 — kolidująca etykieta (patrz tickLabelYs wyżej) dostaje wymuszony
                minimalny odstęp W Y od poprzedniej, żeby jej liczba nigdy nie nachodziła na sąsiednią
                — linia (powyżej) zostaje na PRAWDZIWEJ wysokości tick-a, przesuwa się tylko cyfra.
                Etap S, krok 2 — słowny sufiks (" — antresola" itd.) USUNIĘTY z samej liczby. Bare
                number ISO/ЕСКД (jak reszta wymiarów od Etapu Q) + `<title>` (natywny tooltip na
                hover) — informacja "co to za wysokość" zostaje, tylko nie na stałe w samym rysunku. */}
            <text
              x={viewBoxX + rulerMm * 0.04}
              y={tickLabelYs[index]}
              fontSize={px(14)} fontWeight={600} fill="currentColor"
            >
              {tick.label && <title>{tick.label}</title>}
              {Math.round(tick.mm)}
            </text>
          </g>
        ))}

        {/* Etap U, krok 3 — Blat rysuje się jako OSOBNE segmenty, tylko nad ciągłymi odcinkami Szafek
            dolnych — Słupek PRZERYWA segment (sięga prawie pod sufit, bez blatu nad sobą). */}
        {countertopSegments.map(segment => (
          <rect
            key={segment.start}
            data-testid="countertop-strip"
            x={segment.start} y={svgYFor(countertopTopMm)} width={Math.max(1, segment.end - segment.start)}
            height={Math.max(1, countertopTopMm - countertopBottomMm)}
            className={s.countertopStrip}
          />
        ))}

        {/* Etap AC, krok 1 — zgłoszenie (Screenshot_2_3.jpg): po prawej (róg ze ścianą X) musi stać
            BOCZNA PROJEKCJA tego, co naprawdę zajmuje ten róg na ścianie X (np. Pod lodówkę, Gł.
            560mm) — inaczej prawa część Widoku Y wygląda jak "puste miejsce" zamiast fizycznej
            przeszkody, przez którą szafki ściany Y nie mogą przejść. Lekka ukośna kreskowana
            (odróżnia "to nie Twoja szafka" od realnych frontów), podpis "← Ściana X" (obrócony,
            mieści się w wąskim pasie) i głębokość u góry. Etap AD, krok 2 — Widok Y2 (prawa ściana,
            BEZ odbicia) dostaje TEN SAM blok, tylko po LEWEJ (blockX=0 — dokładnie tam, gdzie
            floorLayout wyżej zostawił "dziurę" po swoim offsetcie o cornerDepthX). */}
        {needsCornerOffset && cornerDepthX > 0 && (() => {
          const blockX = mirrorWallY ? wallExtentWidthMm - cornerDepthX : 0;
          const hatchSpacingMm = Math.max(60, cornerDepthX / 4);
          const hatchOffsets = [];
          for (let offset = -ceilingHeight; offset < cornerDepthX + ceilingHeight; offset += hatchSpacingMm) {
            hatchOffsets.push(offset);
          }
          const labelX = blockX + cornerDepthX / 2;
          const labelY = ceilingHeight / 2;
          return (
            <g>
              <clipPath id="wall-elevation-corner-hatch-clip">
                <rect x={blockX} y={0} width={cornerDepthX} height={ceilingHeight} />
              </clipPath>
              <rect x={blockX} y={0} width={cornerDepthX} height={ceilingHeight} className={s.cornerSliceElevation} />
              <g clipPath="url(#wall-elevation-corner-hatch-clip)" className={s.cornerSliceHatch}>
                {hatchOffsets.map(offset => (
                  <line key={offset} x1={blockX + offset} y1={0} x2={blockX + offset + ceilingHeight} y2={ceilingHeight} />
                ))}
              </g>
              <text
                x={labelX} y={labelY - px(14)} textAnchor="middle" dominantBaseline="middle"
                fontSize={px(13)} fontWeight={700} fill="currentColor"
                transform={`rotate(-90 ${labelX} ${labelY - px(14)})`}
              >
                ← Ściana X
              </text>
              <text x={labelX} y={px(22)} textAnchor="middle" fontSize={px(14)} fontWeight={700} fill="currentColor">
                {Math.round(cornerDepthX)}
              </text>
            </g>
          );
        })()}

        {ROW_GROUPS.flatMap(groupKey => rowItems[groupKey].map((entry, index) => renderCabinet(groupKey, entry, index)))}
        {elevationPillars.map(pillar => renderPillarElevation(pillar))}
        {installationPointsForWall(elevationWall).map((point) => {
          const absoluteXMm = installationPointAbsoluteXMm(point, nominalWallWidthMm);
          const warn = floorLayout.entries.some(entry => (
            entry.module.type === 'dishwasher_front' && absoluteXMm >= entry.xMm && absoluteXMm <= entry.xMm + entry.widthMm
          ));
          // Etap AD, krok 4 (po REVIEW PASSED) — kolizja z bokiem szafki: punkt w ±40mm od lewej/
          // prawej krawędzi JAKIEJKOLWIEK szafki na TYM SAMYM ярусie wysokości (band tej konkretnej
          // szafki obejmuje H punktu) — pomijamy "Zabudowa zmywarki" (wolno stojący sprzęt, bez
          // fizycznego boku do kolizji, ma już własne ostrzeżenie `warn` wyżej).
          const pointHeightMm = Number(point.heightMm) || 0;
          const SIDE_PANEL_TOLERANCE_MM = 40;
          const sideCollision = ROW_GROUPS.some(groupKey => rowItems[groupKey].some((entry) => {
            if (entry.module.type === 'dishwasher_front') return false;
            const band = bandFor(groupKey, entry.heightMm);
            if (pointHeightMm < band.bottom || pointHeightMm > band.top) return false;
            const left = entry.xMm;
            const right = entry.xMm + entry.widthMm;
            return Math.abs(absoluteXMm - left) <= SIDE_PANEL_TOLERANCE_MM || Math.abs(absoluteXMm - right) <= SIDE_PANEL_TOLERANCE_MM;
          }));
          return renderInstallationPointElevation(point, warn, sideCollision);
        })}

        {dragState && (() => {
          const items = rowItems[dragState.groupKey];
          const logicalBoundaryX = dragState.overIndex >= items.length
            ? (items[items.length - 1]?.xMm || 0) + (items[items.length - 1]?.widthMm || 0)
            : items[dragState.overIndex].xMm;
          const boundaryX = mirrorPointX(logicalBoundaryX);
          return <line x1={boundaryX} y1={0} x2={boundaryX} y2={ceilingHeight} className={s.dropIndicator} />;
        })()}

        {/* Etap O, krok 2 — gabaryty wprost na rysunku: pełna szerokość ściany U GÓRY, pełna
            wysokość sufitu + wolne miejsce pod sufitem Z PRAWEJ. Etap P, krok 1 — plakietka
            "Wolne"/"Przekroczono" żyje w TYM SAMYM, górnym rzędzie co "Zajęte", ale nad swoim WŁASNYM
            odcinkiem X (zajęte/wolne nigdy się nie pokrywają) — nigdy nie koliduje z pionowymi
            wymiarami po prawej (te zaczynają się dopiero ZA wallExtentWidthMm). Etap Q, krok 3 (a) —
            same cyfry, bez słów/jednostki (ISO/ЕСКД); pozycja pasów liczona wyżej (topDimLineY/
            bottomDimLineY), w px ekranu, nie proporcjonalnie do topMarginMm. */}
        {/* Etap AC, krok 1 — x1/x2 odbite I zamienione miejscami (mirrorPointX(x2_stary) jako nowy
            x1 — zostaje x1<x2, bo oba punkty logiczne spełniały 0 < L), żeby bracket wymiarowy
            fizycznie przesunął się na właściwą stronę razem z resztą zawartości. */}
        <HorizontalDimension
          x1={mirrorPointX(nominalWallWidthMm)} x2={mirrorPointX(0)} y={topDimLineY}
          label={Math.round(nominalWallWidthMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine}
        />
        <HorizontalDimension
          x1={mirrorPointX(occupiedWidthMm)} x2={mirrorPointX(0)} y={bottomDimLineY}
          label={Math.round(occupiedWidthMm)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine}
        />
        {overflowMm > 0 && (
          <Badge
            x={mirrorPointX(nominalWallWidthMm + overflowMm / 2)} y={bottomDimLineY}
            text={String(Math.round(overflowMm))} fontSize={px(15)} className={s.overflowBadge}
          />
        )}
        {overflowMm <= 0 && occupiedWidthMm < nominalWallWidthMm && (
          <Badge
            x={mirrorPointX((occupiedWidthMm + nominalWallWidthMm) / 2)} y={bottomDimLineY}
            text={String(Math.round(nominalWallWidthMm - occupiedWidthMm))} fontSize={px(15)} className={s.freeBadge}
          />
        )}
        {/* Etap AA, krok 1 — zgłoszenie: druga, "wolne pod sufitem" linia wymiarowa (tuż obok
            głównej wysokości sufitu) dawała dwie niemal identyczne liczby ("2600"/"2580") stojące
            o kreskę od siebie — myląco wyglądało na usterkę/szum. Zostaje TYLKO główna wysokość
            sufitu (patrz zadanie: "zostaw tylko ogólną linię wymiarową wysokości sufitu"). */}
        <VerticalDimension
          y1={ceilingHeight} y2={0} x={wallExtentWidthMm + rightMarginMm * 0.3}
          label={Math.round(ceilingHeight)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine}
        />
        {/* Etap AB, krok 1 — zgłoszenie (скинали.jpg): brakowało wymiaru wysokości fartucha/skinali
            (odcinek między wierzchem blatu a dołem Szafek górnych, "pas roboczy") — stolarz musiał
            sam liczyć 1500-900. Druga linia wymiarowa po prawej (wolny slot po usuniętej "wolne pod
            sufitem" wyżej) pokazuje go wprost, np. "600". Liczona z heights (countertopHeight +
            backsplashHeight), NIE z rzeczywistych szafek — widoczna nawet gdy jarus Górnych jest
            jeszcze pusty (to wymiar INSTALACJI, jak Cokół/Blat/Fartuch w przekroju bocznym). */}
        <VerticalDimension
          y1={svgYFor(countertopTopMm)} y2={svgYFor(countertopTopMm + backsplashHeight)}
          x={wallExtentWidthMm + rightMarginMm * 0.72}
          label={Math.round(backsplashHeight)} fontSize={dimFontMm} gapMm={dimGapMm} className={s.dimensionLine}
        />
      </svg>
    </div>
  );
}
