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

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: 'parent' | 'teacher' | 'admin';
}

export const SESSION_COOKIE = 'acuity_session';
export const DEV_AUTH_ENV = 'DEV_AUTH_EMAIL';

/** Thirty days. A parent should not be signed out between homework sessions. */
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const ISSUER = 'acuitymath';
const AUDIENCE = 'acuitymath-app';

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
