import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
// @ts-expect-error plain .mjs module without type declarations
import {
  clearGeneratedCdnOutputs,
  createCdnStageManifest,
  createImmutableCdnReleaseId,
  mergeCdnAssetTree,
  normalizeCdnReleaseId,
  normalizeStagingCdnRoot,
  stagingCdnBasePath,
  verifyCdnStage,
  verifyRemoteCdnFiles
} from '../packages/spfx-tools/src/lib/cdn-stage.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('staging CDN release paths', () => {
  it('builds a versioned app prefix on a configured HTTPS staging root', () => {
    expect(stagingCdnBasePath('https://staging.contoso.test/spfx', 'team-spfx', '1.2.3-rc.4')).toBe(
      'https://staging.contoso.test/spfx/team-spfx/versions/1.2.3-rc.4/'
    );
  });

  it('adds a unique build identity to the operator release label', () => {
    expect(
      createImmutableCdnReleaseId('1.2.3-rc.4', {
        now: new Date('2026-07-27T15:00:00.123Z'),
        nonce: 'abc123'
      })
    ).toBe('1.2.3-rc.4-20260727T150000123Z-abc123');
  });

  it('rejects placeholders, credentials, and mutable or unsafe release ids', () => {
    expect(() => normalizeStagingCdnRoot('https://cdn.example.com/spfx')).toThrow('non-placeholder');
    expect(() => normalizeStagingCdnRoot('https://user:secret@staging.contoso.test/spfx')).toThrow('credentials');
    for (const releaseId of ['latest', 'current', '../1.2.3', 'release']) {
      expect(() => normalizeCdnReleaseId(releaseId)).toThrow();
    }
  });
});

describe('staging CDN asset assembly', () => {
  it('clears generated CDN outputs without deleting sibling release files', async () => {
    const appDir = await temporaryDirectory();
    const generatedFiles = [
      path.join(appDir, 'release', 'assets', 'stale.js'),
      path.join(appDir, 'release', 'manifests', 'stale.manifest.json'),
      path.join(appDir, 'temp', 'deploy', 'stale.js')
    ];
    const releaseReadme = path.join(appDir, 'release', 'README.md');
    await Promise.all(generatedFiles.map((file) => mkdir(path.dirname(file), { recursive: true })));
    await Promise.all([...generatedFiles.map((file) => writeFile(file, 'stale')), writeFile(releaseReadme, 'keep')]);

    await clearGeneratedCdnOutputs(appDir);

    await Promise.all(generatedFiles.map((file) => expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })));
    await expect(readFile(releaseReadme, 'utf8')).resolves.toBe('keep');
  });

  it('allows identical overlaps and rejects conflicting bytes', async () => {
    const root = await temporaryDirectory();
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    const upload = path.join(root, 'upload');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(path.join(first, 'shared.js'), 'same');
    await writeFile(path.join(second, 'shared.js'), 'same');

    await expect(mergeCdnAssetTree(first, upload)).resolves.toEqual(['shared.js']);
    await expect(mergeCdnAssetTree(second, upload)).resolves.toEqual(['shared.js']);
    await writeFile(path.join(second, 'shared.js'), 'different');
    await expect(mergeCdnAssetTree(second, upload)).rejects.toThrow('conflicting bytes');
  });
});

describe('remote staging CDN verification', () => {
  it('downloads exact bytes without following redirects', async () => {
    const bytes = Buffer.from('asset');
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const files = [
      {
        path: 'asset.js',
        url: 'https://staging.contoso.test/asset.js',
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')
      }
    ];

    await expect(
      verifyRemoteCdnFiles(
        { cdnBasePath: 'https://staging.contoso.test/', files },
        {
          authorization: 'Bearer hidden',
          expectedCdnBasePath: 'https://staging.contoso.test/'
        }
      )
    ).resolves.toEqual(files);
    expect(fetchMock).toHaveBeenCalledWith(
      files[0].url,
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          'Accept-Encoding': 'identity',
          Authorization: 'Bearer hidden'
        }
      })
    );
  });

  it('rejects redirects instead of following them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302 })));
    await expect(
      verifyRemoteCdnFiles(
        {
          cdnBasePath: 'https://staging.contoso.test/',
          files: [
            {
              path: 'asset.js',
              url: 'https://staging.contoso.test/asset.js',
              bytes: 1,
              sha256: 'unused'
            }
          ]
        },
        { expectedCdnBasePath: 'https://staging.contoso.test/' }
      )
    ).rejects.toThrow('HTTP 302');
  });

  it('requires the trusted prefix to equal the artifact release base', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      verifyRemoteCdnFiles(
        {
          cdnBasePath: 'https://staging.contoso.test/trusted/other-release/',
          files: [
            {
              path: 'asset.js',
              url: 'https://staging.contoso.test/trusted/other-release/asset.js',
              bytes: 1,
              sha256: 'unused'
            }
          ]
        },
        { expectedCdnBasePath: 'https://staging.contoso.test/trusted/' }
      )
    ).rejects.toThrow('does not match the trusted staging prefix');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires every remote URL to be derived exactly from its staged path', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      verifyRemoteCdnFiles(
        {
          cdnBasePath: 'https://staging.contoso.test/release/',
          files: [
            {
              path: 'asset.js',
              url: 'https://staging.contoso.test/release/different.js',
              bytes: 1,
              sha256: 'unused'
            }
          ]
        },
        { expectedCdnBasePath: 'https://staging.contoso.test/release/' }
      )
    ).rejects.toThrow('does not match its staged file path');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes each path segment when deriving its exact remote URL', async () => {
    const bytes = Buffer.from('asset');
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = {
      path: 'chunks/a file.js',
      url: 'https://staging.contoso.test/release/chunks/a%20file.js',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };

    await expect(
      verifyRemoteCdnFiles(
        { cdnBasePath: 'https://staging.contoso.test/release/', files: [file] },
        { expectedCdnBasePath: 'https://staging.contoso.test/release/' }
      )
    ).resolves.toEqual([file]);
  });

  it('refuses untrusted URLs before attaching authorization', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      verifyRemoteCdnFiles(
        {
          cdnBasePath: 'https://staging.contoso.test/release/',
          files: [
            {
              path: 'asset.js',
              url: 'https://attacker.test/asset.js',
              bytes: 1,
              sha256: 'unused'
            }
          ]
        },
        {
          authorization: 'Bearer hidden',
          expectedCdnBasePath: 'https://staging.contoso.test/release/'
        }
      )
    ).rejects.toThrow('does not match its staged file path');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('staging CDN proof manifest', () => {
  it('validates package and generated manifest URLs against the exact upload tree', async () => {
    const fixture = await createStageFixture();
    const manifest = await createCdnStageManifest(fixture);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      slug: 'team-spfx',
      releaseId: '1.2.3-rc.4',
      cdnBasePath: fixture.cdnBasePath,
      immutablePrefix: true,
      uploadRoot: 'upload',
      manifests: {
        packageComponents: ['component-id'],
        generatedComponents: ['component-id'],
        referencedFiles: 3
      },
      proof: {
        localArtifact: 'passed',
        remoteCdn: 'not-run',
        sharePointAppCatalog: 'not-run'
      }
    });
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
      'lazy.js',
      'main.js',
      'WebPartStrings_en-us.js',
      'WebPartStrings_fr-fr.js'
    ]);
    expect(manifest.files.find((file: { path: string }) => file.path === 'main.js').referencedBy).toEqual([
      'SPFx package:component-id:main',
      'generated release manifests:component-id:main'
    ]);

    await expect(verifyCdnStage(fixture.stageDir, manifest)).resolves.toMatchObject({
      files: expect.any(Array)
    });
    await writeFile(path.join(fixture.uploadDir, 'unexpected.js'), 'unexpected');
    await expect(verifyCdnStage(fixture.stageDir, manifest)).rejects.toThrow('deterministic manifest core');
  });

  it('rejects malformed or extended version 1 manifest shapes', async () => {
    const fixture = await createStageFixture();
    const manifest = await createCdnStageManifest(fixture);
    const withUnknownField = { ...manifest, unversionedExtension: true };
    await expect(verifyCdnStage(fixture.stageDir, withUnknownField)).rejects.toThrow('unsupported or missing fields');

    const malformedPackage = { ...manifest, package: { ...manifest.package, bytes: '1' } };
    await expect(verifyCdnStage(fixture.stageDir, malformedPackage)).rejects.toThrow(
      'package bytes must be a positive safe integer'
    );
  });

  it('rejects forged proof status and deterministic manifest metadata', async () => {
    const fixture = await createStageFixture();
    const manifest = await createCdnStageManifest(fixture);
    const forgedProof = {
      ...manifest,
      proof: { ...manifest.proof, remoteCdn: 'passed' }
    };
    await expect(verifyCdnStage(fixture.stageDir, forgedProof)).rejects.toThrow('proof remoteCdn must be not-run');

    const forgedReferenceCount = {
      ...manifest,
      manifests: { ...manifest.manifests, referencedFiles: manifest.manifests.referencedFiles + 1 }
    };
    await expect(verifyCdnStage(fixture.stageDir, forgedReferenceCount)).rejects.toThrow('deterministic manifest core');
  });

  it('pins version 1 manifests to the canonical staging layout', async () => {
    const fixture = await createStageFixture();
    const manifest = await createCdnStageManifest(fixture);
    await expect(verifyCdnStage(fixture.stageDir, { ...manifest, releaseLabel: 'latest' })).rejects.toThrow(
      'releaseLabel must be normalized and immutable'
    );
    await expect(verifyCdnStage(fixture.stageDir, { ...manifest, uploadRoot: 'alternate-upload' })).rejects.toThrow(
      'uploadRoot must be upload'
    );
    await expect(
      verifyCdnStage(fixture.stageDir, {
        ...manifest,
        manifests: { ...manifest.manifests, root: 'alternate-manifests' }
      })
    ).rejects.toThrow('manifests root must be manifests');
  });

  it('fails when a package manifest path is absent locally', async () => {
    const fixture = await createStageFixture();
    await rm(path.join(fixture.uploadDir, 'main.js'));
    await expect(createCdnStageManifest(fixture)).rejects.toThrow('has no local upload file');
  });

  it('fails when generated and packaged loader configs disagree', async () => {
    const fixture = await createStageFixture();
    const generatedPath = path.join(fixture.releaseManifestDir, 'component.manifest.json');
    const generated = JSON.parse(await readFile(generatedPath, 'utf8'));
    generated.loaderConfig.scriptResources.main.path = 'other.js';
    await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
    await expect(createCdnStageManifest(fixture)).rejects.toThrow('package and generated loader config');
  });

  it('fails closed on malformed resources and missing entry modules', async () => {
    const fixture = await createStageFixture();
    const generatedPath = path.join(fixture.releaseManifestDir, 'component.manifest.json');
    const generated = JSON.parse(await readFile(generatedPath, 'utf8'));
    generated.loaderConfig.entryModuleId = 'missing';
    await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
    await expect(createCdnStageManifest(fixture)).rejects.toThrow('entryModuleId');
  });

  it('rejects package paths that escape through an intermediate symlink', async () => {
    const fixture = await createStageFixture();
    const manifest = await createCdnStageManifest(fixture);
    const externalRoot = await temporaryDirectory();
    const sharepointDir = path.join(fixture.stageDir, 'sharepoint');
    const externalSharepointDir = path.join(externalRoot, 'sharepoint');
    await rename(sharepointDir, externalSharepointDir);
    await symlink(externalSharepointDir, sharepointDir, 'dir');

    await expect(verifyCdnStage(fixture.stageDir, manifest)).rejects.toThrow('resolves outside');
  });
});

async function createStageFixture() {
  const stageDir = await temporaryDirectory();
  const uploadDir = path.join(stageDir, 'upload');
  const releaseManifestDir = path.join(stageDir, 'manifests');
  const packageFile = path.join(stageDir, 'sharepoint', 'solution', 'team-spfx.staging.cdn.sppkg');
  const cdnBasePath = 'https://staging.contoso.test/spfx/team-spfx/versions/1.2.3-rc.4/';
  const componentManifest = {
    id: 'component-id',
    loaderConfig: {
      internalModuleBaseUrls: [cdnBasePath],
      entryModuleId: 'main',
      scriptResources: {
        main: { type: 'path', path: 'main.js' },
        strings: {
          type: 'localizedPath',
          defaultPath: 'WebPartStrings_en-us.js',
          paths: { 'fr-fr': 'WebPartStrings_fr-fr.js' }
        },
        react: { type: 'component', id: 'react-id', version: '17.0.1' }
      }
    }
  };
  await mkdir(uploadDir, { recursive: true });
  await mkdir(releaseManifestDir, { recursive: true });
  await mkdir(path.dirname(packageFile), { recursive: true });
  await Promise.all([
    writeFile(path.join(uploadDir, 'main.js'), 'main();'),
    writeFile(path.join(uploadDir, 'lazy.js'), 'lazy();'),
    writeFile(path.join(uploadDir, 'WebPartStrings_en-us.js'), 'strings();'),
    writeFile(path.join(uploadDir, 'WebPartStrings_fr-fr.js'), 'chaines();'),
    writeFile(path.join(releaseManifestDir, 'component.manifest.json'), `${JSON.stringify(componentManifest, null, 2)}\n`)
  ]);
  const encodedManifest = JSON.stringify(componentManifest).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  await writeFile(
    packageFile,
    zipSync({
      '[Content_Types].xml': strToU8('<Types />'),
      '_rels/.rels': strToU8('<Relationships />'),
      'AppManifest.xml': strToU8('<App />'),
      'feature/WebPart.xml': strToU8(`<Elements><ClientSideComponent ComponentManifest="${encodedManifest}" /></Elements>`)
    })
  );
  return {
    cdnBasePath,
    packageFile,
    releaseId: '1.2.3-rc.4',
    releaseManifestDir,
    slug: 'team-spfx',
    stageDir,
    uploadDir
  };
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'spfx-cdn-stage-'));
  temporaryDirectories.push(directory);
  return directory;
}
