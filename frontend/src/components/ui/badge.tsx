import {
  CircleCheck,
  CircleX,
  Clock,
  FlaskConical,
  PencilLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionStatus } from '@mumtaz/contracts';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
};

export function Badge({ tone = 'neutral', icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone])}>
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

/** Status sesi selalu berupa teks + ikon, tidak mengandalkan warna saja (docs/07 §6). */
const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  pending: { label: 'Menunggu verifikasi', tone: 'warning', icon: Clock },
  approved: { label: 'Disetujui', tone: 'success', icon: CircleCheck },
  revision_requested: { label: 'Perlu revisi', tone: 'info', icon: PencilLine },
  rejected: { label: 'Ditolak', tone: 'danger', icon: CircleX },
};

export const SESSION_STATUS_LABELS = Object.fromEntries(
  Object.entries(SESSION_STATUS).map(([key, value]) => [key, value.label]),
) as Record<SessionStatus, string>;

export function StatusBadge({ status }: { status: SessionStatus }) {
  const config = SESSION_STATUS[status];
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

export function FindingIndicator({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge tone="warning" icon={TriangleAlert}>
      {count} temuan
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="info" icon={FlaskConical}>
      Tarif demo
    </Badge>
  );
}
