import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { ProfileGate } from '@/components/profile/profile-gate';
import { PAGE_ROUTES } from './routes';

function makeRoutes(pages: RouteObject[]): RouteObject[] {
  return [
    {
      path: '/',
      element: (
        <ProfileGate>
          <AppShell />
        </ProfileGate>
      ),
      children: pages,
    },
  ];
}

type Props = {
  /** Tests pass a fresh client and a memory router; the app uses the browser's history. */
  queryClient?: QueryClient;
  router?: (routes: RouteObject[]) => ReturnType<typeof createBrowserRouter>;
};

/** The whole app: query cache, profile gate, shell and pages. */
export function App({ queryClient, router = createBrowserRouter }: Props) {
  const [client] = useState(() => queryClient ?? new QueryClient());
  const [appRouter] = useState(() => router(makeRoutes(PAGE_ROUTES)));
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  );
}
