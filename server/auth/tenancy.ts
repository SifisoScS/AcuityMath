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
  learnerId: number,
): Promise<boolean> {
  /*
   * **This used to take a guardian id**, and taking one was a trap.
   *
   * A caller holding a learner id had to look the guardian up first, and both
   * are plain numbers — so passing the wrong one compiled, ran, and returned an
   * answer. It happened during C3c: a test passed a learner id, got `false`, and
   * passed, because that learner's id and some unrelated user's id were both 1.
   * A wrong answer that agrees with the expected one teaches nothing.
   *
   * Since C3d there is a second reason: a district's pupil has no guardian at
   * all, so there is no id to pass. Resolving the owner inside is the only shape
   * that can answer for both kinds of child.
   */
  const [learner] = await db
    .select({
      guardianId: schema.learners.guardianId,
      institutionId: schema.learners.institutionId,
    })
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);

  if (!learner) return false;

  /*
   * Read here rather than taken from the session.
   *
   * A session lasts thirty days. Baking the institution into it would mean an
   * administrator removed from a district keeps reaching its children until
   * their cookie expires — an authorization fact served from a cache that
   * nothing invalidates. The same reasoning that keeps the screen-time
   * heartbeat from trusting a client-supplied duration.
   */
  const [caller] = await db
    .select({ institutionId: schema.users.institutionId })
    .from(schema.users)
    .where(eq(schema.users.id, callerId))
    .limit(1);

  /*
   * **`null` is not a match.**
   *
   * Most accounts have no institution: every family that signed itself up has
   * `institution_id` null. If absence compared equal to absence, one self-serve
   * parent would reach every other self-serve family's children — the whole
   * platform, through a rule meant to narrow access.
   *
   * "Zero is not a value when it means unset" is already a recorded trap in this
   * project, from `screen_time_rules`. This is the same trap where being wrong
   * discloses children's records rather than locking a screen.
   *
   * **This line and the guardian one below are jointly load-bearing, not
   * individually**, which was measured rather than assumed. Removing either
   * alone changes no answer — the other still refuses the null-to-null case —
   * and both mutations came back green. Removing both lets two unaffiliated
   * families reach each other, and that mutation fails. Two guards where one
   * would do is worth keeping on a boundary this wide, but the comment should
   * not claim a line is doing work that its neighbour is also doing.
   */
  if (!caller?.institutionId) return false;

  /*
   * A district's own pupil is reached directly, without a guardian in between.
   * The district provisioned them and holds the agreement that stands in a
   * parent's place, so its administrators answer for them.
   */
  if (learner.institutionId) return caller.institutionId === learner.institutionId;

  /*
   * Otherwise scope follows the **guardian's** institution, not classroom
   * enrolment.
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
  if (!learner.guardianId) return false;

  const [guardian] = await db
    .select({ institutionId: schema.users.institutionId })
    .from(schema.users)
    .where(eq(schema.users.id, learner.guardianId))
    .limit(1);

  // The other half of the pair above. Either one alone refuses the null-to-null
  // case; only removing both opens it.
  if (!guardian?.institutionId) return false;

  return caller.institutionId === guardian.institutionId;
}

/**
 * Every learner inside one institution, by either route in.
 *
 * Two kinds of child, and missing the second would be a silent under-count in a
 * function whose answers drive district reporting: pupils the district
 * provisioned itself, and children of adults who belong to the district.
 */
export async function learnersInInstitution(
  db: Db,
  institutionId: number,
): Promise<number[]> {
  const owned = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(eq(schema.learners.institutionId, institutionId));

  const guardians = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.institutionId, institutionId));

  const throughFamilies = guardians.length
    ? await db
        .select({ id: schema.learners.id })
        .from(schema.learners)
        .where(
          inArray(
            schema.learners.guardianId,
            guardians.map(guardian => guardian.id),
          ),
        )
    : [];

  // A child cannot be in both lists — the check constraint forbids two owners —
  // but the set is cheap and does not depend on that staying true.
  return [...new Set([...owned, ...throughFamilies].map(learner => learner.id))].sort(
    (a, b) => a - b,
  );
}
