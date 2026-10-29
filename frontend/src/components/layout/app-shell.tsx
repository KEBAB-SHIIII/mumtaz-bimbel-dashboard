import { Dialog, DialogPanel } from '@headlessui/react';
import { FlaskConical, LogOut, Menu, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { Role } from '@mumtaz/contracts';
import { ROLE_LABEL, useCurrentUser, useLogoutMutation } from '../../features/auth/session';
import { isDemoMode } from '../../lib/api-mode';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { LoadingState } from '../ui/feedback';
import { NAVIGATION } from './navigation';

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-1 p-3">
      {NAVIGATION[role].map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-surface-muted hover:text-text',
            )
          }
        >
          <item.icon aria-hidden className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return <p className="px-6 py-5 text-sm font-semibold tracking-wide text-text uppercase">Mumtaz Bimbel</p>;
}

export function DemoModeBanner() {
  if (!isDemoMode()) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-info px-4 py-1.5 text-xs font-medium text-white">
      <FlaskConical aria-hidden className="size-3.5" />
      Mode Demo — data sintetis dari fake API adapter, bukan data Neon.
    </div>
  );
}

/** Shell aplikasi per role: sidebar (drawer di mobile), topbar identitas + logout. */
export function AppShell() {
  const user = useCurrentUser();
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate(user.role === 'parent' ? '/login/orang-tua' : '/login', { replace: true }),
    });
  };

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Lewati ke konten
      </a>
      <DemoModeBanner />
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
          <div className="sticky top-0">
            <Brand />
            <SidebarNav role={user.role} />
          </div>
        </aside>

        <Dialog open={mobileOpen} onClose={setMobileOpen} className="relative z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/40" aria-hidden />
          <DialogPanel className="fixed inset-y-0 left-0 w-64 bg-surface shadow-md">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <Button variant="ghost" size="sm" aria-label="Tutup menu" className="px-1.5" onClick={() => setMobileOpen(false)}>
                <X aria-hidden className="size-4" />
              </Button>
            </div>
            <SidebarNav role={user.role} onNavigate={() => setMobileOpen(false)} />
          </DialogPanel>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 lg:px-8">
            <Button variant="ghost" size="sm" aria-label="Buka menu" className="px-1.5 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu aria-hidden className="size-5" />
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-text">{user.full_name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
              </div>
              <Button variant="secondary" size="sm" icon={<LogOut aria-hidden className="size-4" />} loading={logout.isPending} onClick={handleLogout}>
                Keluar
              </Button>
            </div>
          </header>
          <main id="main" className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-8">
            <Suspense fallback={<LoadingState label="Memuat halaman…" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
