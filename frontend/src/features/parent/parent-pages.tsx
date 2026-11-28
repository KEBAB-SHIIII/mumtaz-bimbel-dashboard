import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation } from 'react-router';
import { m } from 'motion/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type {
  LearningSummaryView,
  ParentLearningSummariesResponse,
  ParentProgressItem,
  ParentStudent,
} from '@mumtaz/contracts';
import { Button } from '../../components/ui/actions/button';
import { itemEnter } from '../../components/ui/motion/animated-list';
import { Avatar } from '../../components/ui/data-display/avatar';
import { Pagination } from '../../components/ui/data-display/data-table';
import { EmptyState, ErrorState } from '../../components/ui/feedback/states';
import { FilterSelect } from '../../components/ui/forms/filter-select';
import { Card, PageHeader } from '../../components/ui/surfaces/layout-primitives';
import { PeriodSelector } from '../../components/ui/forms/period-selector';
import { QueryView } from '../../components/ui/feedback/query-view';
import { LoadingSwitch, SkeletonCardList, SkeletonProfile, SkeletonStatCards } from '../../components/ui/feedback/skeleton';
import { useIsDesktop } from '../../components/ui/overlay/side-panel';
import { formatDuration, formatLessonDate, formatPeriod, formatRelativeLessonDate } from '../../lib/format';
import { usePeriodParam } from '../../hooks/use-period-param';
import { queryKeys } from '../../lib/query-keys';
import { useSearchState } from '../../hooks/use-search-state';
import {
  fetchParentDashboard,
  fetchParentProgress,
  fetchParentStudents,
  fetchParentSummaries,
  generateMonthlySummary,
  generateSessionSummary,
} from './api';
import {
  MonthlyLearningSummaryCard,
  SessionSummaryPanel,
} from './learning-summary-card';
import { sessionCardStyle, subjectStyle } from './subject-style';

/**
 * Waktu saat ini yang diperbarui berkala (tiap menit & saat tab aktif kembali) agar
 * label relatif ("Hari ini", "Kemarin", "2 hari lalu") selalu sesuai tanggal berjalan.
 */
function useRealtimeDate(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const id = window.setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return now;
}

/** Anak terpilih dari URL; default anak pertama yang terhubung. */
function useSelectedStudent() {
  const students = useQuery({ queryKey: queryKeys.parent.students, queryFn: fetchParentStudents });
  const { values, update } = useSearchState(['student_id'] as const);
  const items = students.data ?? [];
  const selected = items.find((s) => s.id === values.student_id) ?? items[0];
  return { students, items, selected, select: (id: string) => update({ student_id: id }) };
}

function StudentSelector({ items, selected, onSelect }: { items: ParentStudent[]; selected: ParentStudent; onSelect: (id: string) => void }) {
  if (items.length <= 1) return null;
  return (
    <FilterSelect label="Anak" value={selected.id} onChange={onSelect} options={items.map((student) => ({ value: student.id, label: student.full_name }))} />
  );
}

/** Query + mutasi ringkasan belajar (bulanan & per sesi) yang disinkronkan ke cache TanStack Query. */
function useParentSummaries(studentId: string, period: string) {
  const queryClient = useQueryClient();
  const summariesKey = queryKeys.parent.summaries(studentId, period);
  const summariesQuery = useQuery({
    queryKey: summariesKey,
    queryFn: () => fetchParentSummaries(studentId, period),
  });

  const monthlyMutation = useMutation({
    mutationFn: () => generateMonthlySummary(studentId, period),
    onSuccess: (res) => {
      queryClient.setQueryData<ParentLearningSummariesResponse>(summariesKey, (prev) =>
        prev
          ? { ...prev, monthly: res.summary }
          : {
              student_id: studentId,
              period,
              approved_session_count: 1,
              monthly: res.summary,
              sessions: {},
            },
      );
    },
  });

  const [pendingSessions, setPendingSessions] = useState<Record<string, boolean>>({});
  const [sessionErrors, setSessionErrors] = useState<Record<string, unknown>>({});

  async function triggerSessionSummary(sessionId: string) {
    setPendingSessions((prev) => ({ ...prev, [sessionId]: true }));
    setSessionErrors((prev) => {
      if (!(sessionId in prev)) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== sessionId));
    });
    try {
      const res = await generateSessionSummary(studentId, sessionId);
      queryClient.setQueryData<ParentLearningSummariesResponse>(summariesKey, (prev) =>
        prev
          ? { ...prev, sessions: { ...prev.sessions, [sessionId]: res.summary } }
          : {
              student_id: studentId,
              period,
              approved_session_count: 1,
              monthly: null,
              sessions: { [sessionId]: res.summary },
            },
      );
    } catch (error) {
      setSessionErrors((prev) => ({ ...prev, [sessionId]: error }));
    } finally {
      setPendingSessions((prev) => ({ ...prev, [sessionId]: false }));
    }
  }

  return {
    summariesQuery,
    monthly: summariesQuery.data?.monthly ?? null,
    sessions: summariesQuery.data?.sessions ?? {},
    approvedSessionCount: summariesQuery.data?.approved_session_count,
    monthlyGenerating: monthlyMutation.isPending,
    monthlyError: monthlyMutation.error,
    generateMonthly: () => monthlyMutation.mutate(),
    pendingSessions,
    sessionErrors,
    generateSession: (sessionId: string) => {
      void triggerSessionSummary(sessionId);
    },
  };
}

const NOTES_PER_PAGE = 6;

/**
 * Papan kartu Catatan Belajar yang terhubung dengan sidebar kanan terluar `AppShell`.
 *
 * State `activeSessionId` dikelola di sini, sedangkan `SessionSummaryPanel` mem-portal panel
 * desktop langsung ke slot paling kanan `AppShell` sehingga daftar kartu tetap bersih di wadahnya
 * sendiri (`@container` otomatis mengatur 1 vs 2 kolom mengikuti lebar aktual area tengah).
 */
function SessionNoteBoard({
  sessions,
  sessionSummaries,
  pendingSessions,
  sessionErrors,
  onGenerateSessionSummary,
}: {
  sessions: ParentProgressItem[];
  sessionSummaries: Record<string, LearningSummaryView>;
  pendingSessions: Record<string, boolean>;
  sessionErrors: Record<string, unknown>;
  onGenerateSessionSummary: (sessionId: string) => void;
}) {
  const [requestedPage, setPage] = useState(1);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const now = useRealtimeDate();
  const isDesktop = useIsDesktop();
  const boardId = useId();
  const panelId = `${boardId}-summary-panel`;

  const page = Math.min(requestedPage, Math.max(1, Math.ceil(sessions.length / NOTES_PER_PAGE)));
  const start = (page - 1) * NOTES_PER_PAGE;

  // Turunkan sesi aktif & tetangganya langsung saat render (tanpa effect tambahan).
  const activeIndex = activeSessionId ? sessions.findIndex((s) => s.id === activeSessionId) : -1;
  const activeSession = activeIndex >= 0 ? sessions[activeIndex] : undefined;
  const prevSession = activeIndex > 0 ? sessions[activeIndex - 1] : undefined;
  const nextSession = activeIndex >= 0 && activeIndex < sessions.length - 1 ? sessions[activeIndex + 1] : undefined;

  /**
   * Membuka atau memindahkan panel samping ke sesi target.
   * Menjaga halaman pagination tetap sinkron bila berpindah lewat tombol Sebelumnya/Berikutnya,
   * lalu memuat ringkasan otomatis jika sesi belum ada di cache dan belum sedang diproses.
   */
  function openSession(sessionId: string) {
    const targetIndex = sessions.findIndex((s) => s.id === sessionId);
    if (targetIndex >= 0) {
      setPage(Math.floor(targetIndex / NOTES_PER_PAGE) + 1);
    }
    setActiveSessionId(sessionId);
    if (!sessionSummaries[sessionId] && !pendingSessions[sessionId] && !sessionErrors[sessionId]) {
      onGenerateSessionSummary(sessionId);
    }
  }

  /** Menutup panel samping dan mengembalikan fokus ke tombol kartu pemicu pada mode desktop. */
  function closePanel() {
    const closingId = activeSessionId;
    setActiveSessionId(null);
    if (isDesktop && closingId) {
      document.getElementById(`${boardId}-trigger-${closingId}`)?.focus();
    }
  }

  return (
    <>
      {/* `@container` membuat grid kartu merespons lebar aktual area tengah (termasuk saat sidebar kiri diciutkan atau sidebar kanan dibuka). */}
      <div className="@container rounded-b-lg bg-surface-muted/60 px-4 pt-6 pb-4 md:px-5 md:pb-5">
        <ol className="grid grid-cols-1 items-stretch gap-x-5 gap-y-6 @2xl:auto-rows-fr @2xl:grid-cols-2">
          {sessions.slice(start, start + NOTES_PER_PAGE).map((session, index) => {
            const summary = sessionSummaries[session.id];
            const isGenerating = Boolean(pendingSessions[session.id]);
            const hasError = Boolean(sessionErrors[session.id]);
            const isActive = activeSession?.id === session.id;
            const tone = sessionCardStyle(summary?.overall_status);
            const relativeDate = formatRelativeLessonDate(session.lesson_date, now);
            const headingId = `${boardId}-heading-${session.id}`;
            const triggerId = `${boardId}-trigger-${session.id}`;
            const actionLabel = summary
              ? 'Baca ringkasan tutor'
              : isGenerating || hasError
                ? 'Lihat status ringkasan'
                : 'Lihat ringkasan tutor';

            return (
              <m.li
                key={session.id}
                {...itemEnter(index)}
                className={`relative flex h-full min-w-0 flex-col rounded-xl border p-4 shadow-sm transition-shadow duration-150 before:pointer-events-none before:absolute before:top-0 before:left-1/2 before:h-3 before:w-12 before:-translate-x-1/2 before:-translate-y-1/2 before:-rotate-2 sm:p-5 ${tone.cardClass} ${isActive ? 'ring-2 ring-primary/50 shadow-md' : ''}`}
              >
                <article className="flex h-full min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
                  <header>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex flex-wrap items-baseline gap-x-1.5 text-meta tabular-nums">
                        <span className={`font-semibold ${tone.accentTextClass}`}>{relativeDate}</span>
                        <span aria-hidden className="text-muted">·</span>
                        <time dateTime={session.lesson_date} className="text-muted">
                          {formatLessonDate(session.lesson_date)}
                        </time>
                      </p>
                      {tone.statusLabel && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-meta font-medium ring-1 ring-inset ring-black/6 ${tone.accentTextClass}`}>
                          <span aria-hidden className={`size-1.5 rounded-full ${tone.dotClass}`} />
                          {tone.statusLabel}
                        </span>
                      )}
                    </div>
                    <h3 id={headingId} className="mt-2 line-clamp-1 text-[15px] font-semibold tracking-tight text-text" title={session.subject_name}>
                      {session.subject_name}
                    </h3>
                    <p className="mt-0.5 text-meta text-muted tabular-nums">
                      {session.grade && `${session.grade} · `}Tutor {session.tutor_name} · {formatDuration(session.duration_minutes)}
                    </p>
                  </header>

                  <div className="mt-3.5 rounded-lg bg-white/80 px-3.5 py-2.5 ring-1 ring-inset ring-black/5">
                    <p className={`text-meta font-semibold ${tone.accentTextClass}`}>Materi</p>
                    <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-pretty break-words text-text" title={session.learning_material}>
                      {session.learning_material}
                    </p>
                  </div>

                  <div className="mt-3.5 flex flex-1 flex-col">
                    <p className="text-meta font-semibold text-muted">Catatan tutor</p>
                    {session.learning_notes ? (
                      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-pretty break-words text-text" title={session.learning_notes}>
                        {session.learning_notes}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Belum ada catatan tambahan.</p>
                    )}
                  </div>

                  <div className="mt-auto border-t border-black/8 pt-3.5">
                    <Button
                      id={triggerId}
                      variant={isActive ? 'primary' : 'secondary'}
                      size="md"
                      aria-expanded={isActive}
                      aria-controls={isActive && isDesktop ? panelId : undefined}
                      aria-describedby={headingId}
                      onClick={() => {
                        if (isActive) closePanel();
                        else openSession(session.id);
                      }}
                    >
                      {actionLabel}
                    </Button>
                  </div>
                </article>
              </m.li>
            );
          })}
        </ol>
      </div>
      {sessions.length > NOTES_PER_PAGE && (
        <Pagination page={page} pageSize={NOTES_PER_PAGE} total={sessions.length} onPageChange={setPage} />
      )}

      {/* Di desktop, komponen ini mem-portal ke slot sidebar kanan terluar AppShell (di luar div kartu). */}
      <SessionSummaryPanel
        sessionId={activeSession?.id ?? null}
        panelId={panelId}
        isDesktop={isDesktop}
        sessionLabel={
          activeSession
            ? `${formatLessonDate(activeSession.lesson_date)} · ${activeSession.subject_name}`
            : ''
        }
        summary={activeSession ? sessionSummaries[activeSession.id] : undefined}
        isGenerating={activeSession ? Boolean(pendingSessions[activeSession.id]) : false}
        error={activeSession ? sessionErrors[activeSession.id] : undefined}
        onGenerate={() => {
          if (activeSession) onGenerateSessionSummary(activeSession.id);
        }}
        onClose={closePanel}
        currentIndex={activeIndex}
        totalCount={sessions.length}
        onPrev={prevSession ? () => openSession(prevSession.id) : undefined}
        onNext={nextSession ? () => openSession(nextSession.id) : undefined}
      />
    </>
  );
}

interface ParentContext {
  student: ParentStudent;
  period: string;
  /** Pemilih anak (bila > 1) + bulan, untuk ditaruh di header halaman. */
  controls: ReactNode;
}

/** Status muat/gagal/kosong daftar anak + pemilih anak & bulan yang dipakai semua halaman parent. */
function ParentPageFrame({ title, children }: { title: string; children: (ctx: ParentContext) => ReactNode }) {
  const [period, setPeriod] = usePeriodParam();
  const { students, items, selected, select } = useSelectedStudent();

  if (students.isError && !students.data) {
    return (
      <>
        <PageHeader title={title} />
        <Card>
          <ErrorState error={students.error} onRetry={() => void students.refetch()} />
        </Card>
      </>
    );
  }
  if (!students.data) {
    return (
      <>
        <PageHeader title={title} />
        <LoadingSwitch loading skeleton={<><Card className="p-4 sm:p-5"><SkeletonProfile size={40} /></Card><SkeletonStatCards count={3} /></>} className="flex flex-col gap-3 sm:gap-4">
          {() => null}
        </LoadingSwitch>
      </>
    );
  }
  if (!selected) {
    return (
      <>
        <PageHeader title={title} />
        <Card>
          <EmptyState title="Belum ada anak yang terhubung" description="Hubungi Admin bimbel untuk menghubungkan akun dengan data anak." />
        </Card>
      </>
    );
  }

  const controls = (
    <div className="flex flex-wrap items-end gap-2">
      <StudentSelector items={items} selected={selected} onSelect={select} />
      <PeriodSelector value={period} onChange={setPeriod} hideLabel />
    </div>
  );
  return <>{children({ student: selected, period, controls })}</>;
}

/** Identitas anak sebagai baris polos (tanpa kartu berwarna): avatar DiceBear, nama, kelas · sekolah. */
function ChildCard({ student, children }: { student: ParentStudent; children?: ReactNode }) {
  return (
    <section aria-label="Data anak" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar seed={student.id} name={student.full_name} size={40} decorative />
        <div className="min-w-0">
          <p className="text-card-title break-words text-text">{student.full_name}</p>
          <p className="text-meta text-pretty text-muted">{student.grade} · {student.school_name}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Beranda: ringkas dulu (angka, ringkasan tutor), detail kemudian (sesi terakhir, pelajaran). */
export function ParentDashboardPage() {
  return (
    <ParentPageFrame title="Beranda">
      {({ student, period, controls }) => (
        <>
          <PageHeader title="Beranda" />
          <ChildCard student={student}>{controls}</ChildCard>
          <HomeContent key={`${student.id}:${period}`} studentId={student.id} period={period} />
        </>
      )}
    </ParentPageFrame>
  );
}

const STAT_TONES = {
  blue: 'bg-pastel-blue',
  teal: 'bg-pastel-teal',
  amber: 'bg-pastel-amber',
} as const;

function StatTile({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: keyof typeof STAT_TONES }) {
  return (
    <li className={`flex flex-col gap-2 rounded-2xl p-3 sm:gap-3 sm:p-4 ${STAT_TONES[tone]}`}>
      <span className="text-meta font-semibold text-text">{label}</span>
      <p className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
        <span className="text-2xl font-bold text-text tabular-nums sm:text-3xl">{value}</span>
        <span className="text-meta text-muted">{unit}</span>
      </p>
    </li>
  );
}

function SectionCard({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="h-full rounded-2xl border border-border bg-surface px-4 pt-4 pb-2 sm:px-5 sm:pt-5">
      {/* Tinggi header tetap (h-7) di semua kartu; aksi memakai margin negatif agar area sentuh 44px tidak menambah tinggi. */}
      <div className="flex h-7 items-center justify-between gap-3">
        <h2 id={id} className="text-card-title text-text">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function HomeContent({ studentId, period }: { studentId: string; period: string }) {
  const summary = useQuery({ queryKey: queryKeys.parent.dashboard(studentId, period), queryFn: () => fetchParentDashboard(studentId, period) });
  const progress = useQuery({ queryKey: queryKeys.parent.progress(studentId, period), queryFn: () => fetchParentProgress(studentId, period) });
  const ai = useParentSummaries(studentId, period);
  const now = useRealtimeDate();

  const combined = {
    data: summary.data && progress.data ? { summary: summary.data, progress: progress.data } : undefined,
    isPending: summary.isPending || progress.isPending,
    isError: summary.isError || progress.isError,
    error: summary.error ?? progress.error,
    refetch: () => Promise.all([summary.refetch(), progress.refetch()]),
  };
  const notesLink = `/orang-tua-murid/riwayat?${new URLSearchParams({ student_id: studentId, period })}`;

  return (
    <QueryView query={combined} skeleton={<><SkeletonStatCards count={3} /><Card><SkeletonCardList count={2} /></Card></>}>
      {({ summary: data, progress: detail }) => {
        return (
          <>
            <ul aria-label="Ringkasan bulan ini" className="grid grid-cols-3 gap-2 sm:gap-4">
              <StatTile tone="blue" label="Sesi belajar" value={String(data.approved_sessions)} unit="sesi" />
              <StatTile tone="teal" label="Waktu belajar" value={formatHours(data.approved_duration_minutes)} unit="jam" />
              <StatTile tone="amber" label="Mata pelajaran" value={String(data.subject_sessions.length)} unit="mapel" />
            </ul>

            {data.approved_sessions === 0 ? (
              <Card>
                <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}. Pilih bulan lain untuk melihat perkembangan anak.`} />
              </Card>
            ) : (
              <>
                <MonthlyLearningSummaryCard
                  period={period}
                  approvedSessionCount={ai.approvedSessionCount ?? data.approved_sessions}
                  summary={ai.monthly}
                  isGenerating={ai.monthlyGenerating}
                  error={ai.monthlyError}
                  onGenerate={ai.generateMonthly}
                />
                {/* Ringkasan tutor lebar penuh; dua daftar di bawahnya bersanding dengan tinggi sama. */}
                <div className="grid items-stretch gap-4 lg:grid-cols-[1.35fr_1fr]">
                  <SectionCard
                    id="recent-sessions-title"
                    title="Sesi terakhir"
                    actions={<Link to={notesLink} className="-my-2.5 -me-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary hover:text-ink-blue hover:underline focus-visible:outline-2 focus-visible:outline-primary">Lihat semua catatan</Link>}
                  >
                    <ol className="mt-2 divide-y divide-border">
                      {detail.sessions.slice(0, 5).map((session) => {
                        const style = subjectStyle(session.subject_name);
                        return (
                          <li key={session.id} className="flex items-center gap-3 py-3">
                            {/* Penanda warna mapel (tanpa ikon): garis tegak tipis di kiri. */}
                            <span aria-hidden className={`h-9 w-1 shrink-0 rounded-full ${style.barClass}`} />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold break-words text-text">{session.subject_name}</p>
                              <p className="text-meta text-muted">{session.tutor_name} · {formatDuration(session.duration_minutes)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end text-right">
                              <span className="text-meta font-semibold text-text">
                                {formatRelativeLessonDate(session.lesson_date, now)}
                              </span>
                              <time dateTime={session.lesson_date} className="text-meta text-muted">
                                {formatShortDate(session.lesson_date)}
                              </time>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </SectionCard>
                  <SubjectsCard items={data.subject_sessions} />
                </div>
              </>
            )}
          </>
        );
      }}
    </QueryView>
  );
}

const SUBJECTS_COLLAPSED = 5;

/** Pelajaran bulan ini: 5 mapel teratas, sisanya dibuka lewat tombol agar kolom tidak memanjang. */
function SubjectsCard({ items }: { items: { name: string; sessions: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  const maxSessions = Math.max(1, ...items.map((item) => item.sessions));
  const visible = expanded ? items : items.slice(0, SUBJECTS_COLLAPSED);
  return (
    <SectionCard id="subjects-title" title="Pelajaran bulan ini">
      <ul className="mt-2 divide-y divide-border">
        {visible.map((item) => {
          const style = subjectStyle(item.name);
          return (
            <li key={item.name} className="py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-text">{item.name}</span>
                  <span className="shrink-0 text-meta text-muted tabular-nums">{item.sessions} sesi</span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className={`h-full rounded-full ${style.barClass}`} style={{ width: `${(item.sessions / maxSessions) * 100}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > SUBJECTS_COLLAPSED && (
        <div className="border-t border-border py-2">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="-ms-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary hover:text-ink-blue focus-visible:outline-2 focus-visible:outline-primary"
          >
            {expanded ? 'Tampilkan lebih sedikit' : `Lihat semua (${items.length} mapel)`}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

/** "180" menit → "3"; "90" → "1,5" (jam, tanpa nol berlebih). */
function formatHours(minutes: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(minutes / 60);
}

const shortDate = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "2026-10-31" → "Sab, 31 Okt". */
function formatShortDate(isoDate: string): string {
  return shortDate.format(new Date(`${isoDate}T00:00:00Z`));
}

export function ParentHistoryPage() {
  return (
    <ParentPageFrame title="Catatan Belajar">
      {({ student, period, controls }) => (
        <>
          <PageHeader title="Catatan Belajar" description={`Catatan tutor untuk ${student.full_name} dari sesi yang sudah diverifikasi.`} actions={controls} />
          <HistoryList key={`${student.id}:${period}`} studentId={student.id} period={period} />
        </>
      )}
    </ParentPageFrame>
  );
}

function HistoryList({ studentId, period }: { studentId: string; period: string }) {
  const progress = useQuery({ queryKey: queryKeys.parent.progress(studentId, period), queryFn: () => fetchParentProgress(studentId, period) });
  const ai = useParentSummaries(studentId, period);

  return (
    <QueryView query={progress} skeleton={<Card><SkeletonCardList count={4} /></Card>}>
      {(data) => (
        <Card title="Semua sesi" description={formatPeriod(period)}>
          {data.sessions.length === 0 ? (
            <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
          ) : (
            <SessionNoteBoard
              sessions={data.sessions}
              sessionSummaries={ai.sessions}
              pendingSessions={ai.pendingSessions}
              sessionErrors={ai.sessionErrors}
              onGenerateSessionSummary={ai.generateSession}
            />
          )}
        </Card>
      )}
    </QueryView>
  );
}

/** Halaman Mata Pelajaran digabung ke Beranda (28-11-2026); tautan lama tetap berfungsi. */
export function ParentSubjectsRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/orang-tua-murid', search }} replace />;
}
