import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import { createCdnStageManifest } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { publishGitHubStagingSource } from '../packages/spfx-tools/src/lib/github-staging-source.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { gitHubStagingSourceDescriptorSha256 } from '../packages/spfx-tools/src/lib/github-staging-source-contract.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  getMockCdnBucketInventory,
  mockCdnAppReleaseBaseUrl,
  publishMockCdnAppStage,
  readMockCdnReleaseAsset,
  resolveMockCdnBucketRoot,
  resolveSelectedMockCdnAppRelease,
  selectMockCdnAppRelease
} from '../packages/spfx-tools/src/lib/mock-cdn-bucket.mjs';

const temporaryDirectories: string[] = [];
const origin = 'http://127.0.0.1:55174';
const appId = 'github-source-fixture';
const releaseId = '1.0.0-20260804T120000000Z-abc123';
const commit = '0123456789abcdef0123456789abcdef01234567';
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('GitHub staging-source intake', () => {
  it('exposes a JSON-capable publish-source CLI without GitHub credentials or network input', async () => {
    const fixture = await createSourceFixture('cli');
    const cli = path.resolve('packages/spfx-tools/src/cli/mock-cdn.mjs');
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        cli,
        'publish-source',
        '--descriptor',
        fixture.descriptorFile,
        '--materialization',
        fixture.materializationRoot,
        '--origin',
        origin,
        '--root',
        '.bucket',
        '--json'
      ],
      { cwd: fixture.workspaceRoot }
    );
    const output = JSON.parse(stdout);
    expect(output).toMatchObject({
      appId,
      releaseId,
      published: true,
      selected: false,
      source: { repository: 'acme-private/staging-assets', commit, path: fixture.sourcePath }
    });
    expect(stdout).not.toContain(fixture.materializationRoot);
    expect(stdout).not.toContain('token');
  });

  it('verifies a pinned local materialization, publishes through the canonical bucket, and exposes only concise provenance', async () => {
    const fixture = await createSourceFixture();
    const published = await publishGitHubStagingSource({
      bucketRoot: fixture.bucketRoot,
      origin,
      descriptorFile: fixture.descriptorFile,
      materializationDir: fixture.materializationRoot,
      select: true
    });

    expect(published).toMatchObject({
      appId,
      releaseId,
      published: true,
      selected: true,
      source: { kind: 'github-directory', repository: 'acme-private/staging-assets', commit, path: fixture.sourcePath }
    });
    const sourceDescriptor = JSON.parse(await readFile(fixture.descriptorFile, 'utf8'));
    expect(published.manifestSha256).not.toBe(sourceDescriptor.releaseManifest.sha256);
    expect(published.sourceProvenance).toMatchObject({
      sourceManifestSha256: sourceDescriptor.releaseManifest.sha256,
      releaseManifestSha256: published.manifestSha256
    });
    const release = await resolveSelectedMockCdnAppRelease({ bucketRoot: fixture.bucketRoot, origin, appId });
    await expect(readMockCdnReleaseAsset(release, 'main.js')).resolves.toMatchObject({
      bytes: Buffer.from('define("main", [], {});')
    });
    await expect(readMockCdnReleaseAsset(release, 'staging-source.json')).rejects.toThrow('not allowlisted');
    await expect(readMockCdnReleaseAsset(release, 'release-record.json')).rejects.toThrow('not allowlisted');

    const inventory = await getMockCdnBucketInventory({ bucketRoot: fixture.bucketRoot, origin });
    expect(inventory.namespaces.apps.releases[0]).toMatchObject({
      status: 'verified',
      sourceProvenance: {
        kind: 'github-directory',
        repository: 'acme-private/staging-assets',
        commit,
        path: fixture.sourcePath,
        descriptorSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceManifestSha256: sourceDescriptor.releaseManifest.sha256,
        releaseManifestSha256: published.manifestSha256
      }
    });
    expect(JSON.stringify(inventory)).not.toContain(fixture.materializationRoot);
    expect(JSON.stringify(inventory)).not.toContain('token');
  });

  it('fails closed for unpinned, missing, unsafe, or desynchronized provenance before creating a release', async () => {
    const fixture = await createSourceFixture();
    const canonical = JSON.parse(await readFile(fixture.descriptorFile, 'utf8'));
    const invalidDescriptors = [
      { ...canonical, source: { ...canonical.source, commit: 'main' } },
      {
        ...canonical,
        source: { kind: canonical.source.kind, repository: canonical.source.repository, path: canonical.source.path }
      },
      { ...canonical, source: { ...canonical.source, ref: 'main' } },
      { ...canonical, source: { ...canonical.source, repository: 'https://user:token@github.com/acme/repo' } },
      { ...canonical, source: { ...canonical.source, path: '../release' } },
      { ...canonical, releaseManifest: { ...canonical.releaseManifest, sha256: '0'.repeat(64) } },
      { ...canonical, files: canonical.files.slice(1) },
      {
        ...canonical,
        files: [...canonical.files, { ...canonical.files[0], path: canonical.files[0].path.toUpperCase() }].sort((left, right) =>
          left.path < right.path ? -1 : left.path > right.path ? 1 : 0
        )
      }
    ];
    for (const [index, descriptor] of invalidDescriptors.entries()) {
      const descriptorFile = path.join(fixture.workspaceRoot, `invalid-${index}.json`);
      await writeFile(descriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`);
      await expect(
        publishGitHubStagingSource({
          bucketRoot: fixture.bucketRoot,
          origin,
          descriptorFile,
          materializationDir: fixture.materializationRoot
        })
      ).rejects.toThrow();
    }
    await expect(getMockCdnBucketInventory({ bucketRoot: fixture.bucketRoot, origin })).resolves.toMatchObject({
      namespaces: { apps: { releases: [] } },
      selectedPointers: []
    });
  });

  it('makes the canonical publisher verify provenance source-only files and symlink components', async () => {
    const forgedFixture = await createSourceFixture('forged-direct-publish');
    const forgedDescriptor = JSON.parse(await readFile(forgedFixture.descriptorFile, 'utf8'));
    const manifestEntry = forgedDescriptor.files.find((entry: { path: string }) => entry.path.startsWith('manifests/'));
    manifestEntry.sha256 = '0'.repeat(64);
    await expect(
      publishMockCdnAppStage({
        bucketRoot: forgedFixture.bucketRoot,
        origin,
        stageDir: forgedFixture.stageDir,
        sourceRoot: forgedFixture.materializationRoot,
        sourceProvenance: {
          descriptor: forgedDescriptor,
          descriptorSha256: gitHubStagingSourceDescriptorSha256(forgedDescriptor)
        }
      })
    ).rejects.toThrow('changed or does not match its checksum closure');

    const symlinkFixture = await createSourceFixture('direct-ancestor-symlink');
    const descriptor = JSON.parse(await readFile(symlinkFixture.descriptorFile, 'utf8'));
    const sharePointDirectory = path.join(symlinkFixture.stageDir, 'sharepoint');
    const realSharePointDirectory = path.join(symlinkFixture.stageDir, 'real-sharepoint');
    await rename(sharePointDirectory, realSharePointDirectory);
    await symlink('real-sharepoint', sharePointDirectory);
    await expect(
      publishMockCdnAppStage({
        bucketRoot: symlinkFixture.bucketRoot,
        origin,
        stageDir: symlinkFixture.stageDir,
        sourceRoot: symlinkFixture.materializationRoot,
        sourceProvenance: {
          descriptor,
          descriptorSha256: gitHubStagingSourceDescriptorSha256(descriptor)
        }
      })
    ).rejects.toThrow('may not traverse symbolic links');

    const extraFileFixture = await createSourceFixture('direct-extra-manifest-file');
    const extraFileDescriptor = JSON.parse(await readFile(extraFileFixture.descriptorFile, 'utf8'));
    await writeFile(path.join(extraFileFixture.stageDir, 'manifests', 'unexpected.txt'), 'not declared');
    await expect(
      publishMockCdnAppStage({
        bucketRoot: extraFileFixture.bucketRoot,
        origin,
        stageDir: extraFileFixture.stageDir,
        sourceRoot: extraFileFixture.materializationRoot,
        sourceProvenance: {
          descriptor: extraFileDescriptor,
          descriptorSha256: gitHubStagingSourceDescriptorSha256(extraFileDescriptor)
        }
      })
    ).rejects.toThrow('does not exactly match the live canonical tree');

    const extraUploadFixture = await createSourceFixture('direct-extra-upload-file');
    const extraUploadDescriptor = JSON.parse(await readFile(extraUploadFixture.descriptorFile, 'utf8'));
    await writeFile(path.join(extraUploadFixture.stageDir, 'upload', 'unexpected.js'), 'not declared');
    await expect(
      publishMockCdnAppStage({
        bucketRoot: extraUploadFixture.bucketRoot,
        origin,
        stageDir: extraUploadFixture.stageDir,
        sourceRoot: extraUploadFixture.materializationRoot,
        sourceProvenance: {
          descriptor: extraUploadDescriptor,
          descriptorSha256: gitHubStagingSourceDescriptorSha256(extraUploadDescriptor)
        }
      })
    ).rejects.toThrow('does not exactly match the live canonical tree');
  });

  it('publishes only from one protected snapshot when the source mutates during intake', async () => {
    const fixture = await createSourceFixture('direct-intake-mutation');
    const descriptor = JSON.parse(await readFile(fixture.descriptorFile, 'utf8'));
    let mutated = false;

    await expect(
      publishMockCdnAppStage({
        bucketRoot: fixture.bucketRoot,
        origin,
        stageDir: fixture.stageDir,
        sourceRoot: fixture.materializationRoot,
        sourceProvenance: {
          descriptor,
          descriptorSha256: gitHubStagingSourceDescriptorSha256(descriptor)
        },
        _sourceSnapshotTestHooks: {
          async afterOpen({ relativePath, sourceFile }: { relativePath: string; sourceFile: string }) {
            if (mutated || relativePath !== 'upload/main.js') return;
            mutated = true;
            const current = await readFile(sourceFile);
            await writeFile(sourceFile, Buffer.alloc(current.length, 0x78));
          }
        }
      })
    ).rejects.toThrow(/changed|checksum closure/);

    expect(mutated).toBe(true);
    await expect(getMockCdnBucketInventory({ bucketRoot: fixture.bucketRoot, origin })).resolves.toMatchObject({
      namespaces: { apps: { releases: [] } },
      selectedPointers: []
    });
  });

  it('keeps historical inventory anchor-only while selection re-verifies published bytes', async () => {
    const fixture = await createSourceFixture('inventory-anchor');
    await publishGitHubStagingSource({
      bucketRoot: fixture.bucketRoot,
      origin,
      descriptorFile: fixture.descriptorFile,
      materializationDir: fixture.materializationRoot
    });
    const publishedAsset = path.join(fixture.bucketRoot, 'apps', appId, 'versions', releaseId, 'upload', 'main.js');
    await writeFile(publishedAsset, 'tampered-but-not-selected');

    await expect(getMockCdnBucketInventory({ bucketRoot: fixture.bucketRoot, origin })).resolves.toMatchObject({
      namespaces: {
        apps: {
          releases: [
            {
              appId,
              releaseId,
              selected: false,
              status: 'anchored',
              package: { status: 'anchored' },
              assets: expect.arrayContaining([expect.objectContaining({ status: 'anchored' })])
            }
          ]
        }
      }
    });
    await expect(selectMockCdnAppRelease({ bucketRoot: fixture.bucketRoot, origin, appId, releaseId })).rejects.toThrow(
      'deterministic manifest core'
    );
  });

  it('rejects changed or symlinked materialization files and provenance changes for an existing immutable release', async () => {
    const fixture = await createSourceFixture();
    await publishGitHubStagingSource({
      bucketRoot: fixture.bucketRoot,
      origin,
      descriptorFile: fixture.descriptorFile,
      materializationDir: fixture.materializationRoot
    });
    await expect(
      publishGitHubStagingSource({
        bucketRoot: fixture.bucketRoot,
        origin,
        descriptorFile: fixture.descriptorFile,
        materializationDir: fixture.materializationRoot
      })
    ).resolves.toMatchObject({ published: false });

    const reformatted = JSON.parse(await readFile(fixture.descriptorFile, 'utf8'));
    await writeFile(fixture.descriptorFile, JSON.stringify(reformatted));
    await expect(
      publishGitHubStagingSource({
        bucketRoot: fixture.bucketRoot,
        origin,
        descriptorFile: fixture.descriptorFile,
        materializationDir: fixture.materializationRoot
      })
    ).resolves.toMatchObject({ published: false });

    const changed = JSON.parse(await readFile(fixture.descriptorFile, 'utf8'));
    changed.source.commit = 'f'.repeat(40);
    const changedDescriptor = path.join(fixture.workspaceRoot, 'changed-source.json');
    await writeFile(changedDescriptor, `${JSON.stringify(changed, null, 2)}\n`);
    await expect(
      publishGitHubStagingSource({
        bucketRoot: fixture.bucketRoot,
        origin,
        descriptorFile: changedDescriptor,
        materializationDir: fixture.materializationRoot
      })
    ).rejects.toThrow('different release metadata');

    const symlinkFixture = await createSourceFixture('symlink');
    const mainFile = path.join(symlinkFixture.stageDir, 'upload', 'main.js');
    await rm(mainFile);
    await symlink(path.join(fixture.stageDir, 'upload', 'main.js'), mainFile);
    await expect(
      publishGitHubStagingSource({
        bucketRoot: symlinkFixture.bucketRoot,
        origin,
        descriptorFile: symlinkFixture.descriptorFile,
        materializationDir: symlinkFixture.materializationRoot
      })
    ).rejects.toThrow('symbolic links');

    const ancestorFixture = await createSourceFixture('ancestor-symlink');
    const releasesDirectory = path.join(ancestorFixture.materializationRoot, 'releases');
    const realReleasesDirectory = path.join(ancestorFixture.materializationRoot, 'real-releases');
    await rename(releasesDirectory, realReleasesDirectory);
    await symlink('real-releases', releasesDirectory);
    await expect(
      publishGitHubStagingSource({
        bucketRoot: ancestorFixture.bucketRoot,
        origin,
        descriptorFile: ancestorFixture.descriptorFile,
        materializationDir: ancestorFixture.materializationRoot
      })
    ).rejects.toThrow('may not traverse symbolic links');
  });

  it('marks a source-derived release invalid if persisted provenance is tampered while legacy releases remain optional', async () => {
    const fixture = await createSourceFixture();
    await publishGitHubStagingSource({
      bucketRoot: fixture.bucketRoot,
      origin,
      descriptorFile: fixture.descriptorFile,
      materializationDir: fixture.materializationRoot,
      select: true
    });
    const sidecar = path.join(fixture.bucketRoot, 'apps', appId, 'versions', releaseId, 'staging-source.json');
    const persisted = JSON.parse(await readFile(sidecar, 'utf8'));
    persisted.descriptor.source.commit = 'f'.repeat(40);
    const tamperedSidecar = Buffer.from(`${JSON.stringify(persisted, null, 2)}\n`);
    await writeFile(sidecar, tamperedSidecar);
    const recordFile = path.join(fixture.bucketRoot, 'apps', appId, 'versions', releaseId, 'release-record.json');
    const record = JSON.parse(await readFile(recordFile, 'utf8'));
    record.sourceProvenanceSha256 = sha256(tamperedSidecar);
    await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);

    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot: fixture.bucketRoot, origin, appId })).rejects.toThrow(
      'checksum does not match its canonical descriptor'
    );
    await expect(getMockCdnBucketInventory({ bucketRoot: fixture.bucketRoot, origin })).resolves.toMatchObject({
      namespaces: { apps: { releases: [{ appId, releaseId, status: 'invalid' }] } },
      selectedPointers: [{ appId, releaseId, status: 'invalid' }]
    });
  });

  it('fails closed when anchored source provenance is removed while grandfathering a true legacy local release', async () => {
    const sourceFixture = await createSourceFixture('missing-sidecar');
    await publishGitHubStagingSource({
      bucketRoot: sourceFixture.bucketRoot,
      origin,
      descriptorFile: sourceFixture.descriptorFile,
      materializationDir: sourceFixture.materializationRoot,
      select: true
    });
    const sourceReleaseDir = path.join(sourceFixture.bucketRoot, 'apps', appId, 'versions', releaseId);
    await rm(path.join(sourceReleaseDir, 'staging-source.json'));
    await expect(resolveSelectedMockCdnAppRelease({ bucketRoot: sourceFixture.bucketRoot, origin, appId })).rejects.toThrow(
      'provenance is missing'
    );

    const legacyFixture = await createSourceFixture('legacy');
    await publishMockCdnAppStage({
      bucketRoot: legacyFixture.bucketRoot,
      origin,
      stageDir: legacyFixture.stageDir
    });
    const legacyReleaseDir = path.join(legacyFixture.bucketRoot, 'apps', appId, 'versions', releaseId);
    await rm(path.join(legacyReleaseDir, 'release-record.json'));
    await expect(getMockCdnBucketInventory({ bucketRoot: legacyFixture.bucketRoot, origin })).resolves.toMatchObject({
      namespaces: {
        apps: {
          releases: [
            {
              appId,
              releaseId,
              selected: false,
              status: 'recorded',
              package: { status: 'recorded' },
              assets: expect.arrayContaining([expect.objectContaining({ status: 'recorded' })])
            }
          ]
        }
      }
    });
    await selectMockCdnAppRelease({ bucketRoot: legacyFixture.bucketRoot, origin, appId, releaseId });
    await expect(
      resolveSelectedMockCdnAppRelease({ bucketRoot: legacyFixture.bucketRoot, origin, appId })
    ).resolves.toMatchObject({ appId, releaseId });
  });
});

async function createSourceFixture(suffix = 'valid') {
  const workspaceRoot = await temporaryDirectory();
  const materializationRoot = path.join(workspaceRoot, 'materialization');
  const sourcePath = `releases/${suffix}`;
  const stageDir = path.join(materializationRoot, sourcePath);
  const uploadDir = path.join(stageDir, 'upload');
  const manifestDir = path.join(stageDir, 'manifests');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', `${appId}.staging.cdn.sppkg`);
  const cdnBasePath = mockCdnAppReleaseBaseUrl(origin, appId, releaseId);
  const componentManifest = {
    id: '11111111-1111-4111-8111-111111111111',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: { main: { type: 'path', path: 'main.js' } }
    }
  };
  await Promise.all([
    writePackage(packageFile, componentManifest),
    writeFileWithParents(path.join(manifestDir, 'component.manifest.json'), `${JSON.stringify(componentManifest)}\n`),
    writeFileWithParents(path.join(uploadDir, 'main.js'), 'define("main", [], {});'),
    writeFileWithParents(path.join(uploadDir, 'styles.css'), '.fixture { color: red; }')
  ]);
  const manifest = await createCdnStageManifest({
    allowLocalMockCdn: true,
    cdnBasePath,
    packageFile,
    releaseLabel: releaseId,
    releaseId,
    releaseManifestDir: manifestDir,
    slug: appId,
    stageDir,
    uploadDir
  });
  const manifestFile = path.join(stageDir, 'deployment-manifest.json');
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const closurePaths = new Set([
    'deployment-manifest.json',
    manifest.package.path,
    ...manifest.files.map((file: { path: string }) => `${manifest.uploadRoot}/${file.path}`)
  ]);
  if (manifest.manifests.root) {
    for (const file of await listFiles(stageDir, manifest.manifests.root)) {
      closurePaths.add(file);
    }
  }
  const files = await Promise.all(
    [...closurePaths].sort().map(async (relativePath) => {
      const bytes = await readFile(path.join(stageDir, relativePath));
      return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
    })
  );
  const descriptor = {
    schemaVersion: 1,
    source: {
      kind: 'github-directory',
      visibility: 'private',
      repository: 'acme-private/staging-assets',
      commit,
      path: sourcePath
    },
    releaseManifest: { path: 'deployment-manifest.json', sha256: sha256(await readFile(manifestFile)) },
    files
  };
  const descriptorFile = path.join(workspaceRoot, 'github-staging-source.json');
  await writeFile(descriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`);
  return {
    workspaceRoot,
    materializationRoot,
    sourcePath,
    stageDir,
    descriptorFile,
    bucketRoot: resolveMockCdnBucketRoot(workspaceRoot)
  };
}

async function listFiles(root: string, relativeDirectory: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(path.join(root, relativeDirectory), { withFileTypes: true })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      results.push(relativePath);
    }
  }
  return results;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-kit-github-source-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePackage(file: string, componentManifest: object): Promise<void> {
  const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const bytes = zipSync({
    '[Content_Types].xml': strToU8('<Types />'),
    '_rels/.rels': strToU8('<Relationships />'),
    'AppManifest.xml': strToU8('<App />'),
    'feature/WebPart.xml': strToU8(`<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`)
  });
  await writeFileWithParents(file, bytes);
}

async function writeFileWithParents(file: string, value: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
