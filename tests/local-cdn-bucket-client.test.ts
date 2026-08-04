import { describe, expect, it } from 'vitest';
import { validateLocalCdnBucketInventory } from '../apps/lab/src/api/localCdnBucket';

const origin = 'http://127.0.0.1:5174';
const appId = 'hello-card-spfx';
const releaseId = '1.2.3-local.1';
const namespacePath = `apps/${appId}/versions/${releaseId}/`;
const releaseBaseUrl = `${origin}/${namespacePath}`;
const hash = 'a'.repeat(64);

function inventoryFixture() {
  return {
    schemaVersion: 1,
    origin,
    namespaces: {
      apps: {
        status: 'supported',
        releases: [
          {
            namespace: 'app',
            appId,
            releaseId,
            namespacePath,
            releaseBaseUrl,
            selected: true,
            status: 'verified',
            generatedAt: '2026-08-04T15:00:00.000Z',
            releaseLabel: '1.2.3 local',
            manifestSha256: hash,
            manifestBytes: 2048,
            proof: { localArtifact: 'passed', remoteCdn: 'not-run', sharePointAppCatalog: 'not-run' },
            package: { path: 'sharepoint/solution/hello-card.sppkg', bytes: 4096, sha256: hash, status: 'verified' },
            components: { package: ['component-a'], generated: ['component-a'] },
            assets: [
              {
                path: 'hello-card.js',
                url: `${releaseBaseUrl}hello-card.js`,
                bytes: 1024,
                sha256: hash,
                referencedBy: ['SPFx package:component-a:entry'],
                status: 'verified'
              }
            ]
          }
        ]
      },
      shared: {
        status: 'reserved-unsupported',
        releases: [],
        message: 'Shared resource publication awaits a canonical verifier.'
      }
    },
    selectedPointers: [{ appId, releaseId, manifestSha256: hash, status: 'selected-and-verified' }],
    publishSources: [
      {
        sourceId: `stage_${'b'.repeat(64)}`,
        label: '.spfx-kit/exports/hello-card/1.2.3/staging-cdn',
        status: 'verified',
        appId,
        releaseId,
        releaseBaseUrl,
        generatedAt: '2026-08-04T15:00:00.000Z',
        manifestSha256: hash,
        files: 1
      }
    ]
  };
}

describe('Local CDN bucket browser contract', () => {
  it('accepts canonical immutable inventory and preserves the reserved shared-namespace message', () => {
    const result = validateLocalCdnBucketInventory(inventoryFixture());

    expect(result.origin).toBe(origin);
    expect(result.namespaces.apps.releases[0]).toMatchObject({ appId, releaseId, selected: true, status: 'verified' });
    expect(result.namespaces.shared).toEqual({
      status: 'reserved-unsupported',
      releases: [],
      message: 'Shared resource publication awaits a canonical verifier.'
    });
  });

  it('rejects asset URL/path escapes and unsupported shared inventory claims', () => {
    const escapedPath = inventoryFixture();
    escapedPath.namespaces.apps.releases[0].assets[0].path = '../outside.js';
    expect(() => validateLocalCdnBucketInventory(escapedPath)).toThrow('safe portable path');

    const wrongOrigin = inventoryFixture();
    wrongOrigin.namespaces.apps.releases[0].assets[0].url = 'http://127.0.0.1:9999/hello-card.js';
    expect(() => validateLocalCdnBucketInventory(wrongOrigin)).toThrow('immutable namespace');

    const inventedSharedRelease = inventoryFixture();
    inventedSharedRelease.namespaces.shared.releases.push({ fake: true } as never);
    expect(() => validateLocalCdnBucketInventory(inventedSharedRelease)).toThrow('empty and reserved');
  });

  it('rejects duplicate pointers/sources and non-canonical server source ids', () => {
    const duplicatePointer = inventoryFixture();
    duplicatePointer.selectedPointers.push({ ...duplicatePointer.selectedPointers[0] });
    expect(() => validateLocalCdnBucketInventory(duplicatePointer)).toThrow('duplicate selected app pointers');

    const duplicateSource = inventoryFixture();
    duplicateSource.publishSources.push({ ...duplicateSource.publishSources[0] });
    expect(() => validateLocalCdnBucketInventory(duplicateSource)).toThrow('duplicate approved publish sources');

    const pathLikeSource = inventoryFixture();
    pathLikeSource.publishSources[0].sourceId = '/tmp/arbitrary-release';
    expect(() => validateLocalCdnBucketInventory(pathLikeSource)).toThrow('invalid source id');
  });

  it('preserves the exact release id for an invalid selected pointer', () => {
    const invalidPointer = inventoryFixture();
    invalidPointer.selectedPointers[0].releaseId = 'missing-release.1';
    invalidPointer.selectedPointers[0].status = 'invalid';

    expect(validateLocalCdnBucketInventory(invalidPointer).selectedPointers[0]).toEqual({
      appId,
      releaseId: 'missing-release.1',
      status: 'invalid'
    });
  });

  it('bounds browser inventory before rendering an excessive number of releases', () => {
    const excessive = inventoryFixture();
    excessive.namespaces.apps.releases = Array.from({ length: 251 }, (_value, index) => ({
      namespace: 'app' as const,
      appId: `app-${index}`,
      releaseId: `1.0.${index}`,
      namespacePath: `apps/app-${index}/versions/1.0.${index}/`,
      releaseBaseUrl: `${origin}/apps/app-${index}/versions/1.0.${index}/`,
      selected: false,
      status: 'invalid' as const,
      generatedAt: '',
      releaseLabel: '',
      manifestSha256: '',
      manifestBytes: 0,
      proof: { localArtifact: 'passed' as const, remoteCdn: 'not-run' as const, sharePointAppCatalog: 'not-run' as const },
      package: { path: '', bytes: 0, sha256: '', status: 'verified' as const },
      components: { package: [], generated: [] },
      assets: []
    }));
    expect(() => validateLocalCdnBucketInventory(excessive)).toThrow('inspection limits');
  });
});
