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
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'drizzle/**/*.test.ts'],
    // The generator invariants draw a 6,720-problem sample. That is a few
    // seconds of real work, and well past Vitest's 5s default.
    testTimeout: 30_000,
  },
});
