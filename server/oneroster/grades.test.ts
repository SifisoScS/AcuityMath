// @vitest-environment node

/**
 * Reading a child's age out of a SIS grade code.
 *
 * The thing worth testing is **when this refuses**. Every code it does not
 * recognise returns null, and null means the caller skips that child — because
 * the alternative is writing a guessed birth year into a record that then
 * decides what mathematics they are shown and whether the consent gate treats
 * them as under thirteen.
 */

import { describe, expect, it } from 'vitest';

import { ageForGrade } from '../lti/pupilAge';
import { birthYearFromGrades } from './grades';

const NOW = new Date('2026-03-01T12:00:00Z');

describe('a grade code as an age', () => {
  it('reads the ordinary codes', () => {
    expect(birthYearFromGrades(['KG'], NOW)?.birthYear).toBe(2026 - 6);
    expect(birthYearFromGrades(['01'], NOW)?.birthYear).toBe(2026 - 7);
    expect(birthYearFromGrades(['07'], NOW)?.birthYear).toBe(2026 - 13);
    expect(birthYearFromGrades(['12'], NOW)?.birthYear).toBe(2026 - 18);
  });

  it('uses the one place this product decides what a grade means', () => {
    /*
     * **Not a second copy of the arithmetic.** `ageForGrade` lives in
     * `lti/pupilAge.ts`, and this asserts the two agree rather than restating
     * `grade + 6` — which is exactly how the ELO mapping came to exist in four
     * places that disagreed.
     */
    for (const [code, grade] of [['KG', 0], ['05', 5], ['12', 12]] as const) {
      expect(birthYearFromGrades([code], NOW)?.birthYear).toBe(2026 - ageForGrade(grade));
    }
  });

  it('tolerates the casing and spacing a real export has', () => {
    expect(birthYearFromGrades([' kg '], NOW)?.birthYear).toBe(2026 - 6);
    expect(birthYearFromGrades(['Kg'], NOW)?.code).toBe('Kg');
  });

  describe('what it refuses', () => {
    it('refuses a code it does not recognise rather than nearly recognising it', () => {
      /*
       * `"1"` is deliberately **not** read as `"01"`. The whole value of
       * returning null is that it is returned whenever we are unsure, and
       * padding a string to make it match is a guess wearing a rule's clothes.
       */
      expect(birthYearFromGrades(['1'], NOW)).toBeNull();
      expect(birthYearFromGrades(['Year 7'], NOW)).toBeNull();
      expect(birthYearFromGrades(['seventh'], NOW)).toBeNull();
    });

    it('refuses the codes for children below this product’s ages', () => {
      // `PK` is pre-kindergarten and `IT` infant/toddler. Absent on purpose:
      // a child too young should be skipped and counted, not admitted at a
      // guessed age.
      expect(birthYearFromGrades(['PK'], NOW)).toBeNull();
      expect(birthYearFromGrades(['IT'], NOW)).toBeNull();
    });

    it('refuses the codes that carry no year at all', () => {
      // Ungraded and "other" say nothing about age. A district using them has
      // to tell us some other way.
      expect(birthYearFromGrades(['UG'], NOW)).toBeNull();
      expect(birthYearFromGrades(['Other'], NOW)).toBeNull();
    });

    it('refuses an absent, empty or malformed list', () => {
      expect(birthYearFromGrades(null, NOW)).toBeNull();
      expect(birthYearFromGrades(undefined, NOW)).toBeNull();
      expect(birthYearFromGrades([], NOW)).toBeNull();
      expect(birthYearFromGrades('07' as unknown as unknown[], NOW)).toBeNull();
      expect(birthYearFromGrades([7 as unknown as string], NOW)).toBeNull();
    });
  });

  it('takes the first recognised code when several are given', () => {
    /*
     * Combined classes list more than one grade. Picking the first is
     * arbitrary, and arbitrary in a bounded way: the codes in such an array are
     * adjacent years, so the error is at most a year in a value that was never
     * exact.
     */
    expect(birthYearFromGrades(['Other', '04', '05'], NOW)?.code).toBe('04');
  });

  it('says which code it believed', () => {
    // So a sync record can report what it acted on rather than only what it did.
    expect(birthYearFromGrades(['09'], NOW)?.code).toBe('09');
  });
});
