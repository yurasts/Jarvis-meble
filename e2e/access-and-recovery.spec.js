import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('designer can open an assigned project but cannot create a new one', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [{
    ...existingProject,
    assigned_designer: '00000000-0000-4000-8000-000000000001',
  }], { role: 'designer' });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Anna Kowalska', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dodaj projekt' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /Szafa/ }).click();
  await expect(page.getByRole('group', { name: 'Foldery plików projektu' })).toBeVisible();
  await page.getByRole('button', { name: 'Edytuj dane: Anna Kowalska' }).click();
  await expect(page.getByLabel('Nazwa projektu')).toHaveValue('Szafa istniejąca');
});

test('a partial bootstrap failure keeps projects usable and retries only the failed resource', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    failures: { materials: Number.POSITIVE_INFINITY },
  });

  await page.goto('/');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Nie udało się załadować: materiały.');
  await expect(alert).toContainText('Pozostała część aplikacji nadal działa.');
  await expect(page.getByRole('button', { name: 'Anna Kowalska', exact: true })).toBeVisible();
  const requestsBeforeRetry = { ...state.requests };
  state.failures.materials = 0;

  await alert.getByRole('button', { name: 'Spróbuj ponownie' }).click();

  await expect(alert).toHaveCount(0);
  expect(state.requests.materials).toBe(requestsBeforeRetry.materials + 1);
  expect(state.requests.clients).toBe(requestsBeforeRetry.clients);
  expect(state.requests.services).toBe(requestsBeforeRetry.services);
});
