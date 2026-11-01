import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const kit = { id: 601, name: 'MERIVOBOX E wysoka szuflada zewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 300, price_history: [] };
const runner = { id: 602, name: 'Prowadnice Merivobox L-500 40kg (kpl L+P)', category: 'Prowadnice', unit: 'kpl', price: 25, symbol: 'BL-450.5001B', price_history: [], is_kit_component: true };
const boxcover = { id: 603, name: 'Boxcover Merivobox E biały do szkła (kpl L+P)', category: 'Prowadnice', unit: 'kpl', price: 10, symbol: 'BL-ZL4M0030S SW', price_history: [], is_kit_component: true };
const board = { id: 604, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, price_history: [] };

test('kit components are hidden from Materiały by default and the Skład zestawu pill shows them with prices', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [kit, runner, boxcover, board],
    materialKitItems: [
      { kit_material_id: kit.id, component_material_id: runner.id, quantity: 1 },
      { kit_material_id: kit.id, component_material_id: boxcover.id, quantity: 1 },
    ],
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Materiały' }).click();

  await expect(page.getByText(kit.name)).toBeVisible();
  await expect(page.getByText(board.name)).toBeVisible();
  await expect(page.getByText(runner.name)).not.toBeVisible();
  await expect(page.getByText(boxcover.name)).not.toBeVisible();

  const toggle = page.getByLabel('Pokaż elementy składowe (2)');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByText(runner.name)).toBeVisible();
  await expect(page.getByText(boxcover.name)).toBeVisible();
  await toggle.uncheck();
  await expect(page.getByText(runner.name)).not.toBeVisible();

  const pill = page.getByRole('button', { name: '🧩 Skład zestawu (2 el.)' });
  await expect(pill).toBeVisible();
  await pill.click();
  const runnerRow = page.locator('li').filter({ hasText: runner.name });
  await expect(runnerRow).toContainText('1 kpl');
  await expect(runnerRow).toContainText('25.00');
  await expect(page.getByText('Razem')).toBeVisible();
  await expect(page.getByText('35.00 zł')).toBeVisible();
});

test('kit components never appear in the project material search', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [kit, runner, boxcover, board],
    materialKitItems: [
      { kit_material_id: kit.id, component_material_id: runner.id, quantity: 1 },
    ],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByPlaceholder('Szukaj materiału w bazie…').fill('Merivobox');

  await expect(materials.getByText(kit.name)).toBeVisible();
  await expect(materials.getByText(runner.name)).not.toBeVisible();
});
