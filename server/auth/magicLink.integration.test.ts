// @vitest-environment node
//
// jose checks `instanceof Uint8Array` on the signing key, and jsdom's
// `TextEncoder` produces one from a different realm — so the check fails with
// the memorable message "must be one of type ... Uint8Array. Received an
// instance of Uint8Array". Nothing about sessions needs a DOM. The server runs
// in real node, so this is a test-environment artifact rather than a defect.

/**
 * The sign-in token lifecycle, against a real MySQL.
 *
 * Most of these assert that something *fails*. A magic link is a bearer
 * credential, and the tests that matter are the ones proving a link cannot be
 * reused, cannot outlive its expiry, cannot be guessed from what is stored, and
 * cannot be requested without limit.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import {
  consumeMagicLink,
  issueMagicLink,
  normaliseEmail,
  RateLimited,
  revokeOutstandingLinks,
  TOKEN_LIFETIME_MS,
} from './magicLink';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('magic links', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    harness = await createTestDatabase('magiclink');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  // `harness.reset()` rebuilds the schema; 30s matches what the other
  // integration suites give it. Vitest's hook timeout is 10s regardless of
  // `testTimeout`, so leaving it default is a flake waiting for a slow run.
  beforeEach(async () => {
    await harness.reset();
  }, 30_000);

  describe('issuing', () => {
    it('never stores the token it hands out', async () => {
      // A database of live tokens is a database of ways into other people's
      // children's records.
      const { token } = await issueMagicLink(db, 'sarah@example.test');
      const rows = await db.select().from(schema.magicLinkTokens);

      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(token);
      expect(rows[0].tokenHash).toHaveLength(64); // sha-256, hex
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('issues a token long enough not to be guessed', async () => {
      const { token } = await issueMagicLink(db, 'sarah@example.test');
      // 32 random bytes, base64url — 43 characters.
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('issues a different token every time', async () => {
      const first = await issueMagicLink(db, 'a@example.test');
      const second = await issueMagicLink(db, 'b@example.test');
      expect(first.token).not.toBe(second.token);
    });

    it('does not require an account to exist', async () => {
      // A new parent and a returning one take the same path, which is also what
      // stops this endpoint answering "is this person a customer?".
      await expect(issueMagicLink(db, 'never-seen@example.test')).resolves.toBeTruthy();
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });

    it('treats an address case-insensitively', async () => {
      await issueMagicLink(db, '  Sarah@Example.TEST ');
      const [row] = await db.select().from(schema.magicLinkTokens);
      expect(row.email).toBe('sarah@example.test');
      expect(normaliseEmail(' Sarah@Example.TEST ')).toBe('sarah@example.test');
    });

    it('refuses to be a mail cannon', async () => {
      for (let i = 0; i < 5; i++) await issueMagicLink(db, 'target@example.test');
      await expect(issueMagicLink(db, 'target@example.test')).rejects.toBeInstanceOf(RateLimited);
    });

    it('limits per address, not globally', async () => {
      for (let i = 0; i < 5; i++) await issueMagicLink(db, 'busy@example.test');
      // Another parent signing in at the same moment is unaffected.
      await expect(issueMagicLink(db, 'someone-else@example.test')).resolves.toBeTruthy();
    });
  });

  describe('consuming', () => {
    it('signs in and creates the account on first use', async () => {
      const { token } = await issueMagicLink(db, 'newparent@example.test');
      const result = await consumeMagicLink(db, token);

      expect(result.ok).toBe(true);
      const [user] = await db.select().from(schema.users);
      expect(user.email).toBe('newparent@example.test');
      expect(user.role).toBe('parent');
      expect(user.lastSignedInAt).not.toBeNull();
    });

    it('signs in an existing account without creating another', async () => {
      await db.insert(schema.users).values({ email: 'returning@example.test', role: 'parent' });
      const { token } = await issueMagicLink(db, 'returning@example.test');

      const result = await consumeMagicLink(db, token);
      expect(result.ok).toBe(true);
      expect(await db.select().from(schema.users)).toHaveLength(1);
    });

    it('works exactly once', async () => {
      // A link sits in a mailbox, a shared family inbox, and a mail provider's
      // link scanner. It must stop being a credential after the first use.
      const { token } = await issueMagicLink(db, 'sarah@example.test');

      expect((await consumeMagicLink(db, token)).ok).toBe(true);
      const second = await consumeMagicLink(db, token);

      expect(second.ok).toBe(false);
      expect(second.ok === false && second.reason).toBe('already-used');
    });

    it('refuses a token that has expired', async () => {
      const { token } = await issueMagicLink(db, 'slow@example.test');
      await db
        .update(schema.magicLinkTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.magicLinkTokens.email, 'slow@example.test'));

      const result = await consumeMagicLink(db, token);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('expired');
    });

    it('expires in fifteen minutes, not longer', async () => {
      const before = Date.now();
      const { expiresAt } = await issueMagicLink(db, 'clock@example.test');
      const lifetime = expiresAt.getTime() - before;

      expect(lifetime).toBeLessThanOrEqual(TOKEN_LIFETIME_MS + 2_000);
      expect(lifetime).toBeGreaterThan(TOKEN_LIFETIME_MS - 2_000);
    });

    it('refuses a token nobody issued', async () => {
      const result = await consumeMagicLink(db, 'not-a-real-token-at-all');
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('unknown');
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });

    it('keeps two live links to separate accounts', async () => {
      // Two live links at once; each must sign in its own account only.
      const sarah = await issueMagicLink(db, 'sarah@example.test');
      const marcus = await issueMagicLink(db, 'marcus@example.test');

      const asSarah = await consumeMagicLink(db, sarah.token);
      const asMarcus = await consumeMagicLink(db, marcus.token);

      expect(asSarah.ok && asSarah.email).toBe('sarah@example.test');
      expect(asMarcus.ok && asMarcus.email).toBe('marcus@example.test');
      expect(asSarah.ok && asMarcus.ok && asSarah.userId).not.toBe(asMarcus.ok && asMarcus.userId);
    });

    it('lets only one of two simultaneous uses through', async () => {
      // The parent clicks, and their mail provider's scanner fetches the same
      // URL a fraction of a second earlier. Exactly one may sign in.
      const { token } = await issueMagicLink(db, 'race@example.test');

      const [first, second] = await Promise.all([
        consumeMagicLink(db, token),
        consumeMagicLink(db, token),
      ]);

      expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    });
  });

  describe('revoking', () => {
    it('invalidates the links a parent clicked past', async () => {
      const first = await issueMagicLink(db, 'sarah@example.test');
      const second = await issueMagicLink(db, 'sarah@example.test');

      await consumeMagicLink(db, second.token);
      await revokeOutstandingLinks(db, 'sarah@example.test');

      const stale = await consumeMagicLink(db, first.token);
      expect(stale.ok).toBe(false);
    });

    it('leaves another parent"s links alone', async () => {
      const mine = await issueMagicLink(db, 'mine@example.test');
      await issueMagicLink(db, 'theirs@example.test');

      await revokeOutstandingLinks(db, 'theirs@example.test');

      expect((await consumeMagicLink(db, mine.token)).ok).toBe(true);
    });

    it('leaves nothing outstanding for the address', async () => {
      await issueMagicLink(db, 'sarah@example.test');
      await issueMagicLink(db, 'sarah@example.test');
      await revokeOutstandingLinks(db, 'sarah@example.test');

      const [{ live }] = await db
        .select({ live: sql<number>`count(*)` })
        .from(schema.magicLinkTokens)
        .where(
          and(
            eq(schema.magicLinkTokens.email, 'sarah@example.test'),
            sql`${schema.magicLinkTokens.consumedAt} is null`,
          ),
        );
      expect(Number(live)).toBe(0);
    });
  });
});
