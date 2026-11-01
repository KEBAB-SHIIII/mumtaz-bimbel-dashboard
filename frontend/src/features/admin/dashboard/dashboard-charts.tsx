import { useSyncExternalStore, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminDashboardSummary } from '@mumtaz/contracts';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/layout-primitives';
import { formatRupiah } from '../../../lib/format';
import {
  SAMPLE_GRADE_COMPOSITION,
  SAMPLE_REGISTRATION_SOURCES,
  SAMPLE_STUDENT_GROWTH,
  SAMPLE_TUTOR_RANKING,
} from './sample-chart-data';

/** Warna seri mengikuti token tema (tokens.css); ditulis langsung karena atribut SVG tidak membaca var(). */
const SERIES = {
  gross: 'oklch(0.52 0.1 250)',
  salary: 'oklch(0.62 0.13 75)',
  net: 'oklch(0.52 0.12 150)',
  neutral: 'oklch(0.32 0 0)',
  grid: 'oklch(0.91 0 0)',
  axis: 'oklch(0.5 0 0)',
};
const PIE_COLORS: readonly string[] = [SERIES.gross, SERIES.net];

const compactRupiah = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const formatCompactRupiah = (value: number) => `Rp${compactRupiah.format(value)}`;
const formatTooltipRupiah = (value: unknown) => formatRupiah(String(value));
/** Urutan seri pendapatan di legenda & tooltip (default Recharts: abjad). */
const REVENUE_ORDER = ['gross', 'salary', 'net'];
const byRevenueOrder = (item: { dataKey?: unknown }) => REVENUE_ORDER.indexOf(String(item.dataKey));

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

const axisProps = { tick: { fontSize: 12, fill: SERIES.axis }, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: `1px solid ${SERIES.grid}`, fontSize: 12, boxShadow: '0 4px 12px oklch(0 0 0 / 0.08)' },
  labelStyle: { fontWeight: 600, color: SERIES.neutral },
} as const;

/** Kartu grafik; `sample` memberi label "Data contoh" kecil untuk angka yang belum dari data operasional. */
function ChartCard({ title, summary, wide = false, sample = true, children }: { title: string; summary: string; wide?: boolean; sample?: boolean; children: ReactNode }) {
  return (
    <Card title={title} actions={sample ? <Badge>Data contoh</Badge> : undefined} className={wide ? 'lg:col-span-2' : ''}>
      <figure className="m-0 px-2 py-4 sm:px-4" aria-label={`${title}${sample ? ' (data contoh)' : ''}: ${summary}`}>
        <div className="h-64 w-full">{children}</div>
      </figure>
    </Card>
  );
}

const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
/** "2026-10" → "Okt 26". */
const formatMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return `${monthLabel.format(new Date(Date.UTC(year, month - 1, 1)))} ${String(year).slice(2)}`;
};

/** Pendapatan 6 bulan dari API (data asli); nominal string desimal → angka hanya untuk sumbu grafik. */
function toRevenueChart(revenue: AdminDashboardSummary['revenue_by_month']) {
  return revenue.map((month) => ({
    month: formatMonth(month.period),
    gross: Number(month.gross_revenue),
    salary: Number(month.tutor_salary),
    net: Number(month.net_revenue),
  }));
}

export function DashboardCharts({ revenue }: { revenue: AdminDashboardSummary['revenue_by_month'] }) {
  const animate = !usePrefersReducedMotion();
  const revenueData = toRevenueChart(revenue);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        wide
        title="Pendapatan per bulan"
        summary="omzet kotor, gaji tutor, dan pendapatan bersih bimbel enam bulan terakhir dari sesi yang dihitung"
        sample={false}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={revenueData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} width={72} tickFormatter={formatCompactRupiah} />
            <Tooltip {...tooltipStyle} formatter={formatTooltipRupiah} itemSorter={byRevenueOrder} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} itemSorter={byRevenueOrder} />
            <Line type="monotone" dataKey="gross" name="Omzet kotor" stroke={SERIES.gross} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={animate} />
            <Line type="monotone" dataKey="salary" name="Gaji tutor" stroke={SERIES.salary} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={animate} />
            <Line type="monotone" dataKey="net" name="Pendapatan bersih" stroke={SERIES.net} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={animate} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tutor dengan sesi terbanyak" summary="peringkat tutor berdasarkan jumlah sesi bulan ini">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={SAMPLE_TUTOR_RANKING} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={SERIES.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="name" width={72} {...axisProps} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'oklch(0.967 0 0)' }} />
            <Bar dataKey="sessions" name="Sesi" fill={SERIES.gross} radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Komposisi murid per jenjang" summary="jumlah murid SD kelas 1–3 dan SD kelas 4–6">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltipStyle} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Pie
              data={SAMPLE_GRADE_COMPOSITION}
              dataKey="students"
              nameKey="tier"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              stroke="none"
              isAnimationActive={animate}
            >
              {SAMPLE_GRADE_COMPOSITION.map((entry, index) => (
                <Cell key={entry.tier} fill={PIE_COLORS[index % PIE_COLORS.length] ?? SERIES.neutral} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Pertumbuhan jumlah siswa" summary="jumlah siswa aktif dari bulan ke bulan">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SAMPLE_STUDENT_GROWTH} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="studentGrowthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.net} stopOpacity={0.25} />
                <stop offset="100%" stopColor={SERIES.net} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis allowDecimals={false} width={40} {...axisProps} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="students" name="Siswa" stroke={SERIES.net} strokeWidth={2.5} fill="url(#studentGrowthFill)" isAnimationActive={animate} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Sumber pendaftaran murid" summary="jumlah murid baru per kanal pendaftaran">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={SAMPLE_REGISTRATION_SOURCES} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SERIES.grid} vertical={false} />
            <XAxis dataKey="source" interval={0} {...axisProps} />
            <YAxis allowDecimals={false} width={40} {...axisProps} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'oklch(0.967 0 0)' }} />
            <Bar dataKey="students" name="Murid" fill={SERIES.neutral} radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
