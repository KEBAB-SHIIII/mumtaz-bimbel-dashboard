import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, renderApp, useFakeBackend } from '../test/render';

async function loginParentA(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByRole('heading', { name: 'Aisyah', level: 1 });
  return user;
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navigasi utama' });

async function openNotes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(mainNav()).getByRole('link', { name: 'Catatan Belajar' }));
  await screen.findByRole('heading', { name: 'Catatan Belajar', level: 1 });
}

describe('Ringkasan belajar AI Orang Tua', () => {
  it('membuat ringkasan bulanan di Beranda, detail di modal, dan tetap tersimpan saat berpindah halaman', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Buat ringkasan bulanan' }));
    const card = screen.getByRole('region', { name: 'Ringkasan belajar Oktober' });
    expect(await within(card).findByText('Berkembang baik')).toBeInTheDocument();
    expect(within(card).getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Baca selengkapnya' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ringkasan belajar Oktober 2026' });
    expect(within(dialog).getByText(/Ringkasan otomatis berdasarkan catatan tutor/)).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await openNotes(user);
    await user.click(within(mainNav()).getByRole('link', { name: 'Beranda' }));
    expect(await screen.findByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();
  });

  it('membuat ringkasan per sesi di Catatan Belajar lewat modal tanpa menyembunyikan catatan tutor', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');
    await openNotes(user);

    const [first] = await screen.findAllByRole('button', { name: 'Ringkas sesi ini' });
    if (!first) throw new Error('tombol ringkas sesi tidak ada');
    await user.click(first);
    expect(await screen.findByText('Ringkasan AI sesi ini')).toBeInTheDocument();
    expect(screen.getByText(/Pada sesi ini siswa mengikuti materi Perkalian dasar 1–5/)).toBeInTheDocument();
    expect(screen.getByText('Perkalian dasar 1–5')).toBeInTheDocument();
  });

  it('melipat daftar mata pelajaran di detail ringkasan jika > 3 mapel', async () => {
    const backend = useFakeBackend();
    backend.seedApprovedSession({
      student_id: STUDENT_IDS.murid1,
      subject_ids: [SUBJECT_IDS.matematika, SUBJECT_IDS.bahasaInggris, SUBJECT_IDS.ipa, SUBJECT_IDS.bahasaIndonesia],
      lesson_date: '2026-10-20',
      learning_material: 'Latihan terpadu 4 mapel',
      learning_notes: 'Siswa mengikuti latihan lintas mata pelajaran dengan penuh semangat dan konsentrasi tinggi sepanjang sesi berlangsung.',
    });
    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Buat ringkasan bulanan' }));
    await user.click(await screen.findByRole('button', { name: 'Baca selengkapnya' }));
    const expandBtn = await screen.findByRole('button', { name: 'Lihat semua (4 mapel)' });
    // Urutan alfabetis: Bahasa Indonesia, Bahasa Inggris, IPA, Matematika → Matematika terlipat dulu
    expect(screen.queryByText(/Materi Matematika dibahas/)).not.toBeInTheDocument();
    await user.click(expandBtn);
    expect(await screen.findByText(/Materi Matematika dibahas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilkan lebih ringkas' })).toBeInTheDocument();
  });

  it('bulan tanpa sesi terverifikasi: keadaan kosong tanpa tombol generate', async () => {
    useFakeBackend();
    await loginParentA('/orang-tua-murid?period=2026-09');
    expect(await screen.findByText('Belum ada sesi terverifikasi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buat ringkasan bulanan' })).not.toBeInTheDocument();
  });

  it('gagal membuat ringkasan: error inline + Coba lagi; catatan tutor tetap utuh di Catatan Belajar', async () => {
    const backend = useFakeBackend();
    backend.failNextLearningSummary();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Buat ringkasan bulanan' }));
    expect(await screen.findByText(/Layanan ringkasan AI sedang tidak tersedia/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(screen.getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument());

    await openNotes(user);
    expect(await screen.findByText(/Siswa lancar penjumlahan, pengurangan dengan meminjam masih perlu latihan/)).toBeInTheDocument();
  });

  it('kertas catatan berwarna sesuai mapelnya (sama dengan ikon mapel di Beranda)', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');
    await openNotes(user);
    const notes = await screen.findAllByRole('article');
    // Sesi Oktober Aisyah: Matematika → nada biru.
    expect(notes[0]?.closest('li')).toHaveClass('bg-pastel-blue');
  });
});
