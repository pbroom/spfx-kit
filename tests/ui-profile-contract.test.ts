import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
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
  .sort();

const expectedToolingDependencies = {
  '@base-ui/react': '1.6.0',
  'class-variance-authority': '0.7.1',
  clsx: '2.1.1',
  'lucide-react': '1.25.0',
  react: '17.0.1',
  'react-dom': '17.0.1',
  'tailwind-merge': '3.6.0'
};

const expectedFloatingUiPins = {
  '@floating-ui/core': '1.7.5',
  '@floating-ui/dom': '1.7.6',
  '@floating-ui/react-dom': '2.1.8',
  '@floating-ui/utils': '0.2.11'
};

const expectedDevelopmentDependencies = {
  ...expectedToolingDependencies,
  ...expectedFloatingUiPins,
  '@types/react': '17.0.93',
  '@types/react-dom': '17.0.17',
  '@types/scheduler': '0.16.8',
  ajv: '8.20.0',
  shadcn: '4.16.1',
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
  const copyRoot = path.join(temporaryRoot, 'ui-profile');
  await cp(profileRoot, copyRoot, {
    recursive: true,
    filter: (source) => {
      const segments = path.relative(profileRoot, source).split(path.sep);
      return !segments.some(
        (segment) => ['node_modules', '.prepared', '.tsbuildinfo'].includes(segment) || segment.startsWith('.profile-')
      );
    }
  });
  await symlink(path.join(profileRoot, 'node_modules'), path.join(copyRoot, 'node_modules'), 'dir');
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
  dependencyClosure: SnapshotReference;
  baseUiDeclarationTransform: SnapshotReference;
  baseUiPopupLifecycleTransform: SnapshotReference;
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

async function rewriteSnapshot(root: string, profile: ProfileManifest, item: ProfileItem, raw: RegistrySnapshot): Promise<void> {
  const rawBytes = Buffer.from(JSON.stringify(raw));
  const canonicalBytes = Buffer.from(canonicalJson(raw));
  await writeFile(path.join(root, item.raw.path), rawBytes);
  await writeFile(path.join(root, item.canonical.path), canonicalBytes);
  item.raw.sha256 = sha256(rawBytes);
  item.canonical.sha256 = sha256(canonicalBytes);
  await writeCanonicalJson(root, 'profile.json', profile);
}

describe('private offline React 17 UI profile artifacts', () => {
  it('is a non-runtime package with the exact owner-corrected dependency pins', async () => {
    const manifest = await readJson<Record<string, unknown>>(profileRoot, 'package.json');

    expect(manifest.private).toBe(true);
    expect(manifest.main).toBeUndefined();
    expect(manifest.exports).toBeUndefined();
    expect(manifest.types).toBeUndefined();
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.devDependencies).toEqual(expectedDevelopmentDependencies);
    expect(manifest.overrides).toBeUndefined();
    expect(manifest.resolutions).toBeUndefined();
  });

  it('pins the exact 24 registry IDs and owner-corrected compiler identities', async () => {
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
    expect(provenance.hostTypeContract).toEqual({
      '@types/react': '17.0.45',
      '@types/react-dom': '17.0.17'
    });
    expect(provenance.isolatedCompilerTypeContract).toEqual({
      '@types/react': '17.0.93',
      '@types/react-dom': '17.0.17',
      '@types/scheduler': '0.16.8'
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
    expect(provenanceSchema.properties.hostTypeContract.const).toEqual({
      '@types/react': '17.0.45',
      '@types/react-dom': '17.0.17'
    });
    expect(provenanceSchema.properties.isolatedCompilerTypeContract.const).toEqual({
      '@types/react': '17.0.93',
      '@types/react-dom': '17.0.17',
      '@types/scheduler': '0.16.8'
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

    expect(profile.schemaVersion).toBe(1);
    expect(profile.profileId).toBe('spfx-react17-base-nova-v1');
    expect(profile.provenanceSha256).toBe(sha256(provenanceBytes));
    expect(profile.normalizationImplementationSha256).toBe(sha256(implementationBytes));
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
    expect(profile.items.map((item) => item.id)).toEqual(expectedRegistryIds);

    const outputPaths = new Set<string>();
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
    expect(verifierMessage(excluded)).toContain('excluded dependency cmdk@1.1.1 is present');
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
});
