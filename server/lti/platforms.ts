/**
 * The learning management systems allowed to launch into this product.
 *
 * A launch arrives carrying three strings — an issuer, a client id and a
 * deployment id — and this module is what turns them into "which platform, and
 * which of our districts". Everything in C3 depends on that resolution being
 * exact: a lookup that matched on fewer than all three would let one platform's
 * launch resolve as another's, which is impersonation by loose comparison rather
 * than by any broken signature.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

export class AlreadyRegistered extends Error {
  constructor(issuer: string, clientId: string) {
    super(`${issuer} has already registered client ${clientId}.`);
    this.name = 'AlreadyRegistered';
  }
}

export interface PlatformInput {
  issuer: string;
  clientId: string;
  name: string;
  authLoginUrl: string;
  authTokenUrl: string;
  keysetUrl: string;
}

export interface Platform extends PlatformInput {
  id: number;
}

/**
 * Every URL a platform gives us is fetched or redirected to, so each is checked
 * to be `https`.
 *
 * A registration is an administrator typing values from a platform's admin
 * screen, and a typo that leaves an `http://` keyset URL means verifying launch
 * tokens over a channel anyone on the path can rewrite. Refusing at registration
 * is the only place this is cheap to catch.
 */
function requireHttps(label: string, url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must be https, got ${parsed.protocol}//`);
  }
  return parsed.toString();
}

export async function registerPlatform(db: Db, input: PlatformInput): Promise<Platform> {
  const issuer = input.issuer.trim();
  const clientId = input.clientId.trim();
  const name = input.name.trim();
  if (!issuer || !clientId || !name) {
    throw new Error('A platform needs an issuer, a client id and a name.');
  }

  const authLoginUrl = requireHttps('The OIDC login URL', input.authLoginUrl);
  const authTokenUrl = requireHttps('The token URL', input.authTokenUrl);
  const keysetUrl = requireHttps('The keyset URL', input.keysetUrl);
  requireHttps('The issuer', issuer);

  const [existing] = await db
    .select({ id: schema.ltiPlatforms.id })
    .from(schema.ltiPlatforms)
    .where(
      and(eq(schema.ltiPlatforms.issuer, issuer), eq(schema.ltiPlatforms.clientId, clientId)),
    )
    .limit(1);
  if (existing) throw new AlreadyRegistered(issuer, clientId);

  const [row] = await db
    .insert(schema.ltiPlatforms)
    .values({ issuer, clientId, name, authLoginUrl, authTokenUrl, keysetUrl })
    .$returningId();

  return { id: row.id, issuer, clientId, name, authLoginUrl, authTokenUrl, keysetUrl };
}

export interface Deployment {
  id: number;
  platformId: number;
  deploymentId: string;
  institutionId: number;
}

/** Binds one installation inside a platform to one of our districts. */
export async function addDeployment(
  db: Db,
  platformId: number,
  deploymentId: string,
  institutionId: number,
): Promise<Deployment> {
  const trimmed = deploymentId.trim();
  if (!trimmed) throw new Error('A deployment needs an id.');

  /*
   * Both parents are checked rather than left to the foreign keys, for the same
   * reason `createSchool` checks its institution: the constraint would reject it
   * as a driver error with no useful message, and "no such platform" is a
   * different answer from "no such district".
   */
  const [platform] = await db
    .select({ id: schema.ltiPlatforms.id })
    .from(schema.ltiPlatforms)
    .where(eq(schema.ltiPlatforms.id, platformId))
    .limit(1);
  if (!platform) throw new Error(`No such platform ${platformId}.`);

  const [institution] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .limit(1);
  if (!institution) throw new Error(`No such institution ${institutionId}.`);

  const [existing] = await db
    .select({ id: schema.ltiDeployments.id })
    .from(schema.ltiDeployments)
    .where(
      and(
        eq(schema.ltiDeployments.platformId, platformId),
        eq(schema.ltiDeployments.deploymentId, trimmed),
      ),
    )
    .limit(1);
  if (existing) throw new Error(`Deployment ${trimmed} is already registered for that platform.`);

  const [row] = await db
    .insert(schema.ltiDeployments)
    .values({ platformId, deploymentId: trimmed, institutionId })
    .$returningId();

  return { id: row.id, platformId, deploymentId: trimmed, institutionId };
}

export interface ResolvedLaunch {
  platform: Platform;
  deployment: Deployment;
}

/**
 * Resolves the three strings a launch carries, or nothing.
 *
 * **All three must match.** Issuer and client id identify the registration;
 * the deployment identifies the installation and therefore the district. A
 * lookup that ignored the client id would resolve a launch from one tenant of a
 * shared platform as another's — no signature would be wrong, no error would be
 * raised, and a child would be placed in a district that never enrolled them.
 *
 * Returns `null` rather than throwing. An unrecognised launch is an ordinary
 * event — a platform mid-configuration, a stale bookmark — and the caller
 * decides what a stranger is told.
 */
export async function resolveLaunch(
  db: Db,
  issuer: string,
  clientId: string,
  deploymentId: string,
): Promise<ResolvedLaunch | null> {
  const [row] = await db
    .select({ platform: schema.ltiPlatforms, deployment: schema.ltiDeployments })
    .from(schema.ltiDeployments)
    .innerJoin(
      schema.ltiPlatforms,
      eq(schema.ltiDeployments.platformId, schema.ltiPlatforms.id),
    )
    .where(
      and(
        eq(schema.ltiPlatforms.issuer, issuer),
        eq(schema.ltiPlatforms.clientId, clientId),
        eq(schema.ltiDeployments.deploymentId, deploymentId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    platform: {
      id: row.platform.id,
      issuer: row.platform.issuer,
      clientId: row.platform.clientId,
      name: row.platform.name,
      authLoginUrl: row.platform.authLoginUrl,
      authTokenUrl: row.platform.authTokenUrl,
      keysetUrl: row.platform.keysetUrl,
    },
    deployment: {
      id: row.deployment.id,
      platformId: row.deployment.platformId,
      deploymentId: row.deployment.deploymentId,
      institutionId: row.deployment.institutionId,
    },
  };
}

/** Registered platforms with their deployments, for an administrator's list. */
export async function listPlatforms(
  db: Db,
): Promise<Array<Platform & { deployments: Deployment[] }>> {
  const platforms = await db.select().from(schema.ltiPlatforms).orderBy(schema.ltiPlatforms.name);
  const deployments = await db.select().from(schema.ltiDeployments);

  return platforms.map(platform => ({
    id: platform.id,
    issuer: platform.issuer,
    clientId: platform.clientId,
    name: platform.name,
    authLoginUrl: platform.authLoginUrl,
    authTokenUrl: platform.authTokenUrl,
    keysetUrl: platform.keysetUrl,
    deployments: deployments
      .filter(deployment => deployment.platformId === platform.id)
      .map(deployment => ({
        id: deployment.id,
        platformId: deployment.platformId,
        deploymentId: deployment.deploymentId,
        institutionId: deployment.institutionId,
      })),
  }));
}
