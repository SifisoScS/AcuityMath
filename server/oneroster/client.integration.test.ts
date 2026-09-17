// @vitest-environment node

/**
 * Reading a roster from a district's SIS, against a server that checks.
 *
 * The fake below behaves like a provider rather than like a fixture: it issues
 * real bearer tokens, refuses the ones it has not issued, paginates by `limit`
 * and `offset`, and can be told to rotate its secret mid-read. Everything
 * asserted here is a thing that goes wrong with somebody else's system, which
 * is where this whole track's failures live.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import {
  CannotRegisterProvider,
  forgetProvider,
  providerFor,
  providerWithSecret,
  registerProvider,
} from './providers';
import { accessTokenFor, forgetAccessToken, TokenRefused } from './accessToken';
import {
  MAX_PAGES,
  MAX_TOKEN_REFRESHES,
  RosterUnavailable,
  mayFetch,
  readCollection,
} from './client';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const KEY = Buffer.alloc(32, 5).toString('base64');
const SECRET = 'sis-secret-value';

interface SisState {
  /** What the SIS currently accepts as a client secret. */
  secret: string;
  tokens: Set<string>;
  /** Every `org` the SIS holds, paged out on demand. */
  orgs: Array<Record<string, unknown>>;
  /** Requests seen, so a test can assert what was actually sent. */
  requests: string[];
  authHeaders: string[];
  tokenRequests: number;
  /** Raw bodies and headers the token endpoint saw, so a test can assert where the secret went. */
  tokenBodies: string[];
  tokenAuthHeaders: string[];
  /** Set to serve something other than a collection. */
  raw?: { status: number; body: string; contentType?: string };
  /** Set to omit the total-count header. */
  omitTotal?: boolean;
  /** Set to answer 401 on reads regardless of the token. */
  rejectReads?: boolean;
  /** Set to invalidate every issued token after each successful read. */
  invalidateAfterEachRead?: boolean;
}

describeWithDb('reading a district’s roster', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sis: Server;
  let base: string;
  let lincoln: { id: number };
  let state: SisState;
  let originalKey: string | undefined;
  let tokenCounter = 0;

  beforeAll(async () => {
    harness = await createTestDatabase('onerosterclient');

    sis = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);

      if (url.pathname === '/token') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          state.tokenRequests += 1;
          state.tokenBodies.push(body);
          state.tokenAuthHeaders.push(req.headers.authorization ?? '');

          /*
           * The credential is checked, not assumed. A test that rotates the
           * secret has to see the old one refused, or the retry path below
           * proves nothing.
           */
          const header = req.headers.authorization ?? '';
          const decoded = Buffer.from(header.replace(/^Basic /, ''), 'base64').toString('utf8');
          const [, presented] = decoded.split(':');

          if (decodeURIComponent(presented ?? '') !== state.secret) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            /*
             * Echoing the credential back is a real shape of error message —
             * "invalid client_secret 'xyz'" — and it is why `redact` exists.
             * A fake that answers with a bare code cannot exercise it, which is
             * how that guard first read as dead.
             */
            res.end(
              JSON.stringify({
                error: 'invalid_client',
                error_description: `invalid client_secret '${decodeURIComponent(presented ?? '')}'`,
              }),
            );
            return;
          }

          tokenCounter += 1;
          const token = `tok-${tokenCounter}`;
          state.tokens.add(token);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: token, expires_in: 3600 }));
        });
        return;
      }

      state.requests.push(url.pathname + url.search);
      state.authHeaders.push(req.headers.authorization ?? '');

      if (state.raw) {
        res.statusCode = state.raw.status;
        res.setHeader('content-type', state.raw.contentType ?? 'text/html');
        res.end(state.raw.body);
        return;
      }

      const presented = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (state.rejectReads || !state.tokens.has(presented)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      const limit = Number(url.searchParams.get('limit') ?? '100');
      const offset = Number(url.searchParams.get('offset') ?? '0');
      const page = state.orgs.slice(offset, offset + limit);

      // A provider that expires its tokens absurdly fast. Nothing legitimate
      // does this; a misconfigured one does, and it must be reported rather
      // than hammered.
      if (state.invalidateAfterEachRead) state.tokens.clear();

      if (!state.omitTotal) res.setHeader('x-total-count', String(state.orgs.length));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ orgs: page }));
    });

    await new Promise<void>(resolve => sis.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(sis.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => sis?.close(() => resolve()));
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;

    originalKey = process.env.ONEROSTER_CREDENTIAL_KEY;
    process.env.ONEROSTER_CREDENTIAL_KEY = KEY;

    state = {
      secret: SECRET,
      tokens: new Set(),
      orgs: [],
      requests: [],
      authHeaders: [],
      tokenRequests: 0,
      tokenBodies: [],
      tokenAuthHeaders: [],
    };

    lincoln = await createInstitution(db, 'Lincoln Unified');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ONEROSTER_CREDENTIAL_KEY;
    else process.env.ONEROSTER_CREDENTIAL_KEY = originalKey;
  });

  const register = (overrides: Partial<Parameters<typeof registerProvider>[1]> = {}) =>
    registerProvider(db, {
      institutionId: lincoln.id,
      name: 'PowerSchool',
      baseUrl: `${base}/ims/oneroster/rostering/v1p2`,
      tokenUrl: `${base}/token`,
      clientId: 'acuity',
      clientSecret: SECRET,
      scopes: 'roster-core.readonly',
      ...overrides,
    });

  function orgs(count: number) {
    state.orgs = Array.from({ length: count }, (_, index) => ({
      sourcedId: `org-${index}`,
      name: `School ${index}`,
      type: 'school',
    }));
  }

  describe('registering the provider', () => {
    it('stores the credential sealed, never in the clear', async () => {
      /*
       * **The assertion this table exists for.** A dump of `oneroster_providers`
       * must not hand somebody a district's SIS. Read back through raw SQL
       * rather than through `providerWithSecret`, because the question is what
       * is *in the row*.
       */
      await register();

      const [row] = await db.select().from(schema.onerosterProviders);
      expect(row.clientSecretSealed).not.toContain(SECRET);
      expect(JSON.stringify(row)).not.toContain(SECRET);

      const opened = await providerWithSecret(db, row.id);
      expect(opened?.clientSecret).toBe(SECRET);
    });

    it('refuses to register at all when there is no key to seal with', async () => {
      /*
       * Fails closed, and fails **whole**: nothing is written. A row holding
       * five correct columns and no usable credential would look registered
       * from every surface.
       */
      delete process.env.ONEROSTER_CREDENTIAL_KEY;

      await expect(register()).rejects.toThrow(/ONEROSTER_CREDENTIAL_KEY/);
      expect(await db.select().from(schema.onerosterProviders)).toHaveLength(0);
    });

    it('keeps the secret out of everything a surface can read', async () => {
      // `providerFor` is what a router would call. It selects columns
      // explicitly so that reaching the credential has to be deliberate.
      await register();
      const summary = await providerFor(db, lincoln.id);
      expect(JSON.stringify(summary)).not.toContain(SECRET);
      expect(Object.keys(summary ?? {})).not.toContain('clientSecretSealed');
    });

    it('refuses a token URL that is not https', async () => {
      /*
       * Not a general rule about outbound requests — **the secret rides on this
       * one**. Over http it travels in clear to anybody on the path, and unlike
       * a roster read the damage does not end with the connection.
       */
      await expect(
        register({ tokenUrl: 'http://sis.example.test/token' }),
      ).rejects.toThrow(CannotRegisterProvider);
    });

    it('refuses a base URL that is not https', async () => {
      await expect(
        register({ baseUrl: 'http://sis.example.test/v1p2' }),
      ).rejects.toThrow(/must be https/);
    });

    it('refuses a malformed URL rather than storing it', async () => {
      await expect(register({ baseUrl: 'not a url' })).rejects.toThrow(/not a URL/);
    });

    it('refuses an empty secret and an empty scope list', async () => {
      await expect(register({ clientSecret: '  ' })).rejects.toThrow(/client secret is required/);
      await expect(register({ scopes: '' })).rejects.toThrow(/scope/i);
    });

    it('strips a trailing slash so paths are built with one separator', async () => {
      const stored = await register({ baseUrl: `${base}/ims/oneroster/rostering/v1p2/` });
      expect(stored.baseUrl.endsWith('/')).toBe(false);
    });

    it('replaces the district’s provider rather than adding a second', async () => {
      /*
       * One SIS per district, which D3 depends on. Two sources disagreeing
       * about whether a pupil is enrolled would flip them in and out on
       * alternate nights, and nothing would be able to say which was right.
       */
      await register();
      await register({ name: 'Infinite Campus' });

      const all = await db.select().from(schema.onerosterProviders);
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Infinite Campus');
    });

    it('drops cached tokens when the credential is re-entered', async () => {
      /*
       * A rotated secret usually means the old one was revoked. A cached token
       * issued against it would keep working until it abruptly did not, at an
       * hour nobody chose.
       */
      orgs(1);
      await register();
      await readCollection(db, lincoln.id, 'orgs');
      expect(await db.select().from(schema.onerosterAccessTokens)).toHaveLength(1);

      await register({ clientSecret: 'rotated-secret' });
      expect(await db.select().from(schema.onerosterAccessTokens)).toHaveLength(0);
    });

    it('takes the credential away with the district', async () => {
      await register();
      await forgetProvider(db, lincoln.id);
      expect(await providerFor(db, lincoln.id)).toBeNull();
    });
  });

  describe('the token exchange', () => {
    it('sends the secret in an Authorization header, not the body', async () => {
      /*
       * Both are permitted, but a secret in a form body is a secret in an
       * access log the first time somebody puts a debugging proxy in the path.
       */
      await register();
      const token = await accessTokenFor(db, (await providerFor(db, lincoln.id))!.id, 'roster-core.readonly');
      expect(token).toMatch(/^tok-/);

      // The body carries the grant and the scope, and nothing else.
      expect(state.tokenBodies[0]).toContain('grant_type=client_credentials');
      expect(state.tokenBodies[0]).not.toContain(SECRET);
      expect(state.tokenBodies[0]).not.toContain('acuity');

      const decoded = Buffer.from(
        state.tokenAuthHeaders[0].replace(/^Basic /, ''),
        'base64',
      ).toString('utf8');
      expect(decodeURIComponent(decoded.split(':')[1])).toBe(SECRET);
    });

    it('encodes both halves, so a secret with a colon still authenticates', async () => {
      /*
       * RFC 6749 §2.3.1 wants each half form-urlencoded before they are joined
       * and base64'd. Skipping it works until a generated secret contains a `:`
       * or a `+` — at which point the provider reads a *different* credential
       * than the one we hold and answers 401, which looks like a wrong secret
       * rather than a wrongly encoded one.
       */
      const awkward = 'has:a+colon/and=plus';
      state.secret = awkward;
      await register({ clientSecret: awkward });

      const provider = (await providerFor(db, lincoln.id))!;
      await expect(accessTokenFor(db, provider.id, 'roster-core.readonly')).resolves.toMatch(
        /^tok-/,
      );
    });

    it('reuses a cached token rather than asking again', async () => {
      orgs(1);
      await register();
      await readCollection(db, lincoln.id, 'orgs');
      await readCollection(db, lincoln.id, 'orgs');
      expect(state.tokenRequests).toBe(1);
    });

    it('does not reuse a token that expires within the minute', async () => {
      /*
       * The margin. A roster page takes well under a second, so this is not for
       * the request in flight — it is for the next one in a loop that may run
       * fifty times.
       */
      orgs(1);
      await register();
      const provider = (await providerFor(db, lincoln.id))!;
      await accessTokenFor(db, provider.id, 'roster-core.readonly');

      await db
        .update(schema.onerosterAccessTokens)
        .set({ expiresAt: new Date(Date.now() + 30_000) })
        .where(eq(schema.onerosterAccessTokens.providerId, provider.id));

      await accessTokenFor(db, provider.id, 'roster-core.readonly');
      expect(state.tokenRequests).toBe(2);
    });

    it('reports a refused credential as the provider’s refusal', async () => {
      await register({ clientSecret: 'wrong-secret' });
      const provider = (await providerFor(db, lincoln.id))!;
      await expect(accessTokenFor(db, provider.id, 'roster-core.readonly')).rejects.toThrow(
        TokenRefused,
      );
    });

    it('never puts the secret in what it throws', async () => {
      /*
       * Providers do echo credentials in error bodies. An exception travels to
       * a log, a sync record, and sometimes to an administrator's screen; a
       * secret that survives one of those hops is in a place nobody chose.
       */
      state.secret = 'something-else';
      await register();
      const provider = (await providerFor(db, lincoln.id))!;

      try {
        await accessTokenFor(db, provider.id, 'roster-core.readonly');
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as Error).message).not.toContain(SECRET);
      }
    });

    it('names the host when it cannot be reached', async () => {
      // `TypeError: fetch failed` reads as a fault in this product rather than
      // in the system we could not reach.
      await register({ tokenUrl: 'https://127.0.0.1:1/token' });
      const provider = (await providerFor(db, lincoln.id))!;

      try {
        await accessTokenFor(db, provider.id, 'roster-core.readonly');
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as TokenRefused).status).toBe(0);
        expect((error as Error).message).toMatch(/Could not reach the token endpoint/);
      }
    });
  });

  describe('paging through a collection', () => {
    it('reads every record across pages', async () => {
      orgs(250);
      await register();

      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });

      expect(result.rows).toHaveLength(250);
      expect(result.pages).toBe(3);
      expect(state.requests).toEqual([
        '/ims/oneroster/rostering/v1p2/orgs?limit=100&offset=0',
        '/ims/oneroster/rostering/v1p2/orgs?limit=100&offset=100',
        '/ims/oneroster/rostering/v1p2/orgs?limit=100&offset=200',
      ]);
    });

    it('uses one token for the whole read', async () => {
      orgs(250);
      await register();
      await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });

      const distinct = new Set(state.authHeaders);
      expect(distinct.size).toBe(1);
      expect(state.tokenRequests).toBe(1);
    });

    it('stops on a short page rather than trusting the reported total', async () => {
      /*
       * `X-Total-Count` is advisory — some providers omit it, some report it
       * before filtering. Believing it over what actually arrived is how a sync
       * silently processes half a district.
       */
      orgs(150);
      await register();
      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });
      expect(result.pages).toBe(2);
      expect(result.rows).toHaveLength(150);
    });

    it('works when the provider reports no total at all', async () => {
      state.omitTotal = true;
      orgs(150);
      await register();
      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });
      expect(result.rows).toHaveLength(150);
      expect(result.reportedTotal).toBeNull();
    });

    it('handles an empty collection without a second request', async () => {
      orgs(0);
      await register();
      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });
      expect(result.rows).toHaveLength(0);
      expect(result.pages).toBe(1);
    });

    it('will not loop forever against a provider that ignores offset', async () => {
      /*
       * Not a size limit — a **loop** limit. A provider returning page one
       * forever would otherwise be an infinite read holding a connection, which
       * has happened to enough integrations to be worth naming.
       */
      expect(MAX_PAGES).toBeGreaterThan(500);
      orgs(10);
      await register();

      // A page that is always full, whatever the offset.
      state.orgs = Array.from({ length: 5 }, (_, i) => ({ sourcedId: `org-${i}` }));
      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 2 });
      expect(result.pages).toBeLessThanOrEqual(MAX_PAGES);
    });
  });

  describe('when the credential stops working mid-read', () => {
    it('refreshes the token once and carries on', async () => {
      /*
       * A sync that takes a minute can outlive a credential rotated at the SIS
       * while it runs. Starting again from page one would be worse than
       * carrying on with a new token.
       */
      orgs(5);
      await register();
      const provider = (await providerFor(db, lincoln.id))!;

      // A token this SIS will not honour, cached as though it were good.
      await accessTokenFor(db, provider.id, 'roster-core.readonly');
      state.tokens.clear();

      const result = await readCollection(db, lincoln.id, 'orgs', { pageSize: 100 });
      expect(result.rows).toHaveLength(5);
      expect(state.tokenRequests).toBe(2);
    });

    it('gives up on a provider that invalidates a token every page', async () => {
      /*
       * **The case the old boolean could not express.** A single `retried` flag
       * for the whole read was invisible to mutation: a second 401 on the same
       * page throws regardless. It only ever mattered *across* pages, and there
       * it was wrong both ways — too strict for short-lived tokens, and no real
       * bound for a provider refusing everything.
       *
       * A budget says the honest thing: recover from a rotation, refuse a
       * provider that makes every page a fresh authentication.
       */
      state.invalidateAfterEachRead = true;
      orgs(500);
      await register();

      await expect(readCollection(db, lincoln.id, 'orgs', { pageSize: 10 })).rejects.toThrow(
        RosterUnavailable,
      );
      expect(state.tokenRequests).toBeLessThanOrEqual(MAX_TOKEN_REFRESHES + 1);
    });

    it('gives up after the second refusal rather than looping', async () => {
      /*
       * A second 401 after a freshly issued token is not a stale credential —
       * it is a wrong or revoked one, and retrying would turn a clear refusal
       * into a loop against somebody else's authentication endpoint.
       */
      state.rejectReads = true;
      orgs(5);
      await register();

      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(RosterUnavailable);
      expect(state.tokenRequests).toBeLessThanOrEqual(2);
    });

    it('says what an administrator can act on', async () => {
      state.rejectReads = true;
      orgs(5);
      await register();

      try {
        await readCollection(db, lincoln.id, 'orgs');
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as Error).message).toMatch(/rotated|scope/i);
        expect((error as Error).message).toContain('PowerSchool');
      }
    });
  });

  describe('refusals', () => {
    it('will not read for a district with no provider', async () => {
      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(
        /no student information system/i,
      );
    });

    it('will not send the credential to a non-https address', async () => {
      /*
       * Checked beside the request that carries the token rather than only at
       * registration: a path is appended on every call, and the stored column
       * could be edited by anything with database access.
       */
      const previous = process.env.NODE_ENV;
      expect(mayFetch('https://sis.example.test/v1p2/orgs')).toBe(true);
      try {
        process.env.NODE_ENV = 'production';
        expect(mayFetch('http://127.0.0.1:9000/v1p2/orgs')).toBe(false);
        expect(mayFetch('http://sis.example.test/v1p2/orgs')).toBe(false);
      } finally {
        process.env.NODE_ENV = previous;
      }
      expect(mayFetch('not a url')).toBe(false);
    });

    it('refuses an http base URL that reached the row some other way', async () => {
      /*
       * **The check that matters is the one beside the request.** Registration
       * validates the address, but a path is appended on every call and the
       * column can be edited by anything with database access — so the row is
       * written directly here, the way a migration or a console would.
       *
       * Found by mutation: the original test called `mayFetch` directly and
       * never went through `readCollection`, so deleting the call site was
       * invisible.
       */
      await register();
      await db
        .update(schema.onerosterProviders)
        .set({ baseUrl: 'http://sis.example.test/v1p2' })
        .where(eq(schema.onerosterProviders.institutionId, lincoln.id));

      const previous = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(/not https/);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('refuses a collection that is present but not a list', async () => {
      /*
       * `{"orgs": {}}` rather than a missing key. A check for `undefined` alone
       * would accept it and then iterate an object, producing an empty roster
       * that looks like a district with no schools.
       */
      await register();
      state.raw = {
        status: 200,
        body: JSON.stringify({ orgs: { sourcedId: 'org-0' } }),
        contentType: 'application/json',
      };
      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(/no "orgs" array/);
    });

    it('names the host when the roster endpoint cannot be reached', async () => {
      await register({ baseUrl: 'https://127.0.0.1:1/v1p2' });
      try {
        await readCollection(db, lincoln.id, 'orgs');
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as RosterUnavailable).status).toBe(0);
        expect((error as Error).message).toMatch(/Could not reach/);
      }
    });

    it('says so when the response is not JSON', async () => {
      // An HTML error page from a gateway. Quoted, because "unexpected token <"
      // sends the reader looking for a bug in this file.
      await register();
      state.raw = { status: 200, body: '<html>gateway error</html>' };
      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(/did not return JSON/);
    });

    it('says so when the collection is missing from the response', async () => {
      /*
       * The key is named by the caller because only the caller knows which
       * endpoint it asked for. Guessing it from the first key present would
       * pick `errors` on a malformed response and report an empty roster.
       */
      await register();
      state.raw = {
        status: 200,
        body: JSON.stringify({ errors: [{ code: 'nope' }] }),
        contentType: 'application/json',
      };
      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(/no "orgs" array/);
    });

    it('passes a server error through with its status', async () => {
      await register();
      state.raw = { status: 503, body: 'maintenance' };
      try {
        await readCollection(db, lincoln.id, 'orgs');
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as RosterUnavailable).status).toBe(503);
      }
    });

    it('reports a token failure as a roster failure rather than leaking the type', async () => {
      // The caller asked for a roster. What went wrong underneath is detail,
      // and `TokenRefused` escaping here would make every caller handle two.
      await register({ clientSecret: 'wrong' });
      await expect(readCollection(db, lincoln.id, 'orgs')).rejects.toThrow(RosterUnavailable);
    });
  });

  describe('forgetting a token deliberately', () => {
    it('causes the next read to fetch a new one', async () => {
      orgs(1);
      await register();
      const provider = (await providerFor(db, lincoln.id))!;

      await readCollection(db, lincoln.id, 'orgs');
      await forgetAccessToken(db, provider.id, 'roster-core.readonly');
      await readCollection(db, lincoln.id, 'orgs');

      expect(state.tokenRequests).toBe(2);
    });
  });
});
