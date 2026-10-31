import { screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { createFakeAdapter } from '../test/fake-api/fake-adapter';
import { createFakeBackend } from '../test/fake-api/fake-backend';
import { apiClient } from '../lib/api-client';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

const tutorPassword = TEST_ONLY_CREDENTIALS.tutorPassword;
const rowsOf = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

async function openHistory(username: string, period: string) {
  renderApp('/login');
  const user = await loginStaff(username, tutorPassword);
  await user.click(await screen.findByRole('link', { name: 'Riwayat Mengajar' }));
  await screen.findByRole('heading', { name: 'Riwayat Mengajar', level: 1 });
  await choosePeriod(period);
  return user;
}

describe('Tutor: revisi sesi (revision_requested → pending)', () => {
  it('melihat alasan Admin, merevisi, lalu status kembali menunggu verifikasi', async () => {
    useFakeBackend();
    // Noreen punya sesi Citra 5 Okt 2026 berstatus "Perlu revisi" (fixture s03).
    const user = await openHistory('noreen', '2026-10');

    await user.click(await screen.findByRole('button', { name: 'Revisi sesi Citra 5 Okt 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(within(dialog).getByText('Durasi tidak sesuai jadwal; mohon periksa kembali.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Revisi sesi' }));
    const form = await screen.findByRole('dialog', { name: 'Revisi sesi' });
    // Form terisi dari data sesi; nama tutor dari akun login, tidak bisa diubah.
    expect(within(form).getByLabelText(/^Nama tutor/)).toHaveValue('Noreen');
    expect(within(form).getByLabelText(/^Durasi les/)).toHaveValue(90);
    await user.clear(within(form).getByLabelText(/^Durasi les/));
    await user.type(within(form).getByLabelText(/^Durasi les/), '60');
    await user.click(within(form).getByRole('button', { name: 'Kirim revisi' }));

    expect(await within(await screen.findByRole('dialog', { name: 'Detail sesi' })).findByText('Revisi terkirim dan menunggu verifikasi ulang')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tutup' }));
    // Daftar ikut diperbarui: tidak ada lagi sesi yang perlu revisi.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revisi sesi Citra 5 Okt 2026' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Detail sesi Citra 5 Okt 2026' })).toBeInTheDocument();
  });

  it('validasi revisi di dekat field (materi wajib), revisi tidak terkirim', async () => {
    useFakeBackend();
    const user = await openHistory('noreen', '2026-10');
    await user.click(await screen.findByRole('button', { name: 'Revisi sesi Citra 5 Okt 2026' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Detail sesi' })).getByRole('button', { name: 'Revisi sesi' }));
    const form = await screen.findByRole('dialog', { name: 'Revisi sesi' });
    await user.clear(within(form).getByLabelText(/^Materi pembelajaran/));
    await user.click(within(form).getByRole('button', { name: 'Kirim revisi' }));
    expect(await within(form).findByText('Wajib diisi')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Materi pembelajaran/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sesi yang tidak perlu revisi hanya bisa dilihat (tanpa tombol revisi)', async () => {
    useFakeBackend();
    const user = await openHistory('farhan', '2026-10');
    await user.click(await screen.findByRole('button', { name: 'Detail sesi Aisyah 1 Okt 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(within(dialog).getByText('Disetujui')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Revisi sesi' })).not.toBeInTheDocument();
  });
});

describe('Tutor: Riwayat Mengajar', () => {
  it('periode memakai tanggal les: sesi 31 Okt yang disubmit November masuk Oktober, bukan November', async () => {
    useFakeBackend();
    await openHistory('farhan', '2026-10');
    expect(await screen.findByText('31 Okt 2026')).toBeInTheDocument();

    await choosePeriod('2026-11');
    await waitFor(() => expect(screen.queryByText('31 Okt 2026')).not.toBeInTheDocument());
    expect(screen.getByText('1 Nov 2026')).toBeInTheDocument();
  });

  it('filter siswa hanya menampilkan siswa yang dipilih', async () => {
    useFakeBackend();
    const user = await openHistory('farhan', '2026-10');
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Siswa'), 'Bima');
    await waitFor(() => expect(rowsOf().every((row) => within(row).queryByText('Bima') !== null)).toBe(true));
    expect(rowsOf().length).toBeGreaterThan(0);
  });

  it('empty state saat tidak ada sesi pada periode', async () => {
    useFakeBackend();
    await openHistory('farhan', '2026-08');
    expect(await screen.findByText('Belum ada sesi')).toBeInTheDocument();
  });

  it('error state dengan pesan aman dan tombol coba lagi saat API gagal', async () => {
    useFakeBackend();
    const demo = createFakeAdapter(createFakeBackend({ now: () => new Date('2026-11-15T03:00:00Z') }));
    const failing: AxiosAdapter = async (config) => {
      if (config.url === '/tutor/me/attendance') {
        const response = { data: { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' } }, status: 500, statusText: '500', headers: {}, config };
        throw new AxiosError('error', AxiosError.ERR_BAD_RESPONSE, config, null, response);
      }
      return demo(config);
    };
    apiClient.defaults.adapter = failing;

    await openHistory('farhan', '2026-10');
    expect(await screen.findByText('Data gagal dimuat')).toBeInTheDocument();
    expect(screen.getByText('Terjadi kesalahan pada server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('Admin: status analisis tidak ditampilkan', () => {
  it('tidak ada kolom/filter/badge status analisis; status review tetap terlihat', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await choosePeriod('2026-10');
    await screen.findByRole('table');

    expect(screen.queryByRole('columnheader', { name: /analisis/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/analisis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Analisis (gagal|selesai|menunggu)|Tidak dianalisis/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Ditolak').length).toBeGreaterThan(0);
  });
});
