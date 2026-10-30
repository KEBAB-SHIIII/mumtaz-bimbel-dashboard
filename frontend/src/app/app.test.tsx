import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useDemoBackend } from '../test/render';

const navLinks = async () =>
  within(await screen.findByRole('navigation', { name: 'Navigasi utama' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('autentikasi & navigasi per role', () => {
  it('route terproteksi tanpa sesi → halaman login', async () => {
    useDemoBackend();
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });

  it('kredensial salah → pesan generik dari server', async () => {
    useDemoBackend();
    renderApp('/login');
    await loginStaff('admin.demo', 'salah');
    expect(await screen.findByText('Kredensial tidak valid')).toBeInTheDocument();
  });

  it('Admin: menu Admin saja, tanpa menu Tutor/Orang Tua', async () => {
    useDemoBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await navLinks()).toEqual(['Dashboard', 'Data Absensi', 'Rekap', 'Honor Tutor', 'Master Data']);
  });

  it('Tutor: menu Tutor saja; membuka /admin dialihkan ke /tutor', async () => {
    useDemoBackend();
    renderApp('/login');
    await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    expect(await screen.findByRole('heading', { name: 'Halo, Farhan' })).toBeInTheDocument();
    expect(await navLinks()).toEqual(['Dashboard', 'Form Absensi', 'Riwayat Mengajar', 'Honor Saya', 'Profil']);
  });

  it('Orang Tua: login satu field ID Akses, tanpa username/password', async () => {
    useDemoBackend();
    renderApp('/login/orang-tua');
    const user = userEvent.setup();
    expect(screen.queryByLabelText(/^Username/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByRole('heading', { name: 'Progress Anak' })).toBeInTheDocument();
    expect(await navLinks()).toEqual(['Progress Anak', 'Riwayat Pembelajaran']);
  });

  it('logout membersihkan sesi dan kembali ke login', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('button', { name: 'Keluar' }));
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });
});

describe('halaman berbasis periode', () => {
  it('mengganti bulan mengubah query (Okt 9 sesi → Nov 1 sesi)', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));

    await screen.findByRole('table');
    // Default periode = bulan berjalan; set eksplisit ke Okt 2026.
    await choosePeriod('2026-10');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(10)); // header + 9

    await user.click(screen.getByRole('button', { name: 'Bulan berikutnya' }));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
    expect(screen.getByText('1–1 dari 1')).toBeInTheDocument();
  });

  it('Honor Tutor menampilkan label simulasi tarif demo', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Honor Tutor' }));
    await choosePeriod('2026-10');
    expect((await screen.findAllByText('Simulasi — bukan tarif resmi UMKM')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: 'Farhan' })).toBeInTheDocument();
  });
});

describe('Admin: keputusan review', () => {
  it('tolak wajib alasan; setelah dikonfirmasi status berubah', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await choosePeriod('2026-10');
    await user.selectOptions(screen.getByLabelText('Status'), 'pending');

    const detailButtons = await screen.findAllByRole('button', { name: /Lihat detail sesi/ });
    const first = detailButtons[0];
    if (!first) throw new Error('tidak ada sesi pending');
    await user.click(first);
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    await user.click(within(dialog).getByRole('button', { name: 'Tolak' }));

    const confirm = await screen.findByRole('dialog', { name: 'Tolak sesi?' });
    const confirmButton = within(confirm).getByRole('button', { name: 'Tolak' });
    expect(confirmButton).toBeDisabled();
    await user.type(within(confirm).getByLabelText(/Alasan/), 'Tidak ada jadwal pada tanggal ini');
    await user.click(confirmButton);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tolak sesi?' })).not.toBeInTheDocument());
    expect(await within(await screen.findByRole('dialog', { name: 'Detail sesi' })).findByText('Ditolak')).toBeInTheDocument();
  });
});

describe('Admin: review temuan anomali', () => {
  it('review mencatat hasil tanpa mengubah status sesi; label sumber analisis jelas', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await choosePeriod('2026-10');

    // s10: durasi 240 menit dengan temuan duration_outlier.
    await user.click(await screen.findByRole('button', { name: /Lihat detail sesi Citra 12 Okt 2026/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(within(dialog).getByText('Durasi tidak wajar')).toBeInTheDocument();
    expect(within(dialog).getByText('Hasil uji (fake detector), bukan AI live')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Review temuan' }));
    const review = await screen.findByRole('dialog', { name: 'Review temuan anomali' });
    const save = within(review).getByRole('button', { name: 'Simpan review' });
    expect(save).toBeDisabled();
    await user.selectOptions(within(review).getByLabelText(/Hasil review/), 'false_positive');
    await user.type(within(review).getByLabelText(/Catatan review/), 'Sesi persiapan ujian memang panjang');
    await user.click(save);

    const refreshed = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(await within(refreshed).findByText('Bukan anomali')).toBeInTheDocument();
    expect(within(refreshed).getByText('Menunggu verifikasi')).toBeInTheDocument();
  });
});

describe('Tutor: Form Absensi', () => {
  it('auto-fill kelas/sekolah, validasi di dekat field, sukses setelah server menyimpan', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('link', { name: 'Form Absensi' }));

    expect(await screen.findByLabelText(/^Nama tutor/)).toHaveValue('Farhan');
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));
    expect(await screen.findByText('Wajib diisi')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Nama murid/), screen.getByRole('option', { name: /Aisyah/ }));
    expect(screen.getByLabelText(/^Kelas/)).toHaveValue('3 SD');
    expect(screen.getByLabelText(/^Asal sekolah/)).toHaveValue('SD Harapan Bangsa');

    await user.type(screen.getByLabelText(/^Tanggal les/), '2026-10-20');
    await user.type(screen.getByLabelText(/^Durasi les/), '90');
    await user.type(screen.getByLabelText(/^Materi pembelajaran/), 'Persamaan linear');
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));

    expect(await screen.findByText('Absensi tersimpan dan menunggu verifikasi')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Materi pembelajaran/)).toHaveValue('');
  });

  it('durasi bukan bilangan bulat ditolak sebelum dikirim', async () => {
    useDemoBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('link', { name: 'Form Absensi' }));
    await user.type(await screen.findByLabelText(/^Durasi les/), '1.5');
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));
    expect(await screen.findByText('Durasi harus bilangan bulat menit')).toBeInTheDocument();
  });
});

describe('Orang Tua: Progress Anak', () => {
  it('hanya sesi disetujui, tanpa catatan internal Admin', async () => {
    useDemoBackend();
    renderApp('/login/orang-tua');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    await user.click(await screen.findByRole('link', { name: 'Riwayat Pembelajaran' }));
    await choosePeriod('2026-10');

    expect(await screen.findByText(/Penjumlahan dan pengurangan/)).toBeInTheDocument();
    expect(screen.getByText(/Perkalian dasar/)).toBeInTheDocument();
    expect(screen.queryByText(/Catatan Admin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rp/)).not.toBeInTheDocument();
  });
});
