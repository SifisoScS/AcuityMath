// @vitest-environment node

/**
 * Writing into somebody else's gradebook.
 *
 * Every outbound call before this was a read. This one **changes a district's
 * records**, and what it changes is a mark against a child's name that their
 * teacher and their parents will see — so the cases that matter here are the
 * ones about not writing the wrong thing, or writing it twice.
 *
 * The fake LMS checks the bearer token, the content types and the payload
 * shape, and records every column and score it was asked for. A stub that
 * accepted anything would have proved that this code runs, not that it speaks
 * the protocol.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addDeployment } from './platforms';
import {
  AGS_LINE_ITEM_SCOPE,
  AGS_SCORE_SCOPE,
  DEFAULT_SCORE_MAXIMUM,
  GradebookUnavailable,
  grantedScopes,
  postScore,
  resolveLineItem,
} from './ags';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

interface Posted {
  path: string;
  contentType: string;
  accept: string;
  authorization: string;
  body: unknown;
}

describeWithDb('posting a grade to a platform', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lms: Server;
  let base: string;
  let platform: { id: number; clientId: string; authTokenUrl: string };
  let contextRowId: number;

  let posted: Posted[] = [];
  let createdColumns = 0;
  let nextStatus: number | null = null;
  let rawBody: string | null = null;
  let scoreMaximumToReturn = DEFAULT_SCORE_MAXIMUM;
  let tokensIssued = 0;
  let validTokens = new Set<string>();
  let scopesAsked: string[] = [];

  beforeAll(async () => {
    harness = await createTestDatabase('ltiags');

    lms = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        const url = new URL(req.url ?? '/', base);

        if (url.pathname === '/token') {
          tokensIssued += 1;
          const token = `token-${tokensIssued}`;
          validTokens.add(token);
          scopesAsked.push(new URLSearchParams(body).get('scope') ?? '');
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: token, expires_in: 3600 }));
          return;
        }

        let parsed: unknown = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        /*
         * Recorded **before** the token is checked, so a refused attempt is
         * visible. Pushing after it made the 401 retry test see one request
         * where there were two, which reads as "no retry happened".
         */
        posted.push({
          path: url.pathname,
          contentType: req.headers['content-type'] ?? '',
          accept: req.headers.accept ?? '',
          authorization: req.headers.authorization ?? '',
          body: parsed,
        });

        const presented = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        if (!validTokens.has(presented)) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }

        if (rawBody !== null) {
          res.statusCode = nextStatus ?? 200;
          res.setHeader('content-type', 'text/html');
          res.end(rawBody);
          return;
        }
        if (nextStatus && nextStatus !== 200) {
          res.statusCode = nextStatus;
          res.end(JSON.stringify({ error: 'refused' }));
          return;
        }

        if (url.pathname === '/line_items') {
          createdColumns += 1;
          res.statusCode = 201;
          res.setHeader('content-type', 'application/vnd.ims.lis.v2.lineitem+json');
          res.end(
            JSON.stringify({
              id: `${base}/line_items/${createdColumns}`,
              label: (parsed as { label?: string })?.label,
              scoreMaximum: scoreMaximumToReturn,
            }),
          );
          return;
        }

        res.statusCode = 204;
        res.end();
      });
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
    posted = [];
    createdColumns = 0;
    nextStatus = null;
    rawBody = null;
    scoreMaximumToReturn = DEFAULT_SCORE_MAXIMUM;
    tokensIssued = 0;
    validTokens = new Set();
    scopesAsked = [];

    const lincoln = await createInstitution(db, 'Lincoln Unified');
    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: 'client-1',
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: `${base}/token`,
      keysetUrl: 'https://platform.test/jwks',
    });
    const [row] = await db.select().from(schema.ltiPlatforms).limit(1);
    platform = { id: row.id, clientId: row.clientId, authTokenUrl: row.authTokenUrl };

    const deployment = await addDeployment(db, row.id, 'dep-1', lincoln.id);
    await db.insert(schema.ltiContexts).values({
      deploymentId: deployment.id,
      contextId: 'ctx-1',
      title: 'Year 4 Maths',
      lineItemsUrl: `${base}/line_items`,
    });
    const [context] = await db.select().from(schema.ltiContexts).limit(1);
    contextRowId = context.id;
  });

  const resolve = (overrides: Record<string, unknown> = {}) =>
    resolveLineItem(db, platform, {
      contextRowId,
      resourceLinkId: 'link-1',
      label: 'AcuityMath',
      ...overrides,
    });

  describe('the column', () => {
    it('is created once and found thereafter', async () => {
      /*
       * **The assertion this module exists for.** A line item is a column a
       * teacher sees; a second one for the same link is a duplicate in their
       * gradebook that nobody asked for and only they can delete.
       */
      const first = await resolve();
      const second = await resolve();

      expect(second.lineItemUrl).toBe(first.lineItemUrl);
      expect(createdColumns).toBe(1);
      expect(await db.select().from(schema.ltiLineItems)).toHaveLength(1);
    });

    it('is a separate column per placement', async () => {
      // A teacher may place this product twice in one course — a fractions link
      // and a times-tables link. Those are two columns, not one.
      await resolve({ resourceLinkId: 'link-1' });
      await resolve({ resourceLinkId: 'link-2' });

      expect(createdColumns).toBe(2);
      expect(await db.select().from(schema.ltiLineItems)).toHaveLength(2);
    });

    it('adopts the one the platform already made, creating nothing', async () => {
      /*
       * When a teacher places the link *as an assignment*, the platform makes
       * the column itself. Creating our own would leave theirs empty beside
       * ours, and a teacher with two columns cannot tell which one counts.
       */
      const item = await resolve({ platformLineItem: 'https://platform.test/line_items/99' });

      expect(item.lineItemUrl).toBe('https://platform.test/line_items/99');
      expect(createdColumns).toBe(0);
    });

    it('asks with the line item media type and the line item scope', async () => {
      await resolve();

      expect(posted[0].contentType).toBe('application/vnd.ims.lis.v2.lineitem+json');
      expect(scopesAsked[0]).toBe(AGS_LINE_ITEM_SCOPE);
    });

    it('ties the column to the placement it belongs to', async () => {
      // So the platform shows it against the right link, and deleting the link
      // takes the column rather than leaving an orphan.
      await resolve();
      const body = posted[0].body as { resourceLinkId?: string; resourceId?: string };

      expect(body.resourceLinkId).toBe('link-1');
      expect(body.resourceId).toBe('acuitymath:link-1');
    });

    it('believes the maximum the platform used, not the one asked for', async () => {
      /*
       * A platform may clamp it. Believing our own request would scale every
       * later score against a denominator the column does not have.
       */
      scoreMaximumToReturn = 10;
      const item = await resolve();

      expect(item.scoreMaximum).toBe(10);
      const [row] = await db.select().from(schema.ltiLineItems);
      expect(Number(row.scoreMaximum)).toBe(10);
    });

    it('refuses when the course has no gradebook endpoint on record', async () => {
      await db.update(schema.ltiContexts).set({ lineItemsUrl: null });
      await expect(resolve()).rejects.toThrow(/no gradebook endpoint on record/);
    });

    it('names the scope when the platform refuses to create one', async () => {
      nextStatus = 403;
      await expect(resolve()).rejects.toThrow(/line item scope/);
    });

    it('refuses a platform that creates a column without saying where it is', async () => {
      rawBody = JSON.stringify({ label: 'AcuityMath', scoreMaximum: 100 });
      nextStatus = 200;
      await expect(resolve()).rejects.toThrow(/did not say where it is/);
    });
  });

  describe('the score', () => {
    it('names the platform’s user, never one of ours', async () => {
      /*
       * **The mistake that would put a child's mark on somebody else.** `userId`
       * is the `sub` from the launch; a learner id from this database would
       * either fail or land on whichever of their users happens to have that
       * number.
       */
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'platform-sub-42', scoreGiven: 72 });

      const score = posted[1].body as { userId?: string };
      expect(score.userId).toBe('platform-sub-42');
    });

    it('goes to /scores beneath the column, with the score media type', async () => {
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50 });

      expect(posted[1].path).toMatch(/\/line_items\/1\/scores$/);
      expect(posted[1].contentType).toBe('application/vnd.ims.lis.v1.Score+json');
    });

    it('asks for the score scope, which is not the line item scope', async () => {
      // A district may grant one and not the other, so they are separate tokens.
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50 });

      expect(scopesAsked).toEqual([AGS_LINE_ITEM_SCOPE, AGS_SCORE_SCOPE]);
    });

    it('sends the column’s maximum rather than assuming a hundred', async () => {
      scoreMaximumToReturn = 10;
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 7 });

      const score = posted[1].body as { scoreMaximum?: number };
      expect(score.scoreMaximum).toBe(10);
    });

    it('clamps a score above the maximum rather than sending it', async () => {
      /*
       * Rejected outright by some platforms and silently stored by others. A
       * child showing 130 out of 100 in a gradebook is a conversation their
       * teacher has to have with somebody.
       */
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 130 });

      expect((posted[1].body as { scoreGiven?: number }).scoreGiven).toBe(100);
    });

    it('refuses a negative score rather than sending it', async () => {
      const item = await resolve();
      await expect(
        postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: -1 }),
      ).rejects.toThrow(/not negative/);
    });

    it('says the work is finished and marked', async () => {
      /*
       * Together these tell a gradebook whether a blank means "not started",
       * "waiting for marking", or "this is the mark". This product marks
       * instantly, so anything else would leave a column showing work as pending
       * that nothing will ever come back to finish.
       */
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50 });

      const score = posted[1].body as { activityProgress?: string; gradingProgress?: string };
      expect(score.activityProgress).toBe('Completed');
      expect(score.gradingProgress).toBe('FullyGraded');
    });

    it('carries the timestamp it was given, because platforms order by it', async () => {
      /*
       * A score not strictly newer than the one a platform holds is discarded.
       * Letting the caller pass a moment is what makes "post the score this
       * session produced" expressible at all.
       */
      const item = await resolve();
      const at = new Date('2026-05-01T09:30:00.000Z');
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50, timestamp: at });

      expect((posted[1].body as { timestamp?: string }).timestamp).toBe(at.toISOString());
    });

    it('names the scope when the platform refuses the score', async () => {
      const item = await resolve();
      nextStatus = 403;
      await expect(
        postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50 }),
      ).rejects.toThrow(/score scope/);
    });
  });

  describe('when the platform misbehaves', () => {
    it('gets a new token and retries once after a 401', async () => {
      /*
       * A score is posted first so a **score-scope** token is cached. Clearing
       * the platform's tokens before that meant the next call simply minted a
       * fresh valid one and never saw a 401 — the retry looked absent when it
       * had merely never been needed.
       */
      const item = await resolve();
      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 50 });

      validTokens.clear();
      posted = [];

      await postScore(db, platform, item, { platformUserId: 'sub', scoreGiven: 60 });
      expect(posted).toHaveLength(2); // the refused attempt, then the retry
    });

    it('says which host it could not reach rather than "fetch failed"', async () => {
      /*
       * The defect C4d found in the roster and token paths, guarded here from
       * the start: a district whose LMS is down must not be told the fault is
       * ours.
       */
      const item = await resolve();
      const unreachable = { ...item, lineItemUrl: 'https://nowhere.invalid/line_items/1' };

      try {
        await postScore(db, platform, unreachable, { platformUserId: 'sub', scoreGiven: 50 });
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as GradebookUnavailable).message).toContain('nowhere.invalid');
        expect((error as GradebookUnavailable).status).toBe(0);
      }
    });

    it('refuses to write over plain http to anywhere but this machine', async () => {
      // The same bounded exception the roster read carries, and the same bound.
      const item = await resolve();
      const insecure = { ...item, lineItemUrl: 'http://lms.test/line_items/1' };

      await expect(
        postScore(db, platform, insecure, { platformUserId: 'sub', scoreGiven: 50 }),
      ).rejects.toThrow(/only be written over https/);
    });
  });

  describe('what the platform said it granted', () => {
    it('reads both scopes out of the launch claim', async () => {
      expect(grantedScopes({ scopes: [AGS_LINE_ITEM_SCOPE, AGS_SCORE_SCOPE] })).toEqual({
        mayCreateColumns: true,
        mayPostScores: true,
      });
    });

    it('distinguishes a district that granted only one', async () => {
      // Reading a gradebook and changing it are different permissions, and a
      // district may well grant the first and not the second.
      expect(grantedScopes({ scopes: [AGS_LINE_ITEM_SCOPE] })).toEqual({
        mayCreateColumns: true,
        mayPostScores: false,
      });
    });

    it('treats an absent claim as nothing granted', async () => {
      expect(grantedScopes(null)).toEqual({ mayCreateColumns: false, mayPostScores: false });
    });
  });
});
