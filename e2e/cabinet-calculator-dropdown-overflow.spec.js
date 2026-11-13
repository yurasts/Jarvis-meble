import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Etap F, krok 1 — zgłoszenie: lista SearchableMaterialSelect otwarta wewnątrz karty
// "Okucia i akcesoria" obcinała się na dolnej krawędzi karty (overflow: hidden) i pokazywała
// ledwie 1.5 wiersza; tekst wybranego materiału nie dawał się zaznaczyć/skopiować.
const bodyBoard = { id: 1, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180, is_favorite: true, price_history: [] };
const frontBoard = { id: 2, name: 'U702 ST9 Kaszmir', category: 'Płyta', unit: 'szt', price: 220, price_history: [] };
const edge = { id: 3, name: 'ABS 2mm Biały', category: 'Obrzeże', unit: 'mb', price: 3.5, price_history: [] };
// Etap N, krok 4 — rola "Zawiasy" nie ma już wiersza w tabeli kalkulacji (includeHardware:false);
// 14 pozycji HDF w katalogu zastępują ją jako długa lista, wystarczająco duża, żeby otwarta lista
// musiała realnie wystawać poza dolną krawędź tabeli, gdyby overflow: hidden nadal obcinał.
const hdfBoards = Array.from({ length: 14 }, (_, index) => ({
  id: 100 + index,
  name: `HDF BIAŁY wariant ${index + 1}`,
  category: 'HDF',
  unit: 'szt',
  price: 50 + index,
  price_history: [],
}));
const cuttingService = { id: 101, name: 'Cięcie płyty', price: 2 };
const edgingService = { id: 102, name: 'Oklejanie PCV', price: 1.5 };

test('SearchableMaterialSelect: a long list opened inside a card is never clipped, shows 10+ rows, and the trigger name can be copied', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.addInitScript(() => {
    window.__copiedTexts = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: text => { window.__copiedTexts.push(text); return Promise.resolve(); } },
      configurable: true,
    });
  });

  await installAuthenticatedSupabaseMock(page, [existingProject], {
    materials: [bodyBoard, frontBoard, edge, ...hdfBoards],
    services: [cuttingService, edgingService],
    projectFiles: [],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: /^Szafa istniejąca/ }).click();

  const materials = page.getByRole('region', { name: 'Materiały' });
  await materials.getByRole('button', { name: '📐 Kalkulator szafek' }).click();
  const calculator = page.getByText('📐 Kalkulator', { exact: true }).locator('..');

  // Etap H/N — rola HDF jest widoczna tylko gdy hdfSheets > 0 w projekcie (wymaga choć 1 modułu
  // z koncepcją HDF), nie jest już wklejona na stałe.
  await calculator.getByRole('button', { name: 'Z drzwiami', exact: true }).click();

  const hdfTrigger = calculator.getByLabel('HDF', { exact: true });
  await hdfTrigger.click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  // Nie obcięte: wszystkie 14 pozycji (+ "— nie wybrano —") są faktycznie w DOM-ie i lista ma
  // realną wysokość pozwalającą zobaczyć min. 10 wierszy naraz (max-height: 380px w CSS).
  const options = listbox.getByRole('option');
  await expect(options).toHaveCount(15);
  const listBox2 = await listbox.boundingBox();
  expect(listBox2.height).toBeGreaterThan(300);

  // Etap H, krok 1 — rodzic selecta jest teraz wierszem tabeli kalkulacji (nie kartą Bloku 1):
  // tabela nie obcina poparera — dolna krawędź listy może wystawać poza dolną krawędź tabeli bez
  // bycia ucięta (overflow: visible, nie hidden).
  const table = calculator.locator('table').first();
  const tableBox = await table.boundingBox();
  const popoverBox = await page.locator('[class*="popover"]').boundingBox();
  expect(popoverBox.y + popoverBox.height).toBeGreaterThan(tableBox.y + tableBox.height);

  await page.keyboard.press('Escape');
  await expect(listbox).not.toBeVisible();

  // Kopiowanie nazwy wybranego materiału przez przycisk 📋 (bez otwierania listy).
  const copyButton = hdfTrigger.getByRole('button', { name: 'Kopiuj nazwę materiału' });
  await copyButton.click();
  await expect(listbox).not.toBeVisible(); // kliknięcie 📋 NIE otworzyło listy (stopPropagation)
  const copiedTexts = await page.evaluate(() => window.__copiedTexts);
  expect(copiedTexts.length).toBeGreaterThan(0);
  expect(copiedTexts[copiedTexts.length - 1]).toMatch(/HDF BIAŁY wariant/);
});
