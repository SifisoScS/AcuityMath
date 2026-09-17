/**
 * Registering a district's student information system.
 *
 * One provider per district, enforced by the schema. A second would make "which
 * roster is authoritative" a question with no answer, and D3's reconciliation
 * has to have one — two sources disagreeing about whether a pupil is enrolled
 * would flip them in and out on alternate nights.
 *
 * **The secret leaves this module only for the token exchange.** Every read
 * used by a surface selects columns explicitly and omits the sealed column
 * entirely, so exposing it takes a deliberate call to `providerWithSecret`
 * rather than a forgotten `select()`.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { open, seal } from './credentials';

type Db = MySql2Database<typeof schema>;

export class CannotRegisterProvider extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'CannotRegisterProvider';
    this.reason = reason;
  }
}

/** What any surface may see. Deliberately without the credential. */
export interface ProviderSummary {
  id: number;
  institutionId: number;
  name: string;
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCredentials extends ProviderSummary {
  clientSecret: string;
}

/**
 * Both URLs must be https, and the refusal says which one failed.
 *
 * Not a general policy about outbound requests — it is that **this credential
 * travels on them**. A token request over http puts a district's SIS secret on
 * the wire in clear, and unlike a roster read the damage does not end when the
 * connection does.
 *
 * Loopback is allowed under `NODE_ENV === 'test'` and nowhere else, the same
 * exception `nrps.ts` makes and for the same reason: a test server cannot hold
 * a certificate for a hostname that does not exist.
 */
function refuseInsecure(label: string, url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CannotRegisterProvider('malformed_url', `The ${label} is not a URL: ${url}`);
  }

  if (parsed.protocol === 'https:') return parsed;

  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (loopback && process.env.NODE_ENV === 'test') return parsed;

  throw new CannotRegisterProvider(
    'insecure_url',
    `The ${label} must be https. The client secret is sent on this request, and over ` +
      'http it travels in clear to anybody on the path.',
  );
}

/**
 * Stores a provider, sealing the secret on the way in.
 *
 * Re-registering the same district replaces the row rather than adding one,
 * because an administrator correcting a typo in a base URL should not have to
 * discover a delete button first — and because the unique index would refuse
 * them anyway, with a message about an index.
 */
export async function registerProvider(
  db: Db,
  input: {
    institutionId: number;
    name: string;
    baseUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scopes: string;
  },
): Promise<ProviderSummary> {
  const base = refuseInsecure('base URL', input.baseUrl);
  refuseInsecure('token URL', input.tokenUrl);

  if (input.clientSecret.trim() === '') {
    throw new CannotRegisterProvider('no_secret', 'A client secret is required.');
  }
  if (input.scopes.trim() === '') {
    throw new CannotRegisterProvider(
      'no_scopes',
      'At least one scope is required. Your SIS lists the ones it will grant.',
    );
  }

  /*
   * Sealed before anything is written. `seal` throws when no key is configured,
   * and doing it first means a deployment that cannot protect the credential
   * refuses the whole registration rather than storing the other five columns
   * and failing on the sixth.
   */
  const clientSecretSealed = seal(input.clientSecret);

  // Stored without its trailing slash, so every path built from it has exactly
  // one separator rather than depending on what somebody pasted.
  const baseUrl = `${base.origin}${base.pathname.replace(/\/$/, '')}`;

  const existing = await providerFor(db, input.institutionId);
  if (existing) {
    await db
      .update(schema.onerosterProviders)
      .set({
        name: input.name,
        baseUrl,
        tokenUrl: input.tokenUrl,
        clientId: input.clientId,
        clientSecretSealed,
        scopes: input.scopes.trim(),
      })
      .where(eq(schema.onerosterProviders.id, existing.id));

    /*
     * Cached tokens are dropped, not kept. They were issued against the old
     * credential, and a rotated secret usually means the old one was revoked —
     * so reusing a cached token would work until it abruptly did not, at an
     * hour nobody chose.
     */
    await db
      .delete(schema.onerosterAccessTokens)
      .where(eq(schema.onerosterAccessTokens.providerId, existing.id));

    const updated = await providerFor(db, input.institutionId);
    if (!updated) throw new Error('The provider disappeared while being updated.');
    return updated;
  }

  await db.insert(schema.onerosterProviders).values({
    institutionId: input.institutionId,
    name: input.name,
    baseUrl,
    tokenUrl: input.tokenUrl,
    clientId: input.clientId,
    clientSecretSealed,
    scopes: input.scopes.trim(),
  });

  const created = await providerFor(db, input.institutionId);
  if (!created) throw new Error('The provider was not stored.');
  return created;
}

/** The district's provider, without its credential. */
export async function providerFor(
  db: Db,
  institutionId: number,
): Promise<ProviderSummary | null> {
  const [row] = await db
    .select({
      id: schema.onerosterProviders.id,
      institutionId: schema.onerosterProviders.institutionId,
      name: schema.onerosterProviders.name,
      baseUrl: schema.onerosterProviders.baseUrl,
      tokenUrl: schema.onerosterProviders.tokenUrl,
      clientId: schema.onerosterProviders.clientId,
      scopes: schema.onerosterProviders.scopes,
      createdAt: schema.onerosterProviders.createdAt,
      updatedAt: schema.onerosterProviders.updatedAt,
    })
    .from(schema.onerosterProviders)
    .where(eq(schema.onerosterProviders.institutionId, institutionId))
    .limit(1);

  return row ?? null;
}

/**
 * The provider **with** its secret opened, for the token exchange and nothing
 * else.
 *
 * Named so that a reader of a call site can see what it is reaching for. The
 * alternative — one `getProvider` returning everything — is how a secret ends
 * up in a tRPC response: not by anybody deciding to expose it, but by somebody
 * returning a row they did not read closely.
 */
export async function providerWithSecret(
  db: Db,
  providerId: number,
): Promise<ProviderCredentials | null> {
  const [row] = await db
    .select()
    .from(schema.onerosterProviders)
    .where(eq(schema.onerosterProviders.id, providerId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    institutionId: row.institutionId,
    name: row.name,
    baseUrl: row.baseUrl,
    tokenUrl: row.tokenUrl,
    clientId: row.clientId,
    scopes: row.scopes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clientSecret: open(row.clientSecretSealed),
  };
}

/** Removes a district's provider, and with it every cached token. */
export async function forgetProvider(db: Db, institutionId: number): Promise<void> {
  await db
    .delete(schema.onerosterProviders)
    .where(eq(schema.onerosterProviders.institutionId, institutionId));
}
