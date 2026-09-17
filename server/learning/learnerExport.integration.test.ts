// @vitest-environment node

/**
 * "Everything recorded about your child", made true and kept true.
 *
 * Two signed promises rest on this: the family consent policy, whose hash is
 * stored against every consent row, says a parent can see everything recorded
 * about their child; and the institutional agreement says a district may request
 * an export of any pupil's records.
 *
 * Assembling the data is the easy half. The half that matters is that
 * **"everything" decays** — the next learner-scoped table somebody adds will not
 * be in the export, the export will still work, and the promise will quietly
 * become false. The first test below is the one that stops that, and it is the
 * reason this file exists.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForFamily } from '../test-support/consent';
import {
  EXPORTED_ABOUT_TABLES,
  EXPORTED_TABLES,
  exportLearner,
  exportSummary,
} from './learnerExport';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

/**
 * The inventory `drizzle/schema.test.ts` already enforces.
 *
 * Duplicated here as a literal on purpose: importing it from the test file that
 * owns it would mean one edit could relax both at once, and the whole point is
 * that a new table has to be acknowledged twice — once as learner-scoped, once
 * as exportable.
 */
const LEARNER_SCOPED = [
  'learner_access_tokens',
  'consent_events',
  'classroom_learners',
  'practice_sessions',
  'attempts',
  'learner_concept_mastery',
  'concept_mastery_history',
  'learner_ability',
  'learner_ability_history',
  'learner_misconceptions',
  'screen_time_rules',
  'screen_time_usage',
  'assignment_targets',
  'learner_rewards',
  'learner_avatars',
];

describeWithDb('exporting everything recorded about a child', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarahId: number;
  let mine: number;
  let sibling: number;

  beforeAll(async () => {
    harness = await createTestDatabase('learnerexport');
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

  describe('the completeness guard', () => {
    it('covers every learner-scoped table there is', () => {
      /*
       * **The test this file exists for.** Everything else here checks that the
       * export works today; this checks that it is still honest tomorrow.
       *
       * A table added to the schema must be classified in
       * `drizzle/schema.test.ts` or that suite fails. If it is learner-scoped and
       * not exported, this fails — so "everything recorded about your child"
       * cannot quietly stop being everything.
       */
      expect([...EXPORTED_TABLES].sort()).toEqual([...LEARNER_SCOPED].sort());
    });

    it('includes the tables that are about a child without being only theirs', () => {
      /*
       * A guardian's copy of "Ada mastered halves" is addressed to the adult and
       * is about the child. Leaving it out would mean an export claiming to be
       * everything while omitting every message this product ever sent about
       * them.
       */
      expect(EXPORTED_ABOUT_TABLES).toEqual(['notifications']);
    });
  });

  describe('what comes back', () => {
    it('carries the child’s own record and a readable shape', async () => {
      const dump = await exportLearner(db, mine);

      expect(dump?.learner.displayName).toBe('Ada');
      expect(dump?.format).toBe('acuitymath-learner-export/1');
      expect(dump?.exportedAt).toBeInstanceOf(Date);
    });

    it('has a key for every table, even the empty ones', async () => {
      /*
       * An empty array is an answer: "nothing recorded here". Omitting the key
       * would make an export of a child who has never practised look like an
       * export that failed halfway.
       */
      const dump = await exportLearner(db, mine);
      for (const table of LEARNER_SCOPED) {
        expect(dump?.records, table).toHaveProperty(table);
      }
    });

    it('carries the rows that exist', async () => {
      await db.insert(schema.practiceSessions).values({ learnerId: mine, targetLength: 8 });
      const dump = await exportLearner(db, mine);

      expect(dump?.records.practice_sessions).toHaveLength(1);
      // Consent was granted in setup, so this is never empty for a real child.
      expect(dump?.records.consent_events.length).toBeGreaterThan(0);
    });

    it('carries notifications about them', async () => {
      await db.insert(schema.notifications).values({
        userId: sarahId,
        aboutLearnerId: mine,
        type: 'milestone',
        title: 'Concept mastered',
        message: 'Ada has mastered halves.',
      });

      const dump = await exportLearner(db, mine);
      expect(dump?.about.notifications).toHaveLength(1);
    });
  });

  describe('whose records they are', () => {
    it('never includes a sibling’s', async () => {
      /*
       * The failure that would turn a privacy promise into a disclosure. Both
       * children are on the same account, so a query missing its `where` would
       * return both and nothing else would notice.
       */
      await db.insert(schema.practiceSessions).values({ learnerId: sibling, targetLength: 8 });
      await db.insert(schema.notifications).values({
        userId: sarahId,
        aboutLearnerId: sibling,
        type: 'milestone',
        title: 'Concept mastered',
        message: 'Bram has mastered halves.',
      });

      const dump = await exportLearner(db, mine);

      expect(dump?.records.practice_sessions).toHaveLength(0);
      expect(dump?.about.notifications).toHaveLength(0);
      expect(dump?.records.consent_events.every(row => (row as { learnerId: number }).learnerId === mine)).toBe(true);
    });

    it('answers nothing for a child who does not exist', async () => {
      expect(await exportLearner(db, 999_999)).toBeNull();
    });

    it('still exports a child whose records were archived', async () => {
      /*
       * Archiving honours a deletion request in the product's surfaces; it does
       * not erase the rows. A family or district asking what is *still held*
       * deserves the true answer rather than an empty one — that is the whole
       * point of the question.
       */
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date(), archivedReason: 'requested' })
        .where(eq(schema.learners.id, mine));

      const dump = await exportLearner(db, mine);
      expect(dump?.learner.archivedAt).not.toBeNull();
      expect(dump?.records.consent_events.length).toBeGreaterThan(0);
    });
  });

  describe('the summary', () => {
    it('counts what the export would contain, the same way', async () => {
      // Assembled from the export itself, so the number somebody is shown before
      // downloading and the file they get cannot disagree.
      await db.insert(schema.practiceSessions).values({ learnerId: mine, targetLength: 8 });

      const summary = await exportSummary(db, mine);
      expect(summary?.practice_sessions).toBe(1);
      expect(summary).toHaveProperty('notifications');
    });
  });
});
