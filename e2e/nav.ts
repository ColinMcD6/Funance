import type { Page } from '@playwright/test';

/**
 * Opens a page from the visible main navigation: the sidebar on desktop, the bottom bar on
 * phones, where some pages sit under More.
 */
export async function openFromNav(page: Page, name: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  const link = nav.getByRole('link', { name, exact: true });
  if (!(await link.isVisible())) {
    await nav.getByRole('button', { name: 'More' }).click();
  }
  await link.click();
}

/** On phones the transaction filters other than search and sort are folded; open them. */
export async function showTransactionFilters(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}
