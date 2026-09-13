// @vitest-environment node

/**
 * The inbound half of a launch, against a real MySQL and a real JWKS.
 *
 * The platform here is not a mock. A throwaway HTTP server serves a genuine
 * JWKS document, tokens are signed with the matching private key, and the code
 * under test fetches that document over the network the way it will in
 * production. Stubbing the key resolver would have tested every claim check and
 * skipped the one part where a mistake is unrecoverable — a tool that cannot
 * verify a signature is a tool that trusts whatever it is handed.
 *
 * Nearly every case below is the same shape: **a token that is perfectly valid
 * somewhere else, and must not be valid here.**
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8, type JWK } from 'jose';
import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addDeployment } from './platforms';
import { beginLaunch, LAUNCH_WINDOW_MS } from './launchState';
import { forgetKeySets, LaunchRejected, LTI_CLAIM, verifyLaunch } from './idToken';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const ISSUER = 'https://platform.test';
const CLIENT_ID = 'client-9000';
const DEPLOYMENT = 'dep-1';
const REDIRECT = 'https://acuitymath.test/api/lti/launch';
const TARGET = 'https://acuitymath.test/practice';

/** A keypair plus the JWK a platform would publish for it. */
function makeKey() {
  const kid = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const jwk = createPublicKey(publicKey).export({ format: 'jwk' }) as JWK;
  return { kid, privatePem: privateKey, jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } as JWK };
}

describeWithDb('accepting a launch back from a platform', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let server: Server;
  let keysetUrl: string;
  let fetches = 0;

  const platformKey = makeKey();
  /** Published alongside the real one, so "wrong key" is not "unknown key". */
  const impostorKey = makeKey();
  /**
   * A key published **without** `alg`, which plenty of real platforms do.
   *
   * It exists so the algorithm pin has something to bite on. With `alg` present
   * jose already narrows the choice to RS256 on its own, and a test built on
   * such a key passes whether or not this product pins anything.
   */
  const unlabelledKey = makeKey();

  let lincoln: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('ltitoken');
    db = harness.db;

    server = createServer((req, res) => {
      fetches += 1;
      res.setHeader('content-type', 'application/json');
      const unlabelled = { ...unlabelledKey.jwk };
      delete unlabelled.alg;
      res.end(JSON.stringify({ keys: [platformKey.jwk, impostorKey.jwk, unlabelled] }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    keysetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => server?.close(() => resolve()));
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    forgetKeySets();
    fetches = 0;
    lincoln = await createInstitution(db, 'Lincoln Unified');
  });

  /**
   * Writes a platform row directly, which needs saying out loud.
   *
   * `registerPlatform` refuses a keyset URL that is not https, and it is right
   * to: keys fetched over a channel someone can rewrite are keys someone else
   * chose. That rule is exactly why this test cannot use it — the throwaway
   * server here speaks http, and the alternatives were all worse. Carving out
   * loopback in the production guard would open a path to fetching "keys" from
   * whatever else listens on the server's own localhost, and a self-signed
   * certificate would mean turning certificate checking off process-wide.
   *
   * So the registration rule keeps its teeth and is proved where it belongs, in
   * the C2 suite, which asserts http is refused. What is under test here is what
   * happens to a token *after* a platform exists.
   */
  async function register(overrides: Record<string, unknown> = {}) {
    const values = {
      issuer: ISSUER,
      clientId: CLIENT_ID,
      name: 'Test LMS',
      authLoginUrl: `${ISSUER}/auth`,
      authTokenUrl: `${ISSUER}/token`,
      keysetUrl,
      ...overrides,
    };
    await db.insert(schema.ltiPlatforms).values(values);
    const [platform] = await db
      .select()
      .from(schema.ltiPlatforms)
      .where(
        and(
          eq(schema.ltiPlatforms.issuer, values.issuer as string),
          eq(schema.ltiPlatforms.clientId, values.clientId as string),
        ),
      )
      .limit(1);

    await addDeployment(db, platform.id, DEPLOYMENT, lincoln.id);
    return platform;
  }

  /** Starts a trip, so there is a state and a nonce to come back with. */
  async function start(overrides: Record<string, unknown> = {}) {
    return beginLaunch(
      db,
      { issuer: ISSUER, loginHint: 'user-1', targetLinkUri: TARGET, ...overrides },
      REDIRECT,
    );
  }

  interface MintOptions {
    nonce: string;
    claims?: Record<string, unknown>;
    drop?: string[];
    key?: { kid: string; privatePem: string };
    issuedAt?: number;
    expiresAt?: number;
  }

  async function mint(options: MintOptions): Promise<string> {
    const seconds = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      sub: 'platform-user-77',
      nonce: options.nonce,
      name: 'Ada Lovelace',
      email: 'ada@lincoln.test',
      [LTI_CLAIM.version]: '1.3.0',
      [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
      [LTI_CLAIM.deploymentId]: DEPLOYMENT,
      [LTI_CLAIM.targetLinkUri]: TARGET,
      [LTI_CLAIM.roles]: [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ],
      [LTI_CLAIM.context]: { id: 'ctx-1', title: 'Year 4 Maths' },
      [LTI_CLAIM.resourceLink]: { id: 'link-1' },
      ...options.claims,
    };
    for (const claim of options.drop ?? []) delete payload[claim];

    const key = options.key ?? platformKey;
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: key.kid })
      .setIssuer(String(options.claims?.iss ?? ISSUER))
      .setAudience((options.claims?.aud as string | string[]) ?? CLIENT_ID)
      .setIssuedAt(options.issuedAt ?? seconds)
      .setExpirationTime(options.expiresAt ?? seconds + 300)
      .sign(await importPKCS8(key.privatePem, 'RS256'));
  }

  /** A complete, honest launch. Most cases below are this with one thing bent. */
  async function goodLaunch(mintOptions: Partial<MintOptions> = {}) {
    await register();
    const { state, nonce } = await start();
    const idToken = await mint({ nonce, ...mintOptions });
    return { state, nonce, idToken };
  }

  async function reasonFor(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      return 'accepted';
    } catch (error) {
      if (error instanceof LaunchRejected) return error.reason;
      throw error;
    }
  }

  describe('a launch that is entirely in order', () => {
    it('is accepted, and says who arrived', async () => {
      const { state, idToken } = await goodLaunch();

      const context = await verifyLaunch(db, { idToken, state });

      expect(context.subject).toBe('platform-user-77');
      expect(context.name).toBe('Ada Lovelace');
      expect(context.email).toBe('ada@lincoln.test');
      expect(context.deploymentId).toBe(DEPLOYMENT);
      expect(context.contextTitle).toBe('Year 4 Maths');
      expect(context.resourceLinkId).toBe('link-1');
      expect(context.isStaff).toBe(false);
    });

    it('takes the district from our registry, not from the token', async () => {
      /*
       * The one fact a launch must never be allowed to assert about itself. A
       * token naming another institution changes nothing: the deployment is what
       * decides, and the deployment was bound to a district by an administrator.
       */
      const other = await createInstitution(db, 'Somebody Else Unified');
      const { state, idToken } = await goodLaunch({
        claims: { institution_id: other.id, 'https://purl.imsglobal.org/spec/lti/claim/custom': { institution_id: other.id } },
      });

      const context = await verifyLaunch(db, { idToken, state });
      expect(context.institutionId).toBe(lincoln.id);
      expect(context.institutionId).not.toBe(other.id);
    });

    it('fetches the platform keyset once across several launches', async () => {
      /*
       * Not a performance nicety. A key set rebuilt per launch refetches a
       * district's JWKS once per pupil per lesson — against somebody else's
       * server, which is how a tool gets rate-limited out of a school.
       */
      await register();
      for (let i = 0; i < 3; i += 1) {
        const { state, nonce } = await start();
        await verifyLaunch(db, { idToken: await mint({ nonce }), state });
      }

      expect(fetches).toBe(1);
    });
  });

  describe('the nonce', () => {
    it('refuses a token minted for a different trip', async () => {
      /*
       * **The check the whole round trip exists for.** This token is signed by
       * the real platform, addressed to us, unexpired and otherwise perfect. It
       * belongs to another launch, and that is the entire objection.
       */
      await register();
      const mine = await start();
      const theirs = await start();
      const idToken = await mint({ nonce: theirs.nonce });

      expect(await reasonFor(verifyLaunch(db, { idToken, state: mine.state }))).toBe('nonce');
    });

    it('refuses a token carrying no nonce at all', async () => {
      const { state, idToken } = await goodLaunch({ drop: ['nonce'] });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('nonce');
    });
  });

  describe('replay', () => {
    it('refuses the same launch presented twice', async () => {
      const { state, idToken } = await goodLaunch();

      await expect(verifyLaunch(db, { idToken, state })).resolves.toBeTruthy();
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('state');
    });

    it('burns the state even when the token is then rejected', async () => {
      /*
       * The state is spent before the token is examined, so a failed attempt
       * closes the trip. Otherwise an attacker could probe a live state with
       * token after token until one passed — and the honest owner's token,
       * arriving afterwards, would be the one that worked.
       */
      await register();
      const { state, nonce } = await start();
      const wrong = await mint({ nonce: 'not-the-nonce' });
      const right = await mint({ nonce });

      expect(await reasonFor(verifyLaunch(db, { idToken: wrong, state }))).toBe('nonce');
      expect(await reasonFor(verifyLaunch(db, { idToken: right, state }))).toBe('state');
    });

    it('refuses a state presented after its window', async () => {
      const { state, idToken } = await goodLaunch();
      const later = new Date(Date.now() + LAUNCH_WINDOW_MS + 1000);

      expect(await reasonFor(verifyLaunch(db, { idToken, state }, { now: later }))).toBe('state');
    });

    it('refuses a state nobody issued', async () => {
      const { idToken } = await goodLaunch();
      expect(await reasonFor(verifyLaunch(db, { idToken, state: 'invented' }))).toBe('state');
    });
  });

  describe('the signature', () => {
    it('refuses a token signed by a key that is not the signing key', async () => {
      /*
       * The impostor key is *in the published JWKS* — so this is not "unknown
       * key", it is a valid key being used to sign a header that names another.
       */
      const { state, idToken } = await goodLaunch({
        key: { kid: platformKey.kid, privatePem: impostorKey.privatePem },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('signature');
    });

    it('refuses an RSA signature under an algorithm LTI does not name', async () => {
      /*
       * **What the algorithm pin is actually for**, and the test exists in this
       * shape because the obvious one did not work.
       *
       * The first attempt signed HS256 with the public key as the secret and
       * passed with the pin deleted — jose refuses to hand an RSA key to an HMAC
       * verifier, so that case never reached the pin at all. This one uses a key
       * the platform published **without** `alg`, which is common; with nothing
       * else narrowing the choice, deleting the pin lets RS512 through.
       */
      await register();
      const { state, nonce } = await start();
      const wrongAlgorithm = await new SignJWT({
        sub: 'platform-user-77',
        nonce,
        [LTI_CLAIM.version]: '1.3.0',
        [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
        [LTI_CLAIM.deploymentId]: DEPLOYMENT,
        [LTI_CLAIM.targetLinkUri]: TARGET,
      })
        .setProtectedHeader({ alg: 'RS512', kid: unlabelledKey.kid })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(await importPKCS8(unlabelledKey.privatePem, 'RS512'));

      expect(await reasonFor(verifyLaunch(db, { idToken: wrongAlgorithm, state }))).toBe(
        'signature',
      );
    });

    it('refuses a token signed HS256 with the platform public key as the secret', async () => {
      /*
       * Algorithm confusion, and worth keeping even though the guard that stops
       * it turned out to live in jose rather than here: it is the case a reader
       * will ask about, and a dependency upgrade that quietly relaxed it should
       * fail this suite rather than be discovered in a district.
       */
      await register();
      const { state, nonce } = await start();
      const publicMaterial = new TextEncoder().encode(String(platformKey.jwk.n));
      const forged = await new SignJWT({
        sub: 'intruder',
        nonce,
        [LTI_CLAIM.version]: '1.3.0',
        [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
        [LTI_CLAIM.deploymentId]: DEPLOYMENT,
      })
        .setProtectedHeader({ alg: 'HS256', kid: platformKey.kid })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(publicMaterial);

      expect(await reasonFor(verifyLaunch(db, { idToken: forged, state }))).toBe('signature');
    });

    it('refuses a token that expired', async () => {
      const seconds = Math.floor(Date.now() / 1000);
      const { state, idToken } = await goodLaunch({
        issuedAt: seconds - 600,
        expiresAt: seconds - 300,
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('signature');
    });

    it('refuses a token minted long ago but given a generous expiry', async () => {
      /*
       * A platform that mints a token valid for a day has not given anyone a
       * day to use it. The launch window is what bounds a trip, and the token
       * is part of the trip.
       */
      const seconds = Math.floor(Date.now() / 1000);
      const { state, idToken } = await goodLaunch({
        issuedAt: seconds - 3600,
        expiresAt: seconds + 86_400,
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('signature');
    });
  });

  describe('who the token was written for', () => {
    it('refuses a token addressed to a different client', async () => {
      // A valid token for another tenant of the same LMS.
      const { state, idToken } = await goodLaunch({ claims: { aud: 'somebody-elses-client' } });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('signature');
    });

    it('refuses a token from a different issuer', async () => {
      const { state, idToken } = await goodLaunch({ claims: { iss: 'https://elsewhere.test' } });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('signature');
    });

    it('refuses a multi-audience token that does not name us in azp', async () => {
      const { state, idToken } = await goodLaunch({
        claims: { aud: [CLIENT_ID, 'another-tool'], azp: 'another-tool' },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('azp');
    });

    it('accepts a multi-audience token that does', async () => {
      const { state, idToken } = await goodLaunch({
        claims: { aud: [CLIENT_ID, 'another-tool'], azp: CLIENT_ID },
      });
      await expect(verifyLaunch(db, { idToken, state })).resolves.toBeTruthy();
    });
  });

  describe('the deployment', () => {
    it('refuses a deployment nobody registered', async () => {
      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.deploymentId]: 'never-registered' },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('deployment');
    });

    it("refuses another platform's deployment", async () => {
      /*
       * Cross-tenant, and the reason `resolveLaunch` takes all three of issuer,
       * client id and deployment. One registered platform naming a deployment
       * that belongs to another would otherwise reach that district's children.
       */
      const other = await createInstitution(db, 'Riverside Unified');
      await db.insert(schema.ltiPlatforms).values({
        issuer: 'https://other-lms.test',
        clientId: 'other-client',
        name: 'Other LMS',
        authLoginUrl: 'https://other-lms.test/auth',
        authTokenUrl: 'https://other-lms.test/token',
        keysetUrl,
      });
      const [otherPlatform] = await db
        .select()
        .from(schema.ltiPlatforms)
        .where(eq(schema.ltiPlatforms.clientId, 'other-client'))
        .limit(1);
      await addDeployment(db, otherPlatform.id, 'riverside-dep', other.id);

      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.deploymentId]: 'riverside-dep' },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('deployment');
    });

    it('refuses a token naming no deployment', async () => {
      const { state, idToken } = await goodLaunch({ drop: [LTI_CLAIM.deploymentId] });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('deployment');
    });
  });

  describe('the message itself', () => {
    it('refuses a version that is not 1.3.0', async () => {
      const { state, idToken } = await goodLaunch({ claims: { [LTI_CLAIM.version]: '1.2.0' } });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('version');
    });

    it('refuses a message type this product does not handle', async () => {
      /*
       * Deep linking is real, and is not built. Letting it through would put a
       * message designed to *choose* content into the handler that *serves* it.
       */
      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.messageType]: 'LtiDeepLinkingRequest' },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('message_type');
    });

    it('refuses a token naming no subject', async () => {
      const { state, idToken } = await goodLaunch({ drop: ['sub'] });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('sub');
    });

    it('refuses a target that is not the one the trip started with', async () => {
      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.targetLinkUri]: 'https://acuitymath.test/somewhere-else' },
      });
      expect(await reasonFor(verifyLaunch(db, { idToken, state }))).toBe('target');
    });
  });

  describe('what the roles mean', () => {
    it('reads a full role URI as staff', async () => {
      const { state, idToken } = await goodLaunch({
        claims: {
          [LTI_CLAIM.roles]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
        },
      });
      expect((await verifyLaunch(db, { idToken, state })).isStaff).toBe(true);
    });

    it('reads the short spelling the same way', async () => {
      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.roles]: ['Instructor'] },
      });
      expect((await verifyLaunch(db, { idToken, state })).isStaff).toBe(true);
    });

    it("treats a district's own invented role as a learner", async () => {
      /*
       * Guessing downward gives a teacher a practice screen. Guessing upward
       * gives a pupil a roster. Only one of those is recoverable by asking.
       */
      const { state, idToken } = await goodLaunch({
        claims: { [LTI_CLAIM.roles]: ['https://lincoln.test/roles#YearFourHelper'] },
      });
      expect((await verifyLaunch(db, { idToken, state })).isStaff).toBe(false);
    });
  });

  describe('what a platform is allowed to withhold', () => {
    it('accepts a launch with no name and no email', async () => {
      /*
       * A district can configure its LMS to send no personal data. That is a
       * privacy setting working, not a broken launch, and nothing downstream
       * may require these to be present.
       */
      const { state, idToken } = await goodLaunch({ drop: ['name', 'email'] });

      const context = await verifyLaunch(db, { idToken, state });
      expect(context.name).toBeNull();
      expect(context.email).toBeNull();
      expect(context.subject).toBe('platform-user-77');
    });
  });
});
