import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Regresja: wybór dostawcy w <select> dialogu "Edytuj materiał" i od razu "Zapisz" (bez klikania
// pośredniego przycisku "Dodaj", który już nie istnieje) musi zapisać dostawcę w
// public.material_suppliers i natychmiast pokazać go w kolumnie "Dostawcy" tabeli materiałów.
test('selecting a supplier and clicking Zapisz right away saves it, with no intermediate click', async ({ page }) => {
  const dremTeem = {
    id: 'c3333333-3333-3333-3333-333333333333',
    name: 'DremTeem',
    address: '',
    google_maps_url: '',
    phone: '',
    email: '',
    contact_person: '',
    notes: '',
    is_archived: false,
  };
  const material = {
    id: 701,
    name: 'Płyta bez dostawcy',
    symbol: 'PBD-1',
    category: 'Płyta',
    unit: 'szt',
    price: 80,
    supplier: '',
    price_history: [],
    material_suppliers: [],
  };

  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    suppliers: [dremTeem],
    materials: [material],
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Materiały' }).click();

  const row = page.getByRole('row', { name: /Płyta bez dostawcy/ });
  await expect(row.getByText('-', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edytuj materiał Płyta bez dostawcy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edytuj materiał' });
  await expect(dialog.getByText('Brak przypisanych dostawców.')).toBeVisible();

  // Sama selekcja — bez przycisku "Dodaj" (nie istnieje) i bez żadnego innego kliknięcia pomiędzy.
  await dialog.getByLabel('Dodaj dostawcę').selectOption(dremTeem.id);
  await expect(dialog.getByText('DremTeem')).toBeVisible();
  await expect(dialog.getByText('Brak przypisanych dostawców.')).not.toBeVisible();

  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog).not.toBeVisible();

  await expect.poll(() => state.materialSupplierLinks.filter(link => link.material_id === material.id)).toEqual([
    expect.objectContaining({ supplier_id: dremTeem.id, is_preferred: true }),
  ]);
  expect(state.materials[0].supplier).toBe('DremTeem');

  await expect(row.getByText('DremTeem')).toBeVisible();
  await expect(row.getByText('-', { exact: true })).not.toBeVisible();
});
