import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  assertGeneratedProfileSchema,
  generateValidatedProfile
} from '../packages/ui-profile/scripts/lib/generate-validated-profile.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { assertGeneratedTreeClosure } from '../packages/ui-profile/scripts/lib/generated-tree-closure.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { canonicalJson, normalizeRegistrySource } from '../packages/ui-profile/scripts/lib/profile.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { bindVerifiedSnapshotsToProvenance } from '../packages/ui-profile/scripts/lib/profile-update-intake.mjs';

const temporaryRoots: string[] = [];
const packageRoot = path.resolve('packages/ui-profile');

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function closureFixture(outputs: Array<{ path: string; source: string }>): Promise<{
  outputRoot: string;
  profile: { items: Array<{ id: string; normalized: Array<{ path: string }> }> };
}> {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'ui-profile-closure-'));
  temporaryRoots.push(outputRoot);
  for (const output of outputs) {
    await mkdir(path.dirname(path.join(outputRoot, output.path)), { recursive: true });
    await writeFile(path.join(outputRoot, output.path), output.source);
  }
  return {
    outputRoot,
    profile: { items: [{ id: 'fixture', normalized: outputs.map((output) => ({ path: output.path })) }] }
  };
}

async function expectInvalidUpdateStagingBeforeReplacement(
  sourcePrefix: string,
  expectedMessage: string,
  registryId = 'button',
  mutateSnapshot?: (snapshot: { dependencies?: unknown; devDependencies?: unknown; registryDependencies?: unknown }) => void
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ui-profile-update-staging-'));
  temporaryRoots.push(root);
  const rawRoot = path.join(root, 'raw');
  const outputRoot = path.join(root, 'output');
  await cp(path.join(packageRoot, 'snapshots', 'raw'), rawRoot, { recursive: true });
  const snapshotPath = path.join(rawRoot, `${registryId}.json`);
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  snapshot.files[0].content = `${sourcePrefix}\n${snapshot.files[0].content}`;
  mutateSnapshot?.(snapshot);
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  const committedProvenance = JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'));
  const snapshots = new Map(
    await Promise.all(
      committedProvenance.registryIds.map(async (id: string) => [id, await readFile(path.join(rawRoot, `${id}.json`))])
    )
  );
  const provenance = bindVerifiedSnapshotsToProvenance(committedProvenance, snapshots);
  const provenanceBytes = Buffer.from(canonicalJson(provenance));
  const replaceGenerated = vi.fn();

  await expect(
    generateValidatedProfile({
      packageRoot,
      rawRoot,
      outputRoot,
      provenance,
      provenanceBytes,
      generatedPaths: ['snapshots', 'normalized', 'profile.json'],
      replaceGenerated
    })
  ).rejects.toThrow(expectedMessage);
  expect(replaceGenerated).not.toHaveBeenCalled();
}

describe('generated profile module closure', () => {
  it('validates staged manifests against the pinned profile schema', async () => {
    const profile = JSON.parse(await readFile(path.join(packageRoot, 'profile.json'), 'utf8'));
    await expect(assertGeneratedProfileSchema({ packageRoot, profile })).resolves.toBeUndefined();
    delete profile.$schema;
    await expect(assertGeneratedProfileSchema({ packageRoot, profile })).rejects.toThrow('profile.json schema errors');
  });

  it('rejects excluded snapshot metadata dependencies before replacement', async () => {
    await expectInvalidUpdateStagingBeforeReplacement(
      '',
      'Pinned registry item button uses excluded dependency cmdk',
      'button',
      (snapshot) => {
        snapshot.dependencies = ['cmdk@1.1.1'];
      }
    );
  });

  it.each([
    [
      'an undeclared dependency',
      'Pinned registry item button uses undeclared production dependency left-pad',
      ['left-pad@1.0.0']
    ],
    [
      'a wrong pinned version in devDependencies',
      'Pinned registry item button requires react@18.0.0 instead of the pinned 17.0.1',
      undefined
    ]
  ])('rejects snapshot metadata with %s before replacement', async (_label, expectedMessage, dependencies) => {
    await expectInvalidUpdateStagingBeforeReplacement('', expectedMessage, 'button', (snapshot) => {
      if (dependencies) snapshot.dependencies = dependencies;
      else snapshot.devDependencies = ['react@18.0.0'];
    });
  });

  it('rejects registryDependencies outside the declared snapshot closure before replacement', async () => {
    await expectInvalidUpdateStagingBeforeReplacement(
      '',
      'Pinned registry item button requires source outside the fetched registry closure: missing-widget',
      'button',
      (snapshot) => {
        snapshot.registryDependencies = ['missing-widget'];
      }
    );
  });

  it.each([
    ['static import', 'import "./missing"'],
    ['static export', 'export * from "./missing"'],
    ['import type', 'type Missing = import("./missing").Missing'],
    ['import equals', 'import Missing = require("./missing")'],
    ['dynamic import', 'void import("./missing")'],
    ['require', 'declare const require: (id: string) => unknown\nrequire("./missing")'],
    ['require.resolve', 'declare const require: { resolve(id: string): string }\nrequire.resolve("./missing")'],
    ['parenthesized require', 'declare const require: (id: string) => unknown\n(require)("./missing")'],
    ['comma-sequence require', 'declare const require: (id: string) => unknown\n(0, require)("./missing")'],
    [
      'asserted require.resolve',
      'declare const require: { resolve(id: string): string }\n(require.resolve as (id: string) => string)("./missing")'
    ],
    ['non-null require', 'declare const require: (id: string) => unknown\nrequire!("./missing")'],
    [
      'satisfies require',
      'declare const require: (id: string) => unknown\n(require satisfies (id: string) => unknown)("./missing")'
    ]
  ])('rejects a missing %s dependency', async (_label, source) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(
      'relative import "./missing" does not resolve to an emitted normalized output'
    );
  });

  it.each([
    ['aliased require', 'declare const require: (id: string) => unknown\nconst load = require\nload("./missing")'],
    ['require.call', 'declare const require: (id: string) => unknown\nrequire.call(undefined, "./missing")'],
    ['require.bind', 'declare const require: (id: string) => unknown\nrequire.bind(undefined)("./missing")'],
    ['module.require', 'declare const module: { require(id: string): unknown }\nmodule.require("./missing")'],
    [
      'comma-sequence module.require',
      'declare const module: { require(id: string): unknown }\n;(0, module.require)("./missing")'
    ],
    ['computed module require', "declare const module: any\nmodule['re'+'quire']('./missing')"],
    ['destructured module require', "declare const module: any\nconst {'require': load}=module; load('./missing')"]
  ])('rejects unsupported %s access', async (_label, source) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(/indirect or unsupported require|CommonJS global module/u);
  });

  it.each([
    ['exports', 'declare const exports: object\nvoid exports'],
    ['__dirname', 'declare const __dirname: string\nvoid __dirname'],
    ['__filename', 'declare const __filename: string\nvoid __filename']
  ])('rejects the CommonJS %s global in generated ESM source', async (_label, source) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow('is not accepted in generated ESM source');
  });

  it('does not mistake a legitimate require declaration identifier for an indirect use', async () => {
    const fixture = await closureFixture([
      { path: 'normalized/src/entry.ts', source: 'declare function require(id: string): unknown\nexport {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure(fixture)).resolves.toBeDefined();
  });

  it.each([
    ['./target', 'normalized/src/target.ts'],
    ['./target', 'normalized/src/target.tsx'],
    ['./target.ts', 'normalized/src/target.ts'],
    ['./target.tsx', 'normalized/src/target.tsx'],
    ['./directory', 'normalized/src/directory/index.ts'],
    ['./directory', 'normalized/src/directory/index.tsx']
  ])('resolves %s against the emitted %s candidate', async (specifier, targetPath) => {
    const fixture = await closureFixture([
      { path: 'normalized/src/entry.ts', source: `import ${JSON.stringify(specifier)}` },
      { path: targetPath, source: 'export {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure(fixture)).resolves.toMatchObject({
      emittedPaths: expect.any(Set)
    });
  });

  it('collects every emitted path before resolving forward references', async () => {
    const fixture = await closureFixture([
      { path: 'normalized/src/entry.ts', source: 'import "./later"\n' },
      { path: 'normalized/src/later.ts', source: 'export {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure(fixture)).resolves.toBeDefined();
  });

  it('rejects symlinks and other non-file entries in generated inventory', async () => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: 'export {}\n' }]);
    await symlink('entry.ts', path.join(fixture.outputRoot, 'normalized', 'src', 'linked.ts'));

    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow('generated inventory contains a non-file entry');
  });

  it.each([
    ['traversal', '../../../outside'],
    ['absolute', '/outside-profile']
  ])('rejects a %s module specifier', async (_label, specifier) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: `import ${JSON.stringify(specifier)}\n` }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(/outside the generated profile|does not resolve/u);
  });

  it.each([
    ['root alias', '@/outside-profile', '@/outside-profile'],
    ['undeclared package', 'hostile-package/subpath', 'hostile-package']
  ])('rejects a %s outside the declared profile closure', async (_label, specifier, packageName) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: `import ${JSON.stringify(specifier)}\n` }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(
      packageName === '@/outside-profile' ? 'contains an unsafe package path' : `undeclared external import ${packageName}`
    );
  });

  it.each([
    ['dot segment', 'lucide-react/./package.json'],
    ['traversal segment', 'lucide-react/../../package.json'],
    ['backslash', 'lucide-react\\package.json'],
    ['encoded traversal', 'lucide-react/%2e%2e/package.json'],
    ['unaccepted pinned-package subpath', '@base-ui/react/unreviewed']
  ])('rejects an external module %s', async (_label, specifier) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: `import ${JSON.stringify(specifier)}\n` }]);
    await expect(
      assertGeneratedTreeClosure({
        ...fixture,
        allowedExternalPackages: ['lucide-react', '@base-ui/react']
      })
    ).rejects.toThrow(/unsafe package path|not accepted by the pinned profile/u);
  });

  it('accepts an explicitly pinned Base UI subpath', async () => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: 'import "@base-ui/react/button"\n' }]);
    await expect(assertGeneratedTreeClosure({ ...fixture, allowedExternalPackages: ['@base-ui/react'] })).resolves.toBeDefined();
  });

  it('validates string-literal module declarations as dependencies', async () => {
    const fixture = await closureFixture([
      { path: 'normalized/src/entry.ts', source: 'declare module "lucide-react/../../package.json" {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure({ ...fixture, allowedExternalPackages: ['lucide-react'] })).rejects.toThrow(
      'contains an unsafe package path'
    );
  });

  it.each([
    ['automatic JSX runtime', '/** @jsxRuntime automatic */\nexport {}', 'JSX runtime pragma'],
    ['custom JSX factory', '/** @jsx Hostile.createElement */\nexport {}', 'custom JSX factory pragmas'],
    ['custom JSX fragment factory', '/** @jsxFrag Hostile.Fragment */\nexport {}', 'custom JSX factory pragmas'],
    [
      'JSX import source',
      '/** @jsxImportSource lucide-react/../hostile */\nexport {}',
      'JSX import source pragmas are not accepted'
    ]
  ])('rejects an active %s pragma', async (_label, source, expectedMessage) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.tsx', source }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(expectedMessage);
  });

  it('does not treat ordinary comment text as an active JSX pragma', async () => {
    const fixture = await closureFixture([
      { path: 'normalized/src/entry.tsx', source: '// mentions @jsxRuntime automatic\nexport {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure(fixture)).resolves.toBeDefined();
  });

  it('binds React for fragment-only TSX source', () => {
    const normalized = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source: 'export const Probe = () => <></>\n'
    });
    expect(normalized.source).toContain('import * as React from "react"');
    expect(normalized.transformations).toContain('bind-react-namespace');
  });

  it('binds React for pre-existing forwardRef-only TSX source', () => {
    const normalized = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source: 'const Probe = React.forwardRef<HTMLDivElement, { label: string }>(() => null)\nexport { Probe }\n'
    });
    expect(normalized.source).toContain('import * as React from "react"');
    expect(normalized.transformations).toContain('bind-react-namespace');
  });

  it.each(['export type module = string', 'export interface exports { value: string }'])(
    'accepts harmless type-only CommonJS-name declarations: %s',
    async (source) => {
      const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source }]);
      await expect(assertGeneratedTreeClosure(fixture)).resolves.toBeDefined();
    }
  );

  it.each([
    ['reference path', '/// <reference path="./missing.ts" />', 'relative import "./missing.ts"'],
    ['escaping reference path', '/// <reference path="../../../outside.ts" />', 'does not resolve'],
    ['absolute reference path', '/// <reference path="/outside.ts" />', 'absolute module specifier'],
    ['unlisted type reference', '/// <reference types="node" />', 'is not pinned by the profile'],
    ['unsupported lib reference', '/// <reference lib="made-up-lib" />', 'is not supplied by pinned TypeScript'],
    ['AMD dependency', '/// <amd-dependency path="./missing" name="missing" />', 'relative import "./missing"']
  ])('rejects a missing or unpinned %s directive', async (_label, source, expectedMessage) => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source }]);
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow(expectedMessage);
  });

  it('accepts emitted path, pinned type, pinned lib, and emitted AMD directives', async () => {
    const fixture = await closureFixture([
      {
        path: 'normalized/src/entry.ts',
        source: [
          '/// <reference path="./target.ts" />',
          '/// <reference types="react" />',
          '/// <reference lib="es2020" />',
          '/// <amd-dependency path="./target" name="target" />',
          'export {}'
        ].join('\n')
      },
      { path: 'normalized/src/target.ts', source: 'export {}\n' }
    ]);
    await expect(assertGeneratedTreeClosure({ ...fixture, allowedTypeDirectives: ['react'] })).resolves.toBeDefined();
  });

  it('rejects duplicate emitted paths before resolving sources', async () => {
    const fixture = await closureFixture([{ path: 'normalized/src/entry.ts', source: 'export {}\n' }]);
    fixture.profile.items.push({ id: 'duplicate', normalized: [{ path: 'normalized/src/entry.ts' }] });
    await expect(assertGeneratedTreeClosure(fixture)).rejects.toThrow('duplicate normalized path');
  });

  it.each([
    [
      'missing normalized alias',
      'import { Calendar } from "@/registry/base-nova/ui/calendar"',
      'registry/base-nova/ui/button.tsx requires source outside the fetched registry closure: calendar'
    ],
    [
      'comma-sequence require',
      'declare const require: (id: string) => unknown\n;(0, require)("./missing")',
      'relative import "./missing" does not resolve to an emitted normalized output'
    ],
    [
      'aliased require',
      'declare const require: (id: string) => unknown\nconst load = require\nload("./missing")',
      'indirect or unsupported require binding use is not accepted'
    ],
    [
      'unpinned type directive',
      '/// <reference types="node" />',
      'type reference directive "node" is not pinned by the profile',
      'utils'
    ],
    ['unsafe pinned-package subpath', 'import "lucide-react/../../package.json"', 'contains an unsafe package path'],
    [
      'computed module require',
      "declare const module: any\nmodule['re'+'quire']('./missing')",
      'indirect or unsupported require binding use is not accepted'
    ],
    [
      'destructured module require',
      "declare const module: any\nconst {'require': load}=module; load('./missing')",
      'CommonJS global module is not accepted'
    ],
    ['CommonJS exports global', 'declare const exports: object\nvoid exports', 'CommonJS global exports is not accepted'],
    ['CommonJS dirname global', 'declare const __dirname: string\nvoid __dirname', 'CommonJS global __dirname is not accepted'],
    [
      'CommonJS filename global',
      'declare const __filename: string\nvoid __filename',
      'CommonJS global __filename is not accepted'
    ],
    ['unsafe module declaration', 'declare module "lucide-react/../../package.json" {}', 'contains an unsafe package path'],
    ['automatic JSX runtime pragma', '/** @jsxRuntime automatic */', 'JSX runtime pragma'],
    ['custom JSX factory pragma', '/** @jsx Hostile.createElement */', 'custom JSX factory pragmas'],
    ['custom JSX fragment pragma', '/** @jsxFrag Hostile.Fragment */', 'custom JSX factory pragmas'],
    [
      'unsafe JSX import source pragma',
      '/** @jsxImportSource lucide-react/../hostile */',
      'JSX import source pragmas are not accepted'
    ],
    ['AMD dependency directive', '/// <amd-dependency path="./missing" name="missing" />', 'AMD directives are not accepted'],
    ['AMD module directive', '/// <amd-module name="profile-probe" />', 'AMD directives are not accepted'],
    [
      'leading reference path before React binding injection',
      '/// <reference path="./missing.ts" />',
      'relative import "./missing.ts" does not resolve'
    ],
    [
      'type-only React namespace import',
      'import type * as React from "react"\nconst Probe = React.forwardRef<HTMLDivElement, { label: string }>(() => null)',
      'a type-only React binding cannot provide the classic React 17 runtime'
    ],
    ['no-default-lib directive', '/// <reference no-default-lib="true"/>', 'no-default-lib directives are not accepted']
  ])('rejects invalid fetched update staging for %s before replacement', async (_label, source, expectedMessage, id) => {
    await expectInvalidUpdateStagingBeforeReplacement(source, expectedMessage, id);
  });
});
