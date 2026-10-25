import { expect, test } from '@playwright/test';
import { installAuthenticatedSupabaseMock } from './support/supabaseMock';

const syncState = () => ({
  singleton_id: 1,
  locked_by_host: 'WORKSHOP-PC-1',
  lease_until: new Date(Date.now() + 45_000).toISOString(),
  last_heartbeat_at: new Date(Date.now() - 5_000).toISOString(),
  sync_root_path: String.raw`G:\Mój dysk\_Jarvis\Projekty`,
  last_sync_at: new Date(Date.now() - 10_000).toISOString(),
  last_sync_summary: { projects: 12, files: 87 },
  last_error: null,
});

test('owner sees responsive Google Drive sync status in every theme', async ({ page }) => {
  await installAuthenticatedSupabaseMock(page, [], {
    role: 'owner',
    driveSyncState: syncState(),
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Ustawienia' }).click();

  const section = page.getByRole('region', { name: 'Synchronizacja z Google Drive (PC)' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('status')).toHaveText('Aktywna');
  await expect(section.getByText('WORKSHOP-PC-1')).toBeVisible();
  await expect(section.getByText(String.raw`G:\Mój dysk\_Jarvis\Projekty`)).toBeVisible();
  await expect(section.getByLabel('Podsumowanie synchronizacji')).toContainText('12 projektów');
  await expect(section.getByLabel('Podsumowanie synchronizacji')).toContainText('87 plików');

  const themeColors = [];
  for (const theme of ['light', 'dark', 'forest']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    themeColors.push(await section.evaluate(element => getComputedStyle(element).backgroundColor));
  }
  expect(new Set(themeColors).size).toBe(3);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await section.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(390);
});

test('non-owner neither sees nor requests Google Drive sync state', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [], {
    role: 'designer',
    driveSyncState: syncState(),
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Ustawienia' }).click();

  await expect(page.getByText('Synchronizacja z Google Drive (PC)', { exact: true })).toHaveCount(0);
  expect(state.requests.drive_sync_state).toBeUndefined();
});
