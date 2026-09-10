// @vitest-environment node
//
// jose checks `instanceof Uint8Array` on the signing key, and jsdom's
// `TextEncoder` produces one from a different realm — so the check fails with
// the memorable message "must be one of type ... Uint8Array. Received an
// instance of Uint8Array". Nothing about sessions needs a DOM. The server runs
// in real node, so this is a test-environment artifact rather than a defect.

/**
 * Sessions, against a real MySQL.
 *
 * As with the token tests, most of these assert refusal. A session cookie is
 * the thing standing between one family's records and everyone else's, and the
 * interesting cases are the forged, expired, stale and absent ones.
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import {
  clearedSessionCookie,
  issueSession,
  resolveUser,
  SESSION_COOKIE,
  sessionCookie,
} from './session';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';

describeWithDb('sessions', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let userId: number;

  const cookieHeader = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

  beforeAll(async () => {
    harness = await createTestDatabase('session');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = SECRET;
    delete process.env.DEV_AUTH_EMAIL;
    delete process.env.NODE_ENV;

    await db.insert(schema.users).values({ email: 'sarah@example.test', name: 'Sarah', role: 'parent' });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'sarah@example.test'));
    userId = user.id;
  });

  afterEach(() => {
    delete process.env.DEV_AUTH_EMAIL;
    delete process.env.NODE_ENV;
  });

  describe('a valid session', () => {
    it('resolves to the account it was issued for', async () => {
      const token = await issueSession(userId);
      const user = await resolveUser(db, cookieHeader(token));

      expect(user).toMatchObject({ id: userId, email: 'sarah@example.test', role: 'parent' });
    });

    it('carries the role the database holds, not one from the token', async () => {
      // Roles are read fresh. A token minted while somebody was a parent must
      // not keep working as a parent after they are made an administrator, and
      // more importantly must not be forgeable into one.
      const token = await issueSession(userId);
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));

      expect((await resolveUser(db, cookieHeader(token)))?.role).toBe('admin');
    });
  });

  describe('refusals', () => {
    it('treats no cookie as nobody', async () => {
      // Anonymous rather than an error: the landing page renders for visitors
      // who have not signed in.
      expect(await resolveUser(db, {})).toBeNull();
    });

    it('refuses a token signed with another key', async () => {
      const forged = await new SignJWT({ sub: String(userId) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('acuitymath')
        .setAudience('acuitymath-app')
        .setExpirationTime('30d')
        .sign(new TextEncoder().encode('a-different-secret-of-sufficient-length-here'));

      expect(await resolveUser(db, cookieHeader(forged))).toBeNull();
    });

    it('refuses a token that has expired', async () => {
      const expired = await new SignJWT({ sub: String(userId) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setIssuer('acuitymath')
        .setAudience('acuitymath-app')
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(new TextEncoder().encode(SECRET));

      expect(await resolveUser(db, cookieHeader(expired))).toBeNull();
    });

    it('refuses a token minted for another audience', async () => {
      const wrongAudience = await new SignJWT({ sub: String(userId) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('acuitymath')
        .setAudience('some-other-app')
        .setExpirationTime('30d')
        .sign(new TextEncoder().encode(SECRET));

      expect(await resolveUser(db, cookieHeader(wrongAudience))).toBeNull();
    });

    it('refuses a valid token for a deleted account', async () => {
      // This is what makes account deletion effective without a session table.
      const token = await issueSession(userId);
      await db.delete(schema.users).where(eq(schema.users.id, userId));

      expect(await resolveUser(db, cookieHeader(token))).toBeNull();
    });

    it('refuses gibberish without throwing', async () => {
      expect(await resolveUser(db, cookieHeader('not-a-jwt'))).toBeNull();
      expect(await resolveUser(db, { cookie: 'unrelated=value' })).toBeNull();
    });
  });

  describe('the cookie itself', () => {
    it('is not readable by script and not sent cross-site', async () => {
      const header = sessionCookie(await issueSession(userId));
      expect(header).toContain('HttpOnly');
      // Lax rather than Strict: the sign-in link arrives from a mail client, and
      // Strict would withhold the cookie on that first navigation.
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
    });

    it('is marked Secure only in production', async () => {
      const token = await issueSession(userId);
      expect(sessionCookie(token)).not.toContain('Secure');

      process.env.NODE_ENV = 'production';
      expect(sessionCookie(token)).toContain('Secure');
    });

    it('expires immediately when cleared', () => {
      expect(clearedSessionCookie()).toContain('Max-Age=0');
      expect(clearedSessionCookie()).toContain('HttpOnly');
    });
  });

  describe('the development bypass', () => {
    it('resolves a user when set outside production', async () => {
      process.env.DEV_AUTH_EMAIL = 'dev@example.test';
      const user = await resolveUser(db, {});
      expect(user?.email).toBe('dev@example.test');
    });

    it('throws rather than degrading in a production build', async () => {
      // A bypass that silently stops working is a bypass that ships. This one
      // takes the server down instead.
      process.env.DEV_AUTH_EMAIL = 'dev@example.test';
      process.env.NODE_ENV = 'production';

      await expect(resolveUser(db, {})).rejects.toThrow(/production build/i);
    });
  });

  describe('the signing key', () => {
    it('refuses to sign with a missing or short secret', async () => {
      // A server that invents a key at startup signs tokens no other instance
      // can verify, so every deploy signs everybody out and a load-balanced
      // pair rejects each other's sessions.
      delete process.env.JWT_SECRET;
      await expect(issueSession(userId)).rejects.toThrow(/JWT_SECRET/);

      process.env.JWT_SECRET = 'too-short';
      await expect(issueSession(userId)).rejects.toThrow(/32 characters/);

      process.env.JWT_SECRET = SECRET;
    });
  });
});
