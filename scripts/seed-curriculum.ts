/**
 * Seeds the imported curriculum.
 *
 *   pnpm db:seed
 *
 * Idempotent — run it as often as you like. Requires DATABASE_URL and a
 * migrated database.
 */

import 'dotenv/config';

import { closeDatabase, getDatabase } from '../server/db/client';
import {
  curriculumCounts,
  recordCorpusFingerprint,
  seedCurriculum,
} from '../server/curriculum/seedCurriculum';

async function main() {
  const db = getDatabase();
  const started = Date.now();

  console.log('Seeding curriculum...');
  const report = await seedCurriculum(db);

  console.log(`  concepts        ${report.concepts}`);
  console.log(`  prerequisites   ${report.prerequisites}`);
  console.log(`  problems        ${report.problems}`);
  console.log(`  distractors     ${report.distractors}`);
  console.log(`  hints           ${report.hints}`);
  console.log(`  hint error tags ${report.hintErrorModes}`);

  /*
   * Recorded after the content, so a seed that fails part way leaves no
   * fingerprint. One that claimed a half-seeded database was current would be
   * worse than a stale one, because it would look checked.
   */
  const fingerprint = await recordCorpusFingerprint(db);
  console.log(`  corpus          ${fingerprint.slice(0, 12)}…`);

  const counts = await curriculumCounts(db);
  console.log(`\nIn the database now: ${counts.concepts} concepts, ${counts.authoredProblems} authored problems, ${counts.hints} hints.`);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);

  await closeDatabase();
}

main().catch(async error => {
  console.error('Seed failed:', error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
