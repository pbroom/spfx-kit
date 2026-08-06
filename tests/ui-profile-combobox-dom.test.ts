import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vitestRoot = path.dirname(require.resolve('vitest/package.json'));

describe('normalized React 17 Combobox synthetic exact-scale workload', () => {
  it('passes the isolated 1,940-option synthetic DOM behavior harness', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(vitestRoot, 'vitest.mjs'),
        'run',
        '--config',
        path.join(repositoryRoot, 'tests/fixtures/ui-profile/vitest-workload.config.mjs')
      ],
      { cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, CI: '1' } }
    );
    const message = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status, message).toBe(0);
    expect(message).toMatch(/1 passed/);
  });
});
