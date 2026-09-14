// @vitest-environment node

/**
 * Reading a class list from a platform that behaves like a real one.
 *
 * The fake LMS here checks the bearer token and the `Accept` header, paginates
 * with a `Link` header, and can be told to misbehave — expire a token, return a
 * cycle, answer with an error page. All of that is the protocol rather than the
 * logic, and none of it is visible from a stubbed client.
 *
 * **Nothing in this suite writes to the domain.** A roster arrives as somebody
 * else's data and stays that way until C4c decides what to do with it.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addDeployment } from './platforms';
import { MEMBERSHIP_MEDIA_TYPE, mayFetchRoster, nextPageFrom, noteSynced, readMembership, rememberContext, RosterUnavailable } from './nrps';
import { NRPS_SCOPE } from './accessToken';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const CLIENT_ID = 'client-1';

const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

interface LmsState {
  /** Pages keyed by path; each is a body plus an optional next path. */
  pages: Map<string, { body: unknown; next?: string }>;
  /** Tokens the LMS will accept. Anything else gets a 401. */
  validTokens: Set<string>;
  status?: number;
  raw?: string;
  seenAccept: string[];
  seenAuth: string[];
  requests: string[];
}

describeWithDb('reading a roster', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lms: Server;
  let base: string;
  let platform: { id: number; clientId: string; authTokenUrl: string };
  let deploymentRowId: number;
  let lmsState: LmsState;
  let tokenCounter = 0;

  beforeAll(async () => {
    harness = await createTestDatabase('ltinrps');

    lms = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);

      if (url.pathname === '/token') {
        let body = '';
        req.on('data', c => {
          body += c;
        });
        req.on('end', () => {
          tokenCounter += 1;
          const token = `token-${tokenCounter}`;
          lmsState.validTokens.add(token);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: token, expires_in: 3600 }));
        });
        return;
      }

      lmsState.requests.push(url.pathname + url.search);
      lmsState.seenAccept.push(req.headers.accept ?? '');
      lmsState.seenAuth.push(req.headers.authorization ?? '');

      const presented = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (!lmsState.validTokens.has(presented)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      if (lmsState.raw !== undefined) {
        res.statusCode = lmsState.status ?? 200;
        res.setHeader('content-type', 'text/html');
        res.end(lmsState.raw);
        return;
      }
      if (lmsState.status && lmsState.status !== 200) {
        res.statusCode = lmsState.status;
        res.end(JSON.stringify({ error: 'refused' }));
        return;
      }

      const page = lmsState.pages.get(url.pathname);
      if (!page) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'no such page' }));
        return;
      }

      if (page.next) res.setHeader('link', `<${base}${page.next}>; rel="next"`);
      res.setHeader('content-type', MEMBERSHIP_MEDIA_TYPE);
      res.end(JSON.stringify(page.body));
    });

    await new Promise<void>(resolve => lms.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(lms.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => lms?.close(() => resolve()));
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
    lmsState = {
      pages: new Map(),
      validTokens: new Set(),
      seenAccept: [],
      seenAuth: [],
      requests: [],
    };

    const lincoln = await createInstitution(db, 'Lincoln Unified');
    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: CLIENT_ID,
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: `${base}/token`,
      keysetUrl: 'https://platform.test/jwks',
    });
    const [row] = await db.select().from(schema.ltiPlatforms).limit(1);
    platform = { id: row.id, clientId: row.clientId, authTokenUrl: row.authTokenUrl };

    const deployment = await addDeployment(db, row.id, 'dep-1', lincoln.id);
    deploymentRowId = deployment.id;
  });

  // A function, not a constant: `base` is only known once the server is
  // listening, and a value captured in the describe body is `undefined/...`.
  const membersUrl = () => `${base}/memberships`;

  function servePage(path: string, members: unknown[], next?: string, context?: unknown) {
    lmsState.pages.set(path, {
      body: {
        id: `${base}${path}`,
        context: context ?? { id: 'ctx-1', title: 'Year 4 Maths' },
        members,
      },
      next,
    });
  }

  describe('a single page', () => {
    it('returns the people on it', async () => {
      servePage('/memberships', [
        { user_id: 'p-1', roles: [LEARNER], name: 'Ada', status: 'Active' },
        { user_id: 't-1', roles: [INSTRUCTOR], name: 'Grace', email: 'g@lincoln.test' },
      ]);

      const roster = await readMembership(db, platform, membersUrl());

      expect(roster.contextId).toBe('ctx-1');
      expect(roster.contextTitle).toBe('Year 4 Maths');
      expect(roster.members).toHaveLength(2);
      expect(roster.members[0]).toMatchObject({ userId: 'p-1', isStaff: false, name: 'Ada' });
      expect(roster.members[1]).toMatchObject({ userId: 't-1', isStaff: true });
    });

    it('asks with the media type that makes it a roster request', async () => {
      // Several platforms serve a different representation, or a 406, without it.
      servePage('/memberships', []);
      await readMembership(db, platform, membersUrl());

      expect(lmsState.seenAccept[0]).toBe(MEMBERSHIP_MEDIA_TYPE);
    });

    it('presents the access token as a bearer credential', async () => {
      servePage('/memberships', []);
      await readMembership(db, platform, membersUrl());

      expect(lmsState.seenAuth[0]).toMatch(/^Bearer token-\d+$/);
    });

    it('decides staff the same way a launch does', async () => {
      /*
       * The rule is imported rather than reimplemented. Two copies would
       * eventually disagree, and the disagreement is silent: somebody would be a
       * teacher when they launched and a pupil when the roster synchronised.
       */
      servePage('/memberships', [
        { user_id: 'a', roles: ['Instructor'] },
        // The full URI spelling, which is what platforms actually send and what
        // a naive `roles.includes('Instructor')` misses. Without this line that
        // mutation is green.
        { user_id: 'b', roles: [INSTRUCTOR] },
        { user_id: 'c', roles: ['https://lincoln.test/roles#YearFourHelper'] },
      ]);

      const roster = await readMembership(db, platform, membersUrl());
      expect(roster.members.map(m => m.isStaff)).toEqual([true, true, false]);
    });

    it('keeps the platform’s own word for whether somebody has left', async () => {
      // Reduced to a boolean here, the decision about what leaving means would
      // have been taken in the wrong place. C4c reads the vocabulary.
      servePage('/memberships', [{ user_id: 'p-1', roles: [LEARNER], status: 'Inactive' }]);

      const roster = await readMembership(db, platform, membersUrl());
      expect(roster.members[0].status).toBe('Inactive');
    });

    it('skips a member the platform did not identify', async () => {
      /*
       * `user_id` is the only field that names the person. Inventing one would
       * create a new child on every sync, for ever.
       */
      servePage('/memberships', [
        { roles: [LEARNER], name: 'Nameless' },
        { user_id: '   ', roles: [LEARNER] },
        { user_id: 'p-1', roles: [LEARNER] },
      ]);

      const roster = await readMembership(db, platform, membersUrl());
      expect(roster.members.map(m => m.userId)).toEqual(['p-1']);
    });
  });

  describe('pagination', () => {
    it('follows the Link header to the end', async () => {
      servePage('/memberships', [{ user_id: 'p-1', roles: [LEARNER] }], '/page2');
      servePage('/page2', [{ user_id: 'p-2', roles: [LEARNER] }], '/page3');
      servePage('/page3', [{ user_id: 'p-3', roles: [LEARNER] }]);

      const roster = await readMembership(db, platform, membersUrl());
      expect(roster.members.map(m => m.userId)).toEqual(['p-1', 'p-2', 'p-3']);
      expect(lmsState.requests).toHaveLength(3);
    });

    it('refuses to loop for ever when a platform points at itself', async () => {
      /*
       * `next` comes from the platform. One that returns a link to the page you
       * are already on turns a sync into an open connection that never closes —
       * a bug somewhere, and it should surface as a refusal rather than a hang.
       */
      servePage('/memberships', [{ user_id: 'p-1', roles: [LEARNER] }], '/memberships');

      await expect(readMembership(db, platform, membersUrl())).rejects.toThrow(/points back at itself/);
    });

    it('reuses one token across pages', async () => {
      // The reason C4a caches. A page-per-token roster is a token exchange per
      // page against a district's LMS.
      servePage('/memberships', [], '/page2');
      servePage('/page2', []);

      await readMembership(db, platform, membersUrl());
      expect(new Set(lmsState.seenAuth).size).toBe(1);
    });
  });

  describe('the Link header itself', () => {
    it('picks next out of several relations', () => {
      const header =
        '<https://lms.test/a>; rel="prev", <https://lms.test/b>; rel="next", <https://lms.test/c>; rel="last"';
      expect(nextPageFrom(header)).toBe('https://lms.test/b');
    });

    it('accepts an unquoted rel', () => {
      expect(nextPageFrom('<https://lms.test/b>; rel=next')).toBe('https://lms.test/b');
    });

    it('is nothing when there is no next', () => {
      expect(nextPageFrom('<https://lms.test/a>; rel="prev"')).toBeNull();
      expect(nextPageFrom(null)).toBeNull();
    });

    it('refuses a continuation that downgrades to plain http', () => {
      /*
       * A roster that starts on https and continues on http would have the rest
       * of the class read over a channel somebody can rewrite — and the guard on
       * the first URL would have bought nothing.
       */
      expect(nextPageFrom('<http://lms.test/b>; rel="next"')).toBeNull();
    });
  });

  describe('where a roster may be fetched from', () => {
    it('allows https anywhere', () => {
      expect(mayFetchRoster('https://lms.test/memberships')).toBe(true);
    });

    it('refuses plain http to another host, even under the test runner', () => {
      /*
       * **The bound on the loopback exception.** It exists so this suite can
       * drive a real server; if it ever widened to any http URL, a roster of
       * children's names would be readable by anyone on the path.
       */
      expect(process.env.NODE_ENV).toBe('test');
      expect(mayFetchRoster('http://lms.test/memberships')).toBe(false);
      expect(mayFetchRoster('http://169.254.169.254/latest/meta-data')).toBe(false);
    });

    it('refuses anything that is not http at all', () => {
      expect(mayFetchRoster('file:///etc/passwd')).toBe(false);
      expect(mayFetchRoster('not a url')).toBe(false);
    });

    it('refuses a non-https roster URL outright', async () => {
      await expect(readMembership(db, platform, 'http://lms.test/memberships')).rejects.toThrow(
        /only be read over https/,
      );
    });
  });

  describe('when the token has gone stale', () => {
    it('gets a new one and carries on', async () => {
      /*
       * A platform that revoked a credential early, or a clock that disagrees,
       * leaves this module holding a token it believes is good. Without the
       * retry every later sync fails identically until it expires on its own.
       */
      servePage('/memberships', [{ user_id: 'p-1', roles: [LEARNER] }]);
      await readMembership(db, platform, membersUrl());

      // The LMS forgets every token it ever issued.
      lmsState.validTokens.clear();
      lmsState.requests = [];

      const roster = await readMembership(db, platform, membersUrl());
      expect(roster.members).toHaveLength(1);
      expect(lmsState.requests).toHaveLength(2); // the 401, then the retry
    });

    it('does not retry for ever', async () => {
      /*
       * One retry. More would turn somebody else's outage into a loop against
       * their server, which is how a tool gets blocked by a district.
       */
      servePage('/memberships', []);
      lmsState.validTokens.clear();
      const alwaysRefuse = { ...lmsState, validTokens: new Set<string>() };
      lmsState = Object.assign(lmsState, alwaysRefuse);

      // Tokens minted mid-read are never added to the valid set, so both the
      // first attempt and the retry are refused.
      const original = lmsState.validTokens.add.bind(lmsState.validTokens);
      lmsState.validTokens.add = () => lmsState.validTokens;

      await expect(readMembership(db, platform, membersUrl())).rejects.toThrow(RosterUnavailable);
      expect(lmsState.requests.length).toBeLessThanOrEqual(2);
      lmsState.validTokens.add = original;
    });
  });

  describe('when the platform refuses', () => {
    it('names the scope for a 403, because that is what is usually wrong', async () => {
      servePage('/memberships', []);
      lmsState.status = 403;

      await expect(readMembership(db, platform, membersUrl())).rejects.toThrow(
        /Names and Roles scope/,
      );
    });

    it('reports any other status plainly', async () => {
      servePage('/memberships', []);
      lmsState.status = 500;

      try {
        await readMembership(db, platform, membersUrl());
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as RosterUnavailable).status).toBe(500);
      }
    });

    it('says so when the answer is not JSON', async () => {
      servePage('/memberships', []);
      lmsState.raw = '<html>Gateway Timeout</html>';

      await expect(readMembership(db, platform, membersUrl())).rejects.toThrow(/did not return JSON/);
    });
  });

  describe('remembering where a roster lives', () => {
    it('keeps the URL a launch mentioned', async () => {
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: 'Year 4 Maths',
        membershipsUrl: 'https://lms.test/memberships',
      });

      const [row] = await db.select().from(schema.ltiContexts);
      expect(row.contextId).toBe('ctx-1');
      expect(row.membershipsUrl).toBe('https://lms.test/memberships');
    });

    it('updates the URL when a later launch moves it', async () => {
      // A platform changing domains, or a district reinstalling the tool. The
      // last launch is the most current thing anybody has said about it.
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: 'Year 4',
        membershipsUrl: 'https://old.test/memberships',
      });
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: 'Year 4',
        membershipsUrl: 'https://new.test/memberships',
      });

      const rows = await db.select().from(schema.ltiContexts);
      expect(rows).toHaveLength(1);
      expect(rows[0].membershipsUrl).toBe('https://new.test/memberships');
    });

    it('leaves a working URL alone when a launch mentions none', async () => {
      /*
       * The claim is absent for two very different reasons — the scope was never
       * granted, or this particular message did not carry it. Forgetting a
       * working URL because of the second would break a sync that had been
       * running for months.
       */
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: 'Year 4',
        membershipsUrl: 'https://lms.test/memberships',
      });
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: 'Year 4',
        membershipsUrl: null,
      });

      const [row] = await db.select().from(schema.ltiContexts);
      expect(row.membershipsUrl).toBe('https://lms.test/memberships');
    });

    it('records a sync as having happened, separately from what it changed', async () => {
      // A sync that legitimately changed nothing is indistinguishable from one
      // that never ran, if the only evidence is its effects.
      await rememberContext(db, {
        deploymentRowId,
        contextId: 'ctx-1',
        title: null,
        membershipsUrl: null,
      });
      const [row] = await db.select().from(schema.ltiContexts);
      expect(row.lastSyncedAt).toBeNull();

      await noteSynced(db, row.id, new Date('2026-05-01T09:00:00Z'));
      const [after] = await db
        .select()
        .from(schema.ltiContexts)
        .where(eq(schema.ltiContexts.id, row.id));
      expect(after.lastSyncedAt).not.toBeNull();
    });
  });
});
