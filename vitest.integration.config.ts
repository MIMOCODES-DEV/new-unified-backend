import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests start real MongoDB and Redis containers (Docker required).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/integration/**/*.int-spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
