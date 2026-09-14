// @vitest-environment node

/**
 * The launch endpoint, over real HTTP.
 *
 * The router is mounted on a real express app and driven with real requests,
 * because three of the things that decide whether an LTI integration works at
 * all are invisible from the module level: whether the body parser understands
 * what a platform actually posts, what the `Set-Cookie` header says, and what a
 * refusal looks like to the person reading it.
 *
 * The first of those was already wrong before this suite existed.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import express from 'express';
import { SignJWT, importPKCS8, type JWK } from 'jose';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addDeployment } from './platforms';
import { beginLaunch } from './launchState';
import { forgetKeySets, LTI_CLAIM } from './idToken';
import { addMember } from '../learning/membership';
import { signAgreement } from '../learning/institutionAgreements';
import { recordingPermission } from '../learning/consentGate';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const SUITE = 'ltiroutes';
const ISSUER = 'https://platform.test';
const CLIENT_ID = 'client-1';
const DEPLOYMENT = 'dep-1';
const TARGET = 'https://acuitymath.test/practice';

describeWithDb('the launch endpoint', () => {
  let harness: TestDatabase;
  let jwksServer: Server;
  let appServer: Server;
  let base: string;
  let keysetUrl: string;
  let lincoln: { id: number };
  let getDatabase: () => never extends never ? ReturnType<typeof import('../db/client').getDatabase> : never;
  let closeDatabase: () => Promise<void>;

  const key = (() => {
    const kid = randomUUID();
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const jwk = createPublicKey(publicKey).export({ format: 'jwk' }) as JWK;
    return { kid, privatePem: privateKey, jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } as JWK };
  })();

  beforeAll(async () => {
    harness = await createTestDatabase(SUITE);

    /*
     * The route calls `getDatabase()`, which memoises `DATABASE_URL` on first
     * use. Pointing it at this suite's own database before the router is
     * imported is what keeps the endpoint under test talking to the same rows
     * the assertions read — vitest gives each file its own process, so this
     * assignment reaches nothing else.
     */
    const parsed = new URL(process.env.DATABASE_URL as string);
    const baseName = parsed.pathname.replace(/^\//, '') || 'acuitymath';
    parsed.pathname = `/${baseName}_${SUITE}`;
    process.env.DATABASE_URL = parsed.toString();

    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough-to-use';
    // Decides the cookie branch: https means the cross-site attributes apply.
    process.env.APP_BASE_URL = 'https://acuitymath.test';

    const client = await import('../db/client');
    getDatabase = client.getDatabase as typeof getDatabase;
    closeDatabase = client.closeDatabase;

    jwksServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [key.jwk] }));
    });
    await new Promise<void>(resolve => jwksServer.listen(0, '127.0.0.1', resolve));
    keysetUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks`;

    const { ltiRouter } = await import('./routes');
    const app = express();
    app.use(express.json());
    app.use('/api/lti', ltiRouter);
    appServer = await new Promise<Server>(resolve => {
      const created = app.listen(0, '127.0.0.1', () => resolve(created));
    });
    base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => appServer?.close(() => resolve()));
    await new Promise<void>(resolve => jwksServer?.close(() => resolve()));
    await closeDatabase?.();
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    forgetKeySets();
    lincoln = await createInstitution(harness.db, 'Lincoln Unified');

    await harness.db.insert(schema.ltiPlatforms).values({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      name: 'Test LMS',
      authLoginUrl: `${ISSUER}/auth`,
      authTokenUrl: `${ISSUER}/token`,
      keysetUrl,
    });
    const [platform] = await harness.db
      .select({ id: schema.ltiPlatforms.id })
      .from(schema.ltiPlatforms)
      .limit(1);
    await addDeployment(harness.db, platform.id, DEPLOYMENT, lincoln.id);
  });

  /** A district that has accepted the terms, so its pupils can be provisioned. */
  async function agree() {
    const head = await addMember(harness.db, lincoln.id, 'head@lincoln.test', 'institution_admin');
    return signAgreement(harness.db, {
      institutionId: lincoln.id,
      signedByUserId: head.userId,
      signatoryName: 'Grace Hopper',
      signatoryTitle: 'Head of School',
      agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
    });
  }

  async function startTrip() {
    return beginLaunch(
      harness.db,
      { issuer: ISSUER, loginHint: 'u-1', targetLinkUri: TARGET },
      `${base}/api/lti/launch`,
    );
  }

  async function mint(nonce: string, claims: Record<string, unknown> = {}): Promise<string> {
    return new SignJWT({
      sub: 'sub-teacher-1',
      nonce,
      name: 'Grace Hopper',
      email: 'grace@lincoln.test',
      [LTI_CLAIM.version]: '1.3.0',
      [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
      [LTI_CLAIM.deploymentId]: DEPLOYMENT,
      [LTI_CLAIM.targetLinkUri]: TARGET,
      [LTI_CLAIM.roles]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: key.kid })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(await importPKCS8(key.privatePem, 'RS256'));
  }

  /** A platform posts a form, never JSON. Every request here does the same. */
  function post(path: string, fields: Record<string, string>) {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      redirect: 'manual',
    });
  }

  describe('what a platform actually posts', () => {
    it('parses a form-encoded initiation', async () => {
      /*
       * **This was broken and passing.** C3a added `POST /login` and probed it
       * with JSON, which the application's `express.json()` handled. A real
       * platform posts `application/x-www-form-urlencoded`, which nothing on
       * this router parsed — so every genuine POST initiation was answered with
       * a complaint that the three parameters it had just sent were missing.
       */
      const response = await post('/api/lti/login', {
        iss: ISSUER,
        login_hint: 'u-1',
        target_link_uri: TARGET,
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain(`${ISSUER}/auth`);
    });
  });

  describe('a teacher launching', () => {
    it('is signed in and sent to the target the trip started with', async () => {
      const { state, nonce } = await startTrip();

      const response = await post('/api/lti/launch', {
        state,
        id_token: await mint(nonce),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(TARGET);

      const [user] = await harness.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'grace@lincoln.test'));
      expect(user.institutionId).toBe(lincoln.id);
      expect(user.role).toBe('teacher');
    });

    it('gets a cookie that survives being framed by the LMS', async () => {
      /*
       * The single most common way an LTI integration fails. A tool runs
       * cross-site, usually in an iframe on the LMS's page, and a `SameSite=Lax`
       * cookie is simply not sent on those requests — the teacher would land on
       * a page saying they are signed out, immediately after signing in.
       */
      const { state, nonce } = await startTrip();
      const response = await post('/api/lti/launch', { state, id_token: await mint(nonce) });

      const cookie = response.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('acuity_session=');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
    });
  });

  describe('a pupil launching', () => {
    const pupilToken = (nonce: string, custom: Record<string, string> = { grade_level: '3' }) =>
      mint(nonce, {
        sub: 'sub-pupil-1',
        name: 'Ada Lovelace',
        email: null,
        [LTI_CLAIM.roles]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
        'https://purl.imsglobal.org/spec/lti/claim/custom': custom,
      });

    it('lands practising, holding a learner session', async () => {
      /*
       * **The done-when for the whole of C3.** A child clicks a link in their
       * LMS and arrives able to work, with a district's agreement behind them
       * and a session of their own — the first a child can hold in this product.
       */
      await agree();
      const { state, nonce } = await startTrip();

      const response = await post('/api/lti/launch', {
        state,
        id_token: await pupilToken(nonce),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(TARGET);

      const cookie = response.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('acuity_learner=');
      // Not an adult session. The two are different principals, and the cookie
      // name is the first place that has to say so.
      expect(cookie).not.toContain('acuity_session=');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Secure');

      const [learner] = await harness.db.select().from(schema.learners);
      expect(learner.institutionId).toBe(lincoln.id);
      expect(learner.guardianId).toBeNull();
      expect((await recordingPermission(harness.db, learner.id)).mayRecord).toBe(true);
    });

    it('is refused, with nothing created, when the district has not agreed', async () => {
      const { state, nonce } = await startTrip();
      const response = await post('/api/lti/launch', {
        state,
        id_token: await pupilToken(nonce),
      });

      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await response.text()).toContain('no agreement on file');
      expect(await harness.db.select().from(schema.learners)).toHaveLength(0);
    });

    it('is refused, with nothing created, when the placement says no year group', async () => {
      await agree();
      const { state, nonce } = await startTrip();
      const response = await post('/api/lti/launch', {
        state,
        id_token: await pupilToken(nonce, {}),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).toContain('grade_level');
      expect(await harness.db.select().from(schema.learners)).toHaveLength(0);
    });
  });

  describe('a launch that does not verify', () => {
    it('says nothing about which check failed', async () => {
      /*
       * The route collapses every `reason` into one sentence. Which of them it
       * was is a different answer only to somebody working out which one they
       * can get past.
       */
      const { state, nonce } = await startTrip();
      const response = await post('/api/lti/launch', {
        state,
        id_token: await mint(`${nonce}-wrong`),
      });

      const body = await response.text();
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(body).toContain('could not be verified');
      for (const leak of ['nonce', 'state', 'signature', 'deployment', 'audience']) {
        expect(body.toLowerCase()).not.toContain(leak);
      }
    });

    it('refuses a replay of a launch that already worked', async () => {
      const { state, nonce } = await startTrip();
      const idToken = await mint(nonce);

      const first = await post('/api/lti/launch', { state, id_token: idToken });
      const second = await post('/api/lti/launch', { state, id_token: idToken });

      expect(first.status).toBe(302);
      expect(second.status).toBe(403);
      expect(second.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('the escaping on the refusal page', () => {
    it('neutralises markup, so the first message that quotes a platform is safe', async () => {
      /*
       * Tested directly and not through a request, because **nothing currently
       * reaches it with untrusted input** — every refusal below is a fixed
       * string. Saying that out loud is the point: an unreachable guard with no
       * test is a claim rather than a defence, and a refusal that quotes what
       * the platform sent is an obvious next thing for somebody to write on a
       * page that is always framed by another site.
       */
      const { escapeForRefusal } = await import('./routes');

      expect(escapeForRefusal('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
      expect(escapeForRefusal('" onload="steal()')).toBe('&quot; onload=&quot;steal()');
      expect(escapeForRefusal('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });
  });

  describe('somebody opening the address directly', () => {
    it('is told to start from their LMS', async () => {
      const response = await post('/api/lti/launch', {});

      expect(response.status).toBe(400);
      expect(await response.text()).toContain('start from the link in your LMS');
    });
  });
});
