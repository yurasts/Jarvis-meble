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

test('desktop keeps files first and every workspace section in one full-width vertical flow', async ({ page }) => {
  await page.setViewportSize({ width: 1104, height: 1200 });
  const constrainedProject = {
    ...existingProject,
    calc_materials: [
      { id: 'material-wide-1', name: 'HDF BIAŁY (1.0) 2850×2070 bardzo długa nazwa materiału', price: 56.73, quantity: 1, unit: 'szt' },
      { id: 'material-wide-2', name: 'Profil LED ze skrzydełkiem bardzo długa nazwa pozycji', price: 12, quantity: 8, unit: 'szt' },
    ],
    calc_services: [
      { id: 'service-wide-1', name: 'Podłączenie oświetlenia LED z bardzo długą nazwą usługi', price: 200, quantity: 1 },
    ],
  };
  await installAuthenticatedSupabaseMock(page, [constrainedProject], {
    projectFiles: [
      {
        id: 701,
        client_id: constrainedProject.id,
        category: 'usterki',
        file_name: 'front.jpg',
        file_path: 'project/front.jpg',
        file_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        file_type: 'image/jpeg',
        size_bytes: 2516582,
        uploaded_at: '2026-10-27T19:20:00+01:00',
      },
      {
        id: 702,
        client_id: constrainedProject.id,
        category: 'sto',
        file_name: 'kuchnia.sto',
        file_path: 'project/sto/kuchnia.sto',
        file_url: 'https://files.example/kuchnia.sto',
        file_type: 'application/octet-stream',
        size_bytes: 2516582,
        uploaded_at: '2026-10-27T19:20:00+01:00',
      },
    ],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();

  const workspace = page.locator('.main-content');
  const files = workspace.getByRole('region', { name: 'Pliki projektu' });
  const categoryRail = files.getByRole('group', { name: 'Kategorie plików projektu' });
  const preview = files.getByTestId('project-files-preview');
  const stoHeader = workspace.getByTestId('project-sto-header');
  const saveButton = workspace.getByRole('button', { name: /Zapisz/ }).first();
  const materials = workspace.getByRole('region', { name: 'Materiały' });
  const services = workspace.getByRole('region', { name: 'Usługi' });
  const cash = workspace.getByRole('region', { name: 'Rozliczenia' });
  const tasks = workspace.getByRole('region', { name: 'Zadania projektu' });
  const info = workspace.getByRole('region', { name: 'Informacje' });

  await expect(files).toBeVisible();
  for (const label of ['Projekt', 'Zadanie', 'Krój', 'Montaż']) {
    await expect(categoryRail.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(categoryRail.getByRole('button', { name: /Dodaj plik/ })).toBeVisible();
  await expect(stoHeader.getByTitle('kuchnia.sto · 2.4 MB · 27.10.2026, 19:20')).toBeVisible();
  // Miniatury w galerii desktopowej nie mają już plakietki z rozmiarem/datą pod obrazem —
  // rozmiar/data zostają wyłącznie w nagłówku .sto.
  await expect(preview.getByRole('img', { name: 'front.jpg' })).toBeVisible();
  await expect(files.getByText('2.4 MB', { exact: false })).toHaveCount(0);

  const materialsTable = materials.locator('table[data-kind="materials"]');
  const servicesTable = services.locator('table[data-kind="services"]');
  const pro100Label = stoHeader.getByText('Plik PRO100 (.sto):', { exact: true });
  const pro100Value = stoHeader.getByTitle('kuchnia.sto · 2.4 MB · 27.10.2026, 19:20');
  const pro100Download = stoHeader.getByRole('button', { name: 'Pobierz', exact: true });
  const firstCategoryButton = categoryRail.getByRole('button', { name: 'Projekt', exact: true });
  const [filesBox, railBox, previewBox, stoHeaderBox, saveButtonBox, firstCategoryButtonBox, materialsBox, materialsTableBox, servicesBox, servicesTableBox, cashBox, tasksBox, infoBox, pro100LabelBox, pro100ValueBox, pro100DownloadBox] = await Promise.all([
    files.boundingBox(),
    categoryRail.boundingBox(),
    preview.boundingBox(),
    stoHeader.boundingBox(),
    saveButton.boundingBox(),
    firstCategoryButton.boundingBox(),
    materials.boundingBox(),
    materialsTable.boundingBox(),
    services.boundingBox(),
    servicesTable.boundingBox(),
    cash.boundingBox(),
    tasks.boundingBox(),
    info.boundingBox(),
    pro100Label.boundingBox(),
    pro100Value.boundingBox(),
    pro100Download.boundingBox(),
  ]);
  expect(filesBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(stoHeaderBox).not.toBeNull();
  expect(saveButtonBox).not.toBeNull();
  expect(firstCategoryButtonBox).not.toBeNull();
  expect(materialsBox).not.toBeNull();
  expect(materialsTableBox).not.toBeNull();
  expect(servicesBox).not.toBeNull();
  expect(servicesTableBox).not.toBeNull();
  expect(cashBox).not.toBeNull();
  expect(tasksBox).not.toBeNull();
  expect(infoBox).not.toBeNull();
  expect(pro100LabelBox).not.toBeNull();
  expect(pro100ValueBox).not.toBeNull();
  expect(pro100DownloadBox).not.toBeNull();
  for (const sectionBox of [materialsBox, servicesBox, cashBox, tasksBox, infoBox]) {
    expect(Math.abs(sectionBox.x - filesBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sectionBox.width - filesBox.width)).toBeLessThanOrEqual(1);
  }
  expect(filesBox.y).toBeLessThan(materialsBox.y);
  expect(materialsBox.y).toBeLessThan(servicesBox.y);
  expect(servicesBox.y).toBeLessThan(cashBox.y);
  expect(cashBox.y).toBeLessThan(tasksBox.y);
  expect(tasksBox.y).toBeLessThan(infoBox.y);
  expect(materialsTableBox.x + materialsTableBox.width).toBeLessThanOrEqual(materialsBox.x + materialsBox.width);
  expect(servicesTableBox.x + servicesTableBox.width).toBeLessThanOrEqual(servicesBox.x + servicesBox.width);
  expect(railBox.x).toBeLessThan(previewBox.x);
  expect(railBox.x + railBox.width).toBeLessThanOrEqual(previewBox.x);
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(filesBox.x + filesBox.width);
  expect(firstCategoryButtonBox.height).toBeLessThanOrEqual(28);
  expect(stoHeaderBox.height).toBeLessThanOrEqual(26);
  expect(Math.abs((stoHeaderBox.y + stoHeaderBox.height / 2) - (saveButtonBox.y + saveButtonBox.height / 2))).toBeLessThanOrEqual(1);
  expect(pro100LabelBox.x + pro100LabelBox.width).toBeLessThanOrEqual(pro100ValueBox.x);
  expect(pro100ValueBox.x + pro100ValueBox.width).toBeLessThanOrEqual(pro100DownloadBox.x);

  // Folder controls were removed from the global project tree, so there is one desktop rail only.
  await expect(page.getByRole('group', { name: 'Kategorie plików projektu' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Foldery plików projektu' })).toHaveCount(0);
});
