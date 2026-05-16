import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',     // default; per-file pragma `// @vitest-environment jsdom` opts in
    globals: false,
    include: ['src/**/*.test.ts', 'entrypoints/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
