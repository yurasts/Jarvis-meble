import { expect, test } from '@playwright/test';
import { existingProject, installAuthenticatedSupabaseMock } from './support/supabaseMock';

// Третья тема показывается как «🎃 Halloween», но технический id остаётся 'forest'
// (profiles.theme / data-theme) — сохранённые настройки пользователей не ломаются.
test('Halloween theme card keeps the forest id and applies the pumpkin palette', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [existingProject]);

  await page.goto('/');
  await page.getByRole('tab', { name: 'Ustawienia' }).click();

  const halloweenCard = page.getByText('🎃 Halloween', { exact: true });
  await expect(halloweenCard).toBeVisible();
  await expect(page.getByText(/Forest/)).toHaveCount(0);

  await halloweenCard.click();
  await expect(page.getByText('✓ 🎃 Halloween', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
  expect(state.profiles[0].theme).toBe('forest');

  const tokens = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return ['--accent', '--bg-card', '--text-main', '--accent-contrast']
      .map(name => css.getPropertyValue(name).trim().toLowerCase());
  });
  expect(tokens).toEqual(['#ff7b29', '#3a2c52', '#fdf8f2', '#231934']);

  // Тыквенная кнопка «+» пишет тёмным, а не белым (белый на #ff7b29 ≈ 2.6:1).
  const addButton = page.getByRole('button', { name: /Nowy projekt|Dodaj projekt|^\+$/ }).first();
  await expect(addButton).toHaveCSS('background-color', 'rgb(255, 123, 41)');
  await expect(addButton).toHaveCSS('color', 'rgb(35, 25, 52)');
});
