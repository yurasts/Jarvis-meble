import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Etap P — zgłoszenie ze screenshotu: (1) mikroskopijne/nachodzące podpisy na WallElevationCanvas,
// (2) nazwy płyt/kromki w nagłówku grupy "lesenką" (różne odstępy od lewej), (3) brak widoczności
// ściany X/Y w tabeli + obcięta prawa krawędź tabeli szafek ("Fror" / "0.5"). Te testy weryfikują
// RZECZYWISTE piksele (bounding boxy), czego nie da się wiarygodnie zrobić w jsdom.
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
// kontenera PER GRUPĘ (dawne `data-group-table`, Etap T). `kitchenModuleTable` znajduje TEN jeden
// `<table>` (do bounding-box/column-header checków); `groupRowsFor` wybiera tylko wiersze JEDNEJ
// grupy po jej `data-row-group` (ustawianym na KAŻDYM wierszu modułu).
const kitchenModuleTable = (calculator) => calculator.locator('table[class*="moduleTable"]');
const groupRowsFor = async (calculator, label) => {
  const groupKey = await groupSection(calculator, label).getAttribute('data-group-palette');
  return calculator.locator(`[data-row-group="${groupKey}"]`);
};

const openCalculator = async (page) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();
  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  return page.getByText('📐 Kalkulator', { exact: true }).locator('..');
};
// Etap Q, krok 1 — panel "Wymiary ściany i wysokości" (Obszar 1/2, w tym "Układ ścian") żyje za
// gear-przyciskiem w nagłówku, zwinięty domyślnie.
const expandHeightsPanel = (calculator) => calculator
  .getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ }).click();

test('the module table never clips its right edge — Front (m²)/Obrzeże (mb)/Kolejność stay fully inside the panel', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  // Kilka szafek w narożnym L (ściana X + ściana Y) — ten sam scenariusz "9 szafek" co w zgłoszeniu.
  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z szufladami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Pod zlew', exact: true }).click();

  const panelBox = await calculator.boundingBox();
  const frontCell = calculator.locator('[data-label="Front (m²)"]').first();
  const edgeCell = calculator.locator('[data-label="Obrzeże (mb)"]').first();
  // Etap Q, krok 4 — "Kolejność" scalona w "Akcje" (gear "⚙️" + ◀▶ + ⧉ + ×).
  const actionsCell = calculator.locator('[data-label="Akcje"]').first();

  for (const cell of [frontCell, edgeCell, actionsCell]) {
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the "Ściana" pill is visible as the 2nd column and clicking "Y" colors it amber, "X" blue', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  const xButton = row.getByRole('button', { name: 'X', exact: true });
  const yButton = row.getByRole('button', { name: 'Y', exact: true });
  await expect(xButton).toHaveAttribute('aria-pressed', 'true');
  await expect(xButton).toHaveCSS('background-color', 'rgb(37, 99, 235)'); // #2563eb

  await yButton.click();
  await expect(yButton).toHaveAttribute('aria-pressed', 'true');
  await expect(yButton).toHaveCSS('background-color', 'rgb(217, 119, 6)'); // #d97706
});

test('Widok Y active: clicking an add-module tile creates the cabinet directly on wall Y', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await expandHeightsPanel(calculator);
  await calculator.getByLabel('Układ ścian').selectOption('corner_l');
  await calculator.getByRole('button', { name: /Widok Y/ }).click();
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await expect(row.getByRole('button', { name: 'Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

// Etap P, krok 2 — nazwy 4 materiałów grupy zaczynają się dokładnie w tym samym miejscu (siatka
// CSS Grid), niezależnie od długości etykiety slotu ("Płyta korpusu:" vs "Obrzeże frontu:").
test('the 4 board-field rows (Płyta korpusu/frontu, Obrzeże korpusu/frontu) align their material names on the same vertical line', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await calculator.getByRole('button', { name: /^[▸▾]\s*⬇️ Szafki dolne/ }).click();

  const labels = ['Płyta korpusu', 'Płyta frontu', 'Obrzeże korpusu', 'Obrzeże frontu'];
  const xPositions = [];
  for (const label of labels) {
    const trigger = calculator.getByLabel(`${label} — ⬇️ Szafki dolne`);
    const valueSpan = trigger.locator('[class*="compactText"]');
    const box = await valueSpan.boundingBox();
    xPositions.push(Math.round(box.x));
  }
  // Wszystkie 4 zaczynają się w tym samym punkcie X (tolerancja 1px na subpixel rendering).
  xPositions.forEach((x) => {
    expect(Math.abs(x - xPositions[0])).toBeLessThanOrEqual(1);
  });
});

// Etap P, krok 1 — podpisy na rysunku SVG są rzeczywiście czytelne (>= 14px) niezależnie od tego,
// ile mm ma ściana — sprawdzamy REALNY, wyrenderowany rozmiar fonta (getComputedStyle), nie samą
// wartość w jednostkach viewBox (mm).
test('dimension labels on the drawing render at a real, readable font size (>= 14px on screen)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });

  // Etap Q, krok 3 (a) — linia wymiarowa niesie TERAZ samą liczbę (bez "Szerokość ściany:"/"mm") —
  // pierwsza linia klasy dimensionLine w kolejności DOM to zawsze "Szerokość ściany" (patrz
  // WallElevationCanvas.jsx: topDimLineY, renderowana jako pierwsza z 4 linii wymiarowych elewacji).
  const dimensionText = canvas.locator('[class*="dimensionLine"] text').first();
  await expect(dimensionText).toHaveText('3000');
  const fontSizePx = await dimensionText.evaluate((el) => {
    // `fontSize` na <text> jest w jednostkach viewBox (mm) — mnożymy przez skalę CTM
    // (viewBox -> realne piksele ekranu), żeby dostać rzeczywisty, wyrenderowany rozmiar.
    const ctm = el.ownerSVGElement.getScreenCTM();
    const scale = Math.hypot(ctm.a, ctm.b);
    const viewBoxFontSize = parseFloat(getComputedStyle(el).fontSize);
    return viewBoxFontSize * scale;
  });
  expect(fontSizePx).toBeGreaterThanOrEqual(13.5);
});

// Etap AB, krok 1 — zgłoszenie (скинали.jpg): brakowało wymiaru wysokości fartucha/skinali (odcinek
// między wierzchem blatu, 900mm, a dołem Szafek górnych, 1500mm — domyślny "pas roboczy" 600mm).
test('shows the backsplash/pas roboczy height dimension ("600") between the countertop and the upper cabinets on Widok X', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });

  const dimensionTexts = canvas.locator('[class*="dimensionLine"] text');
  await expect(dimensionTexts).toContainText(['600']);
});

// Etap Q, krok 1 — materiały grupy i panel wymiarów ściany/wysokości żyją za gear-przyciskami,
// zwinięte DOMYŚLNIE (usunięte dawne auto-rozwinięcie "grupa ma już moduł").
test('materials and wall-dimensions panels stay collapsed behind their gear buttons by default, even with cabinets already added', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  await expect(calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne')).not.toBeVisible();
  await expect(calculator.getByLabel('Szerokość ściany / zabudowy (mm)')).not.toBeVisible();

  await calculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();
  await expandHeightsPanel(calculator);

  await expect(calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne')).toBeVisible();
  await expect(calculator.getByLabel('Szerokość ściany / zabudowy (mm)')).toBeVisible();
});

// Etap Q, krok 4 — rysunek po LEWEJ, grupy+tabele po PRAWEJ (2-kolumnowy układ desktopowy).
test('on a wide desktop viewport, the drawing sits to the left of the groups/tables column', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  // Etap U, krok 1 — tabela (teraz jedna, wspólna dla wszystkich grup) żyje w `.groupsColumn`, obok
  // rysunku — porównujemy całą tę kolumnę (działa też, gdy jest jeszcze pusta — "Brak dodanych
  // szafek" zamiast <table>), nie samą tabelę (nie renderuje się, dopóki nie ma żadnego modułu).
  const tableColumn = calculator.locator('[class*="groupsColumn"]');
  const canvasBox = await canvas.boundingBox();
  const tableBox = await tableColumn.boundingBox();

  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(tableBox.x + 1);
});

// Etap T, krok 1 — kalkulator otwiera się jako PEŁNOEKRANOWY panel (position: fixed; inset: 0),
// zakrywając w 100% szerokość viewportu (w tym lewy sidebar PROJEKTY) — nie wąski panel w środku
// strony. Zamyka się nowym przyciskiem "← Wróć do projektu" (dawny przycisk-przełącznik w sekcji
// Materiały zostaje NIETKNIĘTY — patrz test w cabinet-calculator.spec.js — ale żyje POD overlayem).
test('the calculator opens as a fullscreen overlay spanning the full viewport width, and "Wróć do projektu" closes it', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  // `calculator` to .panel (ma WŁASNY padding: 10px, zagnieżdżony w .fullscreenOverlay z padding:
  // 16px 24px) — sprawdzamy pokrycie viewportu przez sam OVERLAY, nie przez jego wyściełane dziecko.
  const overlay = page.locator('[class*="fullscreenOverlay"]');
  const overlayBox = await overlay.boundingBox();
  const viewportSize = page.viewportSize();
  expect(overlayBox.x).toBeLessThanOrEqual(1);
  expect(overlayBox.width).toBeGreaterThanOrEqual(viewportSize.width - 2);

  await calculator.getByRole('button', { name: '← Wróć do projektu' }).click();
  await expect(page.getByText('📐 Kalkulator', { exact: true })).not.toBeVisible();
  // Stary przycisk-przełącznik w sekcji Materiały wciąż działa — otwiera panel ponownie.
  await page.getByRole('region', { name: 'Materiały' }).getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  await expect(page.getByText('📐 Kalkulator', { exact: true })).toBeVisible();
});

// Etap T, krok 1 — Escape zamyka panel tak samo jak "Wróć do projektu" (chyba że wewnątrz otwarty
// jest edytor/popover — patrz test stopPropagation w CabinetCalculator.test.jsx, pokrywający tę
// gałąź w jsdom, gdzie da się to sprawdzić niezawodnie).
test('Escape closes the fullscreen calculator', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await calculator.getByText('📐 Kalkulator', { exact: true }).press('Escape');
  await expect(page.getByText('📐 Kalkulator', { exact: true })).not.toBeVisible();
});

// Etap T, krok 2 — zakładki grup + paleta "+ Dodaj moduł" żyją teraz w JEDNYM, pełnoszerokim pasku
// NAD OBIEMA kolumnami (rysunek i tabela), nie tylko nad tabelą jak wcześniej.
test('the tabs/palette bar sits above BOTH the drawing and the table, spanning their combined width', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);

  const canvas = calculator.getByRole('img', { name: /Rysunek 2D elewacji/ });
  const tableColumn = calculator.locator('[class*="groupsColumn"]');
  const tabsBar = calculator.getByRole('tablist', { name: 'Grupy szafek kuchennych' });

  const canvasBox = await canvas.boundingBox();
  const tableBox = await tableColumn.boundingBox();
  const tabsBox = await tabsBar.boundingBox();

  // Pasek zakładek kończy się (dół) zanim zaczyna się rysunek I tabela (obie kolumny są POD nim).
  expect(tabsBox.y + tabsBox.height).toBeLessThanOrEqual(canvasBox.y + 1);
  expect(tabsBox.y + tabsBox.height).toBeLessThanOrEqual(tableBox.y + 1);
  // I rozciąga się na szerokość obejmującą OBIE kolumny razem, nie tylko jedną z nich.
  expect(tabsBox.x).toBeLessThanOrEqual(canvasBox.x + 1);
  expect(tabsBox.x + tabsBox.width).toBeGreaterThanOrEqual(tableBox.x + tableBox.width - 1);
});

// Etap Q, krok 4 — "Ilość"/"Konstrukcja / Szuflady"/"HDF" nie są już osobne kolumny; te 2 ostatnie
// scalone w popover za przyciskiem "⚙️" w kolumnie "Akcje".
test('the "Ilość" column is gone; "⚙️" opens Konstrukcja/Szuflady/HDF in a popover', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const moduleTable = kitchenModuleTable(calculator);
  await expect(moduleTable.getByRole('columnheader', { name: 'Ilość' })).toHaveCount(0);
  await expect(moduleTable.getByRole('columnheader', { name: 'Konstrukcja / Szuflady' })).toHaveCount(0);
  await expect(moduleTable.getByRole('columnheader', { name: 'HDF', exact: true })).toHaveCount(0);

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  // Etap W, krok 2 — "⚙️" otwiera teraz CabinetSettingsModal (createPortal do document.body), POZA
  // poddrzewem `calculator` (sibling, nie potomek) — modal odpytujemy więc przez `page`, nie `calculator`.
  await expect(page.getByTestId('cabinet-settings-modal')).toBeVisible();
  await expect(page.getByLabel('HDF wpuszczany')).toBeVisible();
});

// Etap R, krok 3 — "⧉ Duplikuj szafkę" (dawniej osobny ikonowy przycisk w wierszu) żyje teraz w
// popoverze za "⚙️" (zastępuje usuniętą kolumnę "Ilość"), razem z Konstrukcją/Szufladami/HDF.
test('"⧉ Duplikuj szafkę" inside the "⚙️" popover duplicates a row right next to the original', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const bottomRows = await groupRowsFor(calculator, '⬇️ Szafki dolne');
  await expect(bottomRows).toHaveCount(1);

  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  await page.getByTestId('cabinet-settings-modal').getByRole('button', { name: /^Duplikuj moduł/ }).click();

  await expect(bottomRows).toHaveCount(2);
});

// Etap R, krok 1 — nagłówki tabeli były drobne (var(--font-size-2xs), 8-10px) i wyblakłe
// (--text-muted) — teraz 13px/600/--text-main, rzeczywiście czytelne na ekranie.
test('table column headers render at a real, readable font size (>= 12.5px on screen)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const header = calculator.getByRole('columnheader', { name: 'Moduł' });
  const fontSizePx = await header.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSizePx).toBeGreaterThanOrEqual(12.5);
});

// Etap R, krok 1/2 — kafelki "+ Dodaj moduł" miały ledwo widoczne, ułamek-piksela grube linie
// (grubość mm-proporcjonalna, skurczona razem z całą miniaturą) — `vector-effect="non-scaling-
// stroke"` + stroke-width="1.6" renderuje je ZAWSZE jako realne 1.6 piksela ekranu, niezależnie od
// skali viewBoxu. Podpis pod kafelkiem (dawniej var(--font-size-2xs), 8-10px) jest teraz 13px.
test('add-module tile drawings render crisp, screen-stable 1.6px lines, and the caption is readable (>= 12.5px)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const tile = groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true });

  const frameRect = tile.locator('svg rect').first();
  await expect(frameRect).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  await expect(frameRect).toHaveAttribute('stroke-width', '1.6');

  const captionFontSizePx = await tile.locator('[class*="addModuleTileCaption"]')
    .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(captionFontSizePx).toBeGreaterThanOrEqual(12.5);
});

// Etap R, krok 2 — klik na "✎ 600" otwiera input bez spinnerów, od razu zaznaczony (select()); Enter
// zapisuje i wraca do czystej cyfry, Escape porzuca szkic.
test('clicking a "✎ <number>" cell opens a spinner-free, pre-selected input; Enter commits, Escape cancels', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const widthField = calculator.getByLabel('Szer. (mm)');
  await expect(widthField).toHaveText(/600/);

  await widthField.click();
  const input = calculator.getByLabel('Szer. (mm)');
  await expect(input).toBeFocused();
  const appearance = await input.evaluate(el => getComputedStyle(el).appearance || getComputedStyle(el).getPropertyValue('-webkit-appearance'));
  expect(appearance).toBe('textfield');

  await input.fill('650');
  await input.press('Enter');
  await expect(calculator.getByLabel('Szer. (mm)')).toHaveText(/650/);

  await calculator.getByLabel('Szer. (mm)').click();
  await calculator.getByLabel('Szer. (mm)').fill('999');
  await calculator.getByLabel('Szer. (mm)').press('Escape');
  await expect(calculator.getByLabel('Szer. (mm)')).toHaveText(/650/); // nie 999 — szkic porzucony
});

// Etap AA, krok 2 — zgłoszenie: kolumna ▲/▼ usunięta z tabeli (myliła, zabierała miejsce nazwie) —
// przestawianie żyje teraz TYLKO na rysunku (drag&drop) i w CabinetSettingsModal ("◀ Przesuń w
// lewo"/"Przesuń w prawo ▶"). Prawa strona wiersza zostaje tylko z "⚙️"/"×" — real-pixel sprawdzenie.
test('no ▲/▼ reorder buttons anywhere in the table — "Moduł" cell has only the icon+name, row\'s far-right only has "⚙️"/"×"', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });

  await expect(row.getByRole('button', { name: /Przesuń.*wcześniej/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Przesuń.*później/ })).toHaveCount(0);
  await expect(calculator.locator('[class*="reorderButton"]')).toHaveCount(0);

  const gearBox = await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).boundingBox();
  const removeBox = await row.getByRole('button', { name: /^Usuń moduł/ }).boundingBox();
  const nameBox = await row.locator('[class*="moduleName"]').boundingBox();
  const rowBox = await row.boundingBox();
  // "⚙️"/"×" żyją w ostatniej % szerokości rzędu (prawa strona), wyraźnie dalej niż nazwa modułu.
  expect(gearBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
  expect(removeBox.x).toBeGreaterThan(gearBox.x);
  expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
});

// Etap R, krok 4 / Etap W, krok 1 — "10.88" (Obrzeże) musi pozostać CAŁE, nie obcięte do "10.8"
// przez wąską kolumnę ("mb" żyje teraz TYLKO w nagłówku kolumny, patrz test niżej, nie dubluje się
// w komórce). Sprawdzamy RZECZYWISTĄ szerokość komórki vs jej scrollWidth (treść nie szersza niż box).
test('"Obrzeże (mb)" never clips its value (e.g. "10.88" stays whole, not "10.8")', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  await bottomGroup.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await bottomGroup.getByRole('button', { name: 'Z szufladami', exact: true }).click();

  const edgeCells = calculator.locator('[data-label="Obrzeże (mb)"]');
  const count = await edgeCells.count();
  for (let i = 0; i < count; i += 1) {
    const cell = edgeCells.nth(i);
    await expect(cell).toHaveText(/^\d+\.\d{2}$/);
    const overflow = await cell.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  // "mb" żyje teraz w nagłówku kolumny (podtekst, .colUnit), nie dubluje się w każdej komórce.
  await expect(calculator.getByRole('columnheader', { name: /^Obrzeże/ })).toHaveText('Obrzeżemb');
});

// Etap T, krok 2 — zgłoszenie: "Moduł" (ikona + ◀▶ + nazwa) zjadało tyle miejsca na ◀▶/ikonę, że
// .moduleName dostawał realnie tylko ~46px, mimo szerszego pełnoekranowego panelu — "Z szufladami"/
// "Pod piekarnik" ucinały się do "Z szuflad…"/"Pod piek…" (jsdom tego nie wykrywa — nie liczy
// wizualnego ellipsis, tylko surowy tekst w DOM-ie — stąd ten test żyje tu, nie w component testach).
test('module names never truncate to an ellipsis inside the table ("Z szufladami", "Z drzwiami", "Pod piekarnik", "Blenda boczna")', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  const bottomGroup = groupSection(calculator, '⬇️ Szafki dolne');
  for (const caption of ['Z szufladami', 'Z drzwiami', 'Pod piekarnik', 'Blenda boczna']) {
    await bottomGroup.getByRole('button', { name: caption, exact: true }).click();
  }

  const nameCells = calculator.locator('[class*="moduleName"]');
  const count = await nameCells.count();
  expect(count).toBe(4);
  for (let i = 0; i < count; i += 1) {
    const cell = nameCells.nth(i);
    const overflow = await cell.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

// Etap Y, krok 1 — zgłoszenie (Screenshot_9_3.jpg): nagłówek sekcji "GABARYTY I ROZMIESZCZENIE" i
// etykiety pól (Szerokość/Wysokość/Głębokość (mm)) wewnątrz CabinetSettingsModal były praktycznie
// nieczytelne — zbyt mały (var(--font-size-2xs), realnie 8px) i wyblakły (--text-muted) tekst.
// Real-pixel sprawdzenie (nie jsdom — ten komponentowy nie ładuje CSS Modułów do getComputedStyle).
test('CabinetSettingsModal: "Gabaryty i rozmieszczenie" i etykiety pól mają realny kontrast/rozmiar (>= 13px, nie --text-muted)', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();

  const modal = page.getByTestId('cabinet-settings-modal');
  const sectionTitle = modal.getByText('Gabaryty i rozmieszczenie');
  const widthLabel = modal.getByText('Szerokość (mm)', { exact: true });

  const mutedColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--text-muted)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  const titleStyle = await sectionTitle.evaluate(el => ({ color: getComputedStyle(el).color, fontSize: parseFloat(getComputedStyle(el).fontSize) }));
  expect(titleStyle.fontSize).toBeGreaterThanOrEqual(13);
  expect(titleStyle.color).not.toBe(mutedColor);

  const labelStyle = await widthLabel.evaluate(el => ({ color: getComputedStyle(el).color, fontSize: parseFloat(getComputedStyle(el).fontSize) }));
  expect(labelStyle.fontSize).toBeGreaterThanOrEqual(13);
  expect(labelStyle.color).not.toBe(mutedColor);

  // Inputy: 14px, pogrubione, z widoczną (nie 0px/transparent) ramką.
  const widthInput = modal.getByLabel('Szerokość (mm)');
  const inputStyle = await widthInput.evaluate(el => {
    const computed = getComputedStyle(el);
    return { fontSize: parseFloat(computed.fontSize), fontWeight: computed.fontWeight, borderWidth: parseFloat(computed.borderWidth) };
  });
  expect(inputStyle.fontSize).toBeGreaterThanOrEqual(14);
  expect(Number(inputStyle.fontWeight)).toBeGreaterThanOrEqual(600);
  expect(inputStyle.borderWidth).toBeGreaterThan(0);
});

// Etap Y, krok 2/3/4 — "📋 Formatki i okleinowanie ABS": tabela rozkroju produkcyjnego
// (computeCabinetParts) + diagramy formatek wewnątrz CabinetSettingsModal, real-pixel sprawdzenie.
test('CabinetSettingsModal: "📋 Formatki i okleinowanie ABS" rozwija tabelę rozkroju z diagramami formatek', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();

  const modal = page.getByTestId('cabinet-settings-modal');
  const partsTable = modal.getByTestId('cabinet-parts-table');
  await expect(partsTable).not.toBeVisible();

  await modal.getByRole('button', { name: /Formatki i okleinowanie ABS/ }).click();
  await expect(partsTable).toBeVisible();

  const sideRow = partsTable.locator('tr').filter({ hasText: 'Bok' });
  await expect(sideRow).toBeVisible();
  const frontRow = partsTable.locator('tr').filter({ hasText: 'Front (drzwi)' });
  await expect(frontRow.getByText('═', { exact: true })).toBeVisible(); // front: 4 strony ABS

  // Hover wiersza podświetla jego mini-diagram formatki (ten sam `hoveredPartIndex`).
  const diagramCells = modal.locator('[class*="partDiagramCell"]');
  await expect(diagramCells.first()).toBeVisible();
  await sideRow.hover();
  await expect(sideRow).toHaveClass(/partsTableRowActive/);
});

// Etap Z, krok 1 — zgłoszenie (Screenshot_6_2.jpg): Bok kromkowany TYLKO z przodu (D1) to błąd
// produkcyjny — boki szafek ZAWSZE mają 3 oklejone torce (przód D1 + góra/dół S1/S2), jedyna
// nieoklejona strona to tylna (D2, przy ścianie/HDF).
test('CabinetSettingsModal: formatka "Bok" ma oklejkę D1+S1+S2 (3 strony, symbol "⊔"), nie tylko D1', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();

  const modal = page.getByTestId('cabinet-settings-modal');
  await modal.getByRole('button', { name: /Formatki i okleinowanie ABS/ }).click();
  const sideRow = modal.getByTestId('cabinet-parts-table').locator('tr').filter({ hasText: 'Bok' });

  await expect(sideRow.getByText('⊔', { exact: true })).toBeVisible();
  const activeLetters = await sideRow.locator('[class*="edgeBadgeLetterActive"]').allTextContents();
  expect(activeLetters.sort()).toEqual(['D1', 'S1', 'S2']);
  await expect(sideRow.getByText('D2', { exact: true })).not.toHaveClass(/edgeBadgeLetterActive/);
});

// Etap Z, krok 2 — zgłoszenie (Screenshot_6_2.jpg): napisy przycisków stopki modala ("Duplikuj",
// "Usuń", "Gotowe") były nieczytelne (zbyt małe/wyblakłe na białym tle). Etap AB, krok 4 —
// "Przesuń w lewo/prawo" usunięte z footera (nieużywane) — patrz osobny test niżej.
test('CabinetSettingsModal: przyciski stopki (Duplikuj/Usuń/Gotowe) mają czytelny, kontrastowy tekst', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  const modal = page.getByTestId('cabinet-settings-modal');

  const checkReadable = async (button, expectMinWeight = 600) => {
    await expect(button).toBeVisible();
    const style = await button.evaluate(el => {
      const computed = getComputedStyle(el);
      return { color: computed.color, backgroundColor: computed.backgroundColor, fontSize: parseFloat(computed.fontSize), fontWeight: Number(computed.fontWeight) };
    });
    expect(style.color).not.toBe(style.backgroundColor); // tekst musi różnić się od tła
    expect(style.fontSize).toBeGreaterThanOrEqual(13);
    expect(style.fontWeight).toBeGreaterThanOrEqual(expectMinWeight);
    return style;
  };

  await checkReadable(modal.getByRole('button', { name: /^Duplikuj moduł/ }));
  const removeStyle = await checkReadable(modal.getByRole('button', { name: /^Usuń moduł/ }));
  expect(removeStyle.color).toBe('rgb(220, 38, 38)'); // #dc2626 — akcentowy bordowo-czerwony
  const doneStyle = await checkReadable(modal.getByRole('button', { name: 'Gotowe' }), 700);
  expect(doneStyle.color).toBe('rgb(255, 255, 255)');
  expect(doneStyle.backgroundColor).toBe('rgb(37, 99, 235)'); // #2563eb
});

// Etap AB, krok 4 — zgłoszenie (zmywarka.jpg, "я никогда не буду пользоваться этими кнопками"):
// "◀ Przesuń w lewo"/"Przesuń w prawo ▶" usunięte z footera — nieużywane, przestawianie żyje
// wyłącznie na rysunku (drag&drop). Footer zostaje tylko z Duplikuj/Usuń (lewo) i Gotowe (prawo).
test('CabinetSettingsModal: footer NIE ma już "Przesuń w lewo"/"Przesuń w prawo" — tylko Duplikuj/Usuń/Gotowe', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });
  const calculator = await openCalculator(page);
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const row = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });
  await row.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  const modal = page.getByTestId('cabinet-settings-modal');

  await expect(modal.getByRole('button', { name: /Przesuń w lewo/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /Przesuń w prawo/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Duplikuj moduł/ })).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Usuń moduł/ })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Gotowe' })).toBeVisible();
});
