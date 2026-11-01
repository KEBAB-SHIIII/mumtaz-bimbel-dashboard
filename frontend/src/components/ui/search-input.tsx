import { Search, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const DEBOUNCE_MS = 250;

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Nilai yang sudah diterapkan (mis. dari URL). */
  value: string;
  /** Dipanggil 250ms setelah berhenti mengetik, atau langsung saat dihapus / Enter. */
  onChange: (value: string) => void;
  /** Nama aksesibel bila tidak ada `<label>` terlihat. */
  'aria-label'?: string;
}

/** Ikon tombol hapus muncul/hilang dengan scale 0.25→1, opacity, blur 4px→0 (spring 0.3s, tanpa bounce). */
const ICON_IN = { opacity: 1, scale: 1, filter: 'blur(0px)' };
const ICON_OUT = { opacity: 0, scale: 0.25, filter: 'blur(4px)' };

/** Kolom pencarian: ikon kiri, tombol hapus (×), debounce 250ms. Escape mengosongkan. */
export function SearchInput({ value, onChange, className, placeholder = 'Cari…', ...props }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Nilai dari luar berubah (mis. tombol "reset filter" / navigasi): ikuti tanpa memicu onChange.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next: string) => {
    clearTimeout(timer.current);
    if (next !== value) onChange(next);
  };

  const clear = () => {
    setDraft('');
    commit('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          clearTimeout(timer.current);
          if (next === '') commit('');
          else timer.current = setTimeout(() => commit(next.trim()), DEBOUNCE_MS);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft.trim());
          if (event.key === 'Escape' && draft !== '') {
            event.preventDefault();
            clear();
          }
        }}
        className={cn(
          'h-9 w-full rounded-md border border-border-strong bg-surface ps-9 pe-9 text-sm text-text shadow-xs placeholder:text-muted',
          'transition-[border-color] duration-150 hover:border-text/50 focus-visible:border-primary motion-reduce:transition-none',
          'max-sm:text-base pointer-coarse:h-11 pointer-coarse:text-base',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...props}
      />
      <AnimatePresence initial={false}>
        {draft !== '' && (
          <m.button
            key="clear"
            type="button"
            aria-label="Hapus pencarian"
            onClick={clear}
            initial={ICON_OUT}
            animate={ICON_IN}
            exit={ICON_OUT}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="absolute end-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-[0.375rem] text-muted hover:bg-surface-muted hover:text-text pointer-coarse:size-9"
          >
            <X aria-hidden className="size-4" />
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}
