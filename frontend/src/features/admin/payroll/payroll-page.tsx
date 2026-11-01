import { RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { SearchSelect } from '../../../components/ui/field';
import { useSearchState } from '../../../lib/use-search-state';
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
  const { values, update } = useSearchState(['tutor_id'] as const);
  const payroll = useQuery({ queryKey: queryKeys.admin.payroll(period), queryFn: () => fetchPayrollPreview(period) });

  return (
    <>
      <PageHeader
        title="Honor Tutor"
        description={`Honor ${formatPeriod(period)} untuk crosscheck absensi dengan tutor. Pendapatan bersih tutor = tarif les − potongan admin per sesi.`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Filter honor tutor" className="flex flex-wrap items-end gap-2">
                <div className="w-60 max-w-full">
                  <label htmlFor="payroll-tutor-filter" className="mb-1.5 block text-sm font-medium text-text">Tutor</label>
                  <SearchSelect
                  id="payroll-tutor-filter"
                  placeholder="Cari nama tutor…"
                  value={values.tutor_id}
                  onChange={(next) => update({ tutor_id: next })}
                  items={[
                    { value: '', label: 'Semua tutor' },
                    ...(payroll.data?.tutors ?? []).map((tutor) => ({ value: tutor.tutor_id, label: tutor.tutor_name })).sort((a, b) => a.label.localeCompare(b.label, 'id')),
                    ...(values.tutor_id && !(payroll.data?.tutors ?? []).some((tutor) => tutor.tutor_id === values.tutor_id)
                      ? [{ value: values.tutor_id, label: 'Tutor tidak tersedia pada periode ini' }]
                      : []),
                  ]}
                  />
                </div>
                {values.tutor_id && (
                  <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => update({ tutor_id: '' })}>
                    Reset filter
                  </Button>
                )}
              </div>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        }
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
        {(data) => (
          <AdminPayrollView
            payroll={data}
            tutorId={values.tutor_id}
          />
        )}
      </QueryView>
    </>
  );
}
