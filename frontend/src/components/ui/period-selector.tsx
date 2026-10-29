import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { periodSchema } from '@mumtaz/contracts';
import { formatPeriod } from '../../lib/format';
import { shiftPeriod } from '../../lib/period';
import { Button } from './button';
import { Input } from './field';

/** Pemilih bulan `YYYY-MM` (berbasis `lesson_date`). */
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
        <Input
          id={id}
          type="month"
          value={value}
          aria-describedby={`${id}-label`}
          className="w-44"
          onChange={(event) => {
            if (periodSchema.safeParse(event.target.value).success) onChange(event.target.value);
          }}
        />
        <Button variant="secondary" size="md" aria-label="Bulan berikutnya" className="px-2.5" onClick={() => onChange(shiftPeriod(value, 1))}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
      <span id={`${id}-label`} className="sr-only">
        {formatPeriod(value)}
      </span>
    </div>
  );
}
