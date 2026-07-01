import assert from 'node:assert/strict';

import { createSpfxBridge } from '../../packages/code-workbench-runtime/dist/index.js';

const capturedPaths = [];
const context = {
  msGraphClientFactory: {
    async getClient() {
      return {
        api(path) {
          capturedPaths.push(path);
          return {
            header() {
              return {
                async get() {
                  return { path };
                }
              };
            },
            async get() {
              return { path };
            }
          };
        }
      };
    }
  }
};

const bridge = createSpfxBridge(context);

await bridge.directory.users('alice smith"&$top=999&$select=id,mail');
await bridge.directory.groups('security&$count=true');

assert.equal(capturedPaths.length, 2);
assertEncodedSearchOnly(capturedPaths[0], '/users', '"alice smith\\"&$top=999&$select=id,mail"');
assertEncodedSearchOnly(capturedPaths[1], '/groups', '"security&$count=true"');

console.log('code workbench Graph search regression checks passed');

function assertEncodedSearchOnly(path, resourcePath, expectedSearch) {
  assert.equal(path.startsWith(`${resourcePath}?$search=`), true);
  assert.equal(path.includes(`${resourcePath}?%24search=`), false);
  assert.equal(path.includes('+'), false);
  assert.equal(path.includes(' '), false);
  if (expectedSearch.includes(' ')) {
    assert.equal(path.includes('%20'), true);
  }
  const url = new URL(path, 'https://graph.microsoft.com/v1.0');
  assert.equal(url.pathname, resourcePath);
  assert.equal(url.searchParams.get('$search'), expectedSearch);
  assert.equal(url.searchParams.has('$top'), false);
  assert.equal(url.searchParams.has('$select'), false);
  assert.equal(url.searchParams.has('$count'), false);
}
