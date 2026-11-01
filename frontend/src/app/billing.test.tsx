import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

async function openBilling(period: string) {
  renderApp('/login');
  const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
  await user.click(await screen.findByRole('link', { name: 'Penagihan' }));
  await screen.findByRole('heading', { name: 'Penagihan Orang Tua', level: 1 });
  await choosePeriod(period);
  return user;
}

afterEach(() => vi.restoreAllMocks());

describe('Penagihan Orang Tua', () => {
  it('tagihan per murid: tarif per sesi, subtotal per murid, dan total keseluruhan', async () => {
    useFakeBackend();
    await openBilling('2026-10');

    // Tunggu data Oktober (data bulan sebelumnya tampil sementara saat periode diganti).
    const table = await screen.findByRole('table', { name: 'Rincian tagihan Aisyah Oktober 2026' });
    const aisyah = table.closest('section');
    if (!aisyah) throw new Error('bagian tagihan Aisyah tidak ada');
    expect(within(aisyah).getByText(/Orang tua\/wali: Sari/)).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 2 sesi + total
    expect(within(table).getByText('2 sesi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bima', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Citra', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Total tagihan').closest('div')).toHaveTextContent(/Rp\s?200\.000/);
  });

  it('filter murid hanya menampilkan tagihan murid itu', async () => {
    useFakeBackend();
    const user = await openBilling('2026-10');
    await screen.findByRole('table', { name: 'Rincian tagihan Aisyah Oktober 2026' });
    await user.selectOptions(screen.getByLabelText('Murid'), 'Bima');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Aisyah', level: 2 })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Bima', level: 2 })).toBeInTheDocument();
  });

  it('Unduh PDF mengunduh invoice dengan nama file dari server', async () => {
    useFakeBackend();
    const createUrl = vi.fn(() => 'blob:invoice');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('tagihan-2026-10-aisyah.pdf');
    });
    const user = await openBilling('2026-10');
    await screen.findByRole('table', { name: 'Rincian tagihan Aisyah Oktober 2026' });
    await user.click(screen.getByRole('button', { name: 'Unduh invoice PDF Aisyah' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('periode tanpa sesi yang ditagihkan → empty state', async () => {
    useFakeBackend();
    await openBilling('2026-08');
    expect(await screen.findByText('Belum ada tagihan')).toBeInTheDocument();
  });

  it('kartu Total omzet kotor di Dashboard membuka Penagihan periode yang sama', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    await choosePeriod('2026-10');
    await user.click(await screen.findByRole('link', { name: 'Total omzet kotor' }));
    expect(await screen.findByRole('heading', { name: 'Penagihan Orang Tua', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Rincian tagihan Aisyah Oktober 2026' })).toBeInTheDocument();
  });
});
