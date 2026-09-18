/**
 * A district's pupils, as a file somebody opens in Excel.
 *
 * The roadmap has called this "CSV export" since §8 was written, and the thing
 * worth deciding was never the format. It is **what belongs in a single file
 * containing every child in a district**.
 *
 * E2's export is one child, everything: every answer, every session, every
 * message. That is the right shape for a record request about a named pupil and
 * the wrong shape entirely for a thousand of them — nobody reads it, and it
 * would be the largest disclosure this product is capable of making, assembled
 * by a click.
 *
 * So this is one row per pupil and a dozen columns: who they are, where they
 * are, how much of their year group they have covered. Enough for the questions
 * a district actually asks — *which campus is behind*, *who has never started* —
 * and not a copy of their work. Somebody who needs a particular child's history
 * uses E2, through E4's panel, one child at a time, deliberately.
 *
 * It sits behind step-up for the same reason those do, and more so: this is
 * every child at once.
 */

import { eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { curriculumCoverage } from '../lti/coverage';
import { toCsv, type CsvColumn } from './csv';

type Db = MySql2Database<typeof schema>;

export interface DistrictPupilRow {
  learnerId: number;
  displayName: string;
  birthYear: number;
  /** Campuses reached through the classes they are enrolled in. May be empty. */
  campuses: string;
  classes: string;
  /** Out of 100, or null when their year group has no authored concepts. */
  coveragePercent: number | null;
  conceptsTouched: number | null;
  conceptsInYearGroup: number | null;
  status: 'active' | 'archived';
  /** Why they are archived, when they are. See `learners.archived_reason`. */
  archivedReason: string | null;
  createdAt: Date;
}

/**
 * The columns, and their order.
 *
 * Named so a spreadsheet is readable without this file open beside it —
 * `conceptsInYearGroup` is a field name, "Concepts in year group" is what an
 * administrator needs to see above a column of numbers.
 */
export const DISTRICT_PUPIL_COLUMNS: ReadonlyArray<CsvColumn<DistrictPupilRow>> = [
  { header: 'Pupil ID', value: row => row.learnerId },
  { header: 'Name', value: row => row.displayName },
  { header: 'Birth year', value: row => row.birthYear },
  { header: 'Campus', value: row => row.campuses },
  { header: 'Classes', value: row => row.classes },
  { header: 'Coverage %', value: row => row.coveragePercent },
  { header: 'Concepts started', value: row => row.conceptsTouched },
  { header: 'Concepts in year group', value: row => row.conceptsInYearGroup },
  { header: 'Status', value: row => row.status },
  { header: 'Archived because', value: row => row.archivedReason },
  { header: 'Added', value: row => row.createdAt },
];

/**
 * Every pupil a district owns, with the numbers the console shows.
 *
 * **Archived pupils are included and marked**, the same call E4 made about the
 * records panel: a child who left last term is exactly who a question arrives
 * about, and a file that silently omits them answers that question wrongly
 * while looking complete.
 *
 * Coverage is `curriculumCoverage` — C5b's function, the one that decides what a
 * gradebook column headed *AcuityMath* means. Computing a second, differently
 * defined percentage for a spreadsheet is how a district ends up with two
 * numbers for one child and no way to tell which is right.
 */
export async function districtPupilRows(
  db: Db,
  institutionId: number,
  now: Date = new Date(),
): Promise<DistrictPupilRow[]> {
  const pupils = await db
    .select({
      id: schema.learners.id,
      displayName: schema.learners.displayName,
      birthYear: schema.learners.birthYear,
      archivedAt: schema.learners.archivedAt,
      archivedReason: schema.learners.archivedReason,
      createdAt: schema.learners.createdAt,
    })
    .from(schema.learners)
    .where(eq(schema.learners.institutionId, institutionId))
    .orderBy(schema.learners.displayName);

  if (pupils.length === 0) return [];

  /*
   * Class membership in one query rather than one per pupil. A district of
   * fifty thousand children is the case this has to survive, and a query per
   * child is the shape that works in a demo and times out in a county.
   */
  const memberships = await db
    .select({
      learnerId: schema.classroomLearners.learnerId,
      className: schema.classrooms.name,
      campusName: schema.schools.name,
    })
    .from(schema.classroomLearners)
    .innerJoin(
      schema.classrooms,
      eq(schema.classroomLearners.classroomId, schema.classrooms.id),
    )
    .leftJoin(schema.schools, eq(schema.classrooms.schoolId, schema.schools.id))
    .where(
      inArray(
        schema.classroomLearners.learnerId,
        pupils.map(pupil => pupil.id),
      ),
    );

  const classesFor = new Map<number, Set<string>>();
  const campusesFor = new Map<number, Set<string>>();
  for (const row of memberships) {
    if (!classesFor.has(row.learnerId)) classesFor.set(row.learnerId, new Set());
    classesFor.get(row.learnerId)!.add(row.className);

    /*
     * A classroom may have no campus — `classrooms.school_id` is nullable so a
     * teacher who signed up on their own keeps a class belonging to nobody but
     * them. Those contribute a class and no campus, rather than a campus named
     * "null".
     */
    if (row.campusName) {
      if (!campusesFor.has(row.learnerId)) campusesFor.set(row.learnerId, new Set());
      campusesFor.get(row.learnerId)!.add(row.campusName);
    }
  }

  const rows: DistrictPupilRow[] = [];
  for (const pupil of pupils) {
    const coverage = await curriculumCoverage(db, pupil.id, now);

    rows.push({
      learnerId: pupil.id,
      displayName: pupil.displayName,
      birthYear: pupil.birthYear,
      /*
       * Semicolons, not commas. A comma would be quoted correctly and still
       * read as a list separator by a human skimming a column that already uses
       * commas to mean something else.
       */
      campuses: [...(campusesFor.get(pupil.id) ?? [])].sort().join('; '),
      classes: [...(classesFor.get(pupil.id) ?? [])].sort().join('; '),
      /*
       * Null, not zero, when the year group has no authored concepts — C5b's
       * distinction, and it matters more in a spreadsheet than anywhere else.
       * A column of zeros invites somebody to average it, and age 7 would drag
       * a district's figure down for a curriculum that does not exist yet.
       */
      coveragePercent: coverage?.percent ?? null,
      conceptsTouched: coverage?.conceptsTouched ?? null,
      conceptsInYearGroup: coverage?.conceptsInTier ?? null,
      status: pupil.archivedAt ? 'archived' : 'active',
      archivedReason: pupil.archivedReason,
      createdAt: pupil.createdAt,
    });
  }

  return rows;
}

/** The file itself. */
export async function districtPupilCsv(
  db: Db,
  institutionId: number,
  now: Date = new Date(),
): Promise<string> {
  return toCsv(await districtPupilRows(db, institutionId, now), DISTRICT_PUPIL_COLUMNS);
}

/**
 * What the file is called.
 *
 * The district's slug and the date, and **no child's name** — E4's rule, which
 * applies with more force here: a filename sits in a Downloads folder, appears
 * in a file picker during a screen share, and is read by people who were never
 * meant to open it. That a file names a district is unavoidable, since that is
 * whose file it is.
 */
export async function districtCsvFilename(
  db: Db,
  institutionId: number,
  now: Date = new Date(),
): Promise<string> {
  const [institution] = await db
    .select({ slug: schema.institutions.slug })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .limit(1);

  const slug = institution?.slug ?? String(institutionId);
  return `acuitymath-${slug}-pupils-${now.toISOString().slice(0, 10)}.csv`;
}
