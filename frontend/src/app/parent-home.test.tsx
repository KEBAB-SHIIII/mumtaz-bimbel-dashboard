import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, USER_IDS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, renderApp, useFakeBackend } from '../test/render';

async function loginParentA(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  return user;
}

describe('Beranda Orang Tua', () => {
  it('menampilkan kartu anak, angka bulan ini, pelajaran per mapel, dan sesi terakhir', async () => {
    useFakeBackend();
    const user = await loginParentA();
    expect(await screen.findByRole('heading', { name: 'Aisyah', level: 1 })).toBeInTheDocument();
    await choosePeriod('2026-10');

    const stats = await screen.findByRole('list', { name: 'Ringkasan bulan ini' });
    await waitFor(() => expect(stats).toHaveTextContent(/Sesi belajar\s*2\s*sesi/));
    expect(stats).toHaveTextContent(/Mata pelajaran\s*1\s*mapel/);

    const subjects = screen.getByRole('region', { name: 'Pelajaran bulan ini' });
    expect(within(subjects).getByText('Matematika')).toBeInTheDocument();
    expect(within(subjects).getByText('2 sesi')).toBeInTheDocument();

    const recent = screen.getByRole('region', { name: 'Sesi terakhir' });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(recent).getByRole('link', { name: 'Lihat semua catatan' }));
    expect(await screen.findByRole('heading', { name: 'Catatan Belajar', level: 1 })).toBeInTheDocument();
  });

  it('bulan tanpa sesi: tampil keadaan kosong yang ramah, bukan error', async () => {
    useFakeBackend();
    // Pemilih bulan hanya berisi bulan bersesi; bulan kosong dibuka lewat tautan.
    await loginParentA('/orang-tua-murid?period=2026-08');
    await screen.findByRole('heading', { name: 'Aisyah', level: 1 });
    expect(await screen.findByText('Belum ada sesi terverifikasi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('orang tua dengan dua anak dapat berganti anak', async () => {
    const backend = useFakeBackend();
    backend.linkStudent(USER_IDS.parentA, STUDENT_IDS.murid2);
    const user = await loginParentA();
    await screen.findByRole('heading', { name: 'Aisyah', level: 1 });
    await user.click(await screen.findByRole('button', { name: /^Anak/ }));
    await user.click(await screen.findByRole('option', { name: 'Bima' }));
    expect(await screen.findByRole('heading', { name: 'Bima', level: 1 })).toBeInTheDocument();
  });
});
