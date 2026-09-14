/**
 * The inbound half of a launch: deciding whether a token is one of ours.
 *
 * A platform returns a signed JWT. Verifying its signature proves the platform
 * wrote it and **nothing else** — not that it was written for us, not that it
 * was written for this trip, and not that we are seeing it for the first time.
 * Each of those is a separate check, and every one of them is load-bearing:
 *
 *   - the *state* proves the round trip is one we started,
 *   - the *nonce* proves the token was minted for that particular trip,
 *   - the *audience* proves it was minted for us rather than for another tenant
 *     of the same LMS,
 *   - the *deployment* proves which district the learner belongs to.
 *
 * Drop any one and a token that is perfectly valid somewhere else becomes valid
 * here.
 *
 * **This module does not provision anybody.** A validated launch is a set of
 * facts about who the platform says is knocking; turning that into a learner is
 * C3c, and it has to go through the consent gate rather than around it.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { LTI_ALGORITHM } from './keys';
import { consumeState, LAUNCH_WINDOW_MS } from './launchState';
import { resolveLaunch } from './platforms';

type Db = MySql2Database<typeof schema>;

/**
 * The claim names, which are URIs because LTI puts its claims in a namespace.
 *
 * Spelled once here rather than inline at each use. They are long enough that a
 * typo reads as correct, and a mistyped claim name does not fail loudly — it
 * reads as absent, and an absent claim that should have been checked is a check
 * that silently passes.
 */
export const LTI_CLAIM = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  /**
   * Whatever the district typed into the placement's custom parameters.
   *
   * The only channel LTI offers for facts the specification does not model,
   * and the only way a pupil's year group can reach us: **no LTI message
   * carries a birth date**, by design.
   */
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
} as const;

export const LTI_VERSION = '1.3.0';
export const RESOURCE_LINK_REQUEST = 'LtiResourceLinkRequest';

/**
 * Roles that mean "this person marks work", by the suffix of the role URI.
 *
 * Matched on the suffix after the last `#` because platforms send both the short
 * and the full-URI spelling of the same role, and a district's custom roles
 * arrive as URIs we have never seen. Anything unrecognised is a learner: the
 * failure mode of guessing wrong downward is a teacher who sees a practice
 * screen, and of guessing wrong upward is a pupil holding a roster.
 */
const STAFF_ROLES = new Set([
  'Instructor',
  'Administrator',
  'ContentDeveloper',
  'Mentor',
  'TeachingAssistant',
  'Faculty',
  'Staff',
]);

export class LaunchRejected extends Error {
  readonly reason: string;

  /**
   * `reason` is for the log; `message` is for the log too.
   *
   * Neither is for the browser. The route renders one flat refusal for every
   * value of `reason`, because "your nonce did not match" and "no such state"
   * are different sentences only to somebody trying to find out which.
   */
  constructor(reason: string, detail: string) {
    super(detail);
    this.name = 'LaunchRejected';
    this.reason = reason;
  }
}

/** What the platform told us, once all of it has been checked. */
export interface LaunchContext {
  platformId: number;
  issuer: string;
  clientId: string;
  deploymentId: string;
  /** The district this deployment is bound to. Not taken from the token. */
  institutionId: number;
  /** The platform's stable identifier for the person. Opaque, and not an email. */
  subject: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isStaff: boolean;
  contextId: string | null;
  contextTitle: string | null;
  resourceLinkId: string | null;
  targetLinkUri: string;
  /**
   * The placement's custom parameters, as strings.
   *
   * Values are whatever an administrator typed into a form, so everything is a
   * string and nothing here is trustworthy without checking. Platforms also
   * disagree about case: Canvas lowercases parameter names, others do not, so
   * the keys are normalised to lower case on the way in rather than at each
   * read — a lookup that silently misses is a parameter that reads as absent.
   */
  custom: Record<string, string>;
  claims: JWTPayload;
}

/**
 * One key set per platform, kept between launches.
 *
 * `createRemoteJWKSet` caches internally, so building a new one per launch
 * throws that cache away and fetches the platform's JWKS on **every single
 * launch** — a self-inflicted request per pupil per lesson, against somebody
 * else's server, which is how a product gets rate-limited out of a district.
 *
 * Keyed by the URL as well as the platform, so correcting a mistyped keyset URL
 * takes effect without a restart.
 */
const keySets = new Map<string, JWTVerifyGetKey>();

function remoteKeySet(platformId: number, keysetUrl: string): JWTVerifyGetKey {
  const cacheKey = `${platformId}:${keysetUrl}`;
  const existing = keySets.get(cacheKey);
  if (existing) return existing;

  const created = createRemoteJWKSet(new URL(keysetUrl), {
    // A key we have never seen means the platform rotated. Refetching is right;
    // refetching on every bad token is a denial of service somebody else pays
    // for, so the cooldown bounds it.
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60 * 1000,
  });
  keySets.set(cacheKey, created);
  return created;
}

/** Exposed for tests, which stand up a throwaway platform per case. */
export function forgetKeySets(): void {
  keySets.clear();
}

export interface VerifyLaunchInput {
  idToken: string;
  state: string;
}

export interface VerifyLaunchOptions {
  /**
   * Where signing keys come from. Defaults to fetching the platform's JWKS.
   *
   * A seam, not a mock: the integration tests serve a real JWKS over real HTTP
   * through the default path. This exists so a caller can pin a key set when the
   * platform's endpoint is unreachable from the network the server sits on,
   * which is an ordinary condition inside a school district.
   */
  keyResolver?: (platform: { id: number; keysetUrl: string; issuer: string }) => JWTVerifyGetKey;
  now?: Date;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Checks a returned token against the trip that produced it.
 *
 * The order matters. The state is consumed **first**, before any of the
 * expensive work, so that a flood of replayed tokens is a flood of single row
 * updates rather than a flood of outbound JWKS fetches and RSA verifications.
 */
export async function verifyLaunch(
  db: Db,
  input: VerifyLaunchInput,
  options: VerifyLaunchOptions = {},
): Promise<LaunchContext> {
  const now = options.now ?? new Date();

  const claimed = await consumeState(db, input.state, now);
  if (!claimed) {
    throw new LaunchRejected(
      'state',
      'The state is unknown, already spent, or outside its window.',
    );
  }

  const [platform] = await db
    .select()
    .from(schema.ltiPlatforms)
    .where(eq(schema.ltiPlatforms.id, claimed.platformId))
    .limit(1);
  if (!platform) {
    throw new LaunchRejected('platform', 'The platform this launch started at is gone.');
  }

  const resolveKeys = options.keyResolver ?? (p => remoteKeySet(p.id, p.keysetUrl));

  let payload: JWTPayload;
  try {
    /*
     * The issuer and audience come from the *stored* platform row, not from the
     * token. Reading them out of the token and then checking the token against
     * them would be asking the token to vouch for itself — anyone can mint a
     * self-consistent JWT. The state is what ties this token to a registration
     * we chose in advance.
     */
    const verified = await jwtVerify(input.idToken, resolveKeys(platform), {
      issuer: platform.issuer,
      audience: platform.clientId,
      /*
       * Pinned to the one algorithm LTI names.
       *
       * The first version of this line claimed it was what stopped HS256
       * confusion — a token signed with the platform's *public* key used as a
       * shared secret. Mutating it proved that wrong: removing the pin does not
       * let that token through, because an RSA key object cannot be handed to an
       * HMAC verifier at all. jose stops it a layer below this.
       *
       * What the pin does stop is an RSA signature under an algorithm nobody
       * agreed to — RS512, PS256 — from a platform whose published JWK omits
       * `alg`, which many real ones do. Without `alg` there is nothing else
       * narrowing the choice, and "the specification says RS256" stops being
       * enforced anywhere. The test below uses exactly that shape, because a
       * test that passes with the line deleted is not testing the line.
       */
      algorithms: [LTI_ALGORITHM],
      // Platform clocks drift; a minute of slack is conventional and costs
      // nothing that single use does not already cover.
      clockTolerance: 60,
      // The same window the state has. Two different ages for one launch would
      // mean a token that outlives the trip it belongs to, or a trip that
      // outlives its token — either way a number nobody can explain.
      maxTokenAge: Math.floor(LAUNCH_WINDOW_MS / 1000),
      currentDate: now,
    });
    payload = verified.payload;
  } catch (error) {
    throw new LaunchRejected('signature', `The token did not verify: ${String(error)}`);
  }

  /*
   * `aud` may be a list, and jose is satisfied when our client id appears
   * anywhere in it. OpenID Connect requires `azp` to name the intended party
   * whenever there is more than one — without this check, a token addressed to
   * several tenants at once would be accepted by all of them.
   */
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length > 1 && asString(payload.azp) !== platform.clientId) {
    throw new LaunchRejected('azp', 'A multi-audience token must name us in azp.');
  }

  // The check this whole round trip exists for. Everything above proves the
  // platform wrote the token; only this proves it wrote it for *this* trip.
  if (asString(payload.nonce) !== claimed.nonce) {
    throw new LaunchRejected('nonce', 'The nonce is not the one this launch was started with.');
  }

  if (asString(payload[LTI_CLAIM.version]) !== LTI_VERSION) {
    throw new LaunchRejected(
      'version',
      `Expected LTI ${LTI_VERSION}, got ${String(payload[LTI_CLAIM.version])}.`,
    );
  }

  const messageType = asString(payload[LTI_CLAIM.messageType]);
  if (messageType !== RESOURCE_LINK_REQUEST) {
    /*
     * Deep linking and the other message types are real and are not built. They
     * are refused by name rather than waved through, because a message type we
     * do not handle arriving at the handler for one we do is how a launch ends
     * up doing something nobody designed.
     */
    throw new LaunchRejected(
      'message_type',
      `Unsupported LTI message type ${String(messageType)}.`,
    );
  }

  const subject = asString(payload.sub);
  if (!subject) {
    throw new LaunchRejected('sub', 'The token names no subject.');
  }

  const deploymentId = asString(payload[LTI_CLAIM.deploymentId]);
  if (!deploymentId) {
    throw new LaunchRejected('deployment', 'The token names no deployment.');
  }

  /*
   * The deployment is what decides which district's data this launch may touch,
   * and it is resolved against our own registry rather than trusted from the
   * token. A platform that is registered for one district must not be able to
   * name another district's deployment and be believed.
   */
  const resolved = await resolveLaunch(db, platform.issuer, platform.clientId, deploymentId);
  if (!resolved) {
    throw new LaunchRejected('deployment', `Deployment ${deploymentId} is not registered.`);
  }

  /*
   * The target must be the one the trip started with. Without this, a launch
   * begun towards a practice page could come back pointing anywhere, and the
   * platform's own claim would be the only thing saying where the pupil lands.
   */
  const target = asString(payload[LTI_CLAIM.targetLinkUri]);
  if (target && target !== claimed.targetLinkUri) {
    throw new LaunchRejected(
      'target',
      'The token asks for a different target than the launch started with.',
    );
  }

  const roles = Array.isArray(payload[LTI_CLAIM.roles])
    ? (payload[LTI_CLAIM.roles] as unknown[]).filter(
        (role): role is string => typeof role === 'string',
      )
    : [];

  const rawCustom = payload[LTI_CLAIM.custom];
  const custom: Record<string, string> = {};
  if (rawCustom && typeof rawCustom === 'object' && !Array.isArray(rawCustom)) {
    for (const [key, value] of Object.entries(rawCustom as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      custom[key.trim().toLowerCase()] = String(value).trim();
    }
  }

  const context = (payload[LTI_CLAIM.context] ?? null) as { id?: string; title?: string } | null;
  const resourceLink = (payload[LTI_CLAIM.resourceLink] ?? null) as { id?: string } | null;

  return {
    platformId: platform.id,
    issuer: platform.issuer,
    clientId: platform.clientId,
    deploymentId,
    institutionId: resolved.deployment.institutionId,
    subject,
    name: asString(payload.name),
    /*
     * Often absent, and absent is not a defect. A district can configure its LMS
     * to withhold personal data from tools, which is a privacy setting working
     * as intended — so nothing downstream may require this to be present.
     */
    email: asString(payload.email),
    roles,
    isStaff: roles.some(role => STAFF_ROLES.has(role.split('#').pop() ?? role)),
    contextId: asString(context?.id),
    contextTitle: asString(context?.title),
    resourceLinkId: asString(resourceLink?.id),
    custom,
    targetLinkUri: claimed.targetLinkUri,
    claims: payload,
  };
}
