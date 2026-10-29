import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '../../components/ui/feedback';
import { PageHeader } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { formatPeriod } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { PayrollView } from '../shared/payroll-view';
import { fetchTutorPayroll } from './api';

export function TutorPayrollPage() {
  const [period, setPeriod] = usePeriodParam();
  const payroll = useQuery({ queryKey: queryKeys.tutor.payroll(period), queryFn: () => fetchTutorPayroll(period) });

  return (
    <>
      <PageHeader
        title="Honor Saya"
        description={`Estimasi honor ${formatPeriod(period)} dari sesi yang disetujui Admin.`}
        actions={<PeriodSelector value={period} onChange={setPeriod} />}
      />
      {payroll.isPending ? (
        <LoadingState />
      ) : payroll.isError ? (
        <ErrorState error={payroll.error} onRetry={() => void payroll.refetch()} />
      ) : (
        <PayrollView payroll={payroll.data} showTutorName={false} />
      )}
    </>
  );
}
