import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react\/jsx-runtime$/u,
        replacement: path.resolve('node_modules/react/jsx-runtime.js')
      },
      {
        find: /^react\/jsx-dev-runtime$/u,
        replacement: path.resolve('node_modules/react/jsx-dev-runtime.js')
      },
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
  ssr: {
    noExternal: true
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000
  }
});
