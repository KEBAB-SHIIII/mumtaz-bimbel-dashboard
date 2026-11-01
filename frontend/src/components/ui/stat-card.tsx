import { ChevronRight, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { CountUp } from './count-up';
import { SPOTLIGHT_CLASS, trackSpotlight } from './spotlight-card';

export type Accent = 'green' | 'blue' | 'violet' | 'orange' | 'coral';

/** Kotak ikon pastel (Ref 1): latar `accent-*-subtle` + ikon `accent-*` (≥ 3:1). */
const ACCENTS: Record<Accent, string> = {
  green: 'bg-accent-green-subtle text-accent-green',
  blue: 'bg-accent-blue-subtle text-accent-blue',
  violet: 'bg-accent-violet-subtle text-accent-violet',
  orange: 'bg-accent-orange-subtle text-accent-orange',
  coral: 'bg-accent-coral-subtle text-accent-coral',
};

interface StatCardProps {
  label: string;
  /** Nilai siap tampil. Abaikan bila memakai `count`. */
  value?: ReactNode;
  /** Angka yang dihitung naik sekali (CountUp, 600ms); `format` mis. `formatRupiah`. */
  count?: { value: number; format?: (value: number) => string };
  hint?: ReactNode;
  /** Seluruh kartu menjadi tautan ke data di balik angka (stretched link). */
  to?: string;
  icon?: LucideIcon;
  accent?: Accent;
  /** Urutan di grid: kartu masuk fade + naik 8px dengan stagger 40ms. */
  index?: number;
  /** Mis. `max-sm:col-span-2` untuk nominal Rupiah panjang di grid 2 kolom HP. */
  className?: string;
}

/**
 * Kartu angka ringkasan (Ref 3 + kotak ikon Ref 1). Dipakai di dalam `<dl>`: elemen akar adalah
 * `div` pembungkus pasangan `dt`/`dd`. Dengan `to`, nama tautan = label kartu.
 */
export function StatCard({ label, value, count, hint, to, icon: Icon, accent = 'green', index = 0, className }: StatCardProps) {
  return (
    <m.div
      onPointerMove={trackSpotlight}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className={cn(
        SPOTLIGHT_CLASS,
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5',
        to && 'transition-[border-color,box-shadow] duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring hover:border-text/20 hover:shadow-md motion-reduce:transition-none',
        className,
      )}
    >
      <dt className="flex items-center gap-2.5 text-sm font-medium text-muted">
        {Icon && (
          <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full', ACCENTS[accent])}>
            <Icon className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {to ? (
            <Link to={to} className="outline-none after:absolute after:inset-0 after:rounded-[inherit]">
              {label}
            </Link>
          ) : (
            label
          )}
        </span>
        {to && <ChevronRight aria-hidden className="size-4 shrink-0" />}
      </dt>
      <dd className="text-stat-mobile [overflow-wrap:anywhere] text-text tabular-nums sm:text-stat">
        {count ? <CountUp value={count.value} {...(count.format ? { format: count.format } : {})} /> : value}
      </dd>
      {hint && <dd className="relative -mt-1.5 text-meta text-muted">{hint}</dd>}
    </m.div>
  );
}
