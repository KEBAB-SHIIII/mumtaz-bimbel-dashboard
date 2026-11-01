import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

describe('dashboard mengarahkan ke data di balik angka', () => {
  it('Admin: empat kartu metrik (omzet kotor per jenjang); kartu sesi membuka Data Absensi periode itu', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    await choosePeriod('2026-10');

    const omzet = (await screen.findByRole('link', { name: 'Total omzet kotor' })).closest('div');
    if (!omzet) throw new Error('kartu omzet tidak ada');
    await waitFor(() => expect(omzet).toHaveTextContent(/Rp\s?200\.000/));
    expect(screen.queryByText('Menunggu verifikasi')).not.toBeInTheDocument();
    // Grafik dimuat lazy (chunk terpisah) setelah kartu metrik. Grafik pendapatan memakai data asli
    // (tanpa label), empat grafik lain masih data contoh.
    expect(await screen.findAllByText('Data contoh')).toHaveLength(4);
    const revenue = screen.getByRole('heading', { name: 'Pendapatan per bulan' }).closest('section');
    expect(revenue).not.toHaveTextContent('Data contoh');

    await user.click(screen.getByRole('link', { name: 'Total sesi bulan ini' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(10)); // header + 9
  });

  it('Tutor: dashboard menampilkan sesi terbaru dan kartu status membuka riwayat terfilter', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByRole('heading', { name: 'Halo, Farhan!', level: 2 });
    await choosePeriod('2026-10');

    const recent = (await screen.findByRole('heading', { name: 'Sesi terbaru' })).closest('section');
    if (!recent) throw new Error('kartu sesi terbaru tidak ada');
    await waitFor(() => expect(within(recent).getAllByRole('listitem')).toHaveLength(5));

    await user.click(screen.getByRole('link', { name: 'Disetujui' }));
    await screen.findByRole('heading', { name: 'Riwayat Mengajar', level: 1 });
    expect(screen.getByRole('button', { name: /^Status/ })).toHaveTextContent('Disetujui');
  });

  it('periode tampil dalam bahasa Indonesia di semua browser (bukan input bulan bawaan)', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await choosePeriod('2026-10');
    // Bukan <input type="month"> bawaan (bahasa mengikuti browser): daftar bulan Listbox berbahasa Indonesia.
    expect(document.querySelector('input[type="month"]')).toBeNull();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Periode'));
    expect(await screen.findByRole('option', { name: 'Oktober 2026' })).toHaveAttribute('aria-selected', 'true');
  });
});
