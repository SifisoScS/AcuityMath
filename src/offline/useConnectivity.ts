/**
 * Whether the server is actually reachable.
 *
 * ## Why `navigator.onLine` is not enough on its own
 *
 * It reports whether the device has *a* network connection, not whether this
 * application can reach its server. It is `true` on a hotel wifi that has not
 * been paid for, on a train whose carriage has signal but no route out, and
 * behind a captive portal. Trusting it alone means a child answers into a void
 * and is told everything is fine.
 *
 * It is still worth listening to, because it is the fastest signal there is for
 * the case it *does* cover — a laptop lid closed, aeroplane mode — and reacting
 * instantly beats waiting for a request to time out.
 *
 * So this combines the two: the browser's opinion, and what actually happened
 * the last time we tried to talk to the server. A failed request marks us
 * offline whatever `navigator.onLine` claims; a successful one marks us online
 * whatever it claims.
 *
 * ## The simulated mode
 *
 * `App.tsx` had an "offline mode" toggle that only ever set a boolean, which is
 * how the demonstration showed the queue. It is kept, but as a distinct state
 * rather than as a synonym for being offline — a banner that says "you are
 * offline" when someone pressed a button in a demo is a small lie, and the
 * distinction costs one field.
 */

import { useCallback, useEffect, useState } from 'react';

export type Connectivity = 'online' | 'offline' | 'simulated-offline';

export interface ConnectivityState {
  status: Connectivity;
  /** True when answers should be queued rather than sent. */
  shouldQueue: boolean;
  /** The browser's own opinion, kept separate so the banner can be specific. */
  browserReportsOnline: boolean;
  /** Call after a request fails, so a captive portal is noticed. */
  reportFailure: () => void;
  /** Call after a request succeeds, so recovery is noticed without a round trip. */
  reportSuccess: () => void;
  /** Turns the demonstration mode on and off. */
  setSimulatedOffline: (simulated: boolean) => void;
}

export function useConnectivity(): ConnectivityState {
  const [browserReportsOnline, setBrowserReportsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [reachable, setReachable] = useState(true);
  const [simulated, setSimulated] = useState(false);

  useEffect(() => {
    const online = () => {
      setBrowserReportsOnline(true);
      // Optimistic, and deliberately so: the next request decides. Staying
      // pessimistic until something succeeds would leave the queue idle exactly
      // when the connection has just come back.
      setReachable(true);
    };
    const offline = () => setBrowserReportsOnline(false);

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const reportFailure = useCallback(() => setReachable(false), []);
  const reportSuccess = useCallback(() => {
    setReachable(true);
    setBrowserReportsOnline(true);
  }, []);

  const status: Connectivity = simulated
    ? 'simulated-offline'
    : browserReportsOnline && reachable
      ? 'online'
      : 'offline';

  return {
    status,
    shouldQueue: status !== 'online',
    browserReportsOnline,
    reportFailure,
    reportSuccess,
    setSimulatedOffline: setSimulated,
  };
}
