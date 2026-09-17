/**
 * Reading a OneRoster 1.2 endpoint.
 *
 * The client only — what D1 is. It fetches collections and hands back rows;
 * turning those rows into schools, classes and enrolments is D2, and deciding
 * what to do when they disagree with what we already hold is D3. Kept apart
 * because the failure modes are different: this file is about a network and a
 * credential, and the next two are about meaning.
 *
 * **Pagination is offset-based here, which NRPS's is not.** LTI's membership
 * service hands out a `Link: rel="next"` header and the client follows it
 * blindly; OneRoster asks for `limit` and `offset` and expects the caller to
 * keep count. The difference matters for a reason beyond syntax — following a
 * server's own link cannot skip a record, while computing the next offset can,
 * if the collection changes underneath a sync that takes a minute. The guard
 * against that is D3's business, and this file's job is to report honestly what
 * it saw rather than to smooth it over.
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { accessTokenFor, forgetAccessToken, TokenRefused } from './accessToken';
import { providerFor } from './providers';

type Db = MySql2Database<typeof schema>;

/**
 * How many pages a single read will follow before giving up.
 *
 * A district of 50,000 pupils at the default page size is 500 pages, so this is
 * not a size limit — it is a **loop** limit. A provider that ignores `offset`
 * and returns page one forever would otherwise be an infinite read holding a
 * connection, and that has happened to enough integrations to be worth naming.
 */
export const MAX_PAGES = 600;

/**
 * How many times one read will fetch a fresh token after a refusal.
 *
 * Found by mutation: the guard was `retried` — a single boolean for the whole
 * read — and removing it changed **nothing observable**, because a second 401
 * on the same page throws anyway. The boolean only mattered across pages, and
 * there it was wrong in both directions: too strict for a provider with
 * short-lived tokens, and no real bound for one that refuses everything.
 *
 * A small budget is the honest rule. A page may recover from one rotation; a
 * provider that invalidates a token every page is misbehaving and is reported
 * rather than hammered.
 */
export const MAX_TOKEN_REFRESHES = 2;

/** The page size asked for. Providers may return fewer; none may return more usefully. */
export const PAGE_SIZE = 100;

export class RosterUnavailable extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RosterUnavailable';
    this.status = status;
  }
}

/**
 * Whether a URL may be fetched with a district's credential attached.
 *
 * Checked again here rather than trusted from registration. The stored base URL
 * was validated when it was written, but a path is appended to it on every call
 * and a provider's own `baseUrl` column could be edited by anything with
 * database access — so the check sits next to the request that carries the
 * token, not next to the form that stored the address.
 */
export function mayFetch(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;

  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  return loopback && process.env.NODE_ENV === 'test';
}

interface PageResult {
  rows: unknown[];
  /** What the provider said the whole collection holds, when it said anything. */
  total: number | null;
}

/**
 * One page, already unwrapped.
 *
 * OneRoster nests its collections under a key named for the resource — `orgs`,
 * `classes`, `users` — rather than a constant like `data`. The caller names the
 * key because only the caller knows which endpoint it asked for; guessing it
 * from the first key present would silently pick `errors` on a malformed
 * response.
 */
async function readPage(
  url: string,
  token: string,
  collection: string,
): Promise<PageResult & { status: number }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  } catch (error) {
    throw new RosterUnavailable(
      0,
      `Could not reach ${new URL(url).host}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    // Returned rather than thrown: the caller decides whether this is the first
    // 401 (worth retrying with a fresh token) or the second (worth reporting).
    return { rows: [], total: null, status: response.status };
  }

  const text = await response.text();
  if (!response.ok) {
    throw new RosterUnavailable(
      response.status,
      `${new URL(url).host} refused the request: ${text.slice(0, 200)}`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new RosterUnavailable(
      response.status,
      `${new URL(url).host} did not return JSON: ${text.slice(0, 200)}`,
    );
  }

  const rows = parsed[collection];
  if (!Array.isArray(rows)) {
    throw new RosterUnavailable(
      response.status,
      `The response held no "${collection}" array. This endpoint may not be OneRoster 1.2.`,
    );
  }

  /*
   * `X-Total-Count` is how a provider says how big the collection is. It is
   * advisory: some omit it, some report the count before filtering. It is used
   * only to stop early, never to decide a sync is complete — believing it over
   * what actually arrived is how a roster sync silently processes half a
   * district.
   */
  const header = response.headers.get('x-total-count');
  const total = header !== null && /^\d+$/.test(header) ? Number(header) : null;

  return { rows, total, status: response.status };
}

/**
 * Every record in a collection, across as many pages as it takes.
 *
 * One token for the whole read, refreshed once if the provider rejects it
 * partway — a sync that takes a minute can outlive a credential rotated at the
 * SIS while it runs, and starting again from page one would be worse than
 * carrying on with a new token.
 */
export async function readCollection(
  db: Db,
  institutionId: number,
  collection: string,
  options: { pageSize?: number } = {},
): Promise<{ rows: unknown[]; pages: number; reportedTotal: number | null }> {
  const provider = await providerFor(db, institutionId);
  if (!provider) {
    throw new RosterUnavailable(
      0,
      'This district has no student information system registered.',
    );
  }

  const scope = provider.scopes.split(/\s+/)[0] ?? '';
  const pageSize = options.pageSize ?? PAGE_SIZE;

  let token: string;
  try {
    token = await accessTokenFor(db, provider.id, scope);
  } catch (error) {
    if (error instanceof TokenRefused) {
      throw new RosterUnavailable(error.status, error.message);
    }
    throw error;
  }

  const rows: unknown[] = [];
  let pages = 0;
  let reportedTotal: number | null = null;
  let refreshes = 0;

  for (let offset = 0; pages < MAX_PAGES; offset += pageSize) {
    const url = `${provider.baseUrl}/${collection}?limit=${pageSize}&offset=${offset}`;
    if (!mayFetch(url)) {
      throw new RosterUnavailable(
        0,
        `Refusing to send this district's credential to ${url} — it is not https.`,
      );
    }

    let page = await readPage(url, token, collection);

    if (page.status === 401 && refreshes < MAX_TOKEN_REFRESHES) {
      /*
       * A credential can be rotated at the SIS while a minute-long read is in
       * flight, so one refusal is worth a fresh token. The budget is what stops
       * that becoming a loop against somebody else's authentication endpoint:
       * a second 401 immediately after a freshly issued token is not a stale
       * credential, it is a wrong or revoked one.
       */
      refreshes += 1;
      await forgetAccessToken(db, provider.id, scope);
      token = await accessTokenFor(db, provider.id, scope);
      page = await readPage(url, token, collection);
    }

    if (page.status === 401 || page.status === 403) {
      throw new RosterUnavailable(
        page.status,
        `${provider.name} refused this tool's credential for "${scope}". ` +
          'The secret may have been rotated, or the scope may not be granted.',
      );
    }

    pages += 1;
    if (page.total !== null) reportedTotal = page.total;
    rows.push(...page.rows);

    // A short page is the end of the collection. Trusting `X-Total-Count`
    // instead would stop early against a provider that reports it wrongly.
    if (page.rows.length < pageSize) break;
  }

  return { rows, pages, reportedTotal };
}
