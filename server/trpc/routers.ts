/**
 * The practice loop, as an API.
 *
 * Every procedure that touches a child is built on `learnerProcedure`, which
 * resolves the learner and proves the caller is entitled to them before the
 * handler runs. Nothing here re-checks that, and nothing here should: a second
 * check invites the belief that the first is optional.
 */

import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../drizzle/schema';
import { approximateAge, tierForAge } from '../../src/services/tiers';
import { recordAttempt } from '../learning/recordAttempt';
import { serveNextProblem } from '../learning/serveProblem';
import { learnerProcedure, protectedProcedure, publicProcedure, router } from './index';

const learnersRouter = router({
  /** The signed-in guardian's own children. Never anybody else's. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(schema.learners)
      .where(and(eq(schema.learners.guardianId, ctx.user.id), isNull(schema.learners.archivedAt)))
      .orderBy(schema.learners.birthYear);

    return rows.map(learner => {
      const age = approximateAge(learner.birthYear);
      return {
        id: learner.id,
        displayName: learner.displayName,
        avatar: learner.avatar,
        birthYear: learner.birthYear,
        age,
        tier: tierForAge(age),
      };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        displayName: z.string().trim().min(1).max(100),
        birthYear: z
          .number()
          .int()
          // Bounded so a typo produces a validation error rather than a learner
          // aged 1,900 who resolves to the high-school tier.
          .min(new Date().getFullYear() - 25)
          .max(new Date().getFullYear()),
        avatar: z.string().max(16).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(schema.learners)
        .values({
          guardianId: ctx.user.id,
          displayName: input.displayName,
          birthYear: input.birthYear,
          avatar: input.avatar ?? '🌱',
        })
        .$returningId();

      return { id: created.id };
    }),

  /** Everything a dashboard needs for one child, in one round trip. */
  snapshot: learnerProcedure.query(async ({ ctx }) => {
    const learnerId = ctx.learner.id;

    const [ability] = await ctx.db
      .select()
      .from(schema.learnerAbility)
      .where(eq(schema.learnerAbility.learnerId, learnerId))
      .limit(1);

    const mastery = await ctx.db
      .select()
      .from(schema.learnerConceptMastery)
      .where(eq(schema.learnerConceptMastery.learnerId, learnerId));

    const [rewards] = await ctx.db
      .select()
      .from(schema.learnerRewards)
      .where(eq(schema.learnerRewards.learnerId, learnerId))
      .limit(1);

    const recentSessions = await ctx.db
      .select()
      .from(schema.practiceSessions)
      .where(eq(schema.practiceSessions.learnerId, learnerId))
      .orderBy(desc(schema.practiceSessions.startedAt))
      .limit(10);

    const misconceptions = await ctx.db
      .select()
      .from(schema.learnerMisconceptions)
      .where(eq(schema.learnerMisconceptions.learnerId, learnerId))
      .orderBy(desc(schema.learnerMisconceptions.observedCount));

    const age = approximateAge(ctx.learner.birthYear);

    return {
      learner: {
        id: learnerId,
        displayName: ctx.learner.displayName,
        avatar: ctx.learner.avatar,
        age,
        tier: tierForAge(age),
      },
      // Null rather than a zeroed profile: a learner who has never answered and
      // one measured at exactly average are different states, and a dashboard
      // that shows 1200 ELO for both is lying about one of them.
      ability: ability
        ? {
            theta: Number(ability.theta),
            standardError: Number(ability.standardError),
            dynamicLevel: Number(ability.dynamicLevel),
            eloRating: ability.eloRating,
            answered: ability.historyCount,
          }
        : null,
      mastery: mastery.map(row => ({
        conceptId: row.conceptId,
        masteryScore: row.masteryScore,
        accuracy: row.accuracy,
        attempts: row.attemptCount,
      })),
      rewards: rewards
        ? { coins: rewards.coins, xp: rewards.xp, streakDays: rewards.streakDays }
        : { coins: 0, xp: 0, streakDays: 0 },
      recentSessions: recentSessions.map(session => ({
        id: session.id,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        targetLength: session.targetLength,
      })),
      misconceptions: misconceptions.map(row => ({
        code: row.misconceptionCode,
        count: row.observedCount,
      })),
    };
  }),
});

const practiceRouter = router({
  start: learnerProcedure
    .input(z.object({ targetLength: z.number().int().min(1).max(50).default(8) }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .insert(schema.practiceSessions)
        .values({ learnerId: ctx.learner.id, targetLength: input.targetLength })
        .$returningId();

      return { sessionId: session.id, targetLength: input.targetLength };
    }),

  /**
   * The next question.
   *
   * Returns no answer and no explanation. Both are sent back by `submit` once
   * the learner has committed, because anything this procedure returns is
   * readable in the browser's network tab by the student it is testing.
   */
  next: learnerProcedure
    .input(z.object({ conceptId: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      return serveNextProblem(ctx.db, ctx.learner, { conceptId: input.conceptId });
    }),

  submit: learnerProcedure
    .input(
      z.object({
        problemId: z.number().int().positive(),
        sessionId: z.number().int().positive().optional(),
        answer: z.string().max(200),
        responseTimeMs: z.number().int().nonnegative().max(3_600_000).optional(),
        wasOffline: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.sessionId) {
        // A session belongs to a learner, and the learner is already proven. An
        // id from another child's session would otherwise attach this attempt to
        // their history.
        const [session] = await ctx.db
          .select()
          .from(schema.practiceSessions)
          .where(
            and(
              eq(schema.practiceSessions.id, input.sessionId),
              eq(schema.practiceSessions.learnerId, ctx.learner.id),
            ),
          )
          .limit(1);

        if (!session) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No such session.' });
        }
      }

      const result = await recordAttempt(ctx.db, {
        learnerId: ctx.learner.id,
        problemId: input.problemId,
        sessionId: input.sessionId ?? null,
        submittedAnswer: input.answer,
        responseTimeMs: input.responseTimeMs ?? null,
        wasOffline: input.wasOffline ?? false,
      });

      const [problem] = await ctx.db
        .select({ explanation: schema.problems.explanation, answer: schema.problems.answer })
        .from(schema.problems)
        .where(eq(schema.problems.id, input.problemId))
        .limit(1);

      return {
        isCorrect: result.isCorrect,
        correctAnswer: problem.answer,
        explanation: problem.explanation,
        misconceptionCode: result.misconceptionCode,
        conceptId: result.conceptId,
        mastery: result.mastery,
        accuracy: result.accuracy,
        ability: {
          theta: result.ability.theta,
          dynamicLevel: result.ability.dynamicLevel,
          eloRating: result.ability.eloRating,
          answered: result.ability.historyCount,
        },
      };
    }),

  complete: learnerProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(schema.practiceSessions)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(schema.practiceSessions.id, input.sessionId),
            eq(schema.practiceSessions.learnerId, ctx.learner.id),
          ),
        );

      // Drizzle's MySQL update reports affected rows; zero means the session was
      // not this learner's, which is a NOT_FOUND for the same reason
      // `learnerProcedure` uses one — a FORBIDDEN would confirm it exists.
      const affected = (result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
      if (affected === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such session.' });
      }

      return { completed: true };
    }),
});

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, at: new Date() })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  learners: learnersRouter,
  practice: practiceRouter,
});

export type AppRouter = typeof appRouter;
