/*
 * Diadaptasi dari ReactBits "Spotlight Card" (https://reactbits.dev/components/spotlight-card),
 * ditulis ulang dengan CSS murni + token proyek: posisi kursor disimpan di variabel CSS (tanpa
 * re-render React), cahaya `primary-subtle` hanya di perangkat ber-mouse. docs/design/04-components.md.
 */
import type { HTMLAttributes, PointerEvent } from 'react';
import { cn } from '../../lib/cn';

/**
 * Cahaya dekoratif di bawah konten (z -1 dalam `isolate`); teks tetap di atas latar terang sehingga
 * kontras tidak turun. Tidak aktif di layar sentuh (`pointer-fine`) dan tanpa transisi saat reduced motion.
 */
export const SPOTLIGHT_CLASS = cn(
  'relative isolate overflow-hidden',
  'before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-200',
  'before:bg-[radial-gradient(18rem_circle_at_var(--spot-x,50%)_var(--spot-y,50%),var(--color-primary-subtle),transparent_70%)]',
  'pointer-fine:hover:before:opacity-100 motion-reduce:before:transition-none',
);

/** Simpan posisi kursor di variabel CSS elemen (tanpa re-render). Untuk elemen yang tidak bisa dibungkus, mis. `m.div` di `<dl>`. */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  element.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}

export function SpotlightCard({ className, children, onPointerMove, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      onPointerMove={(event) => {
        onPointerMove?.(event);
        trackSpotlight(event);
      }}
      className={cn(SPOTLIGHT_CLASS, className)}
      {...props}
    >
      {children}
    </div>
  );
}
