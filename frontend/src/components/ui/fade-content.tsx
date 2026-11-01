/*
 * Diadaptasi dari ReactBits "Fade Content" (https://reactbits.dev/animations/fade-content),
 * ditulis ulang dengan Motion (`m.*` lewat LazyMotion) alih-alih IntersectionObserver + CSS manual.
 * docs/design/04-components.md: fade + blur 4px→0, 200ms, sekali jalan.
 */
import { m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface FadeContentProps {
  children: ReactNode;
  /** `true`: animasi saat pertama masuk layar. `false` (default): saat dipasang, mis. skeleton → konten. */
  inView?: boolean;
  /** Jeda sebelum mulai, dalam detik. */
  delay?: number;
  className?: string;
}

export function FadeContent({ children, inView = false, delay = 0, className }: FadeContentProps) {
  const reduce = useReducedMotion();
  // Reduced motion: opasitas saja, tanpa blur (blur tetap terasa sebagai gerak).
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' };
  const shown = reduce ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' };
  const transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const, delay };

  return inView ? (
    <m.div className={className} initial={hidden} whileInView={shown} viewport={{ once: true, amount: 0.15 }} transition={transition}>
      {children}
    </m.div>
  ) : (
    <m.div className={className} initial={hidden} animate={shown} transition={transition}>
      {children}
    </m.div>
  );
}
