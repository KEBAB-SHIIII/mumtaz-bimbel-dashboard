import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CircleCheck, Clock, NotebookPen, PencilLine, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { AnimatedList } from '../../components/ui/motion/animated-list';
import { StatusBadge } from '../../components/ui/data-display/status-badge';
import { EmptyState, InlineAlert } from '../../components/ui/feedback/states';
import { Card, PageHeader, StatCard } from '../../components/ui/surfaces/layout-primitives';
import { PeriodSelector } from '../../components/ui/forms/period-selector';
import { QueryView } from '../../components/ui/feedback/query-view';
import { RecentSessionsSkeleton, SkeletonStatCards } from '../../components/ui/feedback/skeleton';
import { useCurrentUser } from '../auth/session';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';
import { usePeriodParam } from '../../hooks/use-period-param';
import { queryKeys } from '../../lib/query-keys';
import { fetchTutorAttendance, fetchTutorDashboard } from './api';

const LINK_CLASS = 'inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11';

/** Aksi utama tutor, sejajar dengan kontrol periode tanpa banner tambahan. */
function FillAttendanceCta() {
  return (
    <Link
      to="/tutor/absensi"
      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-linear-to-r from-brand-gradient-from/65 via-brand-gradient-via/50 to-brand-gradient-to/45 px-3.5 text-sm font-medium whitespace-nowrap text-brand-ink shadow-sm ring-1 ring-inset ring-brand-border/60 transition-[filter] duration-150 hover:brightness-95 pointer-coarse:h-11 motion-reduce:transition-none"
    >
      <NotebookPen aria-hidden className="size-4" />
      Isi absensi
    </Link>
  );
}

export function TutorDashboardPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = usePeriodParam();
  const summary = useQuery({ queryKey: queryKeys.tutor.dashboard(period), queryFn: () => fetchTutorDashboard(period) });
  const recentFilters = { period, page: 1, page_size: 5 };
  const recent = useQuery({ queryKey: queryKeys.tutor.attendance(recentFilters), queryFn: () => fetchTutorAttendance(recentFilters) });

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-page-title-mobile text-balance text-text lg:text-page-title">Halo, {user.full_name}!</h2>
          <p className="mt-1 text-sm text-pretty text-muted">Ringkasan sesi Anda pada {formatPeriod(period)}.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <FillAttendanceCta />
        </div>
      </div>

      <QueryView query={summary} skeleton={<SkeletonStatCards count={5} />}>
        {(data) => (
          <>
            {data.status_counts.revision_requested > 0 && (
              <InlineAlert tone="warning" title={`${data.status_counts.revision_requested} sesi perlu direvisi`}>
                <Link to={`/tutor/riwayat?period=${period}&status=revision_requested`} className={LINK_CLASS}>
                  Lihat sesi <ArrowRight aria-hidden className="size-4" />
                </Link>
              </InlineAlert>
            )}
            <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
              <StatCard
                index={0}
                icon={CalendarCheck}
                accent="green"
                label="Total sesi"
                count={{ value: Object.values(data.status_counts).reduce((a, b) => a + b, 0) }}
                to={`/tutor/riwayat?period=${period}`}
              />
              <StatCard
                index={1}
                icon={Wallet}
                accent="orange"
                label="Pendapatan bersih"
                count={{ value: Number(data.honor.estimated_amount), format: (value) => formatRupiah(String(value)) }}
                to={`/tutor/honor?period=${period}`}
              />
              <StatCard index={2} icon={Clock} accent="blue" label="Menunggu validasi" count={{ value: data.status_counts.pending }} to={`/tutor/riwayat?period=${period}&status=pending`} />
              <StatCard index={3} icon={CircleCheck} accent="green" label="Disetujui" count={{ value: data.status_counts.approved }} to={`/tutor/riwayat?period=${period}&status=approved`} />
              <StatCard
                index={4}
                className="max-lg:col-span-2"
                icon={PencilLine}
                accent="coral"
                label="Perlu revisi"
                count={{ value: data.status_counts.revision_requested }}
                to={`/tutor/riwayat?period=${period}&status=revision_requested`}
              />
            </dl>
          </>
        )}
      </QueryView>

      <Card
        title="Sesi terbaru"
        description={formatPeriod(period)}
        actions={
          <Link to={`/tutor/riwayat?period=${period}`} className={LINK_CLASS}>
            Lihat riwayat <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
      >
        <QueryView query={recent} skeleton={<RecentSessionsSkeleton />} className="flex flex-col" framed={false}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                title="Belum ada sesi bulan ini"
                description="Catat sesi les yang sudah berlangsung lewat Form Absensi; data divalidasi otomatis."
              />
            ) : (
              <AnimatedList
                aria-label="Lima sesi terbaru"
                className="divide-y divide-border"
                items={data.items}
                getKey={(item) => item.id}
                renderItem={(item) => (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words text-text">
                        {item.student_name} · {item.subject_name}
                      </p>
                      <p className="text-meta text-muted tabular-nums">
                        {formatLessonDate(item.lesson_date)} · {formatDuration(item.duration_minutes)}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                )}
              />
            )
          }
        </QueryView>
      </Card>
    </>
  );
}
