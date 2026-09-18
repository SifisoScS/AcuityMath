// @vitest-environment node

/**
 * The file a district downloads, against real rows.
 *
 * The decision under test is **what belongs in one file containing every child
 * in a district** — a summary per pupil rather than a copy of their work, and
 * every column derived from something that already exists rather than computed
 * a second way for a spreadsheet.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution, createSchool } from './institutions';
import { createDistrictLearner } from './districtLearners';
import {
  DISTRICT_PUPIL_COLUMNS,
  districtCsvFilename,
  districtPupilCsv,
  districtPupilRows,
} from './districtCsv';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const NOW = new Date('2026-03-01T12:00:00Z');

describeWithDb('a district’s pupils as a spreadsheet', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let madison: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('districtcsv');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
    lincoln = await createInstitution(db, 'Lincoln Unified');
    madison = await createInstitution(db, 'Madison Unified');
  });

  const pupil = (displayName: string, birthYear = 2016, institutionId = lincoln.id) =>
    createDistrictLearner(db, { institutionId, displayName, birthYear });

  /** A teacher and a class, so enrolment has somewhere to happen. */
  async function classroom(name: string, schoolId: number | null) {
    await db
      .insert(schema.users)
      .values({ email: `${name.replace(/\W/g, '')}@lincoln.test`, role: 'teacher' });
    const [teacher] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, `${name.replace(/\W/g, '')}@lincoln.test`))
      .limit(1);

    await db.insert(schema.classrooms).values({ teacherId: teacher.id, schoolId, name });
    const [room] = await db
      .select()
      .from(schema.classrooms)
      .where(eq(schema.classrooms.name, name))
      .limit(1);
    return room;
  }

  describe('who is in it', () => {
    it('lists only this district’s own pupils', async () => {
      /*
       * Children the district **owns**, not children it can reach. The second
       * set would include the families of its own staff, which is a different
       * thing and not the district's to report on — the same distinction
       * `overview` makes about its pupil count.
       */
      await pupil('Ada');
      await pupil('Bram', 2016, madison.id);

      const rows = await districtPupilRows(db, lincoln.id, NOW);
      expect(rows.map(row => row.displayName)).toEqual(['Ada']);
    });

    it('includes an archived pupil, and marks them', async () => {
      /*
       * E4's call, restated. A child who left last term is exactly who a
       * question arrives about, and a file that silently omits them answers
       * that question wrongly while looking complete.
       */
      const cleo = await pupil('Cleo');
      await db
        .update(schema.learners)
        .set({ archivedAt: NOW, archivedReason: 'roster_departure' })
        .where(eq(schema.learners.id, cleo.id));

      const rows = await districtPupilRows(db, lincoln.id, NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('archived');
      expect(rows[0].archivedReason).toBe('roster_departure');
    });

    it('says why a child is hidden, which is a different answer each way', async () => {
      // `requested` means somebody asked; `roster_departure` means a SIS said
      // they had gone. A district chasing one of those is not chasing the other.
      const ada = await pupil('Ada');
      await db
        .update(schema.learners)
        .set({ archivedAt: NOW, archivedReason: 'requested' })
        .where(eq(schema.learners.id, ada.id));

      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.archivedReason).toBe('requested');
    });

    it('is ordered by name, so two exports of the same data match', async () => {
      await pupil('Cleo');
      await pupil('Ada');
      await pupil('Bram');

      const rows = await districtPupilRows(db, lincoln.id, NOW);
      expect(rows.map(row => row.displayName)).toEqual(['Ada', 'Bram', 'Cleo']);
    });
  });

  describe('where they are', () => {
    it('names the campus reached through their class', async () => {
      const elm = await createSchool(db, lincoln.id, 'Elm Street Elementary');
      const room = await classroom('Grade 4 Mathematics', elm.id);
      const ada = await pupil('Ada');
      await db
        .insert(schema.classroomLearners)
        .values({ classroomId: room.id, learnerId: ada.id });

      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.campuses).toBe('Elm Street Elementary');
      expect(row.classes).toBe('Grade 4 Mathematics');
    });

    it('lists several campuses separated by semicolons, not commas', async () => {
      /*
       * A comma would be quoted correctly and still read as a list separator by
       * a human skimming a column in a file that already uses commas to mean
       * something else.
       */
      const elm = await createSchool(db, lincoln.id, 'Elm Street');
      const oak = await createSchool(db, lincoln.id, 'Oak Ridge');
      const first = await classroom('Maths', elm.id);
      const second = await classroom('Science', oak.id);
      const ada = await pupil('Ada');
      await db.insert(schema.classroomLearners).values([
        { classroomId: first.id, learnerId: ada.id },
        { classroomId: second.id, learnerId: ada.id },
      ]);

      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.campuses).toBe('Elm Street; Oak Ridge');
    });

    it('leaves the campus empty for a class that belongs to no campus', async () => {
      /*
       * `classrooms.school_id` is nullable so a teacher who signed up on their
       * own keeps a class belonging to nobody but them. That contributes a
       * class and no campus, rather than a campus named "null".
       */
      const room = await classroom('Independent Class', null);
      const ada = await pupil('Ada');
      await db
        .insert(schema.classroomLearners)
        .values({ classroomId: room.id, learnerId: ada.id });

      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.campuses).toBe('');
      expect(row.classes).toBe('Independent Class');
    });

    it('does not leave a dangling separator when one of their classes has no campus', async () => {
      /*
       * **Found by mutation, and the test above could not see it.** Dropping
       * the `if (row.campusName)` guard is *equivalent* for a pupil whose only
       * class has no campus: the set holds a single `null`, and `join` renders
       * null as an empty string, so the column is empty either way.
       *
       * It stops being equivalent the moment a pupil is in both kinds of class
       * at once — a school class and a teacher's own — which is an ordinary
       * thing to be. The column then reads "Elm Street; " with a separator
       * leading nowhere, and a district reading down it sees a campus they
       * cannot name.
       */
      const elm = await createSchool(db, lincoln.id, 'Elm Street');
      const withCampus = await classroom('Grade 4 Mathematics', elm.id);
      const withoutCampus = await classroom('Chess Club', null);
      const ada = await pupil('Ada');
      await db.insert(schema.classroomLearners).values([
        { classroomId: withCampus.id, learnerId: ada.id },
        { classroomId: withoutCampus.id, learnerId: ada.id },
      ]);

      const [row] = await districtPupilRows(db, lincoln.id, NOW);

      expect(row.campuses).toBe('Elm Street');
      expect(row.campuses.endsWith(';')).toBe(false);
      expect(row.campuses).not.toContain('; ;');
      // Both classes are still listed; it is only the campus that is absent.
      expect(row.classes).toBe('Chess Club; Grade 4 Mathematics');
    });

    it('leaves both empty for a pupil in no class at all', async () => {
      await pupil('Ada');
      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.campuses).toBe('');
      expect(row.classes).toBe('');
    });
  });

  describe('how they are doing', () => {
    it('reports coverage as empty rather than zero for a year group with no concepts', async () => {
      /*
       * **C5b's distinction, and it matters more in a spreadsheet than
       * anywhere.** Zero means "has covered none of it"; empty means "there is
       * nothing to have covered". A column of zeros invites somebody to average
       * it, and age 7 — the one year with no authored concepts — would drag a
       * district's figure down for a curriculum that does not exist yet.
       */
      await pupil('Ada', 2016);

      const [row] = await districtPupilRows(db, lincoln.id, NOW);
      expect(row.coveragePercent).toBeNull();
      expect(row.conceptsInYearGroup).toBeNull();
    });
  });

  describe('the file itself', () => {
    it('has one row per pupil under a header', async () => {
      await pupil('Ada');
      await pupil('Bram');

      const csv = (await districtPupilCsv(db, lincoln.id, NOW)).replace(/^﻿/, '');
      const lines = csv.split('\r\n').filter(line => line !== '');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(DISTRICT_PUPIL_COLUMNS.map(column => column.header).join(','));
    });

    it('survives a name that would otherwise break the columns', async () => {
      /*
       * A SIS is where these names come from. `Nguyen, Cleo` unquoted shifts
       * every column after it, which would put this child's coverage under
       * another child's heading in a file that still looks well-formed.
       */
      await pupil('Nguyen, Cleo');

      const csv = await districtPupilCsv(db, lincoln.id, NOW);
      expect(csv).toContain('"Nguyen, Cleo"');
    });

    it('neutralises a name a spreadsheet would execute', async () => {
      /*
       * Not hypothetical: display names arrive from a district's SIS, which
       * this product does not control. The reader is an administrator with the
       * whole district on screen.
       */
      await pupil('=HYPERLINK("http://x","click")');

      const csv = await districtPupilCsv(db, lincoln.id, NOW);
      expect(csv).toContain('"\'=HYPERLINK');
      expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
    });

    it('is named for the district and the day, never for a child', async () => {
      /*
       * E4's rule, with more force here. A filename sits in a Downloads folder,
       * appears in a file picker during a screen share, and is read by people
       * who were never meant to open it.
       */
      await pupil('Ada');

      const filename = await districtCsvFilename(db, lincoln.id, NOW);
      expect(filename).toBe('acuitymath-lincoln-unified-pupils-2026-03-01.csv');
      expect(filename).not.toContain('Ada');
    });

    it('gives a district with no pupils a header rather than an empty file', async () => {
      // So somebody sees the columns instead of wondering whether it failed.
      const csv = (await districtPupilCsv(db, lincoln.id, NOW)).replace(/^﻿/, '');
      expect(csv).toBe(`${DISTRICT_PUPIL_COLUMNS.map(c => c.header).join(',')}\r\n`);
    });

    it('carries no answer, session or message', async () => {
      /*
       * **The scope decision, asserted.** E2's export is one child and
       * everything about them. This is every child and a summary — the file
       * that contained both would be the largest disclosure this product can
       * make, assembled by a click.
       */
      const ada = await pupil('Ada');
      await db.insert(schema.practiceSessions).values({ learnerId: ada.id, targetLength: 8 });

      const csv = await districtPupilCsv(db, lincoln.id, NOW);
      const headers = csv.split('\r\n')[0].toLowerCase();
      expect(headers).not.toMatch(/attempt|answer|session|message|notification/);
    });
  });
});
