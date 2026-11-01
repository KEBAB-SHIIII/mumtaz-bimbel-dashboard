import { ChevronRight, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { CountUp } from './count-up';

export type Accent = 'green' | 'blue' | 'violet' | 'orange' | 'coral';

const BACKGROUNDS: Record<Accent, string> = {
  green: 'to-accent-green-subtle/60',
  blue: 'to-accent-blue-subtle/60',
  violet: 'to-accent-violet-subtle/60',
  orange: 'to-accent-orange-subtle/60',
  coral: 'to-accent-coral-subtle/60',
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
 * Kartu angka ringkasan dengan ikon monokrom. Dipakai di dalam `<dl>`: elemen akar adalah
 * `div` pembungkus pasangan `dt`/`dd`. Dengan `to`, nama tautan = label kartu.
 */
export function StatCard({ label, value, count, hint, to, icon: Icon, accent = 'green', index = 0, className }: StatCardProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface bg-linear-to-br from-surface p-4 shadow-sm sm:p-5',
        BACKGROUNDS[accent],
        to && 'transition-[border-color,box-shadow] duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring hover:border-text/20 hover:shadow-md motion-reduce:transition-none',
        className,
      )}
    >
      <dt className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {Icon && (
          <Icon aria-hidden className="size-4 shrink-0 text-muted" />
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
