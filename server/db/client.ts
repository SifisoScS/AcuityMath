/**
 * The database connection.
 *
 * A pool rather than a single connection: the practice loop writes an attempt,
 * a mastery row, a history point and an ability row per answer, and a single
 * connection serialises a whole classroom behind one of them.
 */

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import * as schema from '../../drizzle/schema';

export type Database = MySql2Database<typeof schema>;

let pool: mysql.Pool | null = null;
let database: Database | null = null;

/**
 * Fails closed when `DATABASE_URL` is absent.
 *
 * The previous storage layer was a JSON file that appeared from nowhere on
 * first write, so a misconfigured deployment looked like a working one holding
 * an empty school. A missing connection string is a deployment fault and should
 * read as one at startup rather than as a parent whose children have vanished.
 */
export function getDatabase(): Database {
  if (database) return database;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. AcuityMath has no local-file fallback by design — ' +
        'a silent one would present an empty database as a working install.',
    );
  }

  pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    // The schema stores theta and mastery as DECIMAL-like strings on purpose;
    // letting the driver coerce them to floats would reintroduce the drift the
    // string columns exist to avoid.
    decimalNumbers: false,
    timezone: 'Z',
  });

  database = drizzle(pool, { schema, mode: 'default' });
  return database;
}

/** Closes the pool. Tests use it; the server does not, outside shutdown. */
export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = null;
  database = null;
}

export { schema };
