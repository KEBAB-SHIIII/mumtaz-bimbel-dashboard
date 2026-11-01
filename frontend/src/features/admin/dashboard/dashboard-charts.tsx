import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
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
import { useThemeColors, type ThemeColors } from '../../../lib/theme-colors';
import {
  SAMPLE_GRADE_COMPOSITION,
  SAMPLE_REGISTRATION_SOURCES,
  SAMPLE_STUDENT_GROWTH,
  SAMPLE_TUTOR_RANKING,
} from './sample-chart-data';

// Palet pastel grafik mengikuti referensi: hijau, mint, dan lavender.
const CHART_PALETTE = {
  green: '#60AD76',
  mint: '#ADE8BD',
  lavender: '#A39DE8',
};

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
    // Teks legenda netral: warna seri (mis. coral 4.27:1) tidak cukup kontras untuk teks.
    legend: {
      iconType: 'circle',
      wrapperStyle: { fontSize: 12 },
      formatter: (value: string) => <span style={{ color: colors.muted }}>{value}</span>,
    } as const,
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

/** Indeks batang/potongan yang sedang di-hover; sisanya diredupkan (transisi `fill-opacity` di index.css). */
function useHoverIndex() {
  const [index, setIndex] = useState<number | null>(null);
  return {
    onMouseEnter: (_: unknown, next: number) => setIndex(next),
    onMouseLeave: () => setIndex(null),
    opacityOf: (i: number) => (index === null || index === i ? 1 : 0.4),
  };
}

/** Kartu grafik; `sample` memberi label "Data contoh" kecil untuk angka yang belum dari data operasional. */
function ChartCard({ title, subtitle, summary, wide = false, sample = true, children }: { title: string; subtitle: string; summary: string; wide?: boolean; sample?: boolean; children: ReactNode }) {
  return (
    <Card title={title} description={subtitle} actions={sample ? <Badge size="sm">Data contoh</Badge> : undefined} className={wide ? 'lg:col-span-2' : ''}>
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

type RevenuePoint = ReturnType<typeof toRevenueChart>[number];

/** Tooltip pendapatan dengan penanda warna yang sama seperti seri grafik. */
function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: { payload?: RevenuePoint }[]; label?: string | number }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-[0.625rem] border border-border bg-surface px-3 py-2 text-meta shadow-md animate-pop-in motion-reduce:animate-none">
      <p className="font-semibold text-text">{label}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
        <dt className="flex items-center gap-2 font-medium text-text"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.mint }} />Omzet kotor</dt>
        <dd className="text-end font-semibold text-text">{formatRupiah(String(point.gross))}</dd>
        <dt className="flex items-center gap-2 text-muted"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.lavender }} />Gaji tutor</dt>
        <dd className="text-end text-text">{formatRupiah(String(point.salary))}</dd>
        <dt className="flex items-center gap-2 text-muted"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CHART_PALETTE.green }} />Pendapatan bersih bimbel</dt>
        <dd className="text-end text-text">{formatRupiah(String(point.net))}</dd>
      </dl>
    </div>
  );
}

/**
 * Seri grafik memakai palet hijau, mint, dan lavender.
 * Pendapatan: tiga seri tidak ditumpuk agar setiap garis menunjukkan nominal sebenarnya.
 */
export function DashboardCharts({ revenue }: { revenue: AdminDashboardSummary['revenue_by_month'] }) {
  const animate = !usePrefersReducedMotion();
  const colors = useThemeColors();
  const style = chartStyle(colors, animate);
  const pieHover = useHoverIndex();
  const tutorHover = useHoverIndex();
  const sourceHover = useHoverIndex();
  const revenueData = toRevenueChart(revenue);
  const pieColors = [CHART_PALETTE.green, CHART_PALETTE.lavender];

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <ChartCard
          wide
          title="Pendapatan per bulan"
          subtitle="6 bulan terakhir · sesi yang dihitung"
          summary="pendapatan bersih bimbel, gaji tutor, dan omzet kotor enam bulan terakhir"
          sample={false}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revenueData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="revenueNetFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_PALETTE.green} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_PALETTE.green} stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="revenueSalaryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_PALETTE.lavender} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={CHART_PALETTE.lavender} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="month" {...style.axis} />
              <YAxis {...style.axis} width={72} tickFormatter={formatCompactRupiah} />
              <Tooltip {...style.tooltip} content={<RevenueTooltip />} />
              <Legend {...style.legend} itemSorter={(item) => ['Omzet kotor', 'Gaji tutor', 'Pendapatan bersih bimbel'].indexOf(String(item.value))} />
              <Area type="monotone" dataKey="net" name="Pendapatan bersih bimbel" stroke={CHART_PALETTE.green} strokeWidth={2.5} fill="url(#revenueNetFill)" activeDot={style.activeDot(CHART_PALETTE.green)} isAnimationActive={animate} />
              <Area type="monotone" dataKey="salary" name="Gaji tutor" stroke={CHART_PALETTE.lavender} strokeWidth={2.5} fill="url(#revenueSalaryFill)" activeDot={style.activeDot(CHART_PALETTE.lavender)} isAnimationActive={animate} />
              <Line type="monotone" dataKey="gross" name="Omzet kotor" stroke={CHART_PALETTE.mint} strokeWidth={3} dot={false} activeDot={style.activeDot(CHART_PALETTE.mint)} isAnimationActive={animate} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Komposisi murid per jenjang" subtitle="SD 1–3 dan SD 4–6" summary="jumlah murid SD kelas 1–3 dan SD kelas 4–6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip {...style.tooltip} />
              <Legend {...style.legend} />
              <Pie
                data={SAMPLE_GRADE_COMPOSITION}
                dataKey="students"
                nameKey="tier"
                innerRadius="58%"
                outerRadius="80%"
                paddingAngle={3}
                stroke="none"
                isAnimationActive={animate}
                onMouseEnter={pieHover.onMouseEnter}
                onMouseLeave={pieHover.onMouseLeave}
              >
                {SAMPLE_GRADE_COMPOSITION.map((entry, index) => (
                  <Cell key={entry.tier} fill={pieColors[index % pieColors.length] ?? CHART_PALETTE.green} fillOpacity={pieHover.opacityOf(index)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
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
              <Bar dataKey="sessions" name="Sesi" fill={CHART_PALETTE.green} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate} onMouseEnter={tutorHover.onMouseEnter} onMouseLeave={tutorHover.onMouseLeave}>
                {SAMPLE_TUTOR_RANKING.map((entry, index) => (
                  <Cell key={entry.name} fillOpacity={tutorHover.opacityOf(index)} />
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
                  <stop offset="0%" stopColor={CHART_PALETTE.mint} stopOpacity={1} />
                  <stop offset="100%" stopColor={CHART_PALETTE.mint} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="month" {...style.axis} />
              <YAxis allowDecimals={false} width={40} {...style.axis} />
              <Tooltip {...style.tooltip} />
              <Area type="monotone" dataKey="students" name="Siswa" stroke={CHART_PALETTE.green} strokeWidth={2.5} fill="url(#studentGrowthFill)" activeDot={style.activeDot(CHART_PALETTE.green)} isAnimationActive={animate} />
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
              <Bar dataKey="students" name="Murid" fill={CHART_PALETTE.lavender} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate} onMouseEnter={sourceHover.onMouseEnter} onMouseLeave={sourceHover.onMouseLeave}>
                {SAMPLE_REGISTRATION_SOURCES.map((entry, index) => (
                  <Cell key={entry.source} fillOpacity={sourceHover.opacityOf(index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
