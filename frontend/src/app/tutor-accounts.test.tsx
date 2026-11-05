import { createFakeBackend } from '../test/fake-api/fake-backend';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { loginStaff, renderApp, useFakeBackend } from '../test/render';

async function openTutors() {
  renderApp('/login');
  const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
  await user.click(await screen.findByRole('link', { name: 'Master Data' }));
  await screen.findByRole('heading', { name: 'Master Data', level: 1 });
  return user;
}

describe('Master Data Tutor: akun login tanpa password dari Admin', () => {
  it('submenu hanya Tutor, Siswa, Orang Tua/Wali, Mata Pelajaran (tanpa penugasan & tarif)', async () => {
    useFakeBackend();
    await openTutors();
    const submenu = await screen.findByRole('navigation', { name: 'Submenu Master Data' });
    expect(within(submenu).getAllByRole('link').map((link) => link.textContent)).toEqual(['Tutor', 'Siswa', 'Orang Tua/Wali', 'Mata Pelajaran']);
  });

  it('tambah tutor: tidak ada kolom password; password acak tampil sekali lalu hilang', async () => {
    useFakeBackend();
    const user = await openTutors();
    await user.click(await screen.findByRole('button', { name: 'Tambah tutor' }));
    const form = await screen.findByRole('dialog', { name: 'Tambah tutor' });
    expect(within(form).queryByLabelText(/Password/)).not.toBeInTheDocument();

    await user.type(within(form).getByLabelText(/^Nama lengkap/), 'Dewi');
    await user.type(within(form).getByLabelText(/^Username/), 'dewi');
    await user.click(within(form).getByRole('button', { name: 'Simpan' }));

    const issued = await screen.findByRole('dialog', { name: 'Akun login tutor' });
    expect(within(issued).getByText('dewi')).toBeInTheDocument();
    expect(screen.getByText('Tutor berhasil ditambahkan')).toBeInTheDocument();
    expect(within(issued).getByText(/Fake-\d{4}-Pass/)).toBeInTheDocument();
    expect(within(issued).getByText(/hanya ditampilkan sekali/)).toBeInTheDocument();

    await user.click(within(issued).getByRole('button', { name: 'Saya sudah menyimpan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/Fake-\d{4}-Pass/)).not.toBeInTheDocument();
  });

  it('reset password meminta konfirmasi, lalu menampilkan password baru sekali', async () => {
    useFakeBackend();
    const user = await openTutors();
    await user.click(await screen.findByRole('button', { name: 'Reset password Farhan' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reset password?' });
    expect(within(confirm).getByText(/Password lama milik Farhan langsung tidak berlaku/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Reset password' }));

    const issued = await screen.findByRole('dialog', { name: 'Akun login tutor' });
    expect(within(issued).getByText('farhan')).toBeInTheDocument();
    expect(screen.getByText('Password tutor berhasil direset')).toBeInTheDocument();
    expect(within(issued).getByText(/Fake-\d{4}-Pass/)).toBeInTheDocument();
  });
});

describe('Sesi dicabut di tengah pemakaian', () => {
  it('Tutor diarahkan ke halaman login (bukan macet "Memuat data…") saat password direset Admin', async () => {
    const backend = useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByRole('heading', { name: 'Halo, Farhan!', level: 2 });

    backend.revokeSession();
    await user.click(screen.getByRole('link', { name: 'Riwayat Mengajar' }));

    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
    expect(screen.queryByText('Memuat data…')).not.toBeInTheDocument();
  });
});


describe('Wajib ganti password melalui Profil', () => {
  it('login mengunci menu dan membuka dashboard setelah password pribadi disimpan', async () => {
    useFakeBackend(createFakeBackend({ passwordRequired: true }));
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    expect(await screen.findByText('Ganti password untuk melanjutkan')).toBeInTheDocument();
    for (const name of ['Dashboard', 'Form Absensi', 'Riwayat Mengajar', 'Honor Saya', 'Cari menu']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('link', { name: 'Profil' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Password saat ini/), TEST_ONLY_CREDENTIALS.tutorPassword);
    await user.type(screen.getByLabelText(/^Password baru/), 'password-pribadi-123');
    await user.type(screen.getByLabelText(/^Konfirmasi password baru/), 'berbeda');
    await user.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan ke Dashboard' }));
    expect(await screen.findByText('Konfirmasi password tidak sama')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeDisabled();
    await user.clear(screen.getByLabelText(/^Konfirmasi password baru/));
    await user.type(screen.getByLabelText(/^Konfirmasi password baru/), 'password-pribadi-123');
    await user.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan ke Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Halo, Farhan!' })).toBeInTheDocument();
    expect(screen.getByText('Password berhasil diganti')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tutup notifikasi' }));
    await waitFor(() => expect(screen.queryByText('Password berhasil diganti')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });
});


describe('Validasi password tidak mengeluarkan tutor', () => {
  it('password pendek dan password saat ini salah tetap di Profil; sesi dicabut kembali ke login', async () => {
    const backend = useFakeBackend(createFakeBackend({ passwordRequired: true }));
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByText('Ganti password untuk melanjutkan');
    await user.type(screen.getByLabelText(/^Password saat ini/), 'password-lama-salah');
    await user.type(screen.getByLabelText(/^Password baru/), 'short');
    await user.type(screen.getByLabelText(/^Konfirmasi password baru/), 'short');
    const submit = screen.getByRole('button', { name: 'Simpan dan lanjutkan ke Dashboard' });
    await user.click(submit);
    expect(await screen.findByText('Password baru minimal 6 karakter')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Masuk Admin / Tutor' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Password baru/));
    await user.clear(screen.getByLabelText(/^Konfirmasi password baru/));
    await user.type(screen.getByLabelText(/^Password baru/), 'password-baru-valid');
    await user.type(screen.getByLabelText(/^Konfirmasi password baru/), 'password-baru-valid');
    await user.click(submit);
    expect(await screen.findByText('Password saat ini tidak sesuai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Masuk Admin / Tutor' })).not.toBeInTheDocument();
    backend.revokeSession();
    await user.click(submit);
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });
});
