import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';

// @ts-expect-error plain .mjs module without type declarations
import { clearGeneratedCdnOutputs } from '../packages/spfx-tools/src/lib/cdn-stage.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  bindUiProfileExportClosureToApp,
  clearUiProfileBuildOutputs,
  createUiProfileExportClosure,
  materializeStandaloneUiProfileClosure,
  verifyEmbeddedUiProfileClosure,
  verifyExternalUiProfileClosure,
  verifyStandaloneUiProfileClosure,
  writeUiProfileDeliveryEvidence
} from '../packages/spfx-tools/src/lib/export/ui-profile-closure.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { expectedSppkgPath } from '../packages/spfx-tools/src/lib/sppkg.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { writeJson } from '../packages/spfx-tools/src/lib/fs.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('UI profile export closure', () => {
  it('hashes local CSS assets and binds only the exact app import', async () => {
    const fixture = await createFixture();
    const closure = await createUiProfileExportClosure(fixture.artifact);
    const bound = await bindUiProfileExportClosureToApp(closure, fixture.appDir);

    expect(bound).toMatchObject({
      descriptor: {
        schemaVersion: 1,
        profileId: 'react17-base-nova',
        css: {
          path: 'generated/profile.css',
          assets: [{ path: 'generated/font.woff2', bytes: fixture.font.byteLength, sha256: sha256(fixture.font) }]
        }
      },
      sourceBinding: [{ path: 'src/webpart.ts', sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }]
    });
  });

  it('fails closed for ambiguous CSS URLs and missing local assets', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.cssPath, '.x{background:url(https://cdn.test/a.png)}');
    await expect(
      createUiProfileExportClosure({ ...fixture.artifact, cssSha256: sha256(await readFile(fixture.cssPath)) })
    ).rejects.toThrow('non-local or ambiguous');

    await writeFile(fixture.cssPath, '.x{background:url(./missing.png)}');
    await expect(
      createUiProfileExportClosure({ ...fixture.artifact, cssSha256: sha256(await readFile(fixture.cssPath)) })
    ).rejects.toThrow('ENOENT');
  });

  it('proves embedded ClientSideAssets and reconciled external trees against one descriptor', async () => {
    const fixture = await createFixture();
    const closure = await createUiProfileExportClosure(fixture.artifact);
    const cssBytes = await readFile(fixture.cssPath);
    const packageFile = path.join(fixture.root, 'app.sppkg');
    await writePackage(packageFile, {
      [`ClientSideAssets/${closure.descriptor.css.deliveryPath}`]: cssBytes,
      [`ClientSideAssets/${closure.descriptor.css.assets[0].deliveryPath}`]: fixture.font
    });

    await expect(verifyEmbeddedUiProfileClosure(packageFile, closure)).resolves.toMatchObject({
      mode: 'embedded',
      descriptorSha256: closure.descriptorSha256,
      status: 'passed',
      files: 2
    });

    await writePackage(packageFile, {
      [`ClientSideAssets/${closure.descriptor.css.deliveryPath}`]: strToU8(
        `[data-spfx-ui-scope="${fixture.artifact.scopeValue}"]{color:red}`
      ),
      [`ClientSideAssets/${closure.descriptor.css.assets[0].deliveryPath}`]: fixture.font
    });
    await expect(verifyEmbeddedUiProfileClosure(packageFile, closure)).rejects.toThrow('missing the exact manifest CSS artifact');

    const releaseAssetsDir = path.join(fixture.root, 'release', 'assets');
    const deployAssetsDir = path.join(fixture.root, 'temp', 'deploy');
    await writeFileWithParents(path.join(releaseAssetsDir, closure.descriptor.css.deliveryPath), cssBytes);
    await writeFileWithParents(path.join(deployAssetsDir, closure.descriptor.css.assets[0].deliveryPath), fixture.font);
    await expect(verifyExternalUiProfileClosure({ releaseAssetsDir, deployAssetsDir }, closure)).resolves.toMatchObject({
      mode: 'external',
      descriptorSha256: closure.descriptorSha256,
      files: 2
    });

    await writeFileWithParents(
      path.join(deployAssetsDir, closure.descriptor.css.deliveryPath),
      `[data-spfx-ui-scope="${fixture.artifact.scopeValue}"]{color:red}`
    );
    await expect(verifyExternalUiProfileClosure({ releaseAssetsDir, deployAssetsDir }, closure)).rejects.toThrow(
      'conflicting bytes'
    );
  });

  it('verifies standalone source parity without installing or building it and persists shared evidence', async () => {
    const fixture = await createFixture();
    const closure = await bindUiProfileExportClosureToApp(await createUiProfileExportClosure(fixture.artifact), fixture.appDir);
    const standaloneDir = path.join(fixture.root, 'standalone');
    const outDir = path.join(fixture.root, 'out');
    await cp(fixture.appDir, standaloneDir, { recursive: true });
    const standaloneProof = await materializeStandaloneUiProfileClosure(fixture.appDir, standaloneDir, closure);
    const exportedSource = await readFile(path.join(standaloneDir, 'src', 'webpart.ts'), 'utf8');
    const exportedImport = exportedSource.match(/import\s+['"]([^'"]+\.css)['"]/u)?.[1];
    expect(exportedImport).toBeTruthy();
    const exportedCss = path.resolve(standaloneDir, 'src', exportedImport!);
    expect(path.relative(standaloneDir, exportedCss).startsWith('..')).toBe(false);
    await expect(readFile(exportedCss)).resolves.toEqual(await readFile(fixture.cssPath));
    const externalProof = {
      schemaVersion: 1,
      mode: 'external',
      descriptorSha256: closure.descriptorSha256,
      status: 'passed',
      files: 1,
      treeSha256: 'a'.repeat(64)
    };
    const evidenceFile = await writeUiProfileDeliveryEvidence(
      outDir,
      closure,
      [
        { id: 'cdn', uiProfileDelivery: externalProof },
        { id: 'standalone', uiProfileDelivery: standaloneProof }
      ],
      writeJson
    );

    expect(evidenceFile).toBe(path.join(outDir, 'ui-profile-delivery.json'));
    await expect(readJson(evidenceFile)).resolves.toMatchObject({
      schemaVersion: 1,
      descriptorSha256: closure.descriptorSha256,
      targets: [
        { target: 'cdn', descriptorSha256: closure.descriptorSha256 },
        { target: 'standalone', descriptorSha256: closure.descriptorSha256 }
      ]
    });

    await writeFile(exportedCss, 'drift');
    await expect(verifyStandaloneUiProfileClosure(fixture.appDir, standaloneDir, closure)).rejects.toThrow(
      'missing the exact manifest CSS artifact'
    );
  });

  it('clears generated CDN trees and only the configured package before a build', async () => {
    const root = await temporaryDirectory();
    const expectedPackage = path.join(root, 'sharepoint', 'solution', 'exact.sppkg');
    const unrelatedPackage = path.join(root, 'sharepoint', 'solution', 'keep.sppkg');
    await writeJson(path.join(root, 'config', 'package-solution.json'), {
      paths: { zippedPackage: 'solution/exact.sppkg' },
      solution: { includeClientSideAssets: true }
    });
    await Promise.all([
      writeFileWithParents(expectedPackage, 'stale'),
      writeFileWithParents(unrelatedPackage, 'keep'),
      writeFileWithParents(path.join(root, 'release', 'assets', 'stale.js'), 'stale'),
      writeFileWithParents(path.join(root, 'release', 'manifests', 'stale.json'), 'stale'),
      writeFileWithParents(path.join(root, 'temp', 'deploy', 'stale.js'), 'stale')
    ]);

    await clearUiProfileBuildOutputs(root, clearGeneratedCdnOutputs, expectedSppkgPath);

    await expect(access(expectedPackage)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(path.join(root, 'release', 'assets'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(unrelatedPackage, 'utf8')).resolves.toBe('keep');
  });
});

async function createFixture() {
  const root = await temporaryDirectory();
  const profileRoot = path.join(root, 'packages', 'ui-profile');
  const appDir = path.join(root, '.spfx-kit', 'apps', 'fixture-spfx');
  const cssPath = path.join(profileRoot, 'generated', 'profile.css');
  const font = Buffer.from('fixture-font');
  const css = `[data-spfx-ui-scope="fixture-scope"]{font-family:x}@font-face{src:url('./font.woff2')}`;
  const profilePath = path.join(profileRoot, 'profile.json');
  const sourceFile = path.join(appDir, 'src', 'webpart.ts');
  await Promise.all([
    writeFileWithParents(profilePath, '{}'),
    writeFileWithParents(path.join(profileRoot, 'provenance.json'), '{}'),
    writeFileWithParents(cssPath, css),
    writeFileWithParents(path.join(profileRoot, 'generated', 'font.woff2'), font)
  ]);
  const cssImport = path.relative(path.dirname(sourceFile), cssPath).split(path.sep).join('/');
  await writeFileWithParents(sourceFile, `import '${cssImport.startsWith('.') ? cssImport : `./${cssImport}`}';\n`);
  return {
    root,
    appDir,
    cssPath,
    font,
    artifact: {
      profileId: 'react17-base-nova',
      profilePath,
      profileSha256: sha256('{}'),
      provenanceSha256: sha256('{}'),
      cssPath,
      cssRelativePath: 'generated/profile.css',
      cssSha256: sha256(css),
      scopeValue: 'fixture-scope',
      scopeSelector: '[data-spfx-ui-scope="fixture-scope"]'
    }
  };
}

async function writePackage(file: string, extraEntries: Record<string, Uint8Array>) {
  await writeFileWithParents(
    file,
    zipSync({
      '[Content_Types].xml': strToU8('<Types />'),
      '_rels/.rels': strToU8('<Relationships />'),
      'AppManifest.xml': strToU8('<App />'),
      ...extraEntries
    })
  );
}

async function writeFileWithParents(file: string, contents: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ui-profile-export-closure-'));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}
