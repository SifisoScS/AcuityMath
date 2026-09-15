import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'drizzle/**/*.test.ts', 'server/**/*.test.ts', 'test/**/*.test.ts'],
    // The generator invariants draw a 6,720-problem sample. That is a few
    // seconds of real work, and well past Vitest's 5s default.
    testTimeout: 30_000,
    /*
     * Raised for the same reason, and it was an oversight that it was not.
     *
     * `testTimeout` was lifted when a slow *test* appeared; the hook default
     * stayed at ten seconds. Every integration suite's `beforeEach` empties
     * roughly thirty-five tables and seeds a fixture, which is real work that
     * grows with the schema — and under a parallel run of thirty-seven suites
     * against one MySQL it began exceeding ten seconds.
     *
     * The symptom was the confusing part: vitest attributes a hook timeout to
     * the test that was about to run, so it read as two unrelated LTI tests
     * failing intermittently rather than as setup running out of time. It was
     * dismissed as a flake once before it was chased.
     */
    hookTimeout: 30_000,
  },
});
