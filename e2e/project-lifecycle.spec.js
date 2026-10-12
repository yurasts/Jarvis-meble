import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('owner creates and edits a project without losing changes, then records a payment', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject]);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Dodaj projekt' })).toBeVisible();

  await page.getByRole('button', { name: 'Dodaj projekt' }).click();
  const createProjectModal = page.getByRole('heading', { name: 'Dodaj projekt' }).locator('..');
  await expect(createProjectModal).toBeVisible();
  await createProjectModal.locator('input').nth(0).fill('Jan Nowak');
  await createProjectModal.locator('input').nth(1).fill('Kuchnia E2E');
  await createProjectModal.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('button', { name: /Kuchnia E2E/ })).toBeVisible();
  expect(state.projects).toHaveLength(2);
  expect(state.projects[1]).toMatchObject({
    client_name: 'Jan Nowak',
    project_name: 'Kuchnia E2E',
    project_scope: 'firma',
  });

  await page.getByRole('button', { name: /Kuchnia E2E/ }).click();
  const projectName = page.getByPlaceholder('Nazwa projektu (szafa, kuchnia...)');
  await expect(projectName).toHaveValue('Kuchnia E2E');
  await projectName.fill('Kuchnia E2E po zmianie');

  await page.getByRole('button', { name: /Szafa istniejąca/ }).click();
  const dirtyDialog = page.getByRole('heading', { name: 'Masz niezapisane zmiany' }).locator('..');
  await expect(dirtyDialog).toBeVisible();
  await dirtyDialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(projectName).toHaveValue('Kuchnia E2E po zmianie');

  await page.locator('.main-content').getByRole('button', { name: /Zapisz/ }).first().click();
  await expect(page.getByText('✓ Zapisano')).toBeVisible();
  expect(state.projects[1].project_name).toBe('Kuchnia E2E po zmianie');

  await page.getByRole('button', { name: 'Rozliczenia' }).click();
  await page.getByRole('button', { name: /Wp/ }).click();
  await page.getByLabel('Nazwa operacji').fill('Zaliczka E2E');
  await page.getByLabel('Kwota operacji').fill('1250');
  await page.getByRole('button', { name: /Zapisz operacj/ }).click();

  await expect(page.getByText('Zaliczka E2E')).toBeVisible();
  expect(state.transactions).toHaveLength(1);
  expect(state.transactions[0]).toMatchObject({
    project_id: state.projects[1].id,
    direction: 'inflow',
    amount: 1250,
    description: 'Zaliczka E2E',
  });
});
