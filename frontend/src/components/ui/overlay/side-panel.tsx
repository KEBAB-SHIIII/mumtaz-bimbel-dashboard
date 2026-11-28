import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../lib/cn';
import { useHeaderSlots } from '../../layout/header/header-slot';
import { Button } from '../actions/button';

/** Breakpoint desktop yang sama dengan AppShell (`lg` = 1024px). */
const DESKTOP_PANEL_QUERY = '(min-width: 64rem)';

function subscribeDesktopQuery(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const media = window.matchMedia(DESKTOP_PANEL_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getDesktopSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DESKTOP_PANEL_QUERY).matches;
}

/**
 * Mengembalikan `true` saat lebar viewport ≥ 1024px (`lg`).
 * Memakai `useSyncExternalStore` agar sinkron dengan resize layar tanpa flicker state awal.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktopQuery, getDesktopSnapshot, () => false);
}

export interface SidePanelSharedProps {
  /** Judul utama panel (menjadi accessible name panel). */
  title: string;
  /** Subjudul ringkas di bawah judul (mis. tanggal · mata pelajaran). */
  description?: string | undefined;
  /** Konten utama panel yang bisa di-scroll secara independen. */
  children: ReactNode;
  /** Aksi bawah yang menempel di dasar panel (mis. navigasi Sebelumnya / Berikutnya). */
  footer?: ReactNode | undefined;
  /** Callback penutup panel (tombol `×`, `Esc`, atau klik luar pada mode drawer). */
  onClose: () => void;
  /** Label tombol tutup untuk screen reader. */
  closeLabel?: string;
}

export interface SideDrawerProps extends SidePanelSharedProps {
  open: boolean;
  /** Lebar maksimum drawer di layar lebar. Default `'md'` (`max-w-lg`). */
  size?: 'md' | 'lg';
}

/**
 * Drawer geser dari tepi kanan berbasis Headless UI `Dialog`.
 *
 * Dipakai pada layar < 1024px (mobile/tablet) ketika ruang horizontal belum cukup untuk
 * menempatkan sidebar kanan berdampingan dengan area konten utama.
 * `overscroll-contain` pada area konten mencegah scroll di dalam drawer ikut menggulir
 * halaman di belakangnya.
 */
export function SideDrawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Tutup panel',
}: SideDrawerProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-overlay transition-opacity duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex justify-end">
        <DialogPanel
          transition
          className={cn(
            'flex h-dvh w-full flex-col bg-surface shadow-xl ring-1 ring-black/8',
            'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pe-[env(safe-area-inset-right)]',
            'transition duration-250 ease-out data-closed:translate-x-full data-leave:duration-200 data-leave:ease-in motion-reduce:transition-none',
            size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-lg',
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 pt-4 pb-3.5">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-balance text-text">
                {title}
              </DialogTitle>
              {description && (
                <Description className="mt-1 text-sm text-pretty text-muted">
                  {description}
                </Description>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={closeLabel}
              className="-me-1.5 -mt-1 shrink-0"
              onClick={onClose}
            >
              <X aria-hidden className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>

          {footer && (
            <footer className="shrink-0 border-t border-border bg-surface-muted/40 px-5 py-3">
              {footer}
            </footer>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export interface DockedSidePanelProps extends SidePanelSharedProps {
  /** ID HTML opsional untuk dihubungkan lewat `aria-controls` dari kartu pemicu. */
  id?: string | undefined;
  /** Kelas tambahan untuk penyesuaian lebar bila diperlukan. */
  className?: string | undefined;
}

/**
 * Panel samping non-modal (`<aside>`) di slot kanan `AppShell` untuk desktop (`≥ 1024px`).
 *
 * Dirender lewat React Portal ke slot `rightPanel` tepat di bawah header dashboard sehingga:
 * - Tepi atas dan gaya bingkai (`rounded-xl border shadow-sm`) sejajar persis dengan frame utama,
 *   tidak memotong atau menempel pada header dashboard.
 * - Tetap berada di luar `<main>` dan div kartu — ruang baca lega serta tidak menimpa kartu.
 * - Memakai `<aside>` (bukan `<dialog>` / `role="dialog"`) karena halaman tetap interaktif
 *   sehingga pengguna bebas mengklik kartu sesi lain untuk langsung mengganti isi panel.
 *
 * Mendukung penutupan via tombol `Esc` dengan ref handler stabil agar listener tidak
 * dipasang-lepas setiap render.
 */
export function DockedSidePanel({
  id,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = 'Tutup panel',
  className,
}: DockedSidePanelProps) {
  const titleId = useId();
  const rightPanelSlot = useHeaderSlots()?.rightPanel ?? null;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const panel = (
    <m.aside
      id={id}
      aria-labelledby={titleId}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm',
        rightPanelSlot
          ? // Mode utama (di bawah header AppShell): tinggi penuh mengikuti slot sejajar frame utama.
            'h-full w-[25rem] xl:w-[27rem]'
          : // Fallback aman bila komponen dipakai di luar AppShell (mis. unit test terisolasi).
            'lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)]',
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pt-4 pb-3.5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-balance text-text">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-pretty text-muted">{description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={closeLabel}
          className="-me-1.5 -mt-0.5 shrink-0"
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {children}
      </div>

      {footer && (
        <footer className="shrink-0 border-t border-border bg-surface-muted/40 px-5 py-3">
          {footer}
        </footer>
      )}
    </m.aside>
  );

  return rightPanelSlot ? createPortal(panel, rightPanelSlot) : panel;
}
