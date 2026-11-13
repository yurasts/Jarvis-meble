import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Etap E, krok 1.4: Kalkulator szafek był wcześniej desktop-only (ukryty na mobile/tablet) —
// teraz działa wszędzie, panel sam jest responsywny (1 kolumna na całą szerokość).
const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edgeBody = { id: 3, name: 'ABS W960 SM Biały', category: 'Obrzeże', unit: 'mb', price: 1.13, price_history: [] };
const edgeFront = { id: 4, name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', unit: 'mb', price: 4.2, price_history: [] };
const hinge = { id: 5, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const runner = { id: 6, name: 'Blum Tandem L-500', category: 'Prowadnice', unit: 'kpl', price: 45, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

test.use({ viewport: { width: 390, height: 844 } });

test('Kalkulator szafek is unlocked on mobile (390px) and stays fully readable in 1 column', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront, hinge, runner],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await expect(materials).toBeVisible();

  // Przycisk kalkulatora musi być widoczny na mobile (wcześniej był całkiem ukryty).
  const calculatorButton = materials.getByRole('button', { name: '📐 Kalkulator szafek' });
  await expect(calculatorButton).toBeVisible();
  await calculatorButton.click();

  // Etap H, krok 1 — 3 karty Bloku 1 zastąpione jedną tabelą kalkulacji, widoczną od razu.
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');
  await expect(calculator.getByText('Materiały (× współczynnik 2)')).toBeVisible();
  await expect(calculator.getByText('Usługi (bez mnożnika)')).toBeVisible();

  // Etap Q, krok 1 — materiał "Płyta korpusu" żyje za gear-przyciskiem "⚙️ Materiały", zwinięty domyślnie.
  await calculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();

  // Selecty nie są ścięte do samej ceny — pełna nazwa materiału jest czytelna, nie tylko "170.00 zł / :".
  const bodyTrigger = calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne');
  await expect(bodyTrigger).toContainText(bodyBoard.name);
  await expect(bodyTrigger).toContainText('180.00 zł');

  // Tabela w trybie mobilnym chowa się w stos kompaktowych kart (stacked, patrz CSS
  // @media max-width: 640px) — strona nie przewija się w bok.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Etap M, krok 2 — dawna zwarta linijka "↳ Korpus: ..." zastąpiona kolumnami tabeli (Korpus
  // (m²)/Front (m²)/Obrzeże (mb)); tabela szafek ma własny poziomy scroll (overflow-x: auto na
  // .moduleTableScroll) zamiast "łamać się" w karty jak główna tabela kalkulacji — strona sama
  // mimo to nie przewija się w bok (sprawdzone niżej).
  await calculator.getByRole('button', { name: 'Z drzwiami', exact: true }).click();
  await expect(calculator.locator('[class*="moduleName"]', { hasText: 'Z drzwiami' })).toBeVisible();
  await expect(calculator.getByText('RAZEM ORIENTACYJNA WYCENA:')).toBeVisible();
});
