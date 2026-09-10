/**
 * The step-up PIN.
 *
 * ## What it is for
 *
 * Not signing in — that is the magic link. This is the second step between a
 * signed-in guardian and the surfaces a child must not reach: their sibling's
 * analytics, the screen-time controls that restrict them, and the export of
 * every learner's scores.
 *
 * A family tablet stays signed in. That is the point of a thirty-day session,
 * and it is exactly why reaching those surfaces has to ask again.
 *
 * ## Why a weak secret is acceptable here, and what makes it so
 *
 * Four digits is ten thousand possibilities. No key derivation makes that
 * strong, and pretending otherwise would be the mistake. What makes it
 * defensible is the threat model and the lockout: the attacker is a nine-year-old
 * trying birthdays on the sofa, not someone holding the database. Five wrong
 * answers and the PIN stops working for fifteen minutes, which reduces ten
 * thousand guesses to roughly a month of uninterrupted effort.
 *
 * scrypt is still used, because the *other* threat — a stolen database — is the
 * one where a fast hash turns ten thousand possibilities into an instant answer
 * for every parent at once.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

/**
 * Wrapped by hand rather than with `promisify`, which resolves to scrypt's
 * three-argument overload and drops the options — and the options are where the
 * cost parameters live, so the promisified version silently derives with
 * defaults.
 */
function scrypt(secret: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(secret, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Recorded in the stored value rather than hard-coded here, so raising them
 * later does not invalidate every existing PIN — an old hash still verifies
 * with the parameters it was made with.
 */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** Five wrong answers, then fifteen minutes of nothing. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export class WeakPin extends Error {}

/**
 * Rejects the PINs a child guesses first.
 *
 * Not a serious filter — with ten thousand candidates no denylist is — but
 * `0000`, `1234` and four of the same digit are what a determined sibling tries
 * in the first minute, and they cost nothing to refuse.
 */
export function assertUsablePin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) throw new WeakPin('Choose a four-digit PIN.');
  if (/^(\d)\1{3}$/.test(pin)) throw new WeakPin('Choose a PIN that is not the same digit four times.');
  if (['1234', '4321', '0123', '9876'].includes(pin)) {
    throw new WeakPin('Choose a PIN that is not a simple sequence.');
  }
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(pin, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies against a stored hash, in constant time.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupted
 * row should refuse the PIN, not crash the request that presented it.
 */
export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scrypt(pin, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Against a user
// ---------------------------------------------------------------------------

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'not-set' | 'wrong'; attemptsRemaining: number }
  | { ok: false; reason: 'locked'; retryAfterMs: number };

export async function setStepUpPin(db: Database, userId: number, pin: string): Promise<void> {
  assertUsablePin(pin);
  await db
    .update(schema.users)
    .set({
      stepUpPinHash: await hashPin(pin),
      stepUpPinSetAt: new Date(),
      // Setting a new PIN clears any lockout. A parent who forgot theirs and is
      // locked out must not also be locked out of fixing it.
      stepUpFailedAttempts: 0,
      stepUpLockedUntil: null,
    })
    .where(eq(schema.users.id, userId));
}

export async function hasStepUpPin(db: Database, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ hash: schema.users.stepUpPinHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return Boolean(row?.hash);
}

/**
 * Checks a PIN and records the attempt.
 *
 * The counter is incremented on failure and cleared on success, so five wrong
 * answers in a row lock the PIN while five spread across a week do not.
 *
 * A locked account is told how long to wait rather than simply refused. "Wrong
 * PIN" repeated at somebody who is locked out sends them to reset a PIN that
 * was right.
 */
export async function checkStepUpPin(db: Database, userId: number, pin: string): Promise<PinCheck> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!row?.stepUpPinHash) return { ok: false, reason: 'not-set', attemptsRemaining: MAX_ATTEMPTS };

  const lockedUntil = row.stepUpLockedUntil?.getTime() ?? 0;
  if (lockedUntil > Date.now()) {
    return { ok: false, reason: 'locked', retryAfterMs: lockedUntil - Date.now() };
  }

  if (await verifyPinHash(pin, row.stepUpPinHash)) {
    // Only write when there is something to clear; the common case is a parent
    // who got it right first time and needs no update at all.
    if (row.stepUpFailedAttempts > 0 || row.stepUpLockedUntil) {
      await db
        .update(schema.users)
        .set({ stepUpFailedAttempts: 0, stepUpLockedUntil: null })
        .where(eq(schema.users.id, userId));
    }
    return { ok: true };
  }

  const attempts = row.stepUpFailedAttempts + 1;
  const reachedLimit = attempts >= MAX_ATTEMPTS;

  await db
    .update(schema.users)
    .set({
      stepUpFailedAttempts: reachedLimit ? 0 : attempts,
      stepUpLockedUntil: reachedLimit ? new Date(Date.now() + LOCKOUT_MS) : row.stepUpLockedUntil,
    })
    .where(eq(schema.users.id, userId));

  if (reachedLimit) return { ok: false, reason: 'locked', retryAfterMs: LOCKOUT_MS };
  return { ok: false, reason: 'wrong', attemptsRemaining: MAX_ATTEMPTS - attempts };
}

// ---------------------------------------------------------------------------
// Child access tokens
// ---------------------------------------------------------------------------

/**
 * How a child chooses themselves, once a guardian is already signed in.
 *
 * These are **not credentials**. None of them can start a session; they select
 * a learner within one that already exists. That is the whole design: a
 * three-year-old holds nothing that could sign anybody in, and a printed QR
 * badge left at school is a way to pick Maya on Maya's family's tablet and
 * nothing at all anywhere else.
 *
 * Hashed for the same reason as the PIN — a badge is printed, photographed and
 * lost, and the stored form should not be the thing on the paper.
 */
export type AccessTokenKind = 'pin' | 'qr_badge' | 'picture_sequence';

export async function setLearnerAccessToken(
  db: Database,
  learnerId: number,
  kind: AccessTokenKind,
  secret: string,
): Promise<void> {
  const secretHash = await hashPin(secret);

  await db
    .insert(schema.learnerAccessTokens)
    .values({ learnerId, kind, secretHash })
    .onDuplicateKeyUpdate({
      set: { secretHash: sql`values(secret_hash)`, revokedAt: sql`null` },
    });
}

/**
 * Resolves which of a guardian's learners a secret belongs to.
 *
 * Scoped to the learners passed in, which the caller has already proven belong
 * to the signed-in guardian. A secret is therefore only ever compared against
 * this family's children — a badge cannot select somebody else's child even if
 * two families happen to choose the same picture sequence.
 */
export async function resolveLearnerBySecret(
  db: Database,
  learnerIds: number[],
  kind: AccessTokenKind,
  secret: string,
): Promise<number | null> {
  if (learnerIds.length === 0) return null;

  const rows = await db
    .select()
    .from(schema.learnerAccessTokens)
    .where(eq(schema.learnerAccessTokens.kind, kind));

  for (const row of rows) {
    if (!learnerIds.includes(row.learnerId)) continue;
    if (row.revokedAt) continue;
    if (await verifyPinHash(secret, row.secretHash)) return row.learnerId;
  }
  return null;
}
