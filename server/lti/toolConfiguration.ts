/**
 * What a platform administrator has to type into their LMS, and whether this
 * instance could actually answer them.
 *
 * The wizard that showed this before E5 had the endpoints written out as string
 * literals, and **three of the four were wrong**: it advertised
 * `/api/lti/login_init` where the route is `/login`, `/api/lti/deep_link` for a
 * message type that arrives at `/launch`, and a OneRoster base that nothing
 * serves. Nobody had mistyped them — they were written when the routes were a
 * plan, and the routes moved without them.
 *
 * So the paths live here, once, and `routes.ts` mounts from the same constants
 * the wizard reads. Drifting again would mean editing this file, which is the
 * point: a second copy is what made the first one wrong.
 *
 * **Deep linking is not a separate endpoint**, which is the correction most
 * worth reading. A `LtiDeepLinkingRequest` arrives at the same `/launch` URL as
 * a resource link and is told apart by its `message_type` claim, exactly as
 * `idToken.ts` does. An administrator who configures a distinct deep-link URL
 * gets a 404 at the moment a teacher tries to embed something.
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { publicJwks } from './keys';

type Db = MySql2Database<typeof schema>;

/** Where `server.ts` mounts `ltiRouter`. */
export const LTI_MOUNT_PATH = '/api/lti';

/**
 * The router-relative paths, which are what `routes.ts` registers.
 *
 * `jwks.json` carries its extension because platform admin forms and
 * conformance tooling expect it there — a convention rather than content
 * negotiation, as `routes.ts` already records.
 */
export const LTI_ROUTE_PATHS = {
  login: '/login',
  launch: '/launch',
  jwks: '/jwks.json',
} as const;

export interface ToolEndpoints {
  /** OIDC third-party initiation. Both verbs. */
  loginUrl: string;
  /** Where every launch lands, resource link and deep linking alike. */
  launchUrl: string;
  /** The public keyset a platform verifies our signatures against. */
  jwksUrl: string;
}

/** The absolute URLs for a given base, with no trailing slash to double up. */
export function ltiEndpoints(baseUrl: string): ToolEndpoints {
  const base = `${baseUrl.replace(/\/$/, '')}${LTI_MOUNT_PATH}`;
  return {
    loginUrl: `${base}${LTI_ROUTE_PATHS.login}`,
    launchUrl: `${base}${LTI_ROUTE_PATHS.launch}`,
    jwksUrl: `${base}${LTI_ROUTE_PATHS.jwks}`,
  };
}

export type CheckState = 'pass' | 'fail';

export interface ConfigurationCheck {
  id: string;
  /** What is being checked, in the words of somebody configuring an LMS. */
  label: string;
  state: CheckState;
  /** What it means, and for a failure, what to do about it. */
  detail: string;
}

export interface ToolConfiguration {
  endpoints: ToolEndpoints;
  /**
   * Whether `endpoints` are absolute.
   *
   * When `APP_BASE_URL` is unset the paths are returned relative, and the
   * wizard prefixes the browser's own origin and says that is what it did.
   * Inventing a host here would be the same mistake this step exists to undo —
   * the browser's address is a fact, and a guess presented as configuration is
   * not.
   */
  baseUrlConfigured: boolean;
  checks: ConfigurationCheck[];
  /**
   * Whether OneRoster is served. A literal `false` until Track D exists, read
   * by the wizard so the tab stops advertising an endpoint — and so that
   * building Track D changes this one value rather than a screen.
   */
  oneRosterAvailable: boolean;
}

/**
 * The checks this instance can honestly run on itself.
 *
 * Every one of them is a real read. The button they sit behind used to be a
 * 1,200ms `setTimeout` that reported "HTTP 200 OK · RSA-256 JWT Signed · AGS
 * v2.0 Passback Active" whatever the state of anything — a green tick somebody
 * would act on, which is worse than no button.
 *
 * **What is deliberately not checked: whether a platform can reach us.** That
 * needs a request from the platform's network, and this runs on ours. A local
 * check cannot tell a correctly configured tool behind a firewall from a
 * reachable one, so it does not claim to — the wizard prints the limit next to
 * the results rather than letting a row of ticks imply it.
 */
export async function configurationChecks(
  db: Db,
  baseUrl: string | undefined,
): Promise<ConfigurationCheck[]> {
  const checks: ConfigurationCheck[] = [];

  /*
   * The keyset is created on first fetch, so an instance nobody has launched
   * against yet legitimately has no key. That is worth saying rather than
   * hiding: a platform registered against an empty keyset stores `{"keys":[]}`
   * and caches it, and the first launch fails at signature verification with
   * nothing in our logs to explain it.
   */
  const jwks = await publicJwks(db);
  const usable = jwks.keys.filter(key => key.kty === 'RSA' && Boolean(key.kid));
  checks.push(
    usable.length > 0
      ? {
          id: 'signing_key',
          label: 'Signing key published',
          state: 'pass',
          detail: `${usable.length} key${usable.length === 1 ? '' : 's'} at the keyset URL. A platform can verify tokens we sign.`,
        }
      : {
          id: 'signing_key',
          label: 'Signing key published',
          state: 'fail',
          detail:
            'The keyset is empty. Open the keyset URL once — the first key is created on first fetch — before registering this tool with a platform.',
        },
  );

  const configured = (baseUrl ?? '').trim();
  checks.push(
    configured
      ? {
          id: 'base_url',
          label: 'Public address configured',
          state: 'pass',
          detail: `Endpoints are advertised as ${configured.replace(/\/$/, '')}.`,
        }
      : {
          id: 'base_url',
          label: 'Public address configured',
          state: 'fail',
          detail:
            'APP_BASE_URL is unset, so the URLs below are guessed from whichever request fetched them. A platform compares the redirect URI byte for byte and will refuse a launch that does not match.',
        },
  );

  /*
   * The failure this catches is the quiet one. A launch over http completes —
   * the platform redirects, the token validates, the page renders — and then
   * the browser drops the session cookie, because a cross-site cookie must be
   * `SameSite=None; Secure`. The result is a child looking at a signed-out page
   * after a launch that every log records as successful.
   */
  const isHttps = configured.startsWith('https://');
  checks.push(
    isHttps
      ? {
          id: 'https',
          label: 'Served over https',
          state: 'pass',
          detail: 'The launch session cookie can be set `SameSite=None; Secure`, which a cross-site launch requires.',
        }
      : {
          id: 'https',
          label: 'Served over https',
          state: 'fail',
          detail: configured
            ? 'This address is not https. A launch will appear to succeed and the browser will then discard the session cookie, leaving the pupil on a signed-out page.'
            : 'Cannot be checked until APP_BASE_URL is set.',
        },
  );

  return checks;
}

/** Everything the wizard needs, gathered once. */
export async function toolConfiguration(
  db: Db,
  baseUrl: string | undefined,
): Promise<ToolConfiguration> {
  const configured = (baseUrl ?? '').trim();
  return {
    endpoints: ltiEndpoints(configured),
    baseUrlConfigured: configured.length > 0,
    checks: await configurationChecks(db, baseUrl),
    oneRosterAvailable: false,
  };
}
