import { useQuery } from '@tanstack/react-query';
import { ArrowRight, NotebookPen } from 'lucide-react';
import { Link } from 'react-router';
import { StatusBadge } from '../../components/ui/badge';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { Card, PageHeader, StatCard } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { useCurrentUser } from '../auth/session';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { fetchTutorAttendance, fetchTutorDashboard } from './api';

export function TutorDashboardPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = usePeriodParam();
  const summary = useQuery({ queryKey: queryKeys.tutor.dashboard(period), queryFn: () => fetchTutorDashboard(period) });
  const recentFilters = { period, page: 1, page_size: 5 };
  const recent = useQuery({ queryKey: queryKeys.tutor.attendance(recentFilters), queryFn: () => fetchTutorAttendance(recentFilters) });

  return (
    <>
      <PageHeader
        title={`Halo, ${user.full_name}`}
        description={`Ringkasan sesi Anda pada ${formatPeriod(period)}.`}
        actions={
          <>
            <PeriodSelector value={period} onChange={setPeriod} />
            <Link
              to="/tutor/absensi"
              className="inline-flex h-10 items-center gap-2 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <NotebookPen aria-hidden className="size-4" /> Isi Form Absensi
            </Link>
          </>
        }
      />
      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          {summary.data.status_counts.revision_requested > 0 && (
            <InlineAlert tone="warning" title={`${summary.data.status_counts.revision_requested} sesi perlu direvisi`}>
              <Link to={`/tutor/riwayat?period=${period}&status=revision_requested`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Lihat sesi <ArrowRight aria-hidden className="size-4" />
              </Link>
            </InlineAlert>
          )}
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Total sesi" value={Object.values(summary.data.status_counts).reduce((a, b) => a + b, 0)} to={`/tutor/riwayat?period=${period}`} />
            <StatCard label="Menunggu validasi" value={summary.data.status_counts.pending} to={`/tutor/riwayat?period=${period}&status=pending`} />
            <StatCard label="Disetujui" value={summary.data.status_counts.approved} to={`/tutor/riwayat?period=${period}&status=approved`} />
            <StatCard label="Perlu revisi" value={summary.data.status_counts.revision_requested} to={`/tutor/riwayat?period=${period}&status=revision_requested`} />
            <StatCard
              label="Pendapatan bersih"
              value={formatRupiah(summary.data.honor.estimated_amount)}
              to={`/tutor/honor?period=${period}`}
            />
          </dl>
        </>
      )}

      <Card
        title="Sesi terbaru"
        actions={
          <Link to={`/tutor/riwayat?period=${period}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Lihat riwayat <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
      >
        {recent.isPending ? (
          <LoadingState />
        ) : recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
        ) : recent.data.items.length === 0 ? (
          <EmptyState
            title="Belum ada sesi bulan ini"
            description="Catat sesi les yang sudah berlangsung lewat Form Absensi; data divalidasi otomatis."
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-text">
                    {item.student_name} · {item.subject_name}
                  </p>
                  <p className="text-muted">
                    {formatLessonDate(item.lesson_date)} · {formatDuration(item.duration_minutes)}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
