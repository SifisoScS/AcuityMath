/**
 * Reading a pupil's age out of whatever an administrator typed.
 *
 * Pure, so it can be tabulated. Every value here arrives as a string from a
 * configuration form, and the cases that matter are the ones where a careless
 * read would produce a *number* rather than a refusal — `NaN`, a year in the
 * 1800s, a grade of 400. Any of those becomes a false fact in a child's record,
 * and a false fact is indistinguishable later from one somebody actually knew.
 */

import { describe, expect, it } from 'vitest';

import { AgeUnknown, resolvePupilAge } from './pupilAge';

const NOW = new Date('2026-09-14T00:00:00Z');

describe('working out how old a pupil is', () => {
  describe('an explicit birth year', () => {
    it('is taken as given', () => {
      expect(resolvePupilAge({ birth_year: '2016' }, NOW)).toEqual({
        birthYear: 2016,
        source: 'birth_year',
      });
    });

    it('wins over a grade, because it is the exact one', () => {
      expect(resolvePupilAge({ birth_year: '2016', grade_level: '9' }, NOW).birthYear).toBe(2016);
    });

    it('survives the spaces a form leaves behind', () => {
      expect(resolvePupilAge({ birth_year: ' 2016 ' }, NOW).birthYear).toBe(2016);
    });
  });

  describe('a grade level', () => {
    it.each([
      [0, 6],
      [1, 7],
      [4, 10],
      [6, 12],
      [12, 18],
    ])('grade %i reads as age %i', (grade, age) => {
      const { birthYear, source } = resolvePupilAge({ grade_level: String(grade) }, NOW);
      expect(NOW.getFullYear() - birthYear).toBe(age);
      expect(source).toBe('grade_level');
    });

    it('takes the older end of the band on purpose', () => {
      /*
       * Guessing young pushes a ten-year-old's content down to seven, which
       * reads to a child as the product thinking they are stupid. Guessing old
       * cannot let an unconsented child practise — the district's agreement
       * covers them at any age — so the two errors are not symmetrical.
       */
      expect(NOW.getFullYear() - resolvePupilAge({ grade_level: '4' }, NOW).birthYear).toBe(10);
    });
  });

  describe('values that must not become a number', () => {
    it.each([
      ['nothing configured', {}],
      ['a grade spelled out', { grade_level: 'fourth' }],
      ['a letter for a zero', { birth_year: '2O16' }],
      /*
       * The case that proves the digit check rather than the range check.
       *
       * `2O16` with a letter is caught either way — `Number` makes it `NaN` and
       * `NaN` fails every comparison. A *fractional* year does not: `Number`
       * makes it 2016.4, which is inside the plausible range, and `birth_year`
       * is a `smallint` — so the child's record would silently hold a rounded
       * year nobody typed. Mutating the digit check away is green without this
       * line.
       */
      ['a fractional year', { birth_year: '2016.4' }],
      ['a year in hex', { birth_year: '0x7E0' }],
      ['an empty string', { grade_level: '' }],
      ['a year with a stray sign', { birth_year: '-2016' }],
      ['a decimal grade', { grade_level: '4.5' }],
      ['a grade beyond school', { grade_level: '40' }],
      ['a birth year from the last century', { birth_year: '1890' }],
      ['a birth year in the future', { birth_year: '2030' }],
      ['a toddler', { birth_year: '2025' }],
    ])('refuses %s', (_label, custom) => {
      expect(() => resolvePupilAge(custom, NOW)).toThrow(AgeUnknown);
    });

    it('falls back to a usable grade when the birth year is nonsense', () => {
      // One bad parameter should not discard a good one sitting beside it.
      expect(resolvePupilAge({ birth_year: 'unknown', grade_level: '3' }, NOW).source).toBe(
        'grade_level',
      );
    });
  });

  describe('the refusal itself', () => {
    it('names the parameters an administrator can set', () => {
      /*
       * The person reading this is looking at a configuration form. "Contact
       * support" would send them away to be told this sentence.
       */
      try {
        resolvePupilAge({}, NOW);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as Error).message).toContain('grade_level');
        expect((error as Error).message).toContain('birth_year');
      }
    });
  });
});
