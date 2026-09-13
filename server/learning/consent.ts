/**
 * Parental consent, as a ledger.
 *
 * `consent_events` had a table from B1 and **no writer**. Consent was recorded
 * by `POST /api/auth/coppa-consent` into `data_store.json` — a gitignored file
 * nothing migrated reads — against a hardcoded `'parent_sarah_1'` that
 * `CoppaConsentModal` passed in.
 *
 * Every other defect on that surface was a security defect. This one was a
 * *representation* defect: the application told a parent their consent was
 * recorded, and it was not.
 *
 * ## What the product can evidence
 *
 * One thing: the guardian controls the email address they signed in with,
 * because a magic link sent there was consumed. A typed name is an attestation —
 * it proves nothing about who typed it. No confirming second step is sent, and
 * no card is charged.
 *
 * So `email_verified_name_attested` is the only method written, and it is named
 * for exactly that. Whether it is legally *sufficient* is not a question this
 * module answers; what it guarantees is that the record describes what happened.
 */

import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { createHash } from 'crypto';

import * as schema from '../../drizzle/schema';
import {
  CONSENT_POLICY_TEXT,
  CONSENT_POLICY_VERSION,
} from '../../src/data/consentPolicy';
import type { Database } from '../db/client';
import { type Agreement, activeAgreement, isInForce } from './institutionAgreements';

/**
 * The hash of the disclosure this server holds.
 *
 * Computed from the server's own copy, every time, and never accepted from a
 * caller. A client that supplies the hash can claim consent to text that was
 * never displayed, which would make the column worse than useless: it would look
 * like evidence.
 */
export function currentPolicyHash(): string {
  return createHash('sha256').update(CONSENT_POLICY_TEXT, 'utf8').digest('hex');
}

/**
 * The state of one child's consent.
 *
 * One value rather than a decision plus an `isCurrent` flag, because those two
 * can be combined wrongly by a caller and only one combination is meaningful.
 */
export type ConsentStatus = 'granted' | 'withdrawn' | 'superseded' | 'lapsed' | 'none';

export interface ConsentState {
  learnerId: number;
  status: ConsentStatus;
  recordedAt: Date | null;
  policyVersion: string | null;
  attestedName: string | null;
  verifiedEmail: string | null;
  emailVerifiedAt: Date | null;
  secondStepSent: boolean;
}

/**
 * The precedence, stated once so no caller has to invent it.
 *
 *   - The latest row wins. The ledger is append-only; current state is its last
 *     entry, which is why there is no `consented` boolean anywhere.
 *   - A withdrawal outranks policy freshness. Consent withdrawn under the
 *     current policy is `withdrawn`, not "current but withdrawn" — once consent
 *     is gone, how fresh the disclosure was stops mattering.
 *   - `superseded` therefore applies only to a *granted* row whose version is no
 *     longer the current one.
 *   - `none` covers a child with no rows at all, which includes any child added
 *     to the account after consent was given.
 */
function statusOf(
  row: typeof schema.consentEvents.$inferSelect | undefined,
  agreement: Agreement | null = null,
  now: Date = new Date(),
): ConsentStatus {
  if (!row) return 'none';
  if (row.decision === 'withdrawn') return 'withdrawn';

  /*
   * **Institutional consent is re-checked, not trusted once.**
   *
   * A district's agreement can expire or be withdrawn, and when it does, every
   * child resting on it must stop being recorded — that is the sentence in the
   * agreement itself. If this read the consent row alone, ending an agreement
   * would change nothing and the clause would be decorative.
   *
   * `lapsed` rather than `withdrawn`: nobody withdrew consent for this
   * particular child, and a district looking at the answer needs to know the
   * difference between "the school pulled out" and "a parent said no".
   */
  if (row.agreementId !== null) {
    if (!agreement || !isInForce(agreement, now)) return 'lapsed';
  }

  return row.policyVersion === CONSENT_POLICY_VERSION ? 'granted' : 'superseded';
}

/** Loads the agreement a consent row rests on, when it rests on one. */
async function agreementFor(
  db: Database,
  row: typeof schema.consentEvents.$inferSelect | undefined,
): Promise<Agreement | null> {
  if (!row?.agreementId) return null;
  const [agreement] = await db
    .select()
    .from(schema.institutionAgreements)
    .where(eq(schema.institutionAgreements.id, row.agreementId))
    .limit(1);
  return agreement ?? null;
}

/**
 * Where one learner's consent stands.
 *
 * Same precedence as `consentForFamily`, because it is literally the same
 * `statusOf` — the rule is stated once above and read from here rather than
 * reimplemented. A gate that decided `superseded` counted as consent while this
 * file said otherwise would be two answers to one question, which is the defect
 * this whole graft has been removing.
 *
 * Entitlement is the caller's job. This takes a learner id and answers about
 * it; `learnerProcedure` is what establishes the asker may.
 */
export async function consentStatusFor(db: Database, learnerId: number): Promise<ConsentStatus> {
  const [latest] = await db
    .select()
    .from(schema.consentEvents)
    .where(eq(schema.consentEvents.learnerId, learnerId))
    .orderBy(desc(schema.consentEvents.recordedAt), desc(schema.consentEvents.id))
    .limit(1);

  return statusOf(latest, await agreementFor(db, latest));
}

/** Every child on the account, with where their consent stands. */
export async function consentForFamily(
  db: Database,
  guardianId: number,
): Promise<Record<string, ConsentState>> {
  const learners = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(and(eq(schema.learners.guardianId, guardianId), isNotNull(schema.learners.id)));

  const states = await Promise.all(
    learners.map(async ({ id }) => {
      const [latest] = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.learnerId, id))
        .orderBy(desc(schema.consentEvents.recordedAt), desc(schema.consentEvents.id))
        .limit(1);

      const state: ConsentState = {
        learnerId: id,
        status: statusOf(latest, await agreementFor(db, latest)),
        recordedAt: latest?.recordedAt ?? null,
        policyVersion: latest?.policyVersion ?? null,
        attestedName: latest?.attestedName ?? null,
        verifiedEmail: latest?.verifiedEmail ?? null,
        emailVerifiedAt: latest?.emailVerifiedAt ?? null,
        secondStepSent: latest?.secondStepSent ?? false,
      };
      return [String(id), state] as const;
    }),
  );

  return Object.fromEntries(states);
}

/**
 * When this guardian last proved control of their email address.
 *
 * The most recently consumed magic link. Null means none on record, which is
 * true for the development sign-in bypass — production builds refuse that, so a
 * null here in production means something worth noticing rather than something
 * to shrug at.
 *
 * Stored on the row rather than left implicit because the link proves control at
 * time T and consent is recorded at T+X; a gap of weeks is ordinary, and a
 * record that cannot show it implies the two were simultaneous.
 */
async function emailVerifiedAtFor(db: Database, guardianId: number): Promise<Date | null> {
  const [user] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, guardianId))
    .limit(1);
  if (!user) return null;

  const [link] = await db
    .select({ consumedAt: schema.magicLinkTokens.consumedAt })
    .from(schema.magicLinkTokens)
    .where(
      and(
        eq(schema.magicLinkTokens.email, user.email),
        // Belt and braces rather than the thing doing the work: MySQL sorts
        // NULLs last under `DESC`, so an unconsumed link loses to a consumed one
        // on ordering alone. Mutating this filter away changes no behaviour,
        // which is worth knowing — the ordering below is what to be careful
        // with.
        isNotNull(schema.magicLinkTokens.consumedAt),
      ),
    )
    .orderBy(desc(schema.magicLinkTokens.consumedAt))
    .limit(1);

  return link?.consumedAt ?? null;
}

export class StalePolicy extends Error {
  constructor(readonly current: string) {
    super(`That consent form is out of date. The current policy is ${current}.`);
    this.name = 'StalePolicy';
  }
}

export interface RecordConsentInput {
  guardianId: number;
  decision: 'granted' | 'withdrawn';
  attestedName: string;
  /** The version the parent was shown. Refused if it is no longer current. */
  policyVersion: string;
}

/**
 * Records one decision, for every child on the account.
 *
 * One row per child, in a single transaction. The modal grants once for the
 * household and the schema requires a learner, so the alternative would be
 * per-account rows — which could never be split later without inventing which
 * child was meant.
 *
 * A stale `policyVersion` is refused rather than recorded. If the parent's tab
 * has been open across a deploy they agreed to something no longer on screen,
 * and the honest response is to show them the current text and ask again.
 */
export async function recordConsent(
  db: Database,
  input: RecordConsentInput,
): Promise<{ learnerIds: number[]; policyVersion: string }> {
  if (input.policyVersion !== CONSENT_POLICY_VERSION) {
    throw new StalePolicy(CONSENT_POLICY_VERSION);
  }

  const [guardian] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, input.guardianId))
    .limit(1);
  if (!guardian) throw new Error(`No such guardian ${input.guardianId}`);

  const children = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(eq(schema.learners.guardianId, input.guardianId));

  if (children.length === 0) {
    // Nothing to consent about. Writing no rows and saying so beats writing a
    // row against nobody.
    return { learnerIds: [], policyVersion: CONSENT_POLICY_VERSION };
  }

  const emailVerifiedAt = await emailVerifiedAtFor(db, input.guardianId);
  const policySha256 = currentPolicyHash();

  await db.transaction(async tx => {
    await tx.insert(schema.consentEvents).values(
      children.map(child => ({
        learnerId: child.id,
        grantedByUserId: input.guardianId,
        decision: input.decision,
        method: 'email_verified_name_attested' as const,
        policyVersion: CONSENT_POLICY_VERSION,
        policySha256,
        attestedName: input.attestedName,
        // Snapshotted, not joined: `users.email` can change and what this row
        // says must not.
        verifiedEmail: guardian.email,
        emailVerifiedAt,
        // Always false, and recorded rather than inferred. It is the single fact
        // separating this from COPPA "email plus".
        secondStepSent: false,
      })),
    );
  });

  return { learnerIds: children.map(c => c.id), policyVersion: CONSENT_POLICY_VERSION };
}

/**
 * Raised when a district tries to consent with no agreement behind it.
 *
 * The refusal C3e exists for. Without it, `institutional_agreement` is a string
 * a caller writes, and the children it covers are covered by nothing.
 */
export class NoAgreement extends Error {
  constructor(institutionId: number) {
    super(
      `Institution ${institutionId} has no agreement in force, so consent cannot be ` +
        'recorded on its behalf.',
    );
    this.name = 'NoAgreement';
  }
}

export interface InstitutionalConsentInput {
  institutionId: number;
  decision: 'granted' | 'withdrawn';
  policyVersion: string;
  /**
   * Which children. Omit for every pupil the district owns.
   *
   * Named explicitly by the LTI path, which consents for one pupil as they
   * arrive rather than for a roll it has not seen.
   */
  learnerIds?: number[];
}

/**
 * Records consent for a district's own pupils, resting on its agreement.
 *
 * This is deliberately **not** `recordConsent` with a different method. That
 * function sweeps every learner of a guardian, which is right for a family and
 * was the reason C3d gave district pupils their own owner — reusing it here
 * would have rebuilt the footgun one level up.
 *
 * Only children the district actually owns are touched. A pupil whose guardian
 * is a parent is somebody else's to consent for, however plainly they sit in
 * the district's classrooms, and a district naming one is refused rather than
 * quietly skipped: silently doing less than you were asked is how somebody ends
 * up believing a child is covered.
 */
export async function recordInstitutionalConsent(
  db: Database,
  input: InstitutionalConsentInput,
  now: Date = new Date(),
): Promise<{ learnerIds: number[]; agreementId: number }> {
  if (input.policyVersion !== CONSENT_POLICY_VERSION) {
    throw new StalePolicy(CONSENT_POLICY_VERSION);
  }

  const agreement = await activeAgreement(db, input.institutionId, now);
  if (!agreement) throw new NoAgreement(input.institutionId);

  const owned = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(eq(schema.learners.institutionId, input.institutionId));

  const ownedIds = new Set(owned.map(row => row.id));

  let learnerIds: number[];
  if (input.learnerIds) {
    const strangers = input.learnerIds.filter(id => !ownedIds.has(id));
    if (strangers.length > 0) {
      throw new Error(
        `Institution ${input.institutionId} does not own learners ${strangers.join(', ')}, ` +
          'so it cannot consent for them.',
      );
    }
    learnerIds = input.learnerIds;
  } else {
    learnerIds = [...ownedIds];
  }

  if (learnerIds.length === 0) {
    return { learnerIds: [], agreementId: agreement.id };
  }

  const policySha256 = currentPolicyHash();

  await db.transaction(async tx => {
    await tx.insert(schema.consentEvents).values(
      learnerIds.map(learnerId => ({
        learnerId,
        /*
         * The administrator who signed, taken from the agreement rather than
         * from the caller. A caller-supplied granter could name somebody who
         * never agreed to anything, which is the misdescription this ledger
         * exists to prevent.
         */
        grantedByUserId: agreement.signedByUserId,
        decision: input.decision,
        method: 'institutional_agreement' as const,
        policyVersion: CONSENT_POLICY_VERSION,
        policySha256,
        /*
         * Snapshotted from the agreement, not re-attested per child. Whoever
         * signed for the district signed once; writing their name against each
         * pupil is recording what was agreed, not pretending to a fresh act.
         */
        attestedName: agreement.signatoryName,
        verifiedEmail: agreement.signatoryEmail,
        /*
         * Null, and truthfully so. Family consent records when a magic link
         * proved control of an address; an institutional agreement rests on the
         * district's authority instead, and inventing a verification here would
         * make the two look like the same evidence.
         */
        emailVerifiedAt: null,
        secondStepSent: false,
        agreementId: agreement.id,
        recordedAt: now,
      })),
    );
  });

  return { learnerIds, agreementId: agreement.id };
}
