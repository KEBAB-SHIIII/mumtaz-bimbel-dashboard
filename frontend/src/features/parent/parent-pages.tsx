import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ParentProgressItem, ParentStudent } from '@mumtaz/contracts';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/feedback';
import { Select } from '../../components/ui/field';
import { Card, FilterBar, PageHeader, StatCard } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
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
      <Select id="parent-student" value={selected.id} onChange={(e) => onSelect(e.target.value)} className="w-56">
        {items.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
      </Select>
    </div>
  );
}

function Timeline({ sessions }: { sessions: ParentProgressItem[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-col gap-1 px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-text">{session.subject_name}</p>
            <p className="text-sm text-muted">
              {formatLessonDate(session.lesson_date)} · {formatDuration(session.duration_minutes)} · {session.tutor_name}
            </p>
          </div>
          <p className="text-sm text-text">
            <span className="text-muted">Materi:</span> {session.learning_material}
          </p>
          {session.learning_notes && (
            <p className="text-sm text-text">
              <span className="text-muted">Catatan tutor:</span> {session.learning_notes}
            </p>
          )}
          {session.next_focus && (
            <p className="text-sm text-text">
              <span className="text-muted">Fokus berikutnya:</span> {session.next_focus}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function ParentPageFrame({ title, description, children }: { title: string; description: string; children: (student: ParentStudent, period: string) => ReactNode }) {
  const [period, setPeriod] = usePeriodParam();
  const { students, items, selected, select } = useSelectedStudent();

  if (students.isPending) return <LoadingState />;
  if (students.isError) return <ErrorState error={students.error} onRetry={() => void students.refetch()} />;
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
      <PageHeader title={title} description={`${selected.full_name} · ${selected.grade} · ${selected.school_name}`} />
      <FilterBar>
        <StudentSelector items={items} selected={selected} onSelect={select} />
        <PeriodSelector value={period} onChange={setPeriod} />
      </FilterBar>
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

  if (summary.isPending || progress.isPending) return <LoadingState />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (progress.isError) return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />;

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Sesi terverifikasi" value={summary.data.approved_sessions} />
        <StatCard label="Total durasi" value={formatDuration(summary.data.approved_duration_minutes)} />
        <StatCard label="Mata pelajaran" value={summary.data.subjects.length} hint={<span className="text-xs text-muted">{summary.data.subjects.join(', ') || '—'}</span>} />
      </dl>
      <Card title="Sesi terbaru">
        {progress.data.sessions.length === 0 ? (
          <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
        ) : (
          <Timeline sessions={progress.data.sessions.slice(0, 5)} />
        )}
      </Card>
    </>
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
  if (progress.isPending) return <LoadingState />;
  if (progress.isError) return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />;
  return (
    <Card>
      {progress.data.sessions.length === 0 ? (
        <EmptyState title="Belum ada sesi terverifikasi" description={`Belum ada sesi yang diverifikasi pada ${formatPeriod(period)}.`} />
      ) : (
        <Timeline sessions={progress.data.sessions} />
      )}
    </Card>
  );
}
