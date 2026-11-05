// Adapted from BoardUI Chip: https://www.boardui.com/components/chip
// Uses local UI tokens (styles/tokens.css) and the local `cn` helper.

import type { HTMLAttributes, Ref } from 'react';
import { cn as cx } from '../../../lib/cn';

/**
 * Colored label chip. Three emphasis levels, all rounded 6px, px 6:
 *
 *   bold    py 2, 14/20/500 — status + percentage deltas
 *   subtle  py 4, 14/20/500 — values (price, counts)
 *   caption py 4, 12/16/500, tracking .15 — tags
 */
export type ChipVariant = 'bold' | 'subtle' | 'caption';
export type ChipColor = 'orange' | 'lime' | 'rose' | 'yellow' | 'cyan' | 'blue' | 'purple' | 'neutral' | 'gray' | 'soft';

/** Background and text pair per colour. */
export const CHIP_COLORS: Record<ChipColor, string> = {
  orange: 'bg-status-orange-background text-status-orange-text',
  lime: 'bg-status-lime-background text-status-lime-text',
  rose: 'bg-status-rose-background text-status-rose-text',
  yellow: 'bg-status-yellow-background text-status-yellow-text',
  cyan: 'bg-status-cyan-background text-status-cyan-text',
  blue: 'bg-status-blue-background text-status-blue-text',
  purple: 'bg-status-purple-background text-status-purple-text',
  neutral: 'bg-border text-muted',
  gray: 'bg-surface-muted text-text',
  soft: 'bg-surface-muted text-muted',
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  color?: ChipColor;
  ref?: Ref<HTMLSpanElement>;
}

const styles = {
  base: 'inline-flex shrink-0 items-center justify-center gap-1 rounded-[0.375rem] px-1.5 whitespace-nowrap tabular-nums transition-[padding,font-size] duration-200 ease-out',
  variant: {
    bold: 'py-0.5 text-sm/5 font-medium',
    subtle: 'py-1 text-sm/5 font-medium',
    caption: 'py-1 text-xs/4 font-medium tracking-[0.15px]',
  } satisfies Record<ChipVariant, string>,
  color: CHIP_COLORS,
};

export function Chip({ variant = 'bold', color = 'neutral', className, ref, ...props }: ChipProps) {
  return <span ref={ref} className={cx(styles.base, styles.variant[variant], styles.color[color], className)} {...props} />;
}
