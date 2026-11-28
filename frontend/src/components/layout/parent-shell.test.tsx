import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, useFakeBackend } from '../../test/render';

async function loginParent(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  return user;
}

beforeEach(() => {
  useFakeBackend();
});

describe('ParentShell: kerangka portal Orang Tua', () => {
  it('memakai tema parent dan navbar atas dengan menu Beranda & Catatan Belajar', async () => {
    await loginParent();
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Beranda', 'Catatan Belajar']);
    expect(within(nav).getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement.dataset.appRole).toBe('parent');
    // Kerangka admin tidak dipakai: tanpa tombol hamburger.
    expect(screen.queryByRole('button', { name: 'Buka menu' })).not.toBeInTheDocument();
  });

  it('navigasi bawah (HP): Beranda, Catatan, dan menu Akun dengan tombol Keluar', async () => {
    const user = await loginParent();
    const bottom = await screen.findByRole('navigation', { name: 'Navigasi bawah' });
    await user.click(within(bottom).getByRole('link', { name: 'Catatan' }));
    expect(within(bottom).getByRole('link', { name: 'Catatan' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(bottom).getByRole('button', { name: 'Akun' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Keluar' }));
    expect(await screen.findByLabelText(/ID Akses Orang Tua/)).toBeInTheDocument();
  });

  it('tautan lama /mata-pelajaran dialihkan ke Beranda dengan query utuh', async () => {
    await loginParent('/orang-tua-murid/mata-pelajaran?period=2026-10');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    // <Navigate> berjalan setelah render pertama: tunggu sampai rute Beranda aktif.
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page'));
    expect(await screen.findByLabelText('Periode')).toHaveTextContent('Oktober 2026');
  });
});
