import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { loginStaff, renderApp, useFakeBackend } from '../../test/render';

async function loginAdmin() {
  renderApp('/login');
  const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return user;
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navigasi utama' });

beforeEach(() => {
  useFakeBackend();
});
afterEach(() => localStorage.clear());

describe('AppShell: sidebar berkelompok', () => {
  it('menampilkan label grup per role', async () => {
    await loginAdmin();
    const nav = mainNav();
    for (const group of ['Utama', 'Operasional', 'Pengaturan']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
    expect(within(nav).getByRole('list', { name: 'Operasional' })).toHaveTextContent('Data AbsensiPenagihanHonor Tutor');
  });

  it('judul halaman dirender di header sebagai h1 tunggal', async () => {
    await loginAdmin();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('heading', { name: 'Dashboard' }));
  });
});

describe('AppShell: submenu Master Data', () => {
  it('tertutup di luar Master Data dan bisa dibuka lewat tombol chevron', async () => {
    const user = await loginAdmin();
    const toggle = within(mainNav()).getByRole('button', { name: 'Submenu Master Data' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(mainNav()).queryByRole('link', { name: 'Siswa' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(mainNav()).getByRole('link', { name: 'Siswa' }));
    expect(await screen.findByRole('heading', { name: 'Master Data' })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: 'Siswa' })).toHaveAttribute('aria-current', 'page');

    await user.click(toggle);
    await waitFor(() => expect(within(mainNav()).queryByRole('link', { name: 'Siswa' })).not.toBeInTheDocument());
  });

  it('terbuka otomatis saat rute aktif berada di dalamnya', async () => {
    const user = await loginAdmin();
    await user.click(within(mainNav()).getByRole('link', { name: 'Master Data' }));
    expect(await screen.findByRole('heading', { name: 'Master Data' })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('button', { name: 'Submenu Master Data' })).toHaveAttribute('aria-expanded', 'true');
    // `/admin/master-data` dialihkan ke submenu pertama (Tutor) lewat <Navigate>.
    await waitFor(() => expect(within(mainNav()).getByRole('link', { name: 'Tutor' })).toHaveAttribute('aria-current', 'page'));
  });
});

describe('AppShell: collapse sidebar', () => {
  it('menyimpan status di localStorage dan tetap memberi nama aksesibel pada tautan', async () => {
    const user = await loginAdmin();
    await user.click(screen.getByRole('button', { name: 'Ciutkan sidebar' }));
    expect(localStorage.getItem('mumtaz:sidebar-collapsed')).toBe('1');
    expect(screen.getByRole('button', { name: 'Lebarkan sidebar' })).toHaveAttribute('aria-expanded', 'false');
    // Label disembunyikan secara visual, tetapi tetap menjadi nama tautan; submenu disembunyikan saat ciut.
    expect(within(mainNav()).getByRole('link', { name: 'Data Absensi' })).toBeInTheDocument();
    expect(within(mainNav()).queryByRole('button', { name: 'Submenu Master Data' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lebarkan sidebar' }));
    expect(localStorage.getItem('mumtaz:sidebar-collapsed')).toBe('0');
  });

  it('membaca status collapse tersimpan saat aplikasi dibuka', async () => {
    localStorage.setItem('mumtaz:sidebar-collapsed', '1');
    await loginAdmin();
    expect(screen.getByRole('button', { name: 'Lebarkan sidebar' })).toBeInTheDocument();
  });
});

describe('AppShell: drawer HP/tablet', () => {
  it('membuka navigasi di drawer dan menutupnya setelah memilih menu', async () => {
    const user = await loginAdmin();
    await user.click(screen.getByRole('button', { name: 'Buka menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu navigasi' });
    // Drawer selalu lebar penuh: tidak ada tombol ciutkan, ada tombol tutup.
    expect(within(drawer).queryByRole('button', { name: 'Ciutkan sidebar' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Tutup menu' })).toBeInTheDocument();

    await user.click(within(drawer).getByRole('link', { name: 'Data Absensi' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu navigasi' })).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Data Absensi' })).toBeInTheDocument();
  });

  it('tombol Tutup menu menutup drawer', async () => {
    const user = await loginAdmin();
    await user.click(screen.getByRole('button', { name: 'Buka menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu navigasi' });
    await user.click(within(drawer).getByRole('button', { name: 'Tutup menu' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu navigasi' })).not.toBeInTheDocument());
  });
});

describe('AppShell: header', () => {
  it('pencarian menu melompat ke halaman yang dipilih, termasuk submenu', async () => {
    const user = await loginAdmin();
    await user.click(screen.getByRole('button', { name: 'Cari menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cari menu' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Cari menu' }), 'mata pel');
    await user.click(within(dialog).getByRole('option', { name: /Mata Pelajaran/ }));
    expect(await screen.findByRole('heading', { name: 'Master Data' })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: 'Mata Pelajaran' })).toHaveAttribute('aria-current', 'page');
  });

  it('pencarian tanpa hasil memberi pesan yang jelas', async () => {
    const user = await loginAdmin();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Cari menu' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Cari menu' }), 'zzz');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Tidak ada halaman yang cocok dengan “zzz”.');
  });

  it('menu akun Tutor berisi Profil dan Keluar', async () => {
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByRole('heading', { name: 'Halo, Farhan' });
    await user.click(screen.getByRole('button', { name: /^Menu akun/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Profil' })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Keluar' }));
    expect(await screen.findByRole('heading', { name: 'Masuk Admin / Tutor' })).toBeInTheDocument();
  });

  it('Orang Tua: satu grup menu tanpa label grup', async () => {
    renderApp('/login/orang-tua');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    await screen.findByRole('heading', { name: 'Progress Anak' });
    expect(within(mainNav()).queryByText('Anak')).not.toBeInTheDocument();
  });
});
