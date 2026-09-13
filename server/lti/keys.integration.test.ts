// @vitest-environment node

/**
 * Key rotation, against a real MySQL.
 *
 * Everything here follows from one fact: **a platform caches our JWKS**, often
 * for hours. So the failures worth testing are not "is the maths right" but
 * "does a key ever sign before it is published, and does one ever leave the
 * document while its signatures are still in the wild". Both produce the same
 * symptom in an LMS — an invalid signature — and neither points at its cause.
 */

import { createVerify, createSign, createPublicKey } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createKey, promoteKey, publicJwks, retireKey, signingKey } from './keys';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('LTI signing keys', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    harness = await createTestDatabase('ltikeys');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('the keyset a platform fetches', () => {
    it('never contains private material', async () => {
      /*
       * **The assertion that matters most in this file.** Anyone holding the
       * private key can sign messages as this platform. The column is not
       * selected rather than selected-and-deleted, so a future edit cannot leak
       * it by forgetting a `delete` — and this checks the served bytes, not the
       * query.
       */
      await signingKey(db);
      const jwks = await publicJwks(db);
      const serialised = JSON.stringify(jwks);

      expect(serialised).not.toMatch(/PRIVATE KEY/);
      expect(serialised).not.toMatch(/\bd\b"\s*:/); // the RSA private exponent
      for (const key of jwks.keys) {
        expect(Object.keys(key).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
      }
    });

    it('advertises RS256, which the specification requires', async () => {
      await signingKey(db);
      const jwks = await publicJwks(db);
      expect(jwks.keys[0].alg).toBe('RS256');
      expect(jwks.keys[0].use).toBe('sig');
    });

    it('excludes retired keys', async () => {
      const first = await signingKey(db);
      const second = await createKey(db);
      await promoteKey(db, second.kid);
      await retireKey(db, first.kid);

      const kids = (await publicJwks(db)).keys.map(key => key.kid);
      expect(kids).toContain(second.kid);
      expect(kids).not.toContain(first.kid);
    });
  });

  describe('rotation', () => {
    it('publishes a new key before it signs anything', async () => {
      /*
       * The ordering the whole module exists to enforce. If creating also
       * activated, the first message signed with the new key would be rejected
       * by every platform whose cache predated it.
       *
       * Asserted on the row, not through `signingKey`. The first version of
       * this checked `signingKey().kid` still returned the old key — and a
       * mutation that made `createKey` activate **passed it**, because with two
       * rows active the query's `LIMIT 1` returned whichever it liked and
       * happened to return the old one. An assertion about *which key answers*
       * standing in for one about *which key is active*.
       */
      const original = await signingKey(db);
      const fresh = await createKey(db);

      expect((await publicJwks(db)).keys.map(k => k.kid)).toContain(fresh.kid);

      const [row] = await db
        .select()
        .from(schema.ltiKeys)
        .where(eq(schema.ltiKeys.kid, fresh.kid));
      expect(row.isActive, 'a newly created key must not sign until promoted').toBe(false);
      expect(row.activatedAt).toBeNull();
      expect((await signingKey(db)).kid).toBe(original.kid);
    });

    it('never has two keys signing at once', async () => {
      /*
       * The invariant the rest of the module assumes and nothing previously
       * checked at the point a key is *created*. `signingKey` takes `LIMIT 1`,
       * so two active rows do not fail loudly — they make which key signs
       * depend on what the database felt like returning.
       */
      await signingKey(db);
      await createKey(db);
      await createKey(db);

      const active = await db
        .select()
        .from(schema.ltiKeys)
        .where(eq(schema.ltiKeys.isActive, true));
      expect(active).toHaveLength(1);
    });

    it('keeps the outgoing key published after it stops signing', async () => {
      /*
       * Its signatures are still in flight. Pulling it from the document the
       * moment it stops signing would invalidate messages it legitimately
       * signed a second earlier.
       */
      const original = await signingKey(db);
      const fresh = await createKey(db);
      await promoteKey(db, fresh.kid);

      expect((await signingKey(db)).kid).toBe(fresh.kid);
      expect((await publicJwks(db)).keys.map(k => k.kid)).toContain(original.kid);
    });

    it('keeps exactly one key signing', async () => {
      await signingKey(db);
      const second = await createKey(db);
      const third = await createKey(db);
      await promoteKey(db, second.kid);
      await promoteKey(db, third.kid);

      const active = await db
        .select()
        .from(schema.ltiKeys)
        .where(eq(schema.ltiKeys.isActive, true));
      expect(active).toHaveLength(1);
      expect(active[0].kid).toBe(third.kid);
    });

    it('refuses to retire the key that is signing', async () => {
      // Platforms that fetched a minute ago would verify against a key we no
      // longer publish, and see "invalid signature" rather than the real cause.
      const active = await signingKey(db);
      await expect(retireKey(db, active.kid)).rejects.toThrow(/signing/);
    });

    it('refuses to promote a retired key', async () => {
      const first = await signingKey(db);
      const second = await createKey(db);
      await promoteKey(db, second.kid);
      await retireKey(db, first.kid);

      await expect(promoteKey(db, first.kid)).rejects.toThrow(/retired/);
    });
  });

  describe('the keys themselves', () => {
    it('produces a signature the published key verifies', async () => {
      /*
       * End to end, because the parts being individually correct is not the
       * claim. What a platform does is take our JWT, find the `kid` in the
       * keyset, and verify — so that is what this does.
       */
      const active = await signingKey(db);
      const jwks = await publicJwks(db);
      const published = jwks.keys.find(key => key.kid === active.kid);
      expect(published).toBeDefined();

      const payload = Buffer.from('an LTI message', 'utf-8');
      const signature = createSign('RSA-SHA256').update(payload).sign(active.privatePem);

      const verifier = createVerify('RSA-SHA256').update(payload);
      const publicKey = createPublicKey({ key: published as never, format: 'jwk' });
      expect(verifier.verify(publicKey, signature)).toBe(true);
    });

    it('does not reuse a key id', async () => {
      await signingKey(db);
      await createKey(db);
      await createKey(db);

      const kids = (await publicJwks(db)).keys.map(key => key.kid);
      expect(new Set(kids).size).toBe(kids.length);
    });

    it('creates one on first use rather than serving an empty keyset', async () => {
      // A platform registering against `{"keys":[]}` reads it as a broken
      // integration rather than an un-provisioned one.
      expect((await publicJwks(db)).keys).toHaveLength(0);
      await signingKey(db);
      expect((await publicJwks(db)).keys).toHaveLength(1);
    });
  });
});
