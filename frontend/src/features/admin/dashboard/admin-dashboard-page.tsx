import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, GraduationCap, UsersRound, Wallet } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { PageHeader, StatCard } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { QueryView } from '../../../components/ui/query-view';
import { SkeletonChart, SkeletonStatCards } from '../../../components/ui/skeleton';
import { formatPeriod, formatRupiah } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminDashboard } from '../api';

// Library grafik dimuat terpisah: judul & kartu metrik tampil tanpa menunggu chunk grafik.
const DashboardCharts = lazy(() => import('./dashboard-charts').then((m) => ({ default: m.DashboardCharts })));

function ChartsSkeleton() {
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <SkeletonChart height={256} />
      </div>
      <SkeletonChart height={256} />
    </div>
  );
}

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
      <PageHeader title="Dashboard" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-page-title-mobile text-balance text-text lg:text-page-title">Halo, Admin!</h2>
          <p className="mt-1 text-sm text-pretty text-muted">Ringkasan {formatPeriod(period)} (berdasarkan tanggal les).</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <QueryView
        query={summary}
        skeleton={
          <>
            <SkeletonStatCards />
            <ChartsSkeleton />
          </>
        }
      >
        {(data) => (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard index={0} icon={UsersRound} accent="blue" label="Total tutor aktif" count={{ value: data.active_tutors }} to="/admin/master-data/tutor" />
              <StatCard
                index={1}
                icon={GraduationCap}
                accent="violet"
                label="Total siswa"
                count={{ value: data.students_with_sessions }}
                hint="Yang punya sesi bulan ini"
                to={`/admin/absensi?period=${period}`}
              />
              <StatCard index={2} icon={CalendarCheck} accent="green" label="Total sesi bulan ini" count={{ value: data.total_sessions }} to={`/admin/absensi?period=${period}`} />
              <StatCard
                index={3}
                className="max-sm:col-span-2"
                icon={Wallet}
                accent="orange"
                label="Total omzet kotor"
                count={{ value: Number(data.gross_revenue), format: (value) => formatRupiah(String(value)) }}
                hint="Sebelum gaji tutor & potongan"
                to={`/admin/penagihan?period=${period}`}
              />
            </dl>
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts revenue={data.revenue_by_month} />
            </Suspense>
          </>
        )}
      </QueryView>
    </>
  );
}
