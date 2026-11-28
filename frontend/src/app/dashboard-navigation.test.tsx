import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEST_ONLY_CREDENTIALS } from '@mumtaz/contracts/fixtures';
import { choosePeriod, loginStaff, renderApp, useFakeBackend } from '../test/render';

describe('dashboard mengarahkan ke data di balik angka', () => {
  it('Admin: empat kartu metrik (omzet kotor per jenjang); kartu sesi membuka Data Absensi periode itu', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    await choosePeriod('2026-10');

    const omzet = (await screen.findByRole('link', { name: 'Total omzet kotor' })).closest('div');
    if (!omzet) throw new Error('kartu omzet tidak ada');
    await waitFor(() => expect(omzet).toHaveTextContent(/Rp\s?340\.000/));
    expect(screen.queryByText('Menunggu verifikasi')).not.toBeInTheDocument();
    // Grafik dimuat lazy (chunk terpisah) setelah kartu metrik; semua grafik memakai data asli dari API.
    const sources = (await screen.findByRole('heading', { name: 'Sumber pendaftaran murid' })).closest('section');
    expect(screen.queryByText('Data contoh')).not.toBeInTheDocument();
    // Ringkasan aksesibel tiap grafik memuat angka periode terpilih (Oktober 2026).
    const figureOf = (title: string) => within(screen.getByRole('heading', { name: title }).closest('section') as HTMLElement).getByRole('figure');
    await waitFor(() => expect(figureOf('Tutor dengan sesi terbanyak')).toHaveAccessibleName('Tutor dengan sesi terbanyak: Farhan 3, Noreen 1'));
    expect(figureOf('Komposisi murid per jenjang')).toHaveAccessibleName('Komposisi murid per jenjang: PAUD–TK 0, SD 1–3 1, SD 4–6 2, SMP 0, SMA 0');
    // Pertumbuhan: Januari–Desember dengan filter tahun (default tahun terbaru yang punya data).
    const growth = screen.getByRole('heading', { name: 'Pertumbuhan jumlah siswa' }).closest('section') as HTMLElement;
    await waitFor(() => expect(figureOf('Pertumbuhan jumlah siswa')).toHaveAccessibleName(/^Pertumbuhan jumlah siswa: Januari 2026 0, .*September 2026 1, Oktober 2026 3, November 2026 1, Desember 2026 0$/));
    expect(within(growth).getByRole('button', { name: /Tahun/ })).toHaveTextContent('2026');
    expect(growth).not.toHaveTextContent('12 bulan');
    expect(screen.getByRole('heading', { name: 'Komposisi murid per jenjang' }).closest('section')).toHaveTextContent('Murid bersesi · Oktober 2026');
    if (!sources) throw new Error('kartu sumber pendaftaran tidak ada');
    expect(sources).not.toHaveTextContent('Data contoh');
    // Ringkasan aksesibel memuat angka dari API: fixture 7 WhatsApp, 1 per kanal lain, 1 belum diisi.
    await waitFor(() => expect(within(sources as HTMLElement).getByRole('figure')).toHaveAccessibleName(
      'Sumber pendaftaran murid: WhatsApp 7, Instagram 1, TikTok 1, Teman/Keluarga 1, Lainnya 1, Belum diisi 1',
    ));
    const revenue = screen.getByRole('heading', { name: 'Pendapatan per bulan' }).closest('section');
    expect(revenue).not.toHaveTextContent('Data contoh');
    // Grafik pendapatan satu tahun penuh dengan filter tahun (default: tahun terbaru yang punya data).
    if (!revenue) throw new Error('kartu pendapatan tidak ada');
    await waitFor(() => expect(revenue).toHaveTextContent('Januari–Desember 2026'));
    expect(within(revenue as HTMLElement).getByRole('button', { name: /Tahun/ })).toHaveTextContent('2026');

    await user.click(screen.getByRole('link', { name: 'Total sesi bulan ini' }));
    await screen.findByRole('heading', { name: 'Data Absensi', level: 1 });
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(10)); // header + 9
  });

  it('Tutor: dashboard menampilkan sesi terbaru dan kartu status membuka riwayat terfilter', async () => {
    useFakeBackend();
    renderApp('/login');
    const user = await loginStaff('farhan', TEST_ONLY_CREDENTIALS.tutorPassword);
    await screen.findByRole('heading', { name: 'Halo, Farhan!', level: 2 });
    await choosePeriod('2026-10');

    const recent = (await screen.findByRole('heading', { name: 'Sesi terbaru' })).closest('section');
    if (!recent) throw new Error('kartu sesi terbaru tidak ada');
    await waitFor(() => expect(within(recent).getAllByRole('listitem')).toHaveLength(5));

    await user.click(screen.getByRole('link', { name: 'Disetujui' }));
    await screen.findByRole('heading', { name: 'Riwayat Mengajar', level: 1 });
    expect(screen.getByRole('button', { name: /^Status/ })).toHaveTextContent('Disetujui');
  });

  it('periode tampil dalam bahasa Indonesia di semua browser (bukan input bulan bawaan)', async () => {
    useFakeBackend();
    renderApp('/login');
    await loginStaff('admin.demo', TEST_ONLY_CREDENTIALS.adminPassword);
    await choosePeriod('2026-10');
    // Bukan <input type="month"> bawaan (bahasa mengikuti browser): daftar bulan Listbox berbahasa Indonesia.
    expect(document.querySelector('input[type="month"]')).toBeNull();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Periode'));
    expect(await screen.findByRole('option', { name: 'Oktober 2026' })).toHaveAttribute('aria-selected', 'true');
  });
});
