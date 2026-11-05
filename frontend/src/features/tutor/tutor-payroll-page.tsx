import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/ui/surfaces/layout-primitives';
import { PeriodSelector } from '../../components/ui/forms/period-selector';
import { QueryView } from '../../components/ui/feedback/query-view';
import { SkeletonDataTable, SkeletonStatCards } from '../../components/ui/feedback/skeleton';
import { formatPeriod } from '../../lib/format';
import { usePeriodParam } from '../../hooks/use-period-param';
import { queryKeys } from '../../lib/query-keys';
import { TutorPayrollView } from '../shared/payroll-view';
import { fetchTutorPayroll } from './api';

export function TutorPayrollPage() {
  const [period, setPeriod] = usePeriodParam();
  const payroll = useQuery({ queryKey: queryKeys.tutor.payroll(period), queryFn: () => fetchTutorPayroll(period) });

  return (
    <>
      <PageHeader
        title="Honor Saya"
        description={`Pendapatan bersih ${formatPeriod(period)} dari sesi yang valid, setelah potongan admin.`}
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
        {(data) => <TutorPayrollView payroll={data} />}
      </QueryView>
    </>
  );
}
