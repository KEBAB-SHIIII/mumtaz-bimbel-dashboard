import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { apiClient, getCsrfToken } from '../../lib/api-client';
import { createQueryClient } from '../../lib/query-client';
import type { FakeBackend } from '../../test/fake-api/fake-backend';
import { loginStaff, renderApp, useFakeBackend } from '../../test/render';
import { broadcastAuthChange } from './auth-sync';

function switchServerSessionToTutor(backend: FakeBackend) {
  const res = backend.handle({
    method: 'post',
    path: '/auth/login',
    params: {},
    body: { username: 'farhan', password: TEST_ONLY_CREDENTIALS.tutorPassword },
    csrfHeader: getCsrfToken() ?? undefined,
  });
  expect(res.status).toBe(200);
}

describe('Sinkronisasi sesi lintas tab & safety net 403', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createQueryClient mengaktifkan refetchOnWindowFocus dengan staleTime 30 detik', () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions().queries;
    expect(defaults?.refetchOnWindowFocus).toBe(true);
    expect(defaults?.staleTime).toBe(30_000);
  });

  it('sinyal logged_out dari tab lain langsung mengarahkan tab aktif ke halaman login', async () => {
    const backend = useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard' });

    // Simulasikan tab lain yang melakukan logout (sender berbeda dari tab ini).
    backend.revokeSession();
    act(() => {
      broadcastAuthChange('logged_out', 'other-tab-id');
    });

    await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' });
  });

  it('sinyal session_changed saat role berpindah ke Tutor di tab lain langsung mengarahkan tab ini ke /tutor', async () => {
    const backend = useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard' });

    // Simulasikan tab lain menimpa cookie session dengan sesi Tutor.
    switchServerSessionToTutor(backend);
    act(() => {
      broadcastAuthChange('session_changed', 'other-tab-id');
    });

    await screen.findByRole('heading', { name: 'Halo, Farhan!' });
  });

  it('403 FORBIDDEN saat sesi di server sudah berganti role langsung menyinkronkan ke role terbaru', async () => {
    const backend = useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard' });

    // Cookie di server berpindah ke Tutor tanpa sinyal BroadcastChannel.
    switchServerSessionToTutor(backend);
    await act(async () => {
      await apiClient.get('/admin/dashboard/summary', { params: { period: '2026-11' } }).catch(() => undefined);
    });

    await screen.findByRole('heading', { name: 'Halo, Farhan!' });
  });

  it('403 FORBIDDEN pada sesi yang sama tidak me-logout atau mengusir pengguna', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard' });

    // Admin tetap Admin di server, namun mengenai endpoint khusus Tutor (403).
    await act(async () => {
      await apiClient.get('/tutor/dashboard/summary', { params: { period: '2026-11' } }).catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });
  });
});
