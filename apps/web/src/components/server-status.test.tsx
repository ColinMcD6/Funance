import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { mockApi } from '@/test-utils/mock-api';
import { ServerStatus } from './server-status';

function renderStatus() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServerStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ServerStatus', () => {
  it('shows ok and the version when the server is healthy', async () => {
    mockApi({ 'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }) });
    renderStatus();
    expect(await screen.findByText('ok')).toHaveAttribute('data-testid', 'health-status');
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('shows unreachable with the server message on an error', async () => {
    mockApi({
      'GET /api/health': () => ({
        status: 500,
        body: { error: { code: 'internal', message: 'Internal server error' } },
      }),
    });
    renderStatus();
    expect(await screen.findByText('unreachable')).toBeInTheDocument();
    expect(screen.getByText('Internal server error')).toBeInTheDocument();
  });

  it('shows unreachable when the response does not match the schema', async () => {
    mockApi({ 'GET /api/health': () => ({ body: { status: 'maybe' } }) });
    renderStatus();
    expect(await screen.findByText('unreachable')).toBeInTheDocument();
    expect(screen.getByText('Unexpected response from /health')).toBeInTheDocument();
  });
});
