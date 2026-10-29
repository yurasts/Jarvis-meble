import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const trashedProject = {
  id: '00000000-0000-4000-8000-000000000102',
  full_name: 'Jan Nowak',
  client_name: 'Jan Nowak',
  project_name: 'Regał w koszu',
  project_scope: 'firma',
  lifecycle_status: 'trash',
};

const sidebar = page => page.getByRole('group', { name: 'Foldery systemowe' }).locator('..');

test('owner archives, restores and permanently deletes projects', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject, trashedProject]);

  await page.goto('/');
  const nav = sidebar(page);
  await expect(nav.getByRole('button', { name: 'Anna Kowalska', exact: true })).toBeVisible();
  // Проект из корзины не попадает в обычное дерево.
  await expect(nav.getByRole('button', { name: 'Jan Nowak', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /^Kosz/ })).toContainText('1');

  // Меню «⋯» клиента появляется при наведении на строку.
  await nav.getByRole('button', { name: 'Anna Kowalska', exact: true }).hover();
  await nav.getByRole('button', { name: 'Działania: Anna Kowalska' }).click();
  await page.getByRole('menuitem', { name: 'W archiwum' }).click();
  await expect(nav.getByRole('button', { name: /^Archiwum/ })).toContainText('1');
  expect(state.projects[0]).toMatchObject({ lifecycle_status: 'archived' });

  await nav.getByRole('button', { name: /^Archiwum/ }).click();
  await nav.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await nav.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Kategorie plików projektu' })).toBeVisible();
  await nav.getByRole('button', { name: 'Szafa istniejąca', exact: true }).locator('..')
    .getByRole('button', { name: 'Więcej działań' }).click();
  await page.getByRole('menuitem', { name: 'Przywróć' }).click();
  await expect(nav.getByRole('button', { name: /^Archiwum/ })).toContainText('0');
  expect(state.projects[0]).toMatchObject({ lifecycle_status: 'active' });

  await nav.getByRole('button', { name: /^Kosz/ }).click();
  await nav.getByRole('button', { name: 'Jan Nowak', exact: true }).click();
  await nav.getByRole('button', { name: 'Usuń trwale: Regał w koszu' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć projekt trwale?' });
  await expect(dialog).toContainText('Jan Nowak — Regał w koszu');
  await dialog.getByRole('button', { name: 'Usuń trwale' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /^Kosz/ })).toContainText('0');
  expect(state.projects).toHaveLength(1);
});

test('assembler restores from the trash but cannot delete permanently', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject, trashedProject], { role: 'assembler' });

  await page.goto('/');
  const nav = sidebar(page);
  await nav.getByRole('button', { name: /^Kosz/ }).click();
  await nav.getByRole('button', { name: 'Jan Nowak', exact: true }).click();

  await expect(nav.getByRole('button', { name: 'Usuń trwale: Regał w koszu' })).toBeDisabled();
  await nav.getByRole('button', { name: 'Przywróć: Regał w koszu' }).click();

  await expect(nav.getByRole('button', { name: /^Kosz/ })).toContainText('0');
  expect(state.projects[1]).toMatchObject({ lifecycle_status: 'active' });
});
