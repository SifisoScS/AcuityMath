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
import { AmbiguousPlatform, beginLaunch, UnknownPlatform } from './launchState';

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

/**
 * Where this instance is reachable, for the `redirect_uri` a platform must
 * return to.
 *
 * The same rule the sign-in links use, and for a sharper reason here: the
 * redirect URI is registered with the platform in advance and compared byte for
 * byte. A guessed origin does not produce a broken link in somebody's mailbox —
 * it produces a launch the platform refuses, with an error on their page rather
 * than ours.
 */
function appBaseUrl(req: Request): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'APP_BASE_URL must be set in production. The LTI redirect URI is registered with ' +
        'each platform and compared exactly; one built from a guessed origin fails on ' +
        "the platform's page rather than in a log.",
    );
  }
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * Third-party initiation, the first leg of a launch.
 *
 * Accepts both verbs because platforms disagree: the specification permits
 * either, Canvas uses POST and several others use GET, and a product that
 * implements one is a product that works with half of them.
 *
 * The response is a redirect and nothing else. Nothing here renders, because
 * the user's browser is passing through on its way back to the platform —
 * anything drawn would flash and be replaced.
 */
async function initiate(req: Request, res: Response): Promise<void> {
  const source = req.method === 'POST' ? req.body ?? {} : req.query ?? {};
  const issuer = String(source.iss ?? '').trim();
  const loginHint = String(source.login_hint ?? '').trim();
  const targetLinkUri = String(source.target_link_uri ?? '').trim();

  if (!issuer || !loginHint || !targetLinkUri) {
    res.status(400).json({
      error: 'An LTI initiation needs iss, login_hint and target_link_uri.',
    });
    return;
  }

  try {
    const { redirectUrl } = await beginLaunch(
      getDatabase(),
      {
        issuer,
        loginHint,
        targetLinkUri,
        clientId: source.client_id ? String(source.client_id) : undefined,
        messageHint: source.lti_message_hint ? String(source.lti_message_hint) : undefined,
        deploymentId: source.lti_deployment_id
          ? String(source.lti_deployment_id)
          : undefined,
      },
      `${appBaseUrl(req)}/api/lti/launch`,
    );

    res.redirect(302, redirectUrl);
  } catch (error) {
    /*
     * Both of these are configuration, not attack, and the administrator
     * reading them is the person who can fix them — so they say what is wrong.
     * Nothing here reveals which other platforms are registered.
     */
    if (error instanceof UnknownPlatform || error instanceof AmbiguousPlatform) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}

ltiRouter.get('/login', initiate);
ltiRouter.post('/login', initiate);
