// @vitest-environment node

/**
 * Asking a platform for permission, against a platform that actually checks.
 *
 * The fake token endpoint here is not a stub that returns a token. It **fetches
 * our JWKS and verifies the assertion we signed**, exactly as a real LMS does,
 * and refuses anything that does not verify. That matters more here than
 * anywhere inbound: an assertion is a credential we mint with the key that
 * proves we are this product, and a test that accepted any string would have
 * left us free to sign nothing at all and still pass.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { publicJwks } from './keys';
import {
  accessTokenFor,
  buildClientAssertion,
  CLIENT_ASSERTION_TYPE,
  forgetAccessToken,
  NRPS_SCOPE,
  requestAccessToken,
  TokenRefused,
} from './accessToken';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const CLIENT_ID = 'client-9000';

/** What the fake platform decides to do with the next request. */
interface PlatformBehaviour {
  status: number;
  body: unknown;
  /** Set to a string to answer with something that is not JSON at all. */
  raw?: string;
}

describeWithDb('asking a platform for an access token', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let platformServer: Server;
  let tokenUrl: string;
  let platform: { id: number; clientId: string; authTokenUrl: string };

  /** Every assertion the fake platform accepted, for assertions about them. */
  let accepted: JWTPayload[] = [];
  let seenForms: URLSearchParams[] = [];
  let calls = 0;
  let behaviour: PlatformBehaviour | null = null;

  beforeAll(async () => {
    harness = await createTestDatabase('ltitoken2');

    platformServer = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', async () => {
        calls += 1;
        const form = new URLSearchParams(body);
        seenForms.push(form);

        if (behaviour) {
          res.statusCode = behaviour.status;
          if (behaviour.raw !== undefined) {
            res.setHeader('content-type', 'text/html');
            res.end(behaviour.raw);
            return;
          }
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(behaviour.body));
          return;
        }

        /*
         * The default path is a real verification. The assertion is checked
         * against the JWKS this product publishes, with the audience and issuer
         * a platform would check — so a signature we did not produce, or one
         * addressed elsewhere, fails here rather than being waved through.
         */
        try {
          const jwks = createLocalJWKSet((await publicJwks(db)) as never);
          const { payload } = await jwtVerify(form.get('client_assertion') ?? '', jwks, {
            issuer: CLIENT_ID,
            subject: CLIENT_ID,
            audience: tokenUrl,
            algorithms: ['RS256'],
          });
          accepted.push(payload);
        } catch (error) {
          res.statusCode = 401;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({ error: 'invalid_client', error_description: String(error) }),
          );
          return;
        }

        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            access_token: `granted-${calls}`,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: form.get('scope'),
          }),
        );
      });
    });

    await new Promise<void>(resolve => platformServer.listen(0, '127.0.0.1', resolve));
    tokenUrl = `http://127.0.0.1:${(platformServer.address() as AddressInfo).port}/token`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => platformServer?.close(() => resolve()));
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    /*
     * Re-read rather than captured once. `harness.db` is a getter, and the
     * restart case below closes the connection behind it — a handle cached in
     * `beforeAll` would be dead for every test that followed, which is exactly
     * what happened.
     */
    db = harness.db;
    accepted = [];
    seenForms = [];
    calls = 0;
    behaviour = null;

    /*
     * Written directly, because `registerPlatform` requires https and the
     * throwaway server here speaks http — the same compromise C3b names, for the
     * same reason, and the https rule stays proved in the C2 suite.
     */
    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: CLIENT_ID,
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: tokenUrl,
      keysetUrl: 'https://platform.test/jwks',
    });
    const [row] = await db.select().from(schema.ltiPlatforms).limit(1);
    platform = { id: row.id, clientId: row.clientId, authTokenUrl: row.authTokenUrl };
  });

  describe('the assertion we sign', () => {
    it('is accepted by a platform that verifies it against our JWKS', async () => {
      const token = await requestAccessToken(db, platform, NRPS_SCOPE);

      expect(token.accessToken).toBe('granted-1');
      expect(accepted).toHaveLength(1);
    });

    it('names our client id as both issuer and subject', async () => {
      /*
       * Looks like a mistake and is what RFC 7523 requires: the client is both
       * the issuer of the assertion and the subject it is about.
       */
      await requestAccessToken(db, platform, NRPS_SCOPE);

      expect(accepted[0].iss).toBe(CLIENT_ID);
      expect(accepted[0].sub).toBe(CLIENT_ID);
    });

    it('is addressed to the token endpoint rather than to the issuer', async () => {
      /*
       * The field platforms disagree about, and getting it wrong yields
       * `invalid_client` with nothing else to go on. Addressing the *issuer*
       * would also make one assertion presentable at any endpoint that issuer
       * operates.
       */
      await requestAccessToken(db, platform, NRPS_SCOPE);
      expect(accepted[0].aud).toBe(tokenUrl);
    });

    it('carries a fresh jti every time', async () => {
      // The platform's replay defence. Reusing one would be handing out the same
      // single-use credential twice and relying on nobody noticing.
      await requestAccessToken(db, platform, NRPS_SCOPE);
      await requestAccessToken(db, platform, NRPS_SCOPE);

      expect(accepted[0].jti).not.toBe(accepted[1].jti);
      expect(accepted[0].jti).toBeTruthy();
    });

    it('expires within minutes', async () => {
      await requestAccessToken(db, platform, NRPS_SCOPE);
      const { iat, exp } = accepted[0];
      expect((exp as number) - (iat as number)).toBe(5 * 60);
    });

    it('is signed by the key we publish, under the kid we name', async () => {
      const assertion = await buildClientAssertion(db, platform);
      const header = JSON.parse(
        Buffer.from(assertion.split('.')[0], 'base64url').toString('utf-8'),
      ) as { kid: string; alg: string };

      const jwks = await publicJwks(db);
      expect(header.alg).toBe('RS256');
      expect(jwks.keys.some(key => key.kid === header.kid)).toBe(true);
    });

    it('is sent as a client_credentials grant with the fixed assertion type', async () => {
      // Both are matched exactly by platforms; neither is ours to choose.
      await requestAccessToken(db, platform, NRPS_SCOPE);

      expect(seenForms[0].get('grant_type')).toBe('client_credentials');
      expect(seenForms[0].get('client_assertion_type')).toBe(CLIENT_ASSERTION_TYPE);
      expect(seenForms[0].get('scope')).toBe(NRPS_SCOPE);
    });
  });

  describe('caching', () => {
    it('asks once and reuses the answer', async () => {
      /*
       * A token lasts an hour and a roster sync is many requests. Minting one
       * per call is a request to a district's LMS for every page.
       */
      await accessTokenFor(db, platform, NRPS_SCOPE);
      await accessTokenFor(db, platform, NRPS_SCOPE);
      await accessTokenFor(db, platform, NRPS_SCOPE);

      expect(calls).toBe(1);
    });

    it('survives a restart, because the cache is a row', async () => {
      await accessTokenFor(db, platform, NRPS_SCOPE);

      const reconnected = await harness.reconnect();
      await accessTokenFor(reconnected, platform, NRPS_SCOPE);

      expect(calls).toBe(1);
    });

    it('keeps a separate token per scope', async () => {
      // A token granted for reading a roster must never be handed to something
      // that needs to write a grade.
      await accessTokenFor(db, platform, NRPS_SCOPE);
      await accessTokenFor(db, platform, 'https://purl.imsglobal.org/spec/lti-ags/scope/score');

      expect(calls).toBe(2);
      expect(await db.select().from(schema.ltiAccessTokens)).toHaveLength(2);
    });

    it('does not hand out a token that is about to expire', async () => {
      /*
       * **The margin, and the reason for it.** A roster sync is several
       * requests; one that begins with eight seconds left finishes without a
       * credential. The token below is still technically valid and is still
       * refused.
       */
      await accessTokenFor(db, platform, NRPS_SCOPE);
      const almostGone = new Date(Date.now() + 3600 * 1000 - 30 * 1000);

      await accessTokenFor(db, platform, NRPS_SCOPE, almostGone);
      expect(calls).toBe(2);
    });

    it('replaces the row rather than growing one per refresh', async () => {
      await accessTokenFor(db, platform, NRPS_SCOPE);
      await accessTokenFor(db, platform, NRPS_SCOPE, new Date(Date.now() + 3600 * 1000));

      expect(calls).toBe(2);
      expect(await db.select().from(schema.ltiAccessTokens)).toHaveLength(1);
    });

    it('asks again after the cached token is thrown away', async () => {
      // For the caller that got a 401 while holding a token this module believed
      // was good. Without it, the next call reads the same dead token.
      await accessTokenFor(db, platform, NRPS_SCOPE);
      await forgetAccessToken(db, platform.id, NRPS_SCOPE);
      await accessTokenFor(db, platform, NRPS_SCOPE);

      expect(calls).toBe(2);
      expect(await db.select().from(schema.ltiAccessTokens)).toHaveLength(1);
    });
  });

  describe('when the platform says no', () => {
    it('reports what it said', async () => {
      behaviour = {
        status: 401,
        body: { error: 'invalid_client', error_description: 'Unknown client.' },
      };

      await expect(requestAccessToken(db, platform, NRPS_SCOPE)).rejects.toThrow(/Unknown client/);
    });

    it('carries the status, so a caller can tell a refusal from an outage', async () => {
      behaviour = { status: 503, body: { error: 'temporarily_unavailable' } };

      try {
        await requestAccessToken(db, platform, NRPS_SCOPE);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as TokenRefused).status).toBe(503);
      }
    });

    it('says so plainly when the answer is not JSON', async () => {
      /*
       * A proxy's error page, most often. Left unhandled this surfaces as
       * "unexpected token < in JSON", which sends whoever reads the log looking
       * for a bug in this file rather than at their gateway.
       */
      behaviour = { status: 502, body: null, raw: '<html><body>Bad Gateway</body></html>' };

      await expect(requestAccessToken(db, platform, NRPS_SCOPE)).rejects.toThrow(/did not return JSON/);
    });

    it('says which host it could not reach, rather than "fetch failed"', async () => {
      /*
       * Found while wiring the sync trigger in C4d. An unreachable endpoint threw
       * a raw `TypeError`, which the layer above turned into a 500 — so a
       * district whose LMS was down was told the fault was ours, and whoever saw
       * it went looking for a mistake they had not made.
       */
      const unreachable = {
        ...platform,
        authTokenUrl: 'https://nowhere.invalid/token',
      };

      try {
        await requestAccessToken(db, unreachable, NRPS_SCOPE);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as TokenRefused).message).toContain('nowhere.invalid');
        // No response means no status to report. Inventing a 502 would claim to
        // know something about a server we never reached.
        expect((error as TokenRefused).status).toBe(0);
      }
    });

    it('refuses a success with no token in it', async () => {
      behaviour = { status: 200, body: { token_type: 'Bearer', expires_in: 3600 } };
      await expect(requestAccessToken(db, platform, NRPS_SCOPE)).rejects.toThrow(/no access_token/);
    });

    it('caches nothing it could not obtain', async () => {
      behaviour = { status: 401, body: { error: 'invalid_client' } };

      await expect(accessTokenFor(db, platform, NRPS_SCOPE)).rejects.toThrow();
      expect(await db.select().from(schema.ltiAccessTokens)).toHaveLength(0);
    });
  });

  describe('a grant narrower than the request', () => {
    it('is refused here, where the cause is legible', async () => {
      /*
       * A platform may grant less than was asked for. Caching that under the
       * requested scope would record a permission we do not hold, and the
       * failure would surface later as a puzzling 403 from the roster endpoint
       * instead of here, naming the scope an administrator has to enable.
       */
      behaviour = {
        status: 200,
        body: {
          access_token: 'narrow',
          expires_in: 3600,
          scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        },
      };

      await expect(requestAccessToken(db, platform, NRPS_SCOPE)).rejects.toThrow(
        /granted .* rather than/,
      );
    });

    it('accepts a platform that echoes no scope at all', async () => {
      // Common, and means the grant matched the request. Treating absence as
      // "nothing granted" would break against most real platforms.
      behaviour = { status: 200, body: { access_token: 'quiet', expires_in: 3600 } };

      const token = await requestAccessToken(db, platform, NRPS_SCOPE);
      expect(token.accessToken).toBe('quiet');
    });

    it('accepts a grant that includes ours among others', async () => {
      behaviour = {
        status: 200,
        body: {
          access_token: 'wide',
          expires_in: 3600,
          scope: `${NRPS_SCOPE} https://purl.imsglobal.org/spec/lti-ags/scope/score`,
        },
      };

      await expect(requestAccessToken(db, platform, NRPS_SCOPE)).resolves.toBeTruthy();
    });
  });

  describe('the expiry the platform states', () => {
    it('is turned into a deadline rather than kept as a countdown', async () => {
      /*
       * A duration has to be read together with the moment it was measured, and
       * a later comparison that forgets treats an hour-old token as fresh for
       * another hour.
       */
      /*
       * Canned rather than verified, because the assertion is dated to `now` and
       * the platform below checks `exp` — a moment far from the real clock is a
       * long-expired assertion, and it is refused. That refusal is the
       * verification working; it is simply not what this case is about.
       */
      behaviour = { status: 200, body: { access_token: 'dated', expires_in: 3600 } };
      const now = new Date('2026-05-01T12:00:00Z');
      const token = await requestAccessToken(db, platform, NRPS_SCOPE, now);

      expect(token.expiresAt.toISOString()).toBe('2026-05-01T13:00:00.000Z');
    });

    it('falls back to an hour when the platform does not say', async () => {
      behaviour = { status: 200, body: { access_token: 'silent' } };
      const now = new Date('2026-05-01T12:00:00Z');

      const token = await requestAccessToken(db, platform, NRPS_SCOPE, now);
      expect(token.expiresAt.toISOString()).toBe('2026-05-01T13:00:00.000Z');
    });
  });

  describe('two platforms', () => {
    it('never share a token', async () => {
      await db.insert(schema.ltiPlatforms).values({
        issuer: 'https://other.test',
        clientId: 'other-client',
        name: 'Other LMS',
        authLoginUrl: 'https://other.test/auth',
        authTokenUrl: tokenUrl,
        keysetUrl: 'https://other.test/jwks',
      });
      const [other] = await db
        .select()
        .from(schema.ltiPlatforms)
        .where(eq(schema.ltiPlatforms.clientId, 'other-client'));

      await accessTokenFor(db, platform, NRPS_SCOPE);
      // The fake platform verifies `iss` against CLIENT_ID, so the second one
      // is refused — which is itself the assertion: the assertion is minted for
      // one registration and is not interchangeable.
      await expect(
        accessTokenFor(
          db,
          { id: other.id, clientId: other.clientId, authTokenUrl: other.authTokenUrl },
          NRPS_SCOPE,
        ),
      ).rejects.toThrow();

      expect(await db.select().from(schema.ltiAccessTokens)).toHaveLength(1);
    });
  });
});
