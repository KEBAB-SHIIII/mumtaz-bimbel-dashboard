import type { ReactNode } from 'react';
import type { Role } from '@mumtaz/contracts';
import { cn } from '../../lib/cn';
import { Skeleton, SkeletonRegion } from '../ui/skeleton';
import { NAVIGATION } from './navigation';
import { readSidebarCollapsed } from './use-sidebar-collapsed';

/*
 * Skeleton yang meniru tata letak asli (docs/design/04-components.md § Skeleton): dipakai saat sesi diperiksa
 * setelah refresh (shell penuh) dan saat chunk halaman dimuat (isi frame saja). Bentuk isi mengikuti rute.
 */

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-border bg-surface shadow-sm', className)}>{children}</div>;
}

function Description() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3.5 w-full max-w-lg" />
      <Skeleton className="h-3.5 w-2/3 max-w-sm" />
    </div>
  );
}

function Period() {
  return <Skeleton className="h-9 w-56 pointer-coarse:h-11" />;
}

function Chips({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-8 w-24 rounded-full pointer-coarse:h-11" />
      ))}
    </div>
  );
}

function Stats({ count, columns = 'lg:grid-cols-4', lastWide = false }: { count: number; columns?: string; lastWide?: boolean }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', columns)}>
      {Array.from({ length: count }, (_, index) => (
        <Frame key={index} className={cn('flex flex-col gap-3 p-4 sm:p-5', lastWide && index === count - 1 && 'max-lg:col-span-2')}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <Skeleton className="h-6 w-28" />
        </Frame>
      ))}
    </div>
  );
}

function CardHeader() {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-4 py-3 sm:px-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

function Charts() {
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
      <Frame className="lg:col-span-2">
        <CardHeader />
        <div className="p-4"><Skeleton className="h-64 w-full" /></div>
      </Frame>
      <Frame>
        <CardHeader />
        <div className="grid place-items-center p-4"><Skeleton className="size-48 rounded-full" /></div>
      </Frame>
    </div>
  );
}

/** Tabel (≥ 640px) / daftar kartu (HP) tanpa JS: dua bentuk, ditukar oleh breakpoint CSS. */
function Table({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <Frame className="overflow-hidden">
      <div className="max-sm:hidden">
        <div className="flex h-10 items-center gap-6 border-b border-border bg-surface-muted px-4">
          {Array.from({ length: columns }, (_, index) => <Skeleton key={index} className="h-3 w-16 bg-border/70" />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex h-11 items-center gap-6 border-b border-border px-4 last:border-b-0">
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} className={cn('h-3.5', (row + column) % 3 === 0 ? 'w-24' : 'w-16')} />
            ))}
          </div>
        ))}
      </div>
      <div className="divide-y divide-border sm:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 px-4 py-3">
            <Skeleton className="h-4 w-36" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ListCard({ rows = 4 }: { rows?: number }) {
  return (
    <Frame>
      <CardHeader />
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Form({ fields = 6, className }: { fields?: number; className?: string }) {
  return (
    <Frame className={cn('flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-5', className)}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-full pointer-coarse:h-11" />
        </div>
      ))}
      <Skeleton className="h-9 w-36 self-end pointer-coarse:h-11 max-sm:w-full" />
    </Frame>
  );
}

function Toolbar({ chips, actions = 0 }: { chips: number; actions?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Skeleton className="h-9 w-full sm:w-72 pointer-coarse:h-11" />
        <Period />
        {actions > 0 && (
          <div className="ms-auto flex gap-2">
            {Array.from({ length: actions }, (_, index) => <Skeleton key={index} className="h-9 w-11 sm:w-28 pointer-coarse:h-11" />)}
          </div>
        )}
      </div>
      {chips > 0 && <Chips count={chips} />}
    </div>
  );
}

function ChildCard() {
  return (
    <Frame className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Period />
    </Frame>
  );
}

function Timeline() {
  return (
    <Frame>
      <CardHeader />
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        {[0, 1].map((index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="mt-1 size-2.5 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Isi frame halaman sesuai rute (tanpa wadah status; dibungkus pemanggil). */
export function RouteSkeletonContent({ pathname }: { pathname: string }) {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/admin') return (<><Description /><Period /><Stats count={4} /><Charts /></>);
  if (path === '/admin/absensi') return (<><Description /><Toolbar chips={4} actions={2} /><Table columns={8} /></>);
  if (path === '/admin/penagihan') return (<><Description /><div className="flex gap-2"><Period /><Skeleton className="h-8 w-24 rounded-full" /></div><Stats count={3} columns="lg:grid-cols-3" /><Table rows={4} columns={7} /></>);
  if (path === '/admin/honor') return (<><Description /><Period /><Stats count={3} columns="lg:grid-cols-3" /><ListCard rows={3} /></>);
  if (path.startsWith('/admin/master-data')) return (<><Description /><div className="flex flex-wrap items-center justify-between gap-3"><Skeleton className="h-9 w-full sm:w-64 pointer-coarse:h-11" /><Skeleton className="h-9 w-32 pointer-coarse:h-11 max-sm:w-full" /></div><Table columns={5} /></>);
  if (path === '/tutor') return (<><div className="flex flex-wrap items-end justify-between gap-3"><Skeleton className="h-3.5 w-56" /><Period /></div><Frame className="flex items-center gap-3 p-4 sm:p-5"><Skeleton className="size-10 rounded-full" /><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-10 w-36 max-sm:hidden" /></Frame><Stats count={5} columns="lg:grid-cols-5" lastWide /><ListCard rows={5} /></>);
  if (path === '/tutor/absensi') return (<><Description /><Form fields={7} /></>);
  if (path === '/tutor/riwayat') return (<><Description /><Period /><Chips count={2} /><Table columns={7} /></>);
  if (path === '/tutor/honor') return (<><Description /><Period /><Stats count={3} columns="lg:grid-cols-3" /><Table rows={4} columns={6} /></>);
  if (path === '/tutor/profil') return (<><Description /><Frame className="flex w-full max-w-3xl items-center gap-4 p-4 sm:p-5"><Skeleton className="size-18 rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28" /></div></Frame><Form fields={3} /></>);
  if (path.startsWith('/orang-tua-murid')) return (<><Description /><ChildCard /><Stats count={3} columns="sm:grid-cols-3" /><Timeline /></>);
  return (<><Description /><Stats count={4} /><Table /></>);
}

/** Sidebar kerangka: jumlah grup & item sama dengan menu asli role (bila diketahui). */
function SidebarSkeleton({ role, collapsed }: { role: Role | undefined; collapsed: boolean }) {
  const groups = role ? NAVIGATION[role].map((group) => group.items.length) : [1, 3, 1];
  const showLabels = groups.length > 1;
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-2.5 px-5', collapsed && 'justify-center px-0')}>
        {!collapsed && <Skeleton className="size-8 rounded-md" />}
        {!collapsed && <Skeleton className="h-4 w-28" />}
        <Skeleton className={cn('size-7 rounded-md', !collapsed && 'ms-auto')} />
      </div>
      <div className="flex flex-1 flex-col gap-5 px-3 py-2">
        {groups.map((count, group) => (
          <div key={group} className="flex flex-col gap-1.5">
            {showLabels && !collapsed && <Skeleton className="mx-2.5 mb-1 h-2.5 w-16" />}
            {Array.from({ length: count }, (_, item) => (
              <div key={item} className={cn('flex h-9 items-center gap-2.5 px-2.5', collapsed && 'justify-center px-0')}>
                <Skeleton className="size-4.5 rounded-sm" />
                {!collapsed && <Skeleton className={cn('h-3.5', item % 2 === 0 ? 'w-24' : 'w-20')} />}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={cn('flex items-center gap-2.5 border-t border-border p-3', collapsed && 'flex-col')}>
        <Skeleton className="size-10 rounded-full" />
        {!collapsed && (
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shell aplikasi penuh dalam bentuk skeleton (refresh / sesi sedang diperiksa): geometri sama dengan
 * `AppShell` (sidebar 240/64px, header 64px, frame konten) sehingga peralihan ke tampilan asli tidak melompat.
 */
export function AppShellSkeleton({ role, pathname }: { role?: Role; pathname: string }) {
  const collapsed = readSidebarCollapsed();
  return (
    <SkeletonRegion label="Memuat aplikasi…" className="min-h-dvh bg-background animate-fade-up motion-reduce:animate-none lg:flex">
      <aside aria-hidden className={cn('sticky top-0 hidden h-dvh shrink-0 lg:block', collapsed ? 'w-16' : 'w-60')}>
        <SidebarSkeleton role={role} collapsed={collapsed} />
      </aside>
      <div aria-hidden className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          <Skeleton className="size-10 rounded-md lg:hidden" />
          <div className="min-w-0 flex-1"><Skeleton className="h-6 w-40" /></div>
          <Skeleton className="size-10 rounded-md md:h-9 md:w-60" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="flex flex-1 flex-col px-4 pb-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-4 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-6 lg:shadow-sm">
            <RouteSkeletonContent pathname={pathname} />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
