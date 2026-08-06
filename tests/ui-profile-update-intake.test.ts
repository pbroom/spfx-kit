import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  assertPinnedShadcnToolchain,
  fetchPinnedRegistrySnapshots,
  fetchValidatedProfileUpdateSnapshots
} from '../packages/ui-profile/scripts/lib/profile-update-intake.mjs';

const SHADCN_INTEGRITY = 'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==';
const registry = {
  preset: 'base-nova',
  endpointTemplate: 'https://ui.shadcn.com/r/styles/base-nova/{id}.json',
  cli: { name: 'shadcn', version: '4.16.1', integrity: SHADCN_INTEGRITY }
};
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function toolchainFixture(): Promise<{
  repositoryRoot: string;
  packageRoot: string;
  resolvedRegistryUrl: string;
}> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ui-profile-update-intake-'));
  temporaryRoots.push(repositoryRoot);
  const packageRoot = path.join(repositoryRoot, 'packages', 'ui-profile');
  const shadcnRoot = path.join(repositoryRoot, 'node_modules', 'shadcn');
  const registryModule = path.join(shadcnRoot, 'dist', 'registry', 'index.js');
  await mkdir(path.dirname(registryModule), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'packages/ui-profile': { devDependencies: { shadcn: '4.16.1' } },
        'node_modules/shadcn': { version: '4.16.1', integrity: SHADCN_INTEGRITY }
      }
    })
  );
  await writeFile(path.join(shadcnRoot, 'package.json'), JSON.stringify({ name: 'shadcn', version: '4.16.1' }));
  await writeFile(registryModule, 'export const fixture = true;\n');
  return { repositoryRoot, packageRoot, resolvedRegistryUrl: pathToFileURL(registryModule).href };
}

describe('pinned shadcn network intake', () => {
  it.each([
    ['endpointTemplate', 'http://127.0.0.1:9/private/{id}'],
    ['preset', 'unreviewed-style'],
    ['toolSourceRevision', 'f'.repeat(40)]
  ])('rejects tampered registry %s under the exact provenance schema before fetch', async (field, value) => {
    const packageRoot = path.resolve('packages/ui-profile');
    const provenance = JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'));
    provenance.registry[field] = value;
    const fetchImpl = vi.fn();

    await expect(
      fetchValidatedProfileUpdateSnapshots({
        packageRoot,
        provenance,
        fetchImpl,
        getRegistryItemsImpl: async () => [],
        resolvedRegistryUrl: import.meta.resolve('shadcn/registry')
      })
    ).rejects.toThrow('Profile update provenance is invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves exact hosted bytes only when the pinned package API returns the same semantic item', async () => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const raw = '{\n  "name": "button",\n  "type": "registry:ui",\n  "files": []\n}\n';
    const cliItem = { name: 'button', type: 'registry:ui', files: [] };
    const fetchImpl = vi.fn(async () => new Response(raw, { status: 200 }));
    const getRegistryItemsImpl = vi.fn(async () => [cliItem]);

    const snapshots = await fetchPinnedRegistrySnapshots({
      packageRoot,
      registry,
      registryIds: ['button'],
      fetchImpl,
      getRegistryItemsImpl,
      resolvedRegistryUrl
    });

    expect(snapshots.get('button')?.toString('utf8')).toBe(raw);
    expect(getRegistryItemsImpl).toHaveBeenCalledWith(['button'], {
      config: { style: 'base-nova' },
      useCache: false
    });
  });

  it.each([
    ['semantic mismatch', [{ name: 'button', type: 'registry:component', files: [] }], 'differs from pinned shadcn CLI'],
    ['missing identity', [], 'incomplete registry collection'],
    ['wrong identity', [{ name: 'input', type: 'registry:ui', files: [] }], 'did not return button']
  ])('rejects a %s', async (_label, cliItems, expectedMessage) => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const raw = JSON.stringify({ name: 'button', type: 'registry:ui', files: [] });
    await expect(
      fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        fetchImpl: async () => new Response(raw, { status: 200 }),
        getRegistryItemsImpl: async () => cliItems,
        resolvedRegistryUrl
      })
    ).rejects.toThrow(expectedMessage);
  });

  it('rejects malformed hosted JSON before returning snapshots', async () => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    await expect(
      fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        fetchImpl: async () => new Response('{not-json', { status: 200 }),
        getRegistryItemsImpl: async () => [{ name: 'button', type: 'registry:ui', files: [] }],
        resolvedRegistryUrl
      })
    ).rejects.toThrow('Hosted registry response is not JSON for button');
  });

  it('rejects lock integrity drift before any registry request', async () => {
    const { repositoryRoot, packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const lockPath = path.join(repositoryRoot, 'package-lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.packages['node_modules/shadcn'].integrity = 'sha512-drift';
    await writeFile(lockPath, JSON.stringify(lock));
    const fetchImpl = vi.fn();

    await expect(
      fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        fetchImpl,
        getRegistryItemsImpl: async () => [],
        resolvedRegistryUrl
      })
    ).rejects.toThrow('Locked shadcn integrity differs');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a shadowed registry module resolution', async () => {
    const { repositoryRoot, packageRoot } = await toolchainFixture();
    const shadowed = pathToFileURL(
      path.join(repositoryRoot, 'packages', 'ui-profile', 'node_modules', 'shadcn', 'index.js')
    ).href;
    await expect(assertPinnedShadcnToolchain({ packageRoot, registry, resolvedRegistryUrl: shadowed })).rejects.toThrow(
      'Resolved shadcn registry module is shadowed'
    );
  });
});
