/**
 * The tRPC layer: context, and the procedures everything else is built from.
 *
 * The important thing here is `learnerProcedure`. Every interesting operation in
 * this application is about a specific child, and every one of them must check
 * that the caller is entitled to that child. Written as a call the author
 * remembers to make, that check is one forgotten line away from a guardian
 * reading another family's records — and it would pass every test that only
 * exercises the happy path with the right learner.
 *
 * So the check is not a call. `learnerProcedure` requires a `learnerId` input,
 * performs the lookup itself, and puts the resolved learner on the context. A
 * procedure written on top of it cannot run without the check having passed, and
 * a procedure that forgets to declare `learnerId` does not compile.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../drizzle/schema';
import { institutionReaches } from '../auth/tenancy';
import { transformer } from '../../src/lib/transformer';
import { hasElevation, resolveUser, type AuthenticatedUser, type RequestHeaders } from '../auth/session';
import { getDatabase, type Database } from '../db/client';

export interface Context {
  db: Database;
  user: AuthenticatedUser | null;
  /**
   * Kept so elevation can be checked per procedure rather than once per
   * request. Most procedures do not need it, and verifying a signature on every
   * practice answer to serve procedures that never ask would be waste.
   */
  headers: RequestHeaders;
  /**
   * Set by the adapter. Elevation is granted by a mutation, and a mutation has
   * no other way to put a cookie on the response.
   */
  setCookie?: (value: string) => void;
}

export async function createContext(
  headers: RequestHeaders = {},
  setCookie?: (value: string) => void,
): Promise<Context> {
  const db = getDatabase();
  return { db, user: await resolveUser(db, headers), headers, setCookie };
}

/**
 * superjson so `Date` survives the wire.
 *
 * Attempt timestamps and mastery history points are dates, and JSON turns them
 * into strings that then compare wrongly against real dates on the client. The
 * transformer costs a few bytes and removes a class of bug that only shows up
 * near midnight.
 */
const t = initTRPC.context<Context>().create({ transformer });

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires somebody to be signed in. Says nothing about what they may reach. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Requires the adult, not just the account.
 *
 * A thirty-day session says somebody signed in on this device a while ago. It
 * does not say who is holding it now, and a family tablet is handed to a child
 * several times a day. Anything showing one child's records to another — a
 * sibling's analytics, the screen-time controls that restrict them, the export
 * of every learner's scores — is built on this rather than on `protectedProcedure`.
 *
 * The elevation is a separate short-lived cookie, so requiring it never means
 * signing anybody out.
 */
export const elevatedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!(await hasElevation(ctx.headers, ctx.user.id))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      // Distinguishable from an ordinary refusal, so the client knows to ask
      // for a PIN rather than to send the parent back to sign in.
      message: 'STEP_UP_REQUIRED',
    });
  }
  return next({ ctx });
});

/**
 * **Platform** administrators only.
 *
 * Not institutional ones. The check is `!== 'admin'` rather than a list of
 * privileged roles, so adding `institution_admin` did not widen this by
 * accident — an institutional administrator creating institutions would be an
 * institutional administrator creating peers.
 *
 * `FORBIDDEN` rather than `NOT_FOUND` here, deliberately: unlike a learner id,
 * the existence of this surface is not a secret and confirming it discloses
 * nothing about anybody.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Administrators only.' });
  }
  return next({ ctx });
});

export const learnerIdInput = z.object({ learnerId: z.number().int().positive() });

/**
 * Operates on one learner, and proves the caller is entitled to them first.
 *
 * A guardian reaches their own children. An administrator reaches any child —
 * that is what the role is for, and it is the only bypass. A teacher reaching
 * their roster is deliberately **not** implemented here: enrolment is a weaker
 * relationship than guardianship and grants a narrower set of operations, so
 * conflating the two would silently give a teacher a parent's powers. It gets
 * its own procedure when the teacher surfaces are built.
 *
 * A missing learner and an unreachable one both answer NOT_FOUND. FORBIDDEN
 * would confirm the record exists, which lets an outsider enumerate the
 * children on the platform by watching which ids answer differently.
 */
export const learnerProcedure = protectedProcedure.input(learnerIdInput).use(async ({ ctx, input, next }) => {
  const [learner] = await ctx.db
    .select()
    .from(schema.learners)
    .where(and(eq(schema.learners.id, input.learnerId), isNull(schema.learners.archivedAt)))
    .limit(1);

  if (!learner) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No such learner.' });
  }

  /*
   * Three ways in, and no fourth.
   *
   * A guardian reaches their own children. The **platform** administrator
   * reaches every learner — that is what the role is for, and it is the only
   * global bypass. An **institutional** administrator reaches learners whose
   * guardian belongs to their own institution, and stops there.
   *
   * A teacher reaching their roster is still deliberately not implemented here:
   * enrolment is a weaker relationship than guardianship and grants a narrower
   * set of operations, so conflating the two would silently give a teacher a
   * parent's powers. Institutional scope follows the *guardian's* institution
   * for the same reason — a child enrolled at a district campus whose family
   * signed up privately is taught by the district, not provisioned by it.
   */
  const entitled =
    ctx.user.role === 'admin' ||
    /*
     * `guardianId` is nullable since C3d, so this is written as a comparison
     * against a non-null id rather than plain equality. Two nulls must never
     * match: a district's pupil has no guardian, and every account whose id
     * failed to load would otherwise compare equal to one.
     */
    (learner.guardianId !== null && learner.guardianId === ctx.user.id) ||
    (ctx.user.role === 'institution_admin' &&
      (await institutionReaches(ctx.db, ctx.user.id, learner.id)));

  if (!entitled) {
    /*
     * NOT_FOUND, not FORBIDDEN — and now across tenants too.
     *
     * FORBIDDEN would confirm the record exists. Between families that lets an
     * outsider enumerate the children on the platform; between districts it
     * would let one district's administrator confirm which children are
     * registered with a competitor, or with a neighbouring authority, one id at
     * a time. The answer has to be indistinguishable from the answer for a
     * learner who does not exist.
     */
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No such learner.' });
  }

  return next({ ctx: { ...ctx, learner } });
});

/**
 * One learner, and proof the adult is present.
 *
 * Composed from `learnerProcedure` rather than written afresh, so the ownership
 * check cannot drift between the two. Deciding how a child identifies
 * themselves is a parent's decision — a child who could set their own badge
 * could set their sibling's.
 */
export const elevatedLearnerProcedure = learnerProcedure.use(async ({ ctx, next }) => {
  if (!(await hasElevation(ctx.headers, ctx.user.id))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'STEP_UP_REQUIRED' });
  }
  return next({ ctx });
});

export type Learner = typeof schema.learners.$inferSelect;
