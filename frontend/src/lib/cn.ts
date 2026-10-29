/** Gabungkan class Tailwind kondisional (pengganti ringan `clsx`). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
