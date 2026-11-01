import { CircleAlert, CircleCheck, Inbox, Info, LoaderCircle, RotateCcw, SearchX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toApiError } from '../../lib/api-error';
import { cn } from '../../lib/cn';
import { Button } from './button';

export function LoadingState({ label = 'Memuat data…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted', className)}>
      <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}

/** Ikon status dalam kotak pastel (Ref 1), dipakai empty & error state. */
function StateIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span aria-hidden className={cn('grid size-12 place-items-center rounded-lg', className)}>
      <Icon className="size-6" />
    </span>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, action, icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <StateIcon icon={icon} className="bg-primary-subtle text-primary" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-balance text-text">{title}</p>
        {description && <p className="max-w-md text-sm text-pretty text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Hasil pencarian/filter kosong: sebut kata kuncinya dan beri jalan keluar (reset filter). */
export function NoResultsState({ query, onReset }: { query?: string | undefined; onReset: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Tidak ada hasil"
      description={query ? `Tidak ada hasil untuk “${query}” dengan filter ini.` : 'Tidak ada data yang cocok dengan filter yang dipilih.'}
      action={
        <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={onReset}>
          Reset filter
        </Button>
      }
    />
  );
}

/** Error API dengan pesan aman dari server + tombol coba lagi. */
export function ErrorState({ error, onRetry, title = 'Data gagal dimuat' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { message } = toApiError(error);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <StateIcon icon={CircleAlert} className="bg-danger-subtle text-danger" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-balance text-text">{title}</p>
        <p className="max-w-md text-sm text-pretty text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

type AlertTone = 'info' | 'warning' | 'danger' | 'success';

/** Latar `-subtle` + ikon warna status; judul & isi memakai teks netral (kontras ≥ 4.5:1). */
const ALERT_TONES: Record<AlertTone, { className: string; icon: LucideIcon; iconClass: string }> = {
  info: { className: 'bg-info-subtle ring-info/20', icon: Info, iconClass: 'text-info' },
  warning: { className: 'bg-warning-subtle ring-warning/25', icon: TriangleAlert, iconClass: 'text-warning' },
  danger: { className: 'bg-danger-subtle ring-danger/20', icon: CircleAlert, iconClass: 'text-danger' },
  success: { className: 'bg-success-subtle ring-success/20', icon: CircleCheck, iconClass: 'text-success' },
};

export function InlineAlert({ tone = 'info', title, children }: { tone?: AlertTone; title?: string; children?: ReactNode }) {
  const config = ALERT_TONES[tone];
  const Icon = config.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg p-3 text-sm text-text ring-1 ring-inset', config.className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', config.iconClass)} />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-pretty text-text/80">{children}</div>}
      </div>
    </div>
  );
}
