import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { periodSchema, type Period } from '@mumtaz/contracts';
import { formatPeriod } from '../../lib/format';
import { currentPeriod, shiftPeriod } from '../../lib/period';

/** Rentang pilihan: 2 tahun ke belakang s.d. akhir tahun depan, terbaru di atas. */
function periodOptions(value: Period): Period[] {
  const year = Number(currentPeriod().slice(0, 4));
  const options: Period[] = [];
  for (let period = `${year + 1}-12`; period >= `${year - 2}-01`; period = shiftPeriod(period, -1)) options.push(period);
  // Periode di luar rentang (mis. dari URL) tetap dapat ditampilkan.
  if (!options.includes(value)) options.push(value);
  return options.sort().reverse();
}

/**
 * Pemilih bulan `YYYY-MM` (berbasis `lesson_date`). Memakai `<select>` berlabel bahasa Indonesia
 * ("Oktober 2026") — konsisten di semua browser, berbeda dengan `type="month"` yang mengikuti
 * bahasa browser dan tidak didukung Safari desktop.
 */
export function PeriodSelector({ value, onChange }: { value: string; onChange: (period: string) => void }) {
  const id = useId();
  const stepClass =
    'grid w-9 shrink-0 place-items-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-text pointer-coarse:w-11 focus-visible:-outline-offset-2 motion-reduce:transition-none';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        Periode
      </label>
      {/* Satu kontrol tersegmentasi (Ref 2): ‹ bulan › dengan batas bersama. */}
      <div className="flex h-9 w-fit items-stretch overflow-hidden rounded-md border border-border-strong bg-surface shadow-xs pointer-coarse:h-[2.875rem]">
        <button type="button" aria-label="Bulan sebelumnya" className={stepClass} onClick={() => onChange(shiftPeriod(value, -1))}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <select
          id={id}
          value={value}
          className="w-40 border-x border-border bg-transparent px-3 text-sm font-medium text-text tabular-nums focus-visible:-outline-offset-2 max-sm:text-base pointer-coarse:text-base"
          onChange={(event) => {
            if (periodSchema.safeParse(event.target.value).success) onChange(event.target.value);
          }}
        >
          {periodOptions(value).map((period) => (
            <option key={period} value={period}>
              {formatPeriod(period)}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Bulan berikutnya" className={stepClass} onClick={() => onChange(shiftPeriod(value, 1))}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
