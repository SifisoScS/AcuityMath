/**
 * Children a district provisioned, rather than a family.
 *
 * The distinction is not administrative. A child here has **no guardian in this
 * system** — no parent account, no family dashboard, nobody to send a milestone
 * to. The district holds whatever agreement stands in a parent's place, which
 * makes it responsible for them in a way it is not responsible for a pupil who
 * merely sits in one of its classrooms.
 *
 * **Creating one does not consent for them.** A learner created here is refused
 * by the consent gate until an institutional agreement exists, which is C3e.
 * That is the correct behaviour rather than a gap, and it is asserted as such:
 * a child who can practise before anybody agreed to anything is the exact
 * failure the gate exists to prevent, and an LMS launch is precisely where the
 * pressure to skip it comes from.
 */

import { and, eq, isNull } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

export interface DistrictLearner {
  id: number;
  institutionId: number;
  displayName: string;
  birthYear: number;
}

export interface DistrictLearnerInput {
  institutionId: number;
  displayName: string;
  /**
   * Year of birth, as everywhere else.
   *
   * Required rather than optional even though an LMS rarely sends one, because
   * the consent gate is age-dependent and a missing age would have to be
   * assumed. Assuming a child is old enough is the assumption that skips the
   * gate; assuming they are young enough blocks a sixth-former for no reason.
   * Neither is the caller's to make silently, so the caller must say.
   */
  birthYear: number;
}

export async function createDistrictLearner(
  db: Db,
  input: DistrictLearnerInput,
): Promise<DistrictLearner> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error('A learner needs a display name.');

  const [institution] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, input.institutionId))
    .limit(1);
  if (!institution) throw new Error(`No such institution ${input.institutionId}.`);

  /*
   * `guardianId` is left unset rather than set to anything.
   *
   * The check constraint on `learners` refuses a row with two owners or none,
   * so this is enforced by the database and not only by the line above it.
   */
  const [created] = await db
    .insert(schema.learners)
    .values({
      institutionId: input.institutionId,
      displayName,
      birthYear: input.birthYear,
    })
    .$returningId();

  return {
    id: created.id,
    institutionId: input.institutionId,
    displayName,
    birthYear: input.birthYear,
  };
}

/** Every child a district provisioned itself, excluding the archived. */
export async function districtLearners(
  db: Db,
  institutionId: number,
): Promise<DistrictLearner[]> {
  const rows = await db
    .select({
      id: schema.learners.id,
      institutionId: schema.learners.institutionId,
      displayName: schema.learners.displayName,
      birthYear: schema.learners.birthYear,
    })
    .from(schema.learners)
    .where(
      and(
        eq(schema.learners.institutionId, institutionId),
        isNull(schema.learners.archivedAt),
      ),
    );

  return rows.map(row => ({
    id: row.id,
    // Narrowed rather than asserted: the column is nullable in general, and the
    // filter above is what makes it present here.
    institutionId: row.institutionId as number,
    displayName: row.displayName,
    birthYear: row.birthYear,
  }));
}
