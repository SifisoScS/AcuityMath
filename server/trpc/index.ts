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
import { transformer } from '../../src/lib/transformer';
import { resolveUser, type AuthenticatedUser, type RequestHeaders } from '../auth/session';
import { getDatabase, type Database } from '../db/client';

export interface Context {
  db: Database;
  user: AuthenticatedUser | null;
}

export async function createContext(headers: RequestHeaders = {}): Promise<Context> {
  const db = getDatabase();
  return { db, user: await resolveUser(db, headers) };
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

/** Administrators only. Used by nothing yet; declared so the shape is settled. */
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

  const entitled = ctx.user.role === 'admin' || learner.guardianId === ctx.user.id;
  if (!entitled) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No such learner.' });
  }

  return next({ ctx: { ...ctx, learner } });
});

export type Learner = typeof schema.learners.$inferSelect;
