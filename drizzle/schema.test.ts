/**
 * Invariants on the shape of the schema itself.
 *
 * These need no database. They exist because the central decision of this graft
 * — that a guardian has many learners, and that every learning table is keyed on
 * the child rather than the account — is the kind of thing that gets undone one
 * convenient column at a time. A `userId` added to a learning table because it
 * was easier to reach for would compile, pass every query test, and silently
 * restore the one-child-per-account model this schema exists to replace.
 *
 * Applying the migration to a real MySQL is a separate concern, and runs in CI
 * against a service container.
 */

import { getTableConfig } from 'drizzle-orm/mysql-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

type AnyTable = Parameters<typeof getTableConfig>[0];

/**
 * Every exported Drizzle table, by its SQL name.
 *
 * `getTableConfig` is the discriminator rather than a type guard: the module
 * also exports `relations()` results and inferred types, and the only reliable
 * way to tell a table from either is to ask Drizzle. Widened to `AnyTable`
 * on the way into the map because the concrete per-table types are invariant
 * and will not unify.
 */
const tables = new Map<string, AnyTable>();
for (const value of Object.values(schema)) {
  try {
    const config = getTableConfig(value as AnyTable);
    tables.set(config.name, value as AnyTable);
  } catch {
    // Not a table.
  }
}

/**
 * Tables holding data *about a child*. Declared rather than inferred: a new
 * table that belongs on this list and is not added to it fails the completeness
 * check below, so classifying it is not optional.
 */
const LEARNER_SCOPED = [
  'learner_access_tokens',
  'consent_events',
  'classroom_learners',
  'practice_sessions',
  'attempts',
  'learner_concept_mastery',
  'concept_mastery_history',
  'learner_ability',
  'learner_ability_history',
  'learner_misconceptions',
  'screen_time_rules',
  'screen_time_usage',
  'assignment_targets',
  'learner_rewards',
  'learner_avatars',
] as const;

/**
 * Tables addressed to *either* an adult or a child.
 *
 * `notifications` was the first, and it is here rather than on either list above
 * because forcing it onto one would have cost something real. It holds a
 * `user_id`, so `LEARNER_SCOPED` would have failed — and rightly, since that
 * rule is what stops a child's learning data being keyed to an adult account.
 * But it also holds rows about children, so calling it not-learner-scoped would
 * have quietly exempted it from the deletion cascade below, which is the
 * invariant that matters most.
 *
 * The distinction it draws is recipient versus subject: `user_id` and
 * `learner_id` are who reads a row, `about_learner_id` is who it concerns.
 *
 * `lti_identities` joined in **C3f**, when a launch stopped resolving only to
 * staff. It sat in `NOT_LEARNER_SCOPED` under a comment saying it pointed at
 * `users` and never at `learners` — true when written, false the moment a child
 * could arrive from an LMS, and the cost of leaving it there would have been
 * exactly the exemption described above: a deleted child's LTI link surviving
 * them, still naming the platform subject that was theirs.
 */
const DUAL_AUDIENCE = ['notifications', 'lti_identities'] as const;

/**
 * The subset whose rows are *about* a child as well as addressed to somebody.
 *
 * `notifications` is the only one. `lti_identities` joined `DUAL_AUDIENCE` in
 * C3f because a launch now resolves to either an adult or a child, but it is not
 * about anybody — it is a link, and an `about_learner_id` on it would name the
 * same child its `learner_id` already does.
 *
 * Split out rather than widened, because the assertion it carries is the one
 * that stops a guardian's copy of a notification losing its machine-readable
 * link to the child it concerns. Relaxing that to accommodate a table with a
 * different shape would have cost a real guard to save a list.
 */
const ABOUT_A_CHILD = ['notifications'] as const;

/** Tables holding data about an authenticating adult, or about content. */
const NOT_LEARNER_SCOPED = [
  /*
   * Organisations, not people. A district or campus row holds a name and a
   * relationship to other organisations; nothing in it is about a child, and
   * nothing in it should ever become so — the moment a school row carried a
   * learner's data it would sit outside the deletion cascade below.
   */
  'institutions',
  'schools',
  /*
   * A district's agreement. It names an organisation and the administrator who
   * signed for it, and holds no learner id — deliberately. The agreement is the
   * *authority* under which children are consented for; which children rest on
   * it is recorded in `consent_events`, one row each, so that withdrawing an
   * agreement is one act and the record of who it covered survives it.
   */
  'institution_agreements',
  /*
   * That a child was deleted, and nothing about who they were. It holds a
   * `learner_id` that deliberately resolves to nobody — not a foreign key, not
   * a child's record, and the one row in this schema whose whole purpose is to
   * outlive the learner it names. Classifying it as learner-scoped would put it
   * inside the deletion cascade it exists to record.
   */
  'learner_deletions',
  /*
   * Cryptographic material belonging to the platform, not to anybody. It holds
   * no learner id and must never hold one — a key row is what this deployment
   * signs messages with, and nothing about a child belongs in it.
   */
  'lti_keys',
  /*
   * A platform registration and the installation that binds it to a district.
   * Both describe organisations and software, not people — a launch resolves a
   * learner *through* them, and neither should ever hold one.
   */
  'lti_platforms',
  'lti_deployments',
  /*
   * A district's student information system, and the tokens we hold for it.
   * Both are about a **relationship with an organisation** rather than about a
   * person: a base URL, a sealed credential, a cached bearer token.
   *
   * This classification is the load-bearing one for `oneroster_providers`. If
   * that row ever held a learner id it would sit inside the deletion cascade,
   * and erasing one child would take a district's SIS credential with them —
   * every other pupil's roster stops syncing because one family asked to be
   * forgotten. The rows OneRoster *produces* are learners and classrooms, which
   * are already classified; the connection that fetched them is not.
   */
  'oneroster_providers',
  'oneroster_access_tokens',
  /*
   * What a SIS identifier means here, and which campus or classroom a
   * `sourcedId` became. Each holds a foreign key to a person or a place, and
   * none of them is a record *of* a child — an identity row says "this string
   * is that learner", which is a fact about the SIS rather than about them.
   *
   * `oneroster_identities` is the one worth stating plainly: it carries a
   * `learner_id`, so it looks learner-scoped from a column list. It is not, for
   * the same reason `lti_identities` sits in `DUAL_AUDIENCE` rather than here —
   * except that this table must be reachable from **neither** the export nor a
   * family's view, because it describes a district's system. It is removed with
   * the child by cascade, which is what matters, and the export has nothing to
   * show a parent about a SIS identifier.
   */
  'oneroster_identities',
  'oneroster_school_links',
  'oneroster_class_links',
  /*
   * What one sync run did. A record of this product's own behaviour, not of any
   * child — the counts it holds are numbers, and the reason a run refused names
   * a configuration rather than a person.
   */
  'oneroster_sync_runs',
  /*
   * A bearer token a platform issued to us, cached until it expires. It is a
   * credential for calling somebody else's API and names no person on either
   * side — the scope says what we may ask for, never whom we may ask about. A
   * learner id here would put a child's identity in a row whose whole purpose is
   * to be thrown away and replaced every hour.
   */
  'lti_access_tokens',
  /*
   * A course at a platform, and where its roster can be read. It names an
   * organisation's course rather than any person — the membership itself lives
   * at the platform until C4c brings it across, and a learner id here would put
   * a child in a row that exists to hold a URL.
   */
  'lti_contexts',
  /*
   * A column in somebody else's gradebook. It names a course and a placement,
   * and holds no learner id — the mark for a particular child lives at the
   * platform, which is the point of posting it there. Whose marks went into it
   * is not a fact this table keeps.
   */
  'lti_line_items',
  /*
   * A teacher's pending request to choose content. It names the member of staff
   * doing the choosing and the platform to answer, and never a learner — the
   * choice is about *what* a class will work on, not about any particular child.
   */
  'lti_deep_link_requests',
  /*
   * One launch in progress: a state, a nonce and an expiry. It names a platform
   * and never a learner — the launch resolves a child *after* this row is spent,
   * and putting one here would keep a child's identity in a table designed to be
   * deleted every few minutes.
   */
  'lti_launch_states',
  'users',
  'magic_link_tokens',
  'learners',
  'classrooms',
  'concepts',
  'concept_prerequisites',
  'problems',
  'problem_distractors',
  'hints',
  'hint_error_modes',
  'assignments',
] as const;

const columnNames = (table: AnyTable) => getTableConfig(table).columns.map(c => c.name);

describe('schema inventory', () => {
  it('classifies every table as learner-scoped or not', () => {
    const classified = new Set<string>([...LEARNER_SCOPED, ...DUAL_AUDIENCE, ...NOT_LEARNER_SCOPED]);
    const unclassified = [...tables.keys()].filter(name => !classified.has(name));
    expect(unclassified).toEqual([]);
  });

  it('names no table that does not exist', () => {
    const missing = [...LEARNER_SCOPED, ...DUAL_AUDIENCE, ...NOT_LEARNER_SCOPED].filter(
      name => !tables.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('gives every table a primary key', () => {
    const withoutPk = [...tables.entries()]
      .filter(([, table]) => {
        const config = getTableConfig(table);
        return config.primaryKeys.length === 0 && !config.columns.some(c => c.primary);
      })
      .map(([name]) => name);
    expect(withoutPk).toEqual([]);
  });
});

describe('a guardian has many learners', () => {
  it('keys learners on a guardian', () => {
    expect(columnNames(schema.learners)).toContain('guardian_id');
  });

  it('does not make that guardian unique', () => {
    // The donor engine's `learnerProfiles.userId` was `.unique()`, which is
    // exactly one learner per account and the reason its schema could not be
    // reused. A unique index here would reinstate it.
    const config = getTableConfig(schema.learners);
    const offending = config.indexes
      .filter(index => index.config.unique)
      .filter(index => index.config.columns.some(column => 'name' in column && column.name === 'guardian_id'));
    expect(offending).toEqual([]);

    const guardianColumn = config.columns.find(c => c.name === 'guardian_id');
    expect(guardianColumn?.isUnique).toBeFalsy();
  });
});

describe('learning data is keyed on the child, not the account', () => {
  it.each(LEARNER_SCOPED)('%s carries learner_id', tableName => {
    expect(columnNames(tables.get(tableName)!)).toContain('learner_id');
  });

  it.each(LEARNER_SCOPED)('%s carries no user_id', tableName => {
    // `consent_events` records *which adult* consented, so it holds a
    // `granted_by_user_id`. That is deliberately not spelled `user_id`: the
    // distinction between "whose data this is" and "who acted" has to survive a
    // careless join.
    expect(columnNames(tables.get(tableName)!)).not.toContain('user_id');
  });

  it('references learners rather than users from every learner_id', () => {
    for (const tableName of LEARNER_SCOPED) {
      const config = getTableConfig(tables.get(tableName)!);
      const fk = config.foreignKeys.find(key =>
        key.reference().columns.some(column => column.name === 'learner_id'),
      );
      expect(fk, `${tableName} has no foreign key on learner_id`).toBeDefined();
      expect(fk!.reference().foreignTable[Symbol.for('drizzle:Name') as never]).toBe('learners');
    }
  });
});

describe('a notification is addressed to one reader and is about one child', () => {
  it.each(DUAL_AUDIENCE)('%s can be addressed to either', tableName => {
    const columns = columnNames(tables.get(tableName)!);
    expect(columns).toContain('user_id');
    expect(columns).toContain('learner_id');
  });

  it.each(ABOUT_A_CHILD)('%s records the child it concerns separately', tableName => {
    // Without this the guardian's copy has no machine-readable link to the child
    // it is about, and "has this already been raised" cannot be asked once for
    // both copies.
    expect(columnNames(tables.get(tableName)!)).toContain('about_learner_id');
  });

  it.each(DUAL_AUDIENCE)('%s lets both reader columns be null', tableName => {
    // Exactly one is set per row. Requiring either would make the other
    // audience unrepresentable.
    const config = getTableConfig(tables.get(tableName)!);
    for (const name of ['user_id', 'learner_id']) {
      expect(config.columns.find(c => c.name === name)?.notNull, name).toBeFalsy();
    }
  });
});

describe('referential integrity is the database"s job', () => {
  it('declares a foreign key for every id column that names another table', () => {
    // The donor engine declared none, which is why it needs a standing integrity
    // gate to find orphans — 500 problems once pointed at absent lessons and
    // reviewed clean. Here the storage engine refuses the write instead.
    const missing: string[] = [];

    for (const [name, table] of tables) {
      const config = getTableConfig(table);
      const constrained = new Set(
        config.foreignKeys.flatMap(key => key.reference().columns.map(column => column.name)),
      );

      for (const column of config.columns) {
        const isReference = /_id$/.test(column.name) && column.name !== 'id';
        //
        // `institution_id` **used to be exempt here**, on the grounds that it had
        // no table yet. Graft B1 built `institutions` and gave it a foreign key,
        // so the exemption stopped describing anything — and an exemption that no
        // longer applies is worse than none, because it goes on excusing a column
        // long after the reason expired. It is gone; the constraint covers it.
        //
        // `external_id` is not a reference at all — it is the id a problem had
        // in the corpus it was imported from, which is what makes a re-import
        // idempotent. There is nothing in this database for it to point at.
        //
        // `client_id` is made by the browser when a child answers, so that an
        // offline queue can retry without the answer being counted twice. It
        // names nothing in this database; its uniqueness is what matters, and
        // that is a separate index.
        //
        // `deployment_id` is the platform's own identifier for one installation
        // of this product, arriving as a claim in a launch. There is no
        // `deployments` table for it to point at — the row that *holds* it is
        // `lti_deployments`, and its uniqueness is per platform, which is a
        // separate index.
        //
        // `context_id` is the same shape one level down: the platform's own id
        // for a course, arriving as a claim. The row that holds it *is* the
        // course record, so there is nothing else for it to reference, and its
        // uniqueness is per deployment — which is a separate index, and the one
        // that stops two districts' courses colliding.
        //
        // `resource_link_id` is the third of the same family: the platform's id
        // for one placement of this product inside a course. Nothing here holds
        // resource links — a launch mentions one and it is recorded against the
        // gradebook column it belongs to.
        /*
         * Scoped to one table, unlike every exemption below it.
         *
         * `learner_deletions.learner_id` must **not** have a foreign key: it
         * names a child who has been erased, and a constraint would either
         * forbid the deletion or drag the record of it away too. It is the one
         * id column in this schema whose purpose is to outlive what it names.
         *
         * Exempting the *column name* the way the others do would have excused
         * `learner_id` in all sixteen tables that must keep their cascade — the
         * blast radius of a one-word exemption, and the reason this one names
         * its table.
         */
        const exemptHere = name === 'learner_deletions' && column.name === 'learner_id';

        const exempt =
          exemptHere ||
          column.name === 'external_id' ||
          column.name === 'client_id' ||
          column.name === 'deployment_id' ||
          column.name === 'context_id' ||
          column.name === 'resource_link_id' ||
          /*
           * A OneRoster `sourcedId` is an identifier in **somebody else's**
           * system. There is nothing here for it to reference, which is the
           * whole reason the three link tables exist: they are the mapping from
           * a SIS's vocabulary to ours, and a foreign key is exactly what they
           * supply on the *other* column.
           */
          column.name === 'sourced_id' ||
          // `avatar_id` names an entry in the catalogue in `src/data/avatars.ts`,
          // which the server reads so that the price charged is not the price a
          // browser claimed. There is no table for it to reference.
          column.name === 'avatar_id';
        if (isReference && !exempt && !constrained.has(column.name)) {
          missing.push(`${name}.${column.name}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('erases a child"s learning data when the child is erased', () => {
    // A COPPA deletion request has to leave nothing behind. Any learner-scoped
    // table that does not cascade would survive the deletion it is subject to.
    const notCascading: string[] = [];

    // `DUAL_AUDIENCE` is included deliberately. Adding a category and looping
    // over only the old one would have exempted the new table from the deletion
    // it is subject to, which is the failure this test exists to prevent.
    for (const tableName of [...LEARNER_SCOPED, ...DUAL_AUDIENCE]) {
      const config = getTableConfig(tables.get(tableName)!);
      for (const key of config.foreignKeys) {
        const reference = key.reference();
        // Any column pointing at a learner, whichever it is called. A cascade
        // on `learner_id` alone would leave a guardian's copy of a notification
        // about a deleted child behind, naming them.
        const pointsAtALearner = reference.columns.some(column =>
          /learner_id$/.test(column.name),
        );
        if (pointsAtALearner && key.onDelete !== 'cascade') {
          notCascading.push(`${tableName}.${reference.columns.map(c => c.name).join(',')} (${key.onDelete ?? 'no action'})`);
        }
      }
    }

    expect(notCascading).toEqual([]);
  });

  it('refuses to delete a problem that attempts still reference', () => {
    // Cascading here would delete a learner's history to tidy up content.
    const config = getTableConfig(schema.attempts);
    const problemFk = config.foreignKeys.find(key =>
      key.reference().columns.some(column => column.name === 'problem_id'),
    );
    expect(problemFk?.onDelete).toBe('restrict');
  });
});

describe('columns the current model is missing', () => {
  it('records a session"s intended length on the server', () => {
    // Kept only on the client today, so "questions per session" is a
    // client-side override of a client-side value and the server cannot tell an
    // abandoned session from a finished one.
    expect(columnNames(schema.practiceSessions)).toContain('target_length');
  });

  it('bands concepts by age', () => {
    // Without this every learner is drawn the whole curriculum, which is how a
    // three-year-old's parent ends up looking at a map of fractions.
    expect(columnNames(schema.concepts)).toEqual(
      expect.arrayContaining(['age_band_low', 'age_band_high', 'tier']),
    );
  });

  it('keeps consent as a log rather than a flag', () => {
    // A boolean answers "is consent granted" and nothing about when, by what
    // method, or whether it was withdrawn.
    const columns = columnNames(schema.consentEvents);
    expect(columns).toEqual(expect.arrayContaining(['decision', 'method', 'recorded_at']));
    expect(columnNames(schema.learners)).not.toContain('coppa_consent');
  });

  it('stores the reproducing seed for a generated problem', () => {
    expect(columnNames(schema.problems)).toEqual(expect.arrayContaining(['source', 'generator_kind']));
  });

  it('keeps a picture as data rather than markup', () => {
    // Raw SVG in a text column means dangerouslySetInnerHTML in an app used by
    // children.
    const visual = getTableConfig(schema.problems).columns.find(c => c.name === 'visual');
    expect(visual?.columnType).toBe('MySqlJson');
  });
});
