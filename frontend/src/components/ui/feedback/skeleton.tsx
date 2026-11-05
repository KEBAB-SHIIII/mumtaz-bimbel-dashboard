import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { MOBILE_QUERY, useMediaQuery } from '../../../hooks/use-media-query';

/** Skeleton baru muncul bila loading > 150ms, lalu bertahan minimal 300ms (docs/design/04-components.md). */
export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_VISIBLE_MS = 300;

/**
 * Saat aplikasi pertama dibuka (refresh), skeleton tampil tanpa jeda agar berlanjut mulus dari skeleton
 * shell → skeleton halaman → konten. Setelah konten pertama tampil, navigasi berikutnya memakai jeda 150ms.
 */
let booting = true;

/** Untuk test: atur ulang mode buka-pertama. */
export function setSkeletonBooting(value: boolean) {
  booting = value;
}

/**
 * Menunda & menahan skeleton: `false` selama 150ms pertama loading (request cepat tidak berkedip), lalu `true`
 * minimal 300ms walau data sudah datang (transisi tidak terasa patah). Saat buka-pertama: langsung `true`.
 */
export function useDelayedSkeleton(loading: boolean): boolean {
  // Penginisialisasi lazy: dibaca sekali saat mount (waktu mulai tampil untuk aturan minimal 300ms).
  const [immediateAt] = useState(() => (booting && loading ? Date.now() : null));
  const [visible, setVisible] = useState(immediateAt !== null);
  const shownAt = useRef<number | null>(immediateAt);

  useEffect(() => {
    if (loading) {
      if (shownAt.current !== null) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (shownAt.current === null) return;
    const remaining = Math.max(0, SKELETON_MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  return visible;
}

/** Satu blok skeleton dengan shimmer diagonal pelan (transform saja). Reduced motion: denyut opasitas statis. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-linear-[110deg] after:from-transparent after:via-surface/70 after:to-transparent',
        'motion-reduce:after:hidden',
        className,
      )}
    />
  );
}

/** Wadah skeleton: satu pengumuman sibuk untuk pembaca layar; blok di dalamnya `aria-hidden`. */
export function SkeletonRegion({ children, label = 'Memuat data…', className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

interface LoadingSwitchProps {
  /** Loading pertama (TanStack Query `isPending`), bukan refetch. */
  loading: boolean;
  /** Shape follows the actual content layout. */
  skeleton: ReactNode;
  /** Dipanggil hanya setelah loading selesai, jadi aman membaca data. */
  children: () => ReactNode;
  /** Kelas wadah konten & skeleton (mis. `flex flex-col gap-4`). */
  className?: string;
}

/**
 * Skeleton → konten tanpa kedip: < 150ms tidak menampilkan apa pun, lalu skeleton (minimal 300ms),
 * lalu konten menggantikan skeleton tanpa animasi tumpang tindih.
 */
export function LoadingSwitch({ loading, skeleton, children, className }: LoadingSwitchProps) {
  const showSkeleton = useDelayedSkeleton(loading);
  const state = showSkeleton ? 'skeleton' : loading ? 'waiting' : 'content';
  useEffect(() => {
    if (state === 'content') booting = false;
  }, [state]);
  return (
    <div className={className}>
      {state === 'waiting' && <span role="status" aria-busy="true" className="sr-only">Memuat data…</span>}
      {state === 'content' ? children() : (
        <div className={cn(className, state === 'waiting' && 'invisible')} aria-hidden={state === 'waiting' || undefined}>
          {skeleton}
        </div>
      )}
    </div>
  );
}

/* ── Varian siap pakai, bentuk mengikuti konten asli ─────────────────────────────── */

function CardFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5', className)}>{children}</div>;
}

/** 4 kartu statistik (2 di HP): kotak ikon + label + angka. */
export function SkeletonStatCards({ count = 4, dashboard = false }: { count?: number; dashboard?: boolean }) {
  return (
    <SkeletonRegion className={cn("grid grid-cols-2 gap-3 sm:gap-4", count === 5 ? "lg:grid-cols-5" : count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
      {Array.from({ length: count }, (_, index) => (
        <CardFrame key={index} className={cn('flex min-w-0 flex-col gap-3', count === 5 && index === 4 && 'max-lg:col-span-2', dashboard && count === 4 && index === 3 && 'max-sm:col-span-2')}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-8 w-24 max-w-full" />
          {dashboard && (index === 1 || index === 3) && <Skeleton className="h-4 w-3/4" />}
        </CardFrame>
      ))}
    </SkeletonRegion>
  );
}

/** Kartu grafik: judul + subjudul + area grafik setinggi grafik asli. */
export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <SkeletonRegion>
      <CardFrame className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="w-full" style={{ height }} />
      </CardFrame>
    </SkeletonRegion>
  );
}

/** Tabel: header asli tetap tampil (tidak di-skeleton) + 6 baris selebar kolom. */
export function SkeletonTable({ headers, rows = 6 }: { headers: readonly string[]; rows?: number }) {
  return (
    <SkeletonRegion className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {headers.map((header) => (
              <th key={header} scope="col" className="h-10 px-4 text-start text-meta font-medium whitespace-nowrap text-muted">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-hidden>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row} className="border-b border-border last:border-b-0">
              {headers.map((header, column) => (
                <td key={header} className="h-11 px-4 py-2.5">
                  <Skeleton className={cn('h-3.5', column === 0 ? 'w-8' : (row + column) % 3 === 0 ? 'w-28' : 'w-20')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </SkeletonRegion>
  );
}

/** Versi HP dari tabel: 4 kartu berisi judul + label–nilai. */
export function SkeletonCardList({ count = 4 }: { count?: number }) {
  return (
    <SkeletonRegion className="flex flex-col divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((cell) => (
              <div key={cell} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Form: label + field per baris, tombol di akhir. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonRegion className="flex flex-col gap-5">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-full pointer-coarse:h-11" />
        </div>
      ))}
      <Skeleton className="h-9 w-32 pointer-coarse:h-11" />
    </SkeletonRegion>
  );
}

/** Profil: avatar bulat + 2 garis. */
export function SkeletonProfile({ size = 72 }: { size?: number }) {
  return (
    <SkeletonRegion className="flex items-center gap-4">
      <Skeleton className="shrink-0 rounded-full" style={{ width: size, height: size }} />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </SkeletonRegion>
  );
}

/**
 * Fallback rute lazy (`Suspense`): kerangka sesuai halaman tujuan (`children`), muncul setelah 150ms agar
 * navigasi cepat tidak berkedip — kecuali saat buka-pertama, langsung tampil.
 */
export function PageSkeleton({ children }: { children: ReactNode }) {
  const visible = useDelayedSkeleton(true);
  if (!visible) return <SkeletonRegion label="Memuat halaman…"><span /></SkeletonRegion>;
  return (
    <SkeletonRegion label="Memuat halaman…" className="flex flex-col gap-4">
      {children}
    </SkeletonRegion>
  );
}

/** Skeleton yang mengikuti DataTable: tabel di ≥ 640px, daftar kartu di HP. */
export function SkeletonDataTable({ headers, rows = 6 }: { headers: readonly string[]; rows?: number }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  return isMobile ? <SkeletonCardList /> : <SkeletonTable headers={headers} rows={rows} />;
}

/** Shared loading body for session dialogs; no separate spinner or pre-modal screen. */
export function SessionDetailSkeleton() {
  return (
    <SkeletonRegion label="Memuat data…" className="flex min-h-80 flex-col gap-5 py-1">
      <Skeleton className="h-6 w-28" />
      <div className="grid grid-cols-2 gap-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full" />
    </SkeletonRegion>
  );
}

/** Admin dashboard: two charts above, three below, matching DashboardCharts. */
export function DashboardChartsSkeleton() {
  const chart = (key: number) => (
    <SkeletonRegion key={key} className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:px-5">
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="px-2 py-4 sm:px-4"><Skeleton className="h-64 w-full" /></div>
    </SkeletonRegion>
  );
  return <>
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-3"><div className="lg:col-span-2">{chart(0)}</div>{chart(1)}</div>
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">{[2, 3, 4].map(chart)}</div>
  </>;
}

export function RecentSessionsSkeleton() {
  return <SkeletonRegion className="divide-y divide-border">
    {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-36" /></div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>)}
  </SkeletonRegion>;
}
