import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { AuthUser, Role } from '@mumtaz/contracts';
import {
  onForbidden,
  onPasswordChangeRequired,
  onUnauthenticated,
  setCsrfToken,
} from '../../lib/api-client';
import { queryKeys } from '../../lib/query-keys';
import { fetchSession, login, logout, parentAccess } from './api';
import { broadcastAuthChange, subscribeAuthChange } from './auth-sync';

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  tutor: '/tutor',
  parent: '/orang-tua-murid',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  tutor: 'Tutor',
  parent: 'Orang Tua/Wali',
};

/**
 * Snapshot `AuthUser` yang disediakan `RequireRole` agar komponen turunan (seperti `PeriodSelector`)
 * tetap mendapat user non-null sampai benar-benar di-unmount saat transisi logout / 401 / lintas tab.
 */
const CurrentUserContext = createContext<AuthUser | null>(null);

export function CurrentUserProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** Identitas sesi dari server (`GET /auth/me`); tidak pernah dari storage browser. */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchSession,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useCurrentUser(): AuthUser {
  const fromGuard = useContext(CurrentUserContext);
  const { data } = useSession();
  const user = data ?? fromGuard;
  if (!user) throw new Error('useCurrentUser dipakai di luar route terautentikasi');
  return user;
}

/**
 * Terapkan perubahan sesi secara aman: ubah `queryKeys.me` lebih dulu agar halaman aktif
 * ter-unmount sebelum cache data akun sebelumnya dibersihkan.
 */
function applySessionState(queryClient: QueryClient, nextUser: AuthUser | null): void {
  queryClient.setQueryData(queryKeys.me, nextUser);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
}

/** Ganti akun: bersihkan seluruh cache agar data akun sebelumnya tidak bocor, lalu sinkronkan tab lain. */
function useAuthTransition() {
  const queryClient = useQueryClient();
  return (user: AuthUser | null) => {
    queryClient.clear();
    queryClient.setQueryData(queryKeys.me, user);
    broadcastAuthChange(user ? 'session_changed' : 'logged_out');
  };
}

export function useLoginMutation() {
  const transition = useAuthTransition();
  return useMutation({ mutationFn: login, onSuccess: transition });
}

export function useParentAccessMutation() {
  const transition = useAuthTransition();
  return useMutation({ mutationFn: parentAccess, onSuccess: transition });
}

export function useLogoutMutation() {
  const transition = useAuthTransition();
  return useMutation({ mutationFn: logout, onSettled: () => transition(null) });
}

/**
 * Verifikasi ulang sesi aktif ke server (dideduplikasi per QueryClient agar lonjakan 403 paralel
 * hanya memicu 1 panggilan `/auth/me`). Jika akun/role di server berubah dibanding cache tab ini,
 * bersihkan cache lama agar `RequireRole` mengarahkan ke halaman yang sesuai tanpa data nyangkut.
 */
const inflightReconciles = new WeakMap<QueryClient, Promise<void>>();

function reconcileSession(queryClient: QueryClient): Promise<void> {
  const existing = inflightReconciles.get(queryClient);
  if (existing) return existing;

  const task = (async () => {
    try {
      const prevUser = queryClient.getQueryData<AuthUser | null>(queryKeys.me);
      const nextUser = await fetchSession();
      const identityChanged =
        (prevUser?.id ?? null) !== (nextUser?.id ?? null) ||
        (prevUser?.role ?? null) !== (nextUser?.role ?? null);

      if (identityChanged) {
        applySessionState(queryClient, nextUser);
      } else {
        queryClient.setQueryData(queryKeys.me, nextUser);
      }
    } catch {
      // Error jaringan/5xx saat cek ulang sesi tidak boleh memaksa logout.
    } finally {
      inflightReconciles.delete(queryClient);
    }
  })();

  inflightReconciles.set(queryClient, task);
  return task;
}

/**
 * Sinkronisasi sesi lintas tab & keamanan runtime:
 * - `401` di tengah pemakaian → bersihkan sesi & beri tahu tab lain.
 * - `403` biasa → cek ulang `/auth/me` (antisipasi cookie sudah berganti role di tab lain).
 * - BroadcastChannel dari tab lain → langsung logout atau sinkronisasi role baru.
 */
export function SessionWatcher({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onUnauthenticated(() => {
        setCsrfToken(null);
        applySessionState(queryClient, null);
        broadcastAuthChange('logged_out');
      }),
    [queryClient],
  );
  useEffect(
    () =>
      onForbidden(() => {
        void reconcileSession(queryClient);
      }),
    [queryClient],
  );
  useEffect(
    () =>
      onPasswordChangeRequired(() => {
        queryClient.setQueryData<AuthUser | null>(queryKeys.me, (user) =>
          user?.role === 'tutor' ? { ...user, must_change_password: true } : user,
        );
      }),
    [queryClient],
  );
  useEffect(
    () =>
      subscribeAuthChange((type) => {
        if (type === 'logged_out') {
          setCsrfToken(null);
          applySessionState(queryClient, null);
          return;
        }
        void reconcileSession(queryClient);
      }),
    [queryClient],
  );
  return <>{children}</>;
}
