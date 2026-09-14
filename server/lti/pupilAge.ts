/**
 * Working out how old a pupil is, from a launch that does not say.
 *
 * **No LTI message carries a birth date**, and that is deliberate on the
 * specification's part rather than an omission — it is the one fact about a
 * child that a tool has no business being handed by default. The only channel
 * left is the placement's custom parameters, which a district fills in when it
 * adds the link to a course.
 *
 * Why this matters less than it looks, and still matters. Once a district's
 * agreement covers a pupil, the consent gate permits them **at any age** — so
 * getting this wrong cannot let an unconsented child practise. What it decides
 * is which band of content they start at, and the ability estimate corrects that
 * within a session anyway.
 *
 * So the argument for refusing a launch without it is not safety. It is that
 * `learners.birth_year` is `notNull`, and the alternative to knowing is
 * **writing a made-up year into a child's record** — a false fact, stored,
 * indistinguishable later from one somebody actually knew. This project does not
 * do that anywhere else and should not start here.
 */

/**
 * What a district may write into the placement, in order of preference.
 *
 * Two spellings because districts think in two units and neither is wrong.
 * `birth_year` is exact and is preferred when both appear; `grade_level` is what
 * an administrator actually knows when adding a link to a Year 4 course.
 */
export const AGE_PARAMETERS = ['birth_year', 'grade_level'] as const;

/**
 * The oldest a child in this grade is likely to be, as an age.
 *
 * US grade conventions, which is what `grade_level` means in every LMS that has
 * the field: kindergarten is 0 and children are about five, each grade adding a
 * year. A UK Year *n* is grade *n − 1*, and a district using year groups should
 * write `birth_year` instead of hoping this guesses their convention.
 *
 * **The upper end of the range, on purpose.** The resulting birth year is the
 * *earliest* plausible one, which makes the child read as old as they might be —
 * and `youngestPossibleAge` in the consent gate then rounds back down. Guessing
 * the other way would push a ten-year-old's content down to seven, which reads
 * to a child as the product thinking they are stupid.
 */
function ageForGrade(grade: number): number {
  return grade + 6;
}

export type AgeSource = 'birth_year' | 'grade_level';

export interface ResolvedAge {
  birthYear: number;
  source: AgeSource;
}

/**
 * Raised when the placement says nothing about how old its pupils are.
 *
 * The message names the parameter, because the person who will read it is an
 * administrator looking at a configuration form, and "contact support" would
 * send them to be told this sentence.
 */
export class AgeUnknown extends Error {
  constructor() {
    super(
      'This link does not say which year group it is for, and an LMS never ' +
        'sends a pupil’s age. An administrator can add a custom parameter to the ' +
        'placement — either grade_level (0 for kindergarten) or birth_year — and ' +
        'pupils will be able to start.',
    );
    this.name = 'AgeUnknown';
  }
}

/** The span a birth year has to fall in to be a real pupil rather than a typo. */
const OLDEST_PLAUSIBLE_AGE = 25;
const YOUNGEST_PLAUSIBLE_AGE = 3;

/**
 * Reads an age out of the custom parameters, or refuses.
 *
 * Everything here arrives as a string an administrator typed, so every value is
 * checked rather than coerced. A `grade_level` of `"fourth"` or a `birth_year`
 * of `"2O16"` is not a number and must not become `NaN` in a child's record —
 * which is what `Number()` alone, or `parseInt` on its own, would quietly allow.
 */
export function resolvePupilAge(
  custom: Record<string, string>,
  now: Date = new Date(),
): ResolvedAge {
  const year = now.getFullYear();

  const rawBirthYear = custom.birth_year;
  if (rawBirthYear !== undefined && /^\d{4}$/.test(rawBirthYear.trim())) {
    const birthYear = Number(rawBirthYear.trim());
    const age = year - birthYear;
    if (age >= YOUNGEST_PLAUSIBLE_AGE && age <= OLDEST_PLAUSIBLE_AGE) {
      return { birthYear, source: 'birth_year' };
    }
  }

  const rawGrade = custom.grade_level;
  if (rawGrade !== undefined && /^\d{1,2}$/.test(rawGrade.trim())) {
    const grade = Number(rawGrade.trim());
    if (grade >= 0 && grade <= 12) {
      return { birthYear: year - ageForGrade(grade), source: 'grade_level' };
    }
  }

  /*
   * A value that was present but unusable lands here too, and deliberately so.
   * `grade_level = "fourth"` is a misconfiguration, and treating it as absent
   * gives the administrator the same message that tells them what to write —
   * which is the sentence they need either way.
   */
  throw new AgeUnknown();
}
