import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GRADE_OPTIONS } from '@mumtaz/contracts';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { loginStaff, renderApp, useFakeBackend } from '../test/render';

describe('pilihan jenjang siswa', () => {
  it('menampilkan PAUD sampai SMA dan menyimpan siswa SMA', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('link', { name: 'Master Data' }));
    const submenu = await screen.findByRole('navigation', { name: 'Submenu Master Data' });
    await user.click(within(submenu).getByRole('link', { name: 'Siswa' }));
    await user.click(await screen.findByRole('button', { name: 'Tambah siswa' }));
    const form = await screen.findByRole('dialog', { name: 'Tambah siswa' });
    const grade = within(form).getByLabelText(/^Kelas/);
    expect(within(grade).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['', ...GRADE_OPTIONS]);
    expect(within(grade).getByRole('option', { name: 'PAUD' })).toBeInTheDocument();
    expect(within(grade).getByRole('option', { name: 'TK' })).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/^Nama lengkap/), 'Siswa SMA baru');
    await user.selectOptions(grade, '3 SMA');
    await user.type(within(form).getByLabelText(/^Asal sekolah/), 'SMA uji');
    await user.click(within(form).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Siswa berhasil ditambahkan')).toBeInTheDocument();
    expect(await screen.findByText('Siswa SMA baru')).toBeInTheDocument();
  });
});
