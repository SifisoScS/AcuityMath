import { defineConfig } from 'drizzle-kit';

/**
 * MySQL rather than Postgres, which the Phase 1 plan originally named.
 *
 * The learning tables here are ported from a MySQL schema whose migrations and
 * seed SQL are already written, and Drizzle abstracts the difference away for
 * everything this application does. Switching dialects would buy nothing and
 * cost the seed path.
 */
export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/acuitymath',
  },
  strict: true,
  verbose: true,
});
