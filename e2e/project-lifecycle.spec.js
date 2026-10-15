import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('owner saves a protected project draft and completes the cash transaction lifecycle', async ({ page }) => {
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
  await expect(page.getByRole('group', { name: 'Foldery plików projektu' })).toBeVisible();

  // Nazwy klienta i projektu edytuje się w oknie otwieranym ołówkiem przy kliencie w drzewie.
  await page.getByRole('button', { name: 'Edytuj dane: Jan Nowak' }).click();
  const projectName = page.getByLabel('Nazwa projektu');
  await expect(projectName).toHaveValue('Kuchnia E2E');
  await projectName.fill('Kuchnia E2E po zmianie');
  await page.getByRole('button', { name: 'Gotowe' }).click();

  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /Szafa istniejąca/ }).click();
  const dirtyDialog = page.getByRole('heading', { name: 'Masz niezapisane zmiany' }).locator('..');
  await expect(dirtyDialog).toBeVisible();
  await dirtyDialog.getByRole('button', { name: 'Anuluj' }).click();
  await page.getByRole('button', { name: 'Edytuj dane: Jan Nowak' }).click();
  await expect(projectName).toHaveValue('Kuchnia E2E po zmianie');
  await page.getByRole('button', { name: 'Gotowe' }).click();

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

  await page.getByRole('button', { name: /Zaliczka E2E/ }).click();
  await page.getByLabel('Nazwa operacji').fill('Zaliczka poprawiona');
  await page.getByLabel('Kwota operacji').fill('1500');
  await page.getByRole('button', { name: /Zapisz operacj/ }).click();

  await expect(page.getByText('Zaliczka poprawiona')).toBeVisible();
  expect(state.transactions[0]).toMatchObject({
    amount: 1500,
    description: 'Zaliczka poprawiona',
  });

  await page.getByRole('button', { name: /Zaliczka poprawiona/ }).click();
  await page.getByRole('button', { name: /Usu/ }).click();
  await page.getByRole('button', { name: 'Tak' }).click();

  await expect(page.getByText('Zaliczka poprawiona')).toHaveCount(0);
  expect(state.transactions).toHaveLength(0);
});
