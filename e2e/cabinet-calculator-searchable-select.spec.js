import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const thirdBoard = { id: 3, name: 'U630 ST76 Grafit', category: 'Płyta', unit: 'szt', price: 235, price_history: [] };
const edge = { id: 4, name: 'ABS 2mm Biały', category: 'Obrzeże', unit: 'mb', price: 3.5, price_history: [] };
const hinge = { id: 5, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const runner = { id: 6, name: 'Blum Tandem L-500', category: 'Prowadnice', unit: 'kpl', price: 45, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

test('Kalkulator szafek: SearchableMaterialSelect — otwarcie, filtrowanie po nazwie i ceny na liście/triggerze', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, thirdBoard, edge, hinge, runner],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');

  // Etap H, krok 1 — jedna tabela kalkulacji, widoczna od razu (zamiast 3 kart tematycznych).
  await expect(calculator.getByText('Materiały (× współczynnik 2)')).toBeVisible();
  await expect(calculator.getByText('Usługi (bez mnożnika)')).toBeVisible();

  // Etap Q, krok 1 — materiały płyty/kromki żyją za gear-przyciskiem "⚙️ Materiały", zwinięty domyślnie.
  await calculator.getByRole('button', { name: 'Materiały — ⬇️ Szafki dolne' }).click();

  // Trigger "Płyta frontu" pokazuje jakąś domyślnie wybraną nazwę z pogrubioną ceną (dokładny
  // domyślny wybór zależy od heurystyki biała/kolorowa — nieistotne dla tego testu).
  const frontTrigger = calculator.getByLabel('Płyta frontu — ⬇️ Szafki dolne');
  await expect(frontTrigger).toContainText(/\d+\.\d{2} zł/);

  // Otwarcie popoveru — pole szukajki i wszystkie 3 pozycje Płyty widoczne, każda z ceną.
  await frontTrigger.click();
  const searchInput = page.getByPlaceholder('🔍 Szukaj po nazwie lub kodzie…');
  await expect(searchInput).toBeFocused();
  await expect(page.getByRole('option', { name: new RegExp(`${bodyBoard.name}.*180.00 zł`) })).toBeVisible();
  await expect(page.getByRole('option', { name: new RegExp(`${frontBoard.name}.*220.00 zł`) })).toBeVisible();
  await expect(page.getByRole('option', { name: new RegExp(`${thirdBoard.name}.*235.00 zł`) })).toBeVisible();

  // Wybór konkretnej pozycji z listy — trigger aktualizuje się na jej nazwę/cenę.
  await page.getByRole('option', { name: new RegExp(frontBoard.name) }).click();
  await expect(searchInput).not.toBeVisible();
  await expect(frontTrigger).toContainText(frontBoard.name);
  await expect(frontTrigger).toContainText('220.00 zł');

  // Filtrowanie po nazwie — zostaje tylko pasująca pozycja.
  await frontTrigger.click();
  await searchInput.fill('grafit');
  await expect(page.getByRole('option', { name: new RegExp(thirdBoard.name) })).toBeVisible();
  await expect(page.getByRole('option', { name: new RegExp(bodyBoard.name) })).toHaveCount(0);
  await expect(page.getByRole('option', { name: new RegExp(frontBoard.name) })).toHaveCount(0);

  // Wybór przefiltrowanej pozycji — trigger aktualizuje się na nową nazwę/cenę, popover się zamyka.
  await page.getByRole('option', { name: new RegExp(thirdBoard.name) }).click();
  await expect(searchInput).not.toBeVisible();
  await expect(frontTrigger).toContainText(thirdBoard.name);
  await expect(frontTrigger).toContainText('235.00 zł');

  // Escape zamyka bez zmiany wyboru.
  const bodyTrigger = calculator.getByLabel('Płyta korpusu — ⬇️ Szafki dolne');
  await bodyTrigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('🔍 Szukaj po nazwie lub kodzie…')).not.toBeVisible();
  await expect(bodyTrigger).toContainText(bodyBoard.name);
});
