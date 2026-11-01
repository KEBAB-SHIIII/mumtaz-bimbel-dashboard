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
