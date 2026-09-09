/**
 * A database of one integration suite's own.
 *
 * Vitest runs test files in parallel, and a shared database makes that a race:
 * one suite's fixtures appear in another's query, and the failure surfaces as a
 * schema defect that is really a scheduling accident. It caught exactly that
 * here — a concept seeded by the answer-pipeline suite turned up in the schema
 * suite's age-band assertion.
 *
 * Serialising the files would have fixed it too, at the cost of slowing every
 * future run and leaving the hazard in place for whoever forgets the flag. A
 * database per suite is isolation rather than avoidance: the suites can run in
 * parallel because there is nothing left to share.
 */

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

import * as schema from '../../drizzle/schema';

export interface TestDatabase {
  db: MySql2Database<typeof schema>;
  connection: mysql.Connection;
  /** Empties every table. Cheaper than recreating the schema between tests. */
  reset: () => Promise<void>;
  /** Reconnects to the same database, for asserting that state survived. */
  reconnect: () => Promise<MySql2Database<typeof schema>>;
  close: () => Promise<void>;
}

/**
 * Creates (or reuses) `<base>_<suite>` and applies the migration to it.
 *
 * `suite` must be a bare identifier — it is interpolated into a CREATE DATABASE
 * statement, which cannot take a placeholder. Callers pass a literal, but the
 * check is here rather than in a comment.
 */
export async function createTestDatabase(suite: string): Promise<TestDatabase> {
  if (!/^[a-z0-9_]+$/.test(suite)) {
    throw new Error(`Test database suffix must be [a-z0-9_]+, got ${JSON.stringify(suite)}`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const parsed = new URL(url);
  const baseName = parsed.pathname.replace(/^\//, '') || 'acuitymath';
  const dbName = `${baseName}_${suite}`;

  // Connect with no database selected so the CREATE can run.
  const server = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    multipleStatements: true,
  });
  await server.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await server.end();

  parsed.pathname = `/${dbName}`;
  let connection = await mysql.createConnection({ uri: parsed.toString(), multipleStatements: true });
  let db = drizzle(connection, { schema, mode: 'default' });
  await migrate(db, { migrationsFolder: './drizzle/migrations' });

  async function reset() {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'",
    );
    // Foreign key checks are suspended so the tables can be emptied in any
    // order; maintaining a topological list would rot as tables are added.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of rows) await connection.query(`TRUNCATE TABLE \`${name}\``);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  async function reconnect() {
    await connection.end();
    connection = await mysql.createConnection({ uri: parsed.toString(), multipleStatements: true });
    db = drizzle(connection, { schema, mode: 'default' });
    return db;
  }

  return {
    get db() {
      return db;
    },
    get connection() {
      return connection;
    },
    reset,
    reconnect,
    close: () => connection.end(),
  } as TestDatabase;
}
