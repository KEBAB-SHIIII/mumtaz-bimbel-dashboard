import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarCheck, Clock } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import type { ParentProgressItem, ParentStudent } from '@mumtaz/contracts';
import { itemEnter } from '../../components/ui/animated-list';
import { Avatar } from '../../components/ui/avatar';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { Select } from '../../components/ui/field';
import { Card, PageHeader, StatCard } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { QueryView } from '../../components/ui/query-view';
import { LoadingSwitch, SkeletonCardList, SkeletonProfile, SkeletonStatCards } from '../../components/ui/skeleton';
import { formatDuration, formatLessonDate, formatPeriod } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { useSearchState } from '../../lib/use-search-state';
import { fetchParentDashboard, fetchParentProgress, fetchParentStudents } from './api';

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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="parent-student" className="text-sm font-medium text-text">Anak</label>
      <Select id="parent-student" value={selected.id} onChange={(e) => onSelect(e.target.value)} className="sm:w-56">
        {items.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
      </Select>
    </div>
  );
}

/** Timeline sesi (mobile-first): titik + garis pandu, tanggal di atas, isi sebagai kartu ringan. */
function Timeline({ sessions }: { sessions: ParentProgressItem[] }) {
  return (
    <ol className="flex flex-col px-4 py-4 sm:px-5">
      {sessions.map((session, index) => (
        <m.li
          key={session.id}
          {...itemEnter(index)}
          className="relative flex gap-3 pb-5 last:pb-0 before:absolute before:start-[0.3125rem] before:top-4 before:bottom-0 before:w-px before:bg-border last:before:hidden"
        >
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary-subtle" />
          <article className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-meta text-muted tabular-nums">
              <time dateTime={session.lesson_date}>{formatLessonDate(session.lesson_date)}</time> · {formatDuration(session.duration_minutes)}
            </p>
            <h3 className="text-card-title text-text">{session.subject_name}</h3>
            <p className="text-meta text-muted">Tutor: {session.tutor_name}</p>
            <dl className="mt-1 flex flex-col gap-1.5 rounded-md bg-surface-muted px-3 py-2.5 text-sm">
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
              {session.next_focus && (
                <div>
                  <dt className="text-meta text-muted">Fokus berikutnya</dt>
                  <dd className="text-pretty break-words text-text">{session.next_focus}</dd>
                </div>
              )}
            </dl>
          </article>
        </m.li>
      ))}
    </ol>
  );
}

/** Identitas anak (avatar dari ID murid internal, bukan ID Akses Orang Tua). */
function ChildCard({ student, children }: { student: ParentStudent; children?: ReactNode }) {
  return (
    <section aria-label="Data anak" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar seed={student.id} name={student.full_name} size={40} decorative />
        <div className="min-w-0">
          <p className="truncate text-card-title text-text">{student.full_name}</p>
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
        <PeriodSelector value={period} onChange={setPeriod} />
      </ChildCard>
      {children(selected, period)}
    </>
  );
}

/** Progress Anak: hanya sesi disetujui; tanpa catatan internal, anomali, atau honor. */
export function ParentDashboardPage() {
  return (
    <ParentPageFrame title="Progress Anak" description="Ringkasan sesi belajar yang sudah diverifikasi.">
      {(student, period) => <ProgressSummary studentId={student.id} period={period} />}
    </ParentPageFrame>
  );
}

function ProgressSummary({ studentId, period }: { studentId: string; period: string }) {
  const summary = useQuery({ queryKey: queryKeys.parent.dashboard(studentId, period), queryFn: () => fetchParentDashboard(studentId, period) });
  const progress = useQuery({ queryKey: queryKeys.parent.progress(studentId, period), queryFn: () => fetchParentProgress(studentId, period) });

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
            <StatCard
              index={2}
              className="max-sm:col-span-2"
              icon={BookOpen}
              accent="violet"
              label="Mata pelajaran"
              count={{ value: data.subjects.length }}
              hint={data.subjects.join(', ') || '—'}
            />
          </dl>
          <Card title="Sesi terbaru" description={formatPeriod(period)}>
            {detail.sessions.length === 0 ? (
              <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
            ) : (
              <Timeline sessions={detail.sessions.slice(0, 5)} />
            )}
          </Card>
        </>
      )}
    </QueryView>
  );
}

export function ParentHistoryPage() {
  return (
    <ParentPageFrame title="Riwayat Pembelajaran" description="Catatan sesi yang sudah diverifikasi.">
      {(student, period) => <HistoryList studentId={student.id} period={period} />}
    </ParentPageFrame>
  );
}

function HistoryList({ studentId, period }: { studentId: string; period: string }) {
  const progress = useQuery({ queryKey: queryKeys.parent.progress(studentId, period), queryFn: () => fetchParentProgress(studentId, period) });
  return (
    <QueryView query={progress} skeleton={<Card><SkeletonCardList count={4} /></Card>}>
      {(data) => (
        <Card title="Semua sesi" description={formatPeriod(period)}>
          {data.sessions.length === 0 ? (
            <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
          ) : (
            <Timeline sessions={data.sessions} />
          )}
        </Card>
      )}
    </QueryView>
  );
}
