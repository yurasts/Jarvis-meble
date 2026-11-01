import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edgeBody = { id: 3, name: 'ABS W960 SM Biały', category: 'Obrzeże', unit: 'mb', price: 1.13, price_history: [] };
const edgeFront = { id: 9, name: 'ABS U702 ST9 Kaszmir', category: 'Obrzeże', unit: 'mb', price: 4.2, price_history: [] };
const hinge = { id: 4, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const drawerExternal = { id: 7, name: 'MERIVOBOX E wysoka szuflada zewnętrzna, L=500 mm, BOXCOVER ze szkłem, 40 kg', category: 'Prowadnice', unit: 'kpl', price: 300, price_history: [] };
const drawerInternal = { id: 8, name: 'MERIVOBOX M niska szuflada wewnętrzna, L=500 mm, 40 kg', category: 'Prowadnice', unit: 'kpl', price: 210, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

test('Szczegółowa kalkulacja wyceny fits long MERIVOBOX names with no horizontal scroll, from wide desktop down to the narrowest supported width', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edgeBody, edgeFront, hinge, drawerExternal, drawerInternal],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');
  await calculator.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }).click();
  await calculator.getByRole('button', { name: '🔍 Szczegóły wyceny' }).click();

  const dialog = page.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' });
  await expect(dialog.getByText(drawerExternal.name)).toBeVisible();

  const noHorizontalScroll = async () => {
    const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  };
  await noHorizontalScroll();

  // Kalkulator szafek jest desktop-only (ADR-010) — próg mobile shell w tej appce to 768px, więc
  // "wąski ekran" tu oznacza najwęższy wariant DESKTOPOWY (np. iPad portrait), nie telefon.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(dialog.getByText(drawerExternal.name)).toBeVisible();
  await noHorizontalScroll();
});

test('progressive disclosure: global ladder checkboxes reveal/hide the extra board and edge selects', async ({ page }) => {
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
  const calculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');

  await expect(calculator.getByLabel('Płyta korpusu')).toBeVisible();
  await expect(calculator.getByLabel('Płyta frontu (góra)')).toHaveCount(0);

  await calculator.getByLabel('Korpus z płyty frontowej').check();
  await expect(calculator.getByLabel('Płyta korpusu')).toHaveCount(0);

  await calculator.getByLabel('Osobna płyta dla frontów górnych (3 rodzaje płyt)').check();
  await expect(calculator.getByLabel('Płyta frontu (góra)')).toBeVisible();
  await expect(calculator.getByLabel('Obrzeże frontu (góra)')).toBeVisible();

  await calculator.getByLabel('Osobna płyta dla frontów górnych (3 rodzaje płyt)').uncheck();
  await expect(calculator.getByLabel('Płyta frontu (góra)')).toHaveCount(0);
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
  const calculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');

  await calculator.getByRole('button', { name: '+ 🚪 Szafka dolna z drzwiami' }).click();
  await calculator.getByLabel('Szer. (mm)').fill('777');
  await calculator.getByLabel('Korpus z płyty frontowej').check();

  await expect.poll(() => state.projects[0].calculator_state?.modules?.[0]?.W).toBe(777);
  await expect(calculator.getByRole('status')).toHaveText('✓ Zapisano w projekcie');

  await page.reload();
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();
  await page.getByRole('region', { name: 'Materiały' }).getByRole('button', { name: '📐 Kalkulator szafek' }).click();

  const restoredCalculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');
  await expect(restoredCalculator.getByText('🚪 Szafka dolna z drzwiami', { exact: true })).toBeVisible();
  await expect(restoredCalculator.getByLabel('Szer. (mm)')).toHaveValue('777');
  await expect(restoredCalculator.getByLabel('Płyta korpusu')).toHaveCount(0); // Korpus z płyty frontowej przetrwało reload
});
