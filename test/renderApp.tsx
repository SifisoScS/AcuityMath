/**
 * Renders the app the way `main.tsx` does.
 *
 * The app is wrapped in `TrpcProvider` at the root, so a test that renders
 * `<App />` bare throws "Unable to find tRPC Context" the moment any component
 * reaches for a query. Mounting the same tree here keeps the tests honest about
 * what the application actually is, rather than testing a shape that only
 * exists in the test file.
 */

import { render, type RenderResult } from '@testing-library/react';

import App from '../src/App';
import { TrpcProvider } from '../src/lib/trpc';

export function renderApp(): RenderResult {
  return render(
    <TrpcProvider>
      <App />
    </TrpcProvider>,
  );
}
