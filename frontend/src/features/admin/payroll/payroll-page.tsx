import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '../../../components/ui/feedback';
import { PageHeader } from '../../../components/ui/layout-primitives';
import { PeriodSelector } from '../../../components/ui/period-selector';
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
      {payroll.isPending ? (
        <LoadingState />
      ) : payroll.isError ? (
        <ErrorState error={payroll.error} onRetry={() => void payroll.refetch()} />
      ) : (
        <AdminPayrollView payroll={payroll.data} />
      )}
    </>
  );
}
