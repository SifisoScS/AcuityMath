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

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
// Institutions
// ---------------------------------------------------------------------------

/**
 * A district, or whatever body holds the agreement.
 *
 * `users.institution_id` has existed since B1 as a nullable int **referencing
 * nothing** — a hook for a table that was never built. This is that table, and
 * the column becomes a real foreign key with it.
 *
 * **Nullable everywhere it is referenced, on purpose.** A family that signs up
 * on its own has no institution, and that is the product's foundation rather
 * than a degraded case. Institutional accounts are a layer on top; nothing below
 * may require one.
 *
 * There is no soft delete here yet. `learners` has `archivedAt` because a COPPA
 * deletion request must not orphan a teacher's roster; the equivalent question
 * for a district — what happens to a school's learners when the district leaves
 * — is a policy decision nobody has taken, so the foreign keys restrict rather
 * than cascade and the question has to be answered before a row can be removed.
 */
export const institutions = mysqlTable(
  'institutions',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    /** Stable, human-readable, and used in URLs before it is used in anything else. */
    slug: varchar('slug', { length: 80 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('institution_slug_idx').on(table.slug)],
);

/**
 * A campus within a district.
 *
 * Separate from `institutions` because the agreement, the administrator and the
 * data protection terms sit at district level, while rosters, classrooms and
 * reporting sit at campus level. Collapsing them would make "every school in the
 * district" a query nobody can write.
 */
export const schools = mysqlTable(
  'schools',
  {
    id: int('id').autoincrement().primaryKey(),
    institutionId: int('institution_id')
      .notNull()
      /*
       * `restrict`, not `cascade`. Removing a district must not silently delete
       * its campuses and, through them, reach children's records. Whoever
       * removes one has to empty it first, deliberately.
       */
      .references(() => institutions.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index('schools_institution_idx').on(table.institutionId),
    // A district cannot hold two campuses of the same name; across districts it
    // is ordinary — "Lincoln Elementary" exists in most of them.
    uniqueIndex('school_name_idx').on(table.institutionId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// LTI 1.3
// ---------------------------------------------------------------------------

/**
 * The signing keys this platform publishes to learning management systems.
 *
 * An LMS verifies our messages against a JWKS document it fetches from us and
 * **caches**, often for hours. That cache is the whole reason this is a table
 * rather than a pair of environment variables: a key has to be *published*
 * before it is *used*, or every message signed with it is rejected until the
 * platform happens to re-fetch.
 *
 * So rotation is two steps, not one. A new key is created and appears in the
 * JWKS immediately, signing nothing. Once platforms have had time to see it, it
 * is promoted and the old one keeps being published until its signatures have
 * aged out. `retiredAt` is when a key leaves the document, which is later than
 * when it stops signing.
 *
 * **The private key sits in this table**, and its protection is the database's
 * and the host's. There is no at-rest encryption in this repository — recorded
 * in `docs/privacy/DATA_MAP.md` §8 and a Track A item — and this is the row that
 * makes it matter most: anyone holding it can sign messages as this platform.
 */
export const ltiKeys = mysqlTable(
  'lti_keys',
  {
    id: int('id').autoincrement().primaryKey(),
    /** The `kid` in every JWT header, so a platform knows which key to verify with. */
    kid: varchar('kid', { length: 64 }).notNull(),
    publicJwk: json('public_jwk').notNull(),
    privatePem: text('private_pem').notNull(),
    /** Exactly one key signs at a time; the rest are published or retired. */
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    activatedAt: timestamp('activated_at'),
    /** When it left the JWKS. Null while still published. */
    retiredAt: timestamp('retired_at'),
  },
  table => [uniqueIndex('lti_key_kid_idx').on(table.kid)],
);

/**
 * A learning management system we have been registered with.
 *
 * LTI identifies a registration by **issuer and client id together**, and both
 * halves are load-bearing. One Canvas instance issues many client ids — a
 * district may install this product twice — and one client id string says
 * nothing on its own, because two unrelated platforms may both hand out `10001`.
 * The unique index is on the pair for that reason, and the lookup matches on the
 * pair plus a deployment.
 *
 * `keysetUrl` is *their* JWKS, the mirror of the one C1 publishes: they verify
 * our messages with ours, we verify theirs with this.
 */
export const ltiPlatforms = mysqlTable(
  'lti_platforms',
  {
    id: int('id').autoincrement().primaryKey(),
    /** The platform's `iss`, exactly as it appears in their tokens. */
    issuer: varchar('issuer', { length: 255 }).notNull(),
    /** The client id **they** assigned to us. */
    clientId: varchar('client_id', { length: 255 }).notNull(),
    /** For humans reading an admin list; never used for matching. */
    name: varchar('name', { length: 200 }).notNull(),
    /** Where a launch is redirected to begin OIDC. */
    authLoginUrl: varchar('auth_login_url', { length: 500 }).notNull(),
    /** Where service calls exchange a client assertion for an access token. */
    authTokenUrl: varchar('auth_token_url', { length: 500 }).notNull(),
    /** Their public keyset, for verifying the tokens they send us. */
    keysetUrl: varchar('keyset_url', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex('lti_platform_idx').on(table.issuer, table.clientId)],
);

/**
 * One installation of this product inside a platform, bound to one district.
 *
 * This is where LTI meets Graft B. A launch arrives carrying an issuer, a client
 * id and a deployment id, and this row is what turns those three strings into
 * "which of our institutions is this". Without it a launch knows a learner
 * exists and has nowhere to put them.
 *
 * `institutionId` is **not null**, deliberately. A deployment with no district
 * is a row that cannot be used for anything, and B2 spent its time on what
 * happens when a scope column is null — the safe answer there was "reaches
 * nothing", and the safe answer here is "cannot be registered at all".
 */
export const ltiDeployments = mysqlTable(
  'lti_deployments',
  {
    id: int('id').autoincrement().primaryKey(),
    platformId: int('platform_id')
      .notNull()
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' }),
    /** The `deployment_id` claim, unique only within its platform. */
    deploymentId: varchar('deployment_id', { length: 255 }).notNull(),
    institutionId: int('institution_id')
      .notNull()
      /*
       * `restrict`. A district cannot be removed while a platform is still
       * launching learners into it — the launches would keep arriving and have
       * nowhere to go.
       */
      .references(() => institutions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('lti_deployment_idx').on(table.platformId, table.deploymentId),
    index('lti_deployment_institution_idx').on(table.institutionId),
  ],
);

/**
 * A course at a platform, and where its roster can be read.
 *
 * A launch is the **only** moment a platform tells us the memberships URL — it
 * arrives as a claim in the token and appears nowhere else. A roster sync runs
 * later, on a schedule or when a teacher asks, with no launch in hand, so the
 * URL has to be kept when it is offered or the sync has nothing to call.
 *
 * Keyed on the deployment rather than the platform. A context id is unique
 * within an installation, and one platform can host two installations for two
 * districts — so keying on the platform alone would let one district's course
 * collide with another's, which is a roster of the wrong children.
 *
 * `membershipsUrl` is nullable because the claim is optional: a district that
 * has not granted the Names and Roles scope launches perfectly well and simply
 * cannot be synchronised. That is a configuration, not a fault, and nothing may
 * treat its absence as one.
 */
export const ltiContexts = mysqlTable(
  'lti_contexts',
  {
    id: int('id').autoincrement().primaryKey(),
    deploymentId: int('deployment_id')
      .notNull()
      .references(() => ltiDeployments.id, { onDelete: 'cascade' }),
    /** The platform's own id for the course. Opaque, and unique per deployment. */
    contextId: varchar('context_id', { length: 255 }).notNull(),
    /** For an administrator reading a list. Never used for matching. */
    title: varchar('title', { length: 255 }),
    membershipsUrl: varchar('memberships_url', { length: 1000 }),
    /**
     * The year group this course is for, as the placement declared it.
     *
     * **No roster carries a birth date**, and a sync has no launch in hand to
     * read the custom parameters from — so the year a launch worked out is kept
     * here, on the course it belongs to, which is also the right granularity: a
     * Year 4 link and a Year 6 link are different placements.
     *
     * Null until some launch has resolved one. A sync for a course with no
     * remembered year creates nobody and says why, rather than inventing an age
     * for a child, which is the same refusal C3f makes at the launch itself.
     */
    defaultBirthYear: smallint('default_birth_year'),
    /**
     * Where a gradebook column for this course can be created.
     *
     * Like the roster URL, a launch is the only moment a platform says it, and
     * null is ordinary: a district that has not granted the line-item scope
     * launches perfectly well and simply has no gradebook integration.
     */
    lineItemsUrl: varchar('line_items_url', { length: 1000 }),
    /**
     * The classroom this course maps to, once a sync has made one.
     *
     * Null until then, because a classroom needs a teacher and a teacher has to
     * have opened the tool at least once. `set null` on delete: a teacher
     * removing a class here should not take the course record with it, and the
     * next sync makes a fresh one rather than failing on a dangling id.
     */
    classroomId: int('classroom_id').references(() => classrooms.id, {
      onDelete: 'set null',
    }),
    /**
     * When a sync last completed. Null means never.
     *
     * Recorded rather than inferred from the rows a sync wrote, because a sync
     * that legitimately changed nothing is indistinguishable from one that never
     * ran if the only evidence is its effects.
     */
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex('lti_context_idx').on(table.deploymentId, table.contextId),
  ],
);

/**
 * That a child was deleted, and nothing about who they were.
 *
 * A deletion request has to leave **something** behind, and choosing what is the
 * whole design. A district that asked for a pupil's erasure may later need to
 * show they asked; this product may need to show it complied. Neither of those
 * needs the child's name, their answers, or their guardian's address — and
 * keeping any of it would make "deletion" a word rather than an act.
 *
 * So this row holds a number that no longer resolves to anybody, when it
 * happened, and which adult asked. `learnerId` is deliberately **not** a foreign
 * key: the row it named is gone, which is the point, and a constraint would
 * either forbid that or drag this record down with it.
 */
export const learnerDeletions = mysqlTable(
  'learner_deletions',
  {
    id: int('id').autoincrement().primaryKey(),
    /** The id the child had. It resolves to nothing now, by design. */
    learnerId: int('learner_id').notNull(),
    /**
     * The district they belonged to, when they belonged to one.
     *
     * `restrict`, so a district cannot be removed while records of the children
     * it erased still name it — somebody has to answer for those requests.
     */
    institutionId: int('institution_id').references(() => institutions.id, {
      onDelete: 'restrict',
    }),
    /**
     * Who asked. `set null` rather than `restrict`: an administrator who leaves
     * should not be un-deletable because of requests they once made, and the
     * snapshot below is what keeps the record legible after they are gone.
     */
    requestedByUserId: int('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Snapshotted, because `users.email` changes and this row must not. */
    requestedByEmail: varchar('requested_by_email', { length: 320 }).notNull(),
    /**
     * How many rows went, by table, as JSON.
     *
     * A receipt. "We deleted a child" is not checkable afterwards; "we removed
     * 412 attempts, 31 sessions and 6 consent events" is, and it is the only
     * evidence left that the cascades did what they were supposed to.
     */
    removedCounts: json('removed_counts').notNull(),
    deletedAt: timestamp('deleted_at').defaultNow().notNull(),
  },
  table => [index('learner_deletion_institution_idx').on(table.institutionId, table.deletedAt)],
);

/**
 * A teacher's request to choose content, held between the launch and the choice.
 *
 * A deep-linking launch arrives, the teacher is shown a picker, and some time
 * later they choose. Everything needed to answer — where to post back, what the
 * platform will accept, and the opaque `data` that must be echoed — arrives in
 * the launch token and is **gone by the time they click**, because that token is
 * spent on arrival.
 *
 * So it is kept here rather than in a cookie: a row can be single-use, can
 * expire, and can be looked at afterwards when a district asks what happened.
 * `consumedAt` is what makes a choice final — a teacher who goes back and
 * submits the same page twice must not create the link twice.
 */
export const ltiDeepLinkRequests = mysqlTable(
  'lti_deep_link_requests',
  {
    id: int('id').autoincrement().primaryKey(),
    platformId: int('platform_id')
      .notNull()
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' }),
    /** The member of staff choosing. A pupil is never offered this. */
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The platform's own id for the installation, echoed into the response. */
    deploymentId: varchar('deployment_id', { length: 255 }).notNull(),
    /** Where the signed response is posted back. https, checked at the launch. */
    returnUrl: varchar('return_url', { length: 1000 }).notNull(),
    /** Space-separated, as the platform listed them. Empty means "it did not say". */
    acceptTypes: varchar('accept_types', { length: 500 }).notNull().default(''),
    acceptMultiple: boolean('accept_multiple').notNull().default(false),
    /**
     * The platform's opaque token, stored exactly as sent.
     *
     * Never parsed, never trimmed, never defaulted. It is how they know the
     * response belongs to the request they started, and the only correct thing
     * to do with it is give it back unchanged.
     */
    data: text('data'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    /** Set when a choice is returned. A second submission finds it set. */
    consumedAt: timestamp('consumed_at'),
  },
  table => [index('lti_dl_user_idx').on(table.userId, table.expiresAt)],
);

/**
 * One column in a district's gradebook, as this product knows it.
 *
 * A line item is a **column somebody else's teacher sees**, which is what makes
 * the identity of this row matter more than it looks. Creating a second one for
 * the same link puts a duplicate column in their gradebook that nobody asked
 * for and only they can delete, so the unique key is the whole point: one
 * resource link, one column, for ever.
 *
 * `resourceLinkId` rather than the course, because a teacher may place this
 * product twice in one course — a fractions link and a times-tables link — and
 * those are two columns, not one.
 */
export const ltiLineItems = mysqlTable(
  'lti_line_items',
  {
    id: int('id').autoincrement().primaryKey(),
    contextId: int('context_id')
      .notNull()
      .references(() => ltiContexts.id, { onDelete: 'cascade' }),
    /** The platform's id for the placement this column belongs to. */
    resourceLinkId: varchar('resource_link_id', { length: 255 }).notNull(),
    /** The URL the platform gave the column. Scores are posted beneath it. */
    lineItemUrl: varchar('line_item_url', { length: 1000 }).notNull(),
    /** What the column is called in their gradebook. Ours to set, theirs to see. */
    label: varchar('label', { length: 255 }).notNull(),
    /**
     * The denominator, as agreed with the platform when the column was made.
     *
     * Stored rather than assumed, because a score whose maximum disagrees with
     * the column's is rescaled or rejected depending on the platform — and a
     * silently rescaled grade is a child's mark being changed by a rounding
     * decision nobody made.
     */
    scoreMaximum: decimal('score_maximum', { precision: 8, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('lti_line_item_idx').on(table.contextId, table.resourceLinkId),
  ],
);

/**
 * An access token a platform issued **to us**, cached until it expires.
 *
 * Every LTI service — roster, gradebook — is a call outward, and each one needs
 * a bearer token obtained by presenting a JWT signed with our own private key.
 * That exchange costs a round trip to somebody else's server, and the tokens
 * last an hour, so minting one per call would mean a request to the district's
 * LMS for every page of every roster sync.
 *
 * **A row rather than a process-local cache**, for two reasons. A restart
 * otherwise throws away a token that is still valid for fifty minutes, and two
 * instances behind a load balancer would each hold their own — doubling the
 * exchanges against a platform that is entitled to rate-limit us.
 *
 * The token is stored in plain text, and that is worth stating rather than
 * implying. It is a bearer credential for somebody else's API scoped to what
 * they granted us, it expires within the hour, and it sits in the same database
 * as `lti_keys.private_pem`, which is strictly worse to lose. There is no
 * at-rest encryption in this repository — recorded in `docs/privacy/DATA_MAP.md`
 * §8 and a Track A item — and this row does not change that calculus.
 */
export const ltiAccessTokens = mysqlTable(
  'lti_access_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    platformId: int('platform_id')
      .notNull()
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' }),
    /**
     * The scope the platform **granted**, which is not always the one asked
     * for. Part of the key, so a token granted for reading a roster is never
     * handed to something that needs to write a grade.
     */
    scope: varchar('scope', { length: 500 }).notNull(),
    accessToken: text('access_token').notNull(),
    /** As told by the platform. Treated as a deadline, never as a countdown. */
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [
    // One cached token per platform and scope. The upsert that refreshes a token
    // depends on this being unique; without it a busy sync grows a row per call.
    uniqueIndex('lti_access_token_idx').on(table.platformId, table.scope),
  ],
);

/**
 * The link between a person at a platform and an account here.
 *
 * A launch identifies its user by `sub`, which is opaque, stable, and means
 * nothing outside the platform that issued it. This table is what turns it into
 * one of our accounts, and it exists rather than matching on email every time
 * for two reasons that both bite in practice.
 *
 * An address changes. A teacher who marries, or a district that migrates from
 * `@lincoln.k12` to `@lincolnschools`, would otherwise arrive as a stranger and
 * be handed a new empty account, with their classes attached to the old one.
 *
 * And an address may never arrive at all. A district can configure its LMS to
 * send no personal data, which is a privacy setting working as intended. Once
 * this row exists the second launch needs no email, because `sub` is enough.
 *
 * `sub` is unique **per platform**, never globally: two platforms can both call
 * somebody `12345` and mean different people, so matching on the subject alone
 * would hand one district's teacher another district's account.
 */
export const ltiIdentities = mysqlTable(
  'lti_identities',
  {
    id: int('id').autoincrement().primaryKey(),
    platformId: int('platform_id')
      .notNull()
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' }),
    /** The `sub` claim. Opaque by specification — not an email, not a name. */
    subject: varchar('subject', { length: 255 }).notNull(),
    /**
     * The adult this subject is, when the launch was a member of staff.
     *
     * **Nullable since C3f**, for the same reason `learners.guardian_id` became
     * nullable in C3d: a launch resolves to one of two different kinds of
     * person, and forcing both through a column meaning "account" would have
     * required inventing an account for every child.
     */
    userId: int('user_id')
      /*
       * `cascade`. If the account is gone the link means nothing; leaving it
       * would let the next launch resolve to a user id that no longer exists.
       */
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The child this subject is, when the launch was a pupil. */
    learnerId: int('learner_id').references(() => learners.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    /** Last successful launch. The only thing that says an integration is live. */
    lastLaunchedAt: timestamp('last_launched_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('lti_identity_idx').on(table.platformId, table.subject),
    index('lti_identity_user_idx').on(table.userId),
    index('lti_identity_learner_idx').on(table.learnerId),
    /**
     * Exactly one person. Never both, never neither.
     *
     * The same shape as `learner_has_exactly_one_owner`, and for the same
     * reason. A link to neither resolves a launch to nobody, which would read as
     * "not seen before" and quietly provision a second record on every launch. A
     * link to both would let one `sub` be an adult for one question and a child
     * for the next — and the two are entitled to very different things.
     */
    check(
      'lti_identity_is_one_person',
      sql`(\`user_id\` is null) <> (\`learner_id\` is null)`,
    ),
  ],
);

/**
 * One launch in progress.
 *
 * An LTI launch is a round trip: we send the platform a `state` and a `nonce`,
 * the platform sends both back inside a signed token, and we check that what
 * came back is what we sent. This row is the "what we sent" half — without it
 * there is nothing to compare against, and any token with a valid signature
 * would be accepted, including one replayed from a capture an hour ago.
 *
 * **Both values are single-use, and `consumedAt` is what makes them so.** The
 * signature proves the platform wrote the token; it says nothing about whether
 * this is the first time we have seen it. Replay is the attack the nonce exists
 * for, and a nonce that can be presented twice is decoration.
 *
 * Rows are short-lived by design. A launch completes in seconds, so anything
 * older than a few minutes is a redirect that was abandoned or a token being
 * held for later use.
 */
export const ltiLaunchStates = mysqlTable(
  'lti_launch_states',
  {
    id: int('id').autoincrement().primaryKey(),
    /** Returned by the platform as a query parameter; proves the round trip is ours. */
    state: varchar('state', { length: 64 }).notNull(),
    /** Returned *inside the signed token*; proves the token was minted for this trip. */
    nonce: varchar('nonce', { length: 64 }).notNull(),
    platformId: int('platform_id')
      .notNull()
      .references(() => ltiPlatforms.id, { onDelete: 'cascade' }),
    /**
     * Where the platform wants the learner to end up.
     *
     * Kept from the initiation request and compared against the token's own
     * claim later: a token whose target disagrees with the one that started the
     * trip is a token from a different trip.
     */
    targetLinkUri: varchar('target_link_uri', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    /** Set the first time it is presented. A second presentation finds it set. */
    consumedAt: timestamp('consumed_at'),
  },
  table => [
    uniqueIndex('lti_state_idx').on(table.state),
    index('lti_state_expiry_idx').on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// OneRoster 1.2
// ---------------------------------------------------------------------------

/**
 * A district's student information system, as a source of rosters.
 *
 * Separate from `lti_platforms` because the two are **not the same relationship
 * wearing different clothes**. An LTI platform authenticates *us* by fetching
 * our public keyset and verifying a JWT we signed with a private key that never
 * leaves this server. A OneRoster provider issues us a **shared secret** and
 * expects it back. The direction of trust is reversed, and so is the exposure:
 * a database dump containing LTI rows gives an attacker nothing, while one
 * containing a OneRoster secret gives them a district's whole SIS — which holds
 * far more about its pupils than this product ever will.
 *
 * `client_secret_sealed` is therefore ciphertext, never the secret, and
 * `server/oneroster/credentials.ts` refuses to store one at all unless a key is
 * configured to seal it with.
 *
 * Hung off `institutions` rather than `schools`: the contract, the credential
 * and the administrator all sit at district level, the same reasoning that
 * separated those two tables in the first place.
 */
export const onerosterProviders = mysqlTable(
  'oneroster_providers',
  {
    id: int('id').autoincrement().primaryKey(),
    institutionId: int('institution_id')
      .notNull()
      /*
       * `cascade`, unlike `schools`. A credential is not a record of anything —
       * it is a key to somebody else's building, and a district that leaves
       * should not have one lying here. The rows this reaches are ours, not a
       * child's.
       */
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** What an administrator calls it. "PowerSchool", "Infinite Campus". */
    name: varchar('name', { length: 200 }).notNull(),
    /** The v1p2 root, without a trailing slash. Every path is built from it. */
    baseUrl: varchar('base_url', { length: 500 }).notNull(),
    tokenUrl: varchar('token_url', { length: 500 }).notNull(),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    /**
     * AES-256-GCM ciphertext. **Never the secret**, never logged, and never
     * returned by anything that serves a request — `providers.ts` selects
     * columns explicitly so that reaching it has to be deliberate.
     */
    clientSecretSealed: text('client_secret_sealed').notNull(),
    /** Space-separated, as the grant sends them. */
    scopes: varchar('scopes', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [
    // One SIS per district. A second would make "which roster is authoritative"
    // a question with no answer, which is the failure D3 exists to prevent.
    uniqueIndex('oneroster_provider_institution_idx').on(table.institutionId),
  ],
);

/**
 * Cached bearer tokens, keyed the same way `lti_access_tokens` is.
 *
 * The pattern is deliberately identical — the expiry is a deadline rather than
 * a countdown, and the scope is part of the key — because the failure it
 * prevents is identical: a multi-page roster fetch that begins with a
 * credential expiring halfway through it.
 */
export const onerosterAccessTokens = mysqlTable(
  'oneroster_access_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    providerId: int('provider_id')
      .notNull()
      .references(() => onerosterProviders.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 500 }).notNull(),
    accessToken: text('access_token').notNull(),
    /** As told by the provider. Treated as a deadline, never as a countdown. */
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex('oneroster_access_token_idx').on(table.providerId, table.scope),
  ],
);

/**
 * Who a `sourcedId` is, in this product.
 *
 * The same shape as `lti_identities` and for the same reason: a roster arrives
 * naming people by an identifier that means nothing here, and the alternative
 * to recording the mapping is guessing it again on every sync — which is how a
 * second sync creates a second copy of every child.
 *
 * **A OneRoster `sourcedId` is not an LTI `sub`.** They identify the same human
 * through different systems and neither can be derived from the other, so a
 * pupil known from an LMS launch and the same pupil arriving from the SIS have
 * a row here *and* a row in `lti_identities`, both pointing at one learner.
 */
export const onerosterIdentities = mysqlTable(
  'oneroster_identities',
  {
    id: int('id').autoincrement().primaryKey(),
    providerId: int('provider_id')
      .notNull()
      .references(() => onerosterProviders.id, { onDelete: 'cascade' }),
    /** The SIS's own identifier. Opaque; not an email and not a name. */
    sourcedId: varchar('sourced_id', { length: 255 }).notNull(),
    /**
     * The adult, when this `sourcedId` is a member of staff.
     *
     * Only ever **linked**, never created — see `sync.ts`. A roster arriving
     * overnight that mints adult accounts is a SIS deciding who may read
     * children's data here, with nobody deciding anything.
     */
    userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** The child, when this `sourcedId` is a pupil. */
    learnerId: int('learner_id').references(() => learners.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('oneroster_identity_idx').on(table.providerId, table.sourcedId),
    index('oneroster_identity_user_idx').on(table.userId),
    index('oneroster_identity_learner_idx').on(table.learnerId),
    /**
     * Exactly one person. Never both, never neither.
     *
     * `lti_identity_is_one_person`, restated for this table rather than assumed
     * from it. A link to neither resolves to nobody, which reads as "not seen
     * before" and provisions a second record on every run; a link to both would
     * let one identifier be an adult for one question and a child for the next.
     */
    check(
      'oneroster_identity_is_one_person',
      sql`(\`user_id\` is null) <> (\`learner_id\` is null)`,
    ),
  ],
);

/**
 * What one sync run did, kept because a sync runs with nobody watching.
 *
 * Every other act in this product has a person behind it who can say what they
 * meant. A nightly job has only its own record, and the questions asked
 * afterwards — *why is this child not in her class any more*, *when did we stop
 * seeing Elm Street* — cannot be answered from the current state alone, because
 * the current state is the answer and not the reason.
 *
 * `partial` is the field worth reading. A run that could not see the whole
 * roster is recorded as such **and refuses to infer any departure**, because
 * OneRoster pages by offset and a collection that changes underneath a
 * minute-long read can skip a record. A skipped child looks exactly like a
 * departed one.
 */
export const onerosterSyncRuns = mysqlTable(
  'oneroster_sync_runs',
  {
    id: int('id').autoincrement().primaryKey(),
    providerId: int('provider_id')
      .notNull()
      .references(() => onerosterProviders.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at'),
    /** `refused` covers every case where nothing was written. */
    outcome: mysqlEnum('outcome', ['completed', 'refused']).notNull(),
    /** Why, when it was refused. Null on a completed run. */
    refusedReason: varchar('refused_reason', { length: 80 }),
    /**
     * Whether the read was believed complete.
     *
     * A partial run still creates and enrols — those are additive and a skipped
     * page costs only a child who arrives a day late. It performs no departure,
     * because that is the irreversible-feeling direction and the evidence for it
     * was incomplete.
     */
    partial: boolean('partial').notNull().default(false),
    /** The counts the run returned, as reported to whoever asked for it. */
    counts: json('counts'),
  },
  table => [index('oneroster_sync_run_provider_idx').on(table.providerId, table.startedAt)],
);

/**
 * Which campus a SIS `org` became.
 *
 * Kept beside the row rather than inside `schools`, because a campus may exist
 * for reasons that have nothing to do with a SIS — a district that types in one
 * school and syncs the other three is an ordinary state, and a column on
 * `schools` would have to be nullable and would say nothing about *which*
 * provider it came from.
 */
export const onerosterSchoolLinks = mysqlTable(
  'oneroster_school_links',
  {
    id: int('id').autoincrement().primaryKey(),
    providerId: int('provider_id')
      .notNull()
      .references(() => onerosterProviders.id, { onDelete: 'cascade' }),
    sourcedId: varchar('sourced_id', { length: 255 }).notNull(),
    schoolId: int('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
  },
  table => [
    // The idempotency guarantee D3 rests on: one `sourcedId` is one campus.
    uniqueIndex('oneroster_school_link_idx').on(table.providerId, table.sourcedId),
    uniqueIndex('oneroster_school_link_school_idx').on(table.schoolId),
  ],
);

/** Which classroom a SIS `class` became. Same reasoning as the campus links. */
export const onerosterClassLinks = mysqlTable(
  'oneroster_class_links',
  {
    id: int('id').autoincrement().primaryKey(),
    providerId: int('provider_id')
      .notNull()
      .references(() => onerosterProviders.id, { onDelete: 'cascade' }),
    sourcedId: varchar('sourced_id', { length: 255 }).notNull(),
    classroomId: int('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'cascade' }),
  },
  table => [
    uniqueIndex('oneroster_class_link_idx').on(table.providerId, table.sourcedId),
    uniqueIndex('oneroster_class_link_classroom_idx').on(table.classroomId),
  ],
);

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
    /**
     * What this account may reach.
     *
     * `admin` is the **platform** administrator and reaches every learner —
     * that is what the role is for, and it is the only global bypass.
     *
     * `institution_admin` reaches learners **within their own institution and
     * no further**, which is why it is a separate value rather than `admin`
     * with `institutionId` set. Deriving scope from a data column would mean a
     * privilege change as a side effect of an edit: assigning an institution to
     * a platform admin would silently demote them, and clearing it would
     * silently promote an institutional one to global reach. A role that says
     * what it is cannot be changed by accident.
     */
    role: mysqlEnum('role', ['parent', 'teacher', 'admin', 'institution_admin'])
      .notNull()
      .default('parent'),
    /**
     * Set when the account is created by an institution rather than self-serve.
     *
     * Null for every family that signed itself up, which is most of them and is
     * not a defect. `restrict` on delete: an institution with accounts still
     * attached cannot be removed, because doing so would leave adults holding
     * children's records with no organisation accountable for them.
     */
    institutionId: int('institution_id').references(() => institutions.id, {
      onDelete: 'restrict',
    }),
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
    /**
     * The family a child belongs to, when they belong to one.
     *
     * **Nullable since C3d, and the nullability is the point.** A child
     * provisioned by a district through an LMS has no guardian in this system:
     * the district holds the agreement and stands in a parent's place. Before
     * this column could be null, the only way to model such a child was to make
     * some adult their guardian, and every candidate was worse than the problem
     * — see the check constraint below.
     */
    guardianId: int('guardian_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The district a child belongs to, when a district rather than a family
     * provisioned them.
     *
     * `restrict`, like everywhere else a district is referenced. Removing a
     * district must not delete children through a cascade; whoever removes one
     * has to deal with its pupils deliberately.
     */
    institutionId: int('institution_id').references(() => institutions.id, {
      onDelete: 'restrict',
    }),
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
    /**
     * Hidden, not deleted — and the distinction became load-bearing in E3.
     *
     * This comment used to call archiving the answer to "a COPPA deletion
     * request". It is not, and the institutional agreement districts sign says
     * so in as many words: *deletion removes their practice history rather than
     * hiding it*. Two documents in this repository disagreed, and the code
     * implemented the weaker one.
     *
     * What archiving is for is a child who has **stopped**, not one who has
     * asked to be erased: they left the school, the family paused, a roster no
     * longer lists them. Their records stay, they vanish from every surface, and
     * nothing is lost if they come back. `deleteLearner` is the other thing, and
     * it removes the row so every cascade below it fires.
     */
    archivedAt: timestamp('archived_at'),
    /**
     * **Who decided**, which `archived_at` alone cannot say.
     *
     * Added in D3, when a roster sync was first allowed to archive. Without it
     * the two cases are indistinguishable, and a returning pupil would restore
     * both: the child a SIS deactivated last term *and* the child a person
     * deliberately hid. The second is somebody's decision being overturned by a
     * nightly job.
     *
     * `roster_departure` means a SIS said the child had gone, and the same SIS
     * saying they are back is allowed to undo it. `requested` means anything
     * else, and no sync may touch it.
     *
     * **Nothing in this product writes `requested` yet**, which is worth saying
     * rather than implying otherwise: no surface archives a learner, so the only
     * rows carrying it are the ones migration `0030` backfilled — every archival
     * predating D3, all of which were made by hand. The value exists so that
     * those rows, and whatever surface eventually archives a child on request,
     * are out of a nightly job's reach by default.
     */
    archivedReason: mysqlEnum('archived_reason', ['requested', 'roster_departure']),
  },
  table => [
    index('learners_guardian_idx').on(table.guardianId),
    index('learners_institution_idx').on(table.institutionId),
    /**
     * A reason exactly when there is an archival.
     *
     * Both halves matter. An `archived_at` with no reason is a child nothing can
     * decide about — a sync cannot tell whether restoring them would overturn a
     * person's decision, so it would have to refuse forever. A reason with no
     * `archived_at` is a claim about an event that did not happen.
     */
    check(
      'learner_archival_has_a_reason',
      sql`(\`archived_at\` is null) = (\`archived_reason\` is null)`,
    ),
    /**
     * Exactly one owner. Never both, never neither.
     *
     * This is a database constraint rather than a rule in a writer because of
     * what the two failures cost. A child with **neither** owner is reachable by
     * nobody — no parent can export their data, no district can answer for them,
     * and the consent gate has nothing to ask about. A child with **both** is
     * reachable by two parties who never agreed to share them.
     *
     * It also makes a specific footgun unrepresentable rather than documented.
     * `recordConsent` consents for every learner of the guardian it is given,
     * which is correct for a family and catastrophic for a district: whoever
     * stood in as guardian for a school's pupils would have one call consent for
     * all of them. With district pupils hanging off `institution_id`, that sweep
     * structurally cannot reach them — and a guard you can delete beats a
     * comment somebody has to remember.
     */
    check(
      'learner_has_exactly_one_owner',
      sql`(\`guardian_id\` is null) <> (\`institution_id\` is null)`,
    ),
  ],
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
 *
 * There is deliberately no `consented` column on `learners` to go with it. That
 * would be a second source for something these rows already answer, and it is
 * the one that would be wrong after a withdrawal.
 *
 * The `evidence` column that used to sit here — a single `varchar(500)`
 * documented as "typed name *or* reference to the signed artifact, per the
 * method used" — is gone. One free-text field standing for whatever the method
 * happened to be is the same failure as a ledger with no policy version, one
 * layer down. Its two jobs are columns now. A future method needing a document
 * reference gets its own column then.
 */
/**
 * A district's agreement, and the evidence it rests on.
 *
 * `institutional_agreement` has been a value in the consent method enum since
 * B1, and until C3e **writing it cost nothing**: no document had to exist and
 * nobody had to sign anything. A consent row could claim a district had agreed
 * while pointing at no agreement at all.
 *
 * Family consent snapshots a policy version, a server-computed hash, an attested
 * name, a verified email and a timestamp. Without this table the institutional
 * path was a bare string — so the gate would have been **weakest for exactly the
 * children with the least agency**, and weakest in the direction convenient for
 * us.
 *
 * The three date columns are three different facts and are not interchangeable.
 * `signedAt` is when somebody agreed. `expiresAt` is a term the parties set in
 * advance, null when there is none. `withdrawnAt` is somebody ending it early.
 * A district needs to be able to tell "the term ran out" from "they pulled out",
 * and collapsing them would make the record unable to say which happened.
 */
export const institutionAgreements = mysqlTable(
  'institution_agreements',
  {
    id: int('id').autoincrement().primaryKey(),
    institutionId: int('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'restrict' }),
    /**
     * The administrator who agreed, kept as a reference **and** snapshotted
     * below. The reference is for the district's own records; the snapshot is
     * what makes the row still say something after the account is renamed or
     * deleted.
     */
    signedByUserId: int('signed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The name they typed. An attestation, not a signature — same as a family's. */
    signatoryName: varchar('signatory_name', { length: 200 }).notNull(),
    /** "Head of School", "Data Protection Officer". Says who they claimed to be. */
    signatoryTitle: varchar('signatory_title', { length: 200 }).notNull(),
    /** Snapshotted rather than joined: `users.email` can change, this must not. */
    signatoryEmail: varchar('signatory_email', { length: 320 }).notNull(),

    /**
     * Which text was agreed to, and proof it has not been edited since.
     *
     * Computed server-side from the server's own copy, never sent by a client —
     * which could otherwise claim agreement to terms that were never shown.
     */
    agreementVersion: varchar('agreement_version', { length: 32 }).notNull(),
    agreementSha256: varchar('agreement_sha256', { length: 64 }).notNull(),

    signedAt: timestamp('signed_at').defaultNow().notNull(),
    /** A term the parties set. Null means it runs until somebody ends it. */
    expiresAt: timestamp('expires_at'),
    /** Ended early. Distinct from expiry, deliberately. */
    withdrawnAt: timestamp('withdrawn_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('institution_agreement_institution_idx').on(table.institutionId),
    index('institution_agreement_active_idx').on(table.institutionId, table.withdrawnAt),
  ],
);

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
    /**
     * How the guardian was verified — as performed, not as chosen.
     *
     * The modal used to offer this as a dropdown including "Micro-Auth Credit
     * Card Verification", when nothing charges a card. The method records what
     * the *operator* did; letting a parent pick it writes a record of a
     * verification that never happened.
     *
     * `email_verified_name_attested` is the only value this product writes, and
     * it is named for exactly what it is. The first draft called it
     * `email_plus_verification`, which overstates it: "email plus" is a term of
     * art for a method with a second confirming step, and a name that needs the
     * evidence read before it stops misleading is the wrong shape. The others
     * stay in the enum because removing values to mean "not built yet" makes the
     * schema harder to change than the UI is.
     */
    method: mysqlEnum('method', [
      'credit_card_auth',
      'email_plus_verification',
      'signed_form',
      'institutional_agreement',
      'email_verified_name_attested',
    ]).notNull(),

    /**
     * Which disclosure was agreed to, and proof it has not been edited since.
     *
     * A version string alone is a promise that nobody changed `v1` in place,
     * worth as much as the discipline of whoever last touched the file. The
     * hash is computed server-side from the server's own copy of the document —
     * never sent by the client, which could otherwise claim consent to text that
     * was never displayed.
     *
     * Both `notNull`: there were no rows to backfill, and a nullable column here
     * would make "consent to something unrecorded" representable.
     */
    policyVersion: varchar('policy_version', { length: 32 }).notNull(),
    policySha256: varchar('policy_sha256', { length: 64 }).notNull(),

    /** The name the guardian typed. An attestation, not a signature. */
    attestedName: varchar('attested_name', { length: 200 }).notNull(),
    /**
     * The address consent was given from, snapshotted rather than joined.
     * `users.email` can change; what this row says must not.
     */
    verifiedEmail: varchar('verified_email', { length: 320 }).notNull(),
    /**
     * When the magic link proving control of that address was consumed.
     *
     * The link proves control at time T; consent is recorded at T+X, and a gap
     * of weeks is an ordinary scenario. Storing it means the record shows the
     * gap rather than implying the two were simultaneous. Null means no link on
     * record — true for the development sign-in bypass, which production builds
     * refuse.
     */
    emailVerifiedAt: timestamp('email_verified_at'),
    /**
     * Whether a confirming second communication was sent. Always false today.
     *
     * Recorded explicitly rather than left to inference, because it is the
     * single fact separating what this product does from COPPA "email plus" —
     * and because "show me every consent taken without a confirming step" should
     * be a `WHERE` clause.
     */
    secondStepSent: boolean('second_step_sent').notNull().default(false),

    recordedAt: timestamp('recorded_at').defaultNow().notNull(),

    /**
     * The district agreement this row rests on, for institutional consent only.
     *
     * Null for every family row, and that is most of them. It is what stops
     * `institutional_agreement` being a claim anybody can type: the constraint
     * below makes the method and this column agree, so a row cannot say a
     * district consented while naming no agreement, and cannot point at an
     * agreement while claiming a parent signed it.
     *
     * `restrict` on delete. An agreement with consent rows resting on it cannot
     * be removed, because doing so would leave children whose permission to
     * practise refers to nothing.
     */
    agreementId: int('agreement_id').references(() => institutionAgreements.id, {
      onDelete: 'restrict',
    }),
  },
  table => [
    index('consent_learner_idx').on(table.learnerId, table.recordedAt),
    /**
     * The method and the evidence must agree.
     *
     * Without this, `institutional_agreement` stays a string a caller can write
     * with nothing behind it — which is precisely the state C3e exists to end.
     * The reverse direction matters too: a row naming an agreement while
     * claiming a parent attested to it would misdescribe who consented, and the
     * ledger's whole purpose is to say what actually happened.
     */
    check(
      'consent_method_matches_evidence',
      sql`(\`method\` = 'institutional_agreement') = (\`agreement_id\` is not null)`,
    ),
  ],
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
    /**
     * The campus, when there is one.
     *
     * Nullable so a teacher who signed up on their own keeps a classroom that
     * belongs to nobody but them. A roster synchronised from a school carries
     * this; one a teacher typed in does not, and both are valid.
     */
    schoolId: int('school_id').references(() => schools.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('classrooms_teacher_idx').on(table.teacherId),
    index('classrooms_school_idx').on(table.schoolId),
  ],
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
    /**
     * An id the client makes when the child answers, not when the answer is
     * sent. It is what makes a replay safe.
     *
     * An offline queue retries, and a retry that the server treats as a new
     * answer moves mastery and the 3PL estimate a second time for one question.
     * That is not a duplicate row a report can filter out later — the running
     * scores have already absorbed it, and there is no way back to what they
     * should have been.
     *
     * Nullable because attempts recorded before the queue existed have none, and
     * because a learner answering online has nothing to reconcile. Unique when
     * present, so the database refuses the second write rather than trusting the
     * application to check first.
     */
    clientId: varchar('client_id', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('attempts_learner_idx').on(table.learnerId, table.createdAt),
    index('attempts_concept_idx').on(table.learnerId, table.conceptId),
    index('attempts_session_idx').on(table.sessionId),
    // Scoped to the learner: two children on one shared device generate ids
    // independently, and a collision between them must not silence a real
    // answer. MySQL treats NULLs as distinct, so online attempts are unaffected.
    uniqueIndex('attempts_client_idx').on(table.learnerId, table.clientId),
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
    /**
     * The rating shown to a learner, derived from `theta`.
     *
     * The default is the benchmark — θ = 0, not yet measured. It was 1200, from
     * a mapping the specification never had; see `src/services/eloScale.ts`.
     */
    eloRating: int('elo_rating').notNull().default(1000),
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

/** Minutes used, per learner per day. `screenTime.heartbeat` writes here. */
export const screenTimeUsage = mysqlTable(
  'screen_time_usage',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    /**
     * Calendar day, resolved at write time.
     *
     * `mode: 'string'` because this is a date and not an instant. Drizzle's
     * default maps DATE onto a JS `Date`, which carries a time and a zone, and
     * a screen-time day that shifts by an hour when the server moves is the
     * classic form of that bug.
     *
     * **This is the server's day, not the guardian's.** No timezone is stored
     * anywhere, and `server/learning/rewards.ts` already resolves a streak day
     * the same way. Giving screen time a timezone while streaks keep the
     * server's would make the two disagree about when "today" started, which is
     * a worse defect than the one it fixes. Both move together when a timezone
     * column lands.
     */
    day: date('day', { mode: 'string' }).notNull(),
    minutesSpent: smallint('minutes_spent').notNull().default(0),
    /**
     * How far along this day's usage has already been counted.
     *
     * The heartbeat does not trust the client for elapsed time. A counter the
     * caller increments is a counter the child it restricts can decline to
     * increment — sending `0` forever costs nothing and buys unlimited screen
     * time. The server measures instead: elapsed is `now - countedThrough`,
     * capped, and only whole minutes are banked.
     *
     * It advances by exactly the minutes banked rather than to `now`, so the
     * leftover seconds carry into the next beat. Flooring to `now` would
     * discard up to 59 seconds per beat, and with beats arriving a shade over
     * the minute — which is what jitter guarantees — the counter would stall
     * near zero while a child practised all afternoon.
     *
     * Separate from `updatedAt` on purpose. That column answers "when was this
     * row last touched"; this one answers "what period has been counted". One
     * column holding both facts is how `screenTimeLimitMinutes` came to mean
     * two different things.
     */
    countedThrough: timestamp('counted_through').defaultNow().notNull(),
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

/**
 * Companion avatars a learner has bought.
 *
 * One row per purchase. The free ones are not stored — `price === 0` in the
 * catalogue already says they are available, and writing a row for every learner
 * for every free avatar would be a table of things nobody decided.
 *
 * The price is *not* recorded here. It is the catalogue's, and a purchase is a
 * fact about what was unlocked rather than a receipt; storing the price would
 * invite reading it back as one, and the coins are already accounted for in
 * `learner_rewards`.
 */
export const learnerAvatars = mysqlTable(
  'learner_avatars',
  {
    id: int('id').autoincrement().primaryKey(),
    learnerId: int('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    avatarId: varchar('avatar_id', { length: 64 }).notNull(),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  // Buying the same avatar twice is a bug, not a second purchase. The index
  // makes the database refuse it rather than trusting the check that precedes
  // it, which two tabs can both pass.
  table => [uniqueIndex('learner_avatar_idx').on(table.learnerId, table.avatarId)],
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

export const institutionsRelations = relations(institutions, ({ many }) => ({
  schools: many(schools),
  users: many(users),
}));

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [schools.institutionId],
    references: [institutions.id],
  }),
  classrooms: many(classrooms),
}));

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
