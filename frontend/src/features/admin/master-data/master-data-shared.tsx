import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { FilterBar, PageHeader } from '../../../components/ui/layout-primitives';
import { SearchInput } from '../../../components/ui/search-input';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { useSearchState } from '../../../lib/use-search-state';
import { fetchMasterData, type MasterDataEntity } from '../api';

export const MASTER_PAGE_SIZE = 20;

const TABS = [
  { to: 'tutor', label: 'Tutor' },
  { to: 'siswa', label: 'Siswa' },
  { to: 'orang-tua', label: 'Orang Tua/Wali' },
  { to: 'mapel', label: 'Mata Pelajaran' },
];

/** Master Data: empat submenu (docs/15 §2.5). Data referensi, bukan transaksi; Tutor memilih murid & mapel sendiri saat absen. */
export function MasterDataLayout() {
  return (
    <>
      <PageHeader title="Master Data" description="Data referensi tutor, siswa, wali, dan mata pelajaran. Tutor memilih murid dan mapel sendiri saat mengisi absensi. Data yang sudah dipakai dinonaktifkan, tidak dihapus." />
      {/* Desktop memakai submenu sidebar; di HP/tablet (sidebar = drawer) tab pil ini jadi pintasan antar submenu. */}
      <nav aria-label="Submenu Master Data" className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="flex w-max gap-1 rounded-md bg-surface-muted p-0.5">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-8 items-center rounded-[0.375rem] px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:h-10 motion-reduce:transition-none',
                    isActive ? 'bg-surface text-text shadow-sm ring-1 ring-border' : 'text-muted hover:text-text',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}

/** Daftar master data terpaginasi + pencarian, dengan state di URL. */
export function useMasterList<E extends MasterDataEntity>(entity: E, extra: Record<string, string | undefined> = {}) {
  const { values, page, update } = useSearchState(['search'] as const);
  const params = { page, page_size: MASTER_PAGE_SIZE, search: values.search || undefined, ...extra };
  const query = useQuery({
    queryKey: queryKeys.admin.masterData(entity, params),
    queryFn: () => fetchMasterData(entity, params),
    placeholderData: keepPreviousData,
  });
  return { query, page, search: values.search, update };
}

/** Opsi dropdown dari master data (maks. 100; cukup untuk skala satu bimbel). */
export function useMasterOptions<E extends MasterDataEntity>(entity: E) {
  const params = { page: 1, page_size: 100 };
  return useQuery({ queryKey: queryKeys.admin.masterData(entity, params), queryFn: () => fetchMasterData(entity, params) });
}

export function MasterToolbar({
  search,
  onSearch,
  placeholder,
  onCreate,
  createLabel,
  children,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  onCreate: () => void;
  createLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <FilterBar>
        {onSearch && (
          <div role="search" className="flex w-full flex-col gap-1.5 sm:w-auto">
            <label htmlFor="master-search" className="text-sm font-medium text-text">Cari</label>
            <SearchInput id="master-search" value={search ?? ''} onChange={onSearch} placeholder={placeholder} />
          </div>
        )}
        {children}
      </FilterBar>
      <Button icon={<Plus aria-hidden className="size-4" />} onClick={onCreate} className="max-sm:w-full">{createLabel}</Button>
    </div>
  );
}

export function ActiveBadge({ active, activeLabel = 'Aktif', inactiveLabel = 'Nonaktif' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? activeLabel : inactiveLabel}</Badge>;
}

export function CheckboxField({ id, label, description, ...props }: { id: string; label: string; description?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-text">{label}</span>
        {description && <span className="block text-meta text-muted">{description}</span>}
      </label>
    </div>
  );
}
