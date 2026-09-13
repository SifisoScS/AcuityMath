/**
 * The keys this platform signs LTI messages with.
 *
 * An LMS verifies our JWTs against a JWKS document it fetches from us and
 * **caches**, commonly for hours. Everything about the shape of this module
 * follows from that cache: a key must be *published* before it is *used*, or
 * every message signed with it is rejected until the platform happens to
 * re-fetch.
 *
 * So rotation is two steps. `createKey` publishes; `promoteKey` starts signing.
 * The gap between them is however long a platform's cache lives, and getting
 * that order wrong produces an outage that looks like a signature bug.
 */

import { createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * RS256, because LTI 1.3 requires it.
 *
 * Not a preference. The specification names RSA with SHA-256 for message
 * signing, and a platform will reject anything else regardless of how much
 * better a modern curve would be.
 */
export const LTI_ALGORITHM = 'RS256' as const;

/** 2048 is the floor certification tools accept; 4096 costs latency per signature. */
const MODULUS_LENGTH = 2048;

export interface PublicJwk {
  kty: 'RSA';
  use: 'sig';
  alg: typeof LTI_ALGORITHM;
  kid: string;
  n: string;
  e: string;
}

export interface SigningKey {
  kid: string;
  privatePem: string;
}

/** The JWKS document, as a platform fetches it. */
export interface Jwks {
  keys: PublicJwk[];
}

function toPublicJwk(publicPem: string, kid: string): PublicJwk {
  const jwk = createPublicKey(publicPem).export({ format: 'jwk' }) as {
    n?: string;
    e?: string;
  };
  if (!jwk.n || !jwk.e) throw new Error('Generated key is not an RSA public key.');

  return { kty: 'RSA', use: 'sig', alg: LTI_ALGORITHM, kid, n: jwk.n, e: jwk.e };
}

/**
 * Creates a key and publishes it, **without** signing anything yet.
 *
 * The separation from `promoteKey` is the point. Creating and activating in one
 * step would sign with a key no platform has seen, and every launch would fail
 * verification until their JWKS cache expired.
 */
export async function createKey(db: Db): Promise<PublicJwk> {
  const kid = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: MODULUS_LENGTH,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const jwk = toPublicJwk(publicKey, kid);
  await db.insert(schema.ltiKeys).values({
    kid,
    publicJwk: jwk,
    privatePem: privateKey,
    isActive: false,
  });

  return jwk;
}

/**
 * Makes a published key the signing key.
 *
 * The previous one is **left published**. Its signatures are still in flight and
 * still in platforms' caches, and pulling it from the JWKS the moment it stops
 * signing would invalidate messages it legitimately signed a second ago.
 * Retiring is a separate, later act.
 */
export async function promoteKey(db: Db, kid: string): Promise<void> {
  const [key] = await db
    .select()
    .from(schema.ltiKeys)
    .where(eq(schema.ltiKeys.kid, kid))
    .limit(1);

  if (!key) throw new Error(`No such key ${kid}.`);
  if (key.retiredAt) throw new Error(`Key ${kid} is retired and cannot sign.`);

  await db.transaction(async tx => {
    await tx.update(schema.ltiKeys).set({ isActive: false }).where(eq(schema.ltiKeys.isActive, true));
    await tx
      .update(schema.ltiKeys)
      .set({ isActive: true, activatedAt: new Date() })
      .where(eq(schema.ltiKeys.kid, kid));
  });
}

/**
 * Removes a key from the JWKS.
 *
 * Refused for the active key: a platform that fetched the document a minute ago
 * would go on verifying against a key we no longer publish, and the failure
 * would surface as "invalid signature" rather than "you retired your key".
 */
export async function retireKey(db: Db, kid: string): Promise<void> {
  const [key] = await db
    .select()
    .from(schema.ltiKeys)
    .where(eq(schema.ltiKeys.kid, kid))
    .limit(1);

  if (!key) throw new Error(`No such key ${kid}.`);
  if (key.isActive) throw new Error(`Key ${kid} is signing; promote another before retiring it.`);

  await db
    .update(schema.ltiKeys)
    .set({ retiredAt: new Date() })
    .where(eq(schema.ltiKeys.kid, kid));
}

/**
 * Every key a platform should accept, newest first.
 *
 * Retired keys are excluded and **private material never appears** — the column
 * is not selected at all rather than selected and deleted, so a future edit
 * cannot leak it by forgetting a `delete`.
 */
export async function publicJwks(db: Db): Promise<Jwks> {
  const rows = await db
    .select({ publicJwk: schema.ltiKeys.publicJwk })
    .from(schema.ltiKeys)
    .where(isNull(schema.ltiKeys.retiredAt))
    .orderBy(schema.ltiKeys.id);

  return { keys: rows.map(row => row.publicJwk as PublicJwk) };
}

/** The key to sign with, creating and promoting one on a platform's first use. */
export async function signingKey(db: Db): Promise<SigningKey> {
  const [active] = await db
    .select({ kid: schema.ltiKeys.kid, privatePem: schema.ltiKeys.privatePem })
    .from(schema.ltiKeys)
    .where(and(eq(schema.ltiKeys.isActive, true), isNull(schema.ltiKeys.retiredAt)))
    .limit(1);

  if (active) return active;

  /*
   * First run. Creating and promoting together is safe *only* here, because
   * there is no prior key for a platform to have cached — there has never been
   * a JWKS to fetch. Every later rotation must keep the two steps apart.
   */
  const created = await createKey(db);
  await promoteKey(db, created.kid);

  const [fresh] = await db
    .select({ kid: schema.ltiKeys.kid, privatePem: schema.ltiKeys.privatePem })
    .from(schema.ltiKeys)
    .where(eq(schema.ltiKeys.kid, created.kid))
    .limit(1);

  return fresh;
}
