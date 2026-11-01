import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar, backgroundFor, loadAvatarRenderer } from './avatar';
import { ValidityBadge } from './badge';
import { Button } from './button';
import { CountUp } from './count-up';
import { DataTable } from './data-table';
import { SearchInput } from './search-input';
import { SegmentedControl, SegmentedTabs } from './segmented-tabs';
import { LoadingSwitch, SKELETON_DELAY_MS, SKELETON_MIN_VISIBLE_MS, setSkeletonBooting, useDelayedSkeleton } from './skeleton';
import { StatCard } from './stat-card';

function Providers({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <MemoryRouter>{children}</MemoryRouter>
      </MotionConfig>
    </LazyMotion>
  );
}
const renderUi = (ui: ReactNode) => render(<Providers>{ui}</Providers>);

/** Pasang `matchMedia` palsu: query yang cocok dengan `matcher` bernilai true. */
function mockMatchMedia(matcher: (query: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matcher(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Avatar (DiceBear critters)', () => {
  const tutorId = '00000000-0000-4000-8000-000000000002';

  it('membuat SVG lokal (data URI) yang deterministik per seed ID internal', async () => {
    const render = await loadAvatarRenderer();
    const first = render(tutorId);
    expect(first.startsWith('data:image/svg+xml')).toBe(true);
    expect(render(tutorId)).toBe(first);
    expect(render('00000000-0000-4000-8000-000000000003')).not.toBe(first);
  });

  it('memakai nama sebagai alt, atau alt kosong bila dekoratif', async () => {
    renderUi(
      <>
        <Avatar seed={tutorId} name="Farhan" />
        <Avatar seed={tutorId} name="Farhan" decorative />
      </>,
    );
    // Sebelum SVG jadi, placeholder berlabel nama; setelahnya <img> dengan data URI lokal.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Farhan' }).tagName).toBe('IMG'));
    expect(screen.getByRole('img', { name: 'Farhan' })).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('latar pastel stabil untuk seed yang sama', () => {
    expect(backgroundFor(tutorId)).toBe(backgroundFor(tutorId));
    expect(backgroundFor(tutorId)).toMatch(/^bg-accent-.+-subtle$/);
  });
});

describe('Skeleton: delay 150ms & tampil minimal 300ms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSkeletonBooting(false);
  });

  it('buka-pertama (refresh): skeleton langsung tampil tanpa jeda', () => {
    setSkeletonBooting(true);
    const { result } = renderHook(() => useDelayedSkeleton(true));
    expect(result.current).toBe(true);
  });

  it('tidak muncul untuk loading singkat (< 150ms)', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedSkeleton(loading), { initialProps: { loading: true } });
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1));
    expect(result.current).toBe(false);
    rerender({ loading: false });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(false);
  });

  it('muncul setelah 150ms dan bertahan minimal 300ms walau data sudah datang', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedSkeleton(loading), { initialProps: { loading: true } });
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(50));
    rerender({ loading: false });
    act(() => vi.advanceTimersByTime(SKELETON_MIN_VISIBLE_MS - 50 - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('LoadingSwitch mengumumkan status sibuk lalu menampilkan konten', () => {
    const { rerender } = renderUi(<LoadingSwitch loading skeleton={<p>skeleton</p>}>{() => <p>Konten</p>}</LoadingSwitch>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Memuat data…');
    rerender(
      <Providers>
        <LoadingSwitch loading={false} skeleton={<p>skeleton</p>}>
          {() => <p>Konten</p>}
        </LoadingSwitch>
      </Providers>,
    );
    expect(screen.getByText('Konten')).toBeInTheDocument();
  });
});

describe('CountUp', () => {
  it('reduced motion: langsung menampilkan nilai akhir', () => {
    mockMatchMedia((query) => query.includes('prefers-reduced-motion'));
    renderUi(<CountUp value={4250000} />);
    expect(screen.getByText('4.250.000')).toBeInTheDocument();
  });

  it('selama animasi pembaca layar menerima nilai akhir, angka bergerak disembunyikan', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    renderUi(<CountUp value={1250} format={(n) => `Rp${n}`} />);
    expect(screen.getByText('Rp1250', { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.getByText('Rp0', { selector: '[aria-hidden]' })).toBeInTheDocument();
  });

  it('tanpa animasi hanya ada satu node teks nilai', () => {
    renderUi(<CountUp value={1250} />);
    expect(screen.getAllByText('1.250')).toHaveLength(1);
  });

  it('StatCard dengan count tetap memberi nilai akhir di dalam dd', () => {
    renderUi(
      <dl>
        <StatCard label="Total sesi" count={{ value: 42 }} />
      </dl>,
    );
    expect(screen.getByRole('definition')).toHaveTextContent('42');
  });
});

describe('SearchInput', () => {
  it('menerapkan pencarian 250ms setelah berhenti mengetik', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderUi(<SearchInput value="" onChange={onChange} aria-label="Cari murid" />);
    await user.type(screen.getByRole('searchbox', { name: 'Cari murid' }), 'citra');
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('citra');
  });

  it('tombol hapus mengosongkan dan mengembalikan fokus ke kolom', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderUi(<SearchInput value="budi" onChange={onChange} aria-label="Cari murid" />);
    await user.click(screen.getByRole('button', { name: 'Hapus pencarian' }));
    expect(onChange).toHaveBeenCalledWith('');
    const input = screen.getByRole('searchbox', { name: 'Cari murid' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
});

describe('SegmentedControl & SegmentedTabs', () => {
  it('SegmentedControl: satu pilihan aktif, berpindah lewat klik', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderUi(
      <SegmentedControl
        label="Rentang"
        value="1m"
        onChange={onChange}
        options={[
          { value: '1m', label: 'Bulan ini' },
          { value: '3m', label: '3 bln' },
        ]}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Rentang' });
    expect(within(group).getByRole('radio', { name: 'Bulan ini' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: '3 bln' }));
    expect(onChange).toHaveBeenCalledWith('3m');
  });

  it('SegmentedTabs: mengganti isi panel', async () => {
    const user = userEvent.setup();
    renderUi(
      <SegmentedTabs
        label="Tampilan"
        tabs={[
          { key: 'a', label: 'Bulanan', content: <p>Isi bulanan</p> },
          { key: 'b', label: 'Tahunan', content: <p>Isi tahunan</p> },
        ]}
      />,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Isi bulanan');
    await user.click(screen.getByRole('tab', { name: 'Tahunan' }));
    expect(screen.getByRole('tab', { name: 'Tahunan' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Isi tahunan');
  });
});

describe('DataTable < 640px: daftar kartu', () => {
  interface Row {
    id: string;
    name: string;
    grade: string;
  }
  const columns: ColumnDef<Row, unknown>[] = [
    { id: 'no', header: 'No', cell: ({ row }) => row.index + 1 },
    { accessorKey: 'name', header: 'Nama' },
    { accessorKey: 'grade', header: 'Kelas' },
    { id: 'actions', header: () => <span className="sr-only">Aksi</span>, cell: () => <button type="button">Ubah</button>, meta: { stickyRight: true } },
  ];
  const data: Row[] = [
    { id: '1', name: 'Citra', grade: 'SD 4' },
    { id: '2', name: 'Budi', grade: 'SD 2' },
  ];

  it('menampilkan kartu berjudul kolom utama dengan label–nilai, tanpa tabel', () => {
    mockMatchMedia((query) => query.includes('max-width'));
    renderUi(<DataTable caption="Daftar siswa" columns={columns} data={data} getRowId={(row) => row.id} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Daftar siswa' });
    const [first] = within(list).getAllByRole('article');
    expect(first).toHaveTextContent('Citra');
    expect(within(first as HTMLElement).getByRole('term')).toHaveTextContent('Kelas');
    expect(within(first as HTMLElement).getByRole('definition')).toHaveTextContent('SD 4');
    expect(within(first as HTMLElement).getByRole('button', { name: 'Ubah' })).toBeInTheDocument();
  });

  it('sel tidak di-remount saat halaman render ulang (fokus tombol tetap & bisa dikembalikan dialog)', () => {
    mockMatchMedia(() => false);
    // Kolom dibuat ulang tiap render, seperti di halaman.
    const makeColumns = (): ColumnDef<Row, unknown>[] => [
      { accessorKey: 'name', header: 'Nama' },
      { id: 'actions', header: 'Aksi', cell: ({ row }) => <button type="button">Ubah {row.original.name}</button> },
    ];
    const table = (tick: number) => (
      <Providers>
        <span data-tick={tick} />
        <DataTable caption="Daftar siswa" columns={makeColumns()} data={data} getRowId={(row) => row.id} />
      </Providers>
    );
    const { rerender } = render(table(0));
    const before = screen.getByRole('button', { name: 'Ubah Citra' });
    before.focus();
    rerender(table(1));
    expect(screen.getByRole('button', { name: 'Ubah Citra' })).toBe(before);
    expect(before).toHaveFocus();
  });

  it('≥ 640px tetap tabel', () => {
    mockMatchMedia(() => false);
    renderUi(<DataTable caption="Daftar siswa" columns={columns} data={data} getRowId={(row) => row.id} />);
    expect(screen.getByRole('table', { name: 'Daftar siswa' })).toBeInTheDocument();
  });
});

describe('Badge & Button', () => {
  it('validitas belum ada → label "Menunggu validasi" (teks, bukan warna saja)', () => {
    renderUi(<ValidityBadge validity={null} />);
    expect(screen.getByText('Menunggu validasi')).toBeInTheDocument();
  });

  it('tombol loading tetap punya nama aksesibel dan nonaktif', async () => {
    renderUi(<Button loading>Simpan</Button>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Simpan' })).toHaveAttribute('aria-busy', 'true');
  });
});
