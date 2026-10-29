import { CircleAlert, FlaskConical, Inbox, Info, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { DEMO_RATE_LABEL } from '@mumtaz/contracts';
import { toApiError } from '../../lib/api-error';
import { cn } from '../../lib/cn';
import { Button } from './button';

export function LoadingState({ label = 'Memuat data…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted', className)}>
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox aria-hidden className="size-8 text-muted" />
      <p className="font-medium text-text">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

/** Error API dengan pesan aman dari server + tombol coba lagi. */
export function ErrorState({ error, onRetry, title = 'Data gagal dimuat' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { message } = toApiError(error);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <CircleAlert aria-hidden className="size-8 text-danger" />
      <div>
        <p className="font-medium text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
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
const ALERT_TONES: Record<AlertTone, { className: string; icon: typeof Info }> = {
  info: { className: 'border-info/30 bg-info/5 text-text', icon: Info },
  warning: { className: 'border-warning/40 bg-warning/5 text-text', icon: TriangleAlert },
  danger: { className: 'border-danger/40 bg-danger/5 text-text', icon: CircleAlert },
  success: { className: 'border-success/40 bg-success/5 text-text', icon: Info },
};

export function InlineAlert({ tone = 'info', title, children }: { tone?: AlertTone; title?: string; children?: ReactNode }) {
  const config = ALERT_TONES[tone];
  const Icon = config.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border p-3 text-sm', config.className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted">{children}</div>}
      </div>
    </div>
  );
}

/** Label wajib untuk nominal demo (CLAUDE.md §2.7). */
export function DemoRateNotice({ label = DEMO_RATE_LABEL }: { label?: string | null }) {
  if (!label) return null;
  return (
    <p className="inline-flex items-center gap-1.5 rounded-md bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
      <FlaskConical aria-hidden className="size-3.5" />
      {label}
    </p>
  );
}
