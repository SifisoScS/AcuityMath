/**
 * Districts and the campuses inside them.
 *
 * `users.institution_id` existed from the first schema as a nullable int
 * referencing nothing — a hook for a table nobody built. These are the entities
 * it was waiting for, and the column is a real foreign key as of the same
 * migration.
 *
 * **Creating them is an administrator's act and nothing else's.** There is no
 * self-serve path to a district: an institution exists because an agreement was
 * signed, and the agreement is what the row stands for. Until Track B2 gives
 * institutional administrators a scope of their own, the platform `admin` role
 * is the only caller — which is deliberate, because an entity that can be
 * created by whoever asks is an entity that means nothing.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/** Raised when a name or slug would collide with one already taken. */
export class AlreadyExists extends Error {
  constructor(what: string) {
    super(`${what} already exists.`);
    this.name = 'AlreadyExists';
  }
}

/**
 * Lower-case, hyphenated, and stable.
 *
 * Derived once at creation rather than recomputed on read: a slug that changes
 * when a district is renamed breaks every URL that ever referred to it, and the
 * point of a slug is that it does not move.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface Institution {
  id: number;
  name: string;
  slug: string;
}

export async function createInstitution(db: Db, name: string): Promise<Institution> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('An institution needs a name.');

  const slug = slugify(trimmed);
  if (!slug) throw new Error(`"${name}" does not reduce to a usable slug.`);

  const [existing] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.slug, slug))
    .limit(1);
  if (existing) throw new AlreadyExists(`An institution with the slug "${slug}"`);

  const [row] = await db
    .insert(schema.institutions)
    .values({ name: trimmed, slug })
    .$returningId();

  return { id: row.id, name: trimmed, slug };
}

export interface School {
  id: number;
  institutionId: number;
  name: string;
}

export async function createSchool(
  db: Db,
  institutionId: number,
  name: string,
): Promise<School> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A school needs a name.');

  /*
   * The institution is checked rather than left to the foreign key.
   *
   * The constraint would reject it either way, but as a driver-level error with
   * no useful message. "No such institution" is a different answer from "that
   * name is taken", and a caller that cannot tell them apart cannot tell a typo
   * from a duplicate.
   */
  const [institution] = await db
    .select({ id: schema.institutions.id })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, institutionId))
    .limit(1);
  if (!institution) throw new Error(`No such institution ${institutionId}.`);

  const [taken] = await db
    .select({ id: schema.schools.id })
    .from(schema.schools)
    .where(
      and(
        eq(schema.schools.institutionId, institutionId),
        eq(schema.schools.name, trimmed),
      ),
    )
    .limit(1);
  if (taken) throw new AlreadyExists(`A school named "${trimmed}" in that institution`);

  const [row] = await db
    .insert(schema.schools)
    .values({ institutionId, name: trimmed })
    .$returningId();

  return { id: row.id, institutionId, name: trimmed };
}

/** Every district, with its campuses. Small by nature; no pagination yet. */
export async function listInstitutions(
  db: Db,
): Promise<Array<Institution & { schools: School[] }>> {
  const districts = await db
    .select()
    .from(schema.institutions)
    .orderBy(schema.institutions.name);

  const campuses = await db.select().from(schema.schools).orderBy(schema.schools.name);

  return districts.map(district => ({
    id: district.id,
    name: district.name,
    slug: district.slug,
    schools: campuses
      .filter(campus => campus.institutionId === district.id)
      .map(campus => ({ id: campus.id, institutionId: campus.institutionId, name: campus.name })),
  }));
}
