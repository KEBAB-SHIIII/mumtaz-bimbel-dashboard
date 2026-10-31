import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted ' +
  'aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-10', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-10 pr-8', className)} {...props}>
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
          className={cn(CONTROL, 'h-10 pr-9')}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          displayValue={(item: SearchSelectItem | null) => item?.label ?? ''}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ComboboxButton aria-label="Tampilkan daftar pilihan" className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted">
          <ChevronDown aria-hidden className="size-4" />
        </ComboboxButton>
        <ComboboxOptions
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-md empty:invisible"
        >
          {filtered.length === 0 && <div className="px-3 py-2 text-muted">Tidak ada yang cocok</div>}
          {filtered.map((item) => (
            <ComboboxOption
              key={item.value}
              value={item}
              className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 data-focus:bg-surface-muted"
            >
              <span>
                <span className="font-medium text-text">{item.label}</span>
                {item.hint && <span className="ml-2 text-xs text-muted">{item.hint}</span>}
              </span>
              {item.value === value && <Check aria-hidden className="size-4 shrink-0" />}
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
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
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
