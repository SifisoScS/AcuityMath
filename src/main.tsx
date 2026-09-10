import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { TrpcProvider } from './lib/trpc.tsx';
import './index.css';

/**
 * The tRPC provider wraps the whole app rather than the practice view alone.
 *
 * Only the practice view uses it today, but a provider mounted inside a modal
 * would give every open and close its own query cache — a learner would refetch
 * their own progress each time they started practising, and the numbers on the
 * dashboard behind would not move when the cache they belong to disappeared.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrpcProvider>
      <App />
    </TrpcProvider>
  </StrictMode>,
);
