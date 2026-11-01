import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { FadeContent } from './fade-content';

/** Skeleton baru muncul bila loading > 150ms, lalu bertahan minimal 300ms (docs/design/04-components.md). */
export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_VISIBLE_MS = 300;

/**
 * Menunda & menahan skeleton: `false` selama 150ms pertama loading (request cepat tidak berkedip), lalu `true`
 * minimal 300ms walau data sudah datang (transisi tidak terasa patah).
 */
export function useDelayedSkeleton(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

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
  skeleton: ReactNode;
  /** Dipanggil hanya setelah loading selesai, jadi aman membaca data. */
  children: () => ReactNode;
}

/**
 * Skeleton → konten tanpa kedip: < 150ms tidak menampilkan apa pun, lalu skeleton (minimal 300ms),
 * lalu konten memudar masuk 200ms di posisi yang sama.
 */
export function LoadingSwitch({ loading, skeleton, children }: LoadingSwitchProps) {
  const showSkeleton = useDelayedSkeleton(loading);
  const state = showSkeleton ? 'skeleton' : loading ? 'waiting' : 'content';
  return (
    // popLayout: skeleton yang keluar ditumpuk di posisinya sementara konten masuk, tanpa lompatan layout.
    <AnimatePresence mode="popLayout" initial={false}>
      {state === 'skeleton' && (
        <m.div key="skeleton" exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}>
          {skeleton}
        </m.div>
      )}
      {state === 'waiting' && (
        <SkeletonRegion key="waiting">
          <span />
        </SkeletonRegion>
      )}
      {state === 'content' && (
        <FadeContent key="content">{children()}</FadeContent>
      )}
    </AnimatePresence>
  );
}

/* ── Varian siap pakai, bentuk mengikuti konten asli ─────────────────────────────── */

function CardFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5', className)}>{children}</div>;
}

/** 4 kartu statistik (2 di HP): kotak ikon + label + angka. */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <SkeletonRegion className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <CardFrame key={index} className={cn('flex flex-col gap-3', index >= 2 && 'max-sm:hidden')}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-6 w-32" />
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

/** Fallback rute lazy (`Suspense`): kerangka halaman generik, muncul setelah 150ms agar navigasi cepat tidak berkedip. */
export function PageSkeleton() {
  const visible = useDelayedSkeleton(true);
  if (!visible) return <SkeletonRegion label="Memuat halaman…"><span /></SkeletonRegion>;
  return (
    <SkeletonRegion label="Memuat halaman…" className="flex flex-col gap-4">
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={cn('flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5', index >= 2 && 'max-sm:hidden')}>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </SkeletonRegion>
  );
}
