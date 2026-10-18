import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const secondProject = {
  ...existingProject,
  id: '00000000-0000-4000-8000-000000000103',
  project_name: 'Kuchnia Anny',
};

test('renaming a client moves every project of the group to the new name', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject, secondProject]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();

  await page.getByRole('button', { name: 'Edytuj dane: Anna Kowalska' }).click();
  await page.getByLabel('Imię klienta').fill('Anna Kowalska-Nowak');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await page.locator('.main-content').getByRole('button', { name: /Zapisz/ }).first().click();
  await expect(page.getByText('✓ Zapisano')).toBeVisible();

  expect(state.projects.map(project => project.client_name)).toEqual(['Anna Kowalska-Nowak', 'Anna Kowalska-Nowak']);
  expect(state.projects.map(project => project.full_name)).toEqual(['Anna Kowalska-Nowak', 'Anna Kowalska-Nowak']);
  // Jedna grupa w drzewie, rozwinięta, z oboma projektami.
  await expect(page.getByRole('button', { name: 'Anna Kowalska', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anna Kowalska-Nowak', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Kuchnia Anny', exact: true })).toBeVisible();
});

test('workspace sections replace tabs and remember what is collapsed', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject, secondProject]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();

  const workspace = page.locator('.main-content');
  for (const name of ['Materiały', 'Usługi', 'Rozliczenia', 'Zadania projektu', 'Informacje']) {
    await expect(workspace.getByRole('region', { name })).toBeVisible();
  }

  const materials = workspace.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: /^Materiały/ }).click();
  await expect(materials.getByRole('button', { name: /^Materiały/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(materials.getByPlaceholder(/Szukaj materiału/)).toBeHidden();

  // Inny projekt — sekcja nadal zwinięta.
  await page.getByRole('button', { name: 'Kuchnia Anny', exact: true }).click();
  await expect(workspace.getByRole('region', { name: 'Materiały' }).getByRole('button', { name: /^Materiały/ }))
    .toHaveAttribute('aria-expanded', 'false');
  await expect(workspace.getByRole('region', { name: 'Usługi' }).getByRole('button', { name: /^Usługi/ }))
    .toHaveAttribute('aria-expanded', 'true');
});
