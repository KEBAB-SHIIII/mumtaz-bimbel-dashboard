import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarCheck, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type {
  LearningSummaryView,
  ParentLearningSummariesResponse,
  ParentProgressItem,
  ParentStudent,
} from '@mumtaz/contracts';
import { itemEnter } from '../../components/ui/motion/animated-list';
import { Avatar } from '../../components/ui/data-display/avatar';
import { Pagination } from '../../components/ui/data-display/data-table';
import { EmptyState, ErrorState } from '../../components/ui/feedback/states';
import { FilterSelect } from '../../components/ui/forms/filter-select';
import { Card, PageHeader, StatCard } from '../../components/ui/surfaces/layout-primitives';
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

const noteColors = [
  'bg-accent-green-subtle before:bg-accent-green/25',
  'bg-accent-blue-subtle before:bg-accent-blue/25',
  'bg-accent-violet-subtle before:bg-accent-violet/25',
];
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
          className={`relative min-w-0 rounded-md border border-black/5 p-4 shadow-sm before:pointer-events-none before:absolute before:top-0 before:left-1/2 before:h-3 before:w-12 before:-translate-x-1/2 before:-translate-y-1/2 before:-rotate-3 sm:p-5 ${noteColors[index % noteColors.length]}`}
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

/** Identitas anak (avatar dari ID murid internal, bukan ID Akses Orang Tua). */
function ChildCard({ student, children }: { student: ParentStudent; children?: ReactNode }) {
  return (
    <section aria-label="Data anak" className="relative isolate flex flex-col gap-4 rounded-lg border border-brand-border/60 bg-linear-to-br from-primary-subtle to-brand-gradient-to p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 150 62" className="pointer-events-none absolute end-2 top-1 -z-10 w-24 text-primary/25 sm:end-1/4 sm:w-36">
        <path d="M3 53c24 4 49-6 48-20-1-11-22-8-17 3 6 14 37 13 57-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 5" />
        <path d="m91 23 43-17-15 33-11-10-7 5 2-10Z" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="m103 24 31-18-26 23" fill="none" stroke="currentColor" strokeLinejoin="round" />
      </svg>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar seed={student.id} name={student.full_name} size={40} decorative />
        <div className="min-w-0">
          <p className="text-card-title break-words text-text">{student.full_name}</p>
          <p className="text-meta text-pretty text-muted">
            {student.grade} · {student.school_name}
          </p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-end gap-3">{children}</div>}
    </section>
  );
}

function ParentPageFrame({ title, description, children }: { title: string; description: string; children: (student: ParentStudent, period: string) => ReactNode }) {
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
        <PageHeader title={title} description={description} />
        <Card>
          <EmptyState title="Belum ada anak yang terhubung" description="Hubungi Admin bimbel untuk menghubungkan akun dengan data anak." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} />
      <ChildCard student={selected}>
        <StudentSelector items={items} selected={selected} onSelect={select} />
        <PeriodSelector value={period} onChange={setPeriod} hideLabel />
      </ChildCard>
      {children(selected, period)}
    </>
  );
}

/** Progress Anak: hanya sesi disetujui; tanpa catatan internal, anomali, atau honor. */
export function ParentDashboardPage() {
  return (
    <ParentPageFrame title="Progress Anak" description="Ringkasan sesi belajar yang sudah diverifikasi.">
      {(student, period) => (
        <ProgressSummary key={`${student.id}:${period}`} studentId={student.id} period={period} />
      )}
    </ParentPageFrame>
  );
}

function ProgressSummary({ studentId, period }: { studentId: string; period: string }) {
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

  return (
    <QueryView query={combined} skeleton={<><SkeletonStatCards count={3} /><Card><SkeletonCardList count={2} /></Card></>}>
      {({ summary: data, progress: detail }) => (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard index={0} icon={CalendarCheck} accent="green" label="Sesi terverifikasi" count={{ value: data.approved_sessions }} />
            <StatCard index={1} icon={Clock} accent="blue" label="Total durasi" value={formatDuration(data.approved_duration_minutes)} />
            <StatCard index={2} className="max-sm:col-span-2" icon={BookOpen} accent="violet" label="Mata pelajaran" count={{ value: data.subjects.length }} />
          </dl>
          <MonthlyLearningSummaryCard
            period={period}
            approvedSessionCount={ai.approvedSessionCount ?? data.approved_sessions}
            summary={ai.monthly}
            isGenerating={ai.monthlyGenerating}
            error={ai.monthlyError}
            onGenerate={ai.generateMonthly}
          />
          <Card title="Sesi terbaru" description={formatPeriod(period)}>
            {detail.sessions.length === 0 ? (
              <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
            ) : (
              <ol className="divide-y divide-border px-4 sm:px-5">
                {detail.sessions.slice(0, 5).map((session) => (
                  <li key={session.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0 break-words">
                      <p className="font-medium text-text">{session.subject_name}</p>
                      <p className="text-sm text-muted">Tutor: {session.tutor_name}</p>
                    </div>
                    <p className="text-sm text-muted sm:shrink-0">
                      <time dateTime={session.lesson_date}>{formatLessonDate(session.lesson_date)}</time> · {formatDuration(session.duration_minutes)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <div className="border-t border-border px-4 py-2 sm:px-5">
              <Link to={`/orang-tua-murid/riwayat?${new URLSearchParams({ student_id: studentId, period })}`} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-primary">Lihat semua sesi</Link>
            </div>
          </Card>
        </>
      )}
    </QueryView>
  );
}

export function ParentSubjectsPage() {
  return (
    <ParentPageFrame title="Mata Pelajaran" description="Pelajaran yang diikuti anak berdasarkan sesi terverifikasi pada bulan pilihan.">
      {(student, period) => <SubjectList studentId={student.id} period={period} />}
    </ParentPageFrame>
  );
}

function SubjectList({ studentId, period }: { studentId: string; period: string }) {
  const query = useQuery({ queryKey: queryKeys.parent.dashboard(studentId, period), queryFn: () => fetchParentDashboard(studentId, period) });
  return (
    <QueryView query={query} skeleton={<Card><SkeletonCardList count={3} /></Card>}>
      {({ subjects }) => (
        <Card title={formatPeriod(period)}>
          {subjects.length ? (
            <ul className="divide-y divide-border px-4 sm:px-5">
              {subjects.map((name) => <li key={name} className="break-words py-3 font-medium text-text">{name}</li>)}
            </ul>
          ) : <EmptyState title="Belum ada mata pelajaran" description="Belum ada sesi terverifikasi pada bulan ini. Pilih bulan lain untuk melihat pelajaran anak." />}
        </Card>
      )}
    </QueryView>
  );
}

export function ParentHistoryPage() {
  return (
    <ParentPageFrame title="Riwayat Pembelajaran" description="Catatan sesi yang sudah diverifikasi.">
      {(student, period) => (
        <HistoryList key={`${student.id}:${period}`} studentId={student.id} period={period} />
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
