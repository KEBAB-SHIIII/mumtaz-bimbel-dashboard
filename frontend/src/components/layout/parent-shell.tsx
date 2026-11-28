import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { LogOut, UserRound } from 'lucide-react';
import { Suspense, useLayoutEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL, useLogoutMutation, useSession } from '../../features/auth/session';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/data-display/avatar';
import { PageSkeleton } from '../ui/feedback/skeleton';
import { AccountMenu } from './header/account-menu';
import { NAVIGATION } from './navigation';
import { RouteSkeletonContent } from './route-skeleton';

const PARENT_ITEMS = NAVIGATION.parent.flatMap((group) => group.items);
/** Label ringkas untuk tab bawah HP (ruang sempit). */
const SHORT_LABEL: Record<string, string> = { 'Catatan Belajar': 'Catatan' };

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src="/favicon.svg" width={40} height={40} alt="" aria-hidden className="size-9 shrink-0 rounded-full bg-white object-cover ring-1 ring-border lg:size-10" />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-bold text-text">Bimbel Mumtaz</p>
        <p className="truncate text-meta font-medium text-primary">Portal Orang Tua</p>
      </div>
    </div>
  );
}

/**
 * Kerangka portal Orang Tua (desain 28-11-2026): navbar putih mengambang seperti landing page di desktop,
 * top bar ringkas + tab bawah di HP. Sesi, guard, dan sinkron antar-tab tetap dari `useSession`/`RequireRole`.
 */
export function ParentShell() {
  const user = useSession().data;
  const role = user?.role;
  useLayoutEffect(() => {
    if (!role) return;
    document.documentElement.dataset.appRole = role;
    return () => { delete document.documentElement.dataset.appRole; };
  }, [role]);
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;
  const handleLogout = () => logout.mutate(undefined, { onSettled: () => navigate('/login/orang-tua', { replace: true }) });

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md">
        Lewati ke konten
      </a>

      <header className="sticky top-0 z-30 bg-background/85 px-4 pt-3 pb-2 backdrop-blur-md lg:px-6 lg:pt-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4 rounded-2xl bg-surface px-4 py-2.5 shadow-sm ring-1 ring-border/70 lg:px-6 lg:py-3">
          <Brand />
          <nav aria-label="Navigasi utama" className="ms-auto hidden items-center gap-1 lg:flex">
            {PARENT_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={{ pathname: item.to, search: location.search }}
                end={item.end ?? false}
                className={({ isActive }) => cn(
                  'relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none',
                  isActive ? 'text-primary after:absolute after:inset-x-3.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary' : 'text-text hover:bg-primary-subtle',
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto hidden lg:ms-2 lg:block">
            <AccountMenu userId={user.id} fullName={user.full_name} role={user.role} roleLabel={ROLE_LABEL[user.role]} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))] focus:outline-none lg:px-6 lg:pt-4 lg:pb-10">
        <div key={location.pathname} className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Suspense fallback={<PageSkeleton><RouteSkeletonContent pathname={location.pathname} /></PageSkeleton>}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {PARENT_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={{ pathname: item.to, search: location.search }}
                end={item.end ?? false}
                className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium', isActive ? 'text-primary' : 'text-muted')}
              >
                <item.icon aria-hidden className="size-5" />
                {SHORT_LABEL[item.label] ?? item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <Menu>
              <MenuButton className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted data-open:text-primary">
                <UserRound aria-hidden className="size-5" />
                Akun
              </MenuButton>
              <MenuItems
                anchor="top end"
                className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg [--anchor-gap:0.5rem] focus:outline-none"
              >
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar seed={user.id} name={user.full_name} size={40} decorative />
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words text-text">{user.full_name}</p>
                    <p className="truncate text-meta text-muted">{ROLE_LABEL[user.role]}</p>
                  </div>
                </div>
                <MenuItem>
                  <button type="button" onClick={handleLogout} className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-text data-focus:bg-surface-muted">
                    <LogOut aria-hidden className="size-4 text-muted" />
                    Keluar
                  </button>
                </MenuItem>
              </MenuItems>
            </Menu>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Halaman Mata Pelajaran digabung ke Beranda (28-11-2026); tautan lama tetap berfungsi. */
export function ParentSubjectsRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/orang-tua-murid', search }} replace />;
}
