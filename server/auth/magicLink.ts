/**
 * Sign-in by emailed link.
 *
 * A magic link is a bearer credential: whoever holds it is the account. That
 * shapes every decision here.
 *
 * - The token is 32 bytes from a cryptographic source, not a guessable id.
 * - Only its SHA-256 is stored. A stolen database yields no working links.
 * - It expires in fifteen minutes and is single-use, because a link sitting in
 *   a mailbox, a shared family inbox, or a mail provider's link-scanner is a
 *   live credential until one of those two things stops it.
 * - Requesting a link never reveals whether the address has an account. The
 *   response is identical either way; otherwise the endpoint is a directory of
 *   which parents use the service.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

/** Long enough that guessing is hopeless, short enough to survive a mail client. */
const TOKEN_BYTES = 32;

/**
 * Fifteen minutes.
 *
 * Long enough for an email to arrive and a parent to notice it; short enough
 * that a forwarded or archived message stops being a way in.
 */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/**
 * How many links one address may request in the window below.
 *
 * Without this, the endpoint is a way to send somebody a hundred emails, and a
 * way to fill the table. Five is more than a confused parent needs and far
 * fewer than an abuser wants.
 */
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export interface IssuedLink {
  /** The raw token. Held only long enough to put in an email; never stored. */
  token: string;
  expiresAt: Date;
}

export class RateLimited extends Error {
  constructor() {
    super('Too many sign-in links requested for this address. Try again shortly.');
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Lower-cased and trimmed, so `Sarah@Example.com ` and the address match. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Issues a link for an address.
 *
 * Does not check whether an account exists. The account is created when the
 * link is consumed, which is what keeps this endpoint from answering "is this
 * person a customer?" — and means a new parent and a returning one take exactly
 * the same path.
 *
 * @throws RateLimited when the address has asked too often.
 */
export async function issueMagicLink(
  db: Database,
  rawEmail: string,
  requestedFromIp?: string,
): Promise<IssuedLink> {
  const email = normaliseEmail(rawEmail);
  const since = new Date(Date.now() - RATE_WINDOW_MS);

  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)` })
    .from(schema.magicLinkTokens)
    .where(and(eq(schema.magicLinkTokens.email, email), gt(schema.magicLinkTokens.createdAt, since)));

  if (Number(recent) >= MAX_REQUESTS_PER_WINDOW) throw new RateLimited();

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);

  await db.insert(schema.magicLinkTokens).values({
    email,
    tokenHash: hashToken(token),
    expiresAt,
    requestedFromIp: requestedFromIp ?? null,
  });

  return { token, expiresAt };
}

export type ConsumeFailure = 'unknown' | 'expired' | 'already-used';

export type ConsumeResult =
  | { ok: true; userId: number; email: string }
  | { ok: false; reason: ConsumeFailure };

/**
 * Consumes a link and returns the account it signs in.
 *
 * Creates the account on first use. A parent who has never visited before
 * follows the same link they were sent and arrives signed in, with no separate
 * registration step to abandon halfway.
 *
 * The consuming update is conditional on the token still being unconsumed, and
 * the row count decides the outcome. Reading the row and then updating it would
 * let two simultaneous requests — a mail scanner and the parent, a fraction of a
 * second apart — both pass the read and both sign in.
 */
export async function consumeMagicLink(db: Database, token: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);

  const [row] = await db
    .select()
    .from(schema.magicLinkTokens)
    .where(eq(schema.magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: 'unknown' };
  if (row.consumedAt) return { ok: false, reason: 'already-used' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const result = await db
    .update(schema.magicLinkTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.magicLinkTokens.id, row.id), isNull(schema.magicLinkTokens.consumedAt)));

  // Zero rows means another request consumed it between the read above and
  // this write. That request is the one that signs in; this one did not.
  const affected = (result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
  if (affected === 0) return { ok: false, reason: 'already-used' };

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, row.email))
    .limit(1);

  if (existing) {
    await db
      .update(schema.users)
      .set({ lastSignedInAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    return { ok: true, userId: existing.id, email: existing.email };
  }

  await db.insert(schema.users).values({
    email: row.email,
    role: 'parent',
    lastSignedInAt: new Date(),
  });
  const [created] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, row.email))
    .limit(1);

  return { ok: true, userId: created.id, email: created.email };
}

/**
 * Invalidates every outstanding link for an address.
 *
 * Called on a successful sign-in: the parent is in, so the three earlier links
 * they clicked past are no longer credentials anybody needs.
 */
export async function revokeOutstandingLinks(db: Database, email: string): Promise<void> {
  await db
    .update(schema.magicLinkTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.magicLinkTokens.email, normaliseEmail(email)),
        isNull(schema.magicLinkTokens.consumedAt),
      ),
    );
}

/** The most recent link for an address. Test support only. */
export async function mostRecentTokenHash(db: Database, email: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.magicLinkTokens)
    .where(eq(schema.magicLinkTokens.email, normaliseEmail(email)))
    .orderBy(desc(schema.magicLinkTokens.createdAt))
    .limit(1);
  return row?.tokenHash ?? null;
}

/**
 * Constant-time comparison, exported for the session layer.
 *
 * Not used by the lookups above — those compare a hash inside the database,
 * where the query planner's timing is not the attacker's oracle — but anything
 * comparing secrets in process should use it.
 */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
