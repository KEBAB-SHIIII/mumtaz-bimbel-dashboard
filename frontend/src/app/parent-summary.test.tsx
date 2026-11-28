import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDENT_IDS, SUBJECT_IDS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, renderApp, useFakeBackend } from '../test/render';

async function loginParentA(route = '/login/orang-tua') {
  renderApp(route);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/ID Akses Orang Tua/), 'MUMTAZ-DEMO-PARENT-ACCESS-ONLY');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByRole('heading', { name: 'Beranda', level: 1 });
  return user;
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navigasi utama' });

async function openNotes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(mainNav()).getByRole('link', { name: 'Catatan Belajar' }));
  await screen.findByRole('heading', { name: 'Catatan Belajar', level: 1 });
}

function mockDesktopViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(min-width: 64rem)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('Ringkasan belajar tutor untuk Orang Tua', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('membuat ringkasan bulanan di Beranda, detail di panel samping, dan tetap tersimpan saat berpindah halaman', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Lihat ringkasan bulanan' }));
    const card = screen.getByRole('region', { name: 'Ringkasan tutor Oktober' });
    expect(await within(card).findByText('Berkembang baik')).toBeInTheDocument();
    expect(within(card).getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Baca selengkapnya' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ringkasan tutor Oktober 2026' });
    expect(within(dialog).getByText(/Dari catatan tutor/)).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await openNotes(user);
    await user.click(within(mainNav()).getByRole('link', { name: 'Beranda' }));
    expect(await screen.findByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument();
  });

  it('membuat ringkasan per sesi di Catatan Belajar lewat panel samping tanpa menyembunyikan catatan tutor dan tanpa kata AI', async () => {
    useFakeBackend();
    const user = await loginParentA();
    await choosePeriod('2026-10');
    await openNotes(user);

    const notes = await screen.findAllByRole('article');
    // Sebelum ringkasan dibuka, kartu memakai nada kertas krem hangat.
    expect(notes[0]?.closest('li')).toHaveClass('bg-pastel-paper');

    const [first] = await screen.findAllByRole('button', { name: 'Lihat ringkasan tutor' });
    if (!first) throw new Error('tombol lihat ringkasan tutor tidak ada');
    await user.click(first);
    expect(await screen.findByText('Ringkasan tutor sesi ini')).toBeInTheDocument();
    expect(await screen.findByText(/Pada sesi ini siswa mengikuti materi Perkalian dasar 1–5/)).toBeInTheDocument();
    expect(screen.getByText('Perkalian dasar 1–5')).toBeInTheDocument();
    expect(screen.queryByText(/\bAI\b/)).not.toBeInTheDocument();

    // Setelah ringkasan dibuka (overall_status: good), kartu berubah ke warna kontekstual biru lembut.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(notes[0]?.closest('li')).toHaveClass('bg-pastel-blue');
    });
  });

  it('di desktop, panel samping tampil di sidebar terluar (di luar <main>) dan bisa pindah langsung antar sesi', async () => {
    mockDesktopViewport(true);
    const backend = useFakeBackend();
    backend.seedApprovedSession({
      student_id: STUDENT_IDS.murid1,
      subject_ids: [SUBJECT_IDS.bahasaInggris],
      lesson_date: '2026-10-30',
      learning_material: 'Kosakata aktivitas sehari-hari',
      learning_notes: 'Siswa sangat percaya diri melafalkan kosakata baru dan antusias menjawab pertanyaan tutor.',
    });

    const user = await loginParentA();
    await choosePeriod('2026-10');
    await openNotes(user);

    const triggers = await screen.findAllByRole('button', { name: 'Lihat ringkasan tutor' });
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    const [firstTrigger, secondTrigger] = triggers;
    if (!firstTrigger || !secondTrigger) throw new Error('minimal dua sesi diperlukan');

    // Klik sesi pertama (31 Okt) → tampil sebagai sidebar kanan terluar di luar `<main>` (bukan di div kartu dan bukan modal).
    await user.click(firstTrigger);
    const sidePanel = await screen.findByRole('complementary', { name: 'Ringkasan tutor sesi ini' });
    const main = screen.getByRole('main');
    expect(main.contains(sidePanel)).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await within(sidePanel).findByText(/Perkalian dasar 1–5/)).toBeInTheDocument();
    expect(within(sidePanel).getByText(/^1 \/ /)).toBeInTheDocument();

    // Klik langsung tombol di kartu sesi kedua (30 Okt) tanpa menutup panel → isi panel langsung berpindah.
    await user.click(secondTrigger);
    expect(await within(sidePanel).findByText(/Kosakata aktivitas sehari-hari/)).toBeInTheDocument();
    expect(within(sidePanel).getByText(/^2 \/ /)).toBeInTheDocument();

    // Navigasi mundur lewat tombol Sebelumnya di footer panel → kembali ke sesi pertama.
    await user.click(within(sidePanel).getByRole('button', { name: 'Sebelumnya' }));
    expect(await within(sidePanel).findByText(/Perkalian dasar 1–5/)).toBeInTheDocument();
    expect(within(sidePanel).getByText(/^1 \/ /)).toBeInTheDocument();

    // Tekan Escape → sidebar kanan tertutup.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Ringkasan tutor sesi ini' })).not.toBeInTheDocument();
    });
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

    await user.click(await screen.findByRole('button', { name: 'Lihat ringkasan bulanan' }));
    await user.click(await screen.findByRole('button', { name: 'Baca selengkapnya' }));
    const expandBtn = await screen.findByRole('button', { name: 'Lihat semua (4 mapel)' });
    // Urutan alfabetis: Bahasa Indonesia, Bahasa Inggris, IPA, Matematika → Matematika terlipat dulu
    expect(screen.queryByText(/Materi Matematika dibahas/)).not.toBeInTheDocument();
    await user.click(expandBtn);
    expect(await screen.findByText(/Materi Matematika dibahas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tampilkan lebih ringkas' })).toBeInTheDocument();
  });

  it('bulan tanpa sesi terverifikasi: keadaan kosong tanpa tombol ringkasan', async () => {
    useFakeBackend();
    await loginParentA('/orang-tua-murid?period=2026-09');
    expect(await screen.findByText('Belum ada sesi terverifikasi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lihat ringkasan bulanan' })).not.toBeInTheDocument();
  });

  it('gagal membuat ringkasan: error inline + Coba lagi tanpa kata AI; catatan tutor tetap utuh di Catatan Belajar', async () => {
    const backend = useFakeBackend();
    backend.failNextLearningSummary();
    const user = await loginParentA();
    await choosePeriod('2026-10');

    await user.click(await screen.findByRole('button', { name: 'Lihat ringkasan bulanan' }));
    expect(await screen.findByText(/Ringkasan tutor sedang tidak tersedia/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(screen.getByText(/Perkembangan belajar bulan ini baik/)).toBeInTheDocument());

    await openNotes(user);
    expect(await screen.findByText(/Siswa lancar penjumlahan, pengurangan dengan meminjam masih perlu latihan/)).toBeInTheDocument();
  });
});
