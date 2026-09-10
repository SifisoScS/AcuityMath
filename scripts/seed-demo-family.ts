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
/**
 * A second account, because the surfaces are gated by role and one account has
 * one role. The demonstration parent is a parent — showing the district command
 * centre by making her an administrator would demonstrate a product whose
 * access control does not work.
 */
export const DEMO_ADMIN_EMAIL = 'demo-admin@acuitymath.local';
/**
 * A teacher, with a classroom holding two of the four children.
 *
 * Two rather than four on purpose. A teacher reaches a learner through a
 * classroom they teach and through nothing else, so a demonstration where the
 * teacher can set work for every child in the database would demonstrate the
 * opposite of the rule.
 */
export const DEMO_TEACHER_EMAIL = 'demo-teacher@acuitymath.local';
const DEMO_CLASSROOM = 'Room 4 - Algebra Voyagers';
/** The children in that classroom; the other two are only Sarah's. */
const CLASSROOM_CHILDREN = ['Leo', 'Alexander'];
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

  const [existingAdmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_ADMIN_EMAIL))
    .limit(1);
  if (!existingAdmin) {
    await db
      .insert(schema.users)
      .values({ email: DEMO_ADMIN_EMAIL, name: 'Dr. Adaeze Okonkwo', role: 'admin' });
  }
  const [admin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_ADMIN_EMAIL))
    .limit(1);
  await setStepUpPin(db, admin.id, DEMO_PIN);

  const [existingTeacher] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_TEACHER_EMAIL))
    .limit(1);
  if (!existingTeacher) {
    await db
      .insert(schema.users)
      .values({ email: DEMO_TEACHER_EMAIL, name: 'Mr. Henderson', role: 'teacher' });
  }
  const [teacher] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_TEACHER_EMAIL))
    .limit(1);
  await setStepUpPin(db, teacher.id, DEMO_PIN);

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

  // The classroom, and who is in it.
  const [existingRoom] = await db
    .select()
    .from(schema.classrooms)
    .where(eq(schema.classrooms.teacherId, teacher.id))
    .limit(1);
  if (!existingRoom) {
    await db.insert(schema.classrooms).values({ teacherId: teacher.id, name: DEMO_CLASSROOM });
  }
  const [room] = await db
    .select()
    .from(schema.classrooms)
    .where(eq(schema.classrooms.teacherId, teacher.id))
    .limit(1);

  const enrolled = await db
    .select()
    .from(schema.classroomLearners)
    .where(eq(schema.classroomLearners.classroomId, room.id));

  for (const name of CLASSROOM_CHILDREN) {
    const learner = learnerIds.find(row => row.name === name);
    if (!learner) continue;
    if (enrolled.some(row => row.learnerId === learner.id)) continue;
    await db
      .insert(schema.classroomLearners)
      .values({ classroomId: room.id, learnerId: learner.id });
  }

  return {
    guardianId: guardian.id,
    teacherId: teacher.id,
    classroom: { id: room.id, name: DEMO_CLASSROOM, children: CLASSROOM_CHILDREN },
    learners: learnerIds,
    pin: DEMO_PIN
  };
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
  console.log(
    `  classroom   ${result.classroom.name} (id ${result.classroom.id}): ${result.classroom.children.join(', ')}`
  );
  console.log(`\n  Sign in as the parent : DEV_AUTH_EMAIL=${DEMO_EMAIL}`);
  console.log(`  Sign in as the teacher: DEV_AUTH_EMAIL=${DEMO_TEACHER_EMAIL}`);
  console.log(`  Sign in as the admin  : DEV_AUTH_EMAIL=${DEMO_ADMIN_EMAIL}`);
  console.log('  Same step-up PIN on all three. Their roles differ, so the surfaces they reach differ.');
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
