/**
 * What a district is actually agreeing to, on behalf of children.
 *
 * The parallel to `consentPolicy.ts` is deliberate and so is the reason for it.
 * `institutional_agreement` has been a value in the `consent_events` method enum
 * since B1, and until now **writing it cost nothing** — no document had to
 * exist, nobody had to sign anything, and a row could claim a district had
 * agreed while pointing at no agreement at all.
 *
 * Family consent snapshots a policy version, a server-computed hash, an attested
 * name, a verified email and a timestamp. If the institutional path were only a
 * string, the gate would be **weakest for exactly the children with the least
 * agency**, and weakest in the direction that happens to be convenient for us.
 * That is not a trade-off worth making quietly.
 *
 * ## Changing this document
 *
 * Bump `INSTITUTIONAL_AGREEMENT_VERSION`. Never edit a version in place: the
 * hash stored against agreements already signed would stop matching, which is
 * the point of storing it, but the version string would then name two different
 * texts.
 *
 * ## What this is not
 *
 * It is **not legal advice and not a substitute for a data processing
 * agreement.** It is the text a district administrator sees and attests to
 * inside this product, recorded so that the consent rows resting on it can say
 * what was agreed. A district's own counsel will have a longer document; this
 * one records the part that governs what the software then does.
 */

export const INSTITUTIONAL_AGREEMENT_VERSION = '2026-09-v1';

const AGREEMENT_CLAUSES = [
  'I am authorised to act for this institution and to agree to these terms on its behalf.',
  'This institution has obtained, or holds authority under applicable law to provide, ' +
    'parental consent for the pupils it enrols in AcuityMath, and will keep that authority ' +
    'current for as long as this agreement stands.',
  'AcuityMath records each pupil’s answers, response times, ability estimates and ' +
    'mastery, and uses them to choose the next question for that pupil. It does not ' +
    'use them to build advertising profiles, and does not sell them.',
  'A pupil’s typed message to the maths coach is sent to Google’s Gemini API to ' +
    'generate a reply. No name, email address or pupil identifier is sent with it. ' +
    'Google acts as a processor for that request.',
  'This institution may request an export or the deletion of any pupil’s records at ' +
    'any time, and deletion removes their practice history rather than hiding it.',
  'This institution will tell the families of enrolled pupils that it has agreed to ' +
    'these terms on their behalf.',
  'Either party may end this agreement. When it ends, **recording stops for every ' +
    'pupil resting on it** — their existing records are retained until this ' +
    'institution asks for export or deletion.',
];

export const INSTITUTIONAL_AGREEMENT_TEXT = AGREEMENT_CLAUSES.join('\n');

/** The sentence beside the signature field. The clauses above are the agreement. */
export const INSTITUTIONAL_AGREEMENT_SUMMARY =
  'I am authorised to agree to these terms on behalf of this institution and the pupils it enrols.';

export { AGREEMENT_CLAUSES as INSTITUTIONAL_AGREEMENT_CLAUSES };
