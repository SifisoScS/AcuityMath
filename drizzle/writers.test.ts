// @vitest-environment node

/**
 * Every table in the schema has something that writes to it.
 *
 * Three times in this project a table was designed, migrated, read from and
 * shown to a user, while **nothing ever wrote a row into it**. Each one shipped
 * a claim that was false, each survived for weeks, and each was found by a
 * person happening to look:
 *
 * - `learner_rewards` — every child's coins, XP and streak read zero on every
 *   dashboard, and buying an avatar did nothing. Fixed in PR #22.
 * - `consent_events` — the application told a parent their consent was
 *   recorded, and it was not. Fixed in PR #23.
 * - `screen_time_usage` — a parent set a daily limit, was shown a confirming
 *   toast, saw the limit displayed back, and no child was ever locked out.
 *   Fixed in PR #25. The comment above the table read "the heartbeat writes
 *   here".
 *
 * Run against this branch's history, the check below reports three writerless
 * tables at `d634956`, two after #22, one after #23, and none now. It would have
 * caught all three the day they were merged.
 *
 * A read-only table is not inherently wrong. A table nobody writes to *and
 * nobody noticed* is, and that is the state this makes impossible to reach
 * quietly.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** Every `mysqlTable` the schema declares, by its exported name. */
const schemaSource = readFileSync(join(ROOT, 'drizzle/schema.ts'), 'utf-8');
const tables = [...schemaSource.matchAll(/export const (\w+) = mysqlTable\(/g)].map(
  match => match[1],
);

/**
 * Everything that could legitimately write a row.
 *
 * `server` and `scripts` — the seeds are real writers, and a curriculum table
 * filled only by `seed-curriculum` is doing its job. Tests are excluded on
 * purpose: a table written *only* by its own test is the exact failure this
 * looks for, and counting the test as a writer would hide it.
 */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!/node_modules|dist/.test(entry.name)) sourceFiles(relative, found);
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

const productionSource = [...sourceFiles('server'), ...sourceFiles('scripts')]
  .map(file => readFileSync(join(ROOT, file), 'utf-8'))
  .join('\n');

function hasWriter(table: string): boolean {
  return new RegExp(`insert\\(\\s*(schema\\.)?${table}\\b`).test(productionSource);
}

/**
 * Tables deliberately left without a writer, with the reason.
 *
 * **Empty, and worth keeping empty.** Adding a name here is a deliberate act
 * that says "this table is designed and nothing fills it, and we know" — which
 * is a defensible thing to say once, in writing, and an indefensible thing to
 * discover eighteen months later on a dashboard showing a parent a zero.
 */
const DELIBERATELY_UNWRITTEN: Array<{ table: string; why: string }> = [];

describe('every table has a writer', () => {
  /*
   * Guarding the guard, without an exact count.
   *
   * The route inventory in `server/legacyApi.test.ts` pins an exact number
   * because that surface only ever shrinks. Tables grow, so a number here would
   * rot into a chore and then into a rubber stamp — and a `toBeGreaterThan`
   * floor is the shape that already fooled this project once.
   *
   * The mechanism is checked instead of the magnitude: the parser must find a
   * table it is known to contain, the detector must find a writer that is known
   * to exist, and it must *not* find one for a name that cannot have one. If any
   * of those three break, the assertion below is passing on an empty list.
   */
  it('can find tables, find writers, and miss what is absent', () => {
    expect(tables).toContain('learners');
    expect(hasWriter('learners')).toBe(true);
    expect(hasWriter('aTableThatDoesNotExist')).toBe(false);
  });

  it('counts the seeds as writers', () => {
    // `learner_rewards` is written by the demo seed as well as by the reward
    // rules. A schema-only table filled by a seed script is doing its job, and
    // treating seeds as non-writers would make this test demand duplicate work.
    expect(sourceFiles('scripts').some(f => f.includes('seed-demo-family'))).toBe(true);
  });

  it.each(tables)('%s is written by something outside its own tests', table => {
    const excused = DELIBERATELY_UNWRITTEN.find(entry => entry.table === table);
    if (excused) {
      expect(hasWriter(table), `${table} is excused but now has a writer; drop the excuse`).toBe(
        false,
      );
      return;
    }

    expect(
      hasWriter(table),
      `Nothing writes to ${table}. Three tables have reached production in this ` +
        `state and each one shipped a false claim to a parent: learner_rewards ` +
        `showed every child zero coins, consent_events reported consent that was ` +
        `never recorded, screen_time_usage let a limit be set and never enforced. ` +
        `Either give it a writer, or add it to DELIBERATELY_UNWRITTEN with a reason.`,
    ).toBe(true);
  });
});
