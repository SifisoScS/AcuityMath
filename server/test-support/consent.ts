/**
 * Consent for a test family, so a fixture can record a child's practice.
 *
 * Graft E1b refuses to write an attempt for an under-13 nobody consented for,
 * which means every suite that gives a learner a history now has to say who
 * agreed to it. That is the invariant working, not a tax: a fixture that
 * records a child's answers without consent is modelling an account the product
 * refuses to create.
 *
 * It goes through `recordConsent` rather than inserting a row, so fixtures get
 * the same server-computed policy hash and version check a parent does. A test
 * that hand-wrote the row could keep passing after the policy changed shape,
 * which is the kind of green that means nothing.
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import { recordConsent } from '../learning/consent';

/**
 * Grants consent for every child of `guardianId`, under the current policy.
 *
 * Call it **after** the learners exist: the procedure writes one row per child
 * of the guardian, so a child added afterwards reads `none` — which is the real
 * behaviour and is worth remembering when a fixture adds a sibling late.
 */
export async function grantConsentForFamily(
  db: MySql2Database<typeof schema>,
  guardianId: number,
  attestedName = 'Test Guardian',
): Promise<void> {
  await recordConsent(db, {
    guardianId,
    decision: 'granted',
    attestedName,
    policyVersion: CONSENT_POLICY_VERSION,
  });
}

/**
 * Grants consent for every guardian that currently has a child.
 *
 * The form most fixtures want: one line at the end of setup, with no need to
 * thread a guardian id through helpers that were written before the gate
 * existed. It is idempotent in the way that matters — running it twice appends
 * a second granted row, and the latest row still says granted.
 *
 * **Order matters.** It consents for the children that exist when it runs, so a
 * fixture creating a sibling later must call it again. That is the product's
 * real behaviour — a child added after consent reads `none` — and a helper that
 * hid it would be teaching fixtures something false.
 */
export async function grantConsentForAllFamilies(
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const guardians = await db
    .selectDistinct({ id: schema.learners.guardianId })
    .from(schema.learners);

  for (const guardian of guardians) {
    await grantConsentForFamily(db, guardian.id);
  }
}
