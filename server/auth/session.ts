/**
 * Who is making this request.
 *
 * ## This is a seam, not an implementation
 *
 * Real sign-in is Graft C: email magic links, hashed single-use tokens, and an
 * HS256 session cookie. None of that exists yet. What exists here is the shape
 * the rest of the server codes against, so the authorization logic below it —
 * which guardian may reach which learner — can be built and tested now and does
 * not change when the sign-in does.
 *
 * ## Why it fails closed
 *
 * The development escape hatch resolves a user from an environment variable.
 * That is a complete authentication bypass, so it is refused outright when
 * `NODE_ENV=production`, and the refusal throws rather than returning null: a
 * production server configured this way is misconfigured, and should not start
 * serving requests as an anonymous stranger while looking healthy.
 *
 * The previous model had no server-side identity at all — a PIN compared as a
 * plaintext string in React, with role switching in browser state. Anything
 * here is an improvement, which is exactly the sort of reasoning that leaves a
 * bypass in a shipped build. Hence the hard failure.
 */

import { eq } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: 'parent' | 'teacher' | 'admin';
}

export const DEV_AUTH_ENV = 'DEV_AUTH_EMAIL';

/**
 * Resolves the caller, or null when nobody is signed in.
 *
 * @throws if the development bypass is configured in production.
 */
export async function resolveUser(db: Database, headers: RequestHeaders): Promise<AuthenticatedUser | null> {
  const devEmail = process.env[DEV_AUTH_ENV];
  const isProduction = process.env.NODE_ENV === 'production';

  if (devEmail && isProduction) {
    throw new Error(
      `${DEV_AUTH_ENV} is set in a production build. This variable bypasses ` +
        'authentication entirely and must never be present outside development.',
    );
  }

  if (devEmail && !isProduction) {
    return resolveDevUser(db, devEmail);
  }

  // Graft C fills this in. Until then an ordinary request has no identity, and
  // every protected procedure refuses it — which is the correct behaviour for a
  // server whose sign-in has not been built rather than a gap to paper over.
  void headers;
  return null;
}

/** Only the headers this module reads, so a test need not fake a whole request. */
export interface RequestHeaders {
  cookie?: string | undefined;
  authorization?: string | undefined;
}

/**
 * Finds or creates the developer's own account.
 *
 * Creating on demand keeps `pnpm dev` a single command rather than a command
 * plus a seed step that drifts. It is unreachable in production by the check
 * above.
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
