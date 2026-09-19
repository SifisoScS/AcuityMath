/**
 * The authored corpus integrity gate.
 *
 *   pnpm audit:corpus
 *
 * Its sibling `audit-generator.ts` samples `ProblemGenerator` and hands the
 * sample to SymPy. This does the same for the 1,132 problems a person wrote —
 * which, until now, nothing checked mathematically at all.
 *
 * **Every problem, not a sample.** The generator is sampled because it is
 * infinite; the corpus is finite and each item is a question a specific child
 * will be asked. There is no reason to check 240 of them and hope.
 *
 * **It reports and never fixes.** A gate that corrected the answer it objected
 * to would be replacing the defect it detected, and the record of what was
 * wrong would vanish with it.
 */

import 'dotenv/config';

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadAllStrands } from '../server/curriculum/sources';
import {
  POSITION_LIMIT,
  crossCheck,
  lopsidedTypes,
  modeOf,
  verifyFigure,
  type VerificationInput,
  type VerificationResult,
} from '../server/curriculum/corpusVerification';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPORT_PATH = path.join(ROOT, 'data', 'corpus-verification.json');

function resolvePython(): string {
  // Spelled three ways across the platforms this runs on, as audit-generator
  // already records: python3 on CI, python on a Windows install, py when only
  // the launcher is on PATH.
  for (const candidate of ['python3', 'python', 'py']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      /* try the next spelling */
    }
  }
  throw new Error('No Python interpreter found (tried python3, python, py).');
}

function toInput(problem: Record<string, unknown>): VerificationInput {
  const visual = problem.visual as { prompt?: { figures?: unknown } } | undefined;
  const figures = visual?.prompt?.figures;

  return {
    externalId: String(problem.id),
    conceptId: String(problem.concept_id),
    problemType: String(problem.problem_type ?? 'unknown'),
    prompt: String(problem.prompt ?? ''),
    answer: String(problem.answer ?? ''),
    choices: Array.isArray(problem.choices) ? (problem.choices as string[]) : null,
    verification: (problem.verification ?? {}) as Record<string, unknown>,
    promptFigures: Array.isArray(figures)
      ? (figures as Array<Record<string, unknown>>)
      : null,
  };
}

async function main(): Promise<void> {
  const problems = loadAllStrands()
    .flatMap(strand => strand.curriculum.problems ?? [])
    .map(problem => toInput(problem as unknown as Record<string, unknown>));

  console.log(`Verifying ${problems.length} authored problems.\n`);

  // --- expressions, via SymPy ----------------------------------------------
  const symbolic = problems.filter(problem => modeOf(problem.verification) === 'sympy');
  const evaluated = new Map<string, { value?: number; error?: string }>();

  if (symbolic.length > 0) {
    const request = symbolic.map(problem => ({
      id: problem.externalId,
      expression: String(problem.verification.expression ?? ''),
    }));

    const raw = execFileSync(
      resolvePython(),
      [path.join(ROOT, 'scripts', 'verify_authored.py')],
      { input: JSON.stringify(request), encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
    );

    const parsed = JSON.parse(raw) as Array<{ id: string; value?: number; error?: string }>;
    if (!Array.isArray(parsed)) throw new Error(`verify_authored.py returned ${raw.slice(0, 200)}`);
    for (const row of parsed) evaluated.set(row.id, row);

    /*
     * Every expression sent must come back. A shorter reply means problems were
     * silently dropped, and a gate that checks fewer items than it was given
     * while still reporting success is the exact failure this file exists to
     * prevent.
     */
    if (parsed.length !== symbolic.length) {
      console.error(
        `  FAIL sent ${symbolic.length} expressions and received ${parsed.length}`,
      );
      process.exit(1);
    }
  }

  // --- decide every problem -------------------------------------------------
  const results: VerificationResult[] = problems.map(problem => {
    const mode = modeOf(problem.verification);

    if (mode === 'figure') return verifyFigure(problem);

    if (mode === 'sympy') {
      const outcome = evaluated.get(problem.externalId);
      return crossCheck(problem, outcome?.value ?? null, outcome?.error);
    }

    return {
      externalId: problem.externalId,
      conceptId: problem.conceptId,
      tier: 'structural' as const,
      outcome: 'unverifiable' as const,
      reason: 'no expression and no measurements — correctness cannot be decided mechanically',
    };
  });

  const verified = results.filter(r => r.outcome === 'verified');
  const failed = results.filter(r => r.outcome === 'failed');
  const unverifiable = results.filter(r => r.outcome === 'unverifiable');

  console.log('Answer verification');
  console.log(`  verified      ${String(verified.length).padStart(5)}`);
  console.log(`  failed        ${String(failed.length).padStart(5)}`);
  console.log(`  unverifiable  ${String(unverifiable.length).padStart(5)}   (named, not folded into a percentage)`);

  if (failed.length > 0) {
    console.error(`\n  FAIL ${failed.length} problem(s) whose answer does not survive its own data:`);
    for (const result of failed) {
      console.error(`    - ${result.externalId}: ${result.reason}`);
    }
  }

  // --- answer position ------------------------------------------------------
  const lopsided = lopsidedTypes(problems);

  console.log('\nAnswer position');
  if (lopsided.length === 0) {
    console.log('  OK no problem type puts its answer in one place more than ' +
      `${Math.round(POSITION_LIMIT * 100)}% of the time`);
  } else {
    console.error(`  FAIL ${lopsided.length} problem type(s) barely vary the answer's position:`);
    for (const entry of lopsided) {
      console.error(
        `    - ${entry.type}: ${Math.round(entry.share * 100)}% of ${entry.problems} in one position ` +
          '— a child who always taps that option scores without doing the mathematics',
      );
    }
  }

  /*
   * A deterministic summary, tracked in git beside `generator-validation.json`.
   *
   * **No timestamp.** A report that changes on every run diffs on every run,
   * and a diff that always moves is one nobody reads. This one changes only
   * when the corpus does — so the file is a record of the corpus's state, and
   * `git diff` on it answers "what did that edit do to the content".
   *
   * Per-problem outcomes are summarised rather than listed: 1,132 rows would
   * bury the twelve that matter. The failures are named in full, because a
   * count is a proxy and an id is the thing.
   */
  const byTier = (tier: string) => ({
    verified: results.filter(r => r.tier === tier && r.outcome === 'verified').length,
    failed: results.filter(r => r.tier === tier && r.outcome === 'failed').length,
    unverifiable: results.filter(r => r.tier === tier && r.outcome === 'unverifiable').length,
  });

  const report = {
    problems: results.length,
    verified: verified.length,
    failed: failed.length,
    unverifiable: unverifiable.length,
    by_tier: {
      sympy: byTier('sympy'),
      figure: byTier('figure'),
      structural: byTier('structural'),
    },
    failures: failed
      .map(r => ({ id: r.externalId, concept: r.conceptId, reason: r.reason }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    lopsided_problem_types: lopsided.map(entry => ({
      type: entry.type,
      problems: entry.problems,
      share_in_one_position: Number(entry.share.toFixed(4)),
    })),
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`\nReport written to ${path.relative(ROOT, REPORT_PATH)}`);

  // --- is the database serving this corpus? ---------------------------------

  /*
   * **The gate's guarantee used to stop at the file.** Everything above reads
   * `data/curriculum/*.json`; none of it looks at a database. So a database
   * seeded from an older corpus serves whatever it was seeded with and this
   * script stays green — which is exactly what happened after F0b repaired
   * twelve pictures and nobody re-seeded.
   *
   * Checked only when `DATABASE_URL` is set, and **only `stale` fails.**
   *
   * That split is the whole design. CI sets `DATABASE_URL` for the integration
   * suites and never seeds, so a never-seeded database is its ordinary state —
   * failing on it would turn a content check into an infrastructure
   * requirement, and the usual outcome of that is somebody deleting the check.
   *
   * `stale` is a different statement: this database *was* seeded, from a corpus
   * that no longer exists. That is the defect F0b left behind — twelve repaired
   * pictures on disk and the old ones still being served — and it cannot happen
   * by accident of environment.
   *
   * An unseeded *deployment* is a real problem, and it is caught where it
   * matters: `server.ts` says so at boot.
   */
  let seedStale = false;
  if (process.env.DATABASE_URL) {
    const { getDatabase, closeDatabase } = await import('../server/db/client');
    const { seededFingerprint } = await import('../server/curriculum/seedCurriculum');
    const { compareSeed, describeSeedState } = await import(
      '../server/curriculum/corpusFingerprint'
    );

    console.log('\nDatabase');
    try {
      const state = compareSeed(await seededFingerprint(getDatabase()));
      if (state.state === 'stale') {
        console.error(`  FAIL ${describeSeedState(state)}`);
        seedStale = true;
      } else if (state.state === 'current') {
        console.log(`  OK ${describeSeedState(state)}`);
      } else {
        /*
         * Never-seeded and unanswerable are both reported and neither fails.
         * They are printed in their own words rather than as OK, because the
         * one thing worse than not checking is claiming to have checked.
         */
        console.log(`  ${describeSeedState(state)}`);
      }
    } finally {
      await closeDatabase().catch(() => {});
    }
  } else {
    console.log('\nDatabase\n  skipped — DATABASE_URL is unset, so there is nothing to compare against');
  }

  if (failed.length > 0 || lopsided.length > 0 || seedStale) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
