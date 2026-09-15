import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { ContentPicker } from './components/lti/ContentPicker.tsx';
import { TrpcProvider } from './lib/trpc.tsx';
import './index.css';

/**
 * Which application this is, decided before either is mounted.
 *
 * There is no router in this project and this does not add one. A teacher
 * choosing content is in a frame on their own course page, mid-task, and the
 * shell built for a parent at home — avatars, a child switcher, screen-time
 * controls — would be noise at best. Rendering the picker *inside* `App` would
 * mean threading a mode through a component that has no concept of one.
 *
 * A prefix match rather than equality, so a trailing slash or a query string
 * the platform appends does not drop a teacher into the family app.
 */
const isContentPicker =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/lti/choose');

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
    <TrpcProvider>{isContentPicker ? <ContentPicker /> : <App />}</TrpcProvider>
  </StrictMode>,
);
