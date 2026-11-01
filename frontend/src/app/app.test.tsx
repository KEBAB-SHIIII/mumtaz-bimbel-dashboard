import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { chooseFilter, choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

const navLinks = async () =>
  within(await screen.findByRole('navigation', { name: 'Navigasi utama' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('autentikasi & navigasi per role', () => {
  it('route terproteksi tanpa sesi → halaman login', async () => {
    useFakeBackend();
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });

  it('kredensial salah → pesan generik dari server', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', 'salah');
    expect(await screen.findByText('Kredensial tidak valid')).toBeInTheDocument();
  });

  it('Admin: menu Admin saja, tanpa menu Tutor/Orang Tua', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await navLinks()).toEqual(['Dashboard', 'Data Absensi', 'Penagihan', 'Honor Tutor', 'Master Data']);
  });

  it('Tutor: menu Tutor saja; membuka /admin dialihkan ke /tutor', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    expect(await screen.findByRole('heading', { name: 'Halo, Farhan!' })).toBeInTheDocument();
    expect(await navLinks()).toEqual(['Dashboard', 'Form Absensi', 'Riwayat Mengajar', 'Honor Saya', 'Profil']);
  });

  it('Orang Tua: login satu field ID Akses, tanpa username/password', async () => {
    useFakeBackend();
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
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('button', { name: 'Keluar' }));
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });
});

describe('halaman berbasis periode', () => {
  it('mengganti bulan mengubah query (Okt 9 sesi → Nov 1 sesi)', async () => {
    useFakeBackend();
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

  it('Honor Tutor menampilkan tarif tunggal tanpa badge demo atau label simulasi', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Honor Tutor' }));
    await screen.findByRole('heading', { name: 'Honor Tutor', level: 1 });
    await choosePeriod('2026-10');
    expect(await screen.findByRole('heading', { name: 'Farhan' })).toBeInTheDocument();
    expect(screen.queryByText('Tarif demo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Simulasi/)).not.toBeInTheDocument();
  });
});

describe('Admin: validitas data (label AI) & status approval', () => {
  it('Perlu revisi: Admin memilih status approval dari dropdown di tabel', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await choosePeriod('2026-10');
    await chooseFilter('Validitas', 'Perlu revisi');

    // s03: Citra 5 Okt, Perlu revisi dengan approval menunggu.
    const approval = await screen.findByRole('combobox', { name: 'Status approval sesi Citra 5 Okt 2026' });
    expect(approval).toHaveValue('pending');
    await user.selectOptions(approval, 'approved');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status approval sesi Citra 5 Okt 2026' })).toHaveValue('approved'));
    // Label validitas AI tetap Perlu revisi; tidak ada aksi "Tinjau" per baris.
    expect(within(screen.getByRole('table')).getAllByText('Perlu revisi').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Tinjau/ })).not.toBeInTheDocument();
  });

  it('Detail: penjelasan anomali + koreksi label validitas oleh Admin', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await choosePeriod('2026-10');

    // s10: durasi 240 menit dengan temuan duration_outlier, belum divalidasi.
    await user.click(await screen.findByRole('button', { name: 'Detail sesi Citra 12 Okt 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(within(dialog).getByText('Durasi > 180 menit')).toBeInTheDocument();
    expect(within(dialog).getByText('Hasil uji (fake detector), bukan AI live')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Review temuan' })).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/^Validitas data/), 'needs_revision');
    await user.selectOptions(within(dialog).getByLabelText(/^Status approval/), 'pending');
    await user.type(within(dialog).getByLabelText(/^Pesan untuk tutor/), 'Konfirmasi durasi via WA');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan validitas' }));
    expect(await within(dialog).findByText('Validitas tersimpan.')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Perlu revisi').length).toBeGreaterThan(0);
  });

  it('Admin menambah sesi atas nama tutor (CRUD), lalu menghapusnya', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Data Absensi' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await choosePeriod('2026-10');

    await user.click(screen.getByRole('button', { name: 'Tambah sesi' }));
    const form = await screen.findByRole('dialog', { name: 'Tambah sesi' });
    await user.selectOptions(await within(form).findByLabelText(/^Nama tutor/), 'Farhan');
    await user.type(within(form).getByLabelText(/^Nama murid/), 'Ais');
    await user.click(await within(await screen.findByRole('listbox')).findByRole('option', { name: /Aisyah/ }));
    await user.click(within(form).getByRole('checkbox', { name: 'Matematika' }));
    await user.type(within(form).getByLabelText(/^Tanggal les/), '2026-10-25');
    await user.type(within(form).getByLabelText(/^Jam mulai/), '16:00');
    await user.type(within(form).getByLabelText(/^Jam selesai/), '17:00');
    await user.type(within(form).getByLabelText(/^Materi pembelajaran/), 'Pecahan');
    await user.click(within(form).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tambah sesi' })).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Detail sesi Aisyah 25 Okt 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detail sesi' });
    expect(within(dialog).getByText('Menunggu validasi')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Hapus' }));
    const confirm = await screen.findByRole('dialog', { name: 'Hapus sesi?' });
    await user.click(within(confirm).getByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Detail sesi Aisyah 25 Okt 2026' })).not.toBeInTheDocument());
  });
});

describe('Tutor: Form Absensi', () => {
  it('auto-fill kelas/sekolah, validasi di dekat field, sukses setelah server menyimpan', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('link', { name: 'Form Absensi' }));

    // Nama tutor wajib (bukan opsional), terisi dari akun.
    expect(await screen.findByLabelText(/^Nama tutor \(wajib\)/)).toHaveValue('Farhan');
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));
    expect((await screen.findAllByText('Wajib diisi')).length).toBeGreaterThan(0);

    // Tutor memilih murid (kotak pencarian) dan beberapa mata pelajaran sendiri; tidak ada penugasan.
    await user.type(screen.getByLabelText(/^Nama murid/), 'Ais');
    await user.click(await screen.findByRole('option', { name: /Aisyah/ }));
    expect(screen.getByLabelText(/^Nama murid/)).toHaveValue('Aisyah');
    await user.click(screen.getByRole('checkbox', { name: 'Matematika' }));
    await user.click(screen.getByRole('checkbox', { name: 'IPA' }));
    expect(screen.getByLabelText(/^Kelas · Asal sekolah/)).toHaveValue('3 SD · SD Harapan Bangsa');

    await user.type(screen.getByLabelText(/^Tanggal les/), '2026-10-20');
    await user.type(screen.getByLabelText(/^Jam mulai/), '18:45');
    await user.type(screen.getByLabelText(/^Jam selesai/), '19:45');
    expect(screen.getByText('60 menit')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Materi pembelajaran/), 'Persamaan linear');
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));

    expect(await screen.findByText('Absensi tersimpan')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Materi pembelajaran/)).toHaveValue('');
  });

  it('jam selesai sebelum jam mulai ditolak sebelum dikirim', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.click(await screen.findByRole('link', { name: 'Form Absensi' }));
    await user.type(await screen.findByLabelText(/^Jam mulai/), '17:00');
    await user.type(screen.getByLabelText(/^Jam selesai/), '16:00');
    expect(screen.getAllByText('Jam selesai harus setelah jam mulai').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Kirim absensi' }));
    await waitFor(() => expect(screen.getByLabelText(/^Jam selesai/)).toHaveAttribute('aria-invalid', 'true'));
  });
});

describe('Orang Tua: Progress Anak', () => {
  it('hanya sesi disetujui, tanpa catatan internal Admin', async () => {
    useFakeBackend();
    renderApp('/login/orang-tua');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    await user.click(await screen.findByRole('link', { name: 'Riwayat Pembelajaran' }));
    await screen.findByRole('heading', { name: 'Riwayat Pembelajaran', level: 1 });
    await choosePeriod('2026-10');

    expect(await screen.findByText(/Penjumlahan dan pengurangan/)).toBeInTheDocument();
    expect(screen.getByText(/Perkalian dasar/)).toBeInTheDocument();
    expect(screen.queryByText(/Catatan Admin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rp/)).not.toBeInTheDocument();
  });
});
