import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests: real MongoDB + Redis containers, the real HTTP server and CLI (Docker required).
// Run before every push by .husky/pre-push.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
