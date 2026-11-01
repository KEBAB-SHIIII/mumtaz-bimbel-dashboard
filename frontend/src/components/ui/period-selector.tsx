import { Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
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
 * Pemilih bulan `YYYY-MM` (berbasis `lesson_date`): ‹ bulan › dengan daftar bulan berbahasa Indonesia
 * ("Oktober 2026") di panel Listbox beranimasi — konsisten di semua browser, berbeda dengan
 * `type="month"` yang mengikuti bahasa browser dan tidak didukung Safari desktop.
 */
export function PeriodSelector({ value, onChange, hideLabel = false }: { value: string; onChange: (period: string) => void; hideLabel?: boolean }) {
  const stepClass =
    'grid w-9 shrink-0 place-items-center text-muted transition-[background-color,color] duration-150 hover:bg-surface-muted hover:text-text active:bg-surface-muted pointer-coarse:w-11 focus-visible:-outline-offset-2 motion-reduce:transition-none';
  const options = periodOptions(value);
  return (
    <Field className="flex flex-col gap-1.5">
      <Label className={cn('text-sm font-medium text-text', hideLabel && 'sr-only')}>Periode</Label>
      {/* Satu kontrol tersegmentasi (Ref 2): ‹ bulan › dengan batas bersama. */}
      <div className="flex h-9 w-fit items-stretch overflow-hidden rounded-md border border-border-strong bg-surface shadow-xs pointer-coarse:h-[2.875rem]">
        <button type="button" aria-label="Bulan sebelumnya" className={stepClass} onClick={() => onChange(shiftPeriod(value, -1))}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <Listbox
          value={value}
          onChange={(next: string) => {
            if (periodSchema.safeParse(next).success) onChange(next);
          }}
        >
          <ListboxButton className="group flex w-32 items-center justify-center gap-2 border-x border-border px-2.5 text-sm font-medium whitespace-nowrap text-text tabular-nums transition-colors duration-150 hover:bg-surface-muted focus-visible:-outline-offset-2 data-open:bg-surface-muted sm:w-40 sm:justify-between sm:px-3 motion-reduce:transition-none">
            <span key={value} className="animate-pop-in motion-reduce:animate-none">{formatPeriod(value)}</span>
            <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted max-sm:hidden transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none" />
          </ListboxButton>
          <ListboxOptions
            anchor="bottom"
            transition
            className="z-50 max-h-72 w-(--button-width) min-w-44 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface p-1 shadow-md [--anchor-gap:0.375rem] focus:outline-none origin-top transition duration-180 ease-out data-closed:-translate-y-1 data-closed:scale-95 data-closed:opacity-0 data-leave:duration-120 data-leave:ease-in motion-reduce:transition-none"
          >
            {options.map((period) => (
              <ListboxOption
                key={period}
                value={period}
                className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-text tabular-nums select-none data-focus:bg-surface-muted data-selected:font-medium pointer-coarse:min-h-11"
              >
                {formatPeriod(period)}
                <Check aria-hidden className="invisible size-4 shrink-0 text-primary group-data-selected:visible" />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
        <button type="button" aria-label="Bulan berikutnya" className={stepClass} onClick={() => onChange(shiftPeriod(value, 1))}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </Field>
  );
}
