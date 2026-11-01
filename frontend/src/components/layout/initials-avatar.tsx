import { cn } from '../../lib/cn';

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word?.charAt(0) ?? '').join('').toUpperCase() || '?';
}

/**
 * Avatar sementara berisi inisial (docs/design/03-layout.md). Diganti Avatar DiceBear di Tahap 3.
 * Dekoratif: nama selalu ada sebagai teks di dekatnya atau di label tombol.
 */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-primary-subtle text-meta font-semibold text-primary select-none',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
