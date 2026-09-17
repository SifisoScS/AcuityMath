/**
 * Turning a SIS grade code into a birth year.
 *
 * **This is the one thing OneRoster gives us that NRPS does not.** An LTI
 * membership list carries no age at all, which is why C4c refuses to create a
 * pupil unless the course was launched with a `grade_level` custom parameter —
 * and why a district that forgot to configure one gets a roster full of skipped
 * children. A OneRoster `user` carries `grades` as a matter of course.
 *
 * The arithmetic is **not** repeated here. `ageForGrade` lives in
 * `lti/pupilAge.ts` and is imported, because a grade-to-age rule is a product
 * decision about children rather than a detail of either protocol — and because
 * this codebase has already paid for the alternative once, when the ELO mapping
 * turned out to exist in four places that disagreed.
 *
 * What *is* here is the vocabulary. CEDS grade codes are strings — `"KG"`,
 * `"01"`, `"12"`, `"PK"` — where an LMS sends a number, and translating them is
 * the only genuinely OneRoster-shaped part.
 */

import { ageForGrade } from '../lti/pupilAge';

/**
 * Codes that mean a year of school, as a grade number.
 *
 * Only the ones with an unambiguous reading. `"PK"` is pre-kindergarten and
 * `"IT"` is infant/toddler — both describe children below the age this product
 * serves, and both are deliberately absent rather than mapped to something
 * near zero. A child too young for the product should be **skipped and
 * counted**, which is what an absent mapping causes, rather than admitted at a
 * guessed age.
 *
 * `"PR"`, `"UG"` (ungraded) and `"Other"` are absent for a different reason:
 * they carry no year at all, and a district using them has to say the age some
 * other way.
 */
const GRADE_CODES = new Map<string, number>([
  ['KG', 0],
  ['01', 1],
  ['02', 2],
  ['03', 3],
  ['04', 4],
  ['05', 5],
  ['06', 6],
  ['07', 7],
  ['08', 8],
  ['09', 9],
  ['10', 10],
  ['11', 11],
  ['12', 12],
]);

export interface ResolvedGrade {
  birthYear: number;
  /** The code it came from, so a sync record can say what it believed. */
  code: string;
}

/**
 * The birth year implied by a SIS grade code, or `null`.
 *
 * `null` is a real answer here rather than a failure: it means "this product
 * cannot tell how old this child is", and the caller's job is to **skip them
 * and say so**. Every alternative writes a made-up year into a child's record,
 * and that record then decides what mathematics they are shown and whether the
 * consent gate treats them as under thirteen.
 *
 * A `grades` array with several entries takes the **first recognised** one.
 * Multi-grade entries occur in combined classes and ungraded settings; picking
 * the first is arbitrary, and it is arbitrary in a bounded way — the codes in
 * such an array are adjacent years, so the error is at most a year in a value
 * that was never exact.
 */
export function birthYearFromGrades(
  grades: readonly unknown[] | null | undefined,
  now: Date = new Date(),
): ResolvedGrade | null {
  if (!Array.isArray(grades)) return null;

  for (const entry of grades) {
    if (typeof entry !== 'string') continue;

    /*
     * Upper-cased and trimmed, because `"kg"` and `"KG "` are the same grade
     * and a district's export is not a specification document. Not padded,
     * though: `"1"` is deliberately not read as `"01"`, because a code this
     * module does not recognise must not be *nearly* recognised — the whole
     * value of returning null is that it is returned when we are unsure.
     */
    const grade = GRADE_CODES.get(entry.trim().toUpperCase());
    if (grade === undefined) continue;

    return { birthYear: now.getFullYear() - ageForGrade(grade), code: entry.trim() };
  }

  return null;
}
