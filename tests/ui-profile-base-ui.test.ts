import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { sha256 } from '../packages/ui-profile/scripts/lib/profile.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  SELECT_VALUE_FROM,
  SELECT_VALUE_TO,
  transformSelectValueDeclaration
} from '../packages/ui-profile/scripts/transform-base-ui-select-value.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { transformPopupStoreUtils } from '../packages/ui-profile/scripts/transform-base-ui-popup-lifecycle.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repositoryRoot, 'packages/ui-profile');
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/ui-profile/base-ui');
const networkBlocker = path.join(repositoryRoot, 'tests/fixtures/ui-profile/block-network.mjs');
const profileRequire = createRequire(path.join(profileRoot, 'package.json'));
const baseUiRoot = path.dirname(profileRequire.resolve('@base-ui/react/package.json'));

describe('Base UI 1.6.0 SelectValue React 17 declaration transform', () => {
  it('performs the one approved replacement deterministically and idempotently', async () => {
    const original = await readFile(path.join(fixtureRoot, 'select-value.original.d.ts'), 'utf8');
    const expected = await readFile(path.join(fixtureRoot, 'select-value.transformed.d.ts'), 'utf8');

    const first = transformSelectValueDeclaration(original);
    const second = transformSelectValueDeclaration(original);
    expect(first).toBe(expected);
    expect(second).toBe(first);
    expect(transformSelectValueDeclaration(first)).toBe(first);
    expect(SELECT_VALUE_FROM).toBe("Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'>");
    expect(SELECT_VALUE_TO).toBe("Omit<BaseUIComponentProps<'span', SelectValueState>, 'children' | 'placeholder'>");
  });

  it('fails closed for unknown, drifted, or ambiguous declaration bytes', () => {
    expect(() => transformSelectValueDeclaration('export interface SelectValueProps {}\n')).toThrow(
      'exactly one recognized upstream signature; found 0'
    );
    expect(() =>
      transformSelectValueDeclaration(
        "type One = Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'>\n" +
          "type Two = Omit<BaseUIComponentProps<'span', SelectValueState>, 'children'>\n"
      )
    ).toThrow('exactly one recognized upstream signature; found 2');
    expect(() =>
      transformSelectValueDeclaration("type Drift = Omit<BaseUIComponentProps<'span', SelectValueState>, 'children' >\n")
    ).toThrow('exactly one recognized upstream signature; found 0');
  });

  it('binds both installed declaration variants to exact approved before/after digests', async () => {
    const contract = JSON.parse(
      await readFile(path.join(profileRoot, 'compat/base-ui-1.6.0/select-value/contract.json'), 'utf8')
    ) as {
      contractVersion: string;
      package: string;
      version: string;
      files: Array<{
        installedPath: string;
        upstreamPath: string;
        transformedPath: string;
        upstreamSha256: string;
        transformedSha256: string;
      }>;
    };

    expect(contract).toMatchObject({
      contractVersion: 'base-ui-1.6.0-select-value-react17-v1',
      package: '@base-ui/react',
      version: '1.6.0'
    });
    expect(contract.files.map((file) => file.installedPath)).toEqual([
      'select/value/SelectValue.d.ts',
      'select/value/SelectValue.d.mts'
    ]);
    for (const file of contract.files) {
      const upstream = await readFile(path.join(profileRoot, file.upstreamPath));
      const expected = await readFile(path.join(profileRoot, file.transformedPath));
      expect(sha256(upstream)).toBe(file.upstreamSha256);
      expect(sha256(expected)).toBe(file.transformedSha256);
      expect(transformSelectValueDeclaration(upstream.toString('utf8'))).toBe(expected.toString('utf8'));
      expect(transformSelectValueDeclaration(expected.toString('utf8'))).toBe(expected.toString('utf8'));
    }
  });

  it('verifies committed fixtures offline without applying changes to the installed package', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', networkBlocker, path.join(profileRoot, 'scripts/transform-base-ui-select-value.mjs'), '--verify-fixtures'],
      { cwd: profileRoot, encoding: 'utf8' }
    );
    const message = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(message).not.toContain('attempted network access');
    expect(result.status, message).toBe(0);
    expect(result.stdout).toContain('Verified base-ui-1.6.0-select-value-react17-v1');
  });
});

describe('Base UI 1.6.0 React 17 popup lifecycle transform', () => {
  it('performs each approved runtime replacement deterministically and idempotently', async () => {
    const contract = await readPopupLifecycleContract();

    for (const file of contract.files) {
      const original = (await readFile(path.join(profileRoot, file.originalPath), 'utf8')).trimEnd();
      const expected = (await readFile(path.join(profileRoot, file.transformedPath), 'utf8')).trimEnd();
      expect(transformPopupStoreUtils(original, original, expected)).toBe(expected);
      expect(transformPopupStoreUtils(original, original, expected)).toBe(expected);
      expect(transformPopupStoreUtils(expected, original, expected)).toBe(expected);
    }
  });

  it('fails closed for unknown and ambiguous runtime bytes', () => {
    const original = 'const pendingTriggerId = activeTriggerId;';
    const transformed = 'const pendingTriggerId = null;';
    expect(() => transformPopupStoreUtils('unrecognized runtime', original, transformed)).toThrow(
      'found 0 original and 0 transformed'
    );
    expect(() => transformPopupStoreUtils(`${original}\n${original}`, original, transformed)).toThrow(
      'found 2 original and 0 transformed'
    );
    expect(() => transformPopupStoreUtils(`${original}\n${transformed}`, original, transformed)).toThrow(
      'found 1 original and 1 transformed'
    );
  });

  it('binds the upstream correction, fragments, and installed runtime files to exact digests', async () => {
    const contract = await readPopupLifecycleContract();

    expect(contract).toMatchObject({
      contractVersion: 'base-ui-1.6.0-popup-lifecycle-react17-v1',
      package: '@base-ui/react',
      version: '1.6.0',
      upstream: {
        pullRequest: 'https://github.com/mui/base-ui/issues/5387',
        mergeCommit: '3b5715cc70f6b1988051c989ae32f8082c71d5ae',
        sourcePath: 'packages/react/src/utils/popups/popupStoreUtils.ts'
      }
    });
    expect(contract.files.map((file) => file.installedPath)).toEqual([
      'utils/popups/popupStoreUtils.mjs',
      'utils/popups/popupStoreUtils.js'
    ]);

    for (const file of contract.files) {
      const originalFragment = await readFile(path.join(profileRoot, file.originalPath));
      const transformedFragment = await readFile(path.join(profileRoot, file.transformedPath));
      const installed = await readFile(path.join(baseUiRoot, file.installedPath));
      expect(sha256(originalFragment)).toBe(file.originalSha256);
      expect(sha256(transformedFragment)).toBe(file.transformedSha256);
      expect(file.originalFileSha256).toMatch(/^[a-f0-9]{64}$/);
      expect([file.originalFileSha256, file.transformedFileSha256]).toContain(sha256(installed));
    }
  });

  it('verifies committed runtime fixtures offline without applying changes', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', networkBlocker, path.join(profileRoot, 'scripts/transform-base-ui-popup-lifecycle.mjs'), '--verify-fixtures'],
      { cwd: profileRoot, encoding: 'utf8' }
    );
    const message = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(message).not.toContain('attempted network access');
    expect(result.status, message).toBe(0);
    expect(result.stdout).toContain('Verified base-ui-1.6.0-popup-lifecycle-react17-v1');
  });

  it('does not expose a CLI path that can mutate an arbitrary Base UI installation', async () => {
    const installedBefore = await Promise.all(
      [
        'select/value/SelectValue.d.ts',
        'select/value/SelectValue.d.mts',
        'utils/popups/popupStoreUtils.mjs',
        'utils/popups/popupStoreUtils.js'
      ].map((relativePath) => readFile(path.join(baseUiRoot, relativePath)))
    );
    for (const script of ['transform-base-ui-select-value.mjs', 'transform-base-ui-popup-lifecycle.mjs']) {
      const result = spawnSync(process.execPath, [path.join(profileRoot, 'scripts', script), '--apply-root', baseUiRoot], {
        cwd: profileRoot,
        encoding: 'utf8'
      });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('Only --verify-fixtures is supported');
    }
    const installedAfter = await Promise.all(
      [
        'select/value/SelectValue.d.ts',
        'select/value/SelectValue.d.mts',
        'utils/popups/popupStoreUtils.mjs',
        'utils/popups/popupStoreUtils.js'
      ].map((relativePath) => readFile(path.join(baseUiRoot, relativePath)))
    );
    for (const [index, before] of installedBefore.entries()) {
      expect(installedAfter[index].equals(before)).toBe(true);
    }
  });
});

interface PopupLifecycleContract {
  contractVersion: string;
  package: string;
  version: string;
  upstream: {
    pullRequest: string;
    mergeCommit: string;
    sourcePath: string;
  };
  files: Array<{
    installedPath: string;
    originalPath: string;
    transformedPath: string;
    originalSha256: string;
    transformedSha256: string;
    originalFileSha256: string;
    transformedFileSha256: string;
  }>;
}

async function readPopupLifecycleContract(): Promise<PopupLifecycleContract> {
  return JSON.parse(
    await readFile(path.join(profileRoot, 'compat/base-ui-1.6.0/popup-lifecycle/contract.json'), 'utf8')
  ) as PopupLifecycleContract;
}
