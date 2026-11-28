import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarCheck, Clock, GraduationCap, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  LearningSummaryView,
  ParentLearningSummariesResponse,
  ParentProgressItem,
  ParentStudent,
} from '@mumtaz/contracts';
import { itemEnter } from '../../components/ui/motion/animated-list';
import { Pagination } from '../../components/ui/data-display/data-table';
import { EmptyState, ErrorState } from '../../components/ui/feedback/states';
import { FilterSelect } from '../../components/ui/forms/filter-select';
import { Card, PageHeader } from '../../components/ui/surfaces/layout-primitives';
import { PeriodSelector } from '../../components/ui/forms/period-selector';
import { QueryView } from '../../components/ui/feedback/query-view';
import { LoadingSwitch, SkeletonCardList, SkeletonProfile, SkeletonStatCards } from '../../components/ui/feedback/skeleton';
import { formatDuration, formatLessonDate, formatPeriod } from '../../lib/format';
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
  SessionLearningSummaryBlock,
} from './learning-summary-card';
import { subjectStyle } from './subject-style';

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

/** Query + mutasi ringkasan belajar AI (bulanan & per sesi) yang disinkronkan ke cache TanStack Query. */
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
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(sessions.length / NOTES_PER_PAGE)));
  const start = (page - 1) * NOTES_PER_PAGE;
  return (
    <>
    <ol className="grid grid-cols-1 items-start gap-x-5 gap-y-6 rounded-b-lg bg-surface-muted/60 px-4 pt-6 pb-4 md:grid-cols-2 md:px-5 md:pb-5">
      {sessions.slice(start, start + NOTES_PER_PAGE).map((session, index) => (
        <m.li
          key={session.id}
          {...itemEnter(index)}
          className={`relative min-w-0 rounded-md border border-black/5 p-4 shadow-sm before:pointer-events-none before:absolute before:top-0 before:left-1/2 before:h-3 before:w-12 before:-translate-x-1/2 before:-translate-y-1/2 before:-rotate-3 sm:p-5 ${subjectStyle(session.subject_name).noteClass}`}
        >
          <article className="flex min-w-0 flex-col gap-1.5 [overflow-wrap:anywhere]">
            <p className="text-meta text-muted tabular-nums">
              <time dateTime={session.lesson_date}>{formatLessonDate(session.lesson_date)}</time> · {formatDuration(session.duration_minutes)}
            </p>
            <h3 className="text-card-title text-text">{session.subject_name}</h3>
            <p className="text-meta text-muted">{session.grade && `${session.grade} · `}Tutor: {session.tutor_name}</p>
            <dl className="mt-2 flex flex-col gap-3 border-t border-black/10 pt-3 text-sm leading-relaxed">
              <div>
                <dt className="text-meta text-muted">Materi</dt>
                <dd className="text-pretty break-words text-text">{session.learning_material}</dd>
              </div>
              {session.learning_notes && (
                <div>
                  <dt className="text-meta text-muted">Catatan tutor</dt>
                  <dd className="text-pretty break-words text-text">{session.learning_notes}</dd>
                </div>
              )}
            </dl>
            <SessionLearningSummaryBlock
              sessionLabel={`${formatLessonDate(session.lesson_date)} · ${session.subject_name}`}
              summary={sessionSummaries[session.id]}
              isGenerating={Boolean(pendingSessions[session.id])}
              error={sessionErrors[session.id]}
              onGenerate={() => onGenerateSessionSummary(session.id)}
            />
          </article>
        </m.li>
      ))}
    </ol>
    {sessions.length > NOTES_PER_PAGE && <Pagination page={page} pageSize={NOTES_PER_PAGE} total={sessions.length} onPageChange={setPage} />}
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

/** Beranda: ringkas dulu (angka, ringkasan AI), detail kemudian (sesi terakhir, pelajaran). */
export function ParentDashboardPage() {
  useEffect(() => {
    document.title = 'Beranda · Mumtaz Bimbel';
  }, []);
  return (
    <ParentPageFrame title="Beranda">
      {({ student, period, controls }) => (
        <>
          <section aria-label="Data anak" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pastel-blue text-ink-blue">
                <GraduationCap aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-card-title break-words text-text sm:text-xl">{student.full_name}</h1>
                <p className="text-meta text-pretty text-muted">{student.grade} · {student.school_name}</p>
              </div>
            </div>
            {controls}
          </section>
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

function StatTile({ icon: Icon, label, value, unit, tone }: { icon: LucideIcon; label: string; value: string; unit: string; tone: keyof typeof STAT_TONES }) {
  return (
    <li className={`flex flex-col gap-3 rounded-2xl p-3 sm:p-4 ${STAT_TONES[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta font-semibold text-text max-sm:sr-only">{label}</span>
        <Icon aria-hidden className="size-5 shrink-0 text-text" />
      </div>
      <p className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
        <span className="sr-only sm:hidden">{label} </span>
        <span className="text-2xl font-bold text-text tabular-nums sm:text-3xl">{value}</span>
        <span className="text-meta text-muted">{unit}</span>
      </p>
    </li>
  );
}

function SectionCard({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
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
        const maxSessions = Math.max(1, ...data.subject_sessions.map((item) => item.sessions));
        return (
          <>
            <ul aria-label="Ringkasan bulan ini" className="grid grid-cols-3 gap-2 sm:gap-4">
              <StatTile icon={CalendarCheck} tone="blue" label="Sesi belajar" value={String(data.approved_sessions)} unit="sesi" />
              <StatTile icon={Clock} tone="teal" label="Waktu belajar" value={formatHours(data.approved_duration_minutes)} unit="jam" />
              <StatTile icon={BookOpen} tone="amber" label="Mata pelajaran" value={String(data.subject_sessions.length)} unit="mapel" />
            </ul>

            {data.approved_sessions === 0 ? (
              <Card>
                <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}. Pilih bulan lain untuk melihat perkembangan anak.`} />
              </Card>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="flex min-w-0 flex-col gap-4">
                  <MonthlyLearningSummaryCard
                    period={period}
                    approvedSessionCount={ai.approvedSessionCount ?? data.approved_sessions}
                    summary={ai.monthly}
                    isGenerating={ai.monthlyGenerating}
                    error={ai.monthlyError}
                    onGenerate={ai.generateMonthly}
                  />
                  <SectionCard
                    id="recent-sessions-title"
                    title="Sesi terakhir"
                    actions={<Link to={notesLink} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-primary">Lihat semua catatan</Link>}
                  >
                    <ol className="mt-1 divide-y divide-border">
                      {detail.sessions.slice(0, 5).map((session) => {
                        const style = subjectStyle(session.subject_name);
                        return (
                          <li key={session.id} className="flex items-center gap-3 py-3">
                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${style.tileClass}`}>
                              <style.icon aria-hidden className={`size-5 ${style.iconClass}`} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold break-words text-text">{session.subject_name}</p>
                              <p className="text-meta text-muted">{session.tutor_name} · {formatDuration(session.duration_minutes)}</p>
                            </div>
                            <time dateTime={session.lesson_date} className="shrink-0 text-meta text-muted">{formatShortDate(session.lesson_date)}</time>
                          </li>
                        );
                      })}
                    </ol>
                  </SectionCard>
                </div>
                <SectionCard id="subjects-title" title="Pelajaran bulan ini">
                  <ul className="mt-1 divide-y divide-border">
                    {data.subject_sessions.map((item) => {
                      const style = subjectStyle(item.name);
                      return (
                        <li key={item.name} className="flex items-center gap-3 py-3">
                          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${style.tileClass}`}>
                            <style.icon aria-hidden className={`size-[1.125rem] ${style.iconClass}`} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="break-words text-sm font-medium text-text">{item.name}</span>
                              <span className="shrink-0 text-meta text-muted">{item.sessions} sesi</span>
                            </div>
                            <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                              <div className={`h-full rounded-full ${style.barClass}`} style={{ width: `${(item.sessions / maxSessions) * 100}%` }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </SectionCard>
              </div>
            )}
          </>
        );
      }}
    </QueryView>
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
