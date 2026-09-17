// @vitest-environment node

/**
 * The endpoints a platform administrator is told to use, checked against the
 * routes that actually exist.
 *
 * Before E5 the wizard advertised three URLs that were wrong — `/login_init`,
 * `/deep_link`, and a OneRoster base nothing serves — because the strings lived
 * in a component and the routes lived in a router, and only one of the two was
 * ever edited. The test that would have caught it is the last one in this file,
 * and it is the reason the rest exist.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { signingKey } from './keys';
import { ltiRouter } from './routes';
import {
  LTI_MOUNT_PATH,
  LTI_ROUTE_PATHS,
  configurationChecks,
  ltiEndpoints,
  toolConfiguration,
} from './toolConfiguration';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

/** What `state` a given check came back as. */
function stateOf(checks: Awaited<ReturnType<typeof configurationChecks>>, id: string) {
  const check = checks.find(entry => entry.id === id);
  if (!check) throw new Error(`No check with id ${id}`);
  return check.state;
}

describe('the URLs an administrator is given', () => {
  it('are built from the paths the router registers', () => {
    /*
     * **The assertion this file exists for.** Every path advertised is read out
     * of the router's own stack, so a route that moves without its
     * advertisement fails here rather than in somebody's LMS six months later.
     *
     * The stack is inspected rather than compared to a second list of strings,
     * because a second list is exactly what went wrong.
     */
    const registered = new Set<string>();
    for (const layer of (ltiRouter as unknown as { stack: Array<{ route?: { path: string } }> })
      .stack) {
      if (layer.route) registered.add(layer.route.path);
    }

    expect(registered).toContain(LTI_ROUTE_PATHS.login);
    expect(registered).toContain(LTI_ROUTE_PATHS.launch);
    expect(registered).toContain(LTI_ROUTE_PATHS.jwks);

    const endpoints = ltiEndpoints('https://acuitymath.org');
    expect(endpoints.loginUrl).toBe('https://acuitymath.org/api/lti/login');
    expect(endpoints.launchUrl).toBe('https://acuitymath.org/api/lti/launch');
    expect(endpoints.jwksUrl).toBe('https://acuitymath.org/api/lti/jwks.json');
  });

  it('does not advertise a route the router has never had', () => {
    /*
     * The three that were wrong, named. `login_init` and `deep_link` are not
     * typos of anything here — they were written when the routes were a plan.
     */
    const advertised = Object.values(ltiEndpoints('https://acuitymath.org'));
    expect(advertised.some(url => url.includes('login_init'))).toBe(false);
    expect(advertised.some(url => url.includes('deep_link'))).toBe(false);
    expect(advertised.some(url => url.includes('oneroster'))).toBe(false);
  });

  it('sends deep linking to the same place as a resource link', () => {
    /*
     * Not an oversight — the specification distinguishes the two by
     * `message_type` inside the token, and `idToken.ts` reads it there. A
     * platform configured with a separate deep-link URL 404s at the moment a
     * teacher first tries to embed something, which is the worst possible time
     * to find out.
     */
    const endpoints = ltiEndpoints('https://acuitymath.org');
    expect(endpoints.launchUrl).toBe(`https://acuitymath.org${LTI_MOUNT_PATH}/launch`);
  });

  it('survives a base URL with a trailing slash', () => {
    // An administrator pastes what their host gave them, which often ends in /.
    expect(ltiEndpoints('https://acuitymath.org/').launchUrl).toBe(
      'https://acuitymath.org/api/lti/launch',
    );
  });

  it('returns relative paths rather than inventing a host', () => {
    // With nothing configured there is no honest absolute URL to give. The
    // shape is still useful; a guessed hostname would not be.
    expect(ltiEndpoints('').launchUrl).toBe('/api/lti/launch');
  });
});

describeWithDb('what this instance can honestly check about itself', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    harness = await createTestDatabase('ltitoolconfig');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
  });

  it('fails when the keyset is empty, which is the state before a first fetch', async () => {
    /*
     * A platform registered against an empty keyset stores `{"keys":[]}`, caches
     * it for hours, and then fails every launch at signature verification with
     * nothing in our logs to explain it.
     */
    const checks = await configurationChecks(db, 'https://acuitymath.org');
    expect(stateOf(checks, 'signing_key')).toBe('fail');
  });

  it('passes once a key exists', async () => {
    await signingKey(db);
    const checks = await configurationChecks(db, 'https://acuitymath.org');
    expect(stateOf(checks, 'signing_key')).toBe('pass');
  });

  it('fails an http address, because the session cookie is the part that breaks', async () => {
    /*
     * The quiet failure. A launch over http completes — redirect, token
     * validated, page rendered — and the browser then discards the session
     * cookie, because a cross-site cookie must be `SameSite=None; Secure`. The
     * pupil lands on a signed-out page after a launch every log calls a success.
     */
    await signingKey(db);
    const checks = await configurationChecks(db, 'http://acuitymath.org');
    expect(stateOf(checks, 'https')).toBe('fail');
    expect(stateOf(checks, 'base_url')).toBe('pass');
  });

  it('fails an unset address, and says https cannot be judged yet', async () => {
    await signingKey(db);
    const checks = await configurationChecks(db, undefined);
    expect(stateOf(checks, 'base_url')).toBe('fail');
    expect(stateOf(checks, 'https')).toBe('fail');
    expect(checks.find(check => check.id === 'https')?.detail).toMatch(/until APP_BASE_URL is set/);
  });

  it('passes everything for a configured https deployment', async () => {
    await signingKey(db);
    const checks = await configurationChecks(db, 'https://acuitymath.org');
    expect(checks.every(check => check.state === 'pass')).toBe(true);
  });

  it('claims nothing about being reachable from a platform', async () => {
    /*
     * The limit that has to stay stated. These checks run on our network; a
     * platform reaches us across somebody else's. No arrangement of local reads
     * can tell a correctly configured tool behind a firewall from a reachable
     * one, so no check may be worded as though it had.
     */
    await signingKey(db);
    const checks = await configurationChecks(db, 'https://acuitymath.org');
    const words = checks.map(check => `${check.label} ${check.detail}`).join(' ').toLowerCase();
    expect(words).not.toMatch(/handshake|reachable|200 ok|passback/);
  });

  it('does not offer OneRoster until something serves it', async () => {
    // Track D. One value here rather than a screen that has to be remembered.
    const config = await toolConfiguration(db, 'https://acuitymath.org');
    expect(config.oneRosterAvailable).toBe(false);
  });

  it('reports whether the endpoints it returned are absolute', async () => {
    expect((await toolConfiguration(db, 'https://acuitymath.org')).baseUrlConfigured).toBe(true);
    expect((await toolConfiguration(db, undefined)).baseUrlConfigured).toBe(false);
  });
});
