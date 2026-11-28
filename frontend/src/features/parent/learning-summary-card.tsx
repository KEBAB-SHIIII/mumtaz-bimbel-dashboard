import { useState } from 'react';
import type { LearningSummaryStatus, LearningSummaryView } from '@mumtaz/contracts';
import { Button } from '../../components/ui/actions/button';
import { Modal } from '../../components/ui/overlay/dialog';
import { Chip, type ChipColor } from '../../components/ui/data-display/chip';
import { InlineAlert } from '../../components/ui/feedback/states';
import { toApiError } from '../../lib/api-error';
import { formatPeriod, formatTimestamp } from '../../lib/format';

const MAX_COLLAPSED_SUBJECTS = 3;

const STATUS_META: Record<LearningSummaryStatus, { label: string; color: ChipColor }> = {
  very_good: { label: 'Sangat baik', color: 'lime' },
  good: { label: 'Berkembang baik', color: 'blue' },
  needs_attention: { label: 'Perlu pendampingan', color: 'orange' },
};

function SummaryBody({
  summary,
  isLoading,
  error,
  onGenerate,
  compact = false,
}: {
  summary: LearningSummaryView;
  isLoading: boolean;
  error: unknown;
  onGenerate: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusMeta = STATUS_META[summary.overall_status];
  const hasManySubjects = summary.subjects_covered.length > MAX_COLLAPSED_SUBJECTS;
  const visibleSubjects =
    hasManySubjects && !expanded
      ? summary.subjects_covered.slice(0, MAX_COLLAPSED_SUBJECTS)
      : summary.subjects_covered;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="bold" color={statusMeta.color}>
            {statusMeta.label}
          </Chip>
          {summary.is_stale && (
            <Chip variant="caption" color="yellow">
              Ada sesi/catatan baru
            </Chip>
          )}
        </div>
        {summary.is_stale && (
          <Button
            variant="secondary"
            size="sm"
            loading={isLoading}
            onClick={onGenerate}
          >
            Perbarui ringkasan
          </Button>
        )}
      </div>

      {error ? (
        <InlineAlert tone="danger" title="Gagal memperbarui ringkasan">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{toApiError(error).message}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoading}
              onClick={onGenerate}
            >
              Coba lagi
            </Button>
          </div>
        </InlineAlert>
      ) : null}

      <p className="text-sm leading-relaxed text-pretty text-text">{summary.summary}</p>

      {(summary.strengths.length > 0 || summary.areas_to_improve.length > 0) && (
        <div className={compact ? 'flex flex-col gap-2.5' : 'grid gap-3 sm:grid-cols-2'}>
          {summary.strengths.length > 0 && (
            <div className="rounded-md bg-surface-muted/70 p-3">
              <p className="text-meta font-semibold text-text">Kelebihan</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-pretty text-text">
                {summary.strengths.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.areas_to_improve.length > 0 && (
            <div className="rounded-md bg-surface-muted/70 p-3">
              <p className="text-meta font-semibold text-text">Perlu latihan</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-pretty text-text">
                {summary.areas_to_improve.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {summary.subjects_covered.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-meta font-semibold text-text">Ringkasan per mata pelajaran</p>
          <ul className="flex flex-col gap-1.5">
            {visibleSubjects.map((item) => (
              <li
                key={item.subject_name}
                className="flex flex-col gap-0.5 rounded-md border border-border/70 bg-surface px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-2"
              >
                <span className="shrink-0 font-medium text-text">{item.subject_name}</span>
                <span className="text-pretty text-muted">{item.highlight}</span>
              </li>
            ))}
          </ul>
          {hasManySubjects && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded
                  ? 'Tampilkan lebih ringkas'
                  : `Lihat semua (${summary.subjects_covered.length} mapel)`}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-meta text-muted">
        Dibuat pada {formatTimestamp(summary.generated_at)} · Ringkasan otomatis berdasarkan catatan tutor.
      </p>
    </div>
  );
}

export interface MonthlyLearningSummaryCardProps {
  period: string;
  approvedSessionCount: number;
  summary: LearningSummaryView | null;
  isGenerating: boolean;
  error: unknown;
  onGenerate: () => void;
}

export function MonthlyLearningSummaryCard({
  period,
  approvedSessionCount,
  summary,
  isGenerating,
  error,
  onGenerate,
}: MonthlyLearningSummaryCardProps) {
  const [open, setOpen] = useState(false);
  const month = formatPeriod(period).split(' ')[0];
  const retry = error ? (
    <InlineAlert tone="danger" title={summary ? 'Gagal memperbarui ringkasan' : 'Ringkasan belum dapat dibuat'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{toApiError(error).message}</span>
        <Button variant="secondary" size="sm" loading={isGenerating} onClick={onGenerate}>
          Coba lagi
        </Button>
      </div>
    </InlineAlert>
  ) : null;

  return (
    <section aria-labelledby="monthly-summary-title" className="rounded-2xl bg-pastel-sun p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="monthly-summary-title" className="text-card-title text-balance text-text">Ringkasan belajar {month}</h2>
          {summary && approvedSessionCount > 0 && (
            <p className="rounded-md bg-pastel-teal px-2 py-0.5 text-meta font-semibold text-ink-teal">{STATUS_META[summary.overall_status].label}</p>
          )}
        </div>
        {approvedSessionCount === 0 ? (
          <p className="text-sm text-pretty text-muted">Belum ada sesi terverifikasi untuk diringkas pada {formatPeriod(period)}.</p>
        ) : summary ? (
          <>
            <p className="line-clamp-4 text-sm leading-relaxed text-pretty text-text">{summary.summary}</p>
            {retry}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>Baca selengkapnya</Button>
              {summary.is_stale && (
                <Button variant="ghost" size="sm" loading={isGenerating} onClick={onGenerate}>
                  Perbarui ringkasan
                </Button>
              )}
            </div>
            <Modal open={open} onClose={() => setOpen(false)} size="lg" title={`Ringkasan belajar ${formatPeriod(period)}`} description="Rangkuman perkembangan dari sesi terverifikasi.">
              <SummaryBody summary={summary} isLoading={isGenerating} error={error} onGenerate={onGenerate} compact />
            </Modal>
          </>
        ) : (
          <>
            <p className="text-sm text-pretty text-muted">Dapatkan rangkuman perkembangan anak dari {approvedSessionCount} sesi terverifikasi bulan ini.</p>
            <div>
              <Button variant="primary" size="md" loading={isGenerating} onClick={onGenerate}>
                Buat ringkasan bulanan
              </Button>
            </div>
            {retry}
          </>
        )}
      </div>
    </section>
  );
}

export interface SessionLearningSummaryBlockProps {
  sessionLabel: string;
  summary: LearningSummaryView | undefined;
  isGenerating: boolean;
  error: unknown;
  onGenerate: () => void;
}

export function SessionLearningSummaryBlock({
  sessionLabel,
  summary,
  isGenerating,
  error,
  onGenerate,
}: SessionLearningSummaryBlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
        <Button
          variant="secondary"
          size="md"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            if (!summary && !isGenerating && !error) onGenerate();
          }}
        >
          {summary ? 'Baca ringkasan AI' : isGenerating || error ? 'Lihat status ringkasan' : 'Ringkas sesi ini'}
        </Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Ringkasan AI sesi ini" description={sessionLabel}>
        {summary ? (
          <SummaryBody summary={summary} isLoading={isGenerating} error={error} onGenerate={onGenerate} compact />
        ) : error ? (
        <InlineAlert tone="danger" title="Ringkasan sesi belum dapat dibuat">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{toApiError(error).message}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={isGenerating}
              onClick={onGenerate}
            >
              Coba lagi
            </Button>
          </div>
        </InlineAlert>
        ) : <p role="status" className="py-4 text-sm text-muted">Sedang merangkum catatan tutor…</p>}
      </Modal>
    </div>
  );
}
