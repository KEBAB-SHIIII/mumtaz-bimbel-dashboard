import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Menu } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL, useLogoutMutation, useSession } from '../../features/auth/session';
import { cn } from '../../lib/cn';
import { PageSkeleton } from '../ui/skeleton';
import { RouteSkeletonContent } from './route-skeleton';
import { AccountMenu } from './account-menu';
import { HeaderSlotContext } from './header-slot';
import { NavSearch } from './nav-search';
import { Sidebar } from './sidebar';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

/** Sama dengan breakpoint `lg` Tailwind: di atasnya sidebar tetap, di bawahnya drawer. */
const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Shell aplikasi per role (docs/design/03-layout.md): sidebar berkelompok yang bisa diciutkan (≥ 1024px)
 * atau drawer (< 1024px), header dengan judul halaman + pencarian menu + avatar, dan frame konten.
 */
export function AppShell() {
  const user = useSession().data;
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ title: titleSlot, actions: actionsSlot }), [titleSlot, actionsSlot]);

  // Drawer modal yang tertinggal terbuka saat jendela dilebarkan akan mengunci halaman: tutup otomatis.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const handleLogout = () => {
    const loginPath = user?.role === 'parent' ? '/login/orang-tua' : '/login';
    logout.mutate(undefined, { onSettled: () => navigate(loginPath, { replace: true }) });
  };

  // Sesi baru saja berakhir (logout/401): route guard sedang mengarahkan ke login, jangan render shell.
  if (!user) return null;

  const sidebarProps = {
    role: user.role,
    userId: user.id,
    fullName: user.full_name,
    roleLabel: ROLE_LABEL[user.role],
    onLogout: handleLogout,
    logoutPending: logout.isPending,
  };

  return (
    <HeaderSlotContext.Provider value={slots}>
      <div className="min-h-dvh bg-background lg:flex">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
        >
          Lewati ke konten
        </a>

        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <Sidebar {...sidebarProps} variant="desktop" collapsed={collapsed} onToggleCollapse={toggle} />
        </aside>

        <Dialog open={drawerOpen} onClose={setDrawerOpen} className="relative z-50 lg:hidden">
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-overlay transition-opacity duration-300 ease-out data-closed:opacity-0 data-leave:duration-200 motion-reduce:transition-none"
          />
          <DialogPanel
            transition
            className="fixed inset-y-0 start-0 w-[min(18rem,85vw)] bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ps-[env(safe-area-inset-left)] shadow-lg transition duration-300 ease-out data-closed:-translate-x-full data-leave:duration-200 data-leave:ease-in motion-reduce:transition-none"
          >
            <DialogTitle className="sr-only">Menu navigasi</DialogTitle>
            <Sidebar {...sidebarProps} variant="drawer" onClose={() => setDrawerOpen(false)} />
          </DialogPanel>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:sticky lg:top-0 lg:bg-background/85 lg:px-8 lg:backdrop-blur-md">
            <button
              type="button"
              aria-label="Buka menu"
              onClick={() => setDrawerOpen(true)}
              className="grid size-10 shrink-0 place-items-center rounded-md text-text transition-colors duration-150 hover:bg-surface pointer-coarse:size-11 motion-reduce:transition-none lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            {/* Judul halaman (h1) dirender di sini oleh PageHeader lewat portal. */}
            {/* Kosong selama halaman dimuat: tampilkan bar skeleton judul agar header tidak terlihat bolong. */}
            <div
              ref={setTitleSlot}
              className="min-w-0 flex-1 empty:before:block empty:before:h-6 empty:before:w-40 empty:before:animate-pulse-soft empty:before:rounded-md empty:before:bg-surface-muted motion-reduce:empty:before:animate-none"
            />
            <div ref={setActionsSlot} className="hidden items-center gap-2 lg:flex lg:empty:hidden" />
            <NavSearch role={user.role} />
            <AccountMenu userId={user.id} fullName={user.full_name} role={user.role} roleLabel={ROLE_LABEL[user.role]} onLogout={handleLogout} />
          </header>

          <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-8 focus:outline-none sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-4 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-6 lg:shadow-sm">
              {/* Pindah halaman: isi frame memudar + naik 6px (keyframe), sidebar & header diam. */}
              <div key={location.pathname} className="flex flex-1 flex-col gap-4 animate-fade-up motion-reduce:animate-none">
                <Suspense
                  fallback={
                    <PageSkeleton>
                      <RouteSkeletonContent pathname={location.pathname} />
                    </PageSkeleton>
                  }
                >
                  <Outlet />
                </Suspense>
              </div>
            </div>
          </main>
        </div>
      </div>
    </HeaderSlotContext.Provider>
  );
}
