/**
 * The practice loop, as an API.
 *
 * Every procedure that touches a child is built on `learnerProcedure`, which
 * resolves the learner and proves the caller is entitled to them before the
 * handler runs. Nothing here re-checks that, and nothing here should: a second
 * check invites the belief that the first is optional.
 */

import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../drizzle/schema';
import { approximateAge, tierForAge } from '../../src/services/tiers';
import { recordAttempt } from '../learning/recordAttempt';
import { serveNextProblem } from '../learning/serveProblem';
import {
  checkStepUpPin,
  hasStepUpPin,
  resolveLearnerBySecret,
  setLearnerAccessToken,
  setStepUpPin,
  WeakPin,
} from '../auth/pin';
import { clearedElevationCookie, elevationCookie, hasElevation, issueElevation } from '../auth/session';
import {
  elevatedLearnerProcedure,
  learnerIdInput,
  learnerProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from './index';

const learnersRouter = router({
  /**
   * The signed-in guardian's own children. Never anybody else's.
   *
   * Carries each child's headline progress, because every surface that lists
   * children shows it — the switcher, the sidebar, the parent dashboard. The
   * alternative is a snapshot request per child, which for a family of four is
   * four round trips to render one list.
   *
   * The aggregates are three queries over the whole family rather than three
   * per child: an N+1 here is four times the work for the same answer.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(schema.learners)
      .where(and(eq(schema.learners.guardianId, ctx.user.id), isNull(schema.learners.archivedAt)))
      .orderBy(schema.learners.birthYear);

    if (rows.length === 0) return [];
    const ids = rows.map(row => row.id);

    const abilities = await ctx.db
      .select()
      .from(schema.learnerAbility)
      .where(inArray(schema.learnerAbility.learnerId, ids));

    const rewards = await ctx.db
      .select()
      .from(schema.learnerRewards)
      .where(inArray(schema.learnerRewards.learnerId, ids));

    const mastery = await ctx.db
      .select({
        learnerId: schema.learnerConceptMastery.learnerId,
        attempts: sql<number>`sum(${schema.learnerConceptMastery.attemptCount})`,
        weightedAccuracy: sql<number>`sum(${schema.learnerConceptMastery.accuracy} * ${schema.learnerConceptMastery.attemptCount})`,
        mastered: sql<number>`sum(case when ${schema.learnerConceptMastery.masteryScore} >= 80 then 1 else 0 end)`,
      })
      .from(schema.learnerConceptMastery)
      .where(inArray(schema.learnerConceptMastery.learnerId, ids))
      .groupBy(schema.learnerConceptMastery.learnerId);

    return rows.map(learner => {
      const age = approximateAge(learner.birthYear);
      const ability = abilities.find(row => row.learnerId === learner.id);
      const reward = rewards.find(row => row.learnerId === learner.id);
      const progress = mastery.find(row => row.learnerId === learner.id);

      const attempts = Number(progress?.attempts ?? 0);
      return {
        id: learner.id,
        displayName: learner.displayName,
        avatar: learner.avatar,
        birthYear: learner.birthYear,
        age,
        tier: tierForAge(age),
        // Zero for a learner who has never answered, which is true rather than
        // a placeholder — a child with no attempts has no ability estimate.
        dynamicLevel: ability ? Number(ability.dynamicLevel) : 0,
        eloRating: ability?.eloRating ?? 0,
        answered: ability?.historyCount ?? 0,
        coins: reward?.coins ?? 0,
        xp: reward?.xp ?? 0,
        streakDays: reward?.streakDays ?? 0,
        streakShields: reward?.streakShields ?? 0,
        // Weighted by attempts, so a concept answered once does not count as
        // much as one answered twenty times.
        accuracyRate: attempts > 0 ? Math.round(Number(progress?.weightedAccuracy ?? 0) / attempts) : 0,
        conceptsMastered: Number(progress?.mastered ?? 0),
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

/**
 * The step-up PIN, and the child selector.
 *
 * Both live here rather than beside sign-in because neither of them signs
 * anybody in. One proves the adult is present within a session that already
 * exists; the other picks which child that session is looking at.
 */
const accessRouter = router({
  /** What the client needs to decide whether to ask for anything. */
  status: protectedProcedure.query(async ({ ctx }) => ({
    hasPin: await hasStepUpPin(ctx.db, ctx.user.id),
    isElevated: await hasElevation(ctx.headers, ctx.user.id),
  })),

  setPin: protectedProcedure
    .input(z.object({ pin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await setStepUpPin(ctx.db, ctx.user.id, input.pin);
      } catch (error) {
        if (error instanceof WeakPin) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
      }

      // Setting a PIN proves the adult is present, so it elevates too. Asking
      // someone to enter the PIN they just chose would be theatre.
      ctx.setCookie?.(elevationCookie(await issueElevation(ctx.user.id)));
      return { set: true };
    }),

  elevate: protectedProcedure
    .input(z.object({ pin: z.string().max(32) }))
    .mutation(async ({ ctx, input }) => {
      const result = await checkStepUpPin(ctx.db, ctx.user.id, input.pin);

      if (result.ok) {
        ctx.setCookie?.(elevationCookie(await issueElevation(ctx.user.id)));
        return { elevated: true as const };
      }

      // The three failures have different next steps for the person in front of
      // the screen, and telling somebody the wrong one wastes their time: a
      // locked account should wait, an unset PIN should be chosen, a wrong one
      // retyped.
      if (result.reason === 'locked') {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${Math.ceil(result.retryAfterMs / 60000)} minutes.`,
        });
      }
      if (result.reason === 'not-set') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No PIN has been set yet.' });
      }
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: `Incorrect PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left.`,
      });
    }),

  /** Hands the tablet back to a child. */
  standDown: protectedProcedure.mutation(({ ctx }) => {
    ctx.setCookie?.(clearedElevationCookie());
    return { elevated: false };
  }),

  /**
   * Gives a child a way to choose themselves.
   *
   * Requires elevation: deciding how a child identifies is a parent's decision,
   * and a child who could set their own badge could set their sibling's.
   */
  setLearnerSecret: elevatedLearnerProcedure
    .input(
      z.object({
        kind: z.enum(['pin', 'qr_badge', 'picture_sequence']),
        secret: z.string().min(3).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setLearnerAccessToken(ctx.db, ctx.learner.id, input.kind, input.secret);
      return { set: true };
    }),

  /**
   * Which of this guardian's children a badge or picture sequence belongs to.
   *
   * Not authentication. It resolves a learner *within* the signed-in guardian's
   * own set, so a badge is meaningless without the session and cannot reach
   * another family's child even if two families pick the same sequence.
   */
  selectLearner: protectedProcedure
    .input(
      z.object({
        kind: z.enum(['pin', 'qr_badge', 'picture_sequence']),
        secret: z.string().max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mine = await ctx.db
        .select({ id: schema.learners.id })
        .from(schema.learners)
        .where(and(eq(schema.learners.guardianId, ctx.user.id), isNull(schema.learners.archivedAt)));

      const learnerId = await resolveLearnerBySecret(
        ctx.db,
        mine.map(row => row.id),
        input.kind,
        input.secret,
      );

      if (!learnerId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That badge does not match anyone here.' });
      }
      return { learnerId };
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
  access: accessRouter,
});

export type AppRouter = typeof appRouter;
