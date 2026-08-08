import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { sha256 } from '../packages/ui-profile/scripts/lib/profile.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { transformBaseUiPackageManifest } from '../packages/ui-profile/scripts/transform-base-ui-id-ownership.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repositoryRoot, 'packages/ui-profile');
const preparedRoot = path.join(profileRoot, '.prepared/base-ui');
const profileRequire = createRequire(path.join(profileRoot, 'package.json'));
const installedBaseUiRoot = path.dirname(profileRequire.resolve('@base-ui/react/package.json'));

interface IdOwnershipContract {
  contractVersion: string;
  package: string;
  version: string;
  exportPath: string;
  packageManifest: {
    installedPath: string;
    originalFileSha256: string;
    transformedFileSha256: string;
  };
  providerFiles: Array<{ installedPath: string; sourcePath: string; sha256: string }>;
  supportedShapes: Array<Record<string, string>>;
}

async function contract(): Promise<IdOwnershipContract> {
  return JSON.parse(
    await readFile(path.join(profileRoot, 'compat/base-ui-1.6.0/id-ownership/contract.json'), 'utf8')
  ) as IdOwnershipContract;
}

describe('Base UI 1.6.0 SPFx ID ownership preparation contract', () => {
  it('is strict, versioned, and binds every provider byte plus the package export transform', async () => {
    const value = await contract();
    const schema = JSON.parse(
      await readFile(path.join(profileRoot, 'compat/base-ui-1.6.0/id-ownership/contract.schema.json'), 'utf8')
    );
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(value).toMatchObject({
      contractVersion: 'base-ui-1.6.0-spfx-id-ownership-v1',
      package: '@base-ui/react',
      version: '1.6.0',
      exportPath: './spfx-id-ownership'
    });
    expect(value.supportedShapes).toEqual([
      { kind: 'root', helper: 'useBaseUiOwnedRootId' },
      { kind: 'keyed-child', helper: 'useBaseUiKeyedChildId' },
      { kind: 'repeated-child', helper: 'useBaseUiRepeatedChildId', stableKeyType: 'string' },
      { kind: 'idref', helper: 'useBaseUiIdRef', targets: 'keyed-child' }
    ]);
    const installedManifest = await readFile(path.join(installedBaseUiRoot, value.packageManifest.installedPath));
    expect(sha256(installedManifest)).toBe(value.packageManifest.originalFileSha256);
    const transformed = Buffer.from(transformBaseUiPackageManifest(installedManifest.toString('utf8')));
    expect(sha256(transformed)).toBe(value.packageManifest.transformedFileSha256);
    expect(transformBaseUiPackageManifest(transformed.toString('utf8'))).toBe(transformed.toString('utf8'));
    for (const file of value.providerFiles) {
      expect(sha256(await readFile(path.join(profileRoot, file.sourcePath)))).toBe(file.sha256);
    }
  });

  it('prepares the isolated provider export without mutating the installed package', async () => {
    const value = await contract();
    const installedBefore = await readFile(path.join(installedBaseUiRoot, 'package.json'));
    const result = spawnSync(process.execPath, [path.join(profileRoot, 'scripts/prepare-base-ui.mjs')], {
      cwd: profileRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' }
    });
    const message = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(result.status, message).toBe(0);
    expect((await readFile(path.join(installedBaseUiRoot, 'package.json'))).equals(installedBefore)).toBe(true);
    expect(sha256(await readFile(path.join(preparedRoot, 'package.json')))).toBe(value.packageManifest.transformedFileSha256);
    for (const file of value.providerFiles) {
      expect(sha256(await readFile(path.join(preparedRoot, file.installedPath)))).toBe(file.sha256);
    }
  });

  it('derives one root, keyed child, repeated child, and matching IDREF from the host seam', async () => {
    const preparedModule = (await import(
      `${pathToFileURL(path.join(preparedRoot, 'spfx-id-ownership.mjs')).href}?contract=representative`
    )) as {
      BaseUiIdOwnershipProvider: React.ComponentType<{
        deriveElementId(parentOwnedId: string, semanticPart: string): string;
        children?: React.ReactNode;
      }>;
      useBaseUiOwnedRootId(rootId: string): string;
      useBaseUiKeyedChildId(parentOwnedId: string, semanticPart: string): string;
      useBaseUiRepeatedChildId(parentOwnedId: string, collectionKey: string, stableItemKey: string): string;
      useBaseUiIdRef(parentOwnedId: string, targetSemanticPart: string): string;
    };
    const rootId = 'spfx-ui-scope-instance-element-select-root';
    const deriveElementId = (parentOwnedId: string, semanticPart: string): string => `${parentOwnedId}--${semanticPart}`;

    function RepresentativeShapes(): React.ReactElement {
      const root = preparedModule.useBaseUiOwnedRootId(rootId);
      const keyedChild = preparedModule.useBaseUiKeyedChildId(root, 'list');
      const repeatedChild = preparedModule.useBaseUiRepeatedChildId(root, 'option', 'font-roboto');
      const idref = preparedModule.useBaseUiIdRef(root, 'list');
      return React.createElement(
        'div',
        { id: root, 'aria-controls': idref },
        React.createElement('div', { id: keyedChild }),
        React.createElement('div', { id: repeatedChild })
      );
    }

    const markup = renderToStaticMarkup(
      React.createElement(
        preparedModule.BaseUiIdOwnershipProvider,
        { deriveElementId },
        React.createElement(RepresentativeShapes)
      )
    );
    const keyedId = `${rootId}--base-ui:keyed:6c-69-73-74`;
    expect(markup).toContain(`id="${rootId}"`);
    expect(markup).toContain(`id="${keyedId}"`);
    expect(markup).toContain(`id="${rootId}--base-ui:repeated:6f-70-74-69-6f-6e:66-6f-6e-74-2d-72-6f-62-6f-74-6f"`);
    expect(markup).toContain(`aria-controls="${keyedId}"`);
  });

  it('fails closed for missing ownership context and unsupported repeated-key shapes', async () => {
    const preparedModule = (await import(
      `${pathToFileURL(path.join(preparedRoot, 'spfx-id-ownership.mjs')).href}?contract=fail-closed`
    )) as any;
    function MissingProvider(): React.ReactElement {
      return React.createElement('div', { id: preparedModule.useBaseUiOwnedRootId('foreign-root') });
    }
    expect(() => renderToStaticMarkup(React.createElement(MissingProvider))).toThrow(
      'must render inside BaseUiIdOwnershipProvider'
    );

    function UnsupportedRepeatedKey(): React.ReactElement {
      const id = preparedModule.useBaseUiRepeatedChildId('owned-root', 'option', { value: 'object' });
      return React.createElement('div', { id });
    }
    expect(() =>
      renderToStaticMarkup(
        React.createElement(
          preparedModule.BaseUiIdOwnershipProvider,
          { deriveElementId: (parent: string, semantic: string) => `${parent}-${semantic}` },
          React.createElement(UnsupportedRepeatedKey)
        )
      )
    ).toThrow('repeated child stable item key must be a non-empty, trimmed string');
  });
});
