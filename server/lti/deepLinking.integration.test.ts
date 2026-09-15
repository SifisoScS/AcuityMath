// @vitest-environment node

/**
 * A teacher choosing what their class will work on.
 *
 * Deep linking is the one exchange where **this product is the issuer**, and
 * every field flips with that. The response here is verified against the JWKS
 * this product publishes, with the issuer and audience a real platform would
 * check — so writing them the familiar way round fails rather than passing.
 *
 * The other half is `data`: the platform's opaque token, which must come back
 * untouched. It is their nonce, and the tests treat it as one.
 */

import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addMember } from '../learning/membership';
import { publicJwks } from './keys';
import {
  buildDeepLinkingResponse,
  CannotReturnChoice,
  deepLinkingReturnPage,
  DEEP_LINKING_RESPONSE,
  LTI_RESOURCE_LINK,
  type DeepLinkingTarget,
} from './deepLinking';
import {
  beginChoice,
  consumeChoice,
  DEEP_LINK_WINDOW_MS,
  pendingChoice,
  purgeExpiredChoices,
} from './deepLinkRequests';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const ISSUER = 'https://platform.test';
const CLIENT_ID = 'client-1';

describeWithDb('returning a teacher’s choice', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let platformId: number;
  let teacherId: number;
  let otherTeacherId: number;

  beforeAll(async () => {
    harness = await createTestDatabase('ltideeplink');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;

    const lincoln = await createInstitution(db, 'Lincoln Unified');
    const teacher = await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');
    const other = await addMember(db, lincoln.id, 'other@lincoln.test', 'teacher');
    teacherId = teacher.userId;
    otherTeacherId = other.userId;

    await db.insert(schema.ltiPlatforms).values({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      name: 'Test LMS',
      authLoginUrl: `${ISSUER}/auth`,
      authTokenUrl: `${ISSUER}/token`,
      keysetUrl: `${ISSUER}/jwks`,
    });
    const [platform] = await db.select().from(schema.ltiPlatforms).limit(1);
    platformId = platform.id;
  });

  const target = (overrides: Partial<DeepLinkingTarget> = {}): DeepLinkingTarget => ({
    clientId: CLIENT_ID,
    issuer: ISSUER,
    deploymentId: 'dep-1',
    returnUrl: 'https://platform.test/deep_link_return',
    acceptTypes: [LTI_RESOURCE_LINK],
    acceptMultiple: false,
    data: 'opaque-platform-token',
    ...overrides,
  });

  const build = (overrides: Record<string, unknown> = {}) =>
    buildDeepLinkingResponse(db, {
      target: target(),
      chosen: [{ title: 'Fractions', conceptId: 'fractions-1' }],
      launchUrl: 'https://acuitymath.test/api/lti/launch',
      ...overrides,
    });

  /** Verifies the response exactly as the platform that receives it would. */
  async function asPlatformWouldSee(jwt: string): Promise<JWTPayload> {
    const jwks = createLocalJWKSet((await publicJwks(db)) as never);
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: CLIENT_ID,
      audience: ISSUER,
      algorithms: ['RS256'],
    });
    return payload;
  }

  describe('the signed response', () => {
    it('verifies against the keys this product publishes', async () => {
      const { jwt } = await build();
      await expect(asPlatformWouldSee(jwt)).resolves.toBeTruthy();
    });

    it('is issued by us and addressed to them, which is the reverse of a launch', async () => {
      /*
       * **Where the mistake lives.** Inbound, the platform issues and we are the
       * audience. Outbound it is the other way round, and writing it the
       * familiar way produces a token rejected with nothing useful in the error.
       */
      const { jwt } = await build();
      const payload = await asPlatformWouldSee(jwt);

      expect(payload.iss).toBe(CLIENT_ID);
      expect(payload.aud).toBe(ISSUER);
    });

    it('says what kind of message it is', async () => {
      const payload = await asPlatformWouldSee((await build()).jwt);
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
        DEEP_LINKING_RESPONSE,
      );
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe('dep-1');
    });

    it('echoes the platform’s opaque token exactly', async () => {
      /*
       * Their nonce. It is how they know the response belongs to the request
       * they started, and the only correct thing to do with it is give it back
       * unchanged.
       */
      const payload = await asPlatformWouldSee((await build()).jwt);
      expect(payload['https://purl.imsglobal.org/spec/lti-dl/claim/data']).toBe(
        'opaque-platform-token',
      );
    });

    it('omits the token rather than inventing one when none was sent', async () => {
      // Inventing a value is worse than omitting it: the platform matches it
      // against nothing and rejects a response that was otherwise correct.
      const { jwt } = await build({ target: target({ data: null }) });
      const payload = await asPlatformWouldSee(jwt);

      expect('https://purl.imsglobal.org/spec/lti-dl/claim/data' in payload).toBe(false);
    });

    it('describes the link the platform should create', async () => {
      const payload = await asPlatformWouldSee((await build()).jwt);
      const items = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] as
        Array<Record<string, unknown>>;

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: LTI_RESOURCE_LINK,
        title: 'Fractions',
        url: 'https://acuitymath.test/api/lti/launch',
      });
    });

    it('carries the chosen concept, so a later launch knows what it is for', async () => {
      /*
       * The whole point of the custom parameter: a link created today tells us
       * on every future launch which concept the teacher had in mind, without
       * this product keeping a separate record the platform could drift from.
       */
      const payload = await asPlatformWouldSee((await build()).jwt);
      const items = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] as
        Array<{ custom?: Record<string, string> }>;

      expect(items[0].custom).toEqual({ concept_id: 'fractions-1' });
    });

    it('asks the platform to make the gradebook column with the link', async () => {
      // Better than C5a's fallback of creating one on first launch: it exists
      // before any child has worked, and where the teacher expects it.
      const payload = await asPlatformWouldSee((await build()).jwt);
      const items = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] as
        Array<{ lineItem?: Record<string, unknown> }>;

      expect(items[0].lineItem).toEqual({ scoreMaximum: 100, label: 'Fractions' });
    });

    it('expires within minutes', async () => {
      const payload = await asPlatformWouldSee((await build()).jwt);
      expect((payload.exp as number) - (payload.iat as number)).toBe(5 * 60);
    });
  });

  describe('what the platform said it would take', () => {
    it('refuses more than one item when it asked for one', async () => {
      /*
       * Refused rather than trimmed. Quietly sending the first would create one
       * link when somebody asked for three, and they would have no way to tell
       * which two went missing.
       */
      await expect(
        build({ chosen: [{ title: 'A' }, { title: 'B' }] }),
      ).rejects.toThrow(CannotReturnChoice);
    });

    it('allows several when it said it would take them', async () => {
      const { jwt } = await build({
        target: target({ acceptMultiple: true }),
        chosen: [{ title: 'A' }, { title: 'B' }],
      });
      const payload = await asPlatformWouldSee(jwt);

      expect(
        payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'],
      ).toHaveLength(2);
    });

    it('refuses a type it does not accept, naming what it asked for', async () => {
      await expect(
        build({ target: target({ acceptTypes: ['file', 'html'] }) }),
      ).rejects.toThrow(/file, html/);
    });

    it('treats an empty accept list as permission rather than prohibition', async () => {
      // Several platforms omit the field and mean "the usual". Refusing them all
      // would be reading silence as a no.
      await expect(build({ target: target({ acceptTypes: [] }) })).resolves.toBeTruthy();
    });

    it('refuses to send nothing', async () => {
      await expect(build({ chosen: [] })).rejects.toThrow(/Nothing was chosen/);
    });
  });

  describe('the page that carries it back', () => {
    it('posts to the platform’s return URL', () => {
      /*
       * A self-submitting form, because the specification requires the response
       * to arrive as a POST from the teacher's own browser. There is no
       * server-to-server call here.
       */
      const page = deepLinkingReturnPage('https://platform.test/return', 'the.jwt.here');

      expect(page).toContain('action="https://platform.test/return"');
      expect(page).toContain('name="JWT"');
      expect(page).toContain('value="the.jwt.here"');
      expect(page).toContain('.submit()');
    });

    it('escapes what it puts in the form', () => {
      // The one page in this product that is handed a value and renders it.
      const page = deepLinkingReturnPage('https://x.test/"><script>alert(1)</script>', 'j');
      expect(page).not.toContain('<script>alert(1)');
      expect(page).toContain('&lt;script&gt;');
    });

    it('leaves a button for anyone the script does not reach', () => {
      // A form that submits itself and fails leaves somebody staring at a blank
      // page with no idea what they were waiting for.
      expect(deepLinkingReturnPage('https://x.test/r', 'j')).toContain('<button type="submit">');
    });
  });

  describe('holding the request between the launch and the choice', () => {
    const begin = (userId = teacherId) =>
      beginChoice(db, {
        platformId,
        userId,
        deploymentId: 'dep-1',
        returnUrl: 'https://platform.test/deep_link_return',
        acceptTypes: [LTI_RESOURCE_LINK],
        acceptMultiple: false,
        data: 'opaque-platform-token',
      });

    it('is what the teacher is asked to answer', async () => {
      const id = await begin();
      const pending = await pendingChoice(db, teacherId);

      expect(pending?.id).toBe(id);
      expect(pending?.data).toBe('opaque-platform-token');
    });

    it('is answered exactly once', async () => {
      /*
       * A choice is a **creation**. Submitting the same page twice would put two
       * copies of one link in a teacher's course, which only they can tidy up —
       * and pressing the back button is not an unusual thing to do.
       */
      const id = await begin();

      expect(await consumeChoice(db, id, teacherId)).not.toBeNull();
      expect(await consumeChoice(db, id, teacherId)).toBeNull();
    });

    it('lets only one of two simultaneous answers through', async () => {
      const id = await begin();
      const results = await Promise.all([
        consumeChoice(db, id, teacherId),
        consumeChoice(db, id, teacherId),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('cannot be answered by somebody else', async () => {
      /*
       * Without this, a teacher holding one request id could answer another's —
       * creating a link, signed by us, in a course they have nothing to do with.
       */
      const id = await begin(teacherId);
      expect(await consumeChoice(db, id, otherTeacherId)).toBeNull();

      // And it is still there for the person it belongs to.
      expect(await consumeChoice(db, id, teacherId)).not.toBeNull();
    });

    it('expires, and burns rather than waiting', async () => {
      const id = await begin();
      const later = new Date(Date.now() + DEEP_LINK_WINDOW_MS + 1000);

      expect(await consumeChoice(db, id, teacherId, later)).toBeNull();

      const [row] = await db
        .select()
        .from(schema.ltiDeepLinkRequests)
        .where(eq(schema.ltiDeepLinkRequests.id, id));
      // Left unspent, a stale page could be submitted once whoever held it had
      // been forgotten about.
      expect(row.consumedAt).not.toBeNull();
    });

    it('is not offered once it has expired', async () => {
      await begin();
      const later = new Date(Date.now() + DEEP_LINK_WINDOW_MS + 1000);
      expect(await pendingChoice(db, teacherId, later)).toBeNull();
    });

    it('abandons an earlier request when a teacher starts again', async () => {
      /*
       * A teacher who starts, wanders off and starts again should not find two
       * pending requests and a picker that has to guess — and the older one
       * names a return URL the platform has already given up on.
       */
      const first = await begin();
      const second = await begin();

      expect(await consumeChoice(db, first, teacherId)).toBeNull();
      expect((await pendingChoice(db, teacherId))?.id).toBe(second);
    });

    it('removes requests nobody came back for', async () => {
      await begin();
      await purgeExpiredChoices(db, new Date(Date.now() + DEEP_LINK_WINDOW_MS + 1000));
      expect(await db.select().from(schema.ltiDeepLinkRequests)).toHaveLength(0);
    });
  });
});
