/**
 * Turning a verified launch into an account, for staff only.
 *
 * A validated launch says the platform believes this person is a teacher in
 * this district. That is a claim by somebody else's software about somebody
 * else's user, and the whole of this module is about which of those claims we
 * are willing to act on.
 *
 * **Pupils are refused here, by name.** Provisioning a child needs a consent
 * record, and a child has no guardian in this system when they arrive from an
 * LMS — the district stands in their place, and modelling that is C3d. Until
 * then a pupil launch ends in a sentence explaining why, because the failure
 * mode of guessing is a child practising with no consent on file.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { addMember } from '../learning/membership';
import type { LaunchContext } from './idToken';

type Db = MySql2Database<typeof schema>;

/**
 * Raised when a launch is for somebody this product cannot yet sign in.
 *
 * Unlike the token failures, these messages **are** meant to be read. Every one
 * of them is a person standing in front of a screen in a classroom, and every
 * one is resolved by an administrator doing something specific. "Something went
 * wrong" would send them to a support queue to be told what this sentence could
 * have told them.
 */
export class CannotProvision extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'CannotProvision';
    this.reason = reason;
  }
}

export interface ProvisionedStaff {
  userId: number;
  email: string;
  /** True the first time this person launched. Useful for a welcome, not for access. */
  isNew: boolean;
}

/**
 * Finds or creates the account for a staff launch.
 *
 * The order is deliberate: the identity link is consulted before the email,
 * because the link is the durable fact and the address is the changeable one.
 */
export async function provisionStaff(
  db: Db,
  context: LaunchContext,
  now: Date = new Date(),
): Promise<ProvisionedStaff> {
  if (!context.isStaff) {
    throw new CannotProvision(
      'not_staff',
      'This product cannot yet sign in pupils from an LMS. A teacher or ' +
        'administrator can launch it; pupil launches are coming.',
    );
  }

  const [linked] = await db
    .select({ userId: schema.ltiIdentities.userId, id: schema.ltiIdentities.id })
    .from(schema.ltiIdentities)
    .where(
      and(
        eq(schema.ltiIdentities.platformId, context.platformId),
        eq(schema.ltiIdentities.subject, context.subject),
      ),
    )
    .limit(1);

  if (linked) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, linked.userId))
      .limit(1);

    /*
     * The district is rechecked on every launch, not only at linking.
     *
     * An account removed from a district keeps its LTI link — nothing deletes
     * it — and without this a teacher who left in September would still be
     * launching into that district's data in June.
     */
    if (!user || user.institutionId !== context.institutionId) {
      throw new CannotProvision(
        'moved',
        'This account is no longer part of the district this launch belongs to. ' +
          'An administrator needs to add it again.',
      );
    }

    await db
      .update(schema.ltiIdentities)
      .set({ lastLaunchedAt: now })
      .where(eq(schema.ltiIdentities.id, linked.id));

    return { userId: user.id, email: user.email, isNew: false };
  }

  /*
   * First launch. An address is needed exactly once, to decide whether this is
   * a new person or somebody the district already added — and after that the
   * link above answers it, so a district that withholds email breaks only the
   * very first launch of each member.
   */
  const email = context.email?.trim().toLowerCase();
  if (!email) {
    throw new CannotProvision(
      'no_email',
      'Your LMS did not send an email address, so there is no way to tell ' +
        'whether you already have an account here. An administrator can enable ' +
        'sending it to this tool, or add you to the district by email first.',
    );
  }

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  let userId: number;
  let isNew: boolean;

  if (!existing) {
    const member = await addMember(db, context.institutionId, email, 'teacher');
    userId = member.userId;
    isNew = true;
  } else {
    /*
     * **A launch may not change what an account is.** Everything below is a
     * refusal, and the reason is that the platform chose the email — so any
     * branch here that *modified* an existing account would be letting somebody
     * else's software decide what one of our accounts becomes.
     *
     * `addMember` is deliberately not called on this path even though it looks
     * like the same operation. It promotes an unaffiliated account into the
     * district and rewrites its role, which is correct when an administrator
     * types an address and wrong when an LMS asserts one.
     */
    if (existing.role === 'admin') {
      throw new CannotProvision(
        'platform_admin',
        'This address belongs to a platform administrator, which cannot be ' +
          'linked to a district by a launch.',
      );
    }

    if (existing.institutionId === null) {
      /*
       * The one that would actually hurt somebody.
       *
       * A self-serve account with no district is usually a parent, and their
       * children hang off it. Adopting it into a district on the say-so of a
       * launch would pull that family's records into the district's reach —
       * `institutionReaches` would start returning them — without any adult
       * involved agreeing to anything. An administrator adding the address
       * deliberately is a different act, and stays available.
       */
      throw new CannotProvision(
        'unaffiliated',
        'An account already exists for this address and is not part of any ' +
          'district. An administrator must add it deliberately before it can ' +
          'be used from an LMS.',
      );
    }

    if (existing.institutionId !== context.institutionId) {
      throw new CannotProvision(
        'other_district',
        'An account already exists for this address in a different district. ' +
          'Moving it is a deliberate act for an administrator, not something a ' +
          'launch should do.',
      );
    }

    /*
     * Same district, so this is the district's own member arriving through the
     * LMS for the first time. Their role is **left alone**: an
     * `institution_admin` who launches from Canvas must not come back a
     * `teacher`, which is exactly what handing this to `addMember` would do.
     */
    userId = existing.id;
    isNew = false;
  }

  await db.insert(schema.ltiIdentities).values({
    platformId: context.platformId,
    subject: context.subject,
    userId,
    lastLaunchedAt: now,
  });

  return { userId, email, isNew };
}
