/**
 * Whether a learner's practice may be recorded.
 *
 * Graft E1 stopped the product misrepresenting consent. It did not stop the
 * product collecting data from children nobody consented for, and that second
 * half is the one that protects anybody.
 *
 * The policy is **allow practice, block recording, make it visible.** A child
 * without consent still practises — the generator runs in their browser and
 * nothing leaves it — so the gate costs them nothing except a durable record
 * that nobody was entitled to keep.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { consentStatusFor, type ConsentStatus } from './consent';

type Db = MySql2Database<typeof schema>;

/**
 * The age below which a guardian's consent is required.
 *
 * 13 is COPPA's line. It is a constant rather than a literal so the one place
 * that decides it is greppable.
 */
export const CONSENT_REQUIRED_BELOW_AGE = 13;

export interface RecordingPermission {
  /** The answer: may this learner's attempts be written down. */
  mayRecord: boolean;
  /** Whether this learner is in scope for consent at all. */
  requiresConsent: boolean;
  /**
   * Narrowed to two values on purpose.
   *
   * The ledger distinguishes `granted`, `withdrawn`, `superseded` and `none`,
   * and a parent's surface needs all four. A practice session needs only
   * whether recording is permitted; *why* it is not is the guardian's business
   * and carrying it here would put a parent's withdrawal in front of whoever is
   * sitting at the device.
   */
  status: 'granted' | 'none';
}

/**
 * The youngest this learner could be, given only a birth year.
 *
 * `approximateAge` in `src/services/tiers.ts` returns `year - birthYear`, which
 * is the age *if their birthday has already passed*. That is fine for choosing
 * a tier, where being a year out changes which problems appear and nothing
 * else.
 *
 * A consent gate cannot round that way. A child born in 2013 reads as 13 from
 * the 1st of January, months before they turn 13, and the optimistic reading is
 * the one that starts recording a twelve-year-old's work. So the gate asks how
 * young they could be, not how old they probably are: a child turning 13 this
 * year stays covered until the year after.
 *
 * The cost of being wrong in this direction is a consent prompt a family did
 * not strictly need. The cost in the other direction is keeping records on a
 * child nobody consented for.
 */
export function youngestPossibleAge(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear - 1;
}

/** The decision, given the two facts it depends on. Pure, so it can be tabulated. */
export function permissionFrom(
  birthYear: number,
  status: ConsentStatus,
  now: Date = new Date(),
): RecordingPermission {
  const requiresConsent = youngestPossibleAge(birthYear, now) < CONSENT_REQUIRED_BELOW_AGE;

  if (!requiresConsent) {
    return { mayRecord: true, requiresConsent: false, status: 'granted' };
  }

  /*
   * Only `granted` permits recording, and `superseded` is the interesting
   * exclusion: it means consent was given, but to an older version of the
   * disclosure. Treating it as consent would make the policy version decorative
   * — the whole reason E1 records `policy_version` and a server-computed hash
   * is that consent is to a particular text, and a changed text is a question
   * that has not been asked yet.
   *
   * `withdrawn` and `none` are refusals for the obvious reasons.
   */
  const permitted = status === 'granted';
  return {
    mayRecord: permitted,
    requiresConsent: true,
    status: permitted ? 'granted' : 'none',
  };
}

/**
 * Thrown when a write is attempted for a learner nobody consented for.
 *
 * A class rather than a boolean return, so the refusal cannot be ignored by a
 * caller that forgets to check one. `StalePolicy` in `consent.ts` is the same
 * shape for the same reason.
 */
export class ConsentMissing extends Error {
  constructor(public readonly learnerId: number) {
    super(
      `No parental consent is recorded for learner ${learnerId}, so their practice ` +
        'cannot be stored.',
    );
    this.name = 'ConsentMissing';
  }
}

/** The decision for one learner, read from the ledger. */
export async function recordingPermission(
  db: Db,
  learnerId: number,
  now: Date = new Date(),
): Promise<RecordingPermission> {
  const [learner] = await db
    .select({ birthYear: schema.learners.birthYear })
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);

  /*
   * A learner who is not there cannot be recorded against. `learnerProcedure`
   * has already refused an unentitled caller by this point, so reaching here
   * with no row means the row went away mid-request — and the safe answer to
   * "may I write about someone I cannot find" is no.
   */
  if (!learner) {
    return { mayRecord: false, requiresConsent: true, status: 'none' };
  }

  return permissionFrom(learner.birthYear, await consentStatusFor(db, learnerId), now);
}

/**
 * Re-exported so a caller that has the permission does not also need the table.
 *
 * `recordAttempt` and `practice.submit` are the writers this gate exists to
 * stop; anything else that starts writing a child's activity should call this
 * first rather than inventing its own reading of the ledger.
 */
export { consentStatusFor };
