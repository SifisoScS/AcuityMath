// @vitest-environment node

/**
 * What goes in the column, and when.
 *
 * Two questions, and the second matters more than it looks. **A gradebook must
 * never break a child's practice** — a district's server being down, a scope
 * never granted, a certificate expired: none of those is a nine-year-old's
 * problem, and none may turn a finished session into an error they have to read.
 *
 * The cost of that is silence, so every refusal carries a reason. A column that
 * quietly stops updating looks exactly like a child who stopped working, and
 * those have to be tellable apart.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { createDistrictLearner } from '../learning/districtLearners';
import { addDeployment } from './platforms';
import { curriculumCoverage } from './coverage';
import { reportScore } from './reportScore';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

/** Old enough to sit in the `elementary` tier, which the fixtures fill. */
const BIRTH_YEAR = new Date().getFullYear() - 9;

describeWithDb('reporting a child’s progress to their school', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lms: Server;
  let base: string;
  let lincoln: { id: number };
  let contextRowId: number;
  let learnerId: number;
  let scores: Array<Record<string, unknown>> = [];
  let failWith: number | null = null;

  beforeAll(async () => {
    harness = await createTestDatabase('ltireport');

    lms = createServer((req, res) => {
      let body = '';
      req.on('data', c => {
        body += c;
      });
      req.on('end', () => {
        const url = new URL(req.url ?? '/', base);
        if (url.pathname === '/token') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: 'token', expires_in: 3600 }));
          return;
        }
        if (failWith) {
          res.statusCode = failWith;
          res.end(JSON.stringify({ error: 'refused' }));
          return;
        }
        if (url.pathname === '/line_items') {
          res.statusCode = 201;
          res.setHeader('content-type', 'application/vnd.ims.lis.v2.lineitem+json');
          res.end(JSON.stringify({ id: `${base}/line_items/1`, scoreMaximum: 100 }));
          return;
        }
        scores.push(JSON.parse(body || '{}'));
        res.statusCode = 204;
        res.end();
      });
    });
    await new Promise<void>(resolve => lms.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(lms.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => lms?.close(() => resolve()));
    await harness?.close();
  });

  /** Four concepts in the child's own tier. The denominator for everything below. */
  async function seedCurriculum(count = 4) {
    for (let i = 1; i <= count; i += 1) {
      await db.insert(schema.concepts).values({
        id: `c-${i}`,
        title: `Concept ${i}`,
        strand: 'number',
        tier: 'elementary',
        ageBandLow: 6,
        ageBandHigh: 11,
      });
    }
  }

  const setMastery = (conceptId: string, masteryScore: number) =>
    db.insert(schema.learnerConceptMastery).values({ learnerId, conceptId, masteryScore });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
    scores = [];
    failWith = null;

    lincoln = await createInstitution(db, 'Lincoln Unified');
    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: 'client-1',
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: `${base}/token`,
      keysetUrl: 'https://platform.test/jwks',
    });
    const [platform] = await db.select().from(schema.ltiPlatforms).limit(1);
    const deployment = await addDeployment(db, platform.id, 'dep-1', lincoln.id);

    await db.insert(schema.ltiContexts).values({
      deploymentId: deployment.id,
      contextId: 'ctx-1',
      title: 'Year 4 Maths',
      lineItemsUrl: `${base}/line_items`,
    });
    const [context] = await db.select().from(schema.ltiContexts).limit(1);
    contextRowId = context.id;

    const learner = await createDistrictLearner(db, {
      institutionId: lincoln.id,
      displayName: 'Ada',
      birthYear: BIRTH_YEAR,
    });
    learnerId = learner.id;

    await db.insert(schema.ltiIdentities).values({
      platformId: platform.id,
      subject: 'platform-sub-42',
      learnerId,
    });
  });

  const report = () =>
    reportScore(db, { learnerId, contextRowId, resourceLinkId: 'link-1' });

  describe('the number itself', () => {
    it('is the share of their own year group they have covered', async () => {
      /*
       * **The product decision this module records.** Un-practised concepts
       * count as nothing, so the column answers "how much of what they should
       * know do they know" rather than "how well did they do at the bit they
       * chose".
       */
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      await setMastery('c-2', 60);

      const coverage = await curriculumCoverage(db, learnerId);
      expect(coverage).toEqual({ percent: 40, conceptsInTier: 4, conceptsTouched: 2 });
    });

    it('cannot be raised by practising one concept narrowly', async () => {
      // The reason the alternative was rejected: averaging over *practised*
      // concepts would score this child 100.
      await seedCurriculum(4);
      await setMastery('c-1', 100);

      expect((await curriculumCoverage(db, learnerId))?.percent).toBe(25);
    });

    it('ignores work reached forward into another year group', async () => {
      /*
       * Worth celebrating and still not coverage of *their* year. Counting it
       * would let the column exceed what its denominator describes.
       */
      await seedCurriculum(4);
      await db.insert(schema.concepts).values({
        id: 'c-high',
        title: 'Calculus',
        strand: 'number',
        tier: 'high',
        ageBandLow: 15,
        ageBandHigh: 18,
      });
      await setMastery('c-1', 100);
      await setMastery('c-high', 100);

      expect((await curriculumCoverage(db, learnerId))?.percent).toBe(25);
    });

    it('is nothing at all when the year group has no content yet', async () => {
      /*
       * Null rather than zero, and they are different statements. Zero means
       * "has covered none of it"; null means "there is nothing to have
       * covered", which is true of age 7 today — and reporting zero would tell a
       * teacher their class is failing at a curriculum nobody has written.
       */
      expect(await curriculumCoverage(db, learnerId)).toBeNull();
    });
  });

  describe('sending it', () => {
    it('posts the coverage against the platform’s own user id', async () => {
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      await setMastery('c-2', 60);

      const outcome = await report();

      expect(outcome).toMatchObject({ sent: true, percent: 40 });
      expect(scores).toHaveLength(1);
      expect(scores[0]).toMatchObject({ userId: 'platform-sub-42', scoreGiven: 40 });
    });

    it('reuses the column on the second report', async () => {
      await seedCurriculum(4);
      await setMastery('c-1', 100);

      await report();
      await report();

      expect(await db.select().from(schema.ltiLineItems)).toHaveLength(1);
      expect(scores).toHaveLength(2);
    });
  });

  describe('when there is nothing to send to', () => {
    it('says so for a family’s child rather than trying', async () => {
      // No school gradebook to appear in, and no network call worth making.
      await seedCurriculum(4);
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();
      const [child] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Home', birthYear: BIRTH_YEAR })
        .$returningId();

      const outcome = await reportScore(db, {
        learnerId: child.id,
        contextRowId,
        resourceLinkId: 'link-1',
      });

      expect(outcome).toEqual({ sent: false, reason: 'not_a_district_learner' });
      expect(scores).toHaveLength(0);
    });

    it('stops publishing a child whose records were removed', async () => {
      /*
       * Archiving is somebody asking for a child's records to be deleted.
       * Continuing to publish their progress to a district afterwards would be
       * the opposite of honouring that.
       */
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date() })
        .where(eq(schema.learners.id, learnerId));

      expect(await report()).toEqual({ sent: false, reason: 'not_a_district_learner' });
      expect(scores).toHaveLength(0);
    });

    it('says so when the platform does not know this child', async () => {
      await seedCurriculum(4);
      await db.delete(schema.ltiIdentities);

      expect(await report()).toEqual({ sent: false, reason: 'no_lti_identity' });
    });

    it('refuses a course belonging to a different district', async () => {
      /*
       * A learner id from one district with a course id from another would
       * publish a child's progress into a gradebook belonging to a school that
       * has never heard of them.
       */
      await seedCurriculum(4);
      const riverside = await createInstitution(db, 'Riverside Unified');
      await db
        .update(schema.ltiDeployments)
        .set({ institutionId: riverside.id });

      expect(await report()).toEqual({ sent: false, reason: 'no_course' });
      expect(scores).toHaveLength(0);
    });

    it('sends nothing when the year group has no content', async () => {
      expect(await report()).toEqual({ sent: false, reason: 'no_curriculum' });
      expect(scores).toHaveLength(0);
    });
  });

  describe('when the platform fails', () => {
    it('reports the refusal rather than throwing', async () => {
      /*
       * **The rule that outranks the rest.** A district's LMS being down must
       * not turn a finished session into an error a child has to read, so
       * nothing here throws — it returns a reason, and logs it, because a column
       * that stops updating otherwise looks like a child who stopped working.
       */
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      failWith = 500;

      expect(await report()).toEqual({ sent: false, reason: 'platform_refused' });
    });

    it('does not throw when the platform is unreachable', async () => {
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      await db
        .update(schema.ltiContexts)
        .set({ lineItemsUrl: 'https://nowhere.invalid/line_items' });

      expect(await report()).toEqual({ sent: false, reason: 'platform_refused' });
    });

    it('does not throw when the scope was never granted', async () => {
      await seedCurriculum(4);
      await setMastery('c-1', 100);
      failWith = 403;

      expect(await report()).toEqual({ sent: false, reason: 'platform_refused' });
    });
  });
});
