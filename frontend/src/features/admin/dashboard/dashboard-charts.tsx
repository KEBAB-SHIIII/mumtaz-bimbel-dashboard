import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminRevenue } from '@mumtaz/contracts';
import { Chip } from '../../../components/ui/data-display/chip';
import { Card } from '../../../components/ui/surfaces/layout-primitives';
import { FilterSelect } from '../../../components/ui/forms/filter-select';
import { formatPeriod, formatRupiah } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminRevenue } from '../api';
import { useThemeColors, type ThemeColors } from '../../../hooks/use-theme-colors';
import {
  SAMPLE_GRADE_COMPOSITION,
  SAMPLE_REGISTRATION_SOURCES,
  SAMPLE_STUDENT_GROWTH,
  SAMPLE_TUTOR_RANKING,
} from './sample-chart-data';

// Warna seri mengikuti kartu ringkasan dengan pastel yang sedikit lebih pekat.
const CHART_PALETTE = {
  sessions: '#8FCBA3',
  studentGrowth: '#73B98A',
  tutor: '#91BCE8',
  students: '#B7A4DE',
  revenue: '#E7B68E',
};

/**
 * Warna per jenjang: pastel yang sama dengan grafik lain (+ satu merah muda untuk jenjang kelima),
 * terikat ke jenjang, bukan urutan irisan. Urutan dipilih agar irisan bersebelahan (termasuk SMA↔PAUD–TK)
 * paling mudah dibedakan; karena pastel saling berdekatan, celah antar-irisan dan label legenda tetap wajib
 * sebagai penanda kedua. Jumlah murid tampil di tooltip saat irisan disorot.
 */
const GRADE_COLORS: Record<string, string> = {
  'PAUD–TK': CHART_PALETTE.revenue,
  'SD 1–3': CHART_PALETTE.students,
  'SD 4–6': CHART_PALETTE.sessions,
  SMP: CHART_PALETTE.tutor,
  SMA: '#E89AB0',
};

/** Legenda ringkas di bawah grafik: titik kecil dan label pendek dalam satu-dua baris (teks netral, bukan warna seri). */
function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-3 gap-y-1 p-0 text-meta text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const REVENUE_LEGEND = [
  { label: 'Omzet kotor', color: CHART_PALETTE.revenue },
  { label: 'Gaji tutor', color: CHART_PALETTE.tutor },
  { label: 'Pendapatan bersih bimbel', color: CHART_PALETTE.sessions },
];

const compactRupiah = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const formatCompactRupiah = (value: number) => `Rp${compactRupiah.format(value)}`;

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

function chartStyle(colors: ThemeColors, animate: boolean) {
  return {
    axis: { tick: { fontSize: 12, fill: colors.muted }, tickLine: false, axisLine: false } as const,
    // Tooltip putih bergaris tipis (Ref 2) yang meluncur halus mengikuti kursor (220ms ease-out).
    tooltip: {
      content: <ChartTooltip />,
      cursor: { stroke: colors.muted, strokeDasharray: '4 4' },
      isAnimationActive: animate,
      animationDuration: 220,
      animationEasing: 'ease-out',
    } as const,
    /** Titik aktif grafik area: cincin putih + keyframe `dot-in`. */
    activeDot: (fill: string) => ({ r: 5, strokeWidth: 2, stroke: colors.surface, fill, className: 'chart-dot' }),
    barCursor: { fill: colors.surfaceMuted },
  };
}

interface TooltipItem {
  name?: string | number;
  value?: number | string | readonly (number | string)[];
  color?: string;
  payload?: { fill?: string };
}

/** Isi tooltip umum: label + titik warna seri + nilai tabular; muncul dengan keyframe `pop-in`. */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly TooltipItem[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[0.625rem] border border-border bg-surface px-3 py-2 text-meta shadow-md animate-pop-in motion-reduce:animate-none">
      {label !== undefined && label !== '' && <p className="font-semibold text-text">{label}</p>}
      <dl className="mt-0.5 flex flex-col gap-0.5">
        {payload.map((item) => (
          <div key={String(item.name)} className="flex items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: item.color ?? item.payload?.fill }} />
            <dt className="text-muted">{item.name}</dt>
            <dd className="ms-auto ps-3 font-medium text-text tabular-nums">{String(item.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Kartu grafik; `sample` memberi label "Data contoh" kecil untuk angka yang belum dari data operasional. */
function ChartCard({ title, subtitle, summary, wide = false, sample = true, actions, children }: { title: string; subtitle: string; summary: string; wide?: boolean; sample?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} description={subtitle} actions={sample ? <Chip variant="caption">Data contoh</Chip> : actions} className={wide ? 'lg:col-span-2' : ''}>
      <figure className="m-0 px-2 py-4 sm:px-4" aria-label={`${title}${sample ? ' (data contoh)' : ''}: ${summary}`}>
        <div className="h-64 w-full">{children}</div>
      </figure>
    </Card>
  );
}

const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
/** "2026-10" → "Okt" (tahun sudah tampil di filter). */
const formatMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return monthLabel.format(new Date(Date.UTC(year, month - 1, 1)));
};

/** Pendapatan Jan–Des dari API (data asli); nominal string desimal → angka hanya untuk sumbu grafik. */
function toRevenueChart(months: AdminRevenue['months']) {
  return months.map((month) => ({
    month: formatMonth(month.period),
    title: formatPeriod(month.period),
    gross: Number(month.gross_revenue),
    salary: Number(month.tutor_salary),
    net: Number(month.net_revenue),
  }));
}

type RevenuePoint = ReturnType<typeof toRevenueChart>[number];

/** Tooltip pendapatan dengan penanda warna yang sama seperti seri grafik. */
function RevenueTooltip({ active, payload }: { active?: boolean; payload?: { payload?: RevenuePoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-[0.625rem] border border-border bg-surface px-3 py-2 text-meta shadow-md animate-pop-in motion-reduce:animate-none">
      <p className="font-semibold text-text">{point.title}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
        <dt className="flex items-center gap-2 font-medium text-text"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.revenue }} />Omzet kotor</dt>
        <dd className="text-end font-semibold text-text">{formatRupiah(String(point.gross))}</dd>
        <dt className="flex items-center gap-2 text-muted"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.tutor }} />Gaji tutor</dt>
        <dd className="text-end text-text">{formatRupiah(String(point.salary))}</dd>
        <dt className="flex items-center gap-2 text-muted"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.sessions }} />Pendapatan bersih bimbel</dt>
        <dd className="text-end text-text">{formatRupiah(String(point.net))}</dd>
      </dl>
    </div>
  );
}

/**
 * Seri grafik mengikuti warna kategori pada kartu ringkasan.
 * Pendapatan: tiga seri tidak ditumpuk agar setiap garis menunjukkan nominal sebenarnya.
 */
export function DashboardCharts() {
  const animate = !usePrefersReducedMotion();
  const colors = useThemeColors();
  const style = chartStyle(colors, animate);
  // Tanpa pilihan, backend memakai tahun terbaru yang punya sesi dihitung.
  const [year, setYear] = useState<number | undefined>(undefined);
  const revenue = useQuery({
    queryKey: queryKeys.admin.revenue(year ?? 'latest'),
    queryFn: () => fetchAdminRevenue(year),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const shownYear = revenue.data?.year ?? year;
  const yearOptions = (revenue.data?.years.length ? revenue.data.years : shownYear ? [shownYear] : []).map((y) => ({ value: String(y), label: String(y) }));
  const revenueData = revenue.data ? toRevenueChart(revenue.data.months) : [];

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <ChartCard
          wide
          title="Pendapatan per bulan"
          subtitle={`Januari–Desember${shownYear ? ` ${shownYear}` : ''} · sesi yang dihitung`}
          summary={`pendapatan bersih bimbel, gaji tutor, dan omzet kotor per bulan sepanjang tahun${shownYear ? ` ${shownYear}` : ''}`}
          sample={false}
          actions={yearOptions.length > 0 && <FilterSelect label="Tahun" value={String(shownYear ?? '')} onChange={(value) => setYear(Number(value))} options={yearOptions} />}
        >
          <div className="flex h-full flex-col gap-2">
            <div className="relative min-h-0 flex-1">
              {revenue.isError && !revenue.data && (
                <p role="alert" className="absolute inset-0 grid place-items-center text-sm text-muted">Gagal memuat grafik pendapatan.</p>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="revenueNetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PALETTE.sessions} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={CHART_PALETTE.sessions} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="revenueSalaryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PALETTE.tutor} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={CHART_PALETTE.tutor} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={colors.border} vertical={false} />
                  <XAxis dataKey="month" {...style.axis} interval="preserveStartEnd" minTickGap={4} />
                  <YAxis {...style.axis} width={72} tickFormatter={formatCompactRupiah} />
                  <Tooltip {...style.tooltip} content={<RevenueTooltip />} />
                  <Area type="monotone" dataKey="net" name="Pendapatan bersih bimbel" stroke={CHART_PALETTE.sessions} strokeWidth={3} fill="url(#revenueNetFill)" activeDot={style.activeDot(CHART_PALETTE.sessions)} isAnimationActive={animate} />
                  <Area type="monotone" dataKey="salary" name="Gaji tutor" stroke={CHART_PALETTE.tutor} strokeWidth={3} fill="url(#revenueSalaryFill)" activeDot={style.activeDot(CHART_PALETTE.tutor)} isAnimationActive={animate} />
                  <Line type="monotone" dataKey="gross" name="Omzet kotor" stroke={CHART_PALETTE.revenue} strokeWidth={3} dot={false} activeDot={style.activeDot(CHART_PALETTE.revenue)} isAnimationActive={animate} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend items={REVENUE_LEGEND} />
          </div>
        </ChartCard>

        <ChartCard title="Komposisi murid per jenjang" subtitle="PAUD sampai SMA" summary="jumlah murid per jenjang PAUD–TK, SD 1–3, SD 4–6, SMP, dan SMA">
          <div className="flex h-full flex-col gap-2">
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip {...style.tooltip} />
                  <Pie
                    data={SAMPLE_GRADE_COMPOSITION}
                    dataKey="students"
                    nameKey="tier"
                    innerRadius="58%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="none"
                    isAnimationActive={animate}
                  >
                    {SAMPLE_GRADE_COMPOSITION.map((entry) => (
                      <Cell key={entry.tier} fill={GRADE_COLORS[entry.tier] ?? colors.muted} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend items={SAMPLE_GRADE_COMPOSITION.map((entry) => ({ label: entry.tier, color: GRADE_COLORS[entry.tier] ?? colors.muted }))} />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Tutor dengan sesi terbanyak" subtitle="Bulan ini" summary="peringkat tutor berdasarkan jumlah sesi bulan ini">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SAMPLE_TUTOR_RANKING} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={colors.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...style.axis} />
              <YAxis type="category" dataKey="name" width={72} {...style.axis} />
              <Tooltip {...style.tooltip} cursor={style.barCursor} />
              <Bar dataKey="sessions" name="Sesi" fill={CHART_PALETTE.tutor} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate}>
                {SAMPLE_TUTOR_RANKING.map((entry) => (
                  <Cell key={entry.name} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pertumbuhan jumlah siswa" subtitle="Siswa aktif per bulan" summary="jumlah siswa aktif dari bulan ke bulan">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={SAMPLE_STUDENT_GROWTH} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="studentGrowthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_PALETTE.studentGrowth} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={CHART_PALETTE.studentGrowth} stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="month" {...style.axis} />
              <YAxis allowDecimals={false} width={40} {...style.axis} />
              <Tooltip {...style.tooltip} />
              <Area type="monotone" dataKey="students" name="Siswa" stroke={CHART_PALETTE.studentGrowth} strokeWidth={3} fill="url(#studentGrowthFill)" activeDot={style.activeDot(CHART_PALETTE.studentGrowth)} isAnimationActive={animate} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sumber pendaftaran murid" subtitle="Murid baru per kanal" summary="jumlah murid baru per kanal pendaftaran">
          <ResponsiveContainer width="100%" height="100%">
            {/* Batang horizontal: nama kanal panjang tetap terbaca di kartu sempit. */}
            <BarChart data={SAMPLE_REGISTRATION_SOURCES} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={colors.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...style.axis} />
              <YAxis type="category" dataKey="source" width={76} {...style.axis} />
              <Tooltip {...style.tooltip} cursor={style.barCursor} />
              <Bar dataKey="students" name="Murid" fill={CHART_PALETTE.students} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate}>
                {SAMPLE_REGISTRATION_SOURCES.map((entry) => (
                  <Cell key={entry.source} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
