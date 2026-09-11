// @vitest-environment node

/**
 * Buying and wearing companion avatars.
 *
 * `RewardsView` used to deduct the coins in local state and pass the new balance
 * to a function in `App` that discards its argument — so a child pressed buy,
 * saw confetti, and nothing happened. Worse, the price came from a constant in
 * their own browser.
 *
 * The tests that matter here are therefore about what the server refuses to take
 * from the client: the price, and the question of who owns what.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { avatarById, FREE_AVATAR_IDS, STORE_AVATARS } from '../../src/data/avatars';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

/** A paid avatar and a free one, taken from the catalogue rather than hardcoded. */
const PAID = STORE_AVATARS.find(a => a.price > 0)!;
const FREE = STORE_AVATARS.find(a => a.price === 0)!;

describeWithDb('companion avatars', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarah: { id: number; email: string; name: string | null; role: 'parent' };
  let maya: number;
  let outsider: number;

  beforeAll(async () => {
    harness = await createTestDatabase('avatars');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';

    await db.insert(schema.users).values([
      { email: 'sarah@example.test', role: 'parent' },
      { email: 'stranger@example.test', role: 'parent' },
    ]);
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'sarah@example.test'));
    sarah = { id: row.id, email: row.email, name: row.name, role: 'parent' };
    const [other] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'stranger@example.test'));

    await db.insert(schema.learners).values([
      { guardianId: sarah.id, displayName: 'Maya', birthYear: 2016 },
      { guardianId: other.id, displayName: 'Outsider', birthYear: 2016 },
    ]);
    const [mine] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, sarah.id));
    maya = mine.id;
    const [theirs] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, other.id));
    outsider = theirs.id;
  }, 60_000);

  const caller = () =>
    appRouter.createCaller({ db, user: sarah, headers: {}, setCookie: () => {} } satisfies Context);

  const give = async (coins: number) => {
    await db.insert(schema.learnerRewards).values({ learnerId: maya, coins, xp: 0 });
  };

  const coinsOf = async () => {
    const [row] = await db
      .select()
      .from(schema.learnerRewards)
      .where(eq(schema.learnerRewards.learnerId, maya));
    return row?.coins ?? 0;
  };

  describe('buying', () => {
    it('charges the catalogue price, not a price the caller names', async () => {
      /*
       * The input has no price field at all — the shape of the procedure is what
       * makes this safe, rather than a check that could be forgotten. This test
       * pins that the amount taken is the catalogue's.
       */
      await give(1_000);
      const result = await caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id });

      expect(result.charged).toBe(PAID.price);
      expect(await coinsOf()).toBe(1_000 - PAID.price);
    });

    it('records the unlock', async () => {
      await give(1_000);
      await caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id });

      const owned = await caller().learners.avatars({ learnerId: maya });
      expect(owned).toContain(PAID.id);
    });

    it('refuses when the learner cannot afford it', async () => {
      await give(PAID.price - 1);
      await expect(
        caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id }),
      ).rejects.toThrow(/not enough star coins/i);

      expect(await coinsOf()).toBe(PAID.price - 1);
      expect(await caller().learners.avatars({ learnerId: maya })).not.toContain(PAID.id);
    });

    it('refuses a learner with no coins at all', async () => {
      await expect(
        caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id }),
      ).rejects.toThrow(/not enough star coins/i);
    });

    it('does not charge twice for one already owned', async () => {
      // A second click, or a double submit. Charging again would be the worst
      // outcome available here.
      await give(1_000);
      await caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id });
      const after = await coinsOf();

      const second = await caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id });
      expect(second.charged).toBe(0);
      expect(await coinsOf()).toBe(after);
    });

    it('charges nothing for a free one', async () => {
      await give(1_000);
      const result = await caller().learners.buyAvatar({ learnerId: maya, avatarId: FREE.id });
      expect(result.charged).toBe(0);
      expect(await coinsOf()).toBe(1_000);
    });

    it('refuses an avatar that does not exist', async () => {
      await give(1_000);
      await expect(
        caller().learners.buyAvatar({ learnerId: maya, avatarId: 'av-not-real' }),
      ).rejects.toThrow(/No such avatar/i);
      expect(await coinsOf()).toBe(1_000);
    });

    it('refuses another family child', async () => {
      await expect(
        caller().learners.buyAvatar({ learnerId: outsider, avatarId: FREE.id }),
      ).rejects.toThrow(/No such learner/);
    });
  });

  describe('what a learner owns', () => {
    it('includes the free ones without their having been bought', async () => {
      // They are not stored as rows: writing one per learner per free avatar
      // would be a table of decisions nobody made.
      const owned = await caller().learners.avatars({ learnerId: maya });
      expect(owned).toEqual(expect.arrayContaining(FREE_AVATAR_IDS));
      expect(await db.select().from(schema.learnerAvatars)).toHaveLength(0);
    });

    it('does not include one that was never bought', async () => {
      expect(await caller().learners.avatars({ learnerId: maya })).not.toContain(PAID.id);
    });

    it('lists each one once', async () => {
      await give(1_000);
      await caller().learners.buyAvatar({ learnerId: maya, avatarId: FREE.id });
      const owned = await caller().learners.avatars({ learnerId: maya });
      expect(owned.filter(id => id === FREE.id)).toHaveLength(1);
    });
  });

  describe('wearing one', () => {
    it('sets the avatar shown', async () => {
      await give(1_000);
      await caller().learners.buyAvatar({ learnerId: maya, avatarId: PAID.id });
      await caller().learners.setAvatar({ learnerId: maya, avatarId: PAID.id });

      const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, maya));
      expect(learner.avatar).toBe(avatarById(PAID.id)!.icon);
    });

    it('refuses one the learner has not unlocked', async () => {
      // Otherwise the shop is decoration: anyone could wear anything by calling
      // this directly, and the coins would buy nothing.
      await expect(
        caller().learners.setAvatar({ learnerId: maya, avatarId: PAID.id }),
      ).rejects.toThrow(/not been unlocked/i);
    });

    it('allows a free one without a purchase', async () => {
      await expect(
        caller().learners.setAvatar({ learnerId: maya, avatarId: FREE.id }),
      ).resolves.toBeTruthy();
    });
  });

  describe('the catalogue', () => {
    it('is served, so the price drawn is the price charged', async () => {
      const served = await caller().curriculum.avatars();
      expect(served).toEqual(STORE_AVATARS);
    });
  });
});
