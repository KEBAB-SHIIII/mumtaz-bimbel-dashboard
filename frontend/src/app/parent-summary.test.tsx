import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, renderApp, useFakeBackend } from '../test/render';

async function loginParentA(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText(/ID Akses Orang Tua/),
    'MUMTAZ-DEMO-PARENT-ACCESS-ONLY',
  );
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByRole('heading', { name: 'Progress Anak' });
  return user;
}

describe('Ringkasan belajar AI Orang Tua', () => {
  it('membuat ringkasan bulanan dan tetap tersimpan saat berpindah halaman lalu kembali', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    const generateBtn = await screen.findByRole('button', { name: 'Buat ringkasan bulanan' });
    await user.click(generateBtn);

    expect(await screen.findByText('Berkembang baik')).toBeInTheDocument();
    expect(screen.getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();
    expect(screen.getByText(/Ringkasan otomatis berdasarkan catatan tutor/)).toBeInTheDocument();

    // Pindah ke Riwayat Pembelajaran lalu kembali ke Progress Anak → ringkasan tetap tampil
    await user.click(screen.getByRole('link', { name: 'Riwayat Pembelajaran' }));
    await screen.findByRole('heading', { name: 'Riwayat Pembelajaran' });

    await user.click(screen.getByRole('link', { name: 'Progress Anak' }));
    await screen.findByRole('heading', { name: 'Progress Anak' });
    await choosePeriod('2026-10');
    expect(await screen.findByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();
  });

  it('membuat ringkasan per sesi di timeline tanpa menyembunyikan catatan tutor', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    const sessionButtons = await screen.findAllByRole('button', { name: 'Ringkas sesi ini' });
    const firstSessionButton = sessionButtons[0];
    expect(firstSessionButton).toBeDefined();

    if (firstSessionButton) {
      await user.click(firstSessionButton);
    }
    expect(await screen.findByText('Ringkasan AI sesi ini')).toBeInTheDocument();
    expect(
      screen.getByText(/Pada sesi ini siswa mengikuti materi Perkalian dasar 1–5/),
    ).toBeInTheDocument();
    expect(screen.getByText('Perkalian dasar 1–5')).toBeInTheDocument();
  });

  it('melipat daftar mata pelajaran jika > 3 mapel dan dapat diperluas/diringkas', async () => {
    const backend = useFakeBackend();
    backend.seedApprovedSession({
      student_id: STUDENT_IDS.murid1,
      subject_ids: [
        SUBJECT_IDS.matematika,
        SUBJECT_IDS.bahasaInggris,
        SUBJECT_IDS.ipa,
        SUBJECT_IDS.bahasaIndonesia,
      ],
      lesson_date: '2026-10-20',
      learning_material: 'Latihan terpadu 4 mapel',
      learning_notes:
        'Siswa mengikuti latihan lintas mata pelajaran dengan penuh semangat dan konsentrasi tinggi sepanjang sesi berlangsung.',
    });

    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Buat ringkasan bulanan' }));

    const expandBtn = await screen.findByRole('button', { name: 'Lihat semua (4 mapel)' });
    expect(expandBtn).toBeInTheDocument();
    // Urutan alfabetis: Bahasa Indonesia, Bahasa Inggris, IPA, Matematika → Matematika terlipat dulu
    expect(screen.queryByText(/Materi Matematika dibahas/)).not.toBeInTheDocument();

    await user.click(expandBtn);
    expect(await screen.findByText(/Materi Matematika dibahas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilkan lebih ringkas' })).toBeInTheDocument();
  });

  it('menampilkan info tanpa tombol generate bila periode tidak punya sesi terverifikasi', async () => {
    useFakeBackend();
    await loginParentA('/orang-tua-murid?period=2026-09');

    expect(
      await screen.findByText(/Belum ada sesi terverifikasi untuk diringkas pada September 2026/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Buat ringkasan bulanan' }),
    ).not.toBeInTheDocument();
  });

  it('menampilkan error inline dan tombol Coba lagi tanpa menyembunyikan catatan tutor', async () => {
    const backend = useFakeBackend();
    backend.failNextLearningSummary();

    const user = await loginParentA();
    await choosePeriod('2026-10');

    // Catatan tutor sesi s01 tampil
    expect(
      await screen.findByText(/Siswa lancar penjumlahan, pengurangan dengan meminjam masih perlu latihan/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Buat ringkasan bulanan' }));

    expect(
      await screen.findByText(/Layanan ringkasan AI sedang tidak tersedia/),
    ).toBeInTheDocument();
    // Catatan tutor tetap terlihat saat error
    expect(
      screen.getByText(/Siswa lancar penjumlahan, pengurangan dengan meminjam masih perlu latihan/),
    ).toBeInTheDocument();

    // Coba lagi → berhasil
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() =>
      expect(screen.getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument(),
    );
  });
});
