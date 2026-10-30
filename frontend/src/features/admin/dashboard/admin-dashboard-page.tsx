import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { StatusBadge } from '../../../components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/feedback';
import { Card, PageHeader, StatCard } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminAttendance, fetchAdminDashboard } from '../api';

export function AdminDashboardPage() {
  const [period, setPeriod] = usePeriodParam();
  const summary = useQuery({ queryKey: queryKeys.admin.dashboard(period), queryFn: () => fetchAdminDashboard(period) });
  const pendingFilters = { period, status: 'pending' as const, page: 1, page_size: 5 };
  const pending = useQuery({
    queryKey: queryKeys.admin.attendance(pendingFilters),
    queryFn: () => fetchAdminAttendance(pendingFilters),
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan operasional ${formatPeriod(period)} (berdasarkan tanggal les).`}
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Tutor aktif" value={summary.data.active_tutors} />
          <StatCard label="Siswa aktif" value={summary.data.active_students} />
          <StatCard label="Sesi bulan ini" value={summary.data.total_sessions} />
          <StatCard label="Menunggu verifikasi" value={summary.data.status_counts.pending} />
          <StatCard label="Disetujui" value={summary.data.status_counts.approved} />
          <StatCard label="Perlu revisi" value={summary.data.status_counts.revision_requested} />
          <StatCard label="Temuan anomali belum direview" value={summary.data.anomaly_findings_pending_review} />
          <StatCard
            label="Estimasi honor (sesi disetujui)"
            value={formatRupiah(summary.data.honor.estimated_amount)}
          />
        </dl>
      )}

      <Card
        title="Sesi menunggu verifikasi"
        actions={
          <Link to={`/admin/absensi?period=${period}&status=pending`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Lihat semua <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
      >
        {pending.isPending ? (
          <LoadingState />
        ) : pending.isError ? (
          <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
        ) : pending.data.items.length === 0 ? (
          <EmptyState title="Tidak ada sesi yang menunggu verifikasi" description="Semua sesi pada periode ini sudah ditinjau." />
        ) : (
          <ul className="divide-y divide-border">
            {pending.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-text">
                    {item.student_name} · {item.subject_name}
                  </p>
                  <p className="text-muted">
                    {item.tutor_name} · {formatLessonDate(item.lesson_date)} · {formatDuration(item.duration_minutes)}
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
