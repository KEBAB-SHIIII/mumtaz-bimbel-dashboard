import { createContext, useContext } from 'react';

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

