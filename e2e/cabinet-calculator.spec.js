import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edge = { id: 3, name: 'ABS 2mm Biały', category: 'Obrzeże', unit: 'mb', price: 3.5, price_history: [] };
const hinge = { id: 4, name: 'BLUM Zawias 110°', category: 'Zawiasy', unit: 'szt', price: 6, price_history: [] };
const runner = { id: 5, name: 'Blum Tandem L-500', category: 'Prowadnice', unit: 'kpl', price: 45, price_history: [] };
const countertop = { id: 6, name: 'Blat laminowany', category: 'Inne', unit: 'mb', price: 150, price_history: [] };
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

test('calculator: add a drawer cabinet and a wardrobe section, resize, and add the calculated lines to the project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, hinge, runner, countertop],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await expect(materials).toBeVisible();
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();

  const calculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');
  await expect(calculator.getByText('Dodaj pierwszy moduł powyżej')).toBeVisible();

  // Dodaj tumbę z szufladami i sekcję szafy — dokładnie ten scenariusz z zadania.
  await calculator.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }).click();
  await calculator.getByRole('button', { name: '+ 🧥 Szafa / Garderoba' }).click();

  const rows = calculator.locator('li');
  await expect(rows).toHaveCount(2);
  const drawerRow = rows.filter({ hasText: 'Szafka dolna z szufladami' });
  const wardrobeRow = rows.filter({ hasText: 'Szafa / Garderoba' });
  await expect(drawerRow.getByText(/Szufl\. zewn\.: 3 kpl\./)).toBeVisible();
  await expect(wardrobeRow.getByText(/Zawiasy: \d+ szt\./)).toBeVisible();

  const bodySheetsBefore = await calculator.getByText(/Korpus: .* m² →/).textContent();

  // Zmiana szerokości tumby z szufladami — przeliczenie m² i arkuszy na żywo.
  await drawerRow.getByLabel('Szer. (mm)').fill('1000');
  await expect(async () => {
    const after = await calculator.getByText(/Korpus: .* m² →/).textContent();
    expect(after).not.toBe(bodySheetsBefore);
  }).toPass();

  await expect(calculator.getByText(/Orientacyjna wycena \(×2\):/)).toBeVisible();

  const addButton = calculator.getByRole('button', { name: '📥 Dodaj wyliczone pozycje do projektu' });
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await expect(calculator.getByRole('button', { name: '✓ Dodano!' })).toBeVisible();

  // Materiały i usługi trafiły do zapisanego stanu projektu (calc_materials/calc_services).
  await expect.poll(() => state.projects[0].calc_materials?.map(item => item.id)).toEqual(
    expect.arrayContaining([bodyBoard.id, frontBoard.id, edge.id, hinge.id, runner.id]),
  );
  await expect.poll(() => state.projects[0].calc_services?.map(item => item.id)).toEqual(
    expect.arrayContaining([cuttingService.id, edgingService.id]),
  );
  const bodyLine = state.projects[0].calc_materials.find(item => item.id === bodyBoard.id);
  expect(bodyLine.quantity).toBeGreaterThan(0);

  // Widoczne również w tabeli Materiały po zamknięciu kalkulatora (bez dwuznaczności z <option>).
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  await expect(materials.getByText(bodyBoard.name)).toBeVisible();
  await expect(materials.getByText(frontBoard.name)).toBeVisible();
  const services = page.getByRole('region', { name: 'Usługi' });
  await expect(services.getByText(cuttingService.name)).toBeVisible();
  await expect(services.getByText(edgingService.name)).toBeVisible();
});

const drawerExternal = { id: 7, name: 'MERIVOBOX E wysoka szuflada zewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 300, price_history: [] };
const drawerInternal = { id: 8, name: 'MERIVOBOX M niska szuflada wewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 210, price_history: [] };

test('calculator: 6 identical tumby, each with 1 external MERIVOBOX E drawer + 1 internal MERIVOBOX M drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const state = await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, hinge, drawerExternal, drawerInternal, countertop],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator szafek — Szybka wycena').locator('..');

  // Blok 1 proponuje osobne selecty zewn./wewn., domyślnie dopasowane po nazwie z katalogu.
  await expect(calculator.getByLabel('Szuflada / Prowadnica zewn.')).toHaveValue(String(drawerExternal.id));
  await expect(calculator.getByLabel('Szuflada / Prowadnica wewn.')).toHaveValue(String(drawerInternal.id));

  await calculator.getByRole('button', { name: '+ 🗄️ Szafka dolna z szufladami' }).click();
  const drawerRow = calculator.locator('li').filter({ hasText: 'Szafka dolna z szufladami' });
  await drawerRow.getByLabel('Szufl. zewn.').fill('1');
  await drawerRow.getByLabel('Szufl. wewn.').fill('1');
  await drawerRow.getByLabel('Ilość').fill('6');

  await expect(calculator.getByText(/Szufl\. zewn\.: 6 kpl\..*Szufl\. wewn\.: 6 kpl\./)).toBeVisible();
  await expect(calculator.getByText('Szuflady zewn.: 6 kpl.')).toBeVisible();
  await expect(calculator.getByText('Szuflady wewn.: 6 kpl.')).toBeVisible();

  // Szczegóły wyceny pokazują obie pozycje osobno, z honestymi cenami z katalogu.
  await calculator.getByRole('button', { name: '🔍 Szczegóły wyceny' }).click();
  const dialog = page.getByRole('dialog', { name: 'Szczegółowa kalkulacja wyceny' });
  const extRow = dialog.locator('tr').filter({ hasText: drawerExternal.name });
  await expect(extRow).toContainText('6 kpl.');
  await expect(extRow).toContainText('1800.00');
  const intRow = dialog.locator('tr').filter({ hasText: drawerInternal.name });
  await expect(intRow).toContainText('6 kpl.');
  await expect(intRow).toContainText('1260.00');
  await dialog.getByRole('button', { name: 'Zamknij' }).click();

  await calculator.getByRole('button', { name: '📥 Dodaj wyliczone pozycje do projektu' }).click();
  await expect(calculator.getByRole('button', { name: '✓ Dodano!' })).toBeVisible();

  await expect.poll(() => state.projects[0].calc_materials?.find(item => item.id === drawerExternal.id)?.quantity).toBe(6);
  await expect.poll(() => state.projects[0].calc_materials?.find(item => item.id === drawerInternal.id)?.quantity).toBe(6);
});
