/**
 * The LTI surface, on its own router.
 *
 * Separate from `server/api.ts` deliberately. That file is the pre-migration
 * REST surface being retired — three routes and shrinking — and putting new work
 * there would grow the thing Graft E spent its time emptying. This mounts at
 * `/api/lti` beside `/api/auth`, which is the pattern the auth router already
 * set.
 *
 * These endpoints are **public and unauthenticated by specification**. A
 * platform fetches the keyset before it has any relationship with us, so there
 * is nobody to authenticate. What is served must therefore contain nothing that
 * is not meant for the open internet.
 */

import { Router, type Request, type Response } from 'express';

import { getDatabase } from '../db/client';
import { publicJwks, signingKey } from './keys';

export const ltiRouter = Router();

/**
 * The public keyset, at the URL a platform is configured with.
 *
 * `.json` is in the path because platform admin forms and conformance tooling
 * expect it there; it is a convention, not a content negotiation.
 *
 * Calling `signingKey` first looks like a side effect in a read, and it is one:
 * it creates the platform's first key on first fetch. The alternative is
 * serving `{"keys":[]}` to the very first platform that tries to register,
 * which reads as a broken integration rather than an un-provisioned one. Every
 * subsequent call is a plain read.
 */
ltiRouter.get('/jwks.json', async (_req: Request, res: Response) => {
  const db = getDatabase();
  await signingKey(db);
  const jwks = await publicJwks(db);

  /*
   * Cached, but briefly. Platforms cache this themselves, often for hours, and
   * a long max-age here compounds with theirs — which is what turns a key
   * rotation into an outage. Five minutes is short enough that a newly
   * published key propagates while still sparing us a fetch per launch.
   */
  res.set('Cache-Control', 'public, max-age=300');
  res.json(jwks);
});
