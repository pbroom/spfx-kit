import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@spfx-kit/source-editor-core',
        replacement: path.resolve('packages/source-editor-core/src/index.ts')
      },
      {
        find: /^@base-ui\/react(?=\/|$)/u,
        replacement: path.resolve('packages/ui-profile/.prepared/base-ui')
      }
    ]
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000
  }
});
