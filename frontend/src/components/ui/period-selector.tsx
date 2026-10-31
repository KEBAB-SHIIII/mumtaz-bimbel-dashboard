import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { periodSchema, type Period } from '@mumtaz/contracts';
import { formatPeriod } from '../../lib/format';
import { currentPeriod, shiftPeriod } from '../../lib/period';
import { Button } from './button';
import { Select } from './field';

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
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        Periode
      </label>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="md" aria-label="Bulan sebelumnya" className="px-2.5" onClick={() => onChange(shiftPeriod(value, -1))}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Select
          id={id}
          value={value}
          className="w-44"
          onChange={(event) => {
            if (periodSchema.safeParse(event.target.value).success) onChange(event.target.value);
          }}
        >
          {periodOptions(value).map((period) => (
            <option key={period} value={period}>
              {formatPeriod(period)}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="md" aria-label="Bulan berikutnya" className="px-2.5" onClick={() => onChange(shiftPeriod(value, 1))}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}
