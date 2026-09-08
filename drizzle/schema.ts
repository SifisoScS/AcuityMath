/**
 * The AcuityMath relational model.
 *
 * Two decisions shape everything below, and both are departures from the donor
 * engine this schema borrows its learning tables from.
 *
 * **A guardian has many learners.** The engine modelled one learner per account
 * — `learnerProfiles.userId` was `.unique()` — and every learning table keyed on
 * `userId` as a result. In that world "the account" and "the child" are the same
 * row and nothing distinguishes them. Here they are separate: adults sign in and
 * children do not, one parent holds four children, and every learning table
 * keys on `learnerId`. Re-keying later would touch a dozen tables and every
 * query that reads them, which is why it happens now, before there is any data.
 *
 * **Foreign keys are declared.** The engine has none, which is why it needs a
 * standing integrity gate to catch orphaned rows — 500 problems once pointed at
 * lessons that did not exist and reviewed clean. Declaring the constraints moves
 * that check from a test suite into the storage engine, where it cannot be
 * forgotten. The generator integrity gate from Graft A still exists; it now
 * guards content correctness rather than referential sanity.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Everyone who authenticates. Parents, teachers and administrators — never a
 * child. A learner has no row here and no credentials of their own; see
 * `learners` and `learnerAccessTokens`.
 */
export const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 200 }),
    role: mysqlEnum('role', ['parent', 'teacher', 'admin']).notNull().default('parent'),
    /** Set when the account is created by an institution rather than self-serve. */
    institutionId: int('institution_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    lastSignedInAt: timestamp('last_signed_in_at'),
  },
  table => [uniqueIndex('users_email_idx').on(table.email)],
);

/**
 * A child. Belongs to exactly one guardian and cannot exist without one, which
 * is what makes the COPPA story coherent: there is no path to a learner record
 * that does not pass through a consenting adult.
 *
 * `guardianId` is deliberately **not** unique. That single word is the whole
 * difference between this schema and the one it borrows from.
 */
export const learners = mysqlTable(
  'learners',
  {
    id: int('id').autoincrement().primaryKey(),
    guardianId: int('guardian_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    /**
     * Year of birth rather than age: an age column is wrong within a year of
     * being written, and a child who ages into the next tier mid-term should
     * move without anyone editing a row.
     */
    birthYear: smallint('birth_year').notNull(),
    avatar: varchar('avatar', { length: 16 }).notNull().default('🌱'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    /** Soft delete: a COPPA deletion request must not orphan a teacher's roster. */
    archivedAt: timestamp('archived_at'),
  },
  table => [index('learners_guardian_idx').on(table.guardianId)],
);

/**
 * How a child selects themselves once a guardian is already signed in.
 *
 * These are **not credentials**. A PIN, a QR badge or a picture sequence
 * resolves a learner *within* an authenticated guardian session; none of them
 * can start one. Storing them alongside `users` would invite exactly the
 * confusion this separation exists to prevent.
 */
export const learnerAccessTokens = mysqlTable(
  'learner_access_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    kind: mysqlEnum('kind', ['pin', 'qr_badge', 'picture_sequence']).notNull(),
    /** Hashed, never the value itself — a QR badge is printed and can be lost. */
    secretHash: varchar('secret_hash', { length: 128 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  table => [
    index('learner_access_learner_idx').on(table.learnerId),
    uniqueIndex('learner_access_kind_idx').on(table.learnerId, table.kind),
  ],
);

/**
 * Verifiable parental consent, as a log rather than a flag.
 *
 * A boolean on `learners` would answer "is consent granted" and nothing else.
 * COPPA obliges an operator to show *when* consent was given, by what method,
 * and whether it was later withdrawn, so each decision is its own row and the
 * current state is the most recent one.
 */
export const consentEvents = mysqlTable(
  'consent_events',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    grantedByUserId: int('granted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decision: mysqlEnum('decision', ['granted', 'withdrawn']).notNull(),
    method: mysqlEnum('method', ['credit_card_auth', 'email_plus_verification', 'signed_form', 'institutional_agreement']).notNull(),
    /** Typed name or reference to the signed artifact, per the method used. */
    evidence: varchar('evidence', { length: 500 }),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  },
  table => [index('consent_learner_idx').on(table.learnerId, table.recordedAt)],
);

// ---------------------------------------------------------------------------
// Classrooms
// ---------------------------------------------------------------------------

/**
 * A teacher's group. Separate from guardianship: the adult who teaches a child
 * is not the adult who consents for them, and conflating the two would let a
 * roster import grant data rights a parent never gave.
 */
export const classrooms = mysqlTable(
  'classrooms',
  {
    id: int('id').autoincrement().primaryKey(),
    teacherId: int('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [index('classrooms_teacher_idx').on(table.teacherId)],
);

export const classroomLearners = mysqlTable(
  'classroom_learners',
  {
    id: int('id').autoincrement().primaryKey(),
    classroomId: int('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'cascade' }),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  },
  table => [uniqueIndex('classroom_learner_idx').on(table.classroomId, table.learnerId)],
);

// ---------------------------------------------------------------------------
// Curriculum
// ---------------------------------------------------------------------------

/**
 * A teachable idea. The unit mastery is tracked against.
 *
 * `ageBandLow`/`ageBandHigh` are what let a three-year-old's parent see a map of
 * counting rather than of fractions. The donor engine had no such column and
 * drew all 51 concepts for every learner.
 */
export const concepts = mysqlTable(
  'concepts',
  {
    /** Stable slug, e.g. `counting-to-five`. Referenced by generated content. */
    id: varchar('id', { length: 120 }).primaryKey(),
    strand: varchar('strand', { length: 80 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    tier: mysqlEnum('tier', ['early', 'elementary', 'middle', 'high']).notNull(),
    ageBandLow: smallint('age_band_low').notNull(),
    ageBandHigh: smallint('age_band_high').notNull(),
    standardCode: varchar('standard_code', { length: 60 }),
    sortOrder: int('sort_order').notNull().default(0),
  },
  table => [index('concepts_tier_idx').on(table.tier), index('concepts_strand_idx').on(table.strand)],
);

/**
 * The prerequisite DAG, as edges. A goal roadmap is a walk over this table.
 */
export const conceptPrerequisites = mysqlTable(
  'concept_prerequisites',
  {
    id: int('id').autoincrement().primaryKey(),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    prerequisiteId: varchar('prerequisite_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
  },
  table => [uniqueIndex('concept_prereq_idx').on(table.conceptId, table.prerequisiteId)],
);

/**
 * A question. Authored problems are seeded; generated ones are written here when
 * a learner is served one, so an attempt always references a problem that can be
 * shown again in a review.
 */
export const problems = mysqlTable(
  'problems',
  {
    id: int('id').autoincrement().primaryKey(),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    /**
     * `generated` rows come from `ProblemGenerator` and carry the seed that
     * produced them, so a question a learner saw can be reproduced exactly.
     */
    source: mysqlEnum('source', ['authored', 'generated']).notNull(),
    generatorKind: varchar('generator_kind', { length: 40 }),
    prompt: text('prompt').notNull(),
    answer: varchar('answer', { length: 200 }).notNull(),
    answerType: mysqlEnum('answer_type', ['numeric', 'multiple_choice', 'text']).notNull().default('multiple_choice'),
    /** The offered options, in the order they were shown. */
    choices: json('choices').$type<string[]>(),
    explanation: text('explanation').notNull(),
    hint: text('hint').notNull(),
    difficulty: smallint('difficulty').notNull().default(5),
    /**
     * A drawable picture as a JSON payload, never raw markup. Borrowed from the
     * donor engine's reasoning: SVG in a text column means
     * `dangerouslySetInnerHTML` and an XSS surface in an app used by children.
     */
    visual: json('visual').$type<Record<string, unknown>>(),
    /** 3PL item parameters. Null on authored items not yet calibrated. */
    irtDiscrimination: varchar('irt_discrimination', { length: 12 }),
    irtDifficulty: varchar('irt_difficulty', { length: 12 }),
    irtPseudoGuessing: varchar('irt_pseudo_guessing', { length: 12 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [index('problems_concept_idx').on(table.conceptId), index('problems_source_idx').on(table.source)],
);

/**
 * Which wrong option means which misconception.
 *
 * One row per distractor rather than a JSON blob on `problems`, because the
 * diagnostic question a teacher asks — "which of my class is making sign errors"
 * — is a group-by over this table and an unindexable scan over the blob.
 */
export const problemDistractors = mysqlTable(
  'problem_distractors',
  {
    id: int('id').autoincrement().primaryKey(),
    problemId: int('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    value: varchar('value', { length: 200 }).notNull(),
    misconceptionCode: varchar('misconception_code', { length: 60 }).notNull(),
  },
  table => [uniqueIndex('problem_distractor_idx').on(table.problemId, table.value)],
);

/** Verified hints, tagged for retrieval by cognitive state and scaffold level. */
export const hints = mysqlTable(
  'hints',
  {
    id: int('id').autoincrement().primaryKey(),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    misconceptionCode: varchar('misconception_code', { length: 60 }),
    scaffoldLevel: smallint('scaffold_level').notNull().default(1),
    /** Only `verified` hints are ever shown; the column is the gate. */
    verified: boolean('verified').notNull().default(false),
  },
  table => [index('hints_concept_idx').on(table.conceptId, table.scaffoldLevel)],
);

// ---------------------------------------------------------------------------
// Practice and mastery — all keyed on learnerId
// ---------------------------------------------------------------------------

export const practiceSessions = mysqlTable(
  'practice_sessions',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    /**
     * How many questions this session was meant to hold. The donor engine kept
     * this only on the client, so a parent's "questions per session" setting was
     * a client-side override of a client-side value and the server could not
     * report whether a session was finished or abandoned.
     */
    targetLength: smallint('target_length').notNull().default(8),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => [index('sessions_learner_idx').on(table.learnerId, table.startedAt)],
);

export const attempts = mysqlTable(
  'attempts',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    sessionId: int('session_id').references(() => practiceSessions.id, { onDelete: 'set null' }),
    problemId: int('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'restrict' }),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    submittedAnswer: varchar('submitted_answer', { length: 200 }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    /** Resolved from `problem_distractors` at submission, so it survives edits. */
    misconceptionCode: varchar('misconception_code', { length: 60 }),
    responseTimeMs: int('response_time_ms'),
    /** True when the attempt was queued offline and reconciled later. */
    wasOffline: boolean('was_offline').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('attempts_learner_idx').on(table.learnerId, table.createdAt),
    index('attempts_concept_idx').on(table.learnerId, table.conceptId),
    index('attempts_session_idx').on(table.sessionId),
  ],
);

/** Running mastery per concept. One row per learner-concept pair. */
export const learnerConceptMastery = mysqlTable(
  'learner_concept_mastery',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    masteryScore: smallint('mastery_score').notNull().default(0),
    accuracy: smallint('accuracy').notNull().default(0),
    attemptCount: int('attempt_count').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('mastery_learner_concept_idx').on(table.learnerId, table.conceptId)],
);

/**
 * Mastery over time, for the 7/30/90-day charts.
 *
 * Kept as a running total written on each attempt rather than recomputed from
 * `attempts`. The donor engine recomputed from raw attempts capped at 180, so a
 * concept mastered months ago eventually read as a confident zero and a finished
 * prerequisite was marked unfinished on the goal roadmap.
 */
export const conceptMasteryHistory = mysqlTable(
  'concept_mastery_history',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    conceptId: varchar('concept_id', { length: 120 })
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    masteryScore: smallint('mastery_score').notNull(),
    accuracy: smallint('accuracy').notNull(),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  },
  table => [index('mastery_history_idx').on(table.learnerId, table.conceptId, table.recordedAt)],
);

/**
 * The learner's current 3PL ability estimate — the state `AdaptiveEngine` reads
 * and writes.
 *
 * Theta and the standard error are stored as strings to avoid binary floating
 * point drifting a value that is compared for convergence. MySQL DECIMAL through
 * Drizzle returns a string anyway; making that explicit stops a `number` cast
 * appearing later and quietly reintroducing the drift.
 */
export const learnerAbility = mysqlTable(
  'learner_ability',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    theta: varchar('theta', { length: 12 }).notNull().default('0'),
    standardError: varchar('standard_error', { length: 12 }).notNull().default('0.85'),
    dynamicLevel: varchar('dynamic_level', { length: 8 }).notNull().default('5.5'),
    eloRating: int('elo_rating').notNull().default(1200),
    historyCount: int('history_count').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('ability_learner_idx').on(table.learnerId)],
);

/** Ability over time. What the parent dashboard's growth chart reads. */
export const learnerAbilityHistory = mysqlTable(
  'learner_ability_history',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    theta: varchar('theta', { length: 12 }).notNull(),
    standardError: varchar('standard_error', { length: 12 }).notNull(),
    eloRating: int('elo_rating').notNull(),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  },
  table => [index('ability_history_idx').on(table.learnerId, table.recordedAt)],
);

/**
 * How often each misconception has been observed.
 *
 * A counter table rather than a JSON map on the learner: the map was fine for a
 * single child in browser state, but "which misconceptions are common in this
 * classroom" is the question a teacher dashboard exists to answer.
 */
export const learnerMisconceptions = mysqlTable(
  'learner_misconceptions',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    misconceptionCode: varchar('misconception_code', { length: 60 }).notNull(),
    observedCount: int('observed_count').notNull().default(0),
    lastObservedAt: timestamp('last_observed_at'),
  },
  table => [uniqueIndex('misconception_learner_idx').on(table.learnerId, table.misconceptionCode)],
);

// ---------------------------------------------------------------------------
// Guardian controls
// ---------------------------------------------------------------------------

/**
 * Screen-time limits, set by a guardian and enforced server-side.
 *
 * Enforcement has to live here rather than in the client: the current version
 * keeps the counter in browser state, where the child it restricts can clear it.
 */
export const screenTimeRules = mysqlTable(
  'screen_time_rules',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    dailyLimitMinutes: smallint('daily_limit_minutes').notNull().default(45),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('screen_time_learner_idx').on(table.learnerId)],
);

/** Minutes used, per learner per day. The heartbeat writes here. */
export const screenTimeUsage = mysqlTable(
  'screen_time_usage',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    /**
     * Calendar day in the guardian's timezone, resolved at write time.
     *
     * `mode: 'string'` because this is a date and not an instant. Drizzle's
     * default maps DATE onto a JS `Date`, which carries a time and a zone, and
     * a screen-time day that shifts by an hour when the server moves is the
     * classic form of that bug.
     */
    day: date('day', { mode: 'string' }).notNull(),
    minutesSpent: smallint('minutes_spent').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('screen_time_day_idx').on(table.learnerId, table.day)],
);

// ---------------------------------------------------------------------------
// Assignments and rewards
// ---------------------------------------------------------------------------

export const assignments = mysqlTable(
  'assignments',
  {
    id: int('id').autoincrement().primaryKey(),
    assignedByUserId: int('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    classroomId: int('classroom_id').references(() => classrooms.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    conceptId: varchar('concept_id', { length: 120 }).references(() => concepts.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    rewardCoins: smallint('reward_coins').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [index('assignments_author_idx').on(table.assignedByUserId)],
);

/**
 * One row per learner an assignment was given to.
 *
 * The current model stores a `targetStudentId` that may be the string `'all'`,
 * which cannot be a foreign key and cannot answer "who has not finished".
 */
export const assignmentTargets = mysqlTable(
  'assignment_targets',
  {
    id: int('id').autoincrement().primaryKey(),
    assignmentId: int('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    status: mysqlEnum('status', ['pending', 'completed']).notNull().default('pending'),
    completedAt: timestamp('completed_at'),
  },
  table => [uniqueIndex('assignment_target_idx').on(table.assignmentId, table.learnerId)],
);

/** Coins, XP and streaks. Gamification state, kept apart from mastery. */
export const learnerRewards = mysqlTable(
  'learner_rewards',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    coins: int('coins').notNull().default(0),
    xp: int('xp').notNull().default(0),
    streakDays: smallint('streak_days').notNull().default(0),
    streakShields: smallint('streak_shields').notNull().default(0),
    lastPracticedOn: date('last_practiced_on', { mode: 'string' }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('rewards_learner_idx').on(table.learnerId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  learners: many(learners),
  classrooms: many(classrooms),
  assignments: many(assignments),
}));

export const learnersRelations = relations(learners, ({ one, many }) => ({
  guardian: one(users, { fields: [learners.guardianId], references: [users.id] }),
  ability: one(learnerAbility),
  rewards: one(learnerRewards),
  screenTimeRule: one(screenTimeRules),
  attempts: many(attempts),
  sessions: many(practiceSessions),
  conceptMastery: many(learnerConceptMastery),
  consentEvents: many(consentEvents),
  classroomLinks: many(classroomLearners),
}));

export const conceptsRelations = relations(concepts, ({ many }) => ({
  problems: many(problems),
  hints: many(hints),
  prerequisites: many(conceptPrerequisites),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  concept: one(concepts, { fields: [problems.conceptId], references: [concepts.id] }),
  distractors: many(problemDistractors),
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  learner: one(learners, { fields: [attempts.learnerId], references: [learners.id] }),
  problem: one(problems, { fields: [attempts.problemId], references: [problems.id] }),
  session: one(practiceSessions, { fields: [attempts.sessionId], references: [practiceSessions.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Learner = typeof learners.$inferSelect;
export type NewLearner = typeof learners.$inferInsert;
export type Concept = typeof concepts.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type LearnerAbility = typeof learnerAbility.$inferSelect;
