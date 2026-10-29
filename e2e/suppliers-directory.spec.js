import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('supplier directory, material links and secondary-supplier project filtering work together', async ({ page }) => {
  const alfa = {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Alfa Płyty',
    address: 'ul. Długa 12, Gdańsk',
    google_maps_url: '',
    phone: '+48 500 100 200',
    email: 'alfa@example.test',
    contact_person: 'Anna',
    notes: '',
    is_archived: false,
  };
  const beta = {
    id: 'c2222222-2222-2222-2222-222222222222',
    name: 'Beta Okucia',
    address: 'Warszawa',
    google_maps_url: 'https://maps.google.com/?q=Beta',
    phone: '',
    email: '',
    contact_person: '',
    notes: '',
    is_archived: false,
  };
  const material = {
    id: 501,
    name: 'Płyta testowa',
    symbol: 'PT-1',
    category: 'Płyta',
    unit: 'szt',
    price: 100,
    supplier: alfa.name,
    price_history: [],
    material_suppliers: [{
      id: 'link-501-0',
      material_id: 501,
      supplier_id: alfa.id,
      supplier_sku: 'A-1',
      supplier_price: 99,
      is_preferred: true,
      supplier: alfa,
    }],
  };

  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    suppliers: [alfa, beta],
    materials: [material],
    materialSupplierLinks: [{
      id: 'link-501-0',
      material_id: 501,
      supplier_id: alfa.id,
      supplier_sku: 'A-1',
      supplier_price: 99,
      is_preferred: true,
    }],
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Materiały' }).click();
  await page.getByRole('button', { name: 'Dostawcy' }).click();

  const directory = page.getByRole('region', { name: 'Dostawcy' });
  const themeBackgrounds = [];
  for (const theme of ['light', 'dark', 'forest']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    themeBackgrounds.push(await directory.evaluate(element => getComputedStyle(element).backgroundColor));
  }
  expect(new Set(themeBackgrounds).size).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await directory.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  const mapLink = page.getByRole('link', { name: '📍 Mapa' }).first();
  await expect(mapLink).toHaveAttribute('target', '_blank');
  await expect(mapLink).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByText('1 mat.')).toBeVisible();

  await page.getByRole('button', { name: '+ Nowy dostawca' }).click();
  await page.getByLabel('Nazwa').fill('Gamma Blaty');
  await page.getByLabel('Adres').fill('Sopot');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Gamma Blaty')).toBeVisible();
  expect(state.suppliers.some(supplier => supplier.name === 'Gamma Blaty')).toBe(true);

  await page.getByRole('button', { name: '← Materiały' }).click();
  await page.getByRole('button', { name: 'Edytuj materiał Płyta testowa' }).click();
  await page.getByLabel('Dodaj dostawcę').selectOption(beta.id);
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect.poll(() => state.materialSupplierLinks.filter(link => link.material_id === 501).length).toBe(2);
  expect(state.materials[0].material_suppliers.map(link => link.supplier.name)).toEqual(['Alfa Płyty', 'Beta Okucia']);

  await page.getByRole('tab', { name: 'Panel' }).click();
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Szafa istniejąca', exact: true }).click();
  const materialSearch = page.getByPlaceholder(/Szukaj materiału w bazie/);
  await materialSearch.click();
  await page.getByLabel('Dostawca materiału').selectOption('Beta Okucia');
  const filteredMaterial = page.getByRole('listbox').getByRole('option').filter({ hasText: 'Płyta testowa' });
  await expect(filteredMaterial).toBeVisible();
  await expect(filteredMaterial).toContainText('Beta Okucia');
});
