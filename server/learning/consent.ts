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
export type ConsentStatus = 'granted' | 'withdrawn' | 'superseded' | 'none';

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
function statusOf(row: typeof schema.consentEvents.$inferSelect | undefined): ConsentStatus {
  if (!row) return 'none';
  if (row.decision === 'withdrawn') return 'withdrawn';
  return row.policyVersion === CONSENT_POLICY_VERSION ? 'granted' : 'superseded';
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
        status: statusOf(latest),
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
