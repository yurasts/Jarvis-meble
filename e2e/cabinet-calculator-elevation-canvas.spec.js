import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Etap N, krok 3 — WallElevationCanvas: rysunek 2D elewacji ściany kuchennej 1:1 w mm, z
// przestawianiem szafek myszką (Pointer Events wewnątrz rysunku) i przeciągnięciem kafelka presetu
// z palety "+ Dodaj moduł" na rysunek (natywne HTML5 Drag and Drop). Realny, prawdziwy drag
// wymaga przeglądarki z layoutem SVG — niemożliwe do wiarygodnej symulacji w jsdom (patrz
// CabinetCalculator.test.jsx), stąd te scenariusze żyją tu, nie w testach komponentowych.
const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edgeBody = { id: 3, name: 'ABS W960 SM Biały', category: 'Obrzeże', unit: 'mb', price: 1.13, price_history: [] };
const edgeFront = { id: 9, name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', unit: 'mb', price: 4.2, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

const groupSection = (calculator, label) => calculator
  .getByRole('button', { name: new RegExp(`^[▸▾]\\s*${label}`) })
  .locator('xpath=ancestor::div[contains(@class,"groupSection")]');
// Etap U, krok 1 — tabela po prawej jest teraz JEDNA, WSPÓLNA dla wszystkich grup kuchennych naraz
// (zgrupowana Ściana -> jarus -> wiersze, patrz renderUnifiedKitchenTable) — nie ma już osobnego
// kontenera PER GRUPĘ (dawne `data-group-table`, Etap T). `groupRowsFor` wybiera tylko wiersze
// JEDNEJ grupy po jej `data-row-group` (ustawianym na KAŻDYM wierszu modułu, niezależnie od tego,
// w którym jarusie/ścianie akurat się znalazł).
const groupRowsFor = async (calculator, label) => {
  const groupKey = await groupSection(calculator, label).getAttribute('data-group-palette');
  return calculator.locator(`[data-row-group="${groupKey}"]`);
};

const openCalculator = async (page) => {
  // Etap Q, krok 4 — rysunek i tabela żyją teraz obok siebie (2-kolumnowy układ, patrz
  // .calculatorLayout) — przy domyślnym (wąskim) viewporcie Playwright canvas renderuje się
  // proporcjonalnie WYSOKI, spychając dolne szafki poza widoczny obszar; szerszy viewport (jak w
  // cabinet-calculator-table-layout.spec.js) daje obu kolumnom dość miejsca.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();
  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  return page.getByText('📐 Kalkulator', { exact: true }).locator('..');
};
// Etap Q, krok 1 — panel "Wymiary ściany i wysokości" (Obszar 1/2) żyje za gear-przyciskiem w
// nagłówku, zwinięty domyślnie — trzeba go rozwinąć zanim jego pola staną się dostępne.
const expandHeightsPanel = (calculator) => calculator
  .getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ }).click();

test('WallElevationCanvas is visible under Kuchnia, hidden under other categories, and grows with added cabinets', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  await expect(canvas).toBeVisible();
  const rectsBefore = await canvas.locator('rect').count();

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await expect(async () => {
    expect(await canvas.locator('rect').count()).toBeGreaterThan(rectsBefore);
  }).toPass();

  await calculator.getByLabel('Typ zabudowy').selectOption('wardrobe');
  await expect(canvas).not.toBeVisible();
});

// Etap AF, krok 1 — zgłoszenie: klik na szafkę na rysunku przesuwał całą stronę
// (`scrollIntoView({block:'center'})` wycentrowujący jej wiersz) — user tracił orientację, gdzie
// jest ekran. Zaznaczenie ma zostać WYŁĄCZNIE wizualne — strona i jej kontenery przewijania
// NIERUCHOME (ani `window`, ani żaden przewijany kontener-rodzic).
test('clicking a cabinet on the canvas highlights its row, WITHOUT scrolling the page at all', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Pod zlew', exact: true }).click();

  // Przewijamy stronę o konkretną, dowolną wartość PRZED klikiem — żeby test faktycznie dowodził
  // "nic się nie rusza", a nie tylko "strona akurat już była na górze" (scrollY=0 byłoby fałszywym
  // potwierdzeniem nawet ze starym, usuniętym scrollIntoView).
  await page.evaluate(() => window.scrollTo(0, 120));
  const scrollYBefore = await page.evaluate(() => window.scrollY);

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const cabinets = canvas.locator('[data-module-id]');
  await expect(cabinets).toHaveCount(2);

  const secondCabinetId = await cabinets.nth(1).getAttribute('data-module-id');
  // `.click()` z pełnym sprawdzeniem "actionability" zawiesza się na <g> SVG — klikamy bezpośrednio
  // w środek jego bounding boksu przez page.mouse (ten sam, sprawdzony wzorzec co w teście drag niżej).
  const secondBox = await cabinets.nth(1).boundingBox();
  await page.mouse.click(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);

  const highlightedRow = calculator.locator(`[data-module-row="${secondCabinetId}"]`);
  await expect(highlightedRow).toHaveClass(/rowHighlighted/);
  const scrollYAfter = await page.evaluate(() => window.scrollY);
  expect(scrollYAfter).toBe(scrollYBefore);
});

// Etap AA, krok 3 — zgłoszenie: klik na JUŻ wybranej (podświetlonej) szafce na rysunku otwiera
// CabinetSettingsModal — pierwszy klik na szafkę tylko ją wybiera/podświetla (jak dotychczas),
// DOPIERO drugi klik na TĘ SAMĄ, już aktywną szafkę otwiera modal ze szczegółami/formatkami.
test('clicking an ALREADY-selected cabinet on the canvas opens CabinetSettingsModal (second click = szczegóły)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const cabinet = canvas.locator('[data-module-id]').first();
  const box = await cabinet.boundingBox();

  // Pierwszy klik: tylko wybiera/podświetla, modal NIE otwiera się.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(cabinet).toHaveClass(/cabinetSelected/);
  await expect(page.getByTestId('cabinet-settings-modal')).not.toBeVisible();

  // Drugi klik na TĘ SAMĄ, już wybraną szafkę: otwiera modal ze szczegółami/formatkami.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const modal = page.getByTestId('cabinet-settings-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Z drzwiami');
});

// Etap T, krok 3 — podświetlenie jest DWUSTRONNE: klik/hover na wierszu tabeli podświetla
// odpowiadającą szafkę NA RYSUNKU (odwrotny kierunek niż test wyżej), i to zarówno dla kliku, jak
// i dla samego najechania myszką (bez kliku).
test('hovering or clicking a table row highlights the matching cabinet on the drawing (tabela -> rysunek)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Pod zlew', exact: true }).click();

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const cabinets = canvas.locator('[data-module-id]');
  await expect(cabinets).toHaveCount(2);
  const secondCabinetId = await cabinets.nth(1).getAttribute('data-module-id');
  const cabinet = canvas.locator(`[data-module-id="${secondCabinetId}"]`);
  const row = calculator.locator(`[data-module-row="${secondCabinetId}"]`);

  // Hover (bez kliku) -> podświetlenie chwilowe, znika po zjechaniu myszką.
  await row.hover();
  await expect(cabinet).toHaveClass(/cabinetHovered/);
  await calculator.getByText('📐 Kalkulator', { exact: true }).hover();
  await expect(cabinet).not.toHaveClass(/cabinetHovered/);

  // Klik -> podświetlenie TRWAŁE (selected), ten sam niebieski kontur co hover.
  await row.click();
  await expect(cabinet).toHaveClass(/cabinetSelected/);
});

test('dragging a cabinet with the mouse inside the canvas reorders it within its row, and the table reflects the new order', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Pod zlew', exact: true }).click();

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const cabinets = canvas.locator('[data-module-id]');
  await expect(cabinets).toHaveCount(2);

  const firstId = await cabinets.nth(0).getAttribute('data-module-id');
  const secondId = await cabinets.nth(1).getAttribute('data-module-id');
  const bottomRows = await groupRowsFor(calculator, '⬇️ Szafki dolne');
  const groupRows = () => bottomRows;
  await expect(groupRows().nth(0)).toHaveAttribute('data-module-row', firstId);
  await expect(groupRows().nth(1)).toHaveAttribute('data-module-row', secondId);

  // Przeciągnięcie pierwszej szafki (myszką, Pointer Events) na drugą pozycję w tym samym rzędzie.
  const firstBox = await cabinets.nth(0).boundingBox();
  const secondBox = await cabinets.nth(1).boundingBox();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width * 0.9, secondBox.y + secondBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(groupRows().nth(0)).toHaveAttribute('data-module-row', secondId);
  await expect(groupRows().nth(1)).toHaveAttribute('data-module-row', firstId);
});

test('dragging an add-module tile onto the canvas inserts a new cabinet in that row (native HTML5 Drag and Drop)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  const bottomRows = await groupRowsFor(calculator, '⬇️ Szafki dolne');
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const rowsBefore = await bottomRows.count();

  const tile = bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true });
  await expect(tile).toHaveAttribute('draggable', 'true');

  // Realny, OS-poziomowy drag (dragTo) bywa niestabilny dla niestandardowych drop-zone'ów (SVG) —
  // dispatchujemy sekwencję dragstart/dragover/drop wprost z jednym, współdzielonym DataTransfer,
  // identycznie jak zrobiłaby to prawdziwa przeglądarka po geście myszką (ta sama ścieżka kodu,
  // handleDragStart/handleDragOver/handleDrop w WallElevationCanvas.jsx, tylko bez niedeterminizmu
  // natywnej symulacji wejścia).
  // Lewy-dolny róg rysunku = podłoga/szafki dolne (oś Y SVG rośnie w dół, sufit jest u góry) — tam
  // upuszczamy, żeby trafić w rząd "Szafki dolne", nie w antresolę/sufit (góra rysunku).
  const canvasBox = await canvas.boundingBox();
  await page.evaluate(([source, target, x, y]) => {
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }));
  }, [await tile.elementHandle(), await canvas.elementHandle(), canvasBox.x + 40, canvasBox.y + canvasBox.height - 20]);

  await expect(async () => {
    expect(await bottomRows.count()).toBe(rowsBefore + 1);
  }).toPass();
});

// Etap Q, krok 2 — "Cokół" (dawniej panel "Blendy i cokół") jest teraz ZWYKŁYM, dodawalnym modułem
// (plinth_strip) — jego powierzchnia/kromka dolicza się do TEJ SAMEJ Płyty korpusu grupy, co reszta.
test('"Cokół" (zwykły moduł) adds its area into the existing Płyta korpusu row', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const bodyBoardRow = calculator.locator('tr').filter({ hasText: 'Płyta korpusu' });
  const before = await bodyBoardRow.textContent();

  await bottomGroup.getByRole('button', { name: 'Cokół', exact: true }).click();

  await expect(async () => {
    const after = await bodyBoardRow.textContent();
    expect(after).not.toBe(before);
  }).toPass();
});

// Etap O, krok 1 — bug ze zgłoszenia: zmiana Wysokość blatu zostawiała szczelinę pod blatem, bo
// wysokości dodanych szafek nie przeliczały się same. Reaktywna synchronizacja musi być widoczna
// NA ŻYWO zarówno w tabeli, jak i na samym rysunku (etykieta "W×H" szafki).
test('changing Wysokość blatu reactively resizes already-added cabinets on the drawing, with no gap under the countertop', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  await expect(canvas).toContainText('600×757');
  // Etap R, krok 2 — "Wys. (mm)" to teraz klik-do-edycji ("✎757"), nie zawsze-widoczny <input>.
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/757/);

  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Wysokość blatu (mm)').fill('981');

  // Bez klikania żadnego przycisku: i tabela, i rysunek pokazują nową wysokość (838), nie starą (757).
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/838/);
  await expect(canvas).toContainText('600×838');
  await expect(canvas).not.toContainText('600×757');
});

// Etap O, krok 2 — gabaryty i wolny odcinek ściany wprost na rysunku. Etap Q, krok 3 (a) — bare
// numbers only (ISO/ЕСКД): linie wymiarowe nie niosą już słów "Szerokość ściany:"/"Zajęte:"/
// "Wolne:"/"mm" — tylko liczbę nad linią; plakietka wolnego miejsca (zielone tło) pokazuje samą liczbę.
test('shows bare-number dimension lines and a free-space badge, updating as cabinets are added', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const freeBadgeText = canvas.locator('[class*="freeBadge"] + text');

  await expect(canvas.locator('[class*="dimensionLine"] text').first()).toHaveText('3000'); // szerokość ściany
  await expect(freeBadgeText).toHaveText('3000'); // nic dodane -> cała ściana wolna

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expect(freeBadgeText).toHaveText('2400');
});

// Etap O, krok 3 — przełącznik widoku: Widok X (elewacja), Widok Y (przekrój boczny w układzie
// prostym), Widok z góry (rzut z głębokościami).
test('switches between Widok X / Widok Y / Widok z góry', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expect(calculator.getByRole('img', { name: /Rysunek 2D elewacji ściany X/ })).toBeVisible();

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  await expect(calculator.getByRole('img', { name: /Widok z góry/ })).toBeVisible();

  await calculator.getByRole('button', { name: /Widok Y/ }).click();
  await expect(calculator.getByRole('img', { name: /Przekrój boczny Y/ })).toBeVisible();

  await calculator.getByRole('button', { name: /Widok X/ }).click();
  await expect(calculator.getByRole('img', { name: /Rysunek 2D elewacji ściany X/ })).toBeVisible();
});

// Etap O, krok 3 — kuchnia narożna L: przełączenie układu, przerzucenie szafki na ścianę Y (1 klik
// w tabeli) i sprawdzenie, że "Widok z góry" pokazuje obie ściany pod kątem 90°.
test('Narożny L: toggling a cabinet to wall Y moves it off wall X and onto the perpendicular wall in Widok z góry', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  await expect(calculator.getByLabel('Szerokość ściany Y (mm)')).toBeVisible();

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: 'Y', exact: true }).click();

  await expect(calculator.getByText(/Zajęte \(ściana X\):/)).toContainText('Zajęte (ściana X): 0 / 3000 mm');
  await expect(calculator.getByText(/Zajęte \(ściana Y\):/)).toContainText('Zajęte (ściana Y): 600');

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView = calculator.getByRole('img', { name: /Widok z góry/ });
  await expect(topView).toContainText('600×520');
  // Etap V, krok 3 — bez słów "Wolne Y:"/"mm" (ISO/ЕСКД, jak Widok X) — tylko czyste liczby nad
  // strzałkami wymiarowymi: pełna ściana Y + zajęta/wolna (patrz dedykowany test niżej).
  await expect(topView).not.toContainText('Wolne Y:');
  await expect(topView.locator('[class*="dimensionLine"] text').first()).toBeVisible();
});

// Etap X, krok 1 — zgłoszenie (Screenshot_6.jpg): na Widoku z góry fronty/uchwyty szafek ściany Y
// rysowały się po stronie ŚCIANY (lewa grań, x=0 — tył korpusu), a powinny być po stronie WNĘTRZA
// (prawa grań, x=głębokość — tam, gdzie fizycznie otwiera się front).
test('Narożny L: Widok z góry — front szafki ściany Y jest po PRAWEJ (do wnętrza kuchni), nie przy ścianie', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: 'Y', exact: true }).click();

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView = calculator.getByRole('img', { name: /Widok z góry/ });
  const cabinet = topView.getByRole('button', { name: /Z drzwiami/ });
  const cabinetBox = await cabinet.locator('rect').boundingBox();
  const frontLine = cabinet.locator('[data-front-edge="right"]');
  await expect(frontLine).toHaveCount(1);
  const frontBox = await frontLine.boundingBox();
  // Front po PRAWEJ: linia frontu leży blisko PRAWEJ krawędzi prostokąta (x+width), nie lewej (x,
  // przy ścianie) — tolerancja na grubość samej linii (stroke-width).
  expect(frontBox.x).toBeGreaterThan(cabinetBox.x + cabinetBox.width * 0.7);
});

// Etap X, krok 2 — zgłoszenie (Screenshot_6.jpg, czerwona ramka): w rogu (0,0) szafka ściany X
// (stojąca w rogu) i pierwsza szafka ściany Y rysowały się JEDNA NA DRUGIEJ (te same piksele),
// podpisy się slepiały. Pas podłogowy ściany Y musi zaczynać się DOPIERO za głębokością tego, co
// realnie stoi w rogu ściany X (patrz computeCornerDepthMm, cabinetCalculator.js).
test('Narożny L: Widok z góry — szafka w rogu ściany X i pierwsza szafka ściany Y nie nakładają się', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  // "Z drzwiami" zostaje w rogu ściany X (domyślnie D=520, PRZYKRYTY blatem 600mm -> corner=600mm).
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  // "Z szufladami" przestawiamy na ścianę Y — to ten konkretny przypadek ze zgłoszenia.
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z szufladami', exact: true }).click();
  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  const drawerRow = calculator.locator('tr').filter({ hasText: 'Z szufladami' });
  await drawerRow.getByRole('button', { name: 'Y', exact: true }).click();

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView = calculator.getByRole('img', { name: /Widok z góry/ });
  const cornerCabinet = topView.getByRole('button', { name: /Z drzwiami/ });
  const yCabinet = topView.getByRole('button', { name: /Z szufladami/ });
  const cornerBox = await cornerCabinet.locator('rect').boundingBox();
  const yBox = await yCabinet.locator('rect').boundingBox();

  const overlapsX = cornerBox.x < yBox.x + yBox.width && yBox.x < cornerBox.x + cornerBox.width;
  const overlapsY = cornerBox.y < yBox.y + yBox.height && yBox.y < cornerBox.y + cornerBox.height;
  expect(overlapsX && overlapsY).toBe(false);
  // Podpis KAŻDEJ szafki musi zostać czytelny (oddzielny, niesklejony tekst) — nie tylko same
  // prostokąty się nie nakładają, ale i ich etykiety.
  await expect(cornerCabinet.locator('text')).toBeVisible();
  await expect(yCabinet.locator('text')).toBeVisible();
});

// Etap AC, krok 1 — zgłoszenie (Screenshot_2_3.jpg/Screenshot_1_3.jpg): na "Widoku Y" (Bok/Druga
// ściana) narożnik ze ścianą X ma wypadać PO PRAWEJ (ściana Y rysowana "z naprzeciwka" -> odbicie
// względem Widoku X), a szafki ściany Y mają się domykać do tego narożnika i rosnąć w stronę
// wolnego końca PO LEWEJ. Scenariusz liczbowy identyczny z zadania: "Pod lodówkę" (D=560) w rogu
// ściany X, ściana Y=2200mm, 3 moduły 600+600+400=1600mm -> wolny odcinek 2200-1600-560=40mm.
test('Narożny L: Widok Y — narożnik ściany X po PRAWEJ, szafki ściany Y rosną w lewo do wolnego końca', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  // "Pod lodówkę" (D=560, Słupek -> bez blatu nad sobą) jedyny na ścianie X -> stoi w rogu.
  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Pod lodówkę', exact: true }).click();

  // 3 moduły ściany Y, w TEJ kolejności dodawania — decyduje, który wyląduje najbliżej narożnika.
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z szufladami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Pod piekarnik', exact: true }).click();

  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  await calculator.getByLabel('Szerokość ściany Y (mm)').fill('2200');

  for (const label of ['Z drzwiami', 'Z szufladami', 'Pod piekarnik']) {
    await calculator.locator('tr').filter({ hasText: label }).getByRole('button', { name: 'Y', exact: true }).click();
  }
  const ovenRow = calculator.locator('tr').filter({ hasText: 'Pod piekarnik' });
  await ovenRow.getByLabel('Szer. (mm)').click();
  await ovenRow.getByLabel('Szer. (mm)').fill('400');
  await ovenRow.getByLabel('Szer. (mm)').blur();

  await calculator.getByRole('button', { name: /Widok Y/ }).click();
  // W układzie narożnym Widok Y to PEŁNA elewacja ściany Y (nie "przekrój boczny" jak w prostym
  // układzie bez ściany Y) — stąd inna etykieta aria niż w teście "switches between Widok X/Y...".
  const canvas = calculator.getByRole('img', { name: /elewacji ściany Y/ });

  const cornerBlock = canvas.locator('[class*="cornerSliceElevation"]');
  await expect(cornerBlock).toBeVisible();
  await expect(canvas.getByText('← Ściana X')).toBeVisible();
  await expect(canvas.getByText('560')).toBeVisible();

  const doorsCabinet = canvas.getByRole('button', { name: /^Z drzwiami/ });
  const drawersCabinet = canvas.getByRole('button', { name: /Z szufladami/ });
  const ovenCabinet = canvas.getByRole('button', { name: /Pod piekarnik/ });
  const freeZone = canvas.locator('[class*="freeZone"]');
  const freeBadgeText = canvas.locator('[class*="freeBadge"] + text');

  const [cornerBox, doorsBox, drawersBox, ovenBox, freeBox] = await Promise.all([
    cornerBlock.boundingBox(),
    doorsCabinet.locator('rect').first().boundingBox(),
    drawersCabinet.locator('rect').first().boundingBox(),
    ovenCabinet.locator('rect').first().boundingBox(),
    freeZone.boundingBox(),
  ]);

  // Kolejność na ekranie, od lewej do prawej: wolny odcinek (40mm) -> Pod piekarnik (400, dodany
  // OSTATNI = najbliżej wolnego końca) -> Z szufladami (600) -> Z drzwiami (600, dodany PIERWSZY =
  // najbliżej narożnika) -> narożnik ściany X (560, przy prawej krawędzi).
  expect(freeBox.x).toBeLessThan(ovenBox.x);
  expect(ovenBox.x).toBeLessThan(drawersBox.x);
  expect(drawersBox.x).toBeLessThan(doorsBox.x);
  expect(doorsBox.x).toBeLessThan(cornerBox.x);
  expect(doorsBox.x + doorsBox.width).toBeLessThanOrEqual(cornerBox.x + 2);
  await expect(freeBadgeText).toHaveText('40');

  // Relacje szerokości (niezależne od skali mm -> px): narożnik (560mm) i Z drzwiami/Z szufladami
  // (600mm każda) mają praktycznie tę samą szerokość; Pod piekarnik (400mm) jest wyraźnie węższy.
  expect(Math.abs(cornerBox.width - doorsBox.width)).toBeLessThan(doorsBox.width * 0.15);
  expect(ovenBox.width).toBeLessThan(doorsBox.width * 0.8);
});

// Etap AD, krok 2 — zgłoszenie: obrót kuchni w prawo ("Narożny L — ściana Y z prawej"). Na Widoku z
// góry ściana Y2 ma się przyczepić do PRAWEGO końca ściany X (nie do (0,0) jak klasyczna ściana Y),
// a fronty jej szafek mają patrzeć W LEWO (do wnętrza kuchni) — lustrzane odbicie "Narożny L" wyżej.
test('Narożny L z prawej: Widok z góry — ściana Y2 przy PRAWYM końcu ściany X, fronty w LEWO, bez nakładania na narożnik', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  // "Pod lodówkę" (D=560, Słupek -> bez blatu nad sobą) jedyny na ścianie X -> stoi w (jedynym) rogu.
  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Pod lodówkę', exact: true }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expandHeightsPanel(calculator);
  // "Pod lodówkę" (W=600) musi wypełniać CAŁĄ ścianę X (nie tylko jej fragment), żeby fizycznie
  // dotykać prawej krawędzi — inaczej prawy róg jest PUSTY (patrz computeCornerDepthMm, 'right').
  await calculator.getByLabel('Szerokość ściany / zabudowy (mm)').fill('600');
  await calculator.getByLabel('Układ ścian').selectOption('corner_l_right');
  const drzwiamiRow = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await drzwiamiRow.getByRole('button', { name: 'Y', exact: true }).click();

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView = calculator.getByRole('img', { name: /Widok z góry/ });

  const wallXLine = topView.locator('line').first();
  const wallXBox = await wallXLine.boundingBox();
  const cornerSlice = topView.locator('[class*="cornerSlice"]').first();
  const y2Cabinet = topView.getByRole('button', { name: /Z drzwiami/ });
  const y2Box = await y2Cabinet.locator('rect').boundingBox();
  const cornerBox = await cornerSlice.boundingBox();
  const frontLine = y2Cabinet.locator('[data-front-edge="left"]');
  await expect(frontLine).toHaveCount(1);
  const frontBox = await frontLine.boundingBox();

  // Narożnik (martwa strefa) i szafka ściany Y2 obie "dotykają" PRAWEJ krawędzi ściany X (nie lewej,
  // jak klasyczna ściana Y) — i nie nakładają się na siebie (poza "dotykaniem" granicy — tolerancja
  // na grubość obrysu (stroke), ten sam wzorzec co w analogicznym teście dla ściany Y lewej).
  const wallXRightEdge = wallXBox.x + wallXBox.width;
  expect(Math.abs((cornerBox.x + cornerBox.width) - wallXRightEdge)).toBeLessThan(5);
  expect(Math.abs((y2Box.x + y2Box.width) - wallXRightEdge)).toBeLessThan(5);
  const yOverlapAmount = Math.min(cornerBox.y + cornerBox.height, y2Box.y + y2Box.height) - Math.max(cornerBox.y, y2Box.y);
  expect(yOverlapAmount).toBeLessThan(5);
  // Front po LEWEJ: linia frontu leży blisko LEWEJ krawędzi prostokąta (x), nie prawej.
  expect(frontBox.x).toBeLessThan(y2Box.x + y2Box.width * 0.3);
});

// Etap AD, krok 2 — na rozwinięciu Widoku Y2 (ściana z prawej): narożnik ma wypaść PO LEWEJ (BEZ
// odbicia — odwrotnie niż klasyczny Widok Y), a szafki budują się od niego W PRAWO, zostawiając
// wolny odcinek PO PRAWEJ. Ten sam scenariusz liczbowy co "Widok Y — narożnik po prawej" (lustro).
test('Narożny L z prawej: Widok Y2 — narożnik ściany X po LEWEJ (bez odbicia), szafki rosną w prawo, wolne po prawej', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Pod lodówkę', exact: true }).click();

  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z szufladami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Pod piekarnik', exact: true }).click();

  await expandHeightsPanel(calculator);
  // "Pod lodówkę" (W=600) zostanie JEDYNYM modułem ściany X (reszta trafi na Y2 niżej) — musi
  // wypełniać całą ścianę X, żeby fizycznie dotykać prawej krawędzi (patrz test wyżej).
  await calculator.getByLabel('Szerokość ściany / zabudowy (mm)').fill('600');
  await calculator.getByLabel('Układ ścian').selectOption('corner_l_right');
  await calculator.getByLabel('Szerokość ściany Y prawa (mm)').fill('2200');

  for (const label of ['Z drzwiami', 'Z szufladami', 'Pod piekarnik']) {
    await calculator.locator('tr').filter({ hasText: label }).getByRole('button', { name: 'Y', exact: true }).click();
  }
  const ovenRow = calculator.locator('tr').filter({ hasText: 'Pod piekarnik' });
  await ovenRow.getByLabel('Szer. (mm)').click();
  await ovenRow.getByLabel('Szer. (mm)').fill('400');
  await ovenRow.getByLabel('Szer. (mm)').blur();

  await calculator.getByRole('button', { name: /Widok Y/ }).click();
  const canvas = calculator.getByRole('img', { name: /elewacji ściany Y2/ });

  const cornerBlock = canvas.locator('[class*="cornerSliceElevation"]');
  await expect(cornerBlock).toBeVisible();
  await expect(canvas.getByText('560')).toBeVisible();

  const doorsCabinet = canvas.getByRole('button', { name: /^Z drzwiami/ });
  const drawersCabinet = canvas.getByRole('button', { name: /Z szufladami/ });
  const ovenCabinet = canvas.getByRole('button', { name: /Pod piekarnik/ });
  const freeZone = canvas.locator('[class*="freeZone"]');

  const [cornerBox, doorsBox, drawersBox, ovenBox, freeBox] = await Promise.all([
    cornerBlock.boundingBox(),
    doorsCabinet.locator('rect').first().boundingBox(),
    drawersCabinet.locator('rect').first().boundingBox(),
    ovenCabinet.locator('rect').first().boundingBox(),
    freeZone.boundingBox(),
  ]);

  // Kolejność na ekranie, od lewej do prawej: narożnik (560, PO LEWEJ, bez odbicia) -> Z drzwiami
  // (600, dodany PIERWSZY -> najbliżej narożnika) -> Z szufladami (600) -> Pod piekarnik (400,
  // dodany OSTATNI) -> wolny odcinek (40mm) PO PRAWEJ (odwrotnie niż zwykła ściana Y z lewej).
  expect(cornerBox.x).toBeLessThan(doorsBox.x);
  expect(doorsBox.x).toBeLessThan(drawersBox.x);
  expect(drawersBox.x).toBeLessThan(ovenBox.x);
  expect(ovenBox.x).toBeLessThan(freeBox.x);
  expect(cornerBox.x + cornerBox.width).toBeLessThanOrEqual(doorsBox.x + 2);
});

// Etap AD, krok 2 — "Układ U": OBIE ściany boczne (Y lewa + Y2 prawa) naraz. Przełącznik "Ściana" w
// tabeli ma 3 wartości (X/Y(L)/Y(P)), i Widok z góry pokazuje OBA narożniki jednocześnie.
test('Układ U: przełącznik ściany ma 3 opcje (X/Y(L)/Y(P)), obie ściany Y renderują się naraz na Widoku z góry', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('u_layout');
  await expect(calculator.getByLabel('Szerokość ściany Y (mm)')).toBeVisible();
  await expect(calculator.getByLabel('Szerokość ściany Y prawa (mm)')).toBeVisible();

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await expect(row.getByRole('button', { name: 'X', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Y (L)', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Y (P)', exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Y (P)', exact: true }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z szufladami', exact: true }).click();
  const drawerRow = calculator.locator('tr').filter({ hasText: 'Z szufladami' });
  await drawerRow.getByRole('button', { name: 'Y (L)', exact: true }).click();

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView = calculator.getByRole('img', { name: /Widok z góry/ });
  await expect(topView.getByRole('button', { name: /Z drzwiami/ })).toBeVisible();
  await expect(topView.getByRole('button', { name: /Z szufladami/ })).toBeVisible();
  // Obie szafki ściany Y mają stać po PRZECIWNYCH stronach planu (lewa vs prawa).
  const leftBox = await topView.getByRole('button', { name: /Z szufladami/ }).locator('rect').boundingBox();
  const rightBox = await topView.getByRole('button', { name: /Z drzwiami/ }).locator('rect').boundingBox();
  expect(leftBox.x).toBeLessThan(rightBox.x);
});

// Etap AD, krok 3 — zgłoszenie: "Szyb wentylacyjny / Słup" (element konstrukcyjny ściany, NIE
// szafka) ma nieprzesuwalny odcinek [xMm, xMm+widthMm] — szafka, która by na nim stanęła, musi
// przeskoczyć od razu ZA niego, zarówno na Widoku X jak i na Widoku z góry (ta sama matematyka,
// patrz advancePastPillars w jądrze).
test('"Szyb wentylacyjny / Słup": szafka omija jego odcinek na Widoku X i na Widoku z góry, blok ma kreskowanie i podpis', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj szyb / słup konstrukcyjny' }).click();
  const xField = calculator.getByLabel('Pozycja od lewej (X, mm) — szyb/słup #1');
  await xField.fill('600');
  await expect(calculator.getByLabel('Szerokość (mm) — szyb/słup #1')).toHaveValue('600');
  await expect(calculator.getByLabel('Głębokość (mm) — szyb/słup #1')).toHaveValue('600');

  // Pierwsza "Z drzwiami" (600mm) ląduje na [0,600] -> BEZ kolizji ze słupem [600,1200].
  // Druga "Z drzwiami" (600mm) wylądowałaby na [600,1200] -> KOLIDUJE -> przeskakuje na [1200,1800].
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const pillarBlock = canvas.locator('[class*="pillarBlock"]');
  await expect(pillarBlock).toBeVisible();
  await expect(canvas.locator('[class*="pillarHatch"] line').first()).toBeVisible();
  await expect(canvas.getByText('Szyb wentylacyjny')).toBeVisible();

  const cabinets = canvas.getByRole('button', { name: /^Z drzwiami/ });
  await expect(cabinets).toHaveCount(2);
  const firstBox = await cabinets.nth(0).locator('rect').first().boundingBox();
  const secondBox = await cabinets.nth(1).locator('rect').first().boundingBox();
  const pillarBox = await pillarBlock.boundingBox();

  // Pierwsza szafka dotyka lewej krawędzi słupa (żadnego zbędnego przeskoku); druga zaczyna się
  // dokładnie na prawej krawędzi słupa (przeskoczyła od razu za niego, nie na nim/przed nim).
  expect(Math.abs((firstBox.x + firstBox.width) - pillarBox.x)).toBeLessThan(5);
  expect(Math.abs(secondBox.x - (pillarBox.x + pillarBox.width))).toBeLessThan(5);

  // Ta sama geometria (bez zbędnego przeskoku / z poprawnym przeskokiem) na Widoku z góry.
  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const topView2 = calculator.getByRole('img', { name: /Widok z góry/ });
  const topPillarBox = await topView2.locator('[class*="pillarBlock"]').boundingBox();
  const topCabinets = topView2.getByRole('button', { name: /^Z drzwiami/ });
  const topFirstBox = await topCabinets.nth(0).locator('rect').boundingBox();
  const topSecondBox = await topCabinets.nth(1).locator('rect').boundingBox();
  expect(Math.abs((topFirstBox.x + topFirstBox.width) - topPillarBox.x)).toBeLessThan(5);
  expect(Math.abs(topSecondBox.x - (topPillarBox.x + topPillarBox.width))).toBeLessThan(5);
});

// Etap AF, krok 2 — zgłoszenie: user nie mógł znaleźć, jak dodać szyb/punkt instalacji (ukryte
// głęboko w "Wymiary ściany i wysokości") — 2 przyciski z bejdżem liczby TUŻ NAD rysunkiem.
test('Przyciski "🧱 + Szyb / Słup"/"🔌 Instalacje / Punkt 0" nad rysunkiem: widoczne z bejdżem, dodają słup 600×600 na aktywną ścianę w 1 kliku', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  await expect(canvas).toBeVisible();

  const pillarButton = calculator.getByRole('button', { name: /🧱 \+ Szyb \/ Słup/ });
  const installButton = calculator.getByRole('button', { name: /🔌 Instalacje \/ Punkt 0/ });
  await expect(pillarButton).toBeVisible();
  await expect(installButton).toBeVisible();
  await expect(pillarButton.locator('[class*="quickAccessBadge"]')).toHaveText('0');
  await expect(installButton.locator('[class*="quickAccessBadge"]')).toHaveText('0');

  await pillarButton.click();
  const panel = calculator.getByTestId('pillar-quick-panel');
  await expect(panel).toBeVisible();
  // Widok X jest aktywny domyślnie -> przycisk szybkiego dodania celuje w ścianę X.
  await panel.getByRole('button', { name: /Dodaj 600×600 na ścianę X/ }).click();

  await expect(pillarButton.locator('[class*="quickAccessBadge"]')).toHaveText('1');
  await expect(panel.getByLabel('Ściana — szyb/słup #1')).toHaveValue('X');
  await expect(panel.getByLabel('Szerokość (mm) — szyb/słup #1')).toHaveValue('600');
  await expect(panel.getByLabel('Głębokość (mm) — szyb/słup #1')).toHaveValue('600');
  await expect(canvas.locator('[class*="pillarBlock"]')).toBeVisible();
});

// Etap AF, krok 2 — kliknięcie zaszrafowanego słupa WPROST na rysunku ma od razu otworzyć panel
// jego edycji (pozycja/szerokość/głębokość/wysokość/usuń), nie tylko przycisk w nagłówku.
test('Kliknięcie w słup na rysunku (Widok X) otwiera panel edycji z JEGO polami', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj szyb / słup konstrukcyjny' }).click();
  await calculator.getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ }).click(); // zwiń panel

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const pillarBlock = canvas.locator('[class*="pillarBlock"]');
  await expect(pillarBlock).toBeVisible();
  // `.click()` z pełnym sprawdzeniem "actionability" zawiesza się na elementach SVG (ten sam
  // sprawdzony wzorzec co przy klikaniu szafek — patrz testy wyżej) — klik wprost przez page.mouse.
  const pillarBox = await pillarBlock.boundingBox();
  await page.mouse.click(pillarBox.x + pillarBox.width / 2, pillarBox.y + pillarBox.height / 2);

  const panel = calculator.getByTestId('pillar-quick-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Nazwa — szyb/słup #1')).toHaveValue('Szyb wentylacyjny');
  await expect(panel.getByLabel('Usuń szyb/słup Szyb wentylacyjny')).toBeVisible();
});

// Etap AF, krok 2 — zgłoszenie: słup da się przeciągać myszką wzdłuż ściany na Widoku X/Y/Y2 (tam
// oś pozioma rysunku ZAWSZE jest długością ściany, niezależnie od tego, która to ściana).
test('Przeciąganie słupa myszką na Widoku X przesuwa go wzdłuż ściany (zmienia jego pozycję X)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj szyb / słup konstrukcyjny' }).click();
  await calculator.getByLabel('Pozycja od lewej (X, mm) — szyb/słup #1').fill('200');
  await calculator.getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ }).click(); // zwiń panel

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const pillarBlock = canvas.locator('[class*="pillarBlock"]');
  const boxBefore = await pillarBlock.boundingBox();

  await page.mouse.move(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxBefore.x + boxBefore.width / 2 + 150, boxBefore.y + boxBefore.height / 2, { steps: 5 });
  await page.mouse.up();

  const boxAfter = await pillarBlock.boundingBox();
  expect(boxAfter.x).toBeGreaterThan(boxBefore.x + 50);
});

// Etap AD, krok 4 — zgłoszenie: punkt instalacji (gniazdko/LED/woda) rysuje się na elewacji w
// dokładnych współrzędnych (X: .../H: ...), a "Odległość od punktu 0" liczy się od rogu wybranego w
// "Punkt zerowy (0) dla ściany X" — zmiana rogu (lewy -> prawy) przesuwa punkt na rysunku na DRUGĄ
// stronę ściany, nie zmieniając wpisanej przez usera odległości (wyświetlanej na podpisie "X: 850").
test('Punkt instalacji: rysuje się z podpisem "X: .../H: ...", a zmiana punktu zerowego (0) przerzuca go na drugą stronę ściany', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj punkt instalacji' }).click();
  await calculator.getByLabel('Odległość od punktu 0 (mm) — punkt instalacji #1').fill('850');
  await calculator.getByLabel('Wysokość od podłogi H (mm) — punkt instalacji #1').fill('1100');

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  await expect(canvas.getByText('X: 850')).toBeVisible();
  await expect(canvas.getByText('H: 1100')).toBeVisible();
  const dotBefore = await canvas.locator('circle').first().boundingBox();

  await calculator.getByLabel('Punkt zerowy (0) dla ściany X').selectOption('right');
  // Ta sama wpisana odległość (850mm od TERAZ prawego rogu) -> podpis bez zmian, ale realna pozycja
  // na rysunku się przesuwa (liczona teraz od przeciwnego końca ściany).
  await expect(canvas.getByText('X: 850')).toBeVisible();
  const dotAfter = await canvas.locator('circle').first().boundingBox();
  expect(Math.abs(dotAfter.x - dotBefore.x)).toBeGreaterThan(20);
});

// Etap AD, krok 4 — zgłoszenie: gniazdko/woda w zonie "Zabudowa zmywarki" (wolno stojący sprzęt AGD
// bez korpusu, nie ma gdzie fizycznie wejść) dostaje ostrzegawczy ⚠️ przy podpisie; punkt POZA tą
// zoną (np. pod zlewem) zostaje bez ostrzeżenia.
test('Punkt instalacji w zonie "Zabudowa zmywarki" dostaje ⚠️; punkt poza nią — nie', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  // "Zabudowa zmywarki" (600mm) na [0,600]; "Z drzwiami" (600mm) na [600,1200].
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Zabudowa zmywarki', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj punkt instalacji' }).click();
  await calculator.getByLabel('Typ — punkt instalacji #1').selectOption('water');
  await calculator.getByLabel('Odległość od punktu 0 (mm) — punkt instalacji #1').fill('300'); // w zonie zmywarki [0,600]

  await calculator.getByRole('button', { name: '+ Dodaj punkt instalacji' }).click();
  await calculator.getByLabel('Typ — punkt instalacji #2').selectOption('water');
  await calculator.getByLabel('Odległość od punktu 0 (mm) — punkt instalacji #2').fill('900'); // poza zoną, w "Z drzwiami"

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  // Oba punkty "Woda" mają tę samą domyślną wysokość (550mm) — ostrzeżenie żyje na podpisie "H:",
  // więc rozróżnia je właśnie obecność/brak "⚠️" w tym samym tekście.
  await expect(canvas.getByText('X: 300')).toBeVisible();
  await expect(canvas.getByText('X: 900')).toBeVisible();
  await expect(canvas.getByText('H: 550 ⚠️')).toBeVisible(); // punkt #1 (300mm) -> w zonie zmywarki
  await expect(canvas.getByText('H: 550', { exact: true })).toBeVisible(); // punkt #2 (900mm) -> bez ostrzeżenia
});

// Etap AD, krok 4 (po REVIEW PASSED) — zgłoszenie: punkt instalacji w ±40mm od lewej/prawej krawędzi
// JAKIEJKOLWIEK szafki na tym samym ярусie wysokości dostaje osobne ostrzeżenie "⚠️ Kolizja z bokiem
// szafki"; punkt wyraźnie w środku szafki (poza strefą 40mm) zostaje bez tego konkretnego ostrzeżenia.
test('Punkt instalacji blisko krawędzi szafki (±40mm) dostaje "⚠️ Kolizja z bokiem szafki"; w środku szafki — nie', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  // "Z drzwiami" (600mm) na [0,600]; band wysokości (legHeight..legHeight+bottomHeight) ~ [105,862].
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expandHeightsPanel(calculator);
  await calculator.getByRole('button', { name: '+ Dodaj punkt instalacji' }).click();
  await calculator.getByLabel('Odległość od punktu 0 (mm) — punkt instalacji #1').fill('590'); // 10mm od prawej krawędzi (600)
  await calculator.getByLabel('Wysokość od podłogi H (mm) — punkt instalacji #1').fill('400'); // w bandzie [105,862]

  await calculator.getByRole('button', { name: '+ Dodaj punkt instalacji' }).click();
  await calculator.getByLabel('Odległość od punktu 0 (mm) — punkt instalacji #2').fill('300'); // środek szafki, daleko od krawędzi
  await calculator.getByLabel('Wysokość od podłogi H (mm) — punkt instalacji #2').fill('400');

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  await expect(canvas.getByText('X: 590')).toBeVisible();
  await expect(canvas.getByText('X: 300')).toBeVisible();
  const collisionWarnings = canvas.getByText('⚠️ Kolizja z bokiem szafki');
  await expect(collisionWarnings).toHaveCount(1);
});

// Etap U, krok 2 — zgłoszenie: antresole wyliczały zajętą szerokość ściany jako SUMĘ z Szafkami
// górnymi (zamiast stać w swoim NIEZALEŻNYM rzędzie od X=0) — "Zajęte" wychodziło zawyżone.
test('Antresole stoją we WŁASNYM rzędzie od X=0 — "Zajęte" liczy max(Górne, Antresole), nie ich sumę', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await expandHeightsPanel(calculator);

  const topGroup = groupSection(calculator, '⬆️ Szafki górne');
  await topGroup.getByRole('button', { name: 'Klasyczna (z drzwiami)', exact: true }).click();
  const topRow = calculator.locator('tr').filter({ hasText: 'Klasyczna (z drzwiami)' });
  await topRow.getByLabel('Szer. (mm)').click();
  await topRow.getByLabel('Szer. (mm)').fill('1800');
  await topRow.getByLabel('Szer. (mm)').blur();

  const mezzGroup = groupSection(calculator, '⏫ Antresole / Górny rząd pod sufit');
  await mezzGroup.getByRole('button', { name: 'Klapa pod sufit', exact: true }).click();
  const mezzRow = calculator.locator('tr').filter({ hasText: 'Klapa pod sufit' });
  await mezzRow.getByLabel('Szer. (mm)').click();
  await mezzRow.getByLabel('Szer. (mm)').fill('2200');
  await mezzRow.getByLabel('Szer. (mm)').blur();

  // Gdyby antresola sumowała się z górnymi (stary bug), wyszłoby 1800+2200=4000mm.
  await expect(calculator.getByText(/Zajęte \(ściana X\):/)).toContainText('Zajęte (ściana X): 2200 / 3000 mm');

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const mezzCabinet = canvas.getByRole('button', { name: /Klapa pod sufit/ });
  await expect(mezzCabinet.locator('rect').first()).toHaveAttribute('x', '0');
});

// Etap U, krok 3 — Słupek dzieli JEDEN wspólny napodłogowy rząd z Dolnymi: domyślnie ląduje na
// KOŃCU (po prawej), ale strzałką "◀" da się go przenieść na sam początek (po lewej) — Szafki górne
// i Blat (countertopStrip) muszą zareagować: Górne zaczynają się ZA słupkiem, Blat NIE rysuje się
// nad słupkiem (przerywa segment).
test('Słupek domyślnie ląduje PO PRAWEJ od Dolnych; przeniesiony na początek przesuwa Szafki górne i przerywa Blat', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click(); // 600mm
  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Z półkami', exact: true }).click(); // domyślnie na końcu
  const topGroup = groupSection(calculator, '⬆️ Szafki górne');
  await topGroup.getByRole('button', { name: 'Klasyczna (z drzwiami)', exact: true }).click();

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const bottomCabinet = canvas.getByRole('button', { name: /^Z drzwiami/ });
  const tallCabinet = canvas.getByRole('button', { name: /Z półkami/ });
  const topCabinet = canvas.getByRole('button', { name: /Klasyczna \(z drzwiami\)/ });

  await expect(bottomCabinet.locator('rect').first()).toHaveAttribute('x', '0');
  await expect(tallCabinet.locator('rect').first()).toHaveAttribute('x', '600'); // zaraz za Dolną
  await expect(topCabinet.locator('rect').first()).toHaveAttribute('x', '0'); // słupek na KOŃCU -> Górne od zera
  // Blat rysuje się nad Dolną (0..600) — jeden segment, bez słupka (który jest POZA tym zakresem).
  await expect(canvas.locator('[data-testid="countertop-strip"]')).toHaveCount(1);
  await expect(canvas.locator('[data-testid="countertop-strip"]').first()).toHaveAttribute('width', '600');

  // Przenieś słupka na sam początek wspólnego rzędu — Etap AA, krok 2 / Etap AB, krok 4: ▲/▼
  // usunięte z tabeli, "◀ Przesuń w lewo" usunięte z modala (oba nieużywane) — przestawianie żyje
  // teraz WYŁĄCZNIE przez drag&drop na rysunku (ten sam mechanizm co "dragging a cabinet with the
  // mouse inside the canvas reorders it within its row").
  const tallBox = await tallCabinet.boundingBox();
  const bottomBox = await bottomCabinet.boundingBox();
  await page.mouse.move(tallBox.x + tallBox.width / 2, tallBox.y + tallBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(bottomBox.x + bottomBox.width * 0.1, bottomBox.y + bottomBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(tallCabinet.locator('rect').first()).toHaveAttribute('x', '0'); // teraz na początku
  await expect(bottomCabinet.locator('rect').first()).toHaveAttribute('x', '600'); // Dolna przesunęła się ZA niego
  await expect(topCabinet.locator('rect').first()).toHaveAttribute('x', '600'); // Górne zaczynają się ZA słupkiem
  // Blat wciąż 600mm szeroki, ale teraz zaczyna się za słupkiem (600), nie od zera.
  await expect(canvas.locator('[data-testid="countertop-strip"]')).toHaveCount(1);
  await expect(canvas.locator('[data-testid="countertop-strip"]').first()).toHaveAttribute('x', '600');
});

// Etap V, krok 1/3 — Widok z góry: Górne stoją na DOKŁADNIE tym samym X co na Widoku X (nie "po
// prawej za Dolnymi" — dawny bug), a linie wymiarowe są BARE NUMBER (bez "Wolne X:"/"mm"), z
// dwupasmowym łańcuchem (pełna ściana/zajęte) i zieloną plakietką wolnego miejsca, jak Widok X.
test('Widok z góry: Górne na tym samym X co Widok X, a wymiary są bare-number (bez "Wolne X:"/"mm")', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Z półkami', exact: true }).click(); // 600mm, na początku
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click(); // 600mm
  const topGroup = groupSection(calculator, '⬆️ Szafki górne');
  await topGroup.getByRole('button', { name: 'Klasyczna (z drzwiami)', exact: true }).click(); // 600mm

  const elevationCanvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const topCabinetElevation = elevationCanvas.getByRole('button', { name: /Klasyczna \(z drzwiami\)/ });
  await expect(topCabinetElevation.locator('rect').first()).toHaveAttribute('x', '600');

  await calculator.getByRole('button', { name: /Widok z góry/ }).click();
  const planCanvas = calculator.getByRole('img', { name: /Widok z góry/ });
  const topCabinetPlan = planCanvas.getByRole('button', { name: /Klasyczna \(z drzwiami\)/ });
  // Dawny bug: "po prawej za Dolnymi" dałoby x=1200 (0..600 Dolne, 600..1200 Górne "doklejone").
  await expect(topCabinetPlan.locator('rect').first()).toHaveAttribute('x', '600');

  await expect(planCanvas).not.toContainText('Wolne X:');
  await expect(planCanvas).not.toContainText('mm');
  await expect(planCanvas.locator('[class*="dimensionLine"] text').first()).toHaveText('3000');
  await expect(planCanvas.locator('[class*="freeBadge"] + text')).toHaveText('1800'); // 3000 - (600+600)
});

// Etap V, krok 2 — nowy moduł "Pod lodówkę" (fridge_tall_cabinet) w podrozdziale Słupki: dodanie,
// wybór standardu wbudowanej lodówki (⚙️) i realny, w przeglądarce zmierzony efekt na rysunku
// (dolny front w jednej linii z Dolnymi, szerokość zmienia się po przełączeniu na XXL 75cm/194cm).
test('"Pod lodówkę": dodanie, zmiana standardu lodówki na XXL zmienia szerokość na 750mm, dolny front w linii z Dolnymi', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click(); // 600mm
  const tallGroup = groupSection(calculator, '📏 Słupki / Wysoka zabudowa');
  await tallGroup.getByRole('button', { name: 'Pod lodówkę', exact: true }).click();

  const row = calculator.locator('tr').filter({ hasText: 'Pod lodówkę' });
  await expect(row.getByLabel('Szer. (mm)')).toHaveText(/600/);

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const bottomCabinet = canvas.getByRole('button', { name: /^Z drzwiami/ });
  const fridgeCabinet = canvas.getByRole('button', { name: /Pod lodówkę/ });
  const bottomBox = await bottomCabinet.boundingBox();
  const fridgeDivider = fridgeCabinet.locator('line').first();
  // Linia podziału frontów (bottomHeightMm) jest w jednej linii z GÓRĄ sąsiedniej Dolnej szafki —
  // tolerancja kilku px na subpixel rendering/zaokrąglenia skali.
  const dividerBox = await fridgeDivider.boundingBox();
  expect(Math.abs(dividerBox.y - bottomBox.y)).toBeLessThanOrEqual(3);

  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  // Etap W, krok 2 — "Standard lodówki do zabudowy" żyje teraz w CabinetSettingsModal (portal do
  // document.body), poza poddrzewem `row`/`calculator` — odpytujemy więc przez `page`.
  await page.getByTestId('cabinet-settings-modal').getByLabel('Standard lodówki do zabudowy').selectOption('xxl_75_194');

  await expect(row.getByLabel('Szer. (mm)')).toHaveText(/750/);
  await expect(fridgeCabinet.locator('rect').first()).toHaveAttribute('width', '750');
});
