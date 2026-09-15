// @vitest-environment node

/**
 * Deletion that deletes.
 *
 * The institutional agreement districts sign says *"deletion removes their
 * practice history rather than hiding it."* Until E3 the product had only
 * `archivedAt`, a soft delete, and the schema's own comment called it the answer
 * to a COPPA deletion request. Two documents in this repository disagreed and
 * the code implemented the weaker one.
 *
 * The assertion that matters here is **that nothing remains**, and it is checked
 * against the export's definition of "everything about a child" rather than a
 * second list — because a second list would eventually disagree, and it would
 * disagree silently in the worst direction: an export showing a parent a table
 * that deletion does not empty.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForFamily } from '../test-support/consent';
import { createInstitution } from './institutions';
import { createDistrictLearner } from './districtLearners';
import { EXPORTED_ABOUT_TABLES, EXPORTED_TABLES, exportLearner } from './learnerExport';
import {
  CannotDelete,
  deleteLearner,
  deletionsForInstitution,
  tablesLeftBehind,
} from './learnerDeletion';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('erasing a child', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarahId: number;
  let mine: number;
  let sibling: number;

  const asker = () => ({ userId: sarahId, email: 'sarah@example.test' });

  beforeAll(async () => {
    harness = await createTestDatabase('learnerdeletion');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;

    const [sarah] = await db
      .insert(schema.users)
      .values({ email: 'sarah@example.test', role: 'parent' })
      .$returningId();
    sarahId = sarah.id;

    const [first] = await db
      .insert(schema.learners)
      .values({ guardianId: sarahId, displayName: 'Ada', birthYear: 2016 })
      .$returningId();
    const [second] = await db
      .insert(schema.learners)
      .values({ guardianId: sarahId, displayName: 'Bram', birthYear: 2014 })
      .$returningId();
    mine = first.id;
    sibling = second.id;

    await grantConsentForFamily(db, sarahId);
  });

  /** Gives a child something in as many tables as a fixture reasonably can. */
  async function giveThemRecords(learnerId: number) {
    await db.insert(schema.practiceSessions).values({ learnerId, targetLength: 8 });
    await db.insert(schema.screenTimeRules).values({ learnerId, dailyLimitMinutes: 30 });
    await db.insert(schema.notifications).values({
      userId: sarahId,
      aboutLearnerId: learnerId,
      type: 'milestone',
      title: 'Concept mastered',
      message: 'They mastered halves.',
    });
  }

  describe('what deletion removes', () => {
    it('leaves nothing in any table the export claims to cover', async () => {
      /*
       * **The assertion this file exists for.** "Deletion removes their practice
       * history rather than hiding it" is a sentence in a signed document, and
       * this is the only thing that makes it true.
       */
      await giveThemRecords(mine);

      const before = await exportLearner(db, mine);
      expect(before?.records.practice_sessions).toHaveLength(1);

      await deleteLearner(db, mine, asker());

      for (const table of [...EXPORTED_TABLES, ...EXPORTED_ABOUT_TABLES]) {
        const rows = await db.execute(
          // Counted by raw name so this asserts against the database rather than
          // against the same map the deletion used.
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${
            table === 'notifications' ? 'about_learner_id' : 'learner_id'
          } = ${mine}` as never,
        );
        const count = Number((rows as unknown as [Array<{ n: number }>])[0][0].n);
        expect(count, table).toBe(0);
      }
    });

    it('removes the learner row itself', async () => {
      await deleteLearner(db, mine, asker());
      expect(await exportLearner(db, mine)).toBeNull();
    });

    it('removes an LTI link, which the export never showed', async () => {
      /*
       * Not in the export — an LTI link is a fact about a platform account, not
       * a record of a child's learning, so it has no place in what a parent is
       * shown. It still has to go: an identity surviving its learner would
       * resolve the next launch to a child who no longer exists.
       */
      await db.insert(schema.ltiPlatforms).values({
        issuer: 'https://platform.test',
        clientId: 'client-1',
        name: 'Test LMS',
        authLoginUrl: 'https://platform.test/auth',
        authTokenUrl: 'https://platform.test/token',
        keysetUrl: 'https://platform.test/jwks',
      });
      const [platform] = await db.select().from(schema.ltiPlatforms).limit(1);
      await db
        .insert(schema.ltiIdentities)
        .values({ platformId: platform.id, subject: 'sub-1', learnerId: mine });

      const receipt = await deleteLearner(db, mine, asker());

      expect(receipt.removed.lti_identities).toBe(1);
      expect(await db.select().from(schema.ltiIdentities)).toHaveLength(0);
    });

    it('touches nobody else', async () => {
      /*
       * Both children are on the same account. A delete missing its `where`
       * would take the sibling too, and nothing else would notice.
       */
      await giveThemRecords(mine);
      await giveThemRecords(sibling);

      await deleteLearner(db, mine, asker());

      const survivor = await exportLearner(db, sibling);
      expect(survivor?.learner.displayName).toBe('Bram');
      expect(survivor?.records.practice_sessions).toHaveLength(1);
      expect(survivor?.about.notifications).toHaveLength(1);
    });
  });

  describe('what it leaves behind', () => {
    it('records that it happened, and nothing about who they were', async () => {
      /*
       * A district may need to show they asked; this product may need to show it
       * complied. Neither needs the child's name, their answers, or their
       * guardian's address — and keeping any of it would make "deletion" a word
       * rather than an act.
       */
      await giveThemRecords(mine);
      await deleteLearner(db, mine, asker());

      const [tomb] = await db.select().from(schema.learnerDeletions);
      expect(tomb.learnerId).toBe(mine);
      expect(tomb.requestedByEmail).toBe('sarah@example.test');

      // Nothing identifying the child survives in the record of their deletion.
      expect(JSON.stringify(tomb)).not.toContain('Ada');
    });

    it('counts what went, which is the only evidence afterwards', async () => {
      await giveThemRecords(mine);
      const receipt = await deleteLearner(db, mine, asker());

      expect(receipt.removed.practice_sessions).toBe(1);
      expect(receipt.removed.screen_time_rules).toBe(1);
      expect(receipt.removed.notifications).toBe(1);
      expect(receipt.removed.consent_events).toBeGreaterThan(0);
      expect(receipt.remaining.practice_sessions).toBe(0);
    });

    it('is a number that resolves to nobody', async () => {
      // Deliberately not a foreign key. A constraint would either forbid the
      // deletion or drag the record of it away with the child.
      await deleteLearner(db, mine, asker());

      const [tomb] = await db.select().from(schema.learnerDeletions);
      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, tomb.learnerId));
      expect(learner).toBeUndefined();
    });

    it('lets a district see what it erased', async () => {
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const pupil = await createDistrictLearner(db, {
        institutionId: lincoln.id,
        displayName: 'Ada',
        birthYear: 2016,
      });

      await deleteLearner(db, pupil.id, asker());

      const records = await deletionsForInstitution(db, lincoln.id);
      expect(records).toHaveLength(1);
      expect(records[0].institutionId).toBe(lincoln.id);
    });

    it('does not attribute a family’s deletion to a district', async () => {
      await deleteLearner(db, mine, asker());
      const [tomb] = await db.select().from(schema.learnerDeletions);
      expect(tomb.institutionId).toBeNull();
    });
  });

  describe('archiving is a different act', () => {
    it('hides a child without removing anything', async () => {
      /*
       * The distinction E3 made load-bearing. Archiving is for a child who has
       * **stopped** — they left the school, the family paused. Their records
       * stay and nothing is lost if they come back.
       */
      await giveThemRecords(mine);
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date() })
        .where(eq(schema.learners.id, mine));

      const dump = await exportLearner(db, mine);
      expect(dump?.learner.archivedAt).not.toBeNull();
      expect(dump?.records.practice_sessions).toHaveLength(1);
      expect(await db.select().from(schema.learnerDeletions)).toHaveLength(0);
    });
  });

  describe('the guard for a cascade somebody forgets', () => {
    it('names the tables that still hold rows', () => {
      /*
       * **Unreachable today**, and tested directly because of it. Every foreign
       * key pointing at `learners` cascades, so a real deletion always empties
       * everything and this always returns nothing.
       *
       * It exists for the foreign key somebody adds later without
       * `onDelete: cascade` — at which point a child's answers would survive
       * their deletion while the function reported success, and a district would
       * be told an erasure happened that did not. An unreachable guard with no
       * test is a claim rather than a defence.
       */
      expect(tablesLeftBehind({ attempts: 0, notifications: 0 })).toEqual([]);
      expect(tablesLeftBehind({ attempts: 7, notifications: 0 })).toEqual(['attempts (7)']);
      expect(tablesLeftBehind({ attempts: 7, notifications: 2 })).toEqual([
        'attempts (7)',
        'notifications (2)',
      ]);
    });
  });

  describe('refusals', () => {
    it('will not delete a child who does not exist', async () => {
      try {
        await deleteLearner(db, 999_999, asker());
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as CannotDelete).reason).toBe('no_such_learner');
      }
    });

    it('will not delete the same child twice', async () => {
      await deleteLearner(db, mine, asker());
      await expect(deleteLearner(db, mine, asker())).rejects.toThrow(CannotDelete);
      expect(await db.select().from(schema.learnerDeletions)).toHaveLength(1);
    });
  });
});
