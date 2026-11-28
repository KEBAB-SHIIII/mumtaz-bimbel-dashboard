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
    await user.click(await screen.findByRole('button', { name: /Master Data/ }));
    await user.click(await screen.findByRole('link', { name: 'Siswa' }));
    await user.click(await screen.findByRole('button', { name: 'Tambah siswa' }));
    const form = await screen.findByRole('dialog', { name: 'Tambah siswa' });
    expect(within(form).queryByRole('combobox')).not.toBeInTheDocument();
    const grade = within(form).getByLabelText(/^Kelas/);
    await user.click(grade);
    expect((await screen.findAllByRole('option')).map(option=>option.textContent)).toEqual([...GRADE_OPTIONS]);
    await user.click(screen.getByRole('option',{name:'3 SMA'}));
    await user.type(within(form).getByLabelText(/^Nama lengkap/), 'Siswa SMA baru');
    expect(grade).toHaveTextContent('3 SMA');
    await user.type(within(form).getByLabelText(/^Asal sekolah/), 'SMA uji');
    // Sumber pendaftaran wajib: tanpa pilihan, form menampilkan error dan tidak terkirim.
    await user.click(within(form).getByRole('button', { name: 'Simpan' }));
    expect(await within(form).findByText('Pilih sumber pendaftaran')).toBeInTheDocument();
    const source = within(form).getByLabelText(/^Sumber pendaftaran/);
    await user.click(source);
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(
      ['WhatsApp', 'Instagram', 'TikTok', 'Teman/Keluarga', 'Lainnya'],
    );
    await user.click(screen.getByRole('option', { name: 'TikTok' }));
    await user.click(within(form).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Siswa berhasil ditambahkan')).toBeInTheDocument();
    const row = (await screen.findByText('Siswa SMA baru')).closest('tr');
    expect(row).toHaveTextContent('TikTok');

    await user.click(screen.getByRole('button', { name: 'Ubah Siswa SMA baru' }));
    const edit = await screen.findByRole('dialog', { name: 'Ubah siswa' });
    const editSource = within(edit).getByLabelText(/^Sumber pendaftaran/);
    expect(editSource).toHaveTextContent('TikTok');
    await user.click(editSource);
    await user.keyboard('{ArrowUp}{Enter}');
    await user.click(within(edit).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Siswa berhasil diperbarui')).toBeInTheDocument();
    expect(screen.getByText('Siswa SMA baru').closest('tr')).toHaveTextContent('Instagram');
  });

  it('mempertahankan sumber kosong saat siswa lama disimpan', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await user.click(await screen.findByRole('button', { name: /Master Data/ }));
    await user.click(await screen.findByRole('link', { name: 'Siswa' }));
    await user.type(await screen.findByPlaceholderText('Nama atau sekolah'), 'Lutfi');
    await user.click(await screen.findByRole('button', { name: 'Ubah Lutfi' }));
    const edit = await screen.findByRole('dialog', { name: 'Ubah siswa' });
    const source = within(edit).getByLabelText(/^Sumber pendaftaran/);
    expect(source).toHaveTextContent('Belum diisi');
    await user.click(within(edit).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Siswa berhasil diperbarui')).toBeInTheDocument();
    expect(screen.getByText('Lutfi').closest('tr')).toHaveTextContent('Belum diisi');
  });
});
