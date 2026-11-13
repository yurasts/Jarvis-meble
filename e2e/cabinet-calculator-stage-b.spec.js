import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const frontBoard2 = { id: 15, name: 'U960 SM Dąb Sonoma', category: 'Płyta', unit: 'szt', price: 260, price_history: [] };
const edgeBody = { id: 3, name: 'ABS W960 SM Biały', category: 'Obrzeże', unit: 'mb', price: 1.13, price_history: [] };
const edgeFront = { id: 9, name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', unit: 'mb', price: 4.2, price_history: [] };
const hinge = { id: 4, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

// Etap J, krok 2 — "Z szufladami" jest zarówno w Szafki dolne, jak i w Słupki (oba naraz widoczne
// pod Kuchnią) — scope'ujemy klik do kontenera konkretnej grupy (jej nagłówek-toggle -> najbliższy
// przodek .groupSection), zamiast łapać dwuznaczną krótką podpis gdziekolwiek na stronie.
const groupSection = (calculator, label) => calculator
  .getByRole('button', { name: new RegExp(`^[▸▾]\\s*${label}`) })
  .locator('xpath=ancestor::div[contains(@class,"groupSection")]');
// Etap R, krok 2 — Szer./Wys./Gł. w wierszu są teraz klik-do-edycji ("✎ 600"), nie zawsze-widoczne
// <input> — klika trigger, wpisuje nową wartość, zatwierdza przez Blur.
const setInlineNumber = async (locator, value) => {
  await locator.click();
  await locator.fill(value);
  await locator.blur();
};

test('the quote table fits long material names with no horizontal scroll, from wide desktop down to the narrowest supported width', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');
  await groupSection(calculator, '⬇️ Szafki dolne').getByRole('button', { name: 'Z szufladami', exact: true }).click();

  // Etap H, krok 1 — ta sama tabela co dawny modal "Szczegóły wyceny", teraz wprost w panelu.
  // (`edgeFront.name` pojawia się DWA razy — też w rozwiniętym nagłówku grupy — scope do wiersza.)
  const edgeFrontRow = calculator.locator('tr').filter({ hasText: 'Obrzeże frontu' });
  await expect(edgeFrontRow).toBeVisible();
  await expect(edgeFrontRow).toContainText(edgeFront.name);

  const noHorizontalScroll = async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  };
  await noHorizontalScroll();

  // Kalkulator szafek jest desktop-only (ADR-010) — próg mobile shell w tej appce to 768px, więc
  // "wąski ekran" tu oznacza najwęższy wariant DESKTOPOWY (np. iPad portrait), nie telefon.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(edgeFrontRow).toBeVisible();
  await noHorizontalScroll();
});

// Etap I — "Korpus z płyty frontowej"/"Obrzeże korpusu w kolorze frontu" są teraz checkboxy GRUPY
// (nagłówek "Szafki dolne"), nie pojedynczej szafki — a "Drugi kolor frontu" per moduł zniknęło
// całkowicie: różne kolory frontu wynikają teraz z przynależności do różnych GRUP (każda ma własny
// wybór materiału), co pokazuje druga połowa tego testu (Szafki dolne vs Szafki górne).
test('progressive disclosure: group-level checkboxes reveal/hide board+edge rows; two groups with different front colors get two rows', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, frontBoard2, edgeBody, edgeFront, hinge],
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
  // Etap Q, krok 1 — panel materiałów grupy żyje za gear-przyciskiem "⚙️ Materiały", zwinięty domyślnie.
  await calculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();
  await expect(calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne')).toBeVisible();
  const bodyBoardRow = calculator.locator('tr').filter({ hasText: 'Płyta korpusu' });
  await expect(bodyBoardRow).toContainText(bodyBoard.name);

  await calculator.getByLabel('Korpus z płyty frontowej — ⬇️ Szafki dolne').check();
  // Select grupy nadal pokazuje tę samą płytę (to wciąż jej "Płyta korpusu") — ale wiersz tabeli
  // dla niej znika (area=0, cały korpus poszedł do Płyty frontu tej grupy).
  await expect(calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne')).toBeVisible();
  await expect(calculator.locator('tr').filter({ hasText: 'Płyta korpusu' })).toHaveCount(0);

  // Druga grupa (Szafki górne) z WŁASNYM, INNYM frontem daje DRUGI, osobny wiersz "Płyta frontu".
  await calculator.getByRole('button', { name: 'Klasyczna (z drzwiami)', exact: true }).click();
  await calculator.getByRole('button', { name: 'Materiały — ⬆️ Szafki górne' }).click();
  await calculator.getByLabel('Płyta frontu — ⬆️ Szafki górne').click();
  await page.getByRole('option', { name: new RegExp(frontBoard2.name) }).click();

  const frontRows = calculator.locator('tr').filter({ hasText: 'Płyta frontu' });
  await expect(frontRows).toHaveCount(2);
  await expect(frontRows.filter({ hasText: frontBoard.name })).toHaveCount(1);
  await expect(frontRows.filter({ hasText: frontBoard2.name })).toHaveCount(1);
});

// Etap O, krok 1 — panel wysokości kuchni w 3 obszarach: wysokość nowo dodanej szafki liczy się z
// blatu/nóg/sufitu zamiast zahardkodowanych 820/720/2100, i REAKTYWNIE przelicza już dodane szafki
// (bez klikania żadnego przycisku — to był bug ze zgłoszenia, szczelina pod blatem).
test('kitchen heights panel (3 obszary): new cabinets get the computed height, and already-added ones update reactively', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront, hinge],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');
  // Etap Q, krok 1 — panel "Wymiary ściany i wysokości" żyje za gear-przyciskiem, zwinięty domyślnie.
  await calculator.getByRole('button', { name: /⚙️ Wymiary ściany i wysokości/ }).click();

  // Domyślne wartości Jarvis (nogi 105mm) -> Wys. szafek dolnych = 900 - 38 - 105 = 757mm.
  await expect(calculator.getByLabel('Wysokość nóżek / cokołu (mm)')).toHaveValue('105');
  await expect(calculator.getByLabel('Wys. szafek dolnych (mm)')).toHaveValue('757');
  // Obszar 1 — "Zajęte (ściana X)" liczy się ze szerokości ściany (domyślnie 3000mm), zero szafek na starcie.
  await expect(calculator.getByText(/Zajęte \(ściana X\):/)).toContainText('Zajęte (ściana X): 0 / 3000 mm');

  await calculator.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/757/);
  await expect(calculator.getByText(/Zajęte \(ściana X\):/)).toContainText('Zajęte (ściana X): 600 / 3000 mm');

  // Zmień wysokość blatu -> nowa rekomendacja, i dodana szafka przelicza się SAMA, bez przycisku.
  await calculator.getByLabel('Wysokość blatu (mm)').fill('920');
  await expect(calculator.getByLabel('Wys. szafek dolnych (mm)')).toHaveValue('777');
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/777/);

  // Ręczna edycja blokuje tę jedną szafkę (customHeight) — "↻ Resetuj ręczne wysokości do
  // standardu" zdejmuje blokadę i wraca do bieżącego standardu.
  await setInlineNumber(calculator.getByLabel('Wys. (mm)'), '500');
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/500/);
  await calculator.getByRole('button', { name: '↻ Resetuj ręczne wysokości do standardu' }).click();
  await expect(calculator.getByLabel('Wys. (mm)')).toHaveText(/777/);
});

test('calculator_state autosaves and restores the full session (modules, selections, settings) after a page reload', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront, hinge],
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
  await setInlineNumber(calculator.getByLabel('Szer. (mm)'), '777');
  await calculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();
  await calculator.getByLabel('Korpus z płyty frontowej — ⬇️ Szafki dolne').check();

  await expect.poll(() => state.projects[0].calculator_state?.modules?.[0]?.W).toBe(777);
  await expect(calculator.getByRole('status')).toHaveText('✓ Zapisano w projekcie');

  await page.reload();
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();
  await page.getByRole('region', { name: 'Materiały' }).getByRole('button', { name: '📐 Kalkulator szafek' }).click();

  const restoredCalculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');
  // "Z drzwiami" żyje i na kafelku "+ Dodaj moduł" (zawsze widocznym), i w nagłówku przywróconej
  // karty — celujemy w sam nagłówek karty (.moduleName), nie w dowolne dopasowanie na stronie.
  await expect(restoredCalculator.locator('[class*="moduleName"]', { hasText: 'Z drzwiami' })).toBeVisible();
  await expect(restoredCalculator.getByLabel('Szer. (mm)')).toHaveText(/777/);
  // Korpus z płyty frontowej przetrwało reload (boards.kitchen_bottom) — select grupy wciąż
  // pokazuje tę samą płytę, ale jej wiersz w tabeli kalkulacji (area=0) zniknął. Panel materiałów
  // (czysto wizualny stan UI) NIE przetrwał reload — zwinięty domyślnie, trzeba go rozwinąć ponownie.
  await restoredCalculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();
  await expect(restoredCalculator.getByLabel('Korpus z płyty frontowej — ⬇️ Szafki dolne')).toBeChecked();
  await expect(restoredCalculator.locator('tr').filter({ hasText: 'Płyta korpusu' })).toHaveCount(0);
});
