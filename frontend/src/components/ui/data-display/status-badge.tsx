import { TriangleAlert } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import type { ApprovalStatus, SessionStatus, SessionValidity } from '@mumtaz/contracts';
import { Chip, type ChipColor, type ChipVariant } from './chip';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Status semantik → pasangan warna BoardUI Chip. */
export const TONE_COLOR: Record<Tone, ChipColor> = {
  neutral: 'neutral',
  success: 'lime',
  warning: 'yellow',
  danger: 'rose',
  info: 'cyan',
};

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

/** Status sesi selalu berupa teks, tidak mengandalkan warna saja (docs/07 §6). */
const SESSION_STATUS: Record<SessionStatus, StatusConfig> = {
  pending: { label: 'Menunggu validasi', tone: 'warning' },
  approved: { label: 'Disetujui', tone: 'success' },
  revision_requested: { label: 'Perlu revisi', tone: 'warning' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

export const SESSION_STATUS_LABELS = Object.fromEntries(
  Object.entries(SESSION_STATUS).map(([key, value]) => [key, value.label]),
) as Record<SessionStatus, string>;

export function StatusBadge({ status, variant = 'bold' }: { status: SessionStatus; variant?: ChipVariant }) {
  const config = SESSION_STATUS[status];
  return (
    <StatusSwap statusKey={status}>
      <Chip variant={variant} color={TONE_COLOR[config.tone]}>
        {config.label}
      </Chip>
    </StatusSwap>
  );
}

export function FindingIndicator({ count }: { count: number }) {
  if (count === 0) return <span className="text-meta text-muted">—</span>;
  return (
    <Chip color="yellow">
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      {count} temuan
    </Chip>
  );
}

/**
 * Validitas data (D-25): Valid hijau, Perlu revisi kuning, Ditolak merah. Belum divalidasi = AI masih
 * menganalisis (cyan, berdenyut pelan). Selalu berupa teks, tidak mengandalkan warna saja.
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

export function ValidityBadge({ validity, variant = 'bold' }: { validity: SessionValidity | null; variant?: ChipVariant }) {
  const key = validity ?? 'unvalidated';
  const config = VALIDITY[key];
  return (
    <StatusSwap statusKey={key}>
      <Chip variant={variant} color={TONE_COLOR[config.tone]} className={config.pulse ? 'animate-pulse-soft motion-reduce:animate-none' : undefined}>
        {config.label}
      </Chip>
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

export function ApprovalBadge({ approval, variant = 'bold' }: { approval: ApprovalStatus | null; variant?: ChipVariant }) {
  if (!approval) return <span className="text-meta text-muted">—</span>;
  const config = APPROVAL[approval];
  return (
    <StatusSwap statusKey={approval}>
      <Chip variant={variant} color={TONE_COLOR[config.tone]}>
        {config.label}
      </Chip>
    </StatusSwap>
  );
}
