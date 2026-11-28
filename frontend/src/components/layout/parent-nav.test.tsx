import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, useFakeBackend } from '../../test/render';

async function loginParent(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByRole('heading', { name: 'Beranda', level: 1 });
  return user;
}

beforeEach(() => {
  useFakeBackend();
});

describe('Navigasi portal Orang Tua (sidebar + tab bawah)', () => {
  it('sidebar berisi Beranda & Catatan Belajar dengan tema parent', async () => {
    await loginParent();
    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Beranda', 'Catatan Belajar']);
    expect(document.documentElement.dataset.appRole).toBe('parent');
  });

  it('HP: tab bawah hanya Beranda & Catatan (tanpa tab Akun) dan tanpa tombol hamburger', async () => {
    const user = await loginParent();
    const bottom = screen.getByRole('navigation', { name: 'Navigasi bawah' });
    expect(within(bottom).getAllByRole('link').map((link) => link.textContent)).toEqual(['Beranda', 'Catatan']);
    expect(within(bottom).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buka menu' })).not.toBeInTheDocument();
    await user.click(within(bottom).getByRole('link', { name: 'Catatan' }));
    expect(await screen.findByRole('heading', { name: 'Catatan Belajar', level: 1 })).toBeInTheDocument();
    expect(within(bottom).getByRole('link', { name: 'Catatan' })).toHaveAttribute('aria-current', 'page');
  });

  it('keluar lewat menu avatar di header', async () => {
    const user = await loginParent();
    await user.click(screen.getByRole('button', { name: /^Menu akun/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Keluar' }));
    expect(await screen.findByLabelText(/ID Akses Orang Tua/)).toBeInTheDocument();
  });

  it('tautan lama /mata-pelajaran dialihkan ke Beranda dengan query utuh', async () => {
    await loginParent('/orang-tua-murid/mata-pelajaran?period=2026-10');
    await waitFor(() => expect(screen.getByLabelText('Periode')).toHaveTextContent('Oktober 2026'));
  });
});
