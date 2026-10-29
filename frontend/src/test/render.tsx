import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../app/app-routes';
import { AppProviders } from '../app/providers';
import { createDemoAdapter } from '../features/demo/demo-adapter';
import { createDemoBackend, type DemoBackend } from '../features/demo/demo-backend';
import { apiClient, setCsrfToken } from '../lib/api-client';

/** Pasang fake API adapter (data sintetis) pada client Axios bersama. */
export function useDemoBackend(backend: DemoBackend = createDemoBackend({ now: () => new Date('2026-11-15T03:00:00Z') })) {
  setCsrfToken(null);
  apiClient.defaults.adapter = createDemoAdapter(backend);
  return backend;
}

/** Render seluruh aplikasi (router + providers) pada route tertentu. */
export function renderApp(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } },
  });
  return render(
    <AppProviders queryClient={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}
