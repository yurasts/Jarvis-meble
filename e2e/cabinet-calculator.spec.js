import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edge = { id: 3, name: 'ABS 2mm Biały', category: 'Obrzeże', unit: 'mb', price: 3.5, price_history: [] };
const hinge = { id: 4, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const runner = { id: 5, name: 'Blum Tandem L-500', category: 'Prowadnice', unit: 'kpl', price: 45, price_history: [] };
const countertop = { id: 6, name: 'Blat laminowany', category: 'Inne', unit: 'mb', price: 150, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };
const handle = { id: 12, name: 'Uchwyt GAMET meblowy', category: 'Akcesoria', unit: 'szt', price: 6.5, price_history: [] };

// Etap J, krok 2 — kafelki "+ Dodaj moduł" mają krótkie podpisy (np. "Z szufladami") zamiast
// dawnych długich pigułek — ta sama krótka podpis bywa wieloznaczna, gdy 2 grupy z tym samym
// presetem (np. "Z szufladami" w Szafki dolne I w Słupki) są naraz widoczne pod Kuchnią, więc
// klikamy w kontenerze konkretnej grupy (jej nagłówek-toggle -> najbliższy przodek .groupSection).
const groupSection = (calculator, label) => calculator
  .getByRole('button', { name: new RegExp(`^[▸▾]\\s*${label}`) })
  .locator('xpath=ancestor::div[contains(@class,"groupSection")]');

test('calculator: add a drawer cabinet and a wardrobe section, resize, and add the calculated lines to the project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, hinge, runner, countertop, handle],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await expect(materials).toBeVisible();
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();

  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');
  await expect(calculator.getByText('Dodaj pierwszy moduł powyżej')).toBeVisible();

  // Dodaj tumbę z szufladami (Kuchnia, Szafki dolne) i sekcję szafy (wkładka Szafa / Garderoba) —
  // dokładnie ten scenariusz z zadania. Etap N — wybór typu zabudowy to teraz dropdown "Typ
  // zabudowy", nie 4 wkładki-przyciski; lista modułów jest per-grupa aktywnej wkładki.
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z szufladami', exact: true }).click();
  const drawerRow = calculator.locator('tr').filter({ hasText: 'Z szufladami' });
  await expect(drawerRow).toBeVisible();

  await calculator.getByLabel('Typ zabudowy').selectOption('wardrobe');
  await calculator.getByRole('button', { name: 'Sekcja z drzwiami i półkami', exact: true }).click();
  await expect(calculator.locator('[class*="moduleName"]', { hasText: 'Sekcja z drzwiami i półkami' })).toBeVisible();

  // Etap N, krok 4 — furnitura (zawiasy/nogi/zawieszki/uchwyty/TIP-ON/profil HAFELE) jest tymczasowo
  // wycięta z rozliczenia: ani rola "Zawiasy", ani jej materiał nie mają już wiersza w tabeli.
  await expect(calculator.getByLabel('Zawiasy (cichy domyk)')).toHaveCount(0);
  await expect(calculator.getByText(hinge.name)).toHaveCount(0);

  // Krytyczny bug naprawiony w Etapie C: tabela kalkulacji musi pokazać realne nazwy materiałów
  // i ceny > 0 zł dla Płyty korpusu/frontu i Obrzeża — nigdy "— nie wybrano —" / 0.00 zł, mimo że
  // selecty wizualnie pokazują prawdziwe materiały.
  await expect(calculator.getByText('— nie wybrano —')).toHaveCount(0);
  // Realna cena jednostkowa z katalogu (180.00/220.00/3.50 zł) widoczna w wierszu — NIE 0.00 zł,
  // mimo że select wizualnie pokazuje ten sam materiał (dokładnie bug ze zgłoszenia).
  const bodyBoardRow = calculator.locator('tr').filter({ hasText: 'Płyta korpusu' });
  await expect(bodyBoardRow).toContainText(bodyBoard.name);
  await expect(bodyBoardRow).toContainText(bodyBoard.price.toFixed(2));
  const frontBoardRow = calculator.locator('tr').filter({ hasText: 'Płyta frontu' });
  await expect(frontBoardRow).toContainText(frontBoard.name);
  await expect(frontBoardRow).toContainText(frontBoard.price.toFixed(2));
  const edgeBodyRow = calculator.locator('tr').filter({ hasText: 'Obrzeże korpusu' });
  await expect(edgeBodyRow).toContainText(edge.name);
  await expect(edgeBodyRow).toContainText(edge.price.toFixed(2));
  const edgeFrontRow = calculator.locator('tr').filter({ hasText: 'Obrzeże frontu' });
  await expect(edgeFrontRow).toContainText(edge.name);
  await expect(edgeFrontRow).toContainText(edge.price.toFixed(2));

  const bodySheetsBefore = await bodyBoardRow.textContent();

  // Zmiana szerokości tumby z szufladami — przeliczenie m² i arkuszy na żywo. Karta żyje pod
  // wkładką Kuchnia (Szafki dolne) — wróć tam, bo lista modułów jest per-aktywna-wkładka.
  await calculator.getByLabel('Typ zabudowy').selectOption('kitchen');
  // Etap R, krok 2 — "Szer. (mm)" jest teraz klik-do-edycji ("✎ 600"): klik otwiera input, Blur zapisuje.
  const widthField = drawerRow.getByLabel('Szer. (mm)');
  await widthField.click();
  await widthField.fill('1000');
  await widthField.blur();
  await expect(async () => {
    const after = await bodyBoardRow.textContent();
    expect(after).not.toBe(bodySheetsBefore);
  }).toPass();

  await expect(calculator.getByText('RAZEM ORIENTACYJNA WYCENA:')).toBeVisible();

  const addButton = calculator.getByRole('button', { name: '📥 Dodaj wyliczone pozycje do projektu' });
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await expect(calculator.getByRole('button', { name: '✓ Dodano!' })).toBeVisible();

  // Materiały i usługi trafiły do zapisanego stanu projektu (calc_materials/calc_services) —
  // Etap N, krok 4: furnitura (zawiasy/szuflady-prowadnice) NIGDY nie trafia do projektu teraz.
  await expect.poll(() => state.projects[0].calc_materials?.map(item => item.id)).toEqual(
    expect.arrayContaining([bodyBoard.id, frontBoard.id, edge.id]),
  );
  expect(state.projects[0].calc_materials?.map(item => item.id)).not.toEqual(
    expect.arrayContaining([hinge.id, runner.id]),
  );
  await expect.poll(() => state.projects[0].calc_services?.map(item => item.id)).toEqual(
    expect.arrayContaining([cuttingService.id, edgingService.id]),
  );
  const bodyLine = state.projects[0].calc_materials.find(item => item.id === bodyBoard.id);
  expect(bodyLine.quantity).toBeGreaterThan(0);

  // Widoczne również w tabeli Materiały po zamknięciu kalkulatora (bez dwuznaczności z <option>).
  // Etap T, krok 1 — kalkulator renderuje się teraz w pełnoekranowym portalu NAD resztą strony
  // (zakrywa też przycisk-przełącznik "📐 Kalkulator szafek" w sekcji Materiały) — zamknięcie
  // odbywa się przyciskiem "← Wróć do projektu" w jego własnym nagłówku, nie ponownym klikiem
  // tego samego przycisku-przełącznika (ten zostaje nietknięty, żeby OTWIERANIE wciąż działało tak
  // samo jak przed Etapem T).
  await calculator.getByRole('button', { name: '← Wróć do projektu' }).click();
  await expect(materials.getByText(bodyBoard.name)).toBeVisible();
  await expect(materials.getByText(frontBoard.name)).toBeVisible();
  const services = page.getByRole('region', { name: 'Usługi' });
  await expect(services.getByText(cuttingService.name)).toBeVisible();
  await expect(services.getByText(edgingService.name)).toBeVisible();
});

// Etap N, krok 4 — ukrycie furnitury: ani zawiasy/nogi/zawieszki, ani szuflady-prowadnice
// (MERIVOBOX), ani uchwyty/TIP-ON/profil HAFELE nie mają już własnego wiersza w tabeli kalkulacji —
// jedyny ślad "sposobu otwierania" to teraz galka "Opuszczany front (+20 mm)".
const tipOnMaterial = { id: 13, name: 'TIP-ON STRONG IF BIAŁY MAGNES MOCNY', category: 'Akcesoria', unit: 'szt', price: 14.19, price_history: [] };
const hafeleProfileMaterial = { id: 14, name: 'Profil HAFELE aluminiowy', category: 'Akcesoria', unit: 'mb', price: 25, price_history: [] };
const drawerExternalHigh = { id: 7, name: 'MERIVOBOX E wysoka szuflada zewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 300, price_history: [] };
const drawerExternalLow = { id: 10, name: 'MERIVOBOX M niska szuflada zewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 210, price_history: [] };

test('calculator: hardware never shows up in the quote table or on "Dodaj do projektu", regardless of opening method/drawer preset', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, hinge, handle, tipOnMaterial, hafeleProfileMaterial, drawerExternalHigh, drawerExternalLow],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');

  await calculator.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  const doorsRow = calculator.locator('tr').filter({ hasText: 'Z drzwiami' });

  // Etap W, krok 2 — te pola żyją teraz w CabinetSettingsModal (portal do document.body), poza
  // poddrzewem `doorsRow`/`calculator` — odpytujemy więc przez `page`.
  const settingsModal = page.getByTestId('cabinet-settings-modal');

  // Etap AD, krok 1 — zgłoszenie (fronty.jpg): "Opuszczany front" żyje teraz WYŁĄCZNIE w Szafkach
  // górnych (kitchen_top) — "Z drzwiami" (kitchen_bottom) nie ma już tego checkboxa wcale (pokrycie
  // samego toggle'owania na kitchen_top żyje w CabinetCalculator.test.jsx, bez ryzyka przewijania
  // strony w prawdziwej przeglądarce).
  await doorsRow.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  await expect(settingsModal.getByLabel('Opuszczany front (+20 mm)')).toHaveCount(0);
  await settingsModal.getByRole('button', { name: 'Zamknij ustawienia szafki' }).click();

  // Żadna pozycja osprzętu nie ma wiersza w tabeli, niezależnie od galki/presetu szuflad.
  // "Z szufladami" istnieje w 2 grupach (Szafki dolne i Słupki) — scope'ujemy do Szafek dolnych.
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z szufladami', exact: true }).click();
  const drawerRow = calculator.locator('tr').filter({ hasText: 'Z szufladami' });
  await drawerRow.getByRole('button', { name: /^Konstrukcja, szuflady/ }).click();
  await settingsModal.getByLabel('Układ szuflad zewnętrznych').selectOption('3_wysokie');
  await settingsModal.getByRole('button', { name: 'Zamknij ustawienia szafki' }).click();

  // Etap AA, krok 4 — "pierwszy etap" powrotu osprzętu: komplety szuflad (prowadnice) WRÓCIŁY do
  // rozliczenia (includeDrawerSets: true) — zawiasy/uchwyty/TIP-ON/profil HAFELE zostają schowane.
  for (const item of [hinge, handle, tipOnMaterial, hafeleProfileMaterial]) {
    await expect(calculator.getByText(item.name)).toHaveCount(0);
  }
  // "3_wysokie" ustawia WSZYSTKIE 3 szuflady na wysoki tier (externalDrawersLow: 0) — tylko
  // MERIVOBOX E (wysoka) ma więc niezerową ilość; MERIVOBOX M (niska) zostaje odfiltrowany
  // (quantity: 0), dokładnie jak reszta pozycji o zerowej ilości w tym rozliczeniu.
  await expect(calculator.getByText(drawerExternalHigh.name)).toBeVisible();
  await expect(calculator.getByText(drawerExternalLow.name)).toHaveCount(0);

  await calculator.getByRole('button', { name: '📥 Dodaj wyliczone pozycje do projektu' }).click();
  await expect(calculator.getByRole('button', { name: '✓ Dodano!' })).toBeVisible();

  const materialIds = state.projects[0].calc_materials?.map(item => item.id) || [];
  for (const item of [hinge, handle, tipOnMaterial, hafeleProfileMaterial]) {
    expect(materialIds).not.toContain(item.id);
  }
  expect(materialIds).toEqual(expect.arrayContaining([bodyBoard.id, frontBoard.id, drawerExternalHigh.id]));
  expect(materialIds).not.toContain(drawerExternalLow.id); // "3_wysokie" -> 0 szt. niskich
});

// Etap AA, krok 4 — "Nóżki meblowe" (przednie zwykłe + tylne Axilo) wracają do rozliczenia jako
// pierwszy etap powrotu osprzętu — real browser, nie tylko jądro (cabinetCalculator.test.js).
const legFrontMaterial = { id: 20, name: 'Nogi zwykłe', category: 'Akcesoria', unit: 'szt', price: 1, price_history: [] };
const legAxiloMaterial = { id: 21, name: 'Nóżka Axilo HAFELE H-100 mm', category: 'Akcesoria', unit: 'szt', price: 4.19, price_history: [] };

test('calculator: "Nogi zwykłe"/"Nóżka Axilo" legs rows appear and are added to the project (Etap AA, krok 4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, legFrontMaterial, legAxiloMaterial],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');

  await calculator.getByRole('button', { name: 'Z drzwiami', exact: true }).click(); // W=600 -> 4 nóżki (2+2)

  await expect(calculator.getByText(legFrontMaterial.name)).toBeVisible();
  await expect(calculator.getByText(legAxiloMaterial.name)).toBeVisible();
  const legFrontRow = calculator.locator('tr').filter({ hasText: legFrontMaterial.name });
  const legAxiloRow = calculator.locator('tr').filter({ hasText: legAxiloMaterial.name });
  await expect(legFrontRow).toContainText('2'); // 2 szt. przednie
  await expect(legAxiloRow).toContainText('2'); // 2 szt. tylne

  await calculator.getByRole('button', { name: '📥 Dodaj wyliczone pozycje do projektu' }).click();
  await expect(calculator.getByRole('button', { name: '✓ Dodano!' })).toBeVisible();
  const materialIds = state.projects[0].calc_materials?.map(item => item.id) || [];
  expect(materialIds).toEqual(expect.arrayContaining([legFrontMaterial.id, legAxiloMaterial.id]));
});
