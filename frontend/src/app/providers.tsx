import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { SessionWatcher } from '../features/auth/session';
import { createQueryClient } from '../lib/query-client';

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      {/* Motion: hanya komponen `m.*` + fitur DOM dasar; gerak dimatikan bila pengguna memilih reduced motion. */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <SessionWatcher>{children}</SessionWatcher>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
