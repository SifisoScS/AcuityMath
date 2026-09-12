// @vitest-environment node

/**
 * The consent gate's decision, without a database.
 *
 * Two inputs — a birth year and where consent stands — and one answer. The
 * parts worth pinning are the ones a reader would get wrong: which statuses
 * count as consent, and which way the age rounds.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSENT_REQUIRED_BELOW_AGE,
  permissionFrom,
  youngestPossibleAge,
} from './consentGate';

/** A fixed "now", so a birthday in the real world cannot move these. */
const NOW = new Date('2026-06-15T12:00:00Z');

describe('the consent gate', () => {
  describe('who it applies to', () => {
    it('rounds the age down, not up', () => {
      /*
       * The defect this prevents.
       *
       * `approximateAge` returns `year - birthYear` — the age if the birthday
       * has passed. A child born in 2013 reads as 13 from the 1st of January,
       * months before they turn 13, and the optimistic reading is the one that
       * starts recording a twelve-year-old's work.
       */
      expect(youngestPossibleAge(2013, NOW)).toBe(12);
      expect(youngestPossibleAge(2014, NOW)).toBe(11);
    });

    it('covers a child who turns thirteen later this year', () => {
      // Born 2013, so 13 at some point in 2026 — and 12 until then. Covered for
      // the whole year rather than from an arbitrary January.
      expect(permissionFrom(2013, 'none', NOW).requiresConsent).toBe(true);
    });

    it('stops applying once the child is certainly old enough', () => {
      // Born 2012: 13 by the start of 2026 whatever month they were born in.
      const permission = permissionFrom(2012, 'none', NOW);
      expect(permission.requiresConsent).toBe(false);
      expect(permission.mayRecord).toBe(true);
    });

    it('records for an older learner with no consent on file at all', () => {
      // Consent is a rule about children. A fifteen-year-old with an empty
      // ledger is not an unconsented child; the question does not apply.
      expect(permissionFrom(2008, 'none', NOW).mayRecord).toBe(true);
    });

    it('draws the line at thirteen', () => {
      expect(CONSENT_REQUIRED_BELOW_AGE).toBe(13);
    });
  });

  describe('what counts as consent', () => {
    const child = 2016; // certainly under 13 at NOW

    it('permits recording when consent is granted', () => {
      expect(permissionFrom(child, 'granted', NOW).mayRecord).toBe(true);
    });

    it('refuses when there is none', () => {
      expect(permissionFrom(child, 'none', NOW).mayRecord).toBe(false);
    });

    it('refuses when it was withdrawn', () => {
      expect(permissionFrom(child, 'withdrawn', NOW).mayRecord).toBe(false);
    });

    it('refuses when it was granted under an older policy', () => {
      /*
       * `superseded` is the interesting one. Consent was given — to different
       * text. Treating it as consent would make the policy version decorative,
       * and the reason E1 records a version and a server-computed hash is that
       * consent is to a particular disclosure. Changed text is a question that
       * has not been asked yet.
       */
      expect(permissionFrom(child, 'superseded', NOW).mayRecord).toBe(false);
    });
  });

  describe('what it tells the session', () => {
    it('collapses every refusal to "none"', () => {
      /*
       * The ledger distinguishes four states and a guardian's surface needs all
       * four. A practice session needs the decision. Carrying `withdrawn` here
       * would put a parent's withdrawal in front of whoever is at the device.
       */
      for (const status of ['none', 'withdrawn', 'superseded'] as const) {
        expect(permissionFrom(2016, status, NOW).status).toBe('none');
      }
    });

    it('says consent is not required rather than granted, for an older learner', () => {
      const permission = permissionFrom(2008, 'none', NOW);
      expect(permission.requiresConsent).toBe(false);
      // `mayRecord` is the answer; `requiresConsent` is why. A caller showing a
      // consent prompt should read the second, not infer it from the first.
      expect(permission.mayRecord).toBe(true);
    });
  });
});
