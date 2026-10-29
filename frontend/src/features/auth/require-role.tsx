import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '@mumtaz/contracts';
import { ErrorState, LoadingState } from '../../components/ui/feedback';
import { ROLE_HOME, useSession } from './session';

/**
 * Guard UI per role. Hanya mengatur navigasi; otorisasi sesungguhnya tetap
 * diperiksa backend pada setiap request.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LoadingState label="Memeriksa sesi…" className="min-h-dvh" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;

  const user = session.data;
  if (!user) {
    const loginPath = role === 'parent' ? '/login/orang-tua' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

/** `/` → dashboard sesuai role, atau halaman login. */
export function HomeRedirect() {
  const session = useSession();
  if (session.isPending) return <LoadingState label="Memeriksa sesi…" className="min-h-dvh" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  return <Navigate to={session.data ? ROLE_HOME[session.data.role] : '/login'} replace />;
}
