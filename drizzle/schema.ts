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
  decimal,
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

    /**
     * The PIN that separates the adult who signed in from the child now holding
     * the device.
     *
     * Signing in is not the question this answers. A guardian signs in once on
     * the family tablet and leaves it signed in — which is the point, and also
     * why reaching their child's analytics, screen-time controls and data export
     * needs a second, deliberate step.
     *
     * scrypt, with the parameters recorded in the value itself. A four-digit PIN
     * is ten thousand possibilities and no key derivation makes that strong; the
     * defence that matters is the lockout below, because the attacker here is a
     * nine-year-old trying birthdays rather than someone holding the database.
     */
    stepUpPinHash: varchar('step_up_pin_hash', { length: 255 }),
    stepUpPinSetAt: timestamp('step_up_pin_set_at'),
    /** Reset on success. Drives the lockout that makes a short PIN defensible. */
    stepUpFailedAttempts: smallint('step_up_failed_attempts').notNull().default(0),
    stepUpLockedUntil: timestamp('step_up_locked_until'),
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

/**
 * Sign-in links, as hashes.
 *
 * The token itself is never stored. A magic link is a bearer credential for the
 * lifetime of the email that carries it, and a database of live ones is a
 * database of ways into other people's children's records. What is kept is a
 * SHA-256 of the token, which verifies a presented link and cannot produce one.
 *
 * `consumedAt` makes a link single-use. Without it a link sitting in a mailbox —
 * or in a mail provider's link-scanner, or a shared family inbox — stays a valid
 * credential until it expires.
 */
export const magicLinkTokens = mysqlTable(
  'magic_link_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    /**
     * Stored alongside the hash so a request can be rate-limited per address,
     * and so consuming a link can find or create the account it belongs to.
     */
    email: varchar('email', { length: 320 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    /** For rate limiting and for showing a parent where a link was requested. */
    requestedFromIp: varchar('requested_from_ip', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('magic_link_hash_idx').on(table.tokenHash),
    index('magic_link_email_idx').on(table.email, table.createdAt),
  ],
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
     * The id this problem had in the corpus it was imported from, or null for a
     * generated one. It is what makes a re-import idempotent: the seed can tell
     * a problem it already wrote from one it has not seen, without comparing
     * prose. MySQL permits repeated NULLs in a unique index, so generated rows
     * are unaffected by the constraint.
     */
    externalId: varchar('external_id', { length: 120 }),
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
    /**
     * Authoring metadata, carried by imported content and null on generated
     * items. `problemType` and `interleaved` are what a future retrieval
     * schedule would read to mix transfer items into a practice run; discarding
     * them at import would mean re-deriving pedagogy the authors already stated.
     */
    problemType: varchar('problem_type', { length: 40 }),
    cognitiveLoad: smallint('cognitive_load'),
    contextLabel: varchar('context_label', { length: 120 }),
    variantIndex: smallint('variant_index'),
    interleaved: boolean('interleaved').notNull().default(false),
    /**
     * The expression an independent checker verified this answer with, kept as
     * provenance. It is not re-evaluated at runtime — the import gate is where
     * that happens — but an answer nobody can trace back to a check is exactly
     * the kind of content this project stopped trusting.
     */
    verificationExpression: text('verification_expression'),

    /**
     * 3PL item parameters. Null on authored items not yet calibrated.
     *
     * DECIMAL rather than a string, so the precision is a fact about the column
     * instead of a convention each writer has to remember. These began as
     * `varchar(12)` and the generator promptly produced an item difficulty of
     * `-0.29000000000000004` — twenty characters of binary floating-point noise
     * from `-0.2 + theta * 0.3` — which the insert rejected outright. Three
     * decimal places is already finer than any of these parameters is known to.
     *
     * Drizzle returns DECIMAL as a string, which is the point: it cannot drift
     * back into a float on the way out.
     */
    irtDiscrimination: decimal('irt_discrimination', { precision: 5, scale: 3 }),
    irtDifficulty: decimal('irt_difficulty', { precision: 6, scale: 3 }),
    irtPseudoGuessing: decimal('irt_pseudo_guessing', { precision: 4, scale: 3 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('problems_concept_idx').on(table.conceptId),
    index('problems_source_idx').on(table.source),
    uniqueIndex('problems_external_idx').on(table.externalId),
  ],
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
    /**
     * What the learner appears to be experiencing — `confusion`, `slip`,
     * `partial-understanding` and so on. The imported library is retrieved on
     * this together with the scaffold level, so importing without it would land
     * 572 hints that nothing can select between.
     */
    cognitiveState: varchar('cognitive_state', { length: 40 }),
    /** Presentational: `concrete-example`, `question-prompt`, and similar. */
    hintStyle: varchar('hint_style', { length: 40 }),
    difficultyLevel: smallint('difficulty_level'),
    /** Only `verified` hints are ever shown; the column is the gate. */
    verified: boolean('verified').notNull().default(false),
  },
  table => [
    index('hints_concept_idx').on(table.conceptId, table.scaffoldLevel),
    index('hints_state_idx').on(table.conceptId, table.cognitiveState),
  ],
);

/**
 * Which errors a hint addresses.
 *
 * A hint commonly targets two, so this is a table rather than a column. It is
 * what lets a wrong answer diagnosed as a particular misconception retrieve the
 * hint written for exactly that misconception, instead of a generic one for the
 * concept.
 */
export const hintErrorModes = mysqlTable(
  'hint_error_modes',
  {
    id: int('id').autoincrement().primaryKey(),
    hintId: int('hint_id')
      .notNull()
      .references(() => hints.id, { onDelete: 'cascade' }),
    errorMode: varchar('error_mode', { length: 60 }).notNull(),
  },
  table => [uniqueIndex('hint_error_mode_idx').on(table.hintId, table.errorMode)],
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
 * Theta and the standard error are DECIMAL, not float: they are compared for
 * convergence, and binary floating point makes that comparison unreliable.
 * Drizzle returns DECIMAL as a string, which also stops a `number` cast
 * appearing later and quietly reintroducing the drift.
 *
 * The scales are the precision these values are actually known to. Theta is
 * clamped to [-3, 3] and rounded to three places by `AdaptiveEngine`; storing
 * more would be recording noise as though it were measurement.
 */
export const learnerAbility = mysqlTable(
  'learner_ability',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    theta: decimal('theta', { precision: 6, scale: 3 }).notNull().default('0'),
    standardError: decimal('standard_error', { precision: 5, scale: 3 }).notNull().default('0.85'),
    dynamicLevel: decimal('dynamic_level', { precision: 4, scale: 2 }).notNull().default('5.5'),
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
    theta: decimal('theta', { precision: 6, scale: 3 }).notNull(),
    standardError: decimal('standard_error', { precision: 5, scale: 3 }).notNull(),
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
// Notifications
// ---------------------------------------------------------------------------

/**
 * Something that happened, addressed to whoever should know about it.
 *
 * ## Recipient and subject are different columns
 *
 * `userId` and `learnerId` are *who reads it*, and exactly one is set. Both
 * audiences want different sentences about the same event — the child is told
 * "You have mastered Number Bonds", their guardian is told "Maya has mastered
 * Number Bonds" — so one event writes two rows rather than one row whose wording
 * is chosen at render time. Sharing a row would also share the read flag, so a
 * parent opening the bell would mark the child's copy read.
 *
 * `aboutLearnerId` is *who it concerns*, set on both rows. Without it the
 * guardian's copy has no machine-readable link to the child it is about, and
 * "has this milestone already been raised" cannot be asked once for both rows.
 *
 * ## Why there is no unique index enforcing "once"
 *
 * The obvious guard — unique on `(learnerId, conceptId, type)` — is wrong twice
 * over. It would stop a teacher setting a second assignment on the same concept
 * to the same child, and MySQL treats NULLs as distinct, so the guardian's copy
 * (whose `learnerId` is null) would slip past it and duplicate anyway.
 * `raiseMasteryMilestone` asks whether one already exists instead. Two attempts
 * by the same child on the same concept at the same instant could still race
 * past that, which would produce one duplicate congratulation and nothing worse.
 */
export const notifications = mysqlTable(
  'notifications',
  {
    id: int('id').autoincrement().primaryKey(),
    /** The adult who reads it. Null when this copy is addressed to a child. */
    userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** The child who reads it. Null when this copy is addressed to an adult. */
    learnerId: int('learner_id').references(() => learners.id, { onDelete: 'cascade' }),
    /** The child it is about, on both copies. */
    aboutLearnerId: int('about_learner_id').references(() => learners.id, { onDelete: 'cascade' }),
    /**
     * `streak`, `reward` and `sync` exist in the front-end type and have no
     * producer: nothing writes `learner_rewards`, and the offline queue is
     * Graft D. They are absent here rather than present and unused, so adding
     * one is a migration and a decision rather than an oversight.
     */
    type: mysqlEnum('type', ['milestone', 'assignment']).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    conceptId: varchar('concept_id', { length: 120 }).references(() => concepts.id, {
      onDelete: 'cascade',
    }),
    assignmentId: int('assignment_id').references(() => assignments.id, { onDelete: 'cascade' }),
    /** Null while unread. A timestamp rather than a flag, so "when" survives. */
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('notifications_user_idx').on(table.userId, table.createdAt),
    index('notifications_learner_idx').on(table.learnerId, table.createdAt),
    index('notifications_about_idx').on(table.aboutLearnerId, table.type),
  ],
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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
