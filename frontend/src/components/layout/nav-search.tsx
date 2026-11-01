import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Role } from '@mumtaz/contracts';
import { cn } from '../../lib/cn';
import { listDestinations, type NavDestination } from './navigation';

/** Huruf kecil tanpa diakritik, agar "honor" cocok dengan "Honor" dan pencarian toleran. */
function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function shortcutLabel() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

/**
 * Pencarian di header: lompat cepat ke halaman mana pun milik role (termasuk submenu).
 * Ctrl/⌘+K membukanya dari mana saja. Bukan pencarian data — pencarian data ada di tiap halaman.
 */
export function NavSearch({ role }: { role: Role }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const destinations = useMemo(() => listDestinations(role), [role]);
  const [shortcut] = useState(shortcutLabel);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const needle = normalize(query.trim());
  const results = needle ? destinations.filter((d) => normalize(`${d.label} ${d.context}`).includes(needle)) : destinations;

  const go = (destination: NavDestination | null) => {
    if (!destination) return;
    close();
    navigate(destination.to);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Cari menu"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => setOpen(true)}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-md text-muted transition-colors duration-150 hover:text-text motion-reduce:transition-none',
          // HP: tombol ikon (44px di layar sentuh). ≥ 768px: kolom pencarian semu dengan pintasan keyboard.
          'max-md:size-10 max-md:justify-center max-md:hover:bg-surface max-md:pointer-coarse:size-11',
          'md:h-9 md:w-60 md:border md:border-border md:bg-surface md:px-2.5 md:hover:border-muted/40 md:pointer-coarse:h-11',
        )}
      >
        <Search aria-hidden className="size-4.5 shrink-0 md:size-4" />
        <span className="hidden flex-1 text-start text-sm md:inline">Cari menu…</span>
        <kbd className="hidden rounded border border-border bg-surface-muted px-1.5 font-sans text-meta text-muted md:inline">{shortcut}</kbd>
      </button>

      <Dialog open={open} onClose={close} className="relative z-50">
        <DialogBackdrop transition className="fixed inset-0 bg-overlay transition-opacity duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none" />
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 pt-[max(1rem,12vh)]">
          <DialogPanel
            transition
            className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-lg transition duration-200 ease-out data-closed:translate-y-2 data-closed:opacity-0 motion-reduce:transition-none"
          >
            <DialogTitle className="sr-only">Cari menu</DialogTitle>
            <Combobox<NavDestination | null> value={null} onChange={go}>
              {/* Indikator fokus pengganti outline: garis bawah 2px hijau saat kolom difokus. */}
              <div className="flex items-center gap-2.5 border-b-2 border-border px-4 transition-colors duration-150 focus-within:border-primary motion-reduce:transition-none">
                <Search aria-hidden className="size-4.5 shrink-0 text-muted" />
                <ComboboxInput
                  autoFocus
                  aria-label="Cari menu"
                  placeholder="Ketik nama halaman, mis. Honor"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-muted focus:outline-none sm:text-sm"
                />
                <kbd className="hidden rounded border border-border bg-surface-muted px-1.5 font-sans text-meta text-muted sm:inline">Esc</kbd>
              </div>
              {results.length > 0 ? (
                <ComboboxOptions static className="max-h-[min(20rem,60dvh)] overflow-y-auto overscroll-contain p-2">
                  {results.map((destination) => (
                    <ComboboxOption
                      key={destination.to}
                      value={destination}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 data-focus:bg-surface-muted"
                    >
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary">
                        <destination.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text">{destination.label}</span>
                        <span className="block truncate text-meta text-muted">{destination.context}</span>
                      </span>
                    </ComboboxOption>
                  ))}
                </ComboboxOptions>
              ) : (
                <p role="status" className="px-4 py-10 text-center text-sm text-pretty text-muted">
                  Tidak ada halaman yang cocok dengan “{query.trim()}”.
                </p>
              )}
            </Combobox>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
