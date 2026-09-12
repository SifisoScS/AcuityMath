// @vitest-environment node

/**
 * What the pre-migration REST surface is still allowed to be.
 *
 * `server/api.ts` predates the MySQL migration and **has no authentication of
 * any kind** — no session, no middleware, nothing — while the tRPC router beside
 * it decides who may touch a child's record with `protectedProcedure`,
 * `learnerProcedure` and `elevatedProcedure`.
 *
 * That was survivable while every route was a read of demonstration data. It
 * stopped being survivable for three routes that took a PIN and compared it in
 * plaintext. Those are gone, and this file's job is to keep them gone and to
 * make any new route on this surface a deliberate act rather than a default.
 *
 * Graft E retires the rest. Until then, an inventory is what stops the surface
 * growing back.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'server/api.ts'), 'utf-8');

/** Every route the file declares, as `METHOD /path`. */
const routes = [...source.matchAll(/apiRouter\.(get|post|patch|put|delete)\('([^']+)'/g)].map(
  match => `${match[1].toUpperCase()} ${match[2]}`,
);

/**
 * Routes that must never come back.
 *
 * Each gated something behind `db.verifyPin`, which does `u.pinHash === pin` —
 * a plaintext comparison against a field named for a hash, over PINs stored as
 * `'1234'`, `'9876'` and `'4321'`.
 *
 * They looked partly harmless because the ids in `data_store.json`
 * (`student_1..4`) do not match the ids the application uses (`learner-12..15`),
 * so the lookups failed. That is an accident of two id formats, not a property:
 * nothing enforces it, and a seed, a refactor or a direct write removes it. The
 * PIN check succeeded regardless.
 */
const DELETED = [
  'POST /auth/verify-pin',
  'POST /auth/coppa-purge',
  'POST /students/:id/unlock',
];

/**
 * Routes reading or writing the JSON store.
 *
 * **Empty, and now a ban rather than an inventory.** It was a list because nine
 * routes used the store and forbidding it outright would only have meant
 * skipping the test. The completion condition stated here from the start was
 * that `server/db.ts` and `data_store.json` could be deleted. They are deleted,
 * so the list is empty and the rule can be absolute.
 *
 * Nothing is left to add a name to: the module this guarded does not exist, so a
 * route reaching for `db.` no longer compiles. This stays as the assertion that
 * it cannot come back quietly.
 */
const TOUCHES_LEGACY_STORE: string[] = [];

/**
 * The human-readable `error:` string alone, without the machine fields beside
 * it.
 *
 * Asserting `consent.record` against the whole handler was absorbed by a
 * mutation: `replacedBy: 'consent.record'` satisfies the match, so the prose
 * could stop naming the call site entirely and the test stayed green. The
 * message and the machine field are two different promises to two different
 * readers, and they need asserting separately.
 */
function errorMessageFor(route: string): string {
  const body = handlerFor(route);
  const match = body.match(/error:\s*([\s\S]*?)\n\s{4}\w+:/);
  return match ? match[1] : '';
}

/**
 * The body of one route handler, for asking what it touches.
 *
 * Bounded by the handler's own closing `});`, not by the next `apiRouter.`
 * call. The looser version swept up everything between two routes — including
 * the prose left where a deleted route used to be — and E3 leaves a lot of that
 * prose. It reported `GET /health` as reading the JSON store, because the
 * comment describing the *consent* route's history mentions
 * `db.updateCoppaConsent` and happened to fall in the gap.
 *
 * That is this file's own lesson turned on itself: the helper was returning the
 * handler plus its surroundings, so every assertion built on it was really
 * asking about the surroundings too.
 */
function handlerFor(route: string): string {
  const [method, path] = route.split(' ');
  const start = source.indexOf(`apiRouter.${method.toLowerCase()}('${path}'`);
  if (start === -1) return '';
  // Handlers are registered at column zero, so their close is the first `});`
  // at column zero; anything nested inside is indented.
  const end = source.indexOf('\n});', start);
  return end === -1 ? source.slice(start) : source.slice(start, end + 4);
}

describe('the legacy REST surface', () => {
  it('declares the thirteen routes this surface still has', () => {
    /*
     * Guards the guard: a regex that matches nothing passes every assertion
     * below it, and a `toBeGreaterThan` floor absorbs that quietly.
     *
     * 25 before the credential closure, 22 after it, 20 after E2 took the
     * screen-time heartbeat and `/sync/batch`, 13 after E3 took every route
     * that read the JSON store. Measured after each deletion rather than
     * before: the original `toBeGreaterThan(15)` floor sat seven routes below
     * reality and would have passed while ten routes vanished.
     *
     * What is left touches no store: a health check, the consent 410, the
     * Socratic coach proxy, and the district/LMS/feedback stubs Graft E4
     * quarantines.
     *
     * Exact rather than a floor, because every route left is either on
     * `TOUCHES_LEGACY_STORE` or a stub Graft E has to account for. Adding one
     * should cost a deliberate edit to this line. Graft E's steps lower the
     * number; the completion condition is that the file is gone.
     */
    expect(routes.length).toBe(13);
  });

  describe('the credential surface', () => {
    it.each(DELETED)('%s stays deleted', route => {
      expect(routes, `${route} is back; see the note above`).not.toContain(route);
    });

    it('takes a PIN nowhere', () => {
      /*
       * The durable version of the rule. Deleting three routes by name does not
       * stop a fourth appearing, and `db.verifyPin` is still exported.
       */
      for (const route of routes) {
        const body = handlerFor(route);
        expect(body, `${route} verifies a PIN on an unauthenticated route`).not.toMatch(
          /verifyPin|parentPin|confirmationPin/,
        );
      }
    });

    it('issues no session token', () => {
      // `/auth/verify-pin` returned `sec_tok_${Date.now()}_${Math.random()}`.
      expect(source).not.toMatch(/sessionToken/);
    });
  });

  describe('parental consent', () => {
    it('is refused rather than recorded here', () => {
      // It wrote to `data_store.json` against a hardcoded `'parent_sarah_1'`
      // while `consent_events` — the table this product has for the purpose —
      // had never been written to by anything. The application told a parent
      // their consent was recorded, and it was not.
      const body = handlerFor('POST /auth/coppa-consent');
      expect(body).toContain('410');
      expect(body).not.toMatch(/db\.updateCoppaConsent/);
    });

    it('is still reachable, so the failure is visible', () => {
      // Deleting it would break `CoppaConsentModal` silently, and a silent
      // failure looks exactly like the silent success it replaces.
      expect(routes).toContain('POST /auth/coppa-consent');
    });

    it('names the procedure that replaced it, not the table or a plan', () => {
      /*
       * Whoever reads this message is a developer looking at a failed request.
       * They need the call site. Naming `consent_events` tells them where the
       * data ends up, which is the second question, not the first — and sends
       * them to a schema file when what they want is a procedure to call.
       *
       * `replacementDeployed` is asserted true rather than merely present. It
       * was false while this route was closed and nothing had replaced it, and
       * a caller can branch on it; a test that only checked the key existed
       * would pass in both states and so would check nothing.
       *
       * The ban on citing a planning document outlives the state change. A
       * runtime error hands back a call site, not reading material — that held
       * when there was no replacement and it holds now there is one.
       */
      const message = errorMessageFor('POST /auth/coppa-consent');
      expect(message, 'the message a developer reads does not name the procedure')
        .toMatch(/consent\.record/);
      expect(message).toMatch(/trpc/i);
      expect(message, 'the 410 cites a document instead of naming a call site')
        .not.toMatch(/MIGRATION_STATUS|docs\//);

      // The machine field is a separate promise: a caller branches on it.
      expect(handlerFor('POST /auth/coppa-consent')).toMatch(/replacementDeployed: true/);
    });
  });

  describe('the JSON store', () => {
    it('is read by no route at all', () => {
      /*
       * This began as an inventory of nine routes, because banning the store
       * while nine routes used it would only have meant skipping the test. Each
       * graft took names off the list, and E3 emptied it.
       *
       * The assertion the inventory existed to become: **no route under `/api`
       * reads the JSON store.** That is what makes deleting `server/db.ts`
       * verifiable rather than hopeful — and it is deleted.
       */
      const touching = routes.filter(route => /\bdb\./.test(handlerFor(route)));
      expect(touching, 'a route is reaching for the JSON store again').toEqual([]);
      expect(TOUCHES_LEGACY_STORE).toEqual([]);
    });

    it('has no module left to import', () => {
      // The durable half. A list can be edited; a missing file cannot be
      // imported, so the ban above cannot be satisfied by moving the store.
      expect(existsSync(join(process.cwd(), 'server/db.ts'))).toBe(false);
      expect(source, 'server/api.ts imports the deleted JSON store').not.toMatch(
        /from '\.\/db'/,
      );
    });

    it('is not reached by anything under trpc', () => {
      // The two data layers must not meet. A tRPC procedure reading the JSON
      // file would put a child's record in two places with no reconciliation.
      const trpc = readFileSync(join(process.cwd(), 'server/trpc/routers.ts'), 'utf-8');
      expect(trpc).not.toMatch(/from '\.\.\/db'|server\/db/);
    });
  });
});
