import { expect, test } from '@playwright/test';

const authResponse = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const enterEmail = async (page, email = 'employee@example.test') => {
  await page.goto('/');
  await page.getByPlaceholder('ty@firma.pl').fill(email);
  await page.getByRole('button', { name: /kod logowania/ }).click();
};

test.describe('OTP login', () => {
  test('moves to code verification after sending an OTP', async ({ page }) => {
    await page.route('**/auth/v1/otp*', route => authResponse(route, 200, {}));

    await enterEmail(page);

    await expect(page.getByPlaceholder('Kod logowania')).toBeVisible();
    await expect(page.getByText('employee@example.test')).toBeVisible();
    await expect(page.getByRole('button', { name: /kod ponownie \(\d+s\)/ })).toBeDisabled();
  });

  test('shows a rate-limit message and starts the resend cooldown', async ({ page }) => {
    await page.route('**/auth/v1/otp*', route => authResponse(route, 429, {
      code: 'over_email_send_rate_limit',
      error_code: 'over_email_send_rate_limit',
      msg: 'Email rate limit exceeded',
    }));

    await enterEmail(page);

    await expect(page.getByText('Zbyt wiele prób logowania. Odczekaj chwilę i spróbuj ponownie.')).toBeVisible();
    await expect(page.getByRole('button', { name: /kod ponownie \(\d+s\)/ })).toBeDisabled();
  });

  test('shows a recoverable message when the auth request loses the network', async ({ page }) => {
    await page.route('**/auth/v1/otp*', route => route.abort('failed'));

    await enterEmail(page);

    await expect(page.getByText('Błąd połączenia z serwerem. Sprawdź internet i spróbuj ponownie.')).toBeVisible();
    await expect(page.getByRole('button', { name: /kod logowania/ })).toBeEnabled();
  });

  test('explains that an expired OTP must be replaced', async ({ page }) => {
    await page.route('**/auth/v1/otp*', route => authResponse(route, 200, {}));
    await page.route('**/auth/v1/verify*', route => authResponse(route, 403, {
      code: 'otp_expired',
      error_code: 'otp_expired',
      msg: 'Token has expired or is invalid',
    }));

    await enterEmail(page);
    await page.getByPlaceholder('Kod logowania').fill('123456');
    await page.getByRole('button', { name: 'Zaloguj' }).click();

    await expect(page.getByText('Kod wygasł. Poproś o nowy kod logowania.')).toBeVisible();
  });
});

test('invalid client portal token reveals no project data', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_portal_data*', route => authResponse(route, 200, []));

  await page.goto('/portal/00000000-0000-0000-0000-000000000000');

  await expect(page.getByText('Nie znaleziono projektu. Sprawdź poprawność linku.')).toBeVisible();
  await expect(page.getByText('JARVIS STUDIO')).not.toBeVisible();
});
