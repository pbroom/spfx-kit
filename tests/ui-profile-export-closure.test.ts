import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
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
// @ts-expect-error plain .mjs module without type declarations
import { rewriteStandalonePackageJson } from '../packages/spfx-tools/src/lib/export/targets.mjs';

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

  it('resolves a package CSS export before binding the app source', async () => {
    const fixture = await createFixture({ bareCssImport: true });
    const closure = await createUiProfileExportClosure(fixture.artifact);

    await expect(bindUiProfileExportClosureToApp(closure, fixture.appDir)).resolves.toMatchObject({
      sourceBinding: [{ path: 'src/webpart.ts', importSpecifier: '@spfx-kit/ui-profile/styles.css' }]
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
    expect(standaloneProof.packageDependency).toMatch(/^file:\.\/spfx-ui-profile\/spfx-kit-ui-profile-0\.0\.0\.tgz$/u);
    const packageFile = path.join(standaloneDir, standaloneProof.packageDependency.slice('file:./'.length));
    await expect(readTarGzEntry(packageFile, 'package/dist/normalized/src/components/ui/button.js')).resolves.toBe(
      'fresh runtime\n'
    );
    await expect(readTarGzEntry(packageFile, 'package/dist/normalized/src/components/ui/button.d.ts')).resolves.toBe(
      'export declare const Button: unknown;\n'
    );
    await expect(access(packageFile)).resolves.toBeUndefined();
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

  it('retains only the vendored UI profile dependency in standalone package metadata', async () => {
    const targetDir = await temporaryDirectory();
    await writeJson(path.join(targetDir, 'package.json'), {
      name: '@spfx-kit/fixture',
      dependencies: {
        '@spfx-kit/ui-profile': 'file:../../packages/ui-profile',
        '@spfx-kit/internal-only': 'file:../../packages/internal-only',
        react: '17.0.1'
      },
      devDependencies: { '@microsoft/spfx-web-build-rig': '1.23.2' }
    });

    await rewriteStandalonePackageJson(targetDir, 'fixture-spfx', {
      uiProfileDependency: 'file:./spfx-ui-profile/spfx-kit-ui-profile-0.0.0.tgz'
    });

    await expect(readJson(path.join(targetDir, 'package.json'))).resolves.toMatchObject({
      name: 'fixture-spfx',
      dependencies: {
        '@spfx-kit/ui-profile': 'file:./spfx-ui-profile/spfx-kit-ui-profile-0.0.0.tgz',
        react: '17.0.1'
      },
      scripts: {
        build: expect.stringMatching(/^spfx-ui-profile-verify && heft/u),
        ship: expect.stringMatching(/^spfx-ui-profile-verify && heft/u)
      }
    });
    expect((await readJson(path.join(targetDir, 'package.json'))).dependencies).not.toHaveProperty('@spfx-kit/internal-only');
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

async function createFixture(options: { bareCssImport?: boolean } = {}) {
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
    writeFileWithParents(path.join(profileRoot, 'generated', 'font.woff2'), font),
    writeFileWithParents(path.join(profileRoot, 'dist', 'src', 'index.js'), 'export {};\n'),
    writeFileWithParents(path.join(profileRoot, 'dist', 'src', 'index.d.ts'), 'export {};\n'),
    writeFileWithParents(path.join(profileRoot, 'dist', 'normalized', 'src', 'components', 'ui', 'button.js'), 'stale runtime\n'),
    writeFileWithParents(path.join(profileRoot, '.prepared', 'base-ui', 'package.json'), '{}\n'),
    writeFileWithParents(path.join(profileRoot, 'spfx-ui-webpack.cjs'), 'module.exports = () => {};\n'),
    writeFileWithParents(
      path.join(profileRoot, 'build-runtime.cjs'),
      "const { writeFileSync } = require('node:fs');\nwriteFileSync('dist/normalized/src/components/ui/button.js', 'fresh runtime\\n');\nwriteFileSync('dist/normalized/src/components/ui/button.d.ts', 'export declare const Button: unknown;\\n');\n"
    ),
    writeJson(path.join(profileRoot, 'package.json'), {
      name: '@spfx-kit/ui-profile',
      version: '0.0.0',
      files: ['dist', '.prepared/base-ui', 'generated', 'profile.json', 'provenance.json', 'spfx-ui-webpack.cjs'],
      scripts: { 'build:runtime': 'node ./build-runtime.cjs' },
      exports: {
        './button': {
          types: './dist/normalized/src/components/ui/button.d.ts',
          import: './dist/normalized/src/components/ui/button.js'
        },
        './styles.css': './generated/profile.css'
      }
    })
  ]);
  if (options.bareCssImport) {
    const packageLink = path.join(appDir, 'node_modules', '@spfx-kit', 'ui-profile');
    await mkdir(path.dirname(packageLink), { recursive: true });
    await symlink(profileRoot, packageLink, 'dir');
    await writeFileWithParents(sourceFile, "import '@spfx-kit/ui-profile/styles.css';\n");
  } else {
    const cssImport = path.relative(path.dirname(sourceFile), cssPath).split(path.sep).join('/');
    await writeFileWithParents(sourceFile, `import '${cssImport.startsWith('.') ? cssImport : `./${cssImport}`}';\n`);
  }
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

async function readTarGzEntry(file: string, entryPath: string) {
  const archive = gunzipSync(await readFile(file));
  let offset = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    if (!name) break;
    const sizeText = header.subarray(124, 136).toString('utf8').replace(/\0.*$/u, '').trim();
    const size = Number.parseInt(sizeText, 8);
    if (!Number.isFinite(size)) throw new Error(`Invalid tar entry size for ${name}`);
    const contentOffset = offset + 512;
    if (name === entryPath) {
      return archive.subarray(contentOffset, contentOffset + size).toString('utf8');
    }
    offset = contentOffset + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Missing tar entry: ${entryPath}`);
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ui-profile-export-closure-'));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}
