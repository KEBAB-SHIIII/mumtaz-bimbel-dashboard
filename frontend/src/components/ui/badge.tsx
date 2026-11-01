import { TriangleAlert, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import type { ApprovalStatus, SessionStatus, SessionValidity } from '@mumtaz/contracts';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Latar `-subtle`, teks `-strong` (≥ 7.5:1), garis tipis status 20%, titik warna jenuh (docs/design/02-tokens.md). */
const TONES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-neutral-subtle text-muted ring-border', dot: 'bg-muted' },
  success: { pill: 'bg-success-subtle text-success-strong ring-success/20', dot: 'bg-success' },
  warning: { pill: 'bg-warning-subtle text-warning-strong ring-warning/20', dot: 'bg-warning' },
  danger: { pill: 'bg-danger-subtle text-danger-strong ring-danger/20', dot: 'bg-danger' },
  info: { pill: 'bg-info-subtle text-info-strong ring-info/20', dot: 'bg-info' },
};

interface BadgeProps {
  tone?: Tone;
  /** Hanya untuk pengecualian (mis. jumlah temuan AI); badge status memakai titik, bukan ikon. */
  icon?: LucideIcon | undefined;
  /** `sm` (20px) untuk sel tabel padat. */
  size?: 'sm' | 'md';
  /** Titik berdenyut pelan untuk proses yang sedang berjalan (diam saat reduced motion). */
  pulse?: boolean;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', icon: Icon, size = 'md', pulse = false, children }: BadgeProps) {
  const config = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 text-meta font-medium whitespace-nowrap tabular-nums ring-1 ring-inset',
        size === 'sm' ? 'h-5' : 'h-[1.375rem]',
        config.pill,
      )}
    >
      {Icon ? (
        <Icon aria-hidden className="size-3 shrink-0" />
      ) : (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', config.dot, pulse && 'animate-pulse-soft motion-reduce:animate-none')} />
      )}
      {children}
    </span>
  );
}

/**
 * Saat status berubah (mis. hasil AI masuk), badge baru memudar masuk 180ms. Badge lama langsung
 * diganti (tanpa exit) supaya tidak pernah ada dua label status bersamaan di layar maupun pembaca layar.
 */
function StatusSwap({ statusKey, children }: { statusKey: string; children: ReactNode }) {
  return (
    <m.span key={statusKey} className="inline-flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
      {children}
    </m.span>
  );
}

interface StatusConfig {
  label: string;
  tone: Tone;
  pulse?: boolean;
}

/** Status sesi selalu berupa teks + titik, tidak mengandalkan warna saja (docs/07 §6). */
const SESSION_STATUS: Record<SessionStatus, StatusConfig> = {
  pending: { label: 'Menunggu validasi', tone: 'warning' },
  approved: { label: 'Disetujui', tone: 'success' },
  revision_requested: { label: 'Perlu revisi', tone: 'warning' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

export const SESSION_STATUS_LABELS = Object.fromEntries(
  Object.entries(SESSION_STATUS).map(([key, value]) => [key, value.label]),
) as Record<SessionStatus, string>;

export function StatusBadge({ status, size }: { status: SessionStatus; size?: 'sm' | 'md' }) {
  const config = SESSION_STATUS[status];
  return (
    <StatusSwap statusKey={status}>
      <Badge tone={config.tone} size={size ?? 'md'}>
        {config.label}
      </Badge>
    </StatusSwap>
  );
}

export function FindingIndicator({ count }: { count: number }) {
  if (count === 0) return <span className="text-meta text-muted">—</span>;
  return (
    <Badge tone="warning" icon={TriangleAlert}>
      {count} temuan
    </Badge>
  );
}

/**
 * Validitas data (D-25): Valid hijau, Perlu revisi kuning, Ditolak merah. Belum divalidasi = AI masih
 * menganalisis (biru, titik berdenyut). Selalu teks + titik, tidak mengandalkan warna saja.
 */
const VALIDITY: Record<SessionValidity | 'unvalidated', StatusConfig> = {
  valid: { label: 'Valid', tone: 'success' },
  needs_revision: { label: 'Perlu revisi', tone: 'warning' },
  rejected: { label: 'Ditolak', tone: 'danger' },
  unvalidated: { label: 'Menunggu validasi', tone: 'info', pulse: true },
};

export const VALIDITY_LABELS = Object.fromEntries(
  Object.entries(VALIDITY).map(([key, value]) => [key, value.label]),
) as Record<SessionValidity | 'unvalidated', string>;

export function ValidityBadge({ validity, size }: { validity: SessionValidity | null; size?: 'sm' | 'md' }) {
  const key = validity ?? 'unvalidated';
  const config = VALIDITY[key];
  return (
    <StatusSwap statusKey={key}>
      <Badge tone={config.tone} pulse={config.pulse ?? false} size={size ?? 'md'}>
        {config.label}
      </Badge>
    </StatusSwap>
  );
}

/** Status approval sesi Perlu revisi (dipilih Admin setelah banding via WA). */
const APPROVAL: Record<ApprovalStatus, StatusConfig> = {
  pending: { label: 'Menunggu', tone: 'warning' },
  approved: { label: 'Disetujui', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

export const APPROVAL_LABELS = Object.fromEntries(
  Object.entries(APPROVAL).map(([key, value]) => [key, value.label]),
) as Record<ApprovalStatus, string>;

export function ApprovalBadge({ approval, size }: { approval: ApprovalStatus | null; size?: 'sm' | 'md' }) {
  if (!approval) return <span className="text-meta text-muted">—</span>;
  const config = APPROVAL[approval];
  return (
    <StatusSwap statusKey={approval}>
      <Badge tone={config.tone} size={size ?? 'md'}>
        {config.label}
      </Badge>
    </StatusSwap>
  );
}
