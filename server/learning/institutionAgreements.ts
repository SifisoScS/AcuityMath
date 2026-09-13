/**
 * A district agreeing, on behalf of children who have no parent account here.
 *
 * The whole point of this module is that **agreeing is an event with evidence**,
 * not a flag. Before it, `institutional_agreement` was a value in an enum that
 * anybody could write: no document, no signatory, no date, nothing to point at.
 * A consent row could say a district had agreed and mean nothing by it.
 *
 * So an agreement records who signed, what they signed, when, and the hash of
 * the text as the server held it. It can expire and it can be withdrawn, and
 * those are different facts. And because it can end, **consent resting on it has
 * to be re-checked at read time rather than trusted once** — which is the part
 * that actually protects a child, and the part a cached answer would quietly
 * remove.
 */

import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import {
  INSTITUTIONAL_AGREEMENT_TEXT,
  INSTITUTIONAL_AGREEMENT_VERSION,
} from '../../src/data/institutionalAgreement';

type Db = MySql2Database<typeof schema>;

/**
 * The hash of the agreement this server holds.
 *
 * Computed from the server's own copy, every time, and never accepted from a
 * caller. A client that supplies the hash can claim agreement to text that was
 * never displayed, which would make the column worse than useless: it would look
 * like evidence. Same rule as `currentPolicyHash`, for the same reason.
 */
export function currentAgreementHash(): string {
  return createHash('sha256').update(INSTITUTIONAL_AGREEMENT_TEXT, 'utf8').digest('hex');
}

/**
 * Floors a moment to the second before it is stored.
 *
 * **MySQL rounds a sub-second value into a `TIMESTAMP` column rather than
 * truncating it.** Signing at 12:00:00.800 stores 12:00:01, which is in the
 * future — so `isInForce` refused the agreement for the next two hundred
 * milliseconds, and a district that signed and immediately tried to consent was
 * told it had no agreement. It surfaced as a test failing right after a write,
 * which is the shape this class of bug always has.
 *
 * Flooring instead makes the stored moment at most a second early, never late.
 * That is the safe direction for `signedAt` — the signing itself is the
 * authority — and also for `withdrawnAt`, where erring early means recording
 * stops a moment sooner rather than a moment later.
 */
function toWholeSecond(moment: Date): Date {
  return new Date(Math.floor(moment.getTime() / 1000) * 1000);
}

export class StaleAgreement extends Error {
  constructor(expected: string) {
    super(`The agreement has changed; it must be signed at version ${expected}.`);
    this.name = 'StaleAgreement';
  }
}

/** Raised when the person signing is not somebody who may. */
export class NotAuthorised extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAuthorised';
  }
}

export interface SignAgreementInput {
  institutionId: number;
  /** The administrator agreeing. Checked, not trusted. */
  signedByUserId: number;
  signatoryName: string;
  signatoryTitle: string;
  agreementVersion: string;
  /** A term the parties set. Omit when it runs until somebody ends it. */
  expiresAt?: Date | null;
}

export interface Agreement {
  id: number;
  institutionId: number;
  signedByUserId: number;
  signatoryName: string;
  signatoryTitle: string;
  signatoryEmail: string;
  agreementVersion: string;
  agreementSha256: string;
  signedAt: Date;
  expiresAt: Date | null;
  withdrawnAt: Date | null;
}

/**
 * Records a district's agreement.
 *
 * The version is required from the caller and checked rather than filled in,
 * which is the same shape `recordConsent` uses. A caller that sent the version
 * it was *showing* and finds it stale has shown somebody the wrong text, and
 * that must fail loudly — silently upgrading it would record agreement to a
 * document the signatory never read.
 */
export async function signAgreement(
  db: Db,
  input: SignAgreementInput,
  now: Date = new Date(),
): Promise<Agreement> {
  if (input.agreementVersion !== INSTITUTIONAL_AGREEMENT_VERSION) {
    throw new StaleAgreement(INSTITUTIONAL_AGREEMENT_VERSION);
  }

  const signatoryName = input.signatoryName.trim();
  const signatoryTitle = input.signatoryTitle.trim();
  if (!signatoryName) throw new Error('An agreement needs the name of whoever signed it.');
  if (!signatoryTitle) {
    /*
     * Required, and not politeness. "Who were they to agree on behalf of a
     * school?" is the first question anybody reviewing this record will ask, and
     * a blank answer is the one that cannot be given later.
     */
    throw new Error('An agreement needs the signatory’s role at the institution.');
  }

  const [signer] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      institutionId: schema.users.institutionId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, input.signedByUserId))
    .limit(1);

  if (!signer) throw new Error(`No such user ${input.signedByUserId}.`);

  /*
   * Only this district's own administrator, and a platform administrator is
   * **not** waved through.
   *
   * Elsewhere `admin` is the global bypass, and that is right for reading: a
   * platform administrator supporting a district needs to see what is wrong.
   * Signing is a different act. Whoever signs is asserting authority to consent
   * on behalf of other people's children, and nobody at this company has that
   * authority — a row saying we agreed on a school's behalf would be a false
   * record of who decided.
   */
  if (signer.role !== 'institution_admin' || signer.institutionId !== input.institutionId) {
    throw new NotAuthorised(
      'Only an administrator of this institution can agree on its behalf.',
    );
  }

  const [created] = await db
    .insert(schema.institutionAgreements)
    .values({
      institutionId: input.institutionId,
      signedByUserId: signer.id,
      signatoryName,
      signatoryTitle,
      signatoryEmail: signer.email,
      agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
      agreementSha256: currentAgreementHash(),
      signedAt: toWholeSecond(now),
      expiresAt: input.expiresAt ?? null,
    })
    .$returningId();

  const [row] = await db
    .select()
    .from(schema.institutionAgreements)
    .where(eq(schema.institutionAgreements.id, created.id))
    .limit(1);

  return row;
}

/**
 * Whether an agreement is in force at a moment.
 *
 * Takes the moment rather than reading the clock, so the same rule can be
 * applied to "is this child allowed to practise right now" and to "was this
 * child allowed to practise when that row was written".
 */
export function isInForce(agreement: Agreement, now: Date = new Date()): boolean {
  /*
   * This line looks redundant from `activeAgreement`, which already filters
   * withdrawn rows in SQL — and mutating it against that path comes back green.
   * It is load-bearing on the other path: `statusOf` loads an agreement **by
   * id**, because it needs the one a consent row actually names rather than
   * whichever is current, and that query has no filter to hide behind.
   *
   * Recorded because it is the fourth time in this track that a guard has read
   * as dead against one caller and live against another. Which layer does the
   * work is not visible from the line.
   */
  if (agreement.withdrawnAt && agreement.withdrawnAt.getTime() <= now.getTime()) return false;
  if (agreement.expiresAt && agreement.expiresAt.getTime() <= now.getTime()) return false;
  return agreement.signedAt.getTime() <= now.getTime();
}

/** The agreement a district is currently operating under, if any. */
export async function activeAgreement(
  db: Db,
  institutionId: number,
  now: Date = new Date(),
): Promise<Agreement | null> {
  const rows = await db
    .select()
    .from(schema.institutionAgreements)
    .where(
      and(
        eq(schema.institutionAgreements.institutionId, institutionId),
        isNull(schema.institutionAgreements.withdrawnAt),
      ),
    )
    .orderBy(desc(schema.institutionAgreements.signedAt), desc(schema.institutionAgreements.id));

  return rows.find(row => isInForce(row, now)) ?? null;
}

/**
 * Ends an agreement.
 *
 * Nothing is deleted and no consent row is touched. The rows stay because they
 * are a record of what was true, and rewriting history to say a district never
 * agreed would destroy the only evidence that recording was once permitted.
 * What changes is what the gate answers from now on — which is why the gate
 * re-reads the agreement rather than trusting the consent row alone.
 */
export async function withdrawAgreement(
  db: Db,
  agreementId: number,
  now: Date = new Date(),
): Promise<void> {
  const [agreement] = await db
    .select()
    .from(schema.institutionAgreements)
    .where(eq(schema.institutionAgreements.id, agreementId))
    .limit(1);

  if (!agreement) throw new Error(`No such agreement ${agreementId}.`);
  if (agreement.withdrawnAt) return;

  await db
    .update(schema.institutionAgreements)
    .set({ withdrawnAt: toWholeSecond(now) })
    .where(eq(schema.institutionAgreements.id, agreementId));
}

/** Every agreement a district has ever signed, newest first. For its own records. */
export async function agreementHistory(
  db: Db,
  institutionId: number,
): Promise<Agreement[]> {
  return db
    .select()
    .from(schema.institutionAgreements)
    .where(eq(schema.institutionAgreements.institutionId, institutionId))
    .orderBy(desc(schema.institutionAgreements.signedAt), desc(schema.institutionAgreements.id));
}
