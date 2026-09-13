/**
 * Who belongs to a district.
 *
 * Graft B1 built the entities and B2 built the boundary around them — and
 * between them they left `users.institution_id` written by nothing and
 * `institution_admin` granted by nobody. The scope was correct and unreachable:
 * a district could be created, and no one could be put inside it.
 *
 * That is the writerless-table defect one level down, in a column rather than a
 * table, which is why `writers.test.ts` did not catch it. This module is the
 * writer, and `drizzle/writers.test.ts` now asserts scope-granting columns have
 * one too.
 */

import { and, eq, ne } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * The roles a district may hand out.
 *
 * **`admin` is not among them, and cannot be.** That is the platform
 * administrator — global reach, the only bypass in `learnerProcedure` — and a
 * district being able to mint one would make institutional scope decorative.
 */
export type InstitutionRole = 'institution_admin' | 'teacher' | 'parent';

const GRANTABLE: readonly InstitutionRole[] = ['institution_admin', 'teacher', 'parent'];

export class NotGrantable extends Error {
  constructor(role: string) {
    super(`A district cannot grant the role "${role}".`);
    this.name = 'NotGrantable';
  }
}

/** Raised when an account already belongs to a different district. */
export class BelongsElsewhere extends Error {
  constructor(
    public readonly email: string,
    public readonly institutionId: number,
  ) {
    super(
      `${email} already belongs to institution ${institutionId}. ` +
        'Remove them from it before adding them here.',
    );
    this.name = 'BelongsElsewhere';
  }
}

/** Raised when the account is a platform administrator. */
export class WouldDemotePlatformAdmin extends Error {
  constructor(email: string) {
    super(`${email} is a platform administrator and cannot be made a district member.`);
    this.name = 'WouldDemotePlatformAdmin';
  }
}

export interface Member {
  userId: number;
  email: string;
  role: InstitutionRole;
  institutionId: number;
}

/**
 * Adds somebody to a district, creating the account if it does not exist.
 *
 * Creating it is not a shortcut around sign-in: there are no passwords to
 * provision, and the magic-link flow looks the account up by address before
 * creating one. A district can therefore add staff who have never signed in,
 * and those people keep the role and institution recorded here when they
 * eventually do — rather than arriving as a fresh `parent` with no district,
 * which is what would happen if membership only worked for existing accounts.
 */
export async function addMember(
  db: Db,
  institutionId: number,
  email: string,
  role: InstitutionRole,
): Promise<Member> {
  const address = email.trim().toLowerCase();
  if (!address) throw new Error('A member needs an email address.');
  if (!GRANTABLE.includes(role)) throw new NotGrantable(role);

  const [institution] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .limit(1);
  if (!institution) throw new Error(`No such institution ${institutionId}.`);

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, address))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(schema.users)
      .values({ email: address, role, institutionId })
      .$returningId();
    return { userId: created.id, email: address, role, institutionId };
  }

  /*
   * A platform administrator is refused rather than demoted.
   *
   * Their privilege would otherwise change as a side effect of a district
   * adding them — the exact thing B2 avoided by making `institution_admin` its
   * own role instead of deriving scope from this column.
   */
  if (existing.role === 'admin') throw new WouldDemotePlatformAdmin(address);

  /*
   * A transfer is refused rather than performed.
   *
   * Moving an account between districts moves the scope over their children
   * with it. That is a deliberate act with consequences for families, not a
   * side effect of someone being added to a second district — so it has to be
   * a removal followed by an addition, each of which is visible.
   */
  if (existing.institutionId !== null && existing.institutionId !== institutionId) {
    throw new BelongsElsewhere(address, existing.institutionId);
  }

  await db
    .update(schema.users)
    .set({ institutionId, role })
    .where(eq(schema.users.id, existing.id));

  return { userId: existing.id, email: address, role, institutionId };
}

/**
 * Removes somebody from their district.
 *
 * The institution is cleared, and an `institution_admin` drops to `parent`
 * because that role means nothing without a district to administer. A `teacher`
 * keeps their role: teachers exist outside institutions perfectly well, and a
 * teacher who leaves a district still has their own classes.
 *
 * Even if the role were left alone, `institutionReaches` refuses an
 * administrator whose institution is null — that is asserted in
 * `tenancy.integration.test.ts`. Resetting it here is the second layer, not the
 * only one.
 */
export async function removeMember(db: Db, userId: number): Promise<void> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw new Error(`No such user ${userId}.`);

  await db
    .update(schema.users)
    .set({
      institutionId: null,
      role: user.role === 'institution_admin' ? 'parent' : user.role,
    })
    .where(eq(schema.users.id, userId));
}

/** Everyone in one district. */
export async function listMembers(db: Db, institutionId: number): Promise<Member[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      institutionId: schema.users.institutionId,
    })
    .from(schema.users)
    .where(and(eq(schema.users.institutionId, institutionId), ne(schema.users.role, 'admin')))
    .orderBy(schema.users.email);

  return rows.map(row => ({
    userId: row.userId,
    email: row.email,
    role: row.role as InstitutionRole,
    institutionId: row.institutionId as number,
  }));
}
