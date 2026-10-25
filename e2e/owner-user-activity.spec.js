import { expect, test } from '@playwright/test';
import { installAuthenticatedSupabaseMock } from './support/supabaseMock';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const DESIGNER_ID = '00000000-0000-4000-8000-000000000002';

const profiles = [
  {
    id: OWNER_ID,
    full_name: 'Właściciel E2E',
    role: 'owner',
    color: '#3182ce',
    theme: 'light',
    default_scope: 'firma',
  },
  {
    id: DESIGNER_ID,
    full_name: 'Projektant E2E',
    role: 'designer',
    color: '#38a169',
    theme: 'dark',
    default_scope: 'firma',
  },
];

test('owner sees a compact activity dashboard, deduplicated feed and chip filters', async ({ page }) => {
  const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const duplicate = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await installAuthenticatedSupabaseMock(page, [], {
    role: 'owner',
    profiles,
    userPresence: [{
      user_id: DESIGNER_ID,
      last_seen_at: recent,
      last_device_type: 'mobile',
      last_user_agent: 'Safari · iOS',
    }],
    userActivityLogs: [
      {
        id: 'activity-owner',
        user_id: OWNER_ID,
        user_email: 'owner@example.test',
        user_name: 'Właściciel E2E',
        event_type: 'sign_in',
        device_type: 'desktop',
        user_agent: 'Chrome · Windows',
        created_at: recent,
      },
      {
        id: 'activity-owner-duplicate',
        user_id: OWNER_ID,
        user_email: 'owner@example.test',
        user_name: 'Właściciel E2E',
        event_type: 'sign_in',
        device_type: 'desktop',
        user_agent: 'Chrome · Windows',
        created_at: duplicate,
      },
      {
        id: 'activity-designer',
        user_id: DESIGNER_ID,
        user_email: 'designer@example.test',
        user_name: 'Projektant E2E',
        event_type: 'session_start',
        device_type: 'mobile',
        user_agent: 'Safari · iOS',
        created_at: recent,
      },
    ],
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Ustawienia' }).click();

  await expect(page.getByText('Aktywność użytkowników', { exact: true })).toBeVisible();
  const chips = page.getByRole('group', { name: 'Filtr aktywności według pracownika' });
  await expect(chips.getByText(/^Online/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Aktywność z ostatnich 7 dni' })).toBeVisible();

  const history = page.getByRole('region', { name: 'Historia logowań i sesji' });
  await expect(history.getByRole('heading', { name: /^Dziś \(/ })).toBeVisible();
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByText('Logowanie', { exact: true })).toHaveCount(1);
  await expect(history.getByText('Otwarcie aplikacji', { exact: true })).toBeVisible();
  await expect(history.getByTitle(/Scalono 2 wpisy/)).toHaveText('×2');

  const designerChip = chips.getByRole('button', { name: 'Filtruj aktywność: Projektant E2E' });
  await designerChip.click();
  await expect(designerChip).toHaveAttribute('aria-pressed', 'true');
  await expect(history.getByText('Projektant E2E', { exact: true })).toBeVisible();
  await expect(history.getByText('Właściciel E2E', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Aktywność godzinowa: Projektant E2E' })).toBeVisible();

  await designerChip.click();
  await expect(designerChip).toHaveAttribute('aria-pressed', 'false');
  await expect(history.getByText('Właściciel E2E', { exact: true })).toBeVisible();

  const activitySection = page.locator('details').filter({ hasText: 'Aktywność użytkowników' });
  const desktopBox = await activitySection.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox.height).toBeLessThanOrEqual(360);

  const themeColors = [];
  for (const theme of ['light', 'dark', 'forest']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await expect(activitySection).toBeVisible();
    themeColors.push(await activitySection.evaluate(element => getComputedStyle(element).backgroundColor));
  }
  expect(new Set(themeColors).size).toBe(3);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await activitySection.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(390);
  const feedBox = await history.boundingBox();
  expect(feedBox.x + feedBox.width).toBeLessThanOrEqual(390);
  expect(feedBox.height).toBeLessThanOrEqual(222);
});

test('non-owner cannot see or request the user activity section', async ({ page }) => {
  const state = await installAuthenticatedSupabaseMock(page, [], { role: 'designer' });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Ustawienia' }).click();

  await expect(page.getByText('Aktywność użytkowników', { exact: true })).toHaveCount(0);
  expect(state.requests.user_activity_logs).toBeUndefined();
  expect(state.requests.user_presence).toBeUndefined();
});
