import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const profileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/ui-profile');
const profileRequire = createRequire(path.join(profileRoot, 'package.json'));
const packageRoot = (name) => path.dirname(profileRequire.resolve(`${name}/package.json`));
const reactRoot = packageRoot('react');
const reactDomRoot = packageRoot('react-dom');
const preparedBaseUiRoot = path.join(profileRoot, '.prepared/base-ui');

export default {
  resolve: {
    alias: [
      { find: '@base-ui/react', replacement: preparedBaseUiRoot },
      { find: /^react$/, replacement: path.join(reactRoot, 'index.js') },
      { find: /^react\/jsx-runtime$/, replacement: path.join(reactRoot, 'jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.join(reactRoot, 'jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: path.join(reactDomRoot, 'index.js') },
      { find: /^react-dom\/test-utils$/, replacement: path.join(reactDomRoot, 'test-utils.js') }
    ],
    dedupe: ['react', 'react-dom']
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/fixtures/ui-profile/react17-exits-workload.spec.ts'],
    server: {
      deps: {
        inline: true
      }
    },
    testTimeout: 30_000
  }
};
