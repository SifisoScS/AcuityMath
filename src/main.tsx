import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { DistrictConsole } from './components/district/DistrictConsole.tsx';
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
const path = typeof window === 'undefined' ? '' : window.location.pathname;

const isContentPicker = path.startsWith('/lti/choose');

/**
 * `/district/12` — the id in the path, because an administrator of two districts
 * needs a way to say which, and the server checks it either way.
 *
 * Nothing is trusted here. `institutions.overview` refuses an institution the
 * caller does not administer, and answers the same way for one that does not
 * exist — so a guessed number in the address bar reveals nothing about which
 * districts are real.
 */
const districtMatch = /^\/district\/(\d+)/.exec(path);

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
      {isContentPicker ? (
        <ContentPicker />
      ) : districtMatch ? (
        <DistrictConsole institutionId={Number(districtMatch[1])} />
      ) : (
        <App />
      )}
    </TrpcProvider>
  </StrictMode>,
);
