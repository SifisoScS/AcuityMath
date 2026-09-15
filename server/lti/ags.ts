/**
 * Writing a grade into somebody else's gradebook.
 *
 * Every outbound call so far has been a read. This one **changes a district's
 * records**, and the thing it changes is a mark against a child's name that
 * their teacher and their parents will see. That asymmetry runs through the
 * whole module.
 *
 * Three consequences worth stating before the code.
 *
 * **A line item is a column a teacher sees.** Creating a second one for the same
 * link puts a duplicate in their gradebook that nobody asked for and only they
 * can delete. The unique key on `(context, resource_link)` is not tidiness; it
 * is the difference between an integration and a mess somebody else has to clear
 * up.
 *
 * **A score names the platform's user, never ours.** `userId` in a score payload
 * is the `sub` from the launch. Sending a learner id would either fail or, far
 * worse, land on whichever of their users happens to have that identifier.
 *
 * **Timestamps decide which score wins.** Platforms keep the most recent by
 * timestamp and reject anything not newer than what they hold, so two scores
 * posted in the same second can silently leave the older value standing.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { accessTokenFor, forgetAccessToken, type PlatformForToken } from './accessToken';

type Db = MySql2Database<typeof schema>;

/** Creating and reading the columns of a gradebook. */
export const AGS_LINE_ITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
/** Writing a mark into one. Separate, because reading a gradebook and changing
 * it are different permissions and a district may grant only the first. */
export const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';

const LINE_ITEM_MEDIA_TYPE = 'application/vnd.ims.lis.v2.lineitem+json';
const SCORE_MEDIA_TYPE = 'application/vnd.ims.lis.v1.Score+json';

/**
 * The denominator every column this product creates uses.
 *
 * A hundred, because the number being sent is a mastery percentage and a teacher
 * reading "72" in a column marked out of 100 needs no explanation. It is stored
 * per line item all the same — a column made by an earlier version, or by the
 * platform when the link was placed as an assignment, may disagree, and a score
 * whose maximum does not match the column's is rescaled or rejected depending on
 * whose LMS it is.
 */
export const DEFAULT_SCORE_MAXIMUM = 100;

export class GradebookUnavailable extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'GradebookUnavailable';
    this.status = status;
  }
}

/** Only https, and for the same reason the roster endpoint is. */
function mayCall(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    /*
     * The same bounded exception `mayFetchRoster` carries, for the same reason:
     * the fetch, the headers and the error handling are only worth anything if
     * they are exercised against a real server. Loopback, and only under the
     * test runner.
     */
    return (
      process.env.NODE_ENV === 'test' &&
      (parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

async function callPlatform(
  db: Db,
  platform: PlatformForToken,
  scope: string,
  url: string,
  init: { method: string; contentType?: string; accept: string; body?: string },
  now?: Date,
): Promise<{ status: number; body: string }> {
  if (!mayCall(url)) {
    throw new GradebookUnavailable(0, 'A gradebook may only be written over https.');
  }

  const attempt = async (token: string) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: init.accept,
    };
    if (init.contentType) headers['content-type'] = init.contentType;

    try {
      const response = await fetch(url, { method: init.method, headers, body: init.body });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      /*
       * The platform is unreachable. Wrapped rather than allowed to escape as
       * `TypeError: fetch failed`, which reads to whoever sees it as a fault in
       * this product rather than in the server we could not reach — the same
       * defect C4d found in the roster and token paths.
       */
      throw new GradebookUnavailable(
        0,
        `Could not reach ${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  let result = await attempt(await accessTokenFor(db, platform, scope, now));

  if (result.status === 401) {
    /*
     * One retry, after discarding the token. Identical reasoning to the roster
     * read: a credential revoked early leaves us holding one we believe is good,
     * and without this every later score fails the same way until it expires.
     */
    await forgetAccessToken(db, platform.id, scope);
    result = await attempt(await accessTokenFor(db, platform, scope, now));
  }

  return result;
}

export interface LineItem {
  id: number;
  lineItemUrl: string;
  label: string;
  scoreMaximum: number;
}

export interface ResolveLineItemInput {
  contextRowId: number;
  resourceLinkId: string;
  label: string;
  /**
   * The URL the platform already made, when the link was placed as an
   * assignment. Given one, **nothing is created**.
   */
  platformLineItem?: string | null;
}

/**
 * The gradebook column for one placement, made once and found thereafter.
 *
 * The order matters and is the whole safety of this function. A row we already
 * hold wins; then the URL the platform itself provided; and only with neither
 * does it create anything. Reversing any two of those turns a second launch
 * into a second column.
 */
export async function resolveLineItem(
  db: Db,
  platform: PlatformForToken,
  input: ResolveLineItemInput,
  now?: Date,
): Promise<LineItem> {
  const [existing] = await db
    .select()
    .from(schema.ltiLineItems)
    .where(
      and(
        eq(schema.ltiLineItems.contextId, input.contextRowId),
        eq(schema.ltiLineItems.resourceLinkId, input.resourceLinkId),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      lineItemUrl: existing.lineItemUrl,
      label: existing.label,
      scoreMaximum: Number(existing.scoreMaximum),
    };
  }

  if (input.platformLineItem) {
    /*
     * The platform made a column when the teacher placed the link as an
     * assignment. Adopting it is the only correct move: creating our own would
     * leave their column empty beside ours, and a teacher with two columns
     * cannot tell which one counts.
     */
    return recordLineItem(db, input, input.platformLineItem, DEFAULT_SCORE_MAXIMUM);
  }

  const [context] = await db
    .select({ lineItemsUrl: schema.ltiContexts.lineItemsUrl })
    .from(schema.ltiContexts)
    .where(eq(schema.ltiContexts.id, input.contextRowId))
    .limit(1);

  if (!context?.lineItemsUrl) {
    throw new GradebookUnavailable(
      0,
      'This course has no gradebook endpoint on record. The platform only tells ' +
        'us during a launch, and it has not — usually because the line item scope ' +
        'is not enabled for this tool.',
    );
  }

  const result = await callPlatform(
    db,
    platform,
    AGS_LINE_ITEM_SCOPE,
    context.lineItemsUrl,
    {
      method: 'POST',
      contentType: LINE_ITEM_MEDIA_TYPE,
      accept: LINE_ITEM_MEDIA_TYPE,
      body: JSON.stringify({
        scoreMaximum: DEFAULT_SCORE_MAXIMUM,
        label: input.label,
        /*
         * Tying the column to the placement, so the platform shows it against
         * the right link and a teacher who deletes the link takes the column
         * with it rather than leaving an orphan.
         */
        resourceLinkId: input.resourceLinkId,
        /*
         * Our own identifier for the column, which is what makes a *second*
         * create attempt recoverable: several platforms return the existing item
         * rather than making another when this matches.
         */
        resourceId: `acuitymath:${input.resourceLinkId}`,
      }),
    },
    now,
  );

  if (result.status < 200 || result.status >= 300) {
    throw new GradebookUnavailable(
      result.status,
      result.status === 403
        ? 'The platform refused to create a gradebook column. The line item scope ' +
          'is usually not enabled for this tool in the LMS.'
        : `The platform answered ${result.status}: ${result.body.slice(0, 200)}`,
    );
  }

  let created: { id?: unknown; scoreMaximum?: unknown };
  try {
    created = JSON.parse(result.body) as typeof created;
  } catch {
    throw new GradebookUnavailable(
      result.status,
      `The platform did not return a line item: ${result.body.slice(0, 200)}`,
    );
  }

  const url = typeof created.id === 'string' ? created.id : '';
  if (!url) {
    throw new GradebookUnavailable(
      result.status,
      'The platform created a column but did not say where it is.',
    );
  }

  /*
   * The maximum the platform actually used, not the one asked for. A platform
   * may clamp it, and believing our own request would mean every later score is
   * scaled against a denominator the column does not have.
   */
  const scoreMaximum =
    typeof created.scoreMaximum === 'number' && created.scoreMaximum > 0
      ? created.scoreMaximum
      : DEFAULT_SCORE_MAXIMUM;

  return recordLineItem(db, input, url, scoreMaximum);
}

async function recordLineItem(
  db: Db,
  input: ResolveLineItemInput,
  lineItemUrl: string,
  scoreMaximum: number,
): Promise<LineItem> {
  await db
    .insert(schema.ltiLineItems)
    .values({
      contextId: input.contextRowId,
      resourceLinkId: input.resourceLinkId,
      lineItemUrl,
      label: input.label,
      scoreMaximum: String(scoreMaximum),
    })
    /*
     * Two launches for the same link arriving together would otherwise fail on
     * the unique key. Re-writing the URL to what we just learned is correct for
     * either winner, because both learned it from the same platform.
     */
    .onDuplicateKeyUpdate({ set: { lineItemUrl } });

  const [row] = await db
    .select()
    .from(schema.ltiLineItems)
    .where(
      and(
        eq(schema.ltiLineItems.contextId, input.contextRowId),
        eq(schema.ltiLineItems.resourceLinkId, input.resourceLinkId),
      ),
    )
    .limit(1);

  return {
    id: row.id,
    lineItemUrl: row.lineItemUrl,
    label: row.label,
    scoreMaximum: Number(row.scoreMaximum),
  };
}

export interface ScoreInput {
  /** The platform's `sub`. **Never a learner id from this database.** */
  platformUserId: string;
  /** Out of the line item's maximum, which the caller does not get to choose. */
  scoreGiven: number;
  /** Shown to the learner in some gradebooks. Optional, and often better empty. */
  comment?: string;
  timestamp?: Date;
}

/**
 * Posts a mark against one person in one column.
 *
 * `activityProgress` and `gradingProgress` are required by the specification and
 * are not decoration: together they tell a teacher's gradebook whether a blank
 * means "not started", "waiting for marking" or "finished and this is the mark".
 * This product marks instantly and continuously, so every score it sends is
 * `Completed` and `FullyGraded` — anything else would leave a column showing
 * work as pending that nothing will ever come back to finish.
 */
export async function postScore(
  db: Db,
  platform: PlatformForToken,
  lineItem: LineItem,
  input: ScoreInput,
  now: Date = new Date(),
): Promise<void> {
  if (!Number.isFinite(input.scoreGiven) || input.scoreGiven < 0) {
    throw new GradebookUnavailable(0, 'A score must be a number that is not negative.');
  }

  /*
   * Clamped rather than sent as-is. A value above the column's maximum is
   * rejected outright by some platforms and silently stored by others, and a
   * child showing 130 out of 100 in a gradebook is a conversation their teacher
   * has to have with somebody.
   */
  const scoreGiven = Math.min(input.scoreGiven, lineItem.scoreMaximum);

  const result = await callPlatform(
    db,
    platform,
    AGS_SCORE_SCOPE,
    `${lineItem.lineItemUrl.replace(/\/$/, '')}/scores`,
    {
      method: 'POST',
      contentType: SCORE_MEDIA_TYPE,
      accept: 'application/json',
      body: JSON.stringify({
        userId: input.platformUserId,
        scoreGiven,
        scoreMaximum: lineItem.scoreMaximum,
        comment: input.comment,
        /*
         * ISO 8601, and the field platforms order by. A score not strictly newer
         * than the one they hold is discarded — which is why the caller may pass
         * a moment rather than having one invented here, and why two scores in
         * the same second is a real way to lose the newer one.
         */
        timestamp: (input.timestamp ?? now).toISOString(),
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    },
    now,
  );

  if (result.status < 200 || result.status >= 300) {
    throw new GradebookUnavailable(
      result.status,
      result.status === 403
        ? 'The platform refused the score. The score scope is usually not enabled ' +
          'for this tool in the LMS.'
        : `The platform answered ${result.status}: ${result.body.slice(0, 200)}`,
    );
  }
}

/** Whether the platform granted what a write needs, as it said at launch. */
export function grantedScopes(
  ags: { scopes: string[] } | null,
): { mayCreateColumns: boolean; mayPostScores: boolean } {
  const scopes = new Set(ags?.scopes ?? []);
  return {
    mayCreateColumns: scopes.has(AGS_LINE_ITEM_SCOPE),
    mayPostScores: scopes.has(AGS_SCORE_SCOPE),
  };
}
