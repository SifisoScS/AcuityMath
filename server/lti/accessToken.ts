/**
 * Getting permission to call a platform, which is the direction LTI has not
 * gone until now.
 *
 * Everything in C1–C3 was inbound: a platform knocks, we check the knock. The
 * services — roster, gradebook, deep linking — are the reverse, and they change
 * what a mistake costs. An inbound mistake lets somebody in; an **outbound**
 * mistake means we present a credential we signed to a machine we have not
 * checked, and the credential is signed with the key that proves we are this
 * product.
 *
 * There is no shared secret. We prove who we are by signing a short-lived JWT
 * with the private key whose public half the platform already fetched from our
 * JWKS, and hand it over in exchange for a bearer token. That is the OAuth 2
 * client credentials grant with a JWT client assertion (RFC 7523), which the LTI
 * security framework fixes for every service call.
 */

import { randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { LTI_ALGORITHM, signingKey } from './keys';

type Db = MySql2Database<typeof schema>;

/** Fixed by RFC 7523. Not a preference, and platforms match on it exactly. */
export const CLIENT_ASSERTION_TYPE =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/** Reading a course roster. The only scope this graft asks for. */
export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

/**
 * How long the assertion we sign is valid for.
 *
 * Five minutes, and it is presented once. The platform checks `jti` against
 * recent assertions to refuse replays, so a long window is a long list of
 * identifiers it has to keep — and the only thing the window buys us is
 * tolerance for clock drift between two servers.
 */
const ASSERTION_LIFETIME_SECONDS = 5 * 60;

/**
 * How early a cached token is treated as spent.
 *
 * A token with eight seconds left is not a usable token: a roster sync is
 * several requests, and the one that starts inside the window finishes outside
 * it. Sixty seconds is longer than any single call and short enough that almost
 * the whole hour is still used.
 */
const EXPIRY_MARGIN_MS = 60 * 1000;

export class TokenRefused extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'TokenRefused';
    this.status = status;
  }
}

export interface PlatformForToken {
  id: number;
  clientId: string;
  authTokenUrl: string;
}

/**
 * Builds the JWT that stands in for a client secret.
 *
 * `iss` and `sub` are both our client id, which looks like a mistake and is
 * what RFC 7523 requires for client authentication: the client is both the
 * issuer of the assertion and the subject it is about.
 *
 * **`aud` is the token endpoint, not the platform's issuer.** This is the field
 * platforms disagree about in practice, and getting it wrong produces
 * `invalid_client` with no further explanation. The security framework names the
 * endpoint URL, which is also the reading that makes the assertion useless
 * anywhere else — an assertion addressed to an issuer could be presented to any
 * endpoint that issuer operates.
 */
export async function buildClientAssertion(
  db: Db,
  platform: PlatformForToken,
  now: Date = new Date(),
): Promise<string> {
  const key = await signingKey(db);
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: LTI_ALGORITHM, kid: key.kid })
    .setIssuer(platform.clientId)
    .setSubject(platform.clientId)
    .setAudience(platform.authTokenUrl)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ASSERTION_LIFETIME_SECONDS)
    /*
     * Unique per assertion, because it is what lets the platform refuse a
     * replay. Reusing one across calls would be handing the same single-use
     * credential out twice and relying on the platform not to notice.
     */
    .setJti(randomUUID())
    .sign(await importPKCS8(key.privatePem, LTI_ALGORITHM));
}

interface TokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

/**
 * Exchanges an assertion for a bearer token. Always a network call.
 *
 * Nothing here is cached; `accessTokenFor` is the entry point that caches. Kept
 * separate so a caller that knows its token was rejected can force a fresh one
 * without reasoning about the cache.
 */
export async function requestAccessToken(
  db: Db,
  platform: PlatformForToken,
  scope: string,
  now: Date = new Date(),
): Promise<{ accessToken: string; expiresAt: Date; scope: string }> {
  const assertion = await buildClientAssertion(db, platform, now);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: assertion,
    scope,
  });

  let response: Response;
  try {
    response = await fetch(platform.authTokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (error) {
    /*
     * The same defect one layer down, found while wiring the sync trigger: an
     * unreachable token endpoint threw `TypeError: fetch failed`, which reads to
     * whoever sees it as a fault in this product rather than in the platform we
     * could not reach.
     *
     * Status 0 because there was no response to have a status.
     */
    throw new TokenRefused(
      0,
      `Could not reach the token endpoint at ${new URL(platform.authTokenUrl).host}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(text) as TokenResponse;
  } catch {
    /*
     * An HTML error page from a proxy, most often. Included in the message
     * because "unexpected token < in JSON" sends whoever reads the log looking
     * for a bug in this file rather than at their gateway.
     */
    throw new TokenRefused(
      response.status,
      `The token endpoint did not return JSON: ${text.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    throw new TokenRefused(
      response.status,
      `${String(parsed.error ?? 'unknown_error')}: ${String(parsed.error_description ?? text.slice(0, 200))}`,
    );
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
  if (!accessToken) {
    throw new TokenRefused(response.status, 'The token endpoint returned no access_token.');
  }

  /*
   * A platform may grant **less** than was asked for, and says so here. Treating
   * a narrower grant as the scope we requested would cache a token under a
   * permission we do not hold, and the failure would surface later as a puzzling
   * 403 from the roster endpoint rather than here, where the cause is legible.
   *
   * Many platforms omit `scope` entirely when the grant matches the request,
   * which is why absence is accepted rather than treated as none.
   */
  const granted = typeof parsed.scope === 'string' && parsed.scope.trim() !== ''
    ? parsed.scope.trim()
    : scope;
  if (!granted.split(/\s+/).includes(scope)) {
    throw new TokenRefused(
      response.status,
      `The platform granted "${granted}" rather than "${scope}". An administrator ` +
        'needs to allow this scope for the tool in their LMS.',
    );
  }

  /*
   * `expires_in` is seconds from now, and is turned into a deadline immediately.
   * Keeping it as a duration would mean every later comparison had to remember
   * when it was measured, and one that forgot would treat an hour-old token as
   * fresh for another hour.
   */
  const expiresInSeconds = typeof parsed.expires_in === 'number' && parsed.expires_in > 0
    ? parsed.expires_in
    : 3600;

  return {
    accessToken,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    scope,
  };
}

/**
 * A usable token for this platform and scope, from cache or freshly obtained.
 *
 * The margin is the point. A token is only reused while it will still be valid
 * a minute from now, so a caller never begins a multi-page roster fetch with a
 * credential that expires halfway through it.
 */
export async function accessTokenFor(
  db: Db,
  platform: PlatformForToken,
  scope: string,
  now: Date = new Date(),
): Promise<string> {
  const [cached] = await db
    .select()
    .from(schema.ltiAccessTokens)
    .where(
      and(
        eq(schema.ltiAccessTokens.platformId, platform.id),
        eq(schema.ltiAccessTokens.scope, scope),
      ),
    )
    .limit(1);

  if (cached && cached.expiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime()) {
    return cached.accessToken;
  }

  const fresh = await requestAccessToken(db, platform, scope, now);

  /*
   * Upsert rather than delete-then-insert. Two requests needing a token at the
   * same moment both mint one — which the platform permits — and the loser of
   * the race must not fail on a duplicate key or leave a second row behind.
   */
  await db
    .insert(schema.ltiAccessTokens)
    .values({
      platformId: platform.id,
      scope,
      accessToken: fresh.accessToken,
      expiresAt: fresh.expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt },
    });

  return fresh.accessToken;
}

/**
 * Throws away a cached token.
 *
 * For the caller that gets a 401 from a service endpoint while holding a token
 * this module believed was good — a platform that revoked it early, or a clock
 * that disagrees. Without this the next call reads the same dead token from the
 * cache and fails identically until it expires on its own.
 */
export async function forgetAccessToken(
  db: Db,
  platformId: number,
  scope: string,
): Promise<void> {
  await db
    .delete(schema.ltiAccessTokens)
    .where(
      and(
        eq(schema.ltiAccessTokens.platformId, platformId),
        eq(schema.ltiAccessTokens.scope, scope),
      ),
    );
}
