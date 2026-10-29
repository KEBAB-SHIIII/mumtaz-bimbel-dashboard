import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import type { AuthUser, Role } from '@mumtaz/contracts';
import { onUnauthenticated } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-keys';
import { fetchSession, login, logout, parentAccess } from './api';

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
  const { data } = useSession();
  if (!data) throw new Error('useCurrentUser dipakai di luar route terautentikasi');
  return data;
}

/** Ganti akun: bersihkan seluruh cache agar data akun sebelumnya tidak bocor. */
function useAuthTransition() {
  const queryClient = useQueryClient();
  return (user: AuthUser | null) => {
    queryClient.clear();
    queryClient.setQueryData(queryKeys.me, user);
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

/** Sesi kedaluwarsa/dicabut di tengah pemakaian (401) → kembali ke state anonim. */
export function SessionWatcher({ children }: { children: ReactNode }) {
  const transition = useAuthTransition();
  useEffect(() => onUnauthenticated(() => transition(null)), [transition]);
  return <>{children}</>;
}
