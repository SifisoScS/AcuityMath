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

import express, { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';

import { getDatabase } from '../db/client';
import {
  issueLearnerSession,
  issueSession,
  ltiLearnerCookie,
  ltiSessionCookie,
} from '../auth/session';
import { LaunchRejected, verifyLaunch } from './idToken';
import { publicJwks, signingKey } from './keys';
import { AmbiguousPlatform, beginLaunch, UnknownPlatform } from './launchState';
import { CannotProvision, provisionPupil, provisionStaff } from './provision';
import { DEEP_LINKING_REQUEST } from './idToken';
import { beginChoice } from './deepLinkRequests';
import { rememberContext } from './nrps';
import { AgeUnknown, resolvePupilAge } from './pupilAge';
import { resolveLaunch } from './platforms';
import { LTI_MOUNT_PATH, LTI_ROUTE_PATHS } from './toolConfiguration';

export const ltiRouter = Router();

/**
 * Form-encoded bodies, on this router only.
 *
 * LTI posts with `application/x-www-form-urlencoded`, because the specification
 * fixes `response_mode=form_post` and that is what a browser sends when a
 * platform auto-submits a form. The application mounts only `express.json()`,
 * which parses nothing here and leaves `req.body` undefined.
 *
 * **This was already a defect before this change.** C3a added `POST /login` and
 * probed it with JSON, so it passed; a real platform posting a form would have
 * been answered with "an LTI initiation needs iss, login_hint and
 * target_link_uri" while dutifully sending all three. Mounted on the router
 * rather than the app so the surface Graft E is retiring keeps parsing exactly
 * what it did before.
 */
ltiRouter.use(express.urlencoded({ extended: false }));

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
ltiRouter.get(LTI_ROUTE_PATHS.jwks, async (_req: Request, res: Response) => {
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
      `${appBaseUrl(req)}${LTI_MOUNT_PATH}${LTI_ROUTE_PATHS.launch}`,
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

ltiRouter.get(LTI_ROUTE_PATHS.login, initiate);
ltiRouter.post(LTI_ROUTE_PATHS.login, initiate);

/**
 * A refusal a person can act on, rendered as a page rather than JSON.
 *
 * Whoever sees this is standing in a classroom looking at an LMS, not reading a
 * response body, so it has to be readable. The status is 403 rather than 400
 * because every case that reaches it is "you are not allowed in", which is what
 * a proxy or an LMS log should record.
 *
 * `escape` currently guards nothing, and that is said plainly rather than
 * implied otherwise: every message below is a fixed string, so no platform
 * input reaches this HTML today. It is here because a refusal that quotes what
 * the platform sent is an obvious next thing to write, and this page is
 * guaranteed to be framed by somebody else's site — the worst place to
 * discover the escaping was never there. It is tested directly, because an
 * unreachable guard with no test is a claim rather than a defence.
 */
export function escapeForRefusal(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refuse(res: Response, status: number, heading: string, detail: string): void {
  res.status(status).type('html').send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeForRefusal(heading)}</title></head>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:2.5rem;color:#1f2937">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .75rem">${escapeForRefusal(heading)}</h1>` +
      `<p style="margin:0;max-width:40rem">${escapeForRefusal(detail)}</p>` +
      `</body></html>`,
  );
}

/**
 * The second leg: the platform posts a signed token back, and somebody arrives.
 *
 * Only staff get in. A pupil launch is refused in `provisionStaff` with a
 * sentence saying so, because signing a child in needs a consent record and an
 * LMS pupil has no guardian here yet — that is C3d. Guessing would put a child
 * in front of the product with nothing on file, which is the one outcome the
 * consent work exists to prevent.
 */
/**
 * Records the course a launch came from, and says which row it is.
 *
 * Called **before** a session is minted, because a pupil's token has to carry
 * the placement they arrived through — nothing else knows it once the launch is
 * over, and a score with no column to go to is a score that never goes.
 *
 * Fails soft and returns null. A launch that succeeded must not become an error
 * page because a bookkeeping write did not land; the cost is a gradebook that
 * does not update until the next launch, which is a smaller harm than a child
 * staring at a failure.
 */
async function rememberCourse(
  db: ReturnType<typeof getDatabase>,
  launch: Awaited<ReturnType<typeof verifyLaunch>>,
): Promise<number | null> {
  if (!launch.contextId) return null;

  try {
    const resolved = await resolveLaunch(
      db,
      launch.issuer,
      launch.clientId,
      launch.deploymentId,
    );
    if (!resolved) return null;

    /*
     * The placement's year group, worked out here because a roster sync has no
     * launch to read it from. Absent is ordinary — a staff launch carries no
     * age, and plenty of placements are not configured — so it is stored when
     * known and left alone when not.
     */
    let defaultBirthYear: number | null = null;
    try {
      defaultBirthYear = resolvePupilAge(launch.custom).birthYear;
    } catch (error) {
      if (!(error instanceof AgeUnknown)) throw error;
    }

    await rememberContext(db, {
      deploymentRowId: resolved.deployment.id,
      contextId: launch.contextId,
      title: launch.contextTitle,
      membershipsUrl: launch.membershipsUrl,
      defaultBirthYear,
      lineItemsUrl: launch.ags?.lineItems ?? null,
    });

    const [row] = await db
      .select({ id: schema.ltiContexts.id })
      .from(schema.ltiContexts)
      .where(
        and(
          eq(schema.ltiContexts.deploymentId, resolved.deployment.id),
          eq(schema.ltiContexts.contextId, launch.contextId),
        ),
      )
      .limit(1);

    return row?.id ?? null;
  } catch (error) {
    console.warn(`[lti] could not record the course for ${launch.deploymentId}:`, error);
    return null;
  }
}

ltiRouter.post(LTI_ROUTE_PATHS.launch, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = String(body.state ?? '');
  const idToken = String(body.id_token ?? '');

  if (!state || !idToken) {
    refuse(
      res,
      400,
      'This link did not arrive from a launch',
      'A launch must carry both a state and an id_token. Opening this address ' +
        'directly will not work; start from the link in your LMS.',
    );
    return;
  }

  const db = getDatabase();

  let context;
  try {
    context = await verifyLaunch(db, { idToken, state });
  } catch (error) {
    if (error instanceof LaunchRejected) {
      /*
       * One sentence for every value of `reason`, and the reason itself goes to
       * the log instead. "Your nonce did not match" and "no such state" are
       * different answers only to somebody working out which one they can fix,
       * and the honest teacher's next step is the same either way: launch again.
       */
      console.warn(`[lti] launch refused (${error.reason}): ${error.message}`);
      refuse(
        res,
        403,
        'This launch could not be verified',
        'The link may have been opened twice, or left sitting too long. Go back ' +
          'to your LMS and click through again.',
      );
      return;
    }
    throw error;
  }

  /*
   * The branch that decides which kind of person just arrived.
   *
   * `isStaff` comes from the roles the platform asserted, and the two paths are
   * genuinely different acts: one links an existing adult account, the other
   * creates a child and consents for them. Neither function accepts the other's
   * launch — both check `isStaff` again for themselves — so this branch being
   * wrong is a refusal rather than a pupil holding a teacher's session.
   */
  /*
   * Recorded before the session is minted, because a pupil's token has to carry
   * the placement they came in through — nothing else knows it once the launch
   * is over, and a score with no column to go to is a score that never goes.
   */
  const courseRowId = context.contextId
    ? await rememberCourse(db, context)
    : null;

  /*
   * A deep-linking launch is a **teacher choosing what a class will work on**,
   * not anybody coming in to work. It gets its own path before the staff/pupil
   * split below, because sending it down that path would start a practice
   * session for somebody who asked to pick a topic.
   */
  if (context.messageType === DEEP_LINKING_REQUEST) {
    if (!context.isStaff) {
      /*
       * A pupil is never offered a content picker. The platform should not send
       * one this message, and if it does, the answer is no rather than a child
       * being asked to decide what their class studies.
       */
      console.warn(`[lti] deep-linking launch from a non-staff subject ${context.subject}`);
      refuse(
        res,
        403,
        'Not signed in',
        'Choosing what a class works on is for a teacher. This link was opened by ' +
          'an account your LMS did not describe as staff.',
      );
      return;
    }

    if (!context.deepLinking) {
      refuse(
        res,
        403,
        'This link could not be set up',
        'Your LMS asked for content to be chosen but did not say where to send the ' +
          'answer, or gave an address that is not secure. An administrator needs to ' +
          'look at how this tool is configured.',
      );
      return;
    }

    try {
      const staff = await provisionStaff(db, context);
      await beginChoice(db, {
        platformId: context.platformId,
        userId: staff.userId,
        deploymentId: context.deploymentId,
        returnUrl: context.deepLinking.returnUrl,
        acceptTypes: context.deepLinking.acceptTypes,
        acceptMultiple: context.deepLinking.acceptMultiple,
        data: context.deepLinking.data,
      });

      res.setHeader('Set-Cookie', ltiSessionCookie(await issueSession(staff.userId)));
      // The picker itself is C6b. Until then a teacher lands on a page that does
      // not exist yet, which is a visible gap rather than a silent one.
      res.redirect(302, '/lti/choose');
      return;
    } catch (error) {
      if (error instanceof CannotProvision) {
        console.warn(`[lti] deep linking refused (${error.reason}) for ${context.subject}`);
        refuse(res, 403, 'Not signed in', error.message);
        return;
      }
      throw error;
    }
  }

  let cookie: string;
  try {
    if (context.isStaff) {
      const staff = await provisionStaff(db, context);
      cookie = ltiSessionCookie(await issueSession(staff.userId));
    } else {
      const pupil = await provisionPupil(db, context);
      /*
       * A **learner** session, which is a different principal from an adult's
       * and not merely a narrower one. It reaches the child's own practice and
       * nothing a parent surface is built on — `protectedProcedure` refuses it,
       * so analytics, screen-time rules, export and consent stay closed without
       * any of them restating the rule.
       */
      cookie = ltiLearnerCookie(
        await issueLearnerSession(
          pupil.learnerId,
          courseRowId && context.resourceLinkId
            ? { contextRowId: courseRowId, resourceLinkId: context.resourceLinkId }
            : null,
        ),
      );
    }
  } catch (error) {
    if (error instanceof CannotProvision) {
      // These messages *are* for the reader — each one names something an
      // administrator can go and do.
      console.warn(`[lti] provisioning refused (${error.reason}) for ${context.subject}`);
      refuse(res, 403, 'Not signed in', error.message);
      return;
    }
    throw error;
  }

  /*
   * A launch is the **only** moment a platform says where this course's roster
   * lives, so it is remembered here or not at all — a sync runs later with no
   * launch in hand.
   *
   * After provisioning, and deliberately. Everything above can refuse, and a
   * course row written before a refusal would record a class this product was
   * never allowed to see. It also fails soft: a launch that succeeded must not
   * be turned into an error page because a bookkeeping write did not land.
   */
  res.setHeader('Set-Cookie', cookie);

  /*
   * A redirect rather than rendering the app here, so the address bar and the
   * SPA's own router agree about where the user is. `targetLinkUri` is the one
   * the *launch started with*, already checked against the token's claim in
   * `verifyLaunch` — not a value taken from this request.
   */
  res.redirect(302, context.targetLinkUri);
});
