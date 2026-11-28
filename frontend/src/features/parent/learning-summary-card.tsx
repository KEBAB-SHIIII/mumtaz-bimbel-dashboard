import { useId, useState } from 'react';
import type { LearningSummaryStatus, LearningSummaryView } from '@mumtaz/contracts';
import { Button } from '../../components/ui/actions/button';
import { Chip, type ChipColor } from '../../components/ui/data-display/chip';
import { InlineAlert } from '../../components/ui/feedback/states';
import { DockedSidePanel, SideDrawer, useIsDesktop } from '../../components/ui/overlay/side-panel';
import { toApiError } from '../../lib/api-error';
import { formatPeriod, formatTimestamp } from '../../lib/format';
import { subjectStyle } from './subject-style';

const MAX_COLLAPSED_SUBJECTS = 3;

const STATUS_META: Record<LearningSummaryStatus, { label: string; color: ChipColor }> = {
  very_good: { label: 'Sangat baik', color: 'lime' },
  good: { label: 'Berkembang baik', color: 'blue' },
  needs_attention: { label: 'Perlu pendampingan', color: 'orange' },
};

/**
 * Isi detail ringkasan tutor yang dipakai bersama oleh:
 * - Panel ringkasan bulanan di Beranda (`MonthlyLearningSummaryCard`)
 * - Panel samping ringkasan per sesi di Catatan Belajar (`SessionSummaryPanel`)
 *
 * Beri `key={sessionId}` saat berganti sesi agar state lipat-buka daftar mapel ter-reset otomatis.
 */
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
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="bold" color={statusMeta.color}>
            {statusMeta.label}
          </Chip>
          {summary.is_stale && (
            <Chip variant="caption" color="yellow">
              Ada catatan tutor terbaru
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
            <div className="rounded-lg bg-surface-muted/70 px-3.5 py-3">
              <p className="text-meta font-semibold text-text">Kelebihan</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-pretty text-text">
                {summary.strengths.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.areas_to_improve.length > 0 && (
            <div className="rounded-lg bg-surface-muted/70 px-3.5 py-3">
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
          <ul className="divide-y divide-border/80 overflow-hidden rounded-lg border border-border bg-surface">
            {visibleSubjects.map((item) => {
              const style = subjectStyle(item.subject_name);
              return (
                <li
                  key={item.subject_name}
                  className="flex items-stretch gap-3 px-3.5 py-3"
                >
                  <span aria-hidden className={`w-1 shrink-0 rounded-full ${style.barClass}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text">{item.subject_name}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-pretty text-muted">{item.highlight}</p>
                  </div>
                </li>
              );
            })}
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
        Diperbarui {formatTimestamp(summary.generated_at)} · Dari catatan tutor.
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

/**
 * Kartu ringkasan bulanan di Beranda Orang Tua.
 * Detail lengkap dibuka pada sidebar kanan terluar `AppShell` di desktop (`≥ 1024px`)
 * atau `SideDrawer` dari kanan pada layar kecil, selaras dengan Catatan Belajar.
 */
export function MonthlyLearningSummaryCard({
  period,
  approvedSessionCount,
  summary,
  isGenerating,
  error,
  onGenerate,
}: MonthlyLearningSummaryCardProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const baseId = useId();
  const triggerId = `${baseId}-monthly-trigger`;
  const panelId = `${baseId}-monthly-panel`;
  const month = formatPeriod(period).split(' ')[0];

  function closePanel() {
    setOpen(false);
    if (isDesktop) {
      document.getElementById(triggerId)?.focus();
    }
  }

  const retry = error ? (
    <InlineAlert tone="danger" title={summary ? 'Gagal memperbarui ringkasan' : 'Ringkasan belum dapat ditampilkan'}>
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
          <h2 id="monthly-summary-title" className="text-card-title text-balance text-text">Ringkasan tutor {month}</h2>
          {summary && approvedSessionCount > 0 && (
            <p className="rounded-md bg-pastel-teal px-2 py-0.5 text-meta font-semibold text-ink-teal">{STATUS_META[summary.overall_status].label}</p>
          )}
        </div>
        {approvedSessionCount === 0 ? (
          <p className="text-sm text-pretty text-muted">Belum ada sesi terverifikasi pada {formatPeriod(period)}.</p>
        ) : summary ? (
          <>
            <p className="line-clamp-4 text-sm leading-relaxed text-pretty text-text">{summary.summary}</p>
            {retry}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                id={triggerId}
                variant={open && isDesktop ? 'primary' : 'secondary'}
                size="sm"
                aria-expanded={open}
                aria-controls={open && isDesktop ? panelId : undefined}
                onClick={() => setOpen((prev) => !prev)}
              >
                Baca selengkapnya
              </Button>
              {summary.is_stale && (
                <Button variant="ghost" size="sm" loading={isGenerating} onClick={onGenerate}>
                  Perbarui ringkasan
                </Button>
              )}
            </div>
            {isDesktop ? (
              open && (
                <DockedSidePanel
                  id={panelId}
                  onClose={closePanel}
                  title={`Ringkasan tutor ${formatPeriod(period)}`}
                  description="Rangkuman perkembangan belajar dari catatan tutor."
                  closeLabel="Tutup ringkasan bulanan"
                >
                  <SummaryBody summary={summary} isLoading={isGenerating} error={error} onGenerate={onGenerate} compact />
                </DockedSidePanel>
              )
            ) : (
              <SideDrawer
                open={open}
                onClose={closePanel}
                size="lg"
                title={`Ringkasan tutor ${formatPeriod(period)}`}
                description="Rangkuman perkembangan belajar dari catatan tutor."
                closeLabel="Tutup ringkasan bulanan"
              >
                <SummaryBody summary={summary} isLoading={isGenerating} error={error} onGenerate={onGenerate} compact />
              </SideDrawer>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-pretty text-muted">Rangkuman perkembangan dari {approvedSessionCount} sesi belajar bulan ini.</p>
            <div>
              <Button variant="primary" size="md" loading={isGenerating} onClick={onGenerate}>
                Lihat ringkasan bulanan
              </Button>
            </div>
            {retry}
          </>
        )}
      </div>
    </section>
  );
}

export interface SessionSummaryPanelProps {
  /** ID sesi yang sedang ditampilkan; `null` berarti panel tertutup. */
  sessionId: string | null;
  /** ID HTML untuk ditautkan lewat `aria-controls` dari kartu aktif. */
  panelId: string;
  /** `true` pada layar ≥ 1024px: tampil di slot sidebar kanan terluar `AppShell`. */
  isDesktop: boolean;
  /** Subjudul sesi aktif, mis. `"28 November 2026 · Bahasa Indonesia, Bahasa Inggris"`. */
  sessionLabel: string;
  summary: LearningSummaryView | undefined;
  isGenerating: boolean;
  error: unknown;
  onGenerate: () => void;
  onClose: () => void;
  /** Indeks 0-based sesi aktif dalam daftar bulan ini (untuk indikator `1 / N`). */
  currentIndex: number;
  /** Total sesi pada bulan aktif. */
  totalCount: number;
  /** Callback pindah langsung ke sesi sebelumnya; `undefined` jika sudah di sesi pertama. */
  onPrev?: (() => void) | undefined;
  /** Callback pindah langsung ke sesi berikutnya; `undefined` jika sudah di sesi terakhir. */
  onNext?: (() => void) | undefined;
}

/**
 * Panel samping ringkasan tutor untuk satu sesi di halaman Catatan Belajar.
 *
 * Perilaku responsif:
 * - **Desktop (`isDesktop === true`)**: merender `DockedSidePanel` (`<aside>`) lewat portal ke slot
 *   sidebar kanan terluar `AppShell` (tinggi penuh `h-dvh`), sehingga terpisah total dari kotak kartu
 *   dan orang tua bebas mengklik kartu sesi lain secara langsung.
 * - **Mobile/Tablet (`isDesktop === false`)**: merender `SideDrawer` dari tepi kanan agar konten
 *   tetap lega dibaca.
 *
 * Keduanya menyertakan bar navigasi `Sebelumnya / Berikutnya` di footer saat sesi > 1,
 * sehingga perpindahan antar ringkasan tidak perlu menutup panel lebih dulu.
 */
export function SessionSummaryPanel({
  sessionId,
  panelId,
  isDesktop,
  sessionLabel,
  summary,
  isGenerating,
  error,
  onGenerate,
  onClose,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}: SessionSummaryPanelProps) {
  const isOpen = sessionId !== null;

  const content = summary ? (
    <SummaryBody
      key={sessionId ?? undefined}
      summary={summary}
      isLoading={isGenerating}
      error={error}
      onGenerate={onGenerate}
      compact
    />
  ) : error ? (
    <InlineAlert tone="danger" title="Ringkasan sesi belum dapat ditampilkan">
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
  ) : (
    <p role="status" className="py-4 text-sm text-muted">
      Menyiapkan ringkasan tutor…
    </p>
  );

  const footer =
    totalCount > 1 ? (
      <nav aria-label="Pindah sesi ringkasan" className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!onPrev}
          onClick={onPrev}
        >
          Sebelumnya
        </Button>
        <span className="text-meta font-medium text-muted tabular-nums" aria-live="polite">
          {currentIndex + 1} / {totalCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!onNext}
          onClick={onNext}
        >
          Berikutnya
        </Button>
      </nav>
    ) : undefined;

  if (isDesktop) {
    if (!isOpen) return null;
    return (
      <DockedSidePanel
        id={panelId}
        title="Ringkasan tutor sesi ini"
        description={sessionLabel}
        footer={footer}
        onClose={onClose}
        closeLabel="Tutup ringkasan sesi"
      >
        {content}
      </DockedSidePanel>
    );
  }

  return (
    <SideDrawer
      open={isOpen}
      onClose={onClose}
      title="Ringkasan tutor sesi ini"
      description={sessionLabel}
      footer={footer}
      closeLabel="Tutup ringkasan sesi"
    >
      {content}
    </SideDrawer>
  );
}
