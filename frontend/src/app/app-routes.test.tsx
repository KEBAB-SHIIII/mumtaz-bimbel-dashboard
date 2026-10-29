import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../lib/api-client';
import { renderWithProviders } from '../test/render';
import { AppRoutes } from './app-routes';

describe('AppRoutes (smoke)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merender beranda dan status API terhubung', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { status: 'ok' } });

    renderWithProviders(<AppRoutes />);

    expect(screen.getByRole('heading', { name: 'Mumtaz Bimbel' })).toBeInTheDocument();
    expect(await screen.findByText('API terhubung')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/health');
  });

  it('menampilkan pesan jujur saat API gagal', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network Error'));

    renderWithProviders(<AppRoutes />);

    expect(await screen.findByText('API tidak dapat dihubungi')).toBeInTheDocument();
  });

  it('merender halaman 404 untuk route tidak dikenal', () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { status: 'ok' } });

    renderWithProviders(<AppRoutes />, { route: '/tidak-ada' });

    expect(screen.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeInTheDocument();
  });
});
