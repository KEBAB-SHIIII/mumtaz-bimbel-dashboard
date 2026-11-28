import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, SUBJECT_IDS, USER_IDS } from '@mumtaz/contracts/fixtures';
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
    expect(await screen.findByRole('heading', { name: 'Beranda', level: 1 })).toBeInTheDocument();
    const child = await screen.findByRole('region', { name: 'Data anak' });
    expect(child).toHaveTextContent('Aisyah');
    expect(child).toHaveTextContent('3 SD · SD Harapan Bangsa');
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
    await screen.findByRole('heading', { name: 'Beranda', level: 1 });
    expect(await screen.findByText('Belum ada sesi terverifikasi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('orang tua dengan dua anak dapat berganti anak', async () => {
    const backend = useFakeBackend();
    backend.linkStudent(USER_IDS.parentA, STUDENT_IDS.murid2);
    const user = await loginParentA();
    await screen.findByRole('heading', { name: 'Beranda', level: 1 });
    await user.click(await screen.findByRole('button', { name: /^Anak/ }));
    await user.click(await screen.findByRole('option', { name: 'Bima' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Data anak' })).toHaveTextContent('Bima'));
  });

  it('label kartu angka dibacakan sekali saja (tanpa duplikat untuk pembaca layar)', async () => {
    useFakeBackend();
    await loginParentA();
    await choosePeriod('2026-10');
    const stats = await screen.findByRole('list', { name: 'Ringkasan bulan ini' });
    for (const label of ['Sesi belajar', 'Waktu belajar', 'Mata pelajaran']) {
      expect(within(stats).getAllByText(label)).toHaveLength(1);
    }
  });

  it('sesi multi-mapel dihitung per mapel di "Pelajaran bulan ini"', async () => {
    const backend = useFakeBackend();
    backend.seedApprovedSession({
      student_id: STUDENT_IDS.murid1,
      subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.bahasaInggris],
      lesson_date: '2026-10-20',
      learning_material: 'Latihan gabungan',
      learning_notes: 'Siswa mengikuti latihan gabungan matematika dan bahasa Inggris dengan baik dan fokus sepanjang sesi berlangsung.',
    });
    await loginParentA();
    await choosePeriod('2026-10');
    const subjects = await screen.findByRole('region', { name: 'Pelajaran bulan ini' });
    await waitFor(() => expect(within(subjects).getAllByRole('listitem')).toHaveLength(2));
    expect(within(subjects).getByText('Matematika').closest('li')).toHaveTextContent('3 sesi');
    expect(within(subjects).getByText('Bahasa Inggris').closest('li')).toHaveTextContent('1 sesi');
  });

  it('pelajaran bulan ini menampilkan 5 mapel teratas lalu bisa diperluas', async () => {
    const backend = useFakeBackend();
    const extra = ['Fiqih', 'PKN', 'Mewarnai'].map((name) => backend.addSubject(name));
    backend.seedApprovedSession({
      student_id: STUDENT_IDS.murid1,
      subject_ids: [SUBJECT_IDS.bahasaInggris, SUBJECT_IDS.ipa, SUBJECT_IDS.bahasaIndonesia, ...extra],
      lesson_date: '2026-10-21',
      learning_material: 'Latihan gabungan',
      learning_notes: 'Siswa mengikuti latihan gabungan beberapa mata pelajaran dengan baik dan fokus sepanjang sesi berlangsung.',
    });
    const user = await loginParentA();
    await choosePeriod('2026-10');
    const subjects = await screen.findByRole('region', { name: 'Pelajaran bulan ini' });
    await waitFor(() => expect(within(subjects).getAllByRole('listitem')).toHaveLength(5));
    await user.click(within(subjects).getByRole('button', { name: 'Lihat semua (7 mapel)' }));
    expect(within(subjects).getAllByRole('listitem')).toHaveLength(7);
    await user.click(within(subjects).getByRole('button', { name: 'Tampilkan lebih sedikit' }));
    expect(within(subjects).getAllByRole('listitem')).toHaveLength(5);
  });
});
