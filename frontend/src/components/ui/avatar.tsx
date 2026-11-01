import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * Avatar DiceBear "critters" (CC0), dibuat di browser — tidak ada request ke api.dicebear.com.
 * Seed WAJIB ID internal (UUID akun/murid), bukan ID Akses Orang Tua atau data rahasia lain
 * (docs/design/04-components.md). Library + definisi gaya (~53 KB) dimuat lazy, sekali per sesi.
 */
type AvatarSize = 32 | 40 | 72;

const SIZE_CLASS: Record<AvatarSize, string> = { 32: 'size-8', 40: 'size-10', 72: 'size-18' };

/** Latar pastel dari token aksen, dipilih stabil dari seed. */
const BACKGROUNDS = [
  'bg-accent-green-subtle',
  'bg-accent-blue-subtle',
  'bg-accent-violet-subtle',
  'bg-accent-orange-subtle',
  'bg-accent-coral-subtle',
] as const;

export function backgroundFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BACKGROUNDS[hash % BACKGROUNDS.length] ?? BACKGROUNDS[0];
}

type Renderer = (seed: string) => string;
let rendererPromise: Promise<Renderer> | null = null;
const cache = new Map<string, string>();

/** Muat `@dicebear/core` + `critters.json` sekali; hasil per seed di-cache (avatar deterministik). */
export function loadAvatarRenderer(): Promise<Renderer> {
  rendererPromise ??= Promise.all([import('@dicebear/core'), import('@dicebear/styles/critters.json')]).then(
    ([{ Avatar: DiceBearAvatar, Style }, definition]) => {
      const style = new Style(definition.default);
      return (seed: string) => new DiceBearAvatar(style, { seed, size: 128 }).toDataUri();
    },
  );
  return rendererPromise;
}

export function useAvatarUri(seed: string): string | null {
  const [loaded, setLoaded] = useState<{ seed: string; uri: string } | null>(null);
  const cached = cache.get(seed) ?? null;

  useEffect(() => {
    if (cache.has(seed)) return;
    let active = true;
    loadAvatarRenderer()
      .then((render) => {
        const uri = render(seed);
        cache.set(seed, uri);
        if (active) setLoaded({ seed, uri });
      })
      .catch(() => undefined); // Gagal memuat: lingkaran pastel tetap tampil sebagai pengganti.
    return () => {
      active = false;
    };
  }, [seed]);

  return cached ?? (loaded?.seed === seed ? loaded.uri : null);
}

interface AvatarProps {
  /** ID internal (UUID). Bukan ID Akses Orang Tua. */
  seed: string;
  /** Nama pemilik; dipakai sebagai `alt` bila `decorative` false. */
  name: string;
  size?: AvatarSize;
  /** `true` bila nama sudah tampil di sebelahnya (alt kosong, disembunyikan dari pembaca layar). */
  decorative?: boolean;
  className?: string;
}

export function Avatar({ seed, name, size = 32, decorative = false, className }: AvatarProps) {
  const uri = useAvatarUri(seed);
  return (
    <span
      className={cn('relative inline-block shrink-0 overflow-hidden rounded-full', SIZE_CLASS[size], backgroundFor(seed), className)}
      {...(decorative ? { 'aria-hidden': true } : {})}
    >
      {uri ? (
        <img
          src={uri}
          alt={decorative ? '' : name}
          width={size}
          height={size}
          draggable={false}
          className="size-full rounded-full outline-1 -outline-offset-1 outline-image-outline"
        />
      ) : (
        // Sebelum SVG jadi: lingkaran pastel berdenyut pelan (diam saat reduced motion).
        <span className="block size-full animate-pulse-soft motion-reduce:animate-none" {...(decorative ? {} : { role: 'img', 'aria-label': name })} />
      )}
    </span>
  );
}
