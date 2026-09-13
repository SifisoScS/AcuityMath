/**
 * Whether one account may reach another institution's learner.
 *
 * This is the widest privilege boundary in the product. Every rule before it
 * separated one family from another; this one separates a district from a
 * district, so a mistake here stops being a bug about one child and becomes a
 * bug about every child in a region.
 *
 * It is deliberately small, deliberately its own module, and deliberately
 * tested against the cases that look like they work.
 */

import { eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * Scope follows the **guardian's** institution, not classroom enrolment.
 *
 * A child whose parent signed up privately may also sit in a classroom at a
 * district campus. Enrolment grants the *teacher* what they need to teach —
 * classroom progress — and does **not** put that child's home practice inside
 * the district's reach. A family's evenings and weekends on a private account
 * are not a record the district provisioned.
 *
 * Narrow first, on purpose. Widening this later is a decision somebody makes;
 * narrowing it later is a disclosure that has already happened.
 */
export async function institutionReaches(
  db: Db,
  callerId: number,
  learnerGuardianId: number,
): Promise<boolean> {
  /*
   * Both institutions are read here rather than taken from the session.
   *
   * A session lasts thirty days. Baking the institution into it would mean an
   * administrator removed from a district keeps reaching its children until
   * their cookie expires — an authorization fact served from a cache that
   * nothing invalidates. The same reasoning that keeps the screen-time
   * heartbeat from trusting a client-supplied duration.
   */
  const rows = await db
    .select({ id: schema.users.id, institutionId: schema.users.institutionId })
    .from(schema.users)
    .where(inArray(schema.users.id, [callerId, learnerGuardianId]));

  const caller = rows.find(row => row.id === callerId);
  const guardian = rows.find(row => row.id === learnerGuardianId);

  /*
   * **`null` is not a match, and this is the line that matters.**
   *
   * Most accounts have no institution: every family that signed itself up has
   * `institution_id` null. If absence compared equal to absence, one
   * self-serve parent would reach every other self-serve family's children —
   * the whole platform, through a rule meant to narrow access.
   *
   * "Zero is not a value when it means unset" is already a recorded trap in
   * this project, from `screen_time_rules`. This is the same trap where being
   * wrong discloses children's records rather than locking a screen.
   */
  if (!caller?.institutionId || !guardian?.institutionId) return false;

  return caller.institutionId === guardian.institutionId;
}

/** Every learner inside one institution, by way of their guardians. */
export async function learnersInInstitution(
  db: Db,
  institutionId: number,
): Promise<number[]> {
  const guardians = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.institutionId, institutionId));

  if (guardians.length === 0) return [];

  const learners = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(
      inArray(
        schema.learners.guardianId,
        guardians.map(guardian => guardian.id),
      ),
    );

  return learners.map(learner => learner.id);
}
