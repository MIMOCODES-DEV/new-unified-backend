import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is required so Nest decorators emit the metadata dependency injection relies on.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/unit/**/*.spec.ts'],
  },
});
