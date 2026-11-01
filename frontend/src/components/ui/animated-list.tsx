/*
 * Diadaptasi dari ReactBits "Animated List" (https://reactbits.dev/components/animated-list),
 * ditulis ulang tanpa scroll gradient/keyboard nav bawaan: hanya entrance item yang ringan,
 * memakai Motion (`m.*` lewat LazyMotion) dan token proyek. docs/design/04-components.md.
 */
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Hanya 10 item pertama yang distagger 20ms; sisanya tampil tanpa animasi agar daftar panjang tidak terasa lambat. */
const MAX_STAGGERED = 10;
const STAGGER_SECONDS = 0.02;

export function itemEnter(index: number) {
  if (index >= MAX_STAGGERED) return { initial: false as const };
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const, delay: index * STAGGER_SECONDS },
  };
}

interface AnimatedListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
  /** Nama daftar untuk pembaca layar (opsional). */
  'aria-label'?: string;
}

/**
 * Daftar yang itemnya muncul berurutan (fade + naik 6px). Item yang sudah tampil tidak dianimasikan
 * ulang saat daftar berubah; item baru masuk dengan efek yang sama. Reduced motion: hanya fade.
 */
export function AnimatedList<T>({ items, getKey, renderItem, className, itemClassName, 'aria-label': ariaLabel }: AnimatedListProps<T>) {
  return (
    <ul aria-label={ariaLabel} className={cn('flex flex-col', className)}>
      {items.map((item, index) => (
        <m.li key={getKey(item)} className={itemClassName} {...itemEnter(index)}>
          {renderItem(item, index)}
        </m.li>
      ))}
    </ul>
  );
}
