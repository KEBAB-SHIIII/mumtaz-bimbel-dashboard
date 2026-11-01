import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
import { QueryView } from '../../../components/ui/query-view';
import { SkeletonDataTable, SkeletonStatCards } from '../../../components/ui/skeleton';
import { formatPeriod } from '../../../lib/format';
import { usePeriodParam } from '../../../lib/period';
import { queryKeys } from '../../../lib/query-keys';
import { AdminPayrollView } from '../../shared/payroll-view';
import { fetchPayrollPreview } from '../api';

export function AdminPayrollPage() {
  const [period, setPeriod] = usePeriodParam();
  const payroll = useQuery({ queryKey: queryKeys.admin.payroll(period), queryFn: () => fetchPayrollPreview(period) });

  return (
    <>
      <PageHeader
        title="Honor Tutor"
        description={`Honor ${formatPeriod(period)} untuk crosscheck absensi dengan tutor. Pendapatan bersih tutor = tarif les − potongan admin per sesi.`}
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />
      <QueryView
        query={payroll}
        skeleton={
          <>
            <SkeletonStatCards count={3} />
            <div className="rounded-lg border border-border bg-surface shadow-sm">
              <SkeletonDataTable headers={['Tanggal les', 'Siswa', 'Mata pelajaran', 'Durasi', 'Validitas', 'Nominal']} rows={4} />
            </div>
          </>
        }
      >
        {(data) => <AdminPayrollView payroll={data} />}
      </QueryView>
    </>
  );
}
