/**
 * Handing a teacher's choice back to their LMS.
 *
 * Deep linking is the one exchange where **this product is the issuer**. A
 * teacher clicks "add content" in their course, the platform launches us with a
 * `LtiDeepLinkingRequest`, we show them something to pick, and the answer goes
 * back as a JWT signed with the key that proves we are AcuityMath.
 *
 * That reversal is the thing to hold onto, because every field flips with it.
 * On the way in, `iss` is the platform and `aud` is our client id. On the way
 * out, **`iss` is our client id and `aud` is the platform's issuer** — and
 * getting it the familiar way round produces a token the platform rejects with
 * no explanation worth reading.
 *
 * The other half is `data`. The platform puts an opaque string in the request
 * and it must come back **untouched**: it is how they know the response belongs
 * to the request they started, the mirror of the `state` this product uses on
 * the way in. Dropping it, or inventing one, is the same class of mistake as
 * ignoring a nonce.
 */

import { SignJWT, importPKCS8 } from 'jose';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { LTI_ALGORITHM, signingKey } from './keys';
import { DEFAULT_SCORE_MAXIMUM } from './ags';

type Db = MySql2Database<typeof schema>;

export const DEEP_LINKING_RESPONSE = 'LtiDeepLinkingResponse';

const DL_CLAIM = {
  contentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  data: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
} as const;

/** The only type this product knows how to be. */
export const LTI_RESOURCE_LINK = 'ltiResourceLink';

/**
 * How long the response is valid for.
 *
 * It is carried by the teacher's own browser from our page to theirs, so the
 * window only has to cover a form submission. Five minutes is generous for that
 * and short enough that a response captured from a browser's history is spent
 * by the time anyone reads it.
 */
const RESPONSE_LIFETIME_SECONDS = 5 * 60;

export class CannotReturnChoice extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'CannotReturnChoice';
    this.reason = reason;
  }
}

export interface ChosenContent {
  /** What the teacher will see the link called in their course. */
  title: string;
  /** Shown under the title in some platforms. Optional and often better short. */
  text?: string;
  /**
   * What this link is *about*, carried as a custom parameter.
   *
   * It comes back to us on every later launch of that link, which is the whole
   * point: it is how a resource link created today knows which concept a teacher
   * had in mind, without this product keeping a separate record the platform
   * could get out of step with.
   */
  conceptId?: string;
}

/**
 * What a response needs, which is less than a whole launch.
 *
 * Narrowed deliberately: the caller with a `LaunchContext` in hand is the route,
 * and the caller *answering* a choice has only a stored row — an hour later, on
 * a different request. Taking the pieces means both can call this honestly
 * instead of one of them casting a half-built launch into the shape.
 */
export interface DeepLinkingTarget {
  /** Ours. Becomes the `iss` of the response. */
  clientId: string;
  /** Theirs. Becomes the `aud`. */
  issuer: string;
  deploymentId: string;
  returnUrl: string;
  acceptTypes: string[];
  acceptMultiple: boolean;
  /** Echoed back untouched, or omitted when the platform sent none. */
  data: string | null;
}

export interface BuildResponseInput {
  target: DeepLinkingTarget;
  chosen: ChosenContent[];
  /** Where a launch of the created link should arrive. */
  launchUrl: string;
  now?: Date;
}

/**
 * Builds the signed response a platform expects back.
 *
 * Refuses rather than trims when a teacher chose more than the platform will
 * accept. Quietly sending the first item would create one link when somebody
 * asked for three, and they would have no way to tell which two went missing.
 */
export async function buildDeepLinkingResponse(
  db: Db,
  input: BuildResponseInput,
): Promise<{ jwt: string; returnUrl: string }> {
  const settings = input.target;

  if (input.chosen.length === 0) {
    throw new CannotReturnChoice('nothing_chosen', 'Nothing was chosen to send back.');
  }

  if (input.chosen.length > 1 && !settings.acceptMultiple) {
    throw new CannotReturnChoice(
      'too_many',
      'This LMS accepts one item at a time, and more than one was chosen.',
    );
  }

  /*
   * A platform states what it will take. Sending a type it did not ask for is a
   * response it is entitled to reject, and this is the one place we can say so
   * in a sentence rather than letting their error page do it.
   *
   * An empty list is treated as permission: several platforms omit the field
   * and mean "the usual", and refusing them all would be reading silence as a
   * prohibition.
   */
  if (settings.acceptTypes.length > 0 && !settings.acceptTypes.includes(LTI_RESOURCE_LINK)) {
    throw new CannotReturnChoice(
      'unsupported_type',
      `This LMS does not accept links of the kind this product creates ` +
        `(it asked for ${settings.acceptTypes.join(', ')}).`,
    );
  }

  const key = await signingKey(db);
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);

  const contentItems = input.chosen.map(item => ({
    type: LTI_RESOURCE_LINK,
    title: item.title,
    ...(item.text ? { text: item.text } : {}),
    url: input.launchUrl,
    ...(item.conceptId ? { custom: { concept_id: item.conceptId } } : {}),
    /*
     * Asking the platform to create the gradebook column with the link.
     *
     * A teacher who adds this as an assignment gets one column, made by them at
     * the moment they chose — which is better than C5a's fallback of creating
     * one ourselves on first launch, because it exists before any child has
     * worked and shows up where they expect it.
     */
    lineItem: { scoreMaximum: DEFAULT_SCORE_MAXIMUM, label: item.title },
  }));

  const jwt = await new SignJWT({
    [DL_CLAIM.messageType]: DEEP_LINKING_RESPONSE,
    [DL_CLAIM.version]: '1.3.0',
    [DL_CLAIM.deploymentId]: input.target.deploymentId,
    [DL_CLAIM.contentItems]: contentItems,
    /*
     * Echoed exactly, and only when the platform sent one. Inventing a value
     * would be worse than omitting it: the platform would match it against
     * nothing and reject a response that was otherwise correct.
     */
    ...(settings.data !== null ? { [DL_CLAIM.data]: settings.data } : {}),
    nonce: `${issuedAt}-${Math.random().toString(36).slice(2)}`,
  })
    .setProtectedHeader({ alg: LTI_ALGORITHM, kid: key.kid })
    /*
     * **Reversed, and this is where the mistake lives.** Inbound, the platform
     * issues and we are the audience. Outbound it is the other way round: we
     * issue, addressed to their issuer. Writing it the familiar way produces a
     * token rejected with nothing worth reading in the error.
     */
    .setIssuer(input.target.clientId)
    .setAudience(input.target.issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + RESPONSE_LIFETIME_SECONDS)
    .sign(await importPKCS8(key.privatePem, LTI_ALGORITHM));

  return { jwt, returnUrl: settings.returnUrl };
}

/**
 * The page that carries the response back.
 *
 * A self-submitting form, because the specification requires the response to
 * arrive at the platform as a POST from the teacher's own browser — there is no
 * server-to-server call here, and a redirect could not carry a token this size.
 *
 * The teacher sees it for a fraction of a second, so it says what is happening
 * rather than nothing: a form that submits itself and fails leaves somebody
 * staring at a blank page with no idea what they were waiting for. The button is
 * there for exactly that case, and for anybody with script disabled.
 */
export function deepLinkingReturnPage(returnUrl: string, jwt: string): string {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Returning your choice</title></head>` +
    `<body style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:2.5rem;color:#1f2937">` +
    `<form id="dl" method="post" action="${escape(returnUrl)}">` +
    `<input type="hidden" name="JWT" value="${escape(jwt)}">` +
    `<p>Sending your choice back to your course…</p>` +
    `<button type="submit">Continue</button>` +
    `</form>` +
    `<script>document.getElementById('dl').submit();</script>` +
    `</body></html>`
  );
}
