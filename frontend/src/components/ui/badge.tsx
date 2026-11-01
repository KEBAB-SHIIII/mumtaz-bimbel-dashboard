import {
  CircleCheck,
  CircleX,
  Clock,
  PencilLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApprovalStatus, SessionStatus, SessionValidity } from '@mumtaz/contracts';
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
  pending: { label: 'Menunggu validasi', tone: 'warning', icon: Clock },
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

/**
 * Validitas data (revisi PM): Valid hijau, Perlu revisi biru, Ditolak merah; belum divalidasi
 * abu-abu. Selalu teks + ikon, tidak mengandalkan warna saja.
 */
const VALIDITY: Record<SessionValidity | 'unvalidated', { label: string; tone: Tone; icon: LucideIcon }> = {
  valid: { label: 'Valid', tone: 'success', icon: CircleCheck },
  needs_revision: { label: 'Perlu revisi', tone: 'info', icon: PencilLine },
  rejected: { label: 'Ditolak', tone: 'danger', icon: CircleX },
  unvalidated: { label: 'Menunggu validasi', tone: 'neutral', icon: Clock },
};

export const VALIDITY_LABELS = Object.fromEntries(
  Object.entries(VALIDITY).map(([key, value]) => [key, value.label]),
) as Record<SessionValidity | 'unvalidated', string>;

export function ValidityBadge({ validity }: { validity: SessionValidity | null }) {
  const config = VALIDITY[validity ?? 'unvalidated'];
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

/** Status approval sesi Perlu revisi (dipilih Admin setelah banding via WA). */
const APPROVAL: Record<ApprovalStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  pending: { label: 'Menunggu', tone: 'warning', icon: Clock },
  approved: { label: 'Disetujui', tone: 'success', icon: CircleCheck },
  rejected: { label: 'Ditolak', tone: 'danger', icon: CircleX },
};

export const APPROVAL_LABELS = Object.fromEntries(
  Object.entries(APPROVAL).map(([key, value]) => [key, value.label]),
) as Record<ApprovalStatus, string>;

export function ApprovalBadge({ approval }: { approval: ApprovalStatus | null }) {
  if (!approval) return <span className="text-xs text-muted">—</span>;
  const config = APPROVAL[approval];
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}
