import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

test('Wycena multiplies materials and adds services once', async ({ page }) => {
  const pricedProject = {
    ...existingProject,
    project_name: 'Przedpokój druga strona',
    budget: 6773,
    budget_coefficient: 2,
    calc_materials: [
      { id: 'wycena-material', name: 'Materiały do przedpokoju', price: 2780.70, quantity: 1, unit: 'kpl' },
    ],
    calc_services: [
      { id: 'wycena-service', name: 'Usługi do przedpokoju', price: 605.80, quantity: 1, unit: 'kpl' },
    ],
  };

  await installAuthenticatedSupabaseMock(page, [pricedProject]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Anna Kowalska', exact: true }).click();
  await page.getByRole('button', { name: 'Przedpokój druga strona', exact: true }).click();

  const cashSection = page.getByRole('region', { name: 'Rozliczenia' });
  await expect(cashSection.getByText('2 780.70 zł', { exact: true })).toBeVisible();
  await expect(cashSection.getByText('605.80 zł', { exact: true })).toBeVisible();
  await expect(cashSection.getByText('6 167.20 zł', { exact: true })).toBeVisible();
  await expect(cashSection.getByText('6 773.00 zł', { exact: true })).toHaveCount(0);
});
