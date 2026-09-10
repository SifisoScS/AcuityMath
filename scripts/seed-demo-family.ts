/**
 * A demonstration family, as real rows.
 *
 *   pnpm db:seed:demo
 *
 * Moving profiles onto the server takes away the click-around demo that lived
 * in `localStorage` — a signed-out visitor now sees a sign-in prompt rather than
 * four invented children, which is correct for a product holding children's
 * records and unhelpful when somebody wants to see the thing work.
 *
 * So the demo comes back as real data: a real guardian, four real learners, and
 * real attempts recorded through the same pipeline a child's answer goes
 * through. Nothing here is a special case in the application — it is the
 * application, with rows in it.
 *
 * Pair it with `DEV_AUTH_EMAIL=demo@acuitymath.local`.
 */

import 'dotenv/config';

import { eq } from 'drizzle-orm';

import * as schema from '../drizzle/schema';
import { setStepUpPin } from '../server/auth/pin';
import { ensureGeneratorConcepts, serveNextProblem } from '../server/learning/serveProblem';
import { recordAttempt } from '../server/learning/recordAttempt';
import { closeDatabase, getDatabase, type Database } from '../server/db/client';

export const DEMO_EMAIL = 'demo@acuitymath.local';
const DEMO_PIN = '8317';

const CHILDREN = [
  { displayName: 'Maya', birthYear: 2021, avatar: '🦊', answers: 6 },
  { displayName: 'Leo', birthYear: 2017, avatar: '🤖', answers: 14 },
  { displayName: 'Sophia', birthYear: 2013, avatar: '⚡', answers: 10 },
  { displayName: 'Alexander', birthYear: 2010, avatar: '🧑‍🚀', answers: 18 },
];

/**
 * Idempotent, like the curriculum seed. A demo you are frightened to re-run is
 * a demo that drifts from the application it is demonstrating.
 */
export async function seedDemoFamily(db: Database) {
  await ensureGeneratorConcepts(db);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL)).limit(1);
  if (!existing) {
    await db.insert(schema.users).values({ email: DEMO_EMAIL, name: 'Sarah Jenkins', role: 'parent' });
  }
  const [guardian] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL)).limit(1);

  await setStepUpPin(db, guardian.id, DEMO_PIN);

  const learnerIds: { name: string; id: number; answers: number }[] = [];

  for (const child of CHILDREN) {
    const mine = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, guardian.id));
    let learner = mine.find(row => row.displayName === child.displayName);

    if (!learner) {
      await db.insert(schema.learners).values({
        guardianId: guardian.id,
        displayName: child.displayName,
        birthYear: child.birthYear,
        avatar: child.avatar,
      });
      const refreshed = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.guardianId, guardian.id));
      learner = refreshed.find(row => row.displayName === child.displayName)!;
    }

    learnerIds.push({ name: child.displayName, id: learner.id, answers: child.answers });
  }

  // Give each child a history, through the real pipeline. A dashboard reading
  // zeroes is technically honest and demonstrates nothing.
  for (const { id, answers } of learnerIds) {
    const [already] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.learnerId, id))
      .limit(1);
    if (already) continue;

    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, id)).limit(1);

    for (let i = 0; i < answers; i++) {
      const problem = await serveNextProblem(db, learner);
      const [stored] = await db
        .select({ answer: schema.problems.answer, choices: schema.problems.choices })
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId))
        .limit(1);

      // Roughly three in four right, so mastery lands somewhere interesting
      // rather than at either end.
      const correct = i % 4 !== 3;
      const wrong = (stored.choices as string[] | null)?.find(c => c !== stored.answer) ?? 'not-the-answer';

      await recordAttempt(db, {
        learnerId: id,
        problemId: problem.problemId,
        submittedAnswer: correct ? stored.answer : wrong,
        responseTimeMs: 3_000 + ((i * 977) % 9_000),
      });
    }
  }

  return { guardianId: guardian.id, learners: learnerIds, pin: DEMO_PIN };
}

async function main() {
  const db = getDatabase();
  const started = Date.now();

  console.log('Seeding the demonstration family...');
  const result = await seedDemoFamily(db);

  console.log(`  guardian    ${DEMO_EMAIL} (id ${result.guardianId})`);
  console.log(`  step-up PIN ${result.pin}`);
  for (const learner of result.learners) {
    console.log(`  learner     ${learner.name} (id ${learner.id}), ${learner.answers} answers`);
  }
  console.log(`\nRun the app with DEV_AUTH_EMAIL=${DEMO_EMAIL} to sign in as them.`);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);

  await closeDatabase();
}

// Only when invoked directly, so the seeding function can be imported by tests.
if (process.argv[1]?.includes('seed-demo-family')) {
  main().catch(async error => {
    console.error('Demo seed failed:', error);
    await closeDatabase().catch(() => {});
    process.exit(1);
  });
}
