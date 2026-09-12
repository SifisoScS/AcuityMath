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
import { analyticsForLearners, learnerAnalytics } from '../learning/analytics';
import { learnerSummaries } from '../learning/learnerSummary';
import {
  consentForFamily,
  currentPolicyHash,
  recordConsent,
  StalePolicy,
} from '../learning/consent';
import {
  CONSENT_POLICY_CLAUSES,
  CONSENT_POLICY_VERSION,
  CONSENT_SUMMARY,
  VERIFICATION_EXPLANATION,
} from '../../src/data/consentPolicy';
import { avatarById, FREE_AVATAR_IDS, STORE_AVATARS } from '../../src/data/avatars';
import { spendCoins } from '../learning/rewards';
import {
  announceAssignment,
  clearNotifications,
  markAllRead,
  notificationsForLearner,
  notificationsForUser,
  setNotificationRead,
} from '../learning/notifications';
import {
  assignableLearnerIds,
  assignmentsForLearner,
  authoredAssignments,
} from '../learning/assignments';
import { recordAttempt } from '../learning/recordAttempt';
import { recordScreenTime, screenTimeState } from '../learning/screenTime';
import { ConsentMissing, recordingPermission } from '../learning/consentGate';
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
  elevatedProcedure,
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
      .select({ id: schema.learners.id })
      .from(schema.learners)
      .where(and(eq(schema.learners.guardianId, ctx.user.id), isNull(schema.learners.archivedAt)));

    // The scoping stays here; `learnerSummaries` only answers about ids it is
    // given, so widening what a caller may see takes a change on this line.
    return learnerSummaries(
      ctx.db,
      rows.map(row => row.id),
    );
  }),

  /** The avatars a learner already has, free ones included. */
  avatars: learnerProcedure.query(async ({ ctx }) => {
    const bought = await ctx.db
      .select({ avatarId: schema.learnerAvatars.avatarId })
      .from(schema.learnerAvatars)
      .where(eq(schema.learnerAvatars.learnerId, ctx.learner.id));

    // The free ones are not stored, so they are added here rather than written
    // as rows nobody decided on.
    return [...new Set([...FREE_AVATAR_IDS, ...bought.map(row => row.avatarId)])];
  }),

  /**
   * Buys a companion avatar.
   *
   * The price is read from the catalogue here, never taken from the input. It
   * used to be passed in by `RewardsView` from a client-side constant, so the
   * price a learner paid was whatever their browser said it was.
   *
   * Not elevated: spending coins a child earned, on a cosmetic, is the child's
   * decision. Requiring a parent's PIN to change an avatar would train the
   * household to enter it reflexively.
   */
  buyAvatar: learnerProcedure
    .input(z.object({ avatarId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const avatar = avatarById(input.avatarId);
      if (!avatar) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such avatar.' });
      }

      const [already] = await ctx.db
        .select({ id: schema.learnerAvatars.id })
        .from(schema.learnerAvatars)
        .where(
          and(
            eq(schema.learnerAvatars.learnerId, ctx.learner.id),
            eq(schema.learnerAvatars.avatarId, avatar.id),
          ),
        )
        .limit(1);

      // Owned already, or free. Either way there is nothing to charge, and
      // charging again for a second click would be the worst outcome here.
      if (already || avatar.price === 0) {
        return { unlocked: true, charged: 0 };
      }

      const paid = await spendCoins(ctx.db, ctx.learner.id, avatar.price);
      if (!paid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Not enough Star Coins for that one yet.',
        });
      }

      await ctx.db
        .insert(schema.learnerAvatars)
        .values({ learnerId: ctx.learner.id, avatarId: avatar.id });

      return { unlocked: true, charged: avatar.price };
    }),

  /** Sets the avatar shown for a learner. Must be one they have. */
  setAvatar: learnerProcedure
    .input(z.object({ avatarId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const avatar = avatarById(input.avatarId);
      if (!avatar) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such avatar.' });
      }

      if (avatar.price > 0) {
        const [owned] = await ctx.db
          .select({ id: schema.learnerAvatars.id })
          .from(schema.learnerAvatars)
          .where(
            and(
              eq(schema.learnerAvatars.learnerId, ctx.learner.id),
              eq(schema.learnerAvatars.avatarId, avatar.id),
            ),
          )
          .limit(1);

        if (!owned) {
          // Otherwise the shop is decoration: anyone could wear anything by
          // calling this directly.
          throw new TRPCError({ code: 'FORBIDDEN', message: 'That one has not been unlocked.' });
        }
      }

      await ctx.db
        .update(schema.learners)
        .set({ avatar: avatar.icon })
        .where(eq(schema.learners.id, ctx.learner.id));

      return { avatar: avatar.icon };
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

  /**
   * The daily screen-time limit for one child.
   *
   * Elevated, because it is a parent's control over a child and the child is
   * the person most motivated to change it. It lived in browser state before,
   * where the learner it restricted could clear it.
   */
  setScreenTimeLimit: elevatedLearnerProcedure
    .input(z.object({ dailyLimitMinutes: z.number().int().min(5).max(480) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(schema.screenTimeRules)
        .values({ learnerId: ctx.learner.id, dailyLimitMinutes: input.dailyLimitMinutes })
        .onDuplicateKeyUpdate({ set: { dailyLimitMinutes: input.dailyLimitMinutes } });
      return { dailyLimitMinutes: input.dailyLimitMinutes };
    }),

  /**
   * Bank the time since the last beat, and say whether the child is locked.
   *
   * `learnerProcedure` rather than `elevatedProcedure`: this runs continuously
   * while a child practises, and a limit that needed the parent's PIN every
   * minute would simply be switched off. Setting the limit is the elevated act
   * — `setScreenTimeLimit` above — and enforcing it is not.
   *
   * A mutation, not a query. It writes, and marking it a query would invite
   * every layer between here and the browser to cache or prefetch it, which
   * for a call whose whole purpose is to advance a clock means banking minutes
   * nobody spent.
   *
   * It takes **no duration**. See `recordScreenTime`: a counter the caller
   * increments is a counter the child it restricts can decline to increment.
   */
  heartbeat: learnerProcedure.mutation(({ ctx }) => recordScreenTime(ctx.db, ctx.learner.id)),

  /**
   * Where the limit stands, without counting anything.
   *
   * The reload path uses this. Beating on mount would bank the time the browser
   * spent closed, so a child who shut the laptop at the limit and opened it the
   * next morning would be charged for the night.
   */
  screenTime: learnerProcedure.query(({ ctx }) => screenTimeState(ctx.db, ctx.learner.id)),

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

const analyticsRouter = router({
  /**
   * One child's analytics.
   *
   * `elevatedLearnerProcedure`, not `learnerProcedure`: this is the surface the
   * step-up PIN exists for. A signed-in session on a family tablet is not proof
   * that the person reading a nine-year-old's error patterns is their parent
   * rather than their sibling.
   */
  forLearner: elevatedLearnerProcedure.query(({ ctx }) => learnerAnalytics(ctx.db, ctx.learner.id)),

  /** Every child on the account, for the parent dashboard's family view. */
  forFamily: elevatedProcedure.query(async ({ ctx }) => {
    const mine = await ctx.db
      .select({ id: schema.learners.id })
      .from(schema.learners)
      .where(and(eq(schema.learners.guardianId, ctx.user.id), isNull(schema.learners.archivedAt)));

    return analyticsForLearners(
      ctx.db,
      mine.map(row => row.id),
    );
  }),
});

/**
 * The curriculum, for choosing what to assign.
 *
 * Read-only and open to any signed-in adult: concept titles are the product's
 * table of contents, not a child's record.
 */
const curriculumRouter = router({
  /**
   * The avatar shop.
   *
   * Served rather than imported by the client so that the prices drawn and the
   * prices charged cannot drift apart across a deploy.
   */
  avatars: publicProcedure.query(() => STORE_AVATARS),


  concepts: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: schema.concepts.id,
        title: schema.concepts.title,
        strand: schema.concepts.strand,
        tier: schema.concepts.tier,
        ageBandLow: schema.concepts.ageBandLow,
        ageBandHigh: schema.concepts.ageBandHigh,
      })
      .from(schema.concepts)
      .orderBy(schema.concepts.tier, schema.concepts.sortOrder),
  ),
});

const assignmentsRouter = router({
  /** Assignments this adult set, with how many have come back. */
  authored: protectedProcedure.query(({ ctx }) => authoredAssignments(ctx.db, ctx.user.id)),

  /**
   * Who this adult may set work for.
   *
   * Carries the same headline progress `learners.list` does, because this is
   * also a teacher's roster: `learners.list` is guardian-scoped, so a teacher
   * signing in saw an empty class and a form with nobody in it.
   */
  assignableLearners: protectedProcedure.query(async ({ ctx }) =>
    learnerSummaries(ctx.db, await assignableLearnerIds(ctx.db, ctx.user.id)),
  ),

  /** One child's own list. `learnerProcedure` proves the caller is entitled to them. */
  forLearner: learnerProcedure.query(({ ctx }) => assignmentsForLearner(ctx.db, ctx.learner.id)),

  /**
   * Sets work.
   *
   * Elevated, because it writes against named children and is reached from the
   * same adult surfaces the step-up PIN guards. Every target is checked against
   * `assignableLearnerIds` — a teacher reaches a learner through a classroom
   * they teach and through nothing else, and a guardian through their own
   * children.
   */
  create: elevatedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        instructions: z.string().trim().max(2000).default(''),
        conceptId: z.string().min(1).max(120),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
          .optional(),
        rewardCoins: z.number().int().min(0).max(500).default(0),
        learnerIds: z.array(z.number().int().positive()).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [concept] = await ctx.db
        .select({ id: schema.concepts.id })
        .from(schema.concepts)
        .where(eq(schema.concepts.id, input.conceptId))
        .limit(1);
      if (!concept) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such concept.' });
      }

      const allowed = new Set(await assignableLearnerIds(ctx.db, ctx.user.id));
      const requested = [...new Set(input.learnerIds)];
      const refused = requested.filter(id => !allowed.has(id));
      if (refused.length > 0) {
        // Named collectively rather than individually: telling the caller which
        // of the ids they guessed exist is a membership oracle.
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot set work for one or more of those learners.',
        });
      }

      const [created] = await ctx.db
        .insert(schema.assignments)
        .values({
          assignedByUserId: ctx.user.id,
          title: input.title,
          description: input.instructions || null,
          conceptId: input.conceptId,
          dueDate: input.dueDate ?? null,
          rewardCoins: input.rewardCoins,
        })
        .$returningId();

      await ctx.db
        .insert(schema.assignmentTargets)
        .values(requested.map(learnerId => ({ assignmentId: created.id, learnerId })));

      // The children, not their guardians. A parent whose bell rings for every
      // piece of homework stops reading the bell, which costs them the milestone
      // notifications that are worth reading.
      await announceAssignment(ctx.db, {
        assignmentId: created.id,
        title: input.title,
        conceptId: input.conceptId,
        learnerIds: requested,
      });

      return { assignmentId: created.id, assigned: requested.length };
    }),

  /**
   * Marks one child's copy done.
   *
   * Scoped to the learner in the input, so completing an assignment cannot
   * complete it for the rest of the class.
   */
  markComplete: learnerProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ id: schema.assignmentTargets.id })
        .from(schema.assignmentTargets)
        .where(
          and(
            eq(schema.assignmentTargets.assignmentId, input.assignmentId),
            eq(schema.assignmentTargets.learnerId, ctx.learner.id),
          ),
        )
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That learner was not set this work.' });
      }

      await ctx.db
        .update(schema.assignmentTargets)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(schema.assignmentTargets.id, target.id));

      return { ok: true };
    }),
});

/**
 * The bell.
 *
 * Split by audience the way `analytics` and `assignments` are, rather than one
 * procedure taking an optional learner id. `forLearner` is built on
 * `learnerProcedure`, so the entitlement check runs before the handler and
 * cannot be forgotten; a single procedure branching on whether an argument was
 * passed would have to check by hand.
 */
const notificationsRouter = router({
  /** What the signed-in adult has been told. */
  forMe: protectedProcedure.query(({ ctx }) => notificationsForUser(ctx.db, ctx.user.id)),

  /** What one child has been told. */
  forLearner: learnerProcedure.query(({ ctx }) => notificationsForLearner(ctx.db, ctx.learner.id)),

  /**
   * Marks one read, or unread.
   *
   * Not elevated. A bell is not a child's record — the sentences in it were
   * written by this application about events the reader already knows about —
   * and requiring a PIN to dismiss a notification would train the household to
   * enter the PIN reflexively, which is the one thing a step-up must not become.
   */
  setRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive(), read: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await setNotificationRead(ctx.db, ctx.user.id, input.notificationId, input.read);
      if (!ok) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such notification.' });
      }
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => ({
    marked: await markAllRead(ctx.db, ctx.user.id),
  })),

  clear: protectedProcedure.mutation(async ({ ctx }) => ({
    cleared: await clearNotifications(ctx.db, ctx.user.id),
  })),
});

/**
 * Parental consent.
 *
 * Replaces `POST /api/auth/coppa-consent`, which wrote to `data_store.json`
 * against a hardcoded `'parent_sarah_1'` while this table went unwritten. The
 * application told a parent their consent was recorded, and it was not.
 *
 * Elevated, because it is a decision only the adult may make and the device is
 * shared with the children it concerns.
 */
const consentRouter = router({
  /**
   * The disclosure to display, and what the product can evidence about the
   * person agreeing to it.
   *
   * Served rather than imported by the client so the text shown and the text
   * hashed cannot drift across a half-finished deploy. Open to any signed-in
   * adult: it is the terms, not a child's record.
   */
  policy: protectedProcedure.query(() => ({
    version: CONSENT_POLICY_VERSION,
    clauses: CONSENT_POLICY_CLAUSES,
    summary: CONSENT_SUMMARY,
    verification: VERIFICATION_EXPLANATION,
  })),

  /** Where every child on the account stands. */
  forFamily: elevatedProcedure.query(({ ctx }) => consentForFamily(ctx.db, ctx.user.id)),

  /**
   * Whether one learner's practice may be recorded.
   *
   * `learnerProcedure`, not `elevatedProcedure`: this is read at the start of
   * every practice session, and a check that needed the parent's PIN each time
   * would be a check nobody runs. Setting consent is the elevated act;
   * consulting it is not — the same split as screen time, where the parent sets
   * the limit and the child's session merely obeys it.
   *
   * It answers the decision and nothing else. `forFamily` above returns the
   * attested name, the verified email, the policy version and whether a second
   * step was sent, all of which a guardian is entitled to and none of which a
   * practice session needs. `withdrawn` and `superseded` collapse into `none`
   * here: the session needs to know it may not record, not that a parent
   * withdrew — which is the guardian's business and not the business of whoever
   * is sitting at the device.
   */
  statusForLearner: learnerProcedure.query(({ ctx }) =>
    recordingPermission(ctx.db, ctx.learner.id),
  ),

  /**
   * Records a decision for every child on the account.
   *
   * The input carries no user id and no learner id. That is the point: the
   * hardcoded `'parent_sarah_1'` is not merely wrong here, it is
   * unrepresentable. The guardian comes from the session and the children from
   * the guardian.
   *
   * It also carries no policy hash. A client that supplies one can claim consent
   * to text that was never displayed, which would make the column look like
   * evidence while being the opposite.
   */
  record: elevatedProcedure
    .input(
      z
        .object({
          decision: z.enum(['granted', 'withdrawn']),
          attestedName: z.string().trim().min(2).max(200),
          policyVersion: z.string().min(1).max(32),
        })
        /*
         * `.strict()` so an unexpected field is refused rather than dropped.
         *
         * Zod strips unknown keys by default, which is safe — a client sending
         * `policySha256` would have it ignored and the server's own hash used.
         * But silently is the wrong way to be safe here: a caller sending a
         * policy hash is either confused about where it comes from or testing
         * whether it is honoured, and both are worth an error rather than a
         * success that quietly did something else.
         */
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordConsent(ctx.db, {
          guardianId: ctx.user.id,
          decision: input.decision,
          attestedName: input.attestedName,
          policyVersion: input.policyVersion,
        });
      } catch (error) {
        if (error instanceof StalePolicy) {
          // Their tab has been open across a deploy: they agreed to something
          // no longer on screen. Showing the current text and asking again is
          // the only honest option.
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        throw error;
      }
    }),

  /**
   * The hash of the disclosure this server holds.
   *
   * Exposed for the integrity gate, not for the client to send back.
   */
  policyHash: protectedProcedure.query(() => ({ sha256: currentPolicyHash() })),
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
        /**
         * Made by the client when the child answered, not when this was sent.
         *
         * Supplying one makes the call safe to repeat, which is what lets the
         * offline queue retry an item it is not sure was delivered. Without it a
         * retry moves mastery and the 3PL estimate a second time for one
         * question, and there is no way back to what they should have been.
         */
        clientId: z.string().trim().min(8).max(64).optional(),
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

      let result;
      try {
        result = await recordAttempt(ctx.db, {
          learnerId: ctx.learner.id,
          problemId: input.problemId,
          sessionId: input.sessionId ?? null,
          submittedAnswer: input.answer,
          responseTimeMs: input.responseTimeMs ?? null,
          wasOffline: input.wasOffline ?? false,
          clientId: input.clientId ?? null,
        });
      } catch (error) {
        if (error instanceof ConsentMissing) {
          /*
           * The gate lives on `recordAttempt`, not here, so a future writer
           * cannot be added that forgets it. This turns its refusal into
           * something a client can act on.
           *
           * FORBIDDEN rather than a silent success. A queued attempt that gets
           * a 200 it should not have is marked delivered and dropped; a refusal
           * the reconciler can see is one it stops retrying, which is the
           * correct outcome for an answer nobody is entitled to keep.
           */
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'No parental consent is recorded for this learner, so their practice ' +
              'cannot be stored. Practice itself is unaffected — it runs on this ' +
              'device and nothing is kept. Record consent with `consent.record`.',
          });
        }
        throw error;
      }

      const [problem] = await ctx.db
        .select({ explanation: schema.problems.explanation, answer: schema.problems.answer })
        .from(schema.problems)
        .where(eq(schema.problems.id, input.problemId))
        .limit(1);

      return {
        // True when this answer was already recorded and nothing was written.
        // The reconciler counts delivered items, not accepted ones, so it needs
        // to tell the two apart.
        replayed: result.replayed,
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
  analytics: analyticsRouter,
  assignments: assignmentsRouter,
  curriculum: curriculumRouter,
  notifications: notificationsRouter,
  consent: consentRouter,
});

export type AppRouter = typeof appRouter;
