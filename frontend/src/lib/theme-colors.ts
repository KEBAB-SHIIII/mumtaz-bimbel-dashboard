import { useSyncExternalStore } from 'react';

/**
 * Warna token untuk atribut SVG (Recharts tidak membaca `var()` di atribut presentasi). Nilai dibaca dari
 * tokens.css saat runtime, jadi tokens.css tetap satu-satunya sumber warna. Fallback hanya untuk jsdom.
 */
const TOKENS = {
  primary: '--color-primary',
  coral: '--color-accent-coral',
  border: '--color-border',
  muted: '--color-muted',
  text: '--color-text',
  surfaceMuted: '--color-surface-muted',
} as const;

export type ThemeColors = Record<keyof typeof TOKENS, string>;

const FALLBACK = Object.fromEntries(Object.keys(TOKENS).map((key) => [key, 'currentColor'])) as ThemeColors;
let cached: ThemeColors | null = null;

/** Snapshot stabil: objek yang sama dikembalikan selama nilainya belum terbaca/berubah. */
function read(): ThemeColors {
  if (cached) return cached;
  if (typeof document === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([key, variable]) => [key, style.getPropertyValue(variable).trim()]);
  // Token belum terbaca (CSS belum dimuat / jsdom): pakai fallback tanpa menyimpan.
  if (entries.some(([, value]) => !value)) return FALLBACK;
  cached = Object.fromEntries(entries) as ThemeColors;
  return cached;
}

const noop = () => () => undefined;

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(noop, read, read);
}
