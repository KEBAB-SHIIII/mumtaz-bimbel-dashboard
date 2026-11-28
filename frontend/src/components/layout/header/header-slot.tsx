import { createContext, useContext } from 'react';

/**
 * Slot layout tingkat `AppShell` (docs/design/03-layout.md):
 * - `title` & `actions`: dirender oleh halaman lewat portal agar tampil di header aplikasi.
 * - `rightPanel`: slot sidebar kanan terluar (desktop ≥ 1024px), sejajar dengan sidebar kiri
 *   dan area utama sehingga panel detail (mis. ringkasan tutor) tidak terjepit di dalam kartu.
 *
 * Di luar `AppShell` (mis. halaman login), context bernilai `null`.
 */
export interface HeaderSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  rightPanel: HTMLElement | null;
}

export const HeaderSlotContext = createContext<HeaderSlots | null>(null);

export function useHeaderSlots() {
  return useContext(HeaderSlotContext);
}
