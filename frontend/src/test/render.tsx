import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { formatPeriod } from '../lib/format';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../app/app-routes';
import { AppProviders } from '../app/providers';
import { createFakeAdapter } from './fake-api/fake-adapter';
import { createFakeBackend, type FakeBackend } from './fake-api/fake-backend';
import { apiClient, setCsrfToken } from '../lib/api-client';

/** Pasang fake API adapter (data sintetis) pada client Axios bersama. */
export function useFakeBackend(backend: FakeBackend = createFakeBackend({ now: () => new Date('2026-11-15T03:00:00Z') })) {
  setCsrfToken(null);
  apiClient.defaults.adapter = createFakeAdapter(backend);
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

/** Login Admin/Tutor lewat form (alur pengguna sebenarnya). */
export async function loginStaff(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/^Username/), username);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  return user;
}

/** Pilih periode (`YYYY-MM`) dari dropdown Periode (Listbox), seperti pengguna memilih bulan. */
export async function choosePeriod(period: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText('Periode'));
  await user.click(await screen.findByRole('option', { name: formatPeriod(period) }));
}

/** Pilih opsi dari chip filter (`FilterSelect`), mis. `chooseFilter('Validitas', 'Perlu revisi')`. */
export async function chooseFilter(label: string, option: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${label}`) }));
  await user.click(await screen.findByRole('option', { name: option }));
}
