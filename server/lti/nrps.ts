/**
 * Reading a course's roster from the platform that owns it.
 *
 * Names and Role Provisioning is the first thing this product *asks* a district
 * for rather than waits to be handed, and what comes back is a list of
 * children's names. That shapes every decision here: the endpoint must be
 * https, the response is treated as somebody else's data rather than ours, and
 * **nothing in this module writes to the domain.** Turning a membership list
 * into classrooms and learners is C4c, where the question of what happens to a
 * child who has left a class gets answered deliberately instead of falling out
 * of a loop.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { accessTokenFor, forgetAccessToken, NRPS_SCOPE, type PlatformForToken } from './accessToken';
import { rolesAreStaff } from './idToken';

type Db = MySql2Database<typeof schema>;

/**
 * The media type that makes this a Names and Roles request.
 *
 * Not decoration: several platforms serve a different representation, or a 406,
 * when it is missing. It carries the service version, which is how a platform
 * knows which shape to send.
 */
export const MEMBERSHIP_MEDIA_TYPE =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';

/**
 * How many pages a single read will follow.
 *
 * A bound rather than a limit anyone should hit: a thousand-pupil course is a
 * handful of pages. It exists because `next` comes from the platform, and a
 * platform that returns a link to the page you are already on turns this into
 * an infinite loop holding an open connection to a district's LMS. A cycle is a
 * bug somewhere; it should surface as a refusal rather than as a process that
 * never returns.
 */
const MAX_PAGES = 50;

/**
 * Whether a roster may be fetched from this URL.
 *
 * https always, because a roster is a list of children's names and a channel
 * somebody can rewrite is one where they choose what we are told the class
 * contains — and read it on the way past.
 *
 * The loopback exception exists so the fetch, the pagination and the retry are
 * tested against a **real HTTP server** rather than a stub, which is the only
 * way to find out whether this code actually speaks the protocol. It is bounded
 * twice: the host must be loopback, and `NODE_ENV` must be exactly `test`,
 * which the runner sets and a deployment does not. A production build cannot
 * reach it, and an http URL pointing anywhere but this machine is refused even
 * under the runner — asserted below, so the exception cannot quietly widen.
 */
export function mayFetchRoster(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;

  return (
    process.env.NODE_ENV === 'test' &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === '::1' || parsed.hostname === 'localhost')
  );
}

export class RosterUnavailable extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'RosterUnavailable';
    this.status = status;
  }
}

/** One person as the platform describes them. */
export interface RosterMember {
  /** The platform's `sub` for this person — the same value a launch carries. */
  userId: string;
  roles: string[];
  isStaff: boolean;
  name: string | null;
  email: string | null;
  /**
   * `Active` or `Inactive`, as sent. Platforms use it to say somebody has left
   * a course without removing them from the list.
   *
   * Kept as the platform's own word rather than reduced to a boolean, because
   * C4c has to decide what leaving means and that decision should read the
   * platform's vocabulary rather than an interpretation of it made here.
   */
  status: string | null;
}

export interface Roster {
  contextId: string | null;
  contextTitle: string | null;
  members: RosterMember[];
}

interface MembershipPage {
  id?: unknown;
  context?: { id?: unknown; title?: unknown };
  members?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function parseMember(raw: unknown): RosterMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const member = raw as Record<string, unknown>;

  /*
   * A member with no `user_id` is skipped rather than given a placeholder. It is
   * the only field that identifies the person, and a row without one cannot be
   * matched to anybody — inventing an id would create a new child on every sync.
   */
  const userId = asString(member.user_id);
  if (!userId) return null;

  const roles = Array.isArray(member.roles)
    ? (member.roles as unknown[]).filter((role): role is string => typeof role === 'string')
    : [];

  return {
    userId,
    roles,
    // Decided by the same rule a launch uses, deliberately. Two copies would
    // eventually disagree, and a person would be staff on one path and a pupil
    // on the other.
    isStaff: rolesAreStaff(roles),
    name: asString(member.name),
    email: asString(member.email),
    status: asString(member.status),
  };
}

/**
 * The `next` page, from the `Link` header.
 *
 * NRPS paginates the way RFC 8288 describes rather than with a cursor in the
 * body, so this is the only place the next URL appears. Parsed rather than
 * pattern-matched loosely: a header may carry several relations, and `rel="next"`
 * has to be picked out of them instead of assuming the first link is it.
 */
export function nextPageFrom(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(',')) {
    const match = /<([^>]+)>\s*;\s*(.+)/.exec(part.trim());
    if (!match) continue;

    const [, url, parameters] = match;
    if (/\brel\s*=\s*"?next"?/i.test(parameters)) {
      /*
       * https only, on every page. A platform that starts a roster on https and
       * offers a plain-http continuation would otherwise have the rest of the
       * class read over a channel somebody can rewrite — and the guard on the
       * first URL would have bought nothing.
       */
      return mayFetchRoster(url.trim()) ? url.trim() : null;
    }
  }
  return null;
}

async function fetchPage(
  url: string,
  token: string,
): Promise<{ status: number; body: string; link: string | null }> {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: MEMBERSHIP_MEDIA_TYPE,
    },
  });

  return {
    status: response.status,
    body: await response.text(),
    link: response.headers.get('link'),
  };
}

export interface ReadMembershipOptions {
  /** Narrows the request to one role, which platforms honour as a query filter. */
  role?: string;
  now?: Date;
}

/**
 * Reads a whole roster, following pages.
 *
 * Retries **once** on a 401, and only after discarding the cached token. A
 * platform that revoked a credential early, or a clock that disagrees, leaves
 * this module holding a token it believes is good; without the retry every
 * later sync fails identically until the token expires on its own. Retrying
 * more than once would turn somebody else's outage into a loop against their
 * server.
 */
export async function readMembership(
  db: Db,
  platform: PlatformForToken,
  membershipsUrl: string,
  options: ReadMembershipOptions = {},
): Promise<Roster> {
  if (!mayFetchRoster(membershipsUrl)) {
    throw new RosterUnavailable(0, 'A roster may only be read over https.');
  }

  const members: RosterMember[] = [];
  let contextId: string | null = null;
  let contextTitle: string | null = null;

  let url: string | null = membershipsUrl;
  if (options.role) {
    const withRole = new URL(url);
    withRole.searchParams.set('role', options.role);
    url = withRole.toString();
  }

  let pages = 0;
  let retriedAfterUnauthorized = false;

  while (url) {
    if (pages >= MAX_PAGES) {
      throw new RosterUnavailable(
        0,
        `The roster did not finish within ${MAX_PAGES} pages, which usually means the ` +
          'platform is returning a next link that points back at itself.',
      );
    }
    pages += 1;

    let token = await accessTokenFor(db, platform, NRPS_SCOPE, options.now);
    let page = await fetchPage(url, token);

    if (page.status === 401 && !retriedAfterUnauthorized) {
      retriedAfterUnauthorized = true;
      await forgetAccessToken(db, platform.id, NRPS_SCOPE);
      token = await accessTokenFor(db, platform, NRPS_SCOPE, options.now);
      page = await fetchPage(url, token);
    }

    if (page.status === 403) {
      throw new RosterUnavailable(
        403,
        'The platform refused the roster. The Names and Roles scope is usually not ' +
          'enabled for this tool in the LMS.',
      );
    }

    if (page.status < 200 || page.status >= 300) {
      throw new RosterUnavailable(
        page.status,
        `The platform answered ${page.status}: ${page.body.slice(0, 200)}`,
      );
    }

    let parsed: MembershipPage;
    try {
      parsed = JSON.parse(page.body) as MembershipPage;
    } catch {
      throw new RosterUnavailable(
        page.status,
        `The roster endpoint did not return JSON: ${page.body.slice(0, 200)}`,
      );
    }

    contextId = contextId ?? asString(parsed.context?.id);
    contextTitle = contextTitle ?? asString(parsed.context?.title);

    if (Array.isArray(parsed.members)) {
      for (const raw of parsed.members) {
        const member = parseMember(raw);
        if (member) members.push(member);
      }
    }

    url = nextPageFrom(page.link);
  }

  return { contextId, contextTitle, members };
}

/**
 * Remembers where a course's roster lives, from a launch that mentioned one.
 *
 * Called on every launch that carries the claim, because the URL can change —
 * a platform moving domains, or a district reinstalling the tool — and the last
 * launch is always the most current thing anybody has said about it.
 *
 * A launch **without** the claim leaves an existing URL alone rather than
 * clearing it. The claim is absent for two very different reasons — the scope
 * was never granted, or this particular message did not include it — and
 * forgetting a working URL because of the second would break a sync that had
 * been running for months.
 */
export async function rememberContext(
  db: Db,
  input: {
    deploymentRowId: number;
    contextId: string;
    title: string | null;
    membershipsUrl: string | null;
    /** What the placement said about age, when it said anything. */
    defaultBirthYear?: number | null;
  },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.ltiContexts)
    .where(
      and(
        eq(schema.ltiContexts.deploymentId, input.deploymentRowId),
        eq(schema.ltiContexts.contextId, input.contextId),
      ),
    )
    .limit(1);

  if (existing) {
    /*
     * Only what the launch actually said. A `null` here means "this message did
     * not mention it", never "it is gone" — so the columns are left as they were
     * rather than overwritten with nothing.
     */
    const changes: Partial<typeof schema.ltiContexts.$inferInsert> = {};
    if (input.title !== null && input.title !== existing.title) changes.title = input.title;
    if (input.membershipsUrl !== null && input.membershipsUrl !== existing.membershipsUrl) {
      changes.membershipsUrl = input.membershipsUrl;
    }
    const year = input.defaultBirthYear ?? null;
    if (year !== null && year !== existing.defaultBirthYear) changes.defaultBirthYear = year;

    // A launch that said nothing new writes nothing. An empty `set` is also an
    // error in Drizzle, so this is both the honest and the working branch.
    if (Object.keys(changes).length > 0) {
      await db
        .update(schema.ltiContexts)
        .set(changes)
        .where(eq(schema.ltiContexts.id, existing.id));
    }
    return;
  }

  await db
    .insert(schema.ltiContexts)
    .values({
      deploymentId: input.deploymentRowId,
      contextId: input.contextId,
      title: input.title,
      membershipsUrl: input.membershipsUrl,
      defaultBirthYear: input.defaultBirthYear ?? null,
    })
    /*
     * Two launches for the same course can arrive together — two pupils opening
     * the same link. The loser of that race must not fail on a duplicate key,
     * and re-writing `contextId` to the value it already holds is the smallest
     * thing that satisfies MySQL's requirement that the clause change something.
     */
    .onDuplicateKeyUpdate({ set: { contextId: input.contextId } });
}

/** Marks a sync as having completed. Distinct from having changed anything. */
export async function noteSynced(db: Db, contextRowId: number, now: Date = new Date()): Promise<void> {
  await db
    .update(schema.ltiContexts)
    .set({ lastSyncedAt: now })
    .where(eq(schema.ltiContexts.id, contextRowId));
}
