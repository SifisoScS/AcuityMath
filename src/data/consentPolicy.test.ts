// @vitest-environment node

/**
 * The disclosure has to name everywhere a child's words go.
 *
 * Version 1 said their information "is not sold or shared with anyone else",
 * unqualified, while a child's typed message to the maths coach was being sent
 * to Google. Nothing caught it, because nothing connects the sentence a parent
 * agrees to with the code that sends the request.
 *
 * This is that connection. It is an inventory rather than a text match: a new
 * destination has to be added to `EXTERNAL_RECIPIENTS` *and* named in the
 * disclosure, and the cheapest way to make this file pass is to tell the parent
 * the truth.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  CONSENT_POLICY_CLAUSES,
  CONSENT_POLICY_TEXT,
  CONSENT_POLICY_VERSION,
  VERIFICATION_EXPLANATION,
} from './consentPolicy';

/**
 * Every organisation that receives anything a child produced.
 *
 * `name` is what the disclosure must call them — the name a parent would
 * recognise, not the vendor's SDK or the model's identifier. A parent does not
 * know what "Gemini" is.
 */
const EXTERNAL_RECIPIENTS = [
  {
    name: 'Google',
    why: 'the Socratic coach sends the problem and the child’s typed message',
    evidence: 'server/gemini.ts',
  },
];

describe('the consent disclosure', () => {
  it('names every external recipient of a child’s work', () => {
    for (const recipient of EXTERNAL_RECIPIENTS) {
      expect(
        CONSENT_POLICY_TEXT,
        `${recipient.name} receives data (${recipient.why}) and the disclosure does not say so`,
      ).toContain(recipient.name);
    }
  });

  it('keeps the recipients list honest about what still exists', () => {
    /*
     * Guards the guard. If `server/gemini.ts` were deleted, the entry above
     * would be stale and this file would go on asserting a disclosure clause
     * for a destination that no longer receives anything — telling parents
     * about a transfer that does not happen, which is its own kind of untrue.
     */
    for (const recipient of EXTERNAL_RECIPIENTS) {
      const source = join(process.cwd(), recipient.evidence);
      expect(
        () => readFileSync(source, 'utf-8'),
        `${recipient.evidence} is gone; is ${recipient.name} still a recipient?`,
      ).not.toThrow();
    }
  });

  it('does not claim data is shared with nobody', () => {
    /*
     * The exact sentence that was wrong in v1. Phrased as a ban on the claim
     * rather than a check for the fix, because there are many ways to write
     * "we share nothing" and only one of them was in v1.
     */
    expect(CONSENT_POLICY_TEXT.toLowerCase()).not.toMatch(
      /not (sold or )?shared with anyone( else)?/,
    );
  });

  it('still promises no advertising and no sale, which remain true', () => {
    const text = CONSENT_POLICY_TEXT.toLowerCase();
    expect(text).toContain('advertising');
    expect(text).toContain('never sold');
  });

  it('does not claim a verification step the product does not perform', () => {
    // The modal once offered "Micro-Auth Credit Card Verification" when nothing
    // charges a card. The explanation must keep saying what is actually done.
    expect(VERIFICATION_EXPLANATION).toMatch(/do not send a second confirmation step/i);
    expect(VERIFICATION_EXPLANATION).toMatch(/do not check a credit card/i);
  });

  it('has a version that moved when the text did', () => {
    /*
     * `2026-09-v1` is the version whose text claimed nothing was shared. Editing
     * a version in place is forbidden by the header comment for a reason: rows
     * already recorded carry a hash of the old text, and a version string that
     * means two different things makes the ledger unreadable.
     */
    expect(CONSENT_POLICY_VERSION).not.toBe('2026-09-v1');
  });

  it('reads as sentences a parent could actually follow', () => {
    // Not style policing: a disclosure nobody finishes is consent in form only.
    expect(CONSENT_POLICY_CLAUSES.length).toBeGreaterThanOrEqual(4);
    for (const clause of CONSENT_POLICY_CLAUSES) {
      expect(clause.trim()).not.toBe('');
      expect(clause.trim().endsWith('.')).toBe(true);
    }
  });
});
