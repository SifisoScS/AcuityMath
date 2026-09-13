/**
 * The outbound half of an LTI launch, and the replay protection on it.
 *
 * A launch is a round trip. We send the platform a `state` and a `nonce`; the
 * platform sends both back, the `state` as a parameter and the `nonce` inside a
 * signed token. Checking that what came back is what we sent is the only thing
 * standing between a valid signature and a replayed one — **a token's signature
 * proves the platform wrote it, and says nothing about whether we have seen it
 * before.**
 *
 * So both values are single-use, and consuming one is an atomic conditional
 * update rather than a read followed by a write. Two tokens arriving together
 * with the same state must not both succeed, and a check-then-set would let
 * them.
 */

import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { resolveLaunch } from './platforms';

type Db = MySql2Database<typeof schema>;

/**
 * How long a launch may take.
 *
 * A launch completes in seconds — it is two redirects. Ten minutes is generous
 * enough for a slow network and a slower platform, and short enough that a
 * captured redirect is worthless by the time anyone reads it.
 */
export const LAUNCH_WINDOW_MS = 10 * 60 * 1000;

/** 256 bits, hex. Guessable state is the same as no state. */
function secret(): string {
  return randomBytes(32).toString('hex');
}

export class UnknownPlatform extends Error {
  constructor(issuer: string) {
    super(`No platform registered for issuer ${issuer}.`);
    this.name = 'UnknownPlatform';
  }
}

/**
 * Raised when an issuer alone does not identify one registration.
 *
 * A platform that hosts several installations of this product sends a
 * `client_id` to say which. If it does not, and we hold more than one for that
 * issuer, there is no safe guess — picking either could start a launch against
 * the wrong district. Refusing is the only honest answer.
 */
export class AmbiguousPlatform extends Error {
  constructor(issuer: string, count: number) {
    super(
      `${count} registrations exist for ${issuer}; the launch must name a client_id.`,
    );
    this.name = 'AmbiguousPlatform';
  }
}

export interface InitiationRequest {
  issuer: string;
  loginHint: string;
  targetLinkUri: string;
  clientId?: string;
  messageHint?: string;
  deploymentId?: string;
}

export interface Initiation {
  /** Where the browser is sent, on the platform. */
  redirectUrl: string;
  state: string;
  nonce: string;
}

/**
 * Starts a launch: records what we sent, and builds the platform's URL.
 *
 * The parameters are fixed by the specification and are not preferences.
 * `response_mode=form_post` because the token is too large for a query string
 * and must not sit in browser history; `prompt=none` because the platform has
 * already authenticated the user and a second prompt would be a bug, not a
 * safeguard.
 */
export async function beginLaunch(
  db: Db,
  request: InitiationRequest,
  redirectUri: string,
  now: Date = new Date(),
): Promise<Initiation> {
  const issuer = request.issuer.trim();
  if (!issuer) throw new Error('A launch must name an issuer.');

  const candidates = await db
    .select()
    .from(schema.ltiPlatforms)
    .where(eq(schema.ltiPlatforms.issuer, issuer));

  if (candidates.length === 0) throw new UnknownPlatform(issuer);

  const wanted = request.clientId?.trim();
  const platform = wanted
    ? candidates.find(row => row.clientId === wanted)
    : candidates.length === 1
      ? candidates[0]
      : undefined;

  if (!platform) {
    if (wanted) throw new UnknownPlatform(issuer);
    throw new AmbiguousPlatform(issuer, candidates.length);
  }

  /*
   * The deployment is checked here when the platform sent one, rather than only
   * at the end of the round trip. A launch that cannot land is better refused
   * before the user is redirected away and back — the error appears on our page
   * instead of as a failed return from theirs.
   */
  if (request.deploymentId) {
    const resolved = await resolveLaunch(
      db,
      platform.issuer,
      platform.clientId,
      request.deploymentId.trim(),
    );
    if (!resolved) {
      throw new UnknownPlatform(
        `${issuer} (deployment ${request.deploymentId} is not registered)`,
      );
    }
  }

  const state = secret();
  const nonce = secret();

  await db.insert(schema.ltiLaunchStates).values({
    state,
    nonce,
    platformId: platform.id,
    targetLinkUri: request.targetLinkUri,
    expiresAt: new Date(now.getTime() + LAUNCH_WINDOW_MS),
  });

  const url = new URL(platform.authLoginUrl);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('prompt', 'none');
  url.searchParams.set('client_id', platform.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('login_hint', request.loginHint);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  if (request.messageHint) url.searchParams.set('lti_message_hint', request.messageHint);

  return { redirectUrl: url.toString(), state, nonce };
}

export interface ConsumedState {
  id: number;
  state: string;
  nonce: string;
  platformId: number;
  targetLinkUri: string;
}

/**
 * Claims a state exactly once, or returns nothing.
 *
 * **Atomic on purpose.** Reading the row, checking `consumedAt`, then writing it
 * leaves a window in which two requests both read "unconsumed" and both proceed
 * — which is precisely the replay this exists to stop, delivered by
 * concurrency rather than by an attacker. The conditional update makes the
 * database the arbiter: whichever statement lands first changes a row, the
 * other changes none.
 *
 * Returns `null` for unknown, already-consumed and expired alike. The caller
 * cannot distinguish them and should not: telling a stranger which of the three
 * their token was is telling them how to get closer.
 */
export async function consumeState(
  db: Db,
  state: string,
  now: Date = new Date(),
): Promise<ConsumedState | null> {
  const [row] = await db
    .select()
    .from(schema.ltiLaunchStates)
    .where(eq(schema.ltiLaunchStates.state, state))
    .limit(1);

  if (!row) return null;

  const result = await db
    .update(schema.ltiLaunchStates)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.ltiLaunchStates.state, state),
        isNull(schema.ltiLaunchStates.consumedAt),
      ),
    );

  // mysql2 reports how many rows the statement changed. Zero means somebody
  // else consumed it between the read above and this write.
  const changed = (result as unknown as { affectedRows?: number })?.affectedRows
    ?? (Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : 0);
  if (!changed) return null;

  // Expiry is checked after claiming, so an expired state is still burned. A
  // token held until it expired should not become replayable by expiring.
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  return {
    id: row.id,
    state: row.state,
    nonce: row.nonce,
    platformId: row.platformId,
    targetLinkUri: row.targetLinkUri,
  };
}

/**
 * Removes launches that were started and never finished.
 *
 * Abandoned redirects accumulate — a user closing a tab mid-launch leaves one
 * every time. Consumed rows go too: their single-use has already been enforced
 * by `consumedAt`, and keeping them forever would turn a table read on every
 * launch into a table scan over a year of abandoned tabs.
 */
export async function purgeExpiredLaunches(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(schema.ltiLaunchStates).where(lt(schema.ltiLaunchStates.expiresAt, now));
}
