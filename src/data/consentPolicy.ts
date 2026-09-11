/**
 * What a guardian is actually agreeing to.
 *
 * This lived as one sentence of JSX inside `CoppaConsentModal`. If that sentence
 * were ever edited, every consent row already recorded would silently refer to
 * text nobody could reconstruct — a ledger full of rows that cannot say what was
 * agreed, which is the same failure as an empty one with better optics.
 *
 * It lives here because the **server** imports it too, the way the avatar
 * catalogue moved so that the price charged is the price shown. The server
 * hashes its own copy at write time; the client never sends a hash, or it could
 * claim consent to text that was never displayed.
 *
 * ## Changing this document
 *
 * Bump `CONSENT_POLICY_VERSION`. Do not edit a version in place — the hash
 * recorded against existing rows would stop matching, which is the point of
 * storing it, but the rows would then refer to a version string that means two
 * different things.
 *
 * Consents recorded under a superseded version read as `superseded` rather than
 * `granted`, which is a state the product needs to be able to see.
 */

export const CONSENT_POLICY_VERSION = '2026-09-v1';

/**
 * The disclosure, as displayed.
 *
 * Written as the parent reads it, in the order they need it: what is collected,
 * what it is used for, what is not done with it, and what they can do later.
 * Each clause is something the application actually does — there is no mention
 * of third-party sharing controls or advertising preferences, because there is
 * no third-party sharing and no advertising.
 */
export const CONSENT_POLICY_CLAUSES: string[] = [
  'AcuityMath records the answers your child gives to maths questions, how long each answer took, and which concepts they have practised.',
  'That information is used to choose the next question and to show you how your child is getting on. It is not used for advertising, and it is not sold or shared with anyone else.',
  'We do not ask your child for their real name, address, photograph, or any way of contacting them. A learner profile holds a display name you choose, a birth year, and an avatar.',
  'You can see everything recorded about your child, and you can withdraw this consent at any time.',
];

/**
 * The exact text the hash is taken over.
 *
 * Joined deterministically. The rendered markup is not hashed — spacing and tags
 * change for reasons that have nothing to do with what was agreed, and a hash
 * that changes when a class name does would make the version meaningless.
 */
export const CONSENT_POLICY_TEXT = CONSENT_POLICY_CLAUSES.join('\n');

/** A short summary for the checkbox itself. The clauses above are the agreement. */
export const CONSENT_SUMMARY =
  'I am the parent or legal guardian of the children listed above, and I agree to the terms shown.';

/**
 * What the product can actually evidence about a guardian, in plain words.
 *
 * Shown to the parent so they know what was recorded about how they were
 * verified, rather than being asked to choose a method from a menu — which is
 * what the modal used to do, offering "Micro-Auth Credit Card Verification" when
 * nothing charges a card.
 */
export const VERIFICATION_EXPLANATION =
  'We verify you by the email address you signed in with, and record the name you type below as your attestation. We do not send a second confirmation step, and we do not check a credit card.';
