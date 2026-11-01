import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { ErrorState, LoadingState } from '../../../components/ui/feedback';
import { PageHeader, StatCard } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { formatPeriod, formatRupiah } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminDashboard } from '../api';

// Library grafik dimuat terpisah: judul & kartu metrik tampil tanpa menunggu chunk grafik.
const DashboardCharts = lazy(() => import('./dashboard-charts').then((m) => ({ default: m.DashboardCharts })));

export function AdminDashboardPage() {
  const [period, setPeriod] = usePeriodParam();
  const summary = useQuery({
    queryKey: queryKeys.admin.dashboard(period),
    queryFn: () => fetchAdminDashboard(period),
    // Angka & grafik pendapatan mengikuti data terbaru tanpa muat ulang halaman.
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan ${formatPeriod(period)} (berdasarkan tanggal les).`}
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total tutor aktif" value={summary.data.active_tutors} to="/admin/master-data/tutor" />
          <StatCard label="Total siswa" value={summary.data.students_with_sessions} hint={<span className="text-xs text-muted">Yang punya sesi bulan ini</span>} to={`/admin/absensi?period=${period}`} />
          <StatCard label="Total sesi bulan ini" value={summary.data.total_sessions} to={`/admin/absensi?period=${period}`} />
          <StatCard
            label="Total omzet kotor"
            value={formatRupiah(summary.data.gross_revenue)}
            hint={<span className="text-xs text-muted">Sebelum gaji tutor &amp; potongan</span>}
            to={`/admin/penagihan?period=${period}`}
          />
        </dl>
      )}

      {summary.data && (
        <Suspense fallback={<LoadingState label="Memuat grafik…" />}>
          <DashboardCharts revenue={summary.data.revenue_by_month} />
        </Suspense>
      )}
    </>
  );
}
