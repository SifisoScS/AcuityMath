// @vitest-environment node

/**
 * The outbound half of a launch, against a real MySQL.
 *
 * A signature proves the platform wrote a token. It says **nothing** about
 * whether we have seen that token before — so everything worth testing here is
 * about single use: a state that works twice, or a nonce that survives the trip
 * it was minted for, turns a captured launch into a reusable key.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addDeployment, registerPlatform } from './platforms';
import {
  AmbiguousPlatform,
  beginLaunch,
  consumeState,
  LAUNCH_WINDOW_MS,
  purgeExpiredLaunches,
  UnknownPlatform,
} from './launchState';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const CANVAS = {
  issuer: 'https://canvas.instructure.com',
  clientId: '10000000000001',
  name: 'Canvas',
  authLoginUrl: 'https://canvas.instructure.com/api/lti/authorize_redirect',
  authTokenUrl: 'https://canvas.instructure.com/login/oauth2/token',
  keysetUrl: 'https://canvas.instructure.com/api/lti/security/jwks',
};

const REDIRECT = 'https://acuitymath.test/api/lti/launch';

describeWithDb('starting an LTI launch', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('ltilaunch');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    lincoln = await createInstitution(db, 'Lincoln Unified');
  });

  const begin = (overrides: Record<string, unknown> = {}) =>
    beginLaunch(
      db,
      {
        issuer: CANVAS.issuer,
        loginHint: 'user-42',
        targetLinkUri: 'https://acuitymath.test/practice',
        ...overrides,
      },
      REDIRECT,
    );

  describe('the redirect', () => {
    it('carries the parameters the specification fixes', async () => {
      await registerPlatform(db, CANVAS);
      const { redirectUrl, state, nonce } = await begin();
      const url = new URL(redirectUrl);

      expect(url.origin + url.pathname).toBe(CANVAS.authLoginUrl);
      expect(url.searchParams.get('scope')).toBe('openid');
      expect(url.searchParams.get('response_type')).toBe('id_token');
      // Not a query string: the token is too large, and must not sit in history.
      expect(url.searchParams.get('response_mode')).toBe('form_post');
      // The platform has already authenticated the user.
      expect(url.searchParams.get('prompt')).toBe('none');
      expect(url.searchParams.get('client_id')).toBe(CANVAS.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
      expect(url.searchParams.get('state')).toBe(state);
      expect(url.searchParams.get('nonce')).toBe(nonce);
    });

    it('gives every launch its own state and nonce', async () => {
      // Reuse across launches would make one capture valid for the next.
      await registerPlatform(db, CANVAS);
      const first = await begin();
      const second = await begin();

      expect(first.state).not.toBe(second.state);
      expect(first.nonce).not.toBe(second.nonce);
      expect(first.state).not.toBe(first.nonce);
    });

    it('makes them long enough not to be guessed', async () => {
      await registerPlatform(db, CANVAS);
      const { state, nonce } = await begin();
      // 32 bytes, hex. A guessable state is the same as no state.
      expect(state).toMatch(/^[0-9a-f]{64}$/);
      expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('which registration a launch belongs to', () => {
    it('refuses an issuer nobody registered', async () => {
      await expect(begin({ issuer: 'https://nowhere.test' })).rejects.toThrow(UnknownPlatform);
    });

    it('refuses to guess when an issuer has several registrations', async () => {
      /*
       * A platform hosting two installations sends a `client_id` to say which.
       * Without one there is no safe guess — picking either could start a launch
       * against the wrong district — so refusing is the only honest answer.
       */
      await registerPlatform(db, CANVAS);
      await registerPlatform(db, { ...CANVAS, clientId: '10000000000002' });

      await expect(begin()).rejects.toThrow(AmbiguousPlatform);
    });

    it('accepts the same case once a client id names one', async () => {
      await registerPlatform(db, CANVAS);
      const second = await registerPlatform(db, { ...CANVAS, clientId: '10000000000002' });

      const { redirectUrl } = await begin({ clientId: second.clientId });
      expect(new URL(redirectUrl).searchParams.get('client_id')).toBe(second.clientId);
    });

    it('refuses a deployment that is not registered, before redirecting', async () => {
      // A launch that cannot land is better refused on our page than as a failed
      // return from theirs.
      await registerPlatform(db, CANVAS);
      await expect(begin({ deploymentId: 'never-registered' })).rejects.toThrow(UnknownPlatform);
    });

    it('accepts a registered deployment', async () => {
      const platform = await registerPlatform(db, CANVAS);
      await addDeployment(db, platform.id, 'dep-1', lincoln.id);
      await expect(begin({ deploymentId: 'dep-1' })).resolves.toBeTruthy();
    });
  });

  describe('single use', () => {
    it('claims a state once', async () => {
      await registerPlatform(db, CANVAS);
      const { state, nonce } = await begin();

      const first = await consumeState(db, state);
      expect(first?.nonce).toBe(nonce);
    });

    it('refuses the same state a second time', async () => {
      /*
       * **The replay this whole module exists for.** A captured launch presented
       * again has a perfectly valid signature; the only thing that makes it
       * useless is that its state has already been spent.
       */
      await registerPlatform(db, CANVAS);
      const { state } = await begin();

      expect(await consumeState(db, state)).not.toBeNull();
      expect(await consumeState(db, state)).toBeNull();
    });

    it('lets only one of two simultaneous claims through', async () => {
      /*
       * The same replay delivered by concurrency rather than by an attacker. A
       * read-then-write would let both see "unconsumed"; the conditional update
       * makes the database the arbiter.
       */
      await registerPlatform(db, CANVAS);
      const { state } = await begin();

      const results = await Promise.all([consumeState(db, state), consumeState(db, state)]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('refuses a state that expired', async () => {
      await registerPlatform(db, CANVAS);
      const { state } = await begin();
      const later = new Date(Date.now() + LAUNCH_WINDOW_MS + 1000);

      expect(await consumeState(db, state, later)).toBeNull();
    });

    it('burns an expired state rather than leaving it claimable', async () => {
      /*
       * Expiry must not become a way to preserve a state. If an expired claim
       * left `consumedAt` null, a token held past the window would still be
       * waiting when somebody replayed it inside a new one.
       */
      await registerPlatform(db, CANVAS);
      const { state } = await begin();
      const later = new Date(Date.now() + LAUNCH_WINDOW_MS + 1000);

      await consumeState(db, state, later);

      const [row] = await db
        .select()
        .from(schema.ltiLaunchStates)
        .where(eq(schema.ltiLaunchStates.state, state));
      expect(row.consumedAt).not.toBeNull();
    });

    it('says nothing about which kind of failure it was', async () => {
      /*
       * Unknown, spent and expired all answer the same. Telling a stranger which
       * of the three their token was is telling them how to get closer.
       */
      await registerPlatform(db, CANVAS);
      const { state } = await begin();
      await consumeState(db, state);

      expect(await consumeState(db, state)).toBeNull();
      expect(await consumeState(db, 'a-state-nobody-issued')).toBeNull();
    });
  });

  describe('housekeeping', () => {
    it('removes launches that were started and abandoned', async () => {
      await registerPlatform(db, CANVAS);
      await begin();
      await begin();

      await purgeExpiredLaunches(db, new Date(Date.now() + LAUNCH_WINDOW_MS + 1000));
      expect(await db.select().from(schema.ltiLaunchStates)).toHaveLength(0);
    });

    it('leaves launches still inside their window', async () => {
      await registerPlatform(db, CANVAS);
      await begin();

      await purgeExpiredLaunches(db);
      expect(await db.select().from(schema.ltiLaunchStates)).toHaveLength(1);
    });
  });
});
