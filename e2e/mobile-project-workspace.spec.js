import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Redesign 2026-10-18: mobile ProjectModal gets the same accordion design as desktop/embedded
// (WorkspaceSection) instead of tabs, a compact single-row header, and a large file carousel with
// a folder switcher docked beside it instead of a row of buttons above it.
test.use({ viewport: { width: 390, height: 844 } });

test('mobile project workspace uses accordion sections instead of tabs', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject]);

  await page.goto('/');
  await page.getByRole('button', { name: /Szafa istniejąca/ }).click();

  // Kompaktowy nagłówek: wiersz 1 — powrót + status, wiersz 2 — klient · projekt (osobny od
  // przycisku powrotu/status, żeby nazwy nie obcinały się nawzajem — review). Lista projektów
  // zostaje zamontowana pod spodem (ten sam "Anna Kowalska" widnieje też tam), więc zakres
  // sprawdzania zawężamy do wspólnego kontenera obu wierszy nagłówka.
  const backButton = page.getByRole('button', { name: '← Projekty' });
  await expect(backButton).toBeVisible();
  const header = backButton.locator('xpath=../..');
  await expect(header.getByText('Anna Kowalska', { exact: true })).toBeVisible();
  await expect(header.getByRole('heading', { name: 'Szafa istniejąca' })).toBeVisible();
  await expect(header.getByText('Nowy', { exact: true })).toBeVisible();

  // Starych tabów (przyciski-zakładki) już nie ma.
  await expect(page.getByRole('button', { name: /^Materiały \(/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Usługi \(/ })).toHaveCount(0);

  // Te same pięć akordeonowych sekcji co na desktopie.
  for (const name of ['Materiały', 'Usługi', 'Rozliczenia', 'Zadania projektu', 'Informacje']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  // Zwijanie/rozwijanie działa niezależnie dla każdej sekcji (prawdziwy akordeon, nie tab).
  const materials = page.getByRole('region', { name: 'Materiały' });
  const materialsToggle = materials.getByRole('button', { name: /^Materiały/ });
  await expect(materialsToggle).toHaveAttribute('aria-expanded', 'true');
  await materialsToggle.click();
  await expect(materialsToggle).toHaveAttribute('aria-expanded', 'false');

  // Usługi pozostaje rozwinięte — sekcje są niezależne, to nie przełączanie zakładek.
  const servicesToggle = page.getByRole('region', { name: 'Usługi' }).getByRole('button', { name: /^Usługi/ });
  await expect(servicesToggle).toHaveAttribute('aria-expanded', 'true');
});

test('mobile file shelf shows a large carousel with a folder column beside it', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [existingProject]);

  await page.goto('/');
  await page.getByRole('button', { name: /Szafa istniejąca/ }).click();

  // Cztery przyciski folderów (ikona + etykieta, dostępna nazwa przez aria-label) plus "+" —
  // kolumna PO PRAWEJ stronie karuzeli, a nie osobny wiersz nad nią.
  for (const label of ['Projekt', 'Zadanie', 'Krój', 'Montaż']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Dodaj plik lub zdjęcie' })).toBeVisible();
});
