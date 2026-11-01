import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  secondary: 'border border-border bg-surface text-text shadow-sm hover:bg-surface-muted',
  danger: 'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90',
  ghost: 'text-text hover:bg-surface-muted',
};

/** 36px desktop (`sm` 32px); minimal 44px di perangkat sentuh (docs/design/02-tokens.md). */
const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm pointer-coarse:h-11',
  md: 'h-9 gap-2 px-3.5 text-sm pointer-coarse:h-11',
  icon: 'size-9 pointer-coarse:size-11',
  'icon-sm': 'size-8 pointer-coarse:size-11',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Matikan efek tekan (`scale 0.96`) di tempat yang geraknya mengganggu. */
  static?: boolean;
}

/**
 * Tombol dengan state loading: otomatis disabled agar tidak terjadi double submit. Saat loading,
 * isi tetap di tempat (opacity 0, jadi nama aksesibel tetap ada) dan spinner ditumpuk di tengah, jadi lebar tombol tidak berubah.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  static: isStatic = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,scale] duration-150 ease-out motion-reduce:transition-none',
        !isStatic && 'enabled:active:scale-[0.96]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      <span className={cn('inline-flex items-center justify-center gap-[inherit]', loading && 'opacity-0')}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        </span>
      )}
    </button>
  );
}
