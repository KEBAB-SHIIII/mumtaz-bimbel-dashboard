import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CircleCheck, Clock, NotebookPen, PencilLine, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { AnimatedList } from '../../components/ui/animated-list';
import { StatusBadge } from '../../components/ui/badge';
import { EmptyState, InlineAlert } from '../../components/ui/feedback';
import { Card, PageHeader, StatCard } from '../../components/ui/layout-primitives';
import { PeriodSelector } from '../../components/ui/period-selector';
import { QueryView } from '../../components/ui/query-view';
import { SkeletonCardList, SkeletonStatCards } from '../../components/ui/skeleton';
import { useCurrentUser } from '../auth/session';
import { formatDuration, formatLessonDate, formatPeriod, formatRupiah } from '../../lib/format';
import { usePeriodParam } from '../../lib/period';
import { queryKeys } from '../../lib/query-keys';
import { fetchTutorAttendance, fetchTutorDashboard } from './api';

const LINK_CLASS = 'inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11';

/** CTA utama Tutor (mobile-first): satu aksi terisi warna per tampilan. */
function FillAttendanceCta() {
  return (
    <section
      aria-labelledby="cta-attendance"
      className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-linear-to-br from-primary-subtle to-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <NotebookPen className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="cta-attendance" className="text-card-title text-text">Sudah selesai mengajar?</h2>
          <p className="text-meta text-pretty text-muted">Catat sesinya sekarang; data divalidasi otomatis.</p>
        </div>
      </div>
      <Link
        to="/tutor/absensi"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-[background-color,scale] duration-150 hover:bg-primary/90 active:scale-[0.96] sm:h-10 motion-reduce:transition-none"
      >
        <NotebookPen aria-hidden className="size-4" /> Isi Form Absensi
      </Link>
    </section>
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
      <PageHeader title={`Halo, ${user.full_name}`} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-pretty text-muted">Ringkasan sesi Anda pada {formatPeriod(period)}.</p>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <FillAttendanceCta />

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
        <QueryView query={recent} skeleton={<SkeletonCardList count={3} />} className="flex flex-col" framed={false}>
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
