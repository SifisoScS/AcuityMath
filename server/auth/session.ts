/**
 * Who is making this request.
 *
 * A signed session cookie, issued when a magic link is consumed and verified on
 * every request. This replaces the development seam that stood here while the
 * authorization logic was built — that seam resolved a user from an environment
 * variable, and it is now refused outright rather than merely discouraged.
 *
 * ## Why a JWT rather than a session table
 *
 * A row per session is the more flexible choice: it can be revoked centrally.
 * A signed token cannot, until it expires. The trade is deliberate — every
 * request would otherwise carry a database read before it could do anything,
 * including the ones a child makes every few seconds while practising, and the
 * revocation that matters here (a parent signing out on a shared computer) is
 * handled by clearing the cookie.
 *
 * When institutional accounts arrive and an administrator needs to end somebody
 * else's session, this becomes a session table. Not before.
 */

import { eq } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

/** The placement a child arrived through, when they arrived through one. */
export interface LearnerLaunch {
  contextRowId: number;
  resourceLinkId: string;
}

/** A child, and where they came in from. */
export interface LearnerSession {
  learnerId: number;
  launch: LearnerLaunch | null;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: 'parent' | 'teacher' | 'admin' | 'institution_admin';
}

export const SESSION_COOKIE = 'acuity_session';

/**
 * Proof that the adult, not the child, is at the keyboard.
 *
 * A separate cookie from the session rather than a claim inside it. The session
 * lasts thirty days because a parent should not be signed out between homework
 * sessions; elevation lasts fifteen minutes because the tablet gets handed to a
 * child. Putting both in one token would mean reissuing a thirty-day credential
 * every time somebody opened the parent dashboard, and expiring elevation would
 * mean expiring the session.
 */
export const ELEVATION_COOKIE = 'acuity_elevated';

/**
 * The cookie a child holds, separate from the adult one.
 *
 * A separate name rather than a different payload in `acuity_session`, so that
 * `resolveUser` keeps reading one cookie and cannot accidentally be handed a
 * child. The two can also coexist: a parent signed in on the family tablet
 * whose child launches from school should not sign the parent out.
 */
export const LEARNER_COOKIE = 'acuity_learner';
export const DEV_AUTH_ENV = 'DEV_AUTH_EMAIL';

/** Thirty days. A parent should not be signed out between homework sessions. */
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

/**
 * Eight hours, against the adult session's thirty days.
 *
 * A child's session lives on whatever machine the school put in front of them,
 * and that machine belongs to the classroom rather than to them. Thirty days
 * would leave a shared computer signed in as a particular nine-year-old until
 * somebody noticed.
 *
 * Eight rather than one: a session that expires mid-lesson is a child locked
 * out of their work with no adult password to recover it, and the launch that
 * would fix it is back in the LMS. Long enough for a school day, short enough
 * that a device left in an empty classroom is anonymous by the evening.
 */
export const LEARNER_SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

const ISSUER = 'acuitymath';
const AUDIENCE = 'acuitymath-app';
/**
 * A distinct audience, so a session token cannot be presented as elevation.
 * Without it, the same signature verifies for both and holding a session would
 * be holding the step-up it exists to require.
 */
const ELEVATION_AUDIENCE = 'acuitymath-elevated';

/**
 * A third audience, so a child's token and an adult's can never be confused.
 *
 * Not decoration. All three are signed with the same key, so the audience is
 * the **only** thing distinguishing them — without it, a learner token pasted
 * into the adult cookie would verify, and `resolveUser` would look up a `users`
 * row by a learner id. That is not a hypothetical: the ids are small integers
 * from separate sequences, so learner 7 and user 7 both exist.
 */
const LEARNER_AUDIENCE = 'acuitymath-learner';

/** Fifteen minutes. Long enough to read a dashboard, short enough to hand over. */
export const ELEVATION_LIFETIME_SECONDS = 15 * 60;

export interface RequestHeaders {
  cookie?: string | undefined;
  authorization?: string | undefined;
}

/**
 * The signing key.
 *
 * Fails closed with a specific message. A server that invents a key at startup
 * signs tokens nobody else can verify, so every deploy silently signs everyone
 * out — and two instances behind a load balancer reject each other's sessions,
 * which presents as an intermittent, unreproducible sign-out.
 */
function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to at least 32 characters. Sessions are signed with it; ' +
        'a generated or short key means tokens that other instances reject and that a ' +
        'restart invalidates. Generate one with `openssl rand -base64 48`.',
    );
  }
  return new TextEncoder().encode(secret);
}

/** Mints a session token for a user id. */
export async function issueSession(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${SESSION_LIFETIME_SECONDS}s`)
    .sign(signingKey());
}

/**
 * Mints a session for a **child**, which nothing else in this product does.
 *
 * Until C3g a learner could not hold a session at all: `learner_access_tokens`
 * resolves a child *within* an adult's session and explicitly cannot start one,
 * and `selectLearner` hands the client an id that the adult's session then
 * authorises. An LTI pupil arrives with no adult anywhere, so the child has to
 * be the principal.
 *
 * What that principal may reach is deliberately narrow, and is enforced in
 * `learnerProcedure` rather than here — a token says who somebody is, never
 * what they may do.
 */
export async function issueLearnerSession(
  learnerId: number,
  launch?: LearnerLaunch | null,
): Promise<string> {
  return new SignJWT({
    sub: String(learnerId),
    /*
     * Which placement the child came in through, carried in the token because
     * nothing else knows it later. A practice session records no course, and by
     * the time one finishes the launch is long gone — so without this, a score
     * would have no column to go to and guessing one means writing a mark
     * somewhere nobody chose.
     *
     * Safe to trust: this token is signed by us and nobody else can mint one.
     */
    ctx: launch?.contextRowId,
    rl: launch?.resourceLinkId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(LEARNER_AUDIENCE)
    .setExpirationTime(`${LEARNER_SESSION_LIFETIME_SECONDS}s`)
    .sign(signingKey());
}

/**
 * The child this request is, or null.
 *
 * Returns an id and does **not** load the row. The caller loads it, because
 * every caller needs the learner for other reasons anyway and a second query
 * here would be one per request for nothing. An id that names a deleted or
 * archived child is refused where that is checked — `learnerProcedure` filters
 * on `archivedAt`, which is what makes a deletion request effective without a
 * session table.
 */
export async function resolveLearnerSession(
  headers: RequestHeaders,
): Promise<LearnerSession | null> {
  const token = readCookie(headers.cookie, LEARNER_COOKIE);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      // The audience is what stops an adult's session token being presented
      // here, and a child's being presented as an adult's.
      audience: LEARNER_AUDIENCE,
    });
    const learnerId = Number(payload.sub);
    if (!Number.isInteger(learnerId) || learnerId <= 0) return null;

    const contextRowId = Number(payload.ctx);
    const resourceLinkId = typeof payload.rl === 'string' ? payload.rl : null;

    return {
      learnerId,
      /*
       * Both or neither. A column needs a course *and* a placement, and half of
       * a pair would send a score to a course's default column — a mark in a
       * place no teacher put a link.
       */
      launch:
        Number.isInteger(contextRowId) && contextRowId > 0 && resourceLinkId
          ? { contextRowId, resourceLinkId }
          : null,
    };
  } catch {
    return null;
  }
}

/** Mints an elevation token for a user id. */
export async function issueElevation(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(ELEVATION_AUDIENCE)
    .setExpirationTime(`${ELEVATION_LIFETIME_SECONDS}s`)
    .sign(signingKey());
}

/**
 * Whether this request carries valid elevation for this user.
 *
 * Checks the subject as well as the signature. An elevation token belonging to
 * a different account is not elevation for this one — which matters on a shared
 * computer where two parents sign in from the same browser.
 */
export async function hasElevation(headers: RequestHeaders, userId: number): Promise<boolean> {
  const token = readCookie(headers.cookie, ELEVATION_COOKIE);
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: ELEVATION_AUDIENCE,
    });
    return Number(payload.sub) === userId;
  } catch {
    return false;
  }
}

export function elevationCookie(token: string): string {
  const parts = [
    `${ELEVATION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ELEVATION_LIFETIME_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearedElevationCookie(): string {
  const parts = [`${ELEVATION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/**
 * The Set-Cookie value for a session.
 *
 * `HttpOnly` so a cross-site script cannot read it. `SameSite=Lax` rather than
 * `Strict` because the sign-in link arrives from an email client, and `Strict`
 * would withhold the cookie on that first navigation — the parent would click
 * their link and land signed out. `Secure` in production only, so development
 * over plain HTTP still works.
 */
export function sessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/**
 * Whether this deployment is reachable over https.
 *
 * `APP_BASE_URL` rather than `NODE_ENV`, because the thing that decides whether
 * a browser will keep a `Secure` cookie is the scheme it was served over, and
 * the ordinary way to develop an LTI tool is a tunnel giving an https URL to a
 * server that still thinks it is in development.
 */
function servedOverHttps(): boolean {
  const base = process.env.APP_BASE_URL;
  if (base) return base.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}

/**
 * The Set-Cookie value for a session begun by an LTI launch.
 *
 * Separate from `sessionCookie` for one reason, and it is the single most
 * common way an LTI integration fails. **A tool launched from an LMS runs
 * cross-site**, usually inside an iframe on the LMS's own page. `SameSite=Lax`
 * is not sent on cross-site subresource requests at all, so the cookie would be
 * set by the launch and then withheld from every request after it: the teacher
 * lands on a page that says they are signed out, immediately after signing in.
 *
 * `SameSite=None` is what makes it travel, and browsers only keep such a cookie
 * when it is also `Secure` — which is why **LTI does not work over plain
 * http**, locally or anywhere. Emitting `None` without `Secure` would have the
 * browser discard the cookie outright, so below https we fall back to `Lax`,
 * which at least works for a launch opened in a new tab rather than an iframe.
 *
 * The family app keeps `Lax`. Widening it there would hand away a CSRF defence
 * that costs nothing to keep, to solve a problem it does not have.
 */
export function ltiSessionCookie(token: string): string {
  const secure = servedOverHttps();
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    secure ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * The Set-Cookie value for a child's session, begun by an LTI launch.
 *
 * `SameSite=None; Secure` for the same reason `ltiSessionCookie` is: the child
 * is looking at this product inside a frame on their LMS, and a `Lax` cookie is
 * not sent on those requests at all.
 */
export function ltiLearnerCookie(token: string): string {
  const secure = servedOverHttps();
  const parts = [
    `${LEARNER_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    secure ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${LEARNER_SESSION_LIFETIME_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** The Set-Cookie value that ends a session. */
export function clearedSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/**
 * Reads one cookie out of a header.
 *
 * Hand-parsed rather than pulled from a library because it is four lines and
 * the header format is fixed. Values are URI-decoded, since a token is
 * base64url and needs no escaping but a cookie header may still carry it
 * encoded.
 */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/**
 * Resolves the caller, or null when nobody is signed in.
 *
 * An invalid, expired or forged token is not an error — it is an anonymous
 * request. The landing page renders for anonymous visitors, and throwing here
 * would blank the page for someone who has simply not signed in yet.
 *
 * @throws if the development bypass is configured in production.
 */
export async function resolveUser(db: Database, headers: RequestHeaders): Promise<AuthenticatedUser | null> {
  const devEmail = process.env[DEV_AUTH_ENV];
  if (devEmail) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${DEV_AUTH_ENV} is set in a production build. This variable bypasses ` +
          'authentication entirely and must never be present outside development.',
      );
    }
    return resolveDevUser(db, devEmail);
  }

  const token = readCookie(headers.cookie, SESSION_COOKIE);
  if (!token) return null;

  let userId: number;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
  } catch {
    // Expired, tampered with, or signed by a key this instance does not have.
    return null;
  }

  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  // A valid token for a deleted account is not a session. This is what makes
  // account deletion effective without a session table.
  return row ? toAuthenticatedUser(row) : null;
}

/**
 * Finds or creates the developer's own account.
 *
 * Unreachable in production by the check above. Kept because `pnpm dev` without
 * a mail server is the normal way to work on this, and the alternative is every
 * developer running a sign-in flow before they can see a page.
 */
async function resolveDevUser(db: Database, email: string): Promise<AuthenticatedUser> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return toAuthenticatedUser(existing);

  await db.insert(schema.users).values({ email, name: 'Development user', role: 'parent' });
  const [created] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return toAuthenticatedUser(created);
}

function toAuthenticatedUser(row: typeof schema.users.$inferSelect): AuthenticatedUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
