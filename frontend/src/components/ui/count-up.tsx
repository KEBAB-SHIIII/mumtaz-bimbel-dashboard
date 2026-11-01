/*
 * Diadaptasi dari ReactBits "Count Up" (https://reactbits.dev/text-animations/count-up),
 * ditulis ulang tanpa spring Motion: requestAnimationFrame + ease-out 600ms, sekali saja saat
 * pertama terlihat. Pembaca layar langsung menerima nilai akhir. docs/design/04-components.md.
 */
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

const DURATION_MS = 600;
const integerFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Ease-out kubik: cepat di awal, melambat menuju nilai akhir. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface CountUpProps {
  value: number;
  /** Format tampilan, mis. `formatRupiah`. Default angka bulat `id-ID` (1.250). */
  format?: (value: number) => string;
  className?: string;
}

export function CountUp({ value, format = (n) => integerFormat.format(n), className }: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // Mulai dari 0 hanya bila animasi benar-benar akan berjalan; selain itu langsung nilai akhir (tanpa kedip).
  const [display, setDisplay] = useState<number | null>(() =>
    !reduce && typeof IntersectionObserver !== 'undefined' ? 0 : null,
  );
  const played = useRef(false);

  useEffect(() => {
    const element = ref.current;
    // Sudah pernah berjalan, reduced motion, atau tanpa IntersectionObserver: tampilkan nilai akhir apa adanya.
    if (played.current || reduce || !element || typeof IntersectionObserver === 'undefined') return;

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        played.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / DURATION_MS);
          setDisplay(progress >= 1 ? null : value * easeOut(progress));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, reduce]);

  const finalText = format(value);
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span className="sr-only">{finalText}</span>
      <span aria-hidden>{reduce || display === null ? finalText : format(Math.round(display))}</span>
    </span>
  );
}
