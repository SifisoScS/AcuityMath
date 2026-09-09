/**
 * The typed client, and the provider that supplies it.
 *
 * `AppRouter` is imported as a type from the server, so every procedure name,
 * input and return shape is checked at compile time. A renamed procedure or a
 * changed field becomes a build error rather than an empty dashboard.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState, type ReactNode } from 'react';

import type { AppRouter } from '../../server/trpc/routers';
import { transformer } from './transformer';

export const trpc = createTRPCReact<AppRouter>();

/**
 * Retries are deliberately restrained.
 *
 * The default retries any failed query three times. Half this application's
 * failures are a learner being genuinely unreachable — offline on a school
 * Chromebook — and retrying an authorization failure three times is worse than
 * useless: it delays the sign-in prompt by several seconds while producing the
 * same answer.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A learner's snapshot does not change while they read the page. Thirty
        // seconds stops every tab switch re-fetching the same numbers.
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const code = (error as { data?: { code?: string } })?.data?.code;
          if (code === 'UNAUTHORIZED' || code === 'NOT_FOUND' || code === 'FORBIDDEN') return false;
          return failureCount < 2;
        },
        // Refetching on window focus is right for a dashboard a parent leaves
        // open, and wrong for a practice question mid-answer. Queries that must
        // not move under the learner opt out individually.
        refetchOnWindowFocus: true,
      },
      mutations: {
        // A submitted answer is not idempotent: retrying one that actually
        // succeeded would record a second attempt and move mastery twice.
        retry: false,
      },
    },
  });
}

export function TrpcProvider({ children }: { children: ReactNode }) {
  // Held in state rather than created at module scope, so each mounted app —
  // including each test — gets its own cache and cannot inherit another's.
  const [queryClient] = useState(makeQueryClient);
  const [client] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/trpc',
          transformer,
          // Sends the session cookie. Without it every request is anonymous and
          // every protected procedure answers UNAUTHORIZED.
          fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
