import { expect, test, type Page } from '@playwright/test';

async function chooseProfile(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
}

async function ownerId(page: Page, name: string): Promise<string> {
  const res = await page.request.get('/api/owners');
  const owners = (await res.json()) as { id: number; name: string }[];
  const owner = owners.find((o) => o.name === name);
  if (owner === undefined) throw new Error(`No owner ${name}`);
  return String(owner.id);
}

test('choose a profile, then it is remembered after a reload', async ({ page }) => {
  await chooseProfile(page, 'Emily');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toHaveValue(
    await ownerId(page, 'Emily'),
  );
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('create a Walmart account from the preset with two cardholders, and it persists', async ({
  page,
}, testInfo) => {
  // Both browser projects share one database, so each uses its own account name.
  const accountName = `Walmart e2e ${testInfo.project.name}`;
  await chooseProfile(page, 'Colin');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Add account' }).click();
  await page.getByLabel('Preset').selectOption('walmart-mastercard');
  await page.getByLabel('Name', { exact: true }).fill(accountName);
  await page.getByLabel('Default owner').selectOption({ label: 'Joint' });

  await page.getByRole('button', { name: 'Add owner hint' }).click();
  await page.getByLabel('Owner hint 1 value').fill('ALEX SAMPLE');
  await page.getByLabel('Owner hint 1 owner').selectOption({ label: 'Colin' });
  await page.getByRole('button', { name: 'Add owner hint' }).click();
  await page.getByLabel('Owner hint 2 value').fill('JAMIE SAMPLE');
  await page.getByLabel('Owner hint 2 owner').selectOption({ label: 'Emily' });
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('account-row').filter({ hasText: accountName })).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: `Edit ${accountName}` }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(accountName);
  await expect(page.getByLabel('Institution')).toHaveValue('walmart');
  await expect(page.getByLabel('Owner hint column')).toHaveValue('Name on Card');
  await expect(page.getByLabel('Owner hint 1 value')).toHaveValue('ALEX SAMPLE');
  await expect(page.getByLabel('Owner hint 1 owner')).toHaveValue(await ownerId(page, 'Colin'));
  await expect(page.getByLabel('Owner hint 2 value')).toHaveValue('JAMIE SAMPLE');
  await expect(page.getByLabel('Owner hint 2 owner')).toHaveValue(await ownerId(page, 'Emily'));
});

test('the shell has no horizontal scrolling on any page', async ({ page }) => {
  await chooseProfile(page, 'Colin');
  for (const path of ['/', '/transactions', '/settings', '/settings/accounts/new']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    // A string expression: the e2e tsconfig has no DOM types.
    const overflow = Number(
      await page.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth',
      ),
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test('every page is reachable from the visible navigation', async ({ page }) => {
  await chooseProfile(page, 'Colin');
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  for (const name of [
    'Transactions',
    'Uncategorized',
    'Import',
    'Rules',
    'Categories',
    'Settings',
    'Dashboard',
  ]) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  }
});
