/**
 * The generator integrity gate, end to end.
 *
 *   pnpm audit:generator
 *
 * Draws a deterministic sample, runs the structural invariants in process, then
 * hands the same sample to SymPy for mathematical verification. Writes the
 * sample and the report to `data/` so a CI failure can be inspected as an
 * artifact rather than reconstructed from a log.
 *
 * Exits non-zero if either gate fails. Both always run: knowing only that
 * "something failed" costs a second round trip, and the two gates catch
 * different classes of defect.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { drawSample } from './generator-sample';
import { findViolations, findUncoveredKinds, findUndeclaredKinds, summarise } from './generator-invariants';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SAMPLE_PATH = path.join(DATA_DIR, 'generator-sample.json');
const REPORT_PATH = path.join(DATA_DIR, 'generator-validation.json');

/**
 * Python is spelled differently on the three platforms this has to run on:
 * `python3` on the CI runner, `python` under a Windows install, `py` when only
 * the launcher is on PATH.
 */
function resolvePython(): string {
  for (const candidate of ['python3', 'python', 'py']) {
    try {
      execFileSync(candidate, ['-c', 'import sympy'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Either the interpreter is absent or SymPy is not installed in it.
      // Both mean "not this one"; try the next.
    }
  }
  throw new Error(
    'No Python interpreter with SymPy on PATH. Install it with `pip install sympy` — ' +
      'the mathematical half of this gate cannot be skipped.',
  );
}

function main(): void {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log('Drawing deterministic sample...');
  const sample = drawSample();
  writeFileSync(SAMPLE_PATH, `${JSON.stringify(sample, null, 2)}\n`, 'utf-8');
  console.log(`  ${sample.length} problems across ${new Set(sample.map(p => p.kind)).size} variants`);

  let failed = false;

  // --- gate 1: structure ---------------------------------------------------
  console.log('\nStructural invariants');

  const uncovered = findUncoveredKinds(sample);
  const undeclared = findUndeclaredKinds(sample);
  if (uncovered.length) {
    console.error(`  FAIL declared variant never drawn: ${uncovered.join(', ')}`);
    failed = true;
  }
  if (undeclared.length) {
    console.error(`  FAIL variant drawn but not declared: ${undeclared.join(', ')}`);
    failed = true;
  }

  const violations = findViolations(sample);
  if (violations.length === 0) {
    console.log(`  OK ${sample.length} problems, no violations`);
  } else {
    console.error(`  FAIL ${violations.length} violation(s)`);
    for (const line of summarise(violations)) console.error(`    - ${line}`);
    failed = true;
  }

  // --- gate 2: mathematics -------------------------------------------------
  console.log('\nSymPy verification');
  const python = resolvePython();
  try {
    const output = execFileSync(python, [path.join(ROOT, 'scripts', 'verify_generated.py'), SAMPLE_PATH, REPORT_PATH], {
      encoding: 'utf-8',
    });
    process.stdout.write(indent(output));
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    if (err.stdout) process.stdout.write(indent(err.stdout));
    if (err.stderr) process.stderr.write(indent(err.stderr));
    failed = true;
  }

  if (existsSync(REPORT_PATH)) {
    const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
    console.log(`\nReport written to data/generator-validation.json (passed: ${report.passed})`);
  }

  if (failed) {
    console.error('\nGenerator integrity gate FAILED.');
    process.exit(1);
  }
  console.log('\nGenerator integrity gate passed.');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map(line => (line ? `  ${line}` : line))
    .join('\n');
}

main();
