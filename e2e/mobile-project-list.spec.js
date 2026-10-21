import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// feat/mobile-project-list-parity (2026-10): mobileLayout теперь рендерится тем же деревом
// клиент→проекты, что и desktop treeLayout (ProjectNav) — карандаш, Bilans, меню «⋯»,
// Archiwum/Kosz — кроме папок файлов, которые на mobile в списке сознательно не показываются.

test.use({ viewport: { width: 390, height: 844 } });

const secondProject = {
  id: '00000000-0000-4000-8000-000000000103',
  full_name: 'Anna Kowalska',
  client_name: 'Anna Kowalska',
  project_name: 'Kuchnia Anny',
  project_scope: 'firma',
};

const trashedProject = {
  id: '00000000-0000-4000-8000-000000000102',
  full_name: 'Jan Nowak',
  client_name: 'Jan Nowak',
  project_name: 'Regał w koszu',
  project_scope: 'firma',
  lifecycle_status: 'trash',
};

test('mobile project list uses the desktop accordion tree, without file folders', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject, trashedProject]);

  await page.goto('/');

  // Клиент свёрнут по умолчанию — ровно как на desktop.
  const clientToggle = page.getByRole('button', { name: 'Anna Kowalska', exact: true });
  await expect(clientToggle).toHaveAttribute('aria-expanded', 'false');
  await clientToggle.click();
  await expect(clientToggle).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();
  // Папки файлов есть в открытом проекте (полка), но НЕ в дереве списка — п.2 задания.
  await expect(page.getByRole('button', { name: 'Projekt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Projekty' }).click();
  await expect(page.getByRole('group', { name: 'Foldery plików projektu' })).toHaveCount(0);

  // Archiwum/Kosz — всегда видны внизу, со счётчиками, как на desktop.
  await expect(page.getByRole('button', { name: /^Archiwum/ })).toContainText('0');
  await expect(page.getByRole('button', { name: /^Kosz/ })).toContainText('1');
  await page.getByRole('button', { name: /^Kosz/ }).click();
  await expect(page.getByRole('button', { name: 'Jan Nowak', exact: true })).toBeVisible();
});

test('archives, restores and permanently deletes projects from the mobile tree', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject, trashedProject]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).hover();
  await page.getByRole('button', { name: 'Działania: Anna Kowalska' }).click();
  await page.getByRole('menuitem', { name: 'W archiwum' }).click();
  await expect(page.getByRole('button', { name: /^Archiwum/ })).toContainText('1');
  expect(state.projects[0]).toMatchObject({ lifecycle_status: 'archived' });

  await page.getByRole('button', { name: /^Archiwum/ }).click();
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  const row = page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).locator('..');
  await row.getByRole('button', { name: 'Więcej działań' }).click();
  await page.getByRole('menuitem', { name: 'Przywróć' }).click();
  await expect(page.getByRole('button', { name: /^Archiwum/ })).toContainText('0');
  expect(state.projects[0]).toMatchObject({ lifecycle_status: 'active' });

  await page.getByRole('button', { name: /^Kosz/ }).click();
  await page.getByRole('button', { name: 'Jan Nowak', exact: true }).click();
  await page.getByRole('button', { name: 'Usuń trwale: Regał w koszu' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć projekt trwale?' });
  await expect(dialog).toContainText('Jan Nowak — Regał w koszu');
  await dialog.getByRole('button', { name: 'Usuń trwale' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Kosz/ })).toContainText('0');
  expect(state.projects).toHaveLength(1);
});

test('the pencil on a client row opens the project and renames the whole group', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject, secondProject]);

  await page.goto('/');
  // Карандаш на свёрнутом клиенте: проект ещё не открыт — открывается сам (первый в группе),
  // а окно «Klient i projekt» всплывает автоматически (requestEditClient, App.jsx).
  await page.getByRole('button', { name: 'Edytuj dane: Anna Kowalska' }).click();

  const dialog = page.getByRole('dialog', { name: '✏️ Klient i projekt' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Imię klienta').fill('Anna Kowalska-Nowak');
  await dialog.getByRole('button', { name: 'Gotowe' }).click();

  await page.getByRole('button', { name: '💾 Zapisz' }).click();
  await expect(page.getByText('✓ Zapisano')).toBeVisible();

  expect(state.projects.map(project => project.client_name)).toEqual(['Anna Kowalska-Nowak', 'Anna Kowalska-Nowak']);

  await page.getByRole('button', { name: '← Projekty' }).click();
  await expect(page.getByRole('button', { name: 'Anna Kowalska', exact: true })).toHaveCount(0);
  const renamedToggle = page.getByRole('button', { name: 'Anna Kowalska-Nowak', exact: true });
  await expect(renamedToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Kuchnia Anny', exact: true })).toBeVisible();
});

test('a role without lifecycle rights sees the tree read-only, without the ⋯ menu', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject], { role: 'designer' });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).hover();
  await expect(page.getByRole('button', { name: /^Działania:/ })).toHaveCount(0);
});
