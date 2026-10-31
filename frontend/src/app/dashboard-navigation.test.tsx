import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

describe('dashboard mengarahkan ke data di balik angka', () => {
  it('Admin: kartu "Menunggu verifikasi" membuka Data Absensi terfilter, dengan aksi "Tinjau"', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('link', { name: 'Menunggu verifikasi' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('button', { name: /^Tinjau sesi/ })).toHaveLength(3));
    expect(within(table).queryByRole('button', { name: /^Lihat detail sesi/ })).not.toBeInTheDocument();
  });

  it('Tutor: dashboard menampilkan sesi terbaru dan kartu status membuka riwayat terfilter', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByRole('heading', { name: 'Halo, Farhan', level: 1 });
    await choosePeriod('2026-10');

    const recent = (await screen.findByRole('heading', { name: 'Sesi terbaru' })).closest('section');
    if (!recent) throw new Error('kartu sesi terbaru tidak ada');
    await waitFor(() => expect(within(recent).getAllByRole('listitem')).toHaveLength(5));

    await user.click(screen.getByRole('link', { name: 'Disetujui' }));
    await screen.findByRole('heading', { name: 'Riwayat Mengajar', level: 1 });
    expect(screen.getByLabelText('Status')).toHaveValue('approved');
  });

  it('periode tampil dalam bahasa Indonesia di semua browser (bukan input bulan bawaan)', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await choosePeriod('2026-10');
    const select = await screen.findByLabelText('Periode');
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getByRole('option', { name: 'Oktober 2026' })).toBeInTheDocument();
  });
});
