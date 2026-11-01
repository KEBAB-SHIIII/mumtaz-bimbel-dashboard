import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Slot di header AppShell (docs/design/03-layout.md): judul halaman dan aksi utama dirender
 * halaman, tetapi tampil di header. Di luar AppShell (mis. halaman login) context bernilai null.
 */
export interface HeaderSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
}

export const HeaderSlotContext = createContext<HeaderSlots | null>(null);

export function useHeaderSlots() {
  return useContext(HeaderSlotContext);
}

/** Aksi utama halaman di header (desktop). Di bawah 1024px slot disembunyikan; sediakan alternatif di isi halaman. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slots = useHeaderSlots();
  return slots?.actions ? createPortal(children, slots.actions) : null;
}
