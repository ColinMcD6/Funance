import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './home-page';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('shows ok and the version when the server is healthy', async () => {
    mockFetch(200, { status: 'ok', version: '0.1.0' });
    render(<HomePage />);
    expect(await screen.findByText('ok')).toHaveAttribute('data-testid', 'health-status');
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('shows unreachable with the server message on an error', async () => {
    mockFetch(500, { error: { code: 'internal', message: 'Internal server error' } });
    render(<HomePage />);
    expect(await screen.findByText('unreachable')).toBeInTheDocument();
    expect(screen.getByText('Internal server error')).toBeInTheDocument();
  });

  it('shows unreachable when the response does not match the schema', async () => {
    mockFetch(200, { status: 'maybe' });
    render(<HomePage />);
    expect(await screen.findByText('unreachable')).toBeInTheDocument();
    expect(screen.getByText('Unexpected response from /health')).toBeInTheDocument();
  });
});
