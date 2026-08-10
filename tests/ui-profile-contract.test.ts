import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { baseUiTreeSha256 } from '../packages/ui-profile/scripts/prepare-base-ui.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { canonicalJson, normalizeRegistrySource, sha256 } from '../packages/ui-profile/scripts/lib/profile.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repositoryRoot, 'packages/ui-profile');
const networkBlocker = path.join(repositoryRoot, 'tests/fixtures/ui-profile/block-network.mjs');

const expectedRegistryIds = [
  'button',
  'input',
  'field',
  'textarea',
  'checkbox',
  'switch',
  'select',
  'combobox',
  'toggle-group',
  'tabs',
  'accordion',
  'dropdown-menu',
  'dialog',
  'sheet',
  'popover',
  'tooltip',
  'alert',
  'badge',
  'spinner',
  'label',
  'separator',
  'input-group',
  'toggle',
  'utils'
];

const expectedNormalizedPaths = expectedRegistryIds
  .map((id) => (id === 'utils' ? 'normalized/src/lib/utils.ts' : `normalized/src/components/ui/${id}.tsx`))
  .concat('normalized/src/lib/spfx-theme.ts', 'normalized/src/lib/ui-root.tsx')
  .sort();

const expectedCompilerInputPaths = [
  'compat-consumers/react17-base-ui-jsx.d.ts',
  'compat-consumers/select-value.tsx',
  'compat/base-ui-1.6.0/id-ownership/contract.schema.json',
  'tailwind-profile.css',
  'scripts/build-tailwind-css.mjs',
  'scripts/verify-tailwind-css.mjs',
  'scripts/lib/compile-tailwind-css.mjs',
  'scripts/lib/scope-tailwind-css.mjs',
  'scripts/lib/block-network.mjs',
  'scripts/typecheck.mjs',
  'scripts/lib/generate-profile.mjs',
  'scripts/lib/profile-update-intake.mjs',
  'scripts/lib/shadcn-registry-worker.mjs',
  'scripts/lib/typecheck-generated-profile.mjs',
  'scripts/lib/generate-validated-profile.mjs',
  'scripts/lib/generation-transaction.mjs',
  'scripts/lib/replace-generated.mjs',
  'scripts/lib/generated-tree-closure.mjs',
  'scripts/verify-dependency-closure.mjs',
  'scripts/prepare-base-ui.mjs',
  'scripts/transform-base-ui-select-value.mjs',
  'scripts/transform-base-ui-popup-lifecycle.mjs',
  'scripts/transform-base-ui-id-ownership.mjs',
  'scripts/lib/preparation-lock.mjs',
  'tsconfig.base.json',
  'tsconfig.ts53.json',
  'tsconfig.ts58.json'
];

const expectedToolingDependencies = {
  '@base-ui/react': '1.6.0',
  'class-variance-authority': '0.7.1',
  clsx: '2.1.1',
  'lucide-react': '1.25.0',
  react: '17.0.1',
  'react-dom': '17.0.1',
  'tailwind-merge': '3.6.0'
};

const expectedRuntimeDependencies = Object.fromEntries(
  Object.entries(expectedToolingDependencies).filter(([name]) => name !== 'react' && name !== 'react-dom')
);

const expectedPeerDependencies = {
  react: '17.0.1',
  'react-dom': '17.0.1'
};

const expectedFloatingUiPins = {
  '@floating-ui/core': '1.7.5',
  '@floating-ui/dom': '1.7.6',
  '@floating-ui/react-dom': '2.1.8',
  '@floating-ui/utils': '0.2.11'
};

const expectedDevelopmentDependencies = {
  ...expectedFloatingUiPins,
  '@tailwindcss/cli': '4.3.3',
  '@types/react': '17.0.45',
  '@types/react-dom': '17.0.17',
  '@types/scheduler': '0.16.8',
  ajv: '8.20.0',
  postcss: '8.5.19',
  'postcss-selector-parser': '7.1.4',
  'postcss-value-parser': '4.2.0',
  react: '17.0.1',
  'react-dom': '17.0.1',
  shadcn: '4.16.1',
  tailwindcss: '4.3.3',
  'tw-animate-css': '1.4.0',
  typescript: '5.3.3',
  'typescript-5-8': 'npm:typescript@5.8.3'
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function readJson<T = Record<string, unknown>>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')) as T;
}

async function writeCanonicalJson(root: string, relativePath: string, value: unknown): Promise<void> {
  await writeFile(path.join(root, relativePath), canonicalJson(value));
}

async function copyProfile(): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'spfx-ui-profile-test-'));
  temporaryRoots.push(temporaryRoot);
  const copyRoot = path.join(temporaryRoot, 'packages', 'ui-profile');
  await mkdir(path.dirname(copyRoot), { recursive: true });
  await cp(profileRoot, copyRoot, {
    recursive: true,
    filter: (source) => {
      const segments = path.relative(profileRoot, source).split(path.sep);
      return !segments.some(
        (segment) =>
          ['node_modules', '.prepared', '.tsbuildinfo', '.DS_Store'].includes(segment) || segment.startsWith('.profile-')
      );
    }
  });
  await cp(path.join(repositoryRoot, 'package.json'), path.join(temporaryRoot, 'package.json'));
  await cp(path.join(repositoryRoot, 'package-lock.json'), path.join(temporaryRoot, 'package-lock.json'));
  await symlink(path.join(repositoryRoot, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir');
  return copyRoot;
}

function runOfflineVerifier(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['--import', networkBlocker, path.join(root, 'scripts/verify-profile.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' }
  });
}

function runOfflineRegenerator(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['--import', networkBlocker, path.join(root, 'scripts/regenerate-profile.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' }
  });
}

function runOfflineClosureVerifier(root: string, ...args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    ['--import', networkBlocker, path.join(root, 'scripts/verify-dependency-closure.mjs'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' }
    }
  );
}

function runTypecheckContract(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [path.join(root, 'scripts/typecheck.mjs'), 'typescript', '5.3.3', './tsconfig.ts53.json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' }
  });
}

function runBaseUiPreparation(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      'const implementation = await import(process.argv[1]); await implementation.prepareBaseUi();',
      pathToFileURL(path.join(root, 'scripts/prepare-base-ui.mjs')).href
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' }
    }
  );
}

function verifierMessage(result: ReturnType<typeof spawnSync>): string {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function filesUnder(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.prepared' ||
        entry.name === '.tsbuildinfo' ||
        entry.name === '.DS_Store' ||
        entry.name.startsWith('.profile-')
      )
        continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
    }
  }
  await visit(root);
  return result.sort();
}

async function treeDigests(root: string): Promise<Record<string, string>> {
  const entries = await Promise.all(
    (await filesUnder(root)).map(async (relativePath) => [
      relativePath,
      createHash('sha256')
        .update(await readFile(path.join(root, relativePath)))
        .digest('hex')
    ])
  );
  return Object.fromEntries(entries);
}

interface SnapshotReference {
  path: string;
  sha256: string;
}

interface NormalizedReference extends SnapshotReference {
  registrySourcePath: string;
  upstreamSha256: string;
  transformations: string[];
}

interface ProfileItem {
  id: string;
  raw: SnapshotReference;
  canonical: SnapshotReference;
  normalized: NormalizedReference[];
}

interface ProfileManifest {
  schemaVersion: number;
  generatorVersion: string;
  profileId: string;
  provenanceSha256: string;
  normalizationImplementationSha256: string;
  compilerInputs: SnapshotReference[];
  css: {
    artifact: SnapshotReference;
    scopeValue: string;
    scopeSelector: string;
    candidateCount: number;
    structuralMarkers: string[];
    conditionalClasses: string[];
    keyframeCount: number;
    containerCount: number;
    fallbackPropertyCount: number;
  };
  dependencyClosure: SnapshotReference;
  baseUiDeclarationTransform: SnapshotReference;
  baseUiPopupLifecycleTransform: SnapshotReference;
  baseUiIdOwnershipTransform: SnapshotReference;
  ownedSources: Array<{
    source: SnapshotReference;
    output: SnapshotReference;
    transformations: string[];
  }>;
  items: ProfileItem[];
}

interface RegistryFile {
  path: string;
  content: string;
}

interface RegistrySnapshot {
  name: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
}

interface ClosureEntry {
  name: string;
  version: string;
  integrity: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalPeers?: string[];
}

interface DependencyClosure {
  schemaVersion: number;
  profileId: string;
  policy: {
    allowForcedPeerResolution: boolean;
    allowLegacyPeerDeps: boolean;
  };
  productionRoots: string[];
  packages: ClosureEntry[];
}

async function rewriteSnapshot(
  root: string,
  profile: ProfileManifest,
  item: ProfileItem,
  raw: RegistrySnapshot,
  { bindProvenance = true } = {}
): Promise<void> {
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const canonicalBytes = Buffer.from(canonicalJson(raw));
  await writeFile(path.join(root, item.raw.path), rawBytes);
  await writeFile(path.join(root, item.canonical.path), canonicalBytes);
  item.raw.sha256 = sha256(rawBytes);
  item.canonical.sha256 = sha256(canonicalBytes);
  if (bindProvenance) {
    const provenance = await readJson<any>(root, 'provenance.json');
    provenance.registrySnapshots[item.id] = {
      rawSha256: item.raw.sha256,
      canonicalSha256: item.canonical.sha256
    };
    const provenanceBytes = Buffer.from(canonicalJson(provenance));
    await writeFile(path.join(root, 'provenance.json'), provenanceBytes);
    profile.provenanceSha256 = sha256(provenanceBytes);
  }
  await writeCanonicalJson(root, 'profile.json', profile);
}

describe('shared offline React 17 UI profile artifacts', () => {
  it('pins byte-hashed profile artifacts to LF working-tree bytes', async () => {
    expect(await readFile(path.join(repositoryRoot, '.gitattributes'), 'utf8')).toContain('packages/ui-profile/** text eol=lf\n');

    const tracked = spawnSync('git', ['ls-files', 'packages/ui-profile'], {
      cwd: repositoryRoot,
      encoding: 'utf8'
    });
    expect(tracked.status).toBe(0);
    const paths = tracked.stdout.trim().split('\n').filter(Boolean);
    const attributes = spawnSync('git', ['check-attr', 'eol', '--', ...paths], {
      cwd: repositoryRoot,
      encoding: 'utf8'
    });
    expect(attributes.status).toBe(0);
    expect(attributes.stdout.trim().split('\n')).toEqual(paths.map((file) => `${file}: eol: lf`));
  });

  it('publishes a stable runtime boundary with the exact owner-corrected dependency pins', async () => {
    const manifest = await readJson<Record<string, unknown>>(profileRoot, 'package.json');

    expect(manifest.private).toBe(true);
    expect(manifest.main).toBe('./dist/src/index.js');
    expect(manifest.types).toBe('./dist/src/index.d.ts');
    expect(manifest.exports).toMatchObject({
      '.': { types: './dist/src/index.d.ts', import: './dist/src/index.js' },
      './button': {
        types: './normalized/src/components/ui/button.tsx',
        import: './dist/normalized/src/components/ui/button.js'
      },
      './styles.css': './generated/tailwind-profile.css',
      './vite': { types: './vite.d.ts', import: './vite.mjs' },
      './spfx-webpack': './spfx-ui-webpack.cjs',
      './spfx-gulp': './spfx-ui-gulp.cjs'
    });
    expect(manifest.dependencies).toEqual(expectedRuntimeDependencies);
    expect(manifest.peerDependencies).toEqual(expectedPeerDependencies);
    expect(manifest.devDependencies).toEqual(expectedDevelopmentDependencies);
    expect(manifest.overrides).toBeUndefined();
    expect(manifest.resolutions).toBeUndefined();
  });

  it('pins the exact 24 registry IDs and React 17 declaration contract', async () => {
    const provenance = await readJson<any>(profileRoot, 'provenance.json');

    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.profileId).toBe('spfx-react17-base-nova-v1');
    expect(provenance.registryIds).toEqual(expectedRegistryIds);
    expect(new Set(provenance.registryIds).size).toBe(24);
    expect(provenance.registry).toMatchObject({
      preset: 'base-nova',
      toolSourceRevision: 'cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4',
      cli: {
        name: 'shadcn',
        version: '4.16.1',
        integrity: 'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ=='
      },
      mutableHostedResponses: true,
      hostedResponsesRevisionBound: false
    });
    expect(provenance.runtime).toEqual({
      react: '17.0.1',
      reactDom: '17.0.1',
      baseUi: '1.6.0',
      lucideReact: '1.25.0'
    });
    expect(provenance.reactTypeContract).toEqual({
      '@types/react': '17.0.45',
      '@types/react-dom': '17.0.17'
    });
    expect(provenance.dependencyResolutionPins).toEqual(expectedFloatingUiPins);
    expect(provenance.directProductionDependencies).toEqual(expectedToolingDependencies);
  });

  it('uses fail-closed schemas for exact identities, pins, digests, and inventories', async () => {
    const profileSchema = await readJson<any>(profileRoot, 'profile.schema.json');
    const provenanceSchema = await readJson<any>(profileRoot, 'provenance.schema.json');

    expect(profileSchema.additionalProperties).toBe(false);
    expect(profileSchema.required).toContain('$schema');
    expect(profileSchema.properties.profileId.const).toBe('spfx-react17-base-nova-v1');
    expect(profileSchema.properties.items).toMatchObject({ minItems: 24, maxItems: 24 });
    expect(profileSchema.properties.compilerInputs).toMatchObject({ minItems: 27, maxItems: 27, items: false });
    expect(profileSchema.properties.ownedSources).toMatchObject({ minItems: 2, maxItems: 2, items: false });
    expect(profileSchema.properties.items.uniqueItems).toBe(true);
    expect(profileSchema.$defs.sha256.pattern).toBe('^[a-f0-9]{64}$');
    expect(profileSchema.$defs.item.additionalProperties).toBe(false);
    expect(profileSchema.$defs.output.additionalProperties).toBe(false);

    expect(provenanceSchema.additionalProperties).toBe(false);
    expect(provenanceSchema.properties.registryIds.const).toEqual(expectedRegistryIds);
    expect(provenanceSchema.properties.runtime.additionalProperties).toBe(false);
    expect(provenanceSchema.properties.runtime.properties).toMatchObject({
      react: { const: '17.0.1' },
      reactDom: { const: '17.0.1' },
      baseUi: { const: '1.6.0' },
      lucideReact: { const: '1.25.0' }
    });
    expect(provenanceSchema.properties.reactTypeContract.const).toEqual({
      '@types/react': '17.0.45',
      '@types/react-dom': '17.0.17'
    });
    expect(provenanceSchema.properties.directProductionDependencies.additionalProperties).toBe(false);
  });

  it('binds every committed raw, canonical, normalized, provenance, and implementation byte by digest', async () => {
    const profileBytes = await readFile(path.join(profileRoot, 'profile.json'));
    const profile = JSON.parse(profileBytes.toString('utf8')) as ProfileManifest;
    const provenanceBytes = await readFile(path.join(profileRoot, 'provenance.json'));
    const implementationBytes = await readFile(path.join(profileRoot, 'scripts/lib/profile.mjs'));
    const dependencyClosureBytes = await readFile(path.join(profileRoot, profile.dependencyClosure.path));
    const baseUiDeclarationTransformBytes = await readFile(path.join(profileRoot, profile.baseUiDeclarationTransform.path));
    const baseUiPopupLifecycleTransformBytes = await readFile(path.join(profileRoot, profile.baseUiPopupLifecycleTransform.path));
    const baseUiIdOwnershipTransformBytes = await readFile(path.join(profileRoot, profile.baseUiIdOwnershipTransform.path));

    expect(profile.schemaVersion).toBe(1);
    expect(profile.profileId).toBe('spfx-react17-base-nova-v1');
    expect(profile.provenanceSha256).toBe(sha256(provenanceBytes));
    expect(profile.normalizationImplementationSha256).toBe(sha256(implementationBytes));
    expect(JSON.parse(provenanceBytes.toString('utf8')).normalization.implementationSha256).toBe(sha256(implementationBytes));
    expect(profile.compilerInputs.map((input) => input.path)).toEqual(expectedCompilerInputPaths);
    for (const input of profile.compilerInputs) {
      expect(input.sha256).toBe(sha256(await readFile(path.join(profileRoot, input.path))));
    }
    expect(profile.dependencyClosure).toEqual({
      path: 'dependency-closure.json',
      sha256: sha256(dependencyClosureBytes)
    });
    expect(profile.baseUiDeclarationTransform).toEqual({
      path: 'compat/base-ui-1.6.0/select-value/contract.json',
      sha256: sha256(baseUiDeclarationTransformBytes)
    });
    expect(profile.baseUiPopupLifecycleTransform).toEqual({
      path: 'compat/base-ui-1.6.0/popup-lifecycle/contract.json',
      sha256: sha256(baseUiPopupLifecycleTransformBytes)
    });
    expect(profile.baseUiIdOwnershipTransform).toEqual({
      path: 'compat/base-ui-1.6.0/id-ownership/contract.json',
      sha256: sha256(baseUiIdOwnershipTransformBytes)
    });
    expect(profile.ownedSources).toHaveLength(2);
    expect(profile.ownedSources.map(({ source, output }) => [source.path, output.path])).toEqual([
      ['owned/src/lib/spfx-theme.ts', 'normalized/src/lib/spfx-theme.ts'],
      ['owned/src/lib/ui-root.tsx', 'normalized/src/lib/ui-root.tsx']
    ]);
    for (const ownedHostSource of profile.ownedSources) {
      expect(ownedHostSource.transformations).toEqual(['copy-owned-host-contract']);
      const ownedHostSourceBytes = await readFile(path.join(profileRoot, ownedHostSource.source.path));
      const ownedHostOutputBytes = await readFile(path.join(profileRoot, ownedHostSource.output.path));
      expect(ownedHostSource.source.sha256).toBe(sha256(ownedHostSourceBytes));
      expect(ownedHostSource.output.sha256).toBe(sha256(ownedHostOutputBytes));
      expect(ownedHostOutputBytes.equals(ownedHostSourceBytes)).toBe(true);
    }
    expect(profile.items.map((item) => item.id)).toEqual(expectedRegistryIds);

    const outputPaths = new Set<string>(profile.ownedSources.map(({ output }) => output.path));
    for (const item of profile.items) {
      const rawBytes = await readFile(path.join(profileRoot, item.raw.path));
      const canonicalBytes = await readFile(path.join(profileRoot, item.canonical.path));
      const raw = JSON.parse(rawBytes.toString('utf8')) as RegistrySnapshot;
      expect(item.raw.sha256).toBe(sha256(rawBytes));
      expect(item.canonical.sha256).toBe(sha256(canonicalBytes));
      expect(canonicalBytes.toString('utf8')).toBe(canonicalJson(raw));
      expect(raw.name).toBe(item.id);

      for (const output of item.normalized) {
        expect(outputPaths.has(output.path), `duplicate normalized path ${output.path}`).toBe(false);
        outputPaths.add(output.path);
        const registryFile = raw.files.find((file) => file.path === output.registrySourcePath);
        expect(registryFile, `${item.id} missing ${output.registrySourcePath}`).toBeDefined();
        expect(output.upstreamSha256).toBe(sha256(Buffer.from(registryFile!.content)));
        const normalizedBytes = await readFile(path.join(profileRoot, output.path));
        expect(output.sha256).toBe(sha256(normalizedBytes));
      }
    }
    expect([...outputPaths].sort()).toEqual(expectedNormalizedPaths);
  });

  it('forces every accepted Base UI portal surface through the generated owned host', async () => {
    const expectedPortalCounts = new Map([
      ['combobox', 1],
      ['dialog', 1],
      ['dropdown-menu', 2],
      ['popover', 1],
      ['select', 1],
      ['sheet', 1],
      ['tooltip', 1]
    ]);
    const expectedBridgeCounts = new Map([
      ['dialog', 1],
      ['sheet', 1]
    ]);
    const expectedPortalRenderCounts = new Map([
      ['dialog', 1],
      ['dropdown-menu', 1],
      ['sheet', 1]
    ]);
    const expectedPopupNames = new Map([
      ['combobox', 'ComboboxContent'],
      ['dialog', 'DialogContent'],
      ['dropdown-menu', 'DropdownMenuContent'],
      ['popover', 'PopoverContent'],
      ['select', 'SelectContent'],
      ['sheet', 'SheetContent'],
      ['tooltip', 'TooltipContent']
    ]);
    const expectedPrimitiveNames = new Map([
      ['combobox', 'ComboboxPrimitive'],
      ['dialog', 'DialogPrimitive'],
      ['dropdown-menu', 'MenuPrimitive'],
      ['popover', 'PopoverPrimitive'],
      ['select', 'SelectPrimitive'],
      ['sheet', 'SheetPrimitive'],
      ['tooltip', 'TooltipPrimitive']
    ]);
    for (const [component, expectedCount] of expectedPortalCounts) {
      const source = await readFile(path.join(profileRoot, `normalized/src/components/ui/${component}.tsx`), 'utf8');
      const primitiveName = expectedPrimitiveNames.get(component);
      expect(source).toContain('useSpfxUiOwnedRender');
      expect(source).toContain('useSpfxUiPortalHost');
      expect(source).toContain('useSpfxUiPortalId');
      expect(source.match(/<[A-Za-z]+Primitive\.Portal(?=[\s>])/gu)).toHaveLength(expectedCount);
      expect(source.match(new RegExp(`<${primitiveName}\\.Portal(?=[\\s>])`, 'gu'))).toHaveLength(expectedCount);
      expect(source.match(new RegExp(`<${primitiveName}\\.Popup(?=[\\s>])`, 'gu'))).toHaveLength(1);
      expect(source.match(/container=\{useSpfxUiPortalHost\(\)\}/gu)).toHaveLength(expectedCount);
      expect(source.match(/id=\{useSpfxUiPortalId\(props\.id\)\}/gu)).toHaveLength(expectedCount);
      expect(source.match(/<[A-Za-z]+Portal id=\{props\.id\}>/gu) ?? []).toHaveLength(expectedBridgeCounts.get(component) ?? 0);
      expect(source.match(/render=\{useSpfxUiOwnedPortalRender\(/gu) ?? []).toHaveLength(
        expectedPortalRenderCounts.get(component) ?? 0
      );
      expect(source).toContain(`render={useSpfxUiOwnedRender(props.render, props.id, "${expectedPopupNames.get(component)}")}`);
      expect(source).not.toContain('document.body');
      expect(source).not.toMatch(/id=\{"?mui-/u);
    }
  });

  it('fails closed instead of allowing Select and Combobox root ID fallbacks', async () => {
    for (const component of ['select', 'combobox']) {
      const source = await readFile(path.join(profileRoot, `normalized/src/components/ui/${component}.tsx`), 'utf8');
      const publicName = component === 'select' ? 'Select' : 'Combobox';
      expect(source).toContain('import { useSpfxUiRequiredId } from "../../lib/ui-root"');
      expect(source).toContain(`useSpfxUiRequiredId(id, "${publicName}.Root")`);
      expect(source).not.toContain(`const ${publicName} = ${publicName}Primitive.Root`);
    }
  });

  it('owns every semantic CSS variable on both root surfaces through one theme contract', async () => {
    const cssEntry = await readFile(path.join(profileRoot, 'tailwind-profile.css'), 'utf8');
    const rootSource = await readFile(path.join(profileRoot, 'normalized/src/lib/ui-root.tsx'), 'utf8');
    const cssVariables = new Set(cssEntry.match(/--spfx-ui-[a-z0-9-]+/gu) ?? []);
    const hostVariables = new Set(rootSource.match(/--spfx-ui-[a-z0-9-]+/gu) ?? []);
    expect(cssVariables.size).toBeGreaterThan(0);
    expect(hostVariables).toEqual(cssVariables);
  });

  it('records a closed, integrity-pinned production dependency graph with one React 17 runtime', async () => {
    const closure = await readJson<DependencyClosure>(profileRoot, 'dependency-closure.json');

    expect(closure.schemaVersion).toBe(1);
    expect(closure.profileId).toBe('spfx-react17-base-nova-v1');
    expect(closure.policy).toEqual({
      allowForcedPeerResolution: false,
      allowLegacyPeerDeps: false
    });
    expect(closure.productionRoots).toEqual(Object.keys(expectedToolingDependencies));
    expect(closure.packages).toHaveLength(19);

    const packages = new Map(closure.packages.map((entry) => [entry.name, entry]));
    expect(packages.size).toBe(closure.packages.length);
    expect(packages.get('react')?.version).toBe('17.0.1');
    expect(packages.get('react-dom')?.version).toBe('17.0.1');
    expect(packages.get('@base-ui/react')?.version).toBe('1.6.0');
    expect(packages.get('@base-ui/utils')?.version).toBe('0.3.1');
    expect(packages.get('use-sync-external-store')?.version).toBe('1.6.0');
    expect([...packages].filter(([name]) => name === 'react')).toHaveLength(1);
    expect([...packages].filter(([name]) => name === 'react-dom')).toHaveLength(1);

    for (const entry of closure.packages) {
      expect(entry.integrity, entry.name).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
      for (const dependency of Object.keys(entry.dependencies)) {
        expect(packages.has(dependency), `${entry.name} -> ${dependency}`).toBe(true);
      }
    }
  });

  it('keeps Floating UI pins profile-local without changing the root dependency contract', async () => {
    const rootManifest = await readJson<any>(repositoryRoot, 'package.json');
    const lock = await readJson<any>(repositoryRoot, 'package-lock.json');

    for (const name of Object.keys(expectedFloatingUiPins)) {
      expect(rootManifest.devDependencies[name]).toBeUndefined();
    }
    for (const [name, version] of Object.entries(expectedFloatingUiPins)) {
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(version);
      expect(lock.packages[`packages/ui-profile/node_modules/${name}`], `${name} must not form a second closure`).toBeUndefined();
    }
  });
});

describe('offline profile verifier', () => {
  it('passes under a process-level network blocker without changing committed profile bytes', async () => {
    const before = await treeDigests(profileRoot);
    const result = runOfflineVerifier(profileRoot);
    const after = await treeDigests(profileRoot);

    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(result.status, verifierMessage(result)).toBe(0);
    expect(result.stdout).toContain('Verified spfx-react17-base-nova-v1: 24 registry payloads');
    expect(after).toEqual(before);
  });

  it('rejects transitive Tailwind compiler lock drift before verification or generation', async () => {
    const root = await copyProfile();
    const temporaryRepositoryRoot = path.resolve(root, '..', '..');
    const lock = await readJson<any>(temporaryRepositoryRoot, 'package-lock.json');
    lock.packages['node_modules/magic-string'].version = '0.30.22';
    await writeCanonicalJson(temporaryRepositoryRoot, 'package-lock.json', lock);
    const before = await treeDigests(root);

    for (const result of [runOfflineVerifier(root), runOfflineRegenerator(root)]) {
      expect(result.status).not.toBe(0);
      expect(verifierMessage(result)).toContain('Tailwind compiler dependency closure differs from provenance');
      expect(await treeDigests(root)).toEqual(before);
    }
  });

  it('verifies the accepted production closure offline and rejects forced-peer policy drift', async () => {
    const real = runOfflineClosureVerifier(profileRoot);
    expect(verifierMessage(real)).not.toContain('attempted network access');
    expect(real.status, verifierMessage(real)).toBe(0);
    expect(real.stdout).toContain('Verified production dependency closure: 19 packages, React 17.0.1, React DOM 17.0.1');

    const root = await copyProfile();
    const closure = await readJson<DependencyClosure>(root, 'dependency-closure.json');
    closure.policy.allowForcedPeerResolution = true;
    await writeCanonicalJson(root, 'dependency-closure.json', closure);
    const mutated = runOfflineClosureVerifier(root, '--manifest-only');
    expect(mutated.status).not.toBe(0);
    expect(verifierMessage(mutated)).toContain('Forced peer resolution must remain disabled');
  });

  it('inspects the installed dependency tree instead of trusting only the lockfile', async () => {
    const root = await copyProfile();
    const extraneousRoot = path.join(root, 'node_modules', 'profile-extraneous');
    await mkdir(extraneousRoot, { recursive: true });
    await writeCanonicalJson(extraneousRoot, 'package.json', {
      name: 'profile-extraneous',
      version: '1.0.0'
    });

    const result = runOfflineClosureVerifier(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toMatch(/extraneous|dependency tree/i);
  });

  it('rejects an incomplete production-root inventory in verification and generation', async () => {
    const root = await copyProfile();
    const closure = await readJson<DependencyClosure>(root, 'dependency-closure.json');
    closure.productionRoots = closure.productionRoots.filter((dependency) => dependency !== 'lucide-react');
    closure.packages = closure.packages.filter((entry) => entry.name !== 'lucide-react');
    await writeCanonicalJson(root, 'dependency-closure.json', closure);
    const before = await treeDigests(root);

    const verified = runOfflineClosureVerifier(root, '--manifest-only');
    expect(verified.status).not.toBe(0);
    expect(verifierMessage(verified)).toContain('Production dependency roots differ from provenance');

    const regenerated = runOfflineRegenerator(root);
    expect(regenerated.status).not.toBe(0);
    expect(verifierMessage(regenerated)).toContain('Production dependency roots differ from provenance');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects forced dependency resolution in both the profile and repository manifests', async () => {
    for (const [scope, relativePath, expectedMessage] of [
      ['profile', 'package.json', 'UI profile manifest contains forced dependency resolution'],
      ['repository', '../../package.json', 'Repository root manifest contains forced dependency resolution']
    ] as const) {
      for (const key of ['overrides', 'resolutions'] as const) {
        const root = await copyProfile();
        const manifest = await readJson<any>(root, relativePath);
        manifest[key] = { react: '17.0.1' };
        await writeCanonicalJson(root, relativePath, manifest);

        const result = runOfflineClosureVerifier(root, '--manifest-only');
        expect(result.status, `${scope} ${key} unexpectedly passed`).not.toBe(0);
        expect(verifierMessage(result)).toContain(expectedMessage);
      }
    }
  });

  it('keeps network capability isolated to the explicit updater', async () => {
    const manifest = await readJson<any>(profileRoot, 'package.json');
    expect(manifest.scripts['profile:update:network']).toContain('--allow-network');
    for (const [name, command] of Object.entries<string>(manifest.scripts)) {
      if (name === 'profile:update:network') continue;
      expect(command, name).not.toMatch(/https?:|\b(?:curl|wget|npx)\b/);
    }

    const result = spawnSync(
      process.execPath,
      ['--import', networkBlocker, path.join(profileRoot, 'scripts/update-profile.mjs')],
      {
        cwd: profileRoot,
        encoding: 'utf8'
      }
    );
    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('explicit --allow-network flag');
    expect(verifierMessage(result)).not.toContain('attempted network access');
  });

  it('rejects direct and transitive updater aliases outside the pinned script contract', async () => {
    for (const scripts of [
      { audit: 'npm run profile:update:network' },
      { audit: 'npm run profile:update:alias', 'profile:update:alias': 'npm run profile:update:network' },
      { audit: 'node ./scripts/update-profile.mjs --allow-network' }
    ]) {
      const root = await copyProfile();
      const manifest = await readJson<any>(root, 'package.json');
      Object.assign(manifest.scripts, scripts);
      await writeCanonicalJson(root, 'package.json', manifest);

      const result = runOfflineVerifier(root);
      expect(result.status).not.toBe(0);
      expect(verifierMessage(result)).toContain('Package scripts differs from the pinned profile');
    }
  });

  it('fails closed when a committed snapshot disappears or normalized bytes drift', async () => {
    const missingRoot = await copyProfile();
    const missingProfile = await readJson<ProfileManifest>(missingRoot, 'profile.json');
    await unlink(path.join(missingRoot, missingProfile.items[0].raw.path));
    const missing = runOfflineVerifier(missingRoot);
    expect(missing.status).not.toBe(0);
    expect(verifierMessage(missing)).toMatch(/ENOENT|no such file/i);

    const driftRoot = await copyProfile();
    const driftProfile = await readJson<ProfileManifest>(driftRoot, 'profile.json');
    await writeFile(path.join(driftRoot, driftProfile.items[0].normalized[0].path), '\n// unreviewed drift\n', {
      flag: 'a'
    });
    const drift = runOfflineVerifier(driftRoot);
    expect(drift.status).not.toBe(0);
    expect(verifierMessage(drift)).toMatch(/not reproducible|digest differs/i);
  });

  it.each(['snapshots/raw', 'snapshots/canonical'])('rejects non-file entries in the %s inventory', async (inventory) => {
    const root = await copyProfile();
    await symlink('button.json', path.join(root, inventory, 'linked.json'));

    const result = runOfflineVerifier(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('snapshot inventory contains a non-file entry');
  });

  it.each(expectedCompilerInputPaths)('fails closed when compiler input %s drifts', async (inputPath) => {
    const root = await copyProfile();
    await writeFile(path.join(root, inputPath), '\n// unreviewed compiler drift\n', { flag: 'a' });

    const result = runOfflineVerifier(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain(`Compiler input digest differs for ${inputPath}`);
  });

  it('rejects forced dependency overrides and excluded registry dependencies', async () => {
    const forcedRoot = await copyProfile();
    const forcedManifest = await readJson<any>(forcedRoot, 'package.json');
    forcedManifest.overrides = { react: '19.0.0' };
    await writeCanonicalJson(forcedRoot, 'package.json', forcedManifest);
    const forced = runOfflineVerifier(forcedRoot);
    expect(forced.status).not.toBe(0);
    expect(verifierMessage(forced)).toContain('Forced dependency overrides are not accepted');

    const excludedRoot = await copyProfile();
    const excludedProfile = await readJson<ProfileManifest>(excludedRoot, 'profile.json');
    const excludedItem = excludedProfile.items[0];
    const excludedRaw = await readJson<RegistrySnapshot>(excludedRoot, excludedItem.raw.path);
    excludedRaw.dependencies = [...(excludedRaw.dependencies ?? []), 'cmdk@1.1.1'];
    await rewriteSnapshot(excludedRoot, excludedProfile, excludedItem, excludedRaw);
    const excluded = runOfflineVerifier(excludedRoot);
    expect(excluded.status).not.toBe(0);
    expect(verifierMessage(excluded)).toContain('uses excluded dependency cmdk');
  });

  it('rejects committed registry dependencies outside the pinned snapshot closure', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items[0];
    const raw = await readJson<RegistrySnapshot>(root, item.raw.path);
    raw.registryDependencies = [...(raw.registryDependencies ?? []), 'missing-widget'];
    await rewriteSnapshot(root, profile, item, raw);

    const result = runOfflineVerifier(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain(
      'Pinned registry item button requires source outside the fetched registry closure: missing-widget'
    );
  });

  it('rejects snapshot bytes whose manifest digests are updated without rebinding provenance', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'button')!;
    const raw = await readJson<RegistrySnapshot>(root, item.raw.path);
    raw.files[0].content += '\n';
    await rewriteSnapshot(root, profile, item, raw, { bindProvenance: false });

    const result = runOfflineVerifier(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('button: raw snapshot differs from provenance');
  });

  it('rejects an undeclared external import even when every affected digest is honestly updated', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.normalized.some((output) => output.path.endsWith('.tsx')))!;
    const raw = await readJson<RegistrySnapshot>(root, item.raw.path);
    const output = item.normalized.find((candidate) => candidate.path.endsWith('.tsx'))!;
    const registryFile = raw.files.find((candidate) => candidate.path === output.registrySourcePath)!;
    registryFile.content = `import { hostile } from "hostile-package"\n${registryFile.content}`;
    const rerun = normalizeRegistrySource({ source: registryFile.content, registrySourcePath: registryFile.path });
    output.upstreamSha256 = sha256(Buffer.from(registryFile.content));
    output.sha256 = sha256(Buffer.from(rerun.source));
    output.transformations = rerun.transformations;
    await writeFile(path.join(root, output.path), rerun.source);
    await rewriteSnapshot(root, profile, item, raw);

    const result = runOfflineVerifier(root);
    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain(`undeclared external import hostile-package`);
  });

  it('rejects a normalized relative import that has no emitted profile target', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'button')!;
    const raw = await readJson<RegistrySnapshot>(root, item.raw.path);
    const output = item.normalized[0];
    const registryFile = raw.files.find((candidate) => candidate.path === output.registrySourcePath)!;
    registryFile.content = `import { Calendar } from "@/registry/base-nova/ui/calendar"\n${registryFile.content}`;
    const rerun = normalizeRegistrySource({ source: registryFile.content, registrySourcePath: registryFile.path });
    output.upstreamSha256 = sha256(Buffer.from(registryFile.content));
    output.sha256 = sha256(Buffer.from(rerun.source));
    output.transformations = rerun.transformations;
    await writeFile(path.join(root, output.path), rerun.source);
    await rewriteSnapshot(root, profile, item, raw);

    const result = runOfflineVerifier(root);
    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('relative import "./calendar" does not resolve to an emitted normalized output');
  });

  it('rejects unbound raw snapshot bytes before offline regeneration writes staged output', async () => {
    const root = await copyProfile();
    const rawPath = path.join(root, 'snapshots/raw/button.json');
    const raw = await readJson<RegistrySnapshot>(root, 'snapshots/raw/button.json');
    raw.files[0].content += '\n// valid but unbound source drift\n';
    await writeFile(rawPath, JSON.stringify(raw));
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('Raw registry snapshot digest differs for button');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects canonical snapshot provenance drift before offline replacement', async () => {
    const root = await copyProfile();
    const provenance = await readJson<any>(root, 'provenance.json');
    provenance.registrySnapshots.button.canonicalSha256 = '0'.repeat(64);
    await writeCanonicalJson(root, 'provenance.json', provenance);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('Canonical registry snapshot digest differs for button');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('preserves every committed generated byte when offline regeneration produces an open module closure', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'button')!;
    const raw = await readJson<RegistrySnapshot>(root, 'snapshots/raw/button.json');
    raw.files[0].content = `import { Calendar } from "@/registry/base-nova/ui/calendar"\n${raw.files[0].content}`;
    await rewriteSnapshot(root, profile, item, raw);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain(
      'registry/base-nova/ui/button.tsx requires source outside the fetched registry closure: calendar'
    );
    expect(await treeDigests(root)).toEqual(before);
  });

  it('semantically compiles staged normalized sources with both pinned TypeScript versions offline', async () => {
    const root = await copyProfile();
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status, verifierMessage(result)).toBe(0);
    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(result.stdout).toContain('Validated staged normalized sources with TypeScript 5.3.3');
    expect(result.stdout).toContain('Validated staged normalized sources with TypeScript 5.8.3');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects ordinary staged TypeScript drift before replacement and preserves the installed tree', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'utils')!;
    const raw = await readJson<RegistrySnapshot>(root, 'snapshots/raw/utils.json');
    raw.files[0].content += '\nexport const __profileTypeDrift: string = 42\n';
    await rewriteSnapshot(root, profile, item, raw);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(verifierMessage(result)).toContain('Staged profile failed semantic compilation with TypeScript 5.3.3');
    expect(verifierMessage(result)).toMatch(/TS2322|Type 'number' is not assignable to type 'string'/u);
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects staged Base UI prop drift before replacement and preserves the installed tree', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'button')!;
    const raw = await readJson<RegistrySnapshot>(root, 'snapshots/raw/button.json');
    const button = raw.files.find((file) => file.path.endsWith('/button.tsx'))!;
    button.content += '\nconst __BaseUiPropDrift = () => <ButtonPrimitive __profileInvalidBaseUiProp />\n';
    await rewriteSnapshot(root, profile, item, raw);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(verifierMessage(result)).toContain('Staged profile failed semantic compilation with TypeScript 5.3.3');
    expect(verifierMessage(result)).toContain('__profileInvalidBaseUiProp');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('compiles the SelectValue compatibility probe against staged normalized output', async () => {
    const root = await copyProfile();
    const profile = await readJson<ProfileManifest>(root, 'profile.json');
    const item = profile.items.find((candidate) => candidate.id === 'select')!;
    const raw = await readJson<RegistrySnapshot>(root, 'snapshots/raw/select.json');
    const select = raw.files.find((file) => file.path.endsWith('/select.tsx'))!;
    const original = '}: SelectPrimitive.Value.Props)';
    expect(select.content).toContain(original);
    select.content = select.content.replace(original, '}: Omit<SelectPrimitive.Value.Props, "placeholder">)');
    await rewriteSnapshot(root, profile, item, raw);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(verifierMessage(result)).toContain('Staged profile failed semantic compilation with TypeScript 5.3.3');
    expect(verifierMessage(result)).toContain('placeholder');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects a shadowed wrong-version compiler before replacement and preserves the installed tree', async () => {
    const root = await copyProfile();
    const shadowRoot = path.join(root, 'node_modules', 'typescript-5-8');
    await mkdir(path.join(shadowRoot, 'lib'), { recursive: true });
    await writeCanonicalJson(root, 'node_modules/typescript-5-8/package.json', { name: 'typescript', version: '9.9.9' });
    await writeFile(path.join(shadowRoot, 'lib/tsc.js'), 'process.exit(0)\n');
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).not.toContain('attempted network access');
    expect(verifierMessage(result)).toContain('Resolved compiler package typescript@9.9.9 instead of pinned TypeScript 5.8.3');
    expect(result.stdout).toContain('Validated staged normalized sources with TypeScript 5.3.3');
    expect(result.stdout).not.toContain('Validated staged normalized sources with TypeScript 5.8.3');
    expect(await treeDigests(root)).toEqual(before);
  });

  it.each([
    ['@types/react', '17.0.45'],
    ['@types/react-dom', '17.0.17'],
    ['@types/scheduler', '0.16.8']
  ])('rejects a shadowed wrong-version %s declaration package', async (packageName, pinnedVersion) => {
    const root = await copyProfile();
    const shadowRoot = path.join(root, 'node_modules', packageName);
    await mkdir(shadowRoot, { recursive: true });
    await writeCanonicalJson(root, `node_modules/${packageName}/package.json`, {
      name: packageName,
      version: '99.0.0',
      types: 'index.d.ts'
    });
    await writeFile(path.join(shadowRoot, 'index.d.ts'), 'export {}\n');
    const before = await treeDigests(root);

    const result = runTypecheckContract(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain(
      `Resolved type package ${packageName}@99.0.0 instead of pinned ${packageName}@${pinnedVersion}`
    );
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects a same-version shadowed scheduler declaration root', async () => {
    const root = await copyProfile();
    const shadowRoot = path.join(root, 'node_modules/@types/scheduler');
    await mkdir(shadowRoot, { recursive: true });
    await writeCanonicalJson(root, 'node_modules/@types/scheduler/package.json', {
      name: '@types/scheduler',
      version: '0.16.8',
      types: 'index.d.ts'
    });
    await writeFile(path.join(shadowRoot, 'index.d.ts'), 'export {}\n');
    await writeFile(path.join(shadowRoot, 'tracing.d.ts'), 'export {}\n');

    const result = runTypecheckContract(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('@types/scheduler: resolved type root differs from the lockfile package root');
  });

  it('rejects a drifted profile schema before replacement and preserves the installed tree', async () => {
    const root = await copyProfile();
    const schema = await readJson<any>(root, 'profile.schema.json');
    schema.title = `${schema.title} drift`;
    await writeCanonicalJson(root, 'profile.schema.json', schema);
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('profile.schema.json identity differs');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects an invalid staged profile manifest before replacement', async () => {
    const root = await copyProfile();
    const generatorPath = path.join(root, 'scripts/lib/generate-profile.mjs');
    const generator = await readFile(generatorPath, 'utf8');
    await writeFile(
      generatorPath,
      generator.replace("$schema: './profile.schema.json',", "$schema: './profile.schema.json', unexpected: true,")
    );
    const before = await treeDigests(root);

    const result = runOfflineRegenerator(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('profile.json schema errors');
    expect(await treeDigests(root)).toEqual(before);
  });

  it('rejects a same-version shadowed Base UI installation before staging', async () => {
    const root = await copyProfile();
    const shadowRoot = path.join(root, 'node_modules/@base-ui/react');
    await mkdir(shadowRoot, { recursive: true });
    await writeCanonicalJson(root, 'node_modules/@base-ui/react/package.json', {
      name: '@base-ui/react',
      version: '1.6.0',
      exports: { './package.json': './package.json' }
    });

    const result = runBaseUiPreparation(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('Resolved Base UI root differs from the lockfile package root');
  });

  it('hashes the complete Base UI file inventory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'spfx-base-ui-tree-'));
    temporaryRoots.push(root);
    await mkdir(path.join(root, 'nested'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}\n');
    await writeFile(path.join(root, 'nested', 'declaration.d.ts'), 'export {};\n');
    const baseline = await baseUiTreeSha256(root);

    await writeFile(path.join(root, 'nested', 'declaration.d.ts'), 'export type Changed = true;\n');
    expect(await baseUiTreeSha256(root)).not.toBe(baseline);
    await writeFile(path.join(root, 'nested', 'declaration.d.ts'), 'export {};\n');
    await writeFile(path.join(root, 'extra.txt'), 'extra\n');
    expect(await baseUiTreeSha256(root)).not.toBe(baseline);
    await unlink(path.join(root, 'extra.txt'));
    await unlink(path.join(root, 'nested', 'declaration.d.ts'));
    expect(await baseUiTreeSha256(root)).not.toBe(baseline);
  });

  it('rejects Base UI lock identity drift before staging', async () => {
    const root = await copyProfile();
    const temporaryRepositoryRoot = path.resolve(root, '..', '..');
    const lock = await readJson<any>(temporaryRepositoryRoot, 'package-lock.json');
    lock.packages['node_modules/@base-ui/react'].integrity = 'sha512-tampered';
    await writeCanonicalJson(temporaryRepositoryRoot, 'package-lock.json', lock);
    const before = await treeDigests(root);

    const result = runBaseUiPreparation(root);

    expect(result.status).not.toBe(0);
    expect(verifierMessage(result)).toContain('Base UI lockfile identity differs from the pinned preparation contract');
    expect(await treeDigests(root)).toEqual(before);
  });
});
