import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

/** Ekspor Sheets ada di halaman Data Absensi (revisi PM; sebelumnya di Rekap). */
async function openAttendance(period: string) {
  renderApp('/login');
  const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
  await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
  await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
  await choosePeriod(period);
  return user;
}

const exportButton = () => screen.getByRole('button', { name: 'Ekspor Absensi Bulanan ke Google Sheets' });

describe('Ekspor Google Sheets (Data Absensi)', () => {
  it('konfirmasi menampilkan periode, tab, total submission, dan peringatan semua status; sukses tercatat di riwayat', async () => {
    useFakeBackend();
    const user = await openAttendance('2026-10');
    await screen.findByText('Belum ada ekspor');
    await waitFor(() => expect(within(screen.getByRole('table', { name: /Data absensi Oktober 2026/ })).getAllByRole('row')).toHaveLength(10));

    await user.click(exportButton());
    const dialog = await screen.findByRole('dialog', { name: 'Ekspor absensi ke Google Sheets' });
    expect(within(dialog).getByText('Oktober 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('Absensi 2026-10')).toBeInTheDocument();
    expect(within(dialog).getByText('9')).toBeInTheDocument();
    expect(within(dialog).getByText(/termasuk data yang belum disetujui/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Ekspor sekarang' }));
    expect(await screen.findByText('Ekspor berhasil')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/9 baris ditulis ke tab Absensi 2026-10/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka spreadsheet/ })).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/demo-spreadsheet-id/edit');

    const history = await screen.findByRole('table', { name: 'Riwayat ekspor Google Sheets' });
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(2));
    expect(within(history).getByText('Berhasil')).toBeInTheDocument();
  });

  it('periode kosong + tab berisi → konfirmasi kedua (danger) sebelum mengganti dengan laporan kosong', async () => {
    const backend = useFakeBackend();
    backend.seedSheetTab('Absensi 2026-12', 4);
    const user = await openAttendance('2026-12');
    await screen.findByText('Belum ada sesi');

    await user.click(exportButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ekspor sekarang' }));
    const second = await screen.findByRole('dialog', { name: 'Ganti isi tab dengan laporan kosong?' });
    expect(within(second).getByText(/berisi 4 baris/)).toBeInTheDocument();
    expect(screen.queryByText('Ekspor berhasil')).not.toBeInTheDocument();

    await user.click(within(second).getByRole('button', { name: 'Ya, ganti dengan laporan kosong' }));
    expect(await screen.findByText(/0 baris ditulis ke tab Absensi 2026-12/)).toBeInTheDocument();
  });

  it('periode kosong + tab belum ada → langsung sukses tanpa konfirmasi kedua', async () => {
    useFakeBackend();
    const user = await openAttendance('2026-12');
    await user.click(exportButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ekspor sekarang' }));
    expect(await screen.findByText(/0 baris ditulis ke tab Absensi 2026-12/)).toBeInTheDocument();
  });

  it('Google gagal → pesan aman di dialog, run gagal di riwayat, "Coba lagi" membuka konfirmasi lagi', async () => {
    const backend = useFakeBackend();
    backend.failNextSheetExport();
    const user = await openAttendance('2026-10');
    await user.click(exportButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ekspor sekarang' }));
    expect(await within(dialog).findByText(/Akses ke spreadsheet ditolak/)).toBeInTheDocument();
    expect(screen.queryByText('Ekspor berhasil')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Batal' }));

    const history = await screen.findByRole('table', { name: 'Riwayat ekspor Google Sheets' });
    expect(await within(history).findByText('Gagal')).toBeInTheDocument();
    await user.click(within(history).getByRole('button', { name: 'Coba lagi' }));
    const retry = await screen.findByRole('dialog', { name: 'Ekspor absensi ke Google Sheets' });
    await user.click(within(retry).getByRole('button', { name: 'Ekspor sekarang' }));
    expect(await screen.findByText('Ekspor berhasil')).toBeInTheDocument();
  });

  it('Batal menutup dialog tanpa memanggil ekspor', async () => {
    useFakeBackend();
    const user = await openAttendance('2026-10');
    await user.click(exportButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Belum ada ekspor')).toBeInTheDocument();
  });
});
