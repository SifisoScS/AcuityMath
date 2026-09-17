/**
 * Getting a bearer token from a district's SIS.
 *
 * **This is not `lti/accessToken.ts` with different URLs**, and the difference
 * is worth stating because the two look alike from a distance. There, we prove
 * who we are by signing a JWT with a private key the platform verifies against
 * our published keyset — nothing secret crosses the wire, ever. Here we send a
 * secret the provider gave us and they compare it. The grant type is the same
 * three words; what backs it is the opposite arrangement.
 *
 * What *is* deliberately identical is the caching: expiry held as a deadline
 * rather than a countdown, scope as part of the key, and a margin so a
 * multi-page roster read never begins with a credential that expires halfway
 * through. Those were learned in C4a and the failures they prevent do not care
 * which protocol asked.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { providerWithSecret, type ProviderCredentials } from './providers';

type Db = MySql2Database<typeof schema>;

/**
 * How long before expiry a cached token stops being reused.
 *
 * The same sixty seconds C4a settled on. A roster page takes well under a
 * second; the margin is not for the request in flight but for the *next* one in
 * a loop that may run fifty times.
 */
const EXPIRY_MARGIN_MS = 60 * 1000;

export class TokenRefused extends Error {
  /** HTTP status, or 0 when there was no response to have one. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TokenRefused';
    this.status = status;
  }
}

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

/**
 * Exchanges the stored credential for a bearer token. Always a network call.
 *
 * The credential goes in an `Authorization: Basic` header rather than the form
 * body. Both are permitted by RFC 6749 and providers differ in what they
 * accept, but the header is the one the RFC requires servers to support — and
 * a secret in a body is a secret that ends up in an access log the first time
 * somebody puts a debugging proxy in the path.
 */
export async function requestAccessToken(
  provider: ProviderCredentials,
  scope: string,
  now: Date = new Date(),
): Promise<{ accessToken: string; expiresAt: Date }> {
  /*
   * RFC 6749 §2.3.1 wants both halves form-urlencoded before they are joined
   * and base64'd. Skipping it works until a generated secret contains a `+` or
   * a `:`, at which point the provider reads a different credential than the
   * one we hold and answers 401 — which reads as a wrong secret rather than a
   * wrongly encoded one.
   */
  const basic = Buffer.from(
    `${encodeURIComponent(provider.clientId)}:${encodeURIComponent(provider.clientSecret)}`,
  ).toString('base64');

  const body = new URLSearchParams({ grant_type: 'client_credentials', scope });

  let response: Response;
  try {
    response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (error) {
    /*
     * Status 0 because there was no response. The wrapping matters for the same
     * reason it did in C4a: `TypeError: fetch failed` reads to whoever sees it
     * as a fault in this product rather than in the system we could not reach.
     */
    throw new TokenRefused(
      0,
      `Could not reach the token endpoint at ${new URL(provider.tokenUrl).host}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(text) as TokenResponse;
  } catch {
    // Usually an HTML error page from a gateway. Quoted, because "unexpected
    // token <" sends the reader looking for a bug in this file.
    throw new TokenRefused(
      response.status,
      `The token endpoint did not return JSON: ${redact(text.slice(0, 200), provider)}`,
    );
  }

  if (!response.ok) {
    throw new TokenRefused(
      response.status,
      redact(
        `${String(parsed.error ?? 'unknown_error')}: ${String(
          parsed.error_description ?? text.slice(0, 200),
        )}`,
        provider,
      ),
    );
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
  if (!accessToken) {
    throw new TokenRefused(response.status, 'The token endpoint returned no access_token.');
  }

  const expiresInSeconds =
    typeof parsed.expires_in === 'number' && parsed.expires_in > 0 ? parsed.expires_in : 3600;

  return {
    accessToken,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
  };
}

/**
 * Keeps the secret out of anything thrown.
 *
 * Providers do echo credentials in error bodies — "invalid client_secret 'xyz'"
 * is a real shape of message — and an exception here travels to a log, a sync
 * record, and sometimes to an administrator's screen. A secret that survives
 * one of those hops is a secret in a place nobody decided to put it.
 */
function redact(text: string, provider: ProviderCredentials): string {
  let safe = text;
  if (provider.clientSecret.length >= 4) {
    safe = safe.split(provider.clientSecret).join('«secret»');
  }
  return safe;
}

/**
 * A usable token for this provider and scope, cached or fresh.
 *
 * Reused only while it will still be valid a minute from now — see
 * `EXPIRY_MARGIN_MS`.
 */
export async function accessTokenFor(
  db: Db,
  providerId: number,
  scope: string,
  now: Date = new Date(),
): Promise<string> {
  const [cached] = await db
    .select()
    .from(schema.onerosterAccessTokens)
    .where(
      and(
        eq(schema.onerosterAccessTokens.providerId, providerId),
        eq(schema.onerosterAccessTokens.scope, scope),
      ),
    )
    .limit(1);

  if (cached && cached.expiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime()) {
    return cached.accessToken;
  }

  const provider = await providerWithSecret(db, providerId);
  if (!provider) {
    throw new TokenRefused(0, `No OneRoster provider is registered with id ${providerId}.`);
  }

  const fresh = await requestAccessToken(provider, scope, now);

  /*
   * Stored with the seconds floored. MySQL rounds a sub-second value into a
   * TIMESTAMP — 12:00:00.800 becomes 12:00:01 — which would make a token read
   * back as valid marginally longer than the provider said it was. Learned in
   * C3e, where it made a freshly signed agreement "not in force" for 200ms.
   */
  const expiresAt = new Date(Math.floor(fresh.expiresAt.getTime() / 1000) * 1000);

  if (cached) {
    await db
      .update(schema.onerosterAccessTokens)
      .set({ accessToken: fresh.accessToken, expiresAt })
      .where(eq(schema.onerosterAccessTokens.id, cached.id));
  } else {
    await db
      .insert(schema.onerosterAccessTokens)
      .values({ providerId, scope, accessToken: fresh.accessToken, expiresAt });
  }

  return fresh.accessToken;
}

/**
 * Drops a cached token, so the next call fetches a new one.
 *
 * Called when a provider answers 401 to a request made with a token we believed
 * was still good — a secret can be rotated or revoked at the SIS without
 * anything telling us, and the cache would otherwise keep presenting a dead
 * credential until its recorded expiry passed.
 */
export async function forgetAccessToken(
  db: Db,
  providerId: number,
  scope: string,
): Promise<void> {
  await db
    .delete(schema.onerosterAccessTokens)
    .where(
      and(
        eq(schema.onerosterAccessTokens.providerId, providerId),
        eq(schema.onerosterAccessTokens.scope, scope),
      ),
    );
}
