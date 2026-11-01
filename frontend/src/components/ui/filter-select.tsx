import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  /** Nama filter, mis. "Validitas". Selalu tampil di chip dan menjadi awal nama aksesibel tombol. */
  label: string;
  /** `''` = semua (filter tidak aktif). */
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  /** Label opsi "semua", mis. "Semua tutor". Tanpa ini, chip menjadi pemilih tunggal (selalu ada nilai). */
  allLabel?: string;
  className?: string;
}

/** Opsi pertama yang distagger; daftar panjang (mis. siswa) sisanya muncul tanpa jeda agar tetap cepat. */
const STAGGERED = 10;

/**
 * Filter ringkas berbentuk chip (Headless UI Listbox): `Validitas` saat semua, `Validitas: Perlu revisi` saat
 * aktif (latar hijau lembut). Panel opsi muncul dengan scale + fade dan opsinya masuk berurutan (keyframe
 * `fade-up`, ala ReactBits Animated List). Keyboard: Enter/Spasi membuka, panah memilih, ketik untuk lompat.
 */
export function FilterSelect({ label, value, onChange, options, allLabel, className }: FilterSelectProps) {
  const selected = options.find((option) => option.value === value);
  const items: FilterOption[] = allLabel === undefined ? [...options] : [{ value: '', label: allLabel }, ...options];
  // Chip disorot hijau hanya bila filter benar-benar menyaring (bukan pemilih tunggal).
  const active = Boolean(selected) && allLabel !== undefined;

  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton
        className={cn(
          'group inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap shadow-xs',
          'transition-[background-color,border-color,color,scale] duration-150 ease-out enabled:active:scale-[0.96] motion-reduce:transition-none',
          'pointer-coarse:h-11 pointer-coarse:px-4 data-open:border-primary',
          active ? 'border-primary/40 bg-primary-subtle text-text' : 'border-border-strong bg-surface text-muted hover:border-text/50 hover:text-text',
          className,
        )}
      >
        <span className={cn(selected && 'text-muted')}>
          {label}
          {selected && <span aria-hidden>:</span>}
        </span>
        {selected && (
          <>
            <span key={selected.value} className="max-w-40 truncate font-medium text-text animate-pop-in motion-reduce:animate-none">
              {selected.label}
            </span>
          </>
        )}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none" />
      </ListboxButton>
      <ListboxOptions
        anchor="bottom start"
        transition
        className={cn(
          'z-50 max-h-72 min-w-(--button-width) overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface p-1 shadow-md [--anchor-gap:0.375rem] focus:outline-none',
          'origin-top transition duration-180 ease-out data-closed:-translate-y-1 data-closed:scale-95 data-closed:opacity-0 data-leave:duration-120 data-leave:ease-in motion-reduce:transition-none',
          'sm:min-w-48',
        )}
      >
        {items.map((option, index) => (
          <ListboxOption
            key={option.value || 'all'}
            value={option.value}
            style={index < STAGGERED ? { animationDelay: `${index * 18}ms` } : undefined}
            className={cn(
              'group flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-text select-none data-focus:bg-surface-muted pointer-coarse:min-h-11',
              index < STAGGERED && 'animate-fade-up motion-reduce:animate-none',
              option.value === '' && 'text-muted',
            )}
          >
            <span className="truncate">{option.label}</span>
            <Check aria-hidden className="invisible size-4 shrink-0 text-primary group-data-selected:visible" />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
