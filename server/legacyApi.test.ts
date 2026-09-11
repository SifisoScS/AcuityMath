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

import { readFileSync } from 'fs';
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
 * Routes still reading or writing `server/db.ts` — the JSON file nothing
 * migrated reads.
 *
 * Listed exactly, so adding a route that touches it fails here. Graft E empties
 * this list; the completion condition is that `server/db.ts` and
 * `data_store.json` can be deleted.
 */
const TOUCHES_LEGACY_STORE = [
  'GET /bootstrap',
  'GET /students',
  'GET /students/:id',
  'PATCH /students/:id',
  'POST /students/:id/heartbeat',
  'POST /students/:id/attempts',
  'POST /assignments',
  'POST /sync/batch',
  'GET /audit-logs',
];

/** The body of one route handler, for asking what it touches. */
function handlerFor(route: string): string {
  const [method, path] = route.split(' ');
  const start = source.indexOf(`apiRouter.${method.toLowerCase()}('${path}'`);
  if (start === -1) return '';
  const next = source.indexOf('apiRouter.', start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('the legacy REST surface', () => {
  it('declares the routes this file knows about', () => {
    // Guards the guard: a regex that matches nothing passes everything below.
    expect(routes.length).toBeGreaterThan(15);
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

    it('names the procedure that replaced it, not the table', () => {
      /*
       * Whoever reads this message is a developer looking at a failed request.
       * They need the call site. Naming `consent_events` tells them where the
       * data ends up, which is the second question, not the first — and sends
       * them to a schema file when what they want is a procedure to call.
       */
      const body = handlerFor('POST /auth/coppa-consent');
      expect(body).toMatch(/consent\.record/);
      expect(body).toMatch(/trpc/i);
    });
  });

  describe('the JSON store', () => {
    it('is read by exactly the routes listed here, and no others', () => {
      /*
       * An inventory rather than a ban, because nine routes still use it and
       * banning it today would just mean skipping this test. A new route that
       * reaches for `db.` fails here, so the surface cannot quietly grow while
       * Graft E is being planned.
       */
      const touching = routes.filter(route => /\bdb\./.test(handlerFor(route)));
      expect(touching.sort()).toEqual([...TOUCHES_LEGACY_STORE].sort());
    });

    it('is not reached by anything under trpc', () => {
      // The two data layers must not meet. A tRPC procedure reading the JSON
      // file would put a child's record in two places with no reconciliation.
      const trpc = readFileSync(join(process.cwd(), 'server/trpc/routers.ts'), 'utf-8');
      expect(trpc).not.toMatch(/from '\.\.\/db'|server\/db/);
    });
  });
});
