import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/field';
import { FilterBar, PageHeader } from '../../../components/ui/layout-primitives';
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
  { to: 'penugasan', label: 'Penugasan Tutor' },
  { to: 'tarif', label: 'Tarif Honor' },
];

/** Master Data: enam submenu (docs/15 §2.5). Data referensi, bukan transaksi. */
export function MasterDataLayout() {
  return (
    <>
      <PageHeader title="Master Data" description="Data referensi tutor, siswa, wali, mapel, penugasan, dan tarif. Data yang sudah dipakai dinonaktifkan, tidak dihapus." />
      <nav aria-label="Submenu Master Data" className="-mb-2 overflow-x-auto border-b border-border">
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'inline-block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
                    isActive ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text',
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
  const [draft, setDraft] = useState(search ?? '');
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <FilterBar>
        {onSearch && (
          <form
            role="search"
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(draft.trim());
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="master-search" className="text-sm font-medium text-text">Cari</label>
              <Input id="master-search" type="search" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} className="w-64" />
            </div>
            <Button type="submit" variant="secondary" icon={<Search aria-hidden className="size-4" />}>Cari</Button>
          </form>
        )}
        {children}
      </FilterBar>
      <Button icon={<Plus aria-hidden className="size-4" />} onClick={onCreate}>{createLabel}</Button>
    </div>
  );
}

export function ActiveBadge({ active, activeLabel = 'Aktif', inactiveLabel = 'Nonaktif' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? activeLabel : inactiveLabel}</Badge>;
}

export function CheckboxField({ id, label, description, ...props }: { id: string; label: string; description?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="mt-0.5 size-4 rounded border-border" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-text">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}
