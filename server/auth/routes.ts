/**
 * The sign-in endpoints.
 *
 * Express rather than tRPC, for two reasons. The callback is a link a parent
 * clicks in an email — it has to be a plain GET that a mail client will follow
 * and a browser will render, which a JSON-RPC endpoint is not. And both routes
 * set cookies, which tRPC procedures have no natural place to do.
 */

import { Router, type Request, type Response } from 'express';

import { getDatabase } from '../db/client';
import { sendMagicLink } from './email';
import { consumeMagicLink, issueMagicLink, RateLimited, revokeOutstandingLinks } from './magicLink';
import { clearedSessionCookie, issueSession, sessionCookie } from './session';

export const authRouter = Router();

/** Rough shape check. Real validation is the email arriving. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Where the callback link points.
 *
 * Required in production and refused if absent: a link built against the wrong
 * origin lands the parent on a page that cannot sign them in, and the failure
 * appears in their mailbox rather than in a log.
 */
function appBaseUrl(req: Request): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'APP_BASE_URL must be set in production. Sign-in links are built from it, and a link ' +
        'built from a guessed origin fails in the parent\'s mailbox rather than in a log.',
    );
  }
  return `${req.protocol}://${req.get('host')}`;
}

authRouter.post('/request-link', async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '');

  if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
    return res.status(400).json({ error: 'Enter an email address.' });
  }

  const db = getDatabase();

  try {
    const { token } = await issueMagicLink(db, email, req.ip);
    const link = `${appBaseUrl(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;
    const delivery = await sendMagicLink(email.trim().toLowerCase(), link);

    // The response is identical whether or not the address has an account. A
    // difference here turns this endpoint into a directory of which parents use
    // the service.
    return res.json({
      sent: true,
      // Present only when nothing was emailed, so a developer is never left
      // waiting for mail that was never sent.
      devLink: delivery.mode === 'logged' ? delivery.link : undefined,
    });
  } catch (error) {
    if (error instanceof RateLimited) {
      return res.status(429).json({ error: error.message });
    }
    console.error('[auth] failed to issue a sign-in link:', error);
    return res.status(500).json({ error: 'Could not send a sign-in link. Try again shortly.' });
  }
});

/**
 * The link itself.
 *
 * Redirects rather than rendering, so the token leaves the address bar
 * immediately. A URL containing a live credential ends up in browser history,
 * in a screenshot, and in the referrer of every asset the page loads.
 */
authRouter.get('/callback', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.redirect('/?signin=invalid');

  const db = getDatabase();
  const result = await consumeMagicLink(db, token);

  if (!result.ok) {
    // The three failures are distinguished for the parent's benefit: "this link
    // has already been used" and "this link has expired" have different next
    // steps, and telling someone the wrong one wastes their time.
    return res.redirect(`/?signin=${result.reason}`);
  }

  await revokeOutstandingLinks(db, result.email);

  const session = await issueSession(result.userId);
  res.setHeader('Set-Cookie', sessionCookie(session));
  return res.redirect('/?signin=ok');
});

authRouter.post('/signout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', clearedSessionCookie());
  return res.json({ signedOut: true });
});
