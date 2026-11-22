import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { PhoneNav } from './phone-nav';

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <PhoneNav /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
});

describe('PhoneNav', () => {
  it('shows six items: the main pages and More', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label')),
    ).toEqual(['Dashboard', 'Transactions', 'Uncategorized', 'Import', 'Trends']);
    expect(within(nav).getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(nav).queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('opens More, lists the other pages, and closes after choosing one', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    const more = document.getElementById('more-pages');
    if (more === null) throw new Error('no More list');
    expect(
      within(more)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Rules', 'Categories', 'Settings']);
    await user.click(within(more).getByRole('link', { name: 'Settings' }));
    expect(router.state.location.pathname).toBe('/settings');
    expect(document.getElementById('more-pages')).toBeNull();
    // On a page under More, the More button shows as the current section.
    expect(screen.getByRole('button', { name: 'More' })).toHaveClass('font-semibold');
  });
});
