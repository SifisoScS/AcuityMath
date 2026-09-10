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
] as const;

/**
 * Tables addressed to *either* an adult or a child.
 *
 * `notifications` is the only one, and it is here rather than on either list
 * above because forcing it onto one would have cost something real. It holds a
 * `user_id`, so `LEARNER_SCOPED` would have failed — and rightly, since that
 * rule is what stops a child's learning data being keyed to an adult account.
 * But it also holds rows about children, so calling it not-learner-scoped would
 * have quietly exempted it from the deletion cascade below, which is the
 * invariant that matters most.
 *
 * The distinction it draws is recipient versus subject: `user_id` and
 * `learner_id` are who reads a row, `about_learner_id` is who it concerns. The
 * assertions below are written against that.
 */
const DUAL_AUDIENCE = ['notifications'] as const;

/** Tables holding data about an authenticating adult, or about content. */
const NOT_LEARNER_SCOPED = [
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

  it.each(DUAL_AUDIENCE)('%s records the child it concerns separately', tableName => {
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
        // `institution_id` has no table yet; it is filled by the LMS work that
        // Graft D defers, and is unconstrained until then.
        //
        // `external_id` is not a reference at all — it is the id a problem had
        // in the corpus it was imported from, which is what makes a re-import
        // idempotent. There is nothing in this database for it to point at.
        const exempt = column.name === 'institution_id' || column.name === 'external_id';
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
