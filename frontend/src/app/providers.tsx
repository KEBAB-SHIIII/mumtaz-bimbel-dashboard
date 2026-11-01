import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { SessionWatcher } from '../features/auth/session';
import { createQueryClient } from '../lib/query-client';

const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      {/* Motion: komponen `m.*` ringan di bundle awal; fitur domMax (termasuk layoutId) dimuat async. Gerak dimatikan bila pengguna memilih reduced motion. */}
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionConfig reducedMotion="user">
          <SessionWatcher>{children}</SessionWatcher>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
