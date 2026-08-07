import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  assertProfileGenerationProvenance,
  assertProfileUpdateProvenance,
  bindVerifiedSnapshotsToProvenance,
  assertPinnedShadcnToolchain,
  fetchPinnedRegistrySnapshots,
  fetchValidatedProfileUpdateSnapshots
} from '../packages/ui-profile/scripts/lib/profile-update-intake.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { canonicalJson } from '../packages/ui-profile/scripts/lib/profile.mjs';

const SHADCN_INTEGRITY = 'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==';
const registry = {
  preset: 'base-nova',
  endpointTemplate: 'https://ui.shadcn.com/r/styles/base-nova/{id}.json',
  cli: { name: 'shadcn', version: '4.16.1', integrity: SHADCN_INTEGRITY }
};
const dependencyPolicy = {
  excludedDependencies: ['cmdk@1.1.1', 'sonner@2.0.7', '@radix-ui/*', 'react-aria-components', 'vaul'],
  directProductionDependencies: {
    '@base-ui/react': '1.6.0',
    'class-variance-authority': '0.7.1',
    clsx: '2.1.1',
    'lucide-react': '1.25.0',
    react: '17.0.1',
    'react-dom': '17.0.1',
    'tailwind-merge': '3.6.0'
  }
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

async function provenanceFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ui-profile-provenance-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'ui-profile');
  const sourceRoot = path.resolve('packages/ui-profile');
  await cp(sourceRoot, packageRoot, {
    recursive: true,
    filter: (source) => {
      const segments = path.relative(sourceRoot, source).split(path.sep);
      return !segments.some(
        (segment) => ['node_modules', '.prepared', '.tsbuildinfo'].includes(segment) || segment.startsWith('.profile-')
      );
    }
  });
  return {
    packageRoot,
    provenance: JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'))
  };
}

describe('committed UI profile provenance', () => {
  it('binds verified raw and canonical snapshot bytes into a new provenance value', () => {
    const raw = Buffer.from('{\n  "name": "button", "files": []\n}\n');
    const provenance = {
      registryIds: ['button'],
      registrySnapshots: { button: { rawSha256: '0'.repeat(64), canonicalSha256: '0'.repeat(64) } }
    };

    const rebound = bindVerifiedSnapshotsToProvenance(provenance, new Map([['button', raw]]));

    expect(rebound).not.toBe(provenance);
    expect(rebound.registrySnapshots.button.rawSha256).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(rebound.registrySnapshots.button.canonicalSha256).toBe(
      createHash('sha256')
        .update(canonicalJson(JSON.parse(raw.toString('utf8'))))
        .digest('hex')
    );
    expect(provenance.registrySnapshots.button.rawSha256).toBe('0'.repeat(64));
  });

  it('verifies the pinned schema plus every committed raw and canonical snapshot digest', async () => {
    const { packageRoot, provenance } = await provenanceFixture();

    await expect(assertProfileUpdateProvenance({ packageRoot, provenance })).resolves.toBeInstanceOf(Map);
  });

  it('binds generation provenance to the exact normalizer implementation bytes', async () => {
    const { packageRoot, provenance } = await provenanceFixture();
    await expect(assertProfileGenerationProvenance({ packageRoot, provenance })).resolves.toBeUndefined();

    const implementationPath = path.join(packageRoot, provenance.normalization.implementation);
    await writeFile(implementationPath, `${await readFile(implementationPath, 'utf8')} `);
    await expect(assertProfileGenerationProvenance({ packageRoot, provenance })).rejects.toThrow(
      'Normalization implementation digest differs'
    );
  });

  it('rejects provenance schema drift before trusting snapshot metadata', async () => {
    const { packageRoot, provenance } = await provenanceFixture();
    const schemaPath = path.join(packageRoot, 'provenance.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    schema.title = 'Unreviewed schema';
    await writeFile(schemaPath, JSON.stringify(schema));

    await expect(assertProfileUpdateProvenance({ packageRoot, provenance })).rejects.toThrow(
      'Profile update provenance schema identity differs'
    );
  });

  it.each(['raw', 'canonical'])('rejects independently changed %s snapshot bytes', async (kind) => {
    const { packageRoot, provenance } = await provenanceFixture();
    const snapshotPath = path.join(packageRoot, 'snapshots', kind, 'button.json');
    await writeFile(snapshotPath, `${await readFile(snapshotPath, 'utf8')} `);

    await expect(assertProfileUpdateProvenance({ packageRoot, provenance })).rejects.toThrow(
      `${kind === 'raw' ? 'Raw' : 'Canonical'} registry snapshot digest differs for button`
    );
  });

  it('rejects canonical bytes that match their recorded digest but not canonical JSON', async () => {
    const { packageRoot, provenance } = await provenanceFixture();
    const canonicalPath = path.join(packageRoot, 'snapshots', 'canonical', 'button.json');
    const noncanonical = await readFile(path.join(packageRoot, 'snapshots', 'raw', 'button.json'));
    await writeFile(canonicalPath, noncanonical);
    provenance.registrySnapshots.button.canonicalSha256 = createHash('sha256').update(noncanonical).digest('hex');

    await expect(assertProfileUpdateProvenance({ packageRoot, provenance })).rejects.toThrow(
      'Canonical registry snapshot bytes differ for button'
    );
  });
});

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
      dependencyPolicy,
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

  it('accepts the complete committed dependency and fetched-source closure', async () => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const committedRoot = path.resolve('packages/ui-profile');
    const provenance = JSON.parse(await readFile(path.join(committedRoot, 'provenance.json'), 'utf8'));
    const cliItems = await Promise.all(
      provenance.registryIds.map(async (id: string) =>
        JSON.parse(await readFile(path.join(committedRoot, 'snapshots', 'canonical', `${id}.json`), 'utf8'))
      )
    );
    const fetchImpl = vi.fn(async (url: string) => {
      const id = /\/([^/]+)\.json$/u.exec(url)?.[1];
      return new Response(await readFile(path.join(committedRoot, 'snapshots', 'raw', `${id}.json`)), { status: 200 });
    });

    const snapshots = await fetchPinnedRegistrySnapshots({
      packageRoot,
      registry: provenance.registry,
      registryIds: provenance.registryIds,
      dependencyPolicy: {
        excludedDependencies: provenance.excludedDependencies,
        directProductionDependencies: provenance.directProductionDependencies
      },
      fetchImpl,
      getRegistryItemsImpl: async () => cliItems,
      resolvedRegistryUrl
    });

    expect(snapshots.size).toBe(provenance.registryIds.length);
  });

  it.each([
    [
      'declared excluded dependency',
      { dependencies: ['cmdk'], files: [] },
      'Pinned registry item button uses excluded dependency cmdk'
    ],
    [
      'excluded source import',
      {
        files: [{ path: 'registry/base-nova/ui/button.tsx', type: 'registry:ui', content: 'import "@radix-ui/react-slot"\n' }]
      },
      'registry/base-nova/ui/button.tsx uses excluded dependency @radix-ui/react-slot'
    ],
    [
      'undeclared source import',
      { files: [{ path: 'registry/base-nova/ui/button.tsx', type: 'registry:ui', content: 'import "left-pad"\n' }] },
      'registry/base-nova/ui/button.tsx uses undeclared production dependency left-pad'
    ],
    [
      'unfetched registry dependency',
      { registryDependencies: ['input'], files: [] },
      'requires source outside the fetched registry closure: input'
    ],
    [
      'unfetched source import',
      {
        files: [
          {
            path: 'registry/base-nova/ui/button.tsx',
            type: 'registry:ui',
            content: 'import "@/registry/base-nova/ui/input"\n'
          }
        ]
      },
      'requires source outside the fetched registry closure: input'
    ],
    ...['import(name)', 'require(name)', 'require.resolve(name)', 'require()', 'require("react", "extra")'].map((content) => [
      `computed dependency call ${content}`,
      {
        files: [{ path: 'registry/base-nova/ui/button.tsx', type: 'registry:ui', content }]
      },
      'non-literal dynamic dependency is not accepted'
    ])
  ])('rejects a %s from semantically matching hosted and CLI items', async (_label, patch, expectedMessage) => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const cliItem = { name: 'button', type: 'registry:ui', ...patch };
    const raw = JSON.stringify(cliItem);

    await expect(
      fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        dependencyPolicy,
        fetchImpl: async () => new Response(raw, { status: 200 }),
        getRegistryItemsImpl: async () => [cliItem],
        resolvedRegistryUrl
      })
    ).rejects.toThrow(expectedMessage);
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
        dependencyPolicy,
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
        dependencyPolicy,
        fetchImpl: async () => new Response('{not-json', { status: 200 }),
        getRegistryItemsImpl: async () => [{ name: 'button', type: 'registry:ui', files: [] }],
        resolvedRegistryUrl
      })
    ).rejects.toThrow('Hosted registry response is not JSON for button');
  });

  it.each([
    ['item', ['button'], 3, 16, 'exceeds the 3-byte item limit'],
    ['aggregate', ['button', 'input'], 8, 7, 'exceeds the aggregate byte limit at input']
  ])(
    'streams and rejects a registry response that exceeds the %s byte limit',
    async (_label, registryIds, itemLimit, aggregateLimit, message) => {
      const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();

      await expect(
        fetchPinnedRegistrySnapshots({
          packageRoot,
          registry,
          registryIds,
          dependencyPolicy,
          fetchImpl: async () => new Response('1234', { status: 200 }),
          getRegistryItemsImpl: async () => [],
          resolvedRegistryUrl,
          maxRegistryItemBytes: itemLimit,
          maxRegistryAggregateBytes: aggregateLimit
        })
      ).rejects.toThrow(message);
    }
  );

  it('aborts a stalled hosted registry request at its deadline', async () => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fetchImpl = vi.fn(
        async (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          })
      );
      const pending = fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        dependencyPolicy,
        fetchImpl,
        getRegistryItemsImpl: async () => [],
        resolvedRegistryUrl,
        requestTimeoutMs: 50
      });
      while (fetchImpl.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
      const rejection = expect(pending).rejects.toThrow('Registry update request for button exceeded the 50ms deadline');

      await vi.advanceTimersByTimeAsync(50);

      await rejection;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal).toMatchObject({ aborted: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the pinned CLI-backed registry intake with the same deadline', async () => {
    const { packageRoot, resolvedRegistryUrl } = await toolchainFixture();
    const cliItem = { name: 'button', type: 'registry:ui', files: [] };
    const getRegistryItemsImpl = vi.fn(async () => new Promise<never>(() => {}));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = fetchPinnedRegistrySnapshots({
        packageRoot,
        registry,
        registryIds: ['button'],
        dependencyPolicy,
        fetchImpl: async () => new Response(JSON.stringify(cliItem), { status: 200 }),
        getRegistryItemsImpl,
        resolvedRegistryUrl,
        requestTimeoutMs: 50
      });
      while (getRegistryItemsImpl.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
      const rejection = expect(pending).rejects.toThrow('Pinned shadcn CLI registry intake exceeded the 50ms deadline');

      await vi.advanceTimersByTimeAsync(50);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
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
        dependencyPolicy,
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
