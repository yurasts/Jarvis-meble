import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('favorites and a manual catalog item persist without clicking project Save', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [{
      id: 41,
      name: 'Board',
      category: 'Inne',
      unit: 'szt',
      price: 25,
      supplier: 'Brak',
      symbol: null,
      price_history: [],
    }],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /Szafa/, exact: true }).click();

  const workspace = page.locator('.main-content');
  const materialSearch = workspace.getByPlaceholder(/Szukaj materia/);
  await materialSearch.focus();

  const favorite = workspace.getByRole('button', { name: 'Dodaj Board do ulubionych' });
  await favorite.click();
  await expect(workspace.getByRole('button', { name: 'Usuń Board z ulubionych' })).toHaveAttribute('aria-pressed', 'true');
  expect(state.materials[0].is_favorite).toBe(true);

  await workspace.getByRole('region', { name: 'Materiały' })
    .getByRole('button', { name: /^\+ R/ }).click();
  await page.getByLabel('Nazwa').fill('Manual board');
  await page.getByLabel(/Cena/).fill('49.50');
  await page.getByRole('heading', { name: 'Nowy materiał' }).locator('..')
    .getByRole('button', { name: 'Dodaj', exact: true }).click();

  await expect(workspace.getByRole('status')).toContainText('Zapisano');
  expect(state.materials.some(item => item.name === 'Manual board')).toBe(true);
  expect(state.projects[0].calc_materials.some(item => item.name === 'Manual board')).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /Szafa/, exact: true }).click();
  await expect(page.locator('.main-content').getByText('Manual board', { exact: true })).toBeVisible();
});
