import { defineConfig } from 'vitest/config';

// Unit tests only — pure logic, no database. Integration tests (needing a test
// DB) will live under a separate project/config once a disposable Postgres is
// wired in CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
