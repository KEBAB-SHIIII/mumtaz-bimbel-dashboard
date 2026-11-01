import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Kontrol form: 36px desktop, 44px + font 16px di perangkat sentuh/HP (iOS tidak auto-zoom).
 * Batas memakai `border-strong` (≥ 3:1) karena border adalah satu-satunya penanda bentuk kontrol.
 */
const CONTROL =
  'w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text shadow-xs placeholder:text-muted ' +
  'transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none ' +
  'hover:border-text/50 focus-visible:border-primary ' +
  'max-sm:text-base pointer-coarse:text-base ' +
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted ' +
  'aria-[invalid=true]:border-danger';

const CONTROL_HEIGHT = 'h-9 pointer-coarse:h-11';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, CONTROL_HEIGHT, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, CONTROL_HEIGHT, 'pe-8', className)} {...props}>
      {children}
    </select>
  );
}

export interface SearchSelectItem {
  value: string;
  label: string;
  /** Keterangan kedua (mis. kelas & sekolah); ikut dicari. */
  hint?: string;
}

interface SearchSelectProps {
  id: string;
  items: SearchSelectItem[];
  /** Nilai terpilih (`''` = belum memilih). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string | undefined;
}

/**
 * Pilihan dengan pencarian (Headless UI Combobox): ketik untuk menyaring daftar panjang
 * (mis. ratusan murid), panah/Enter untuk memilih. Hanya nilai dari daftar yang dapat dipilih.
 */
export function SearchSelect({ id, items, value, onChange, placeholder, invalid, describedBy }: SearchSelectProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(needle)) : items;
  const selected = items.find((item) => item.value === value) ?? null;

  return (
    <Combobox value={selected} onChange={(item: SearchSelectItem | null) => onChange(item?.value ?? '')} onClose={() => setQuery('')}>
      <div className="relative">
        <ComboboxInput
          id={id}
          className={cn(CONTROL, CONTROL_HEIGHT, 'pe-9')}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          displayValue={(item: SearchSelectItem | null) => item?.label ?? ''}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ComboboxButton aria-label="Tampilkan daftar pilihan" className="absolute inset-y-0 end-0 flex items-center px-2.5 text-muted">
          <ChevronDown aria-hidden className="size-4" />
        </ComboboxButton>
        <ComboboxOptions
          transition
          anchor="bottom start"
          // Anchor = dirender di portal: tidak terpotong kartu/dialog yang `overflow-hidden`.
          className="z-50 max-h-60 w-(--input-width) origin-top [--anchor-gap:0.25rem] overflow-auto overscroll-contain rounded-lg border border-border bg-surface p-1 text-sm shadow-md transition duration-150 ease-out empty:invisible data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none"
        >
          {filtered.length === 0 && <div className="px-3 py-2 text-muted">Tidak ada yang cocok</div>}
          {filtered.map((item) => (
            <ComboboxOption
              key={item.value}
              value={item}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 data-focus:bg-surface-muted pointer-coarse:min-h-11"
            >
              <span>
                <span className="font-medium text-text">{item.label}</span>
                {item.hint && <span className="ms-2 text-meta text-muted">{item.hint}</span>}
              </span>
              {item.value === value && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-2', className)} {...props} />;
}

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

/**
 * Label persisten + penanda wajib/opsional + hint + error di dekat field.
 * Kontrol anak wajib memakai `id`, `aria-describedby={describedBy(id)}`, dan `aria-invalid`.
 */
export function FormField({ id, label, required = false, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}{' '}
        <span className="font-normal text-muted">{required ? '(wajib)' : '(opsional)'}</span>
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-meta text-pretty text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-meta text-pretty text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface CheckboxGroupFieldProps {
  id: string;
  legend: string;
  required?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  options: { value: string; label: string }[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Batas jumlah pilihan; pilihan lain dinonaktifkan saat batas tercapai. */
  max?: number;
  className?: string;
}

/** Pilihan ganda (checkbox) dalam `fieldset` + `legend`, dengan penanda wajib, hint, dan error. */
export function CheckboxGroupField({ id, legend, required = false, hint, error, options, value, onChange, max, className }: CheckboxGroupFieldProps) {
  const full = max !== undefined && value.length >= max;
  const toggle = (option: string, checked: boolean) =>
    onChange(checked ? [...value, option] : value.filter((selected) => selected !== option));

  return (
    <fieldset className={cn('flex flex-col gap-1.5', className)} aria-describedby={describedBy(id, error, hint)} aria-invalid={Boolean(error) || undefined}>
      <legend className="mb-1.5 text-sm font-medium text-text">
        {legend} <span className="font-normal text-muted">{required ? '(wajib)' : '(opsional)'}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-150 pointer-coarse:min-h-11 motion-reduce:transition-none',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
                checked ? 'border-primary bg-primary-subtle font-medium text-text' : 'border-border-strong bg-surface text-text hover:bg-surface-muted',
                !checked && full && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={checked}
                disabled={!checked && full}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-meta text-pretty text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-meta text-pretty text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
