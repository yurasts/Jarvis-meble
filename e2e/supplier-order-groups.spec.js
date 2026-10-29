import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const biPlast = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Bi-Plast',
  address: 'ul. Długa 12, Gdańsk',
  google_maps_url: '',
  phone: '+48 500 100 200',
  email: '',
  contact_person: 'Anna',
  notes: '',
  is_archived: false,
};
const rehau = {
  id: 'c2222222-2222-2222-2222-222222222222',
  name: 'Rehau',
  address: '',
  google_maps_url: 'https://maps.google.com/?q=Rehau',
  phone: '+48 600 900 100',
  email: '',
  contact_person: '',
  notes: '',
  is_archived: false,
};

const abs = {
  id: 601,
  name: 'ABS W960 SM',
  symbol: 'ABS-1',
  category: 'Obrzeże',
  unit: 'mb',
  price: 4.35,
  supplier: biPlast.name,
  price_history: [],
  material_suppliers: [
    { id: 'link-601-0', material_id: 601, supplier_id: biPlast.id, supplier_sku: 'BP-1', supplier_price: 4, is_preferred: true, supplier: biPlast },
    { id: 'link-601-1', material_id: 601, supplier_id: rehau.id, supplier_sku: 'RH-9', supplier_price: 4.2, is_preferred: false, supplier: rehau },
  ],
};
const hinge = {
  id: 602,
  name: 'Zawias puszkowy 110°',
  symbol: 'ZP-110',
  category: 'Okucia',
  unit: 'szt',
  price: 3.2,
  supplier: biPlast.name,
  price_history: [],
  material_suppliers: [
    { id: 'link-602-0', material_id: 602, supplier_id: biPlast.id, supplier_sku: '', supplier_price: 3, is_preferred: true, supplier: biPlast },
  ],
};
const noSupplierMaterial = {
  id: 603,
  name: 'Niestandardowy profil',
  symbol: '',
  category: 'Inne',
  unit: 'szt',
  price: 1,
  supplier: '',
  price_history: [],
  material_suppliers: [],
};

const projectWithMaterials = {
  ...existingProject,
  calc_materials: [
    { id: abs.id, name: abs.name, price: abs.price, unit: abs.unit, quantity: 24, addedByColor: '#2b6cb0' },
    { id: hinge.id, name: hinge.name, price: hinge.price, unit: hinge.unit, quantity: 12, addedByColor: '#2b6cb0' },
    { id: noSupplierMaterial.id, name: noSupplierMaterial.name, price: noSupplierMaterial.price, unit: noSupplierMaterial.unit, quantity: 1, addedByColor: '#2b6cb0' },
  ],
};

test('project materials show their supplier, switch it in 1 click, and copy the grouped order text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });

  // Przechwytuje navigator.clipboard.writeText bez proszenia o uprawnienia przeglądarki —
  // najpewniejszy sposób w CI/headless.
  await page.addInitScript(() => {
    window.__copiedTexts = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: text => { window.__copiedTexts.push(text); return Promise.resolve(); } },
      configurable: true,
    });
  });

  const state = await installAuthenticatedSupabaseMock(page, [projectWithMaterials], {
    materials: [abs, hinge, noSupplierMaterial],
    suppliers: [biPlast, rehau],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await expect(materials).toBeVisible();

  // Jeden dostawca — zwykły tekst, bez selecta.
  await expect(materials.getByTitle('Bi-Plast')).toBeVisible();
  // Brak dostawcy — pusta komórka.
  await expect(materials.getByText('Niestandardowy profil')).toBeVisible();

  // Dwóch dostawców — select, domyślnie is_preferred (Bi-Plast).
  const supplierSelect = materials.getByLabel(`Dostawca: ${abs.name}`);
  await expect(supplierSelect).toHaveValue(biPlast.id);
  await supplierSelect.selectOption(rehau.id);
  await expect(supplierSelect).toHaveValue(rehau.id);

  // Panel «📦 Zamówienia».
  const ordersToggle = materials.getByRole('button', { name: '📦 Zamówienia' });
  await ordersToggle.click();

  const rehauGroup = page.getByTestId(`supplier-group-${rehau.id}`);
  await expect(rehauGroup.getByText('1 / 1 poz.')).toBeVisible();
  const mapLink = rehauGroup.getByRole('link', { name: /Mapa/ });
  await expect(mapLink).toHaveAttribute('href', rehau.google_maps_url);
  await expect(mapLink).toHaveAttribute('target', '_blank');

  const biPlastGroup = page.getByTestId(`supplier-group-${biPlast.id}`);
  await expect(biPlastGroup.getByText('1 / 1 poz.')).toBeVisible();
  await expect(biPlastGroup.getByText('Anna · +48 500 100 200')).toBeVisible();

  // Odhaczenie pozycji — licznik się zmniejsza, kopiowany tekst jej nie zawiera.
  await biPlastGroup.getByText(hinge.name).click();
  await expect(biPlastGroup.getByText('0 / 1 poz.')).toBeVisible();
  const biPlastCopyBtn = biPlastGroup.getByRole('button', { name: /Kopiuj zamówienie/ });
  await expect(biPlastCopyBtn).toBeDisabled();

  // Kopiowanie zamówienia Rehau — pełny tekst, bez cen, z flashem potwierdzenia.
  const rehauCopyBtn = rehauGroup.getByRole('button', { name: /Kopiuj zamówienie/ });
  await rehauCopyBtn.click();
  await expect(rehauGroup.getByRole('button', { name: '✓ Skopiowano!' })).toBeVisible();

  const copiedTexts = await page.evaluate(() => window.__copiedTexts);
  expect(copiedTexts).toHaveLength(1);
  expect(copiedTexts[0]).toBe(
    'Dzień dobry,\nproszę o przygotowanie zamówienia (Projekt: Szafa istniejąca):\n\n'
    + '1. ABS W960 SM [Kod: RH-9] — 24 mb\n\nPozdrawiam',
  );
  expect(copiedTexts[0]).not.toMatch(/zł/);

  await expect(rehauGroup.getByRole('button', { name: /Kopiuj zamówienie/ })).toBeVisible({ timeout: 4000 });

  expect(state.projects[0].id).toBe(projectWithMaterials.id);
});
