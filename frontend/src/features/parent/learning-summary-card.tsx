import { ChevronDown, ChevronUp, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { LearningSummaryStatus, LearningSummaryView } from '@mumtaz/contracts';
import { Button } from '../../components/ui/actions/button';
import { Chip, type ChipColor } from '../../components/ui/data-display/chip';
import { InlineAlert } from '../../components/ui/feedback/states';
import { Card } from '../../components/ui/surfaces/layout-primitives';
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
            icon={<RefreshCw aria-hidden className="size-3.5" />}
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
              icon={<RotateCcw aria-hidden className="size-3.5" />}
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
                icon={
                  expanded ? (
                    <ChevronUp aria-hidden className="size-4" />
                  ) : (
                    <ChevronDown aria-hidden className="size-4" />
                  )
                }
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
  return (
    <Card
      title="Ringkasan belajar bulanan"
      description={`Rangkuman perkembangan belajar berdasarkan sesi terverifikasi pada ${formatPeriod(period)}.`}
    >
      <div className="px-4 py-4 sm:px-5">
        {approvedSessionCount === 0 ? (
          <p className="text-sm text-muted">
            Belum ada sesi terverifikasi untuk diringkas pada {formatPeriod(period)}.
          </p>
        ) : summary ? (
          <SummaryBody
            summary={summary}
            isLoading={isGenerating}
            error={error}
            onGenerate={onGenerate}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-pretty text-muted">
                Dapatkan rangkuman perkembangan anak dari {approvedSessionCount} sesi terverifikasi bulan ini.
              </p>
              <Button
                variant="primary"
                size="md"
                loading={isGenerating}
                icon={<Sparkles aria-hidden className="size-4" />}
                onClick={onGenerate}
              >
                Buat ringkasan bulanan
              </Button>
            </div>
            {error ? (
              <InlineAlert tone="danger" title="Ringkasan belum dapat dibuat">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{toApiError(error).message}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isGenerating}
                    icon={<RotateCcw aria-hidden className="size-3.5" />}
                    onClick={onGenerate}
                  >
                    Coba lagi
                  </Button>
                </div>
              </InlineAlert>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

export interface SessionLearningSummaryBlockProps {
  summary: LearningSummaryView | undefined;
  isGenerating: boolean;
  error: unknown;
  onGenerate: () => void;
}

export function SessionLearningSummaryBlock({
  summary,
  isGenerating,
  error,
  onGenerate,
}: SessionLearningSummaryBlockProps) {
  if (summary) {
    return (
      <div className="mt-2 rounded-md border border-border bg-surface p-3">
        <p className="mb-2 text-meta font-semibold text-muted">Ringkasan AI sesi ini</p>
        <SummaryBody
          summary={summary}
          isLoading={isGenerating}
          error={error}
          onGenerate={onGenerate}
          compact
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          size="sm"
          loading={isGenerating}
          icon={<Sparkles aria-hidden className="size-3.5" />}
          onClick={onGenerate}
        >
          Ringkas sesi ini
        </Button>
      </div>
      {error ? (
        <InlineAlert tone="danger" title="Ringkasan sesi belum dapat dibuat">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{toApiError(error).message}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={isGenerating}
              icon={<RotateCcw aria-hidden className="size-3.5" />}
              onClick={onGenerate}
            >
              Coba lagi
            </Button>
          </div>
        </InlineAlert>
      ) : null}
    </div>
  );
}
