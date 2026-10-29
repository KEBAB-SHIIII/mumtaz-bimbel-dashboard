import { useQuery } from '@tanstack/react-query';
import { ArrowRight, NotebookPen } from 'lucide-react';
import { Link } from 'react-router';
import { DemoRateNotice, ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { PageHeader, StatCard } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { useCurrentUser } from '../auth/session';
import { formatPeriod, formatRupiah } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { fetchTutorDashboard } from './api';

export function TutorDashboardPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = usePeriodParam();
  const summary = useQuery({ queryKey: queryKeys.tutor.dashboard(period), queryFn: () => fetchTutorDashboard(period) });

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
            <StatCard label="Total sesi" value={Object.values(summary.data.status_counts).reduce((a, b) => a + b, 0)} />
            <StatCard label="Menunggu verifikasi" value={summary.data.status_counts.pending} />
            <StatCard label="Disetujui" value={summary.data.status_counts.approved} />
            <StatCard label="Perlu revisi" value={summary.data.status_counts.revision_requested} />
            <StatCard
              label="Estimasi honor"
              value={formatRupiah(summary.data.honor.estimated_amount)}
              hint={<DemoRateNotice label={summary.data.honor.demo_label} />}
            />
          </dl>
        </>
      )}
    </>
  );
}
