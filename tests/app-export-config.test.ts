import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  describeManagedAppExportConfig,
  updateManagedAppExportConfig,
  validateExportConfig
} from '../apps/lab/server/app-export-config';
import { framedCorruptGifBytes, framedCorruptJpegBytes, pngWithDimensions, validPngBytes } from './image-fixtures';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('managed app export configuration', () => {
  it('reads defaults from the SPFx package, solution, CDN, and primary web part manifest', async () => {
    const appDir = await createFixture();

    await expect(describeManagedAppExportConfig(appDir)).resolves.toEqual({
      appName: 'Fixture App',
      fileName: 'fixture-app.sppkg',
      description: 'Fixture web part description',
      longDescription: '',
      videoUrl: '',
      appIcon: 'FixtureIcon',
      catalogIconPath: '',
      screenshotPaths: [],
      categories: [],
      version: '1.2.3',
      cdnUrl: 'https://cdn.example.test/spfx/fixture/',
      developerName: '',
      developerWebsiteUrl: '',
      privacyUrl: '',
      termsOfUseUrl: '',
      partnerId: ''
    });
  });

  it('does not expose the standard SPFx CDN template sentinel as a configured URL', async () => {
    const appDir = await createFixture();
    await writeJson(path.join(appDir, 'config', 'write-manifests.json'), {
      cdnBasePath: '<!-- PATH TO CDN -->'
    });

    await expect(describeManagedAppExportConfig(appDir)).resolves.toMatchObject({ cdnUrl: '' });
  });

  it('atomically saves an ignored sidecar overlay without modifying tracked SPFx JSON', async () => {
    const appDir = await createFixture();
    const solutionPath = path.join(appDir, 'config', 'package-solution.json');
    const sourceBefore = await readFile(solutionPath, 'utf8');
    const sidecarDir = path.join(appDir, '.spfx-kit');
    await mkdir(sidecarDir, { recursive: true });
    await writeJson(path.join(sidecarDir, 'export-config.json'), {
      appName: 'Old name',
      futureSetting: { preserve: true }
    });

    const saved = await updateManagedAppExportConfig(appDir, {
      appName: 'Deployment App',
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      longDescription: 'Deployment details.\n\nMore information.',
      videoUrl: 'https://youtu.be/example',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png', 'https://images.example.test/tour.jpg'],
      categories: ['Collaboration', 'Productivity'],
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/',
      developerName: 'Fixture Org',
      developerWebsiteUrl: 'https://www.example.test/',
      privacyUrl: 'https://www.example.test/privacy',
      termsOfUseUrl: 'https://www.example.test/terms',
      partnerId: '1234567'
    });

    expect(saved).toEqual({
      appName: 'Deployment App',
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      longDescription: 'Deployment details.\n\nMore information.',
      videoUrl: 'https://youtu.be/example',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png', 'https://images.example.test/tour.jpg'],
      categories: ['Collaboration', 'Productivity'],
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/',
      developerName: 'Fixture Org',
      developerWebsiteUrl: 'https://www.example.test/',
      privacyUrl: 'https://www.example.test/privacy',
      termsOfUseUrl: 'https://www.example.test/terms',
      partnerId: '1234567'
    });
    await expect(describeManagedAppExportConfig(appDir)).resolves.toEqual(saved);
    expect(JSON.parse(await readFile(path.join(sidecarDir, 'export-config.json'), 'utf8'))).toEqual({
      appName: 'Deployment App',
      futureSetting: { preserve: true },
      fileName: 'deployment-app.sppkg',
      description: 'Deployment description',
      longDescription: 'Deployment details.\n\nMore information.',
      videoUrl: 'https://youtu.be/example',
      appIcon: 'https://cdn.example.test/icons/deployment.png',
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png', 'https://images.example.test/tour.jpg'],
      categories: ['Collaboration', 'Productivity'],
      version: '2.4.6',
      cdnUrl: 'https://cdn.example.test/spfx/deployment/',
      developerName: 'Fixture Org',
      developerWebsiteUrl: 'https://www.example.test/',
      privacyUrl: 'https://www.example.test/privacy',
      termsOfUseUrl: 'https://www.example.test/terms',
      partnerId: '1234567'
    });
    expect(await readFile(solutionPath, 'utf8')).toBe(sourceBefore);
  });

  it('rejects unsafe filenames, invalid versions, and non-production CDN URLs', async () => {
    const appDir = await createFixture();
    const valid = {
      appName: 'Fixture App',
      fileName: 'fixture.sppkg',
      description: '',
      longDescription: '',
      videoUrl: '',
      appIcon: 'Page',
      catalogIconPath: '',
      screenshotPaths: [],
      categories: [],
      version: '1.2.3',
      cdnUrl: 'https://cdn.example.test/spfx/fixture/',
      developerName: '',
      developerWebsiteUrl: '',
      privacyUrl: '',
      termsOfUseUrl: '',
      partnerId: ''
    };

    await expect(validateExportConfig(appDir, { ...valid, fileName: '../fixture.sppkg' })).rejects.toThrow('directory path');
    await expect(validateExportConfig(appDir, { ...valid, version: '1.2.3.4' })).rejects.toThrow('x.y.z');
    await expect(validateExportConfig(appDir, { ...valid, cdnUrl: 'javascript:alert(1)' })).rejects.toThrow('HTTPS');
    await expect(validateExportConfig(appDir, { ...valid, cdnUrl: 'http://cdn.example.test/spfx/' })).rejects.toThrow('HTTPS');
    await expect(validateExportConfig(appDir, { ...valid, cdnUrl: 'https://localhost/spfx/' })).rejects.toThrow('non-localhost');
    await expect(validateExportConfig(appDir, { ...valid, videoUrl: 'https://videos.example.test/demo' })).rejects.toThrow(
      'YouTube or Vimeo'
    );
    await expect(validateExportConfig(appDir, { ...valid, categories: ['Unknown'] })).rejects.toThrow('Unsupported');
    await expect(
      validateExportConfig(appDir, { ...valid, screenshotPaths: ['assets/screenshot.png', 'https://img.test/screenshot.png'] })
    ).rejects.toThrow('must be unique');
    await expect(validateExportConfig(appDir, { ...valid, catalogIconPath: '../catalog-icon.png' })).rejects.toThrow(
      'package-relative'
    );
    await expect(validateExportConfig(appDir, { ...valid, catalogIconPath: 'assets/missing.png' })).rejects.toThrow(
      'does not exist'
    );
    await expect(validateExportConfig(appDir, { ...valid, catalogIconPath: 'assets/not-an-image.png' })).rejects.toThrow(
      'corrupt or undecodable'
    );
    const outsideDir = await makeTemporaryDirectory('spfx-export-image-outside-');
    const outsideIcon = path.join(outsideDir, 'outside.png');
    await writeFile(outsideIcon, validPngBytes());
    await symlink(outsideIcon, path.join(appDir, 'sharepoint', 'assets', 'linked.png'));
    await expect(validateExportConfig(appDir, { ...valid, catalogIconPath: 'assets/linked.png' })).rejects.toThrow(
      'symbolic links'
    );
  });

  it('accepts decoded PNGs and rejects corrupt PNGs and unsupported local GIF/JPEG data', async () => {
    const appDir = await createFixture();
    const assetsDir = path.join(appDir, 'sharepoint', 'assets');
    const valid = {
      appName: 'Fixture App',
      fileName: 'fixture.sppkg',
      description: '',
      longDescription: '',
      videoUrl: '',
      appIcon: 'Page',
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png'],
      categories: [],
      version: '1.2.3',
      cdnUrl: '',
      developerName: '',
      developerWebsiteUrl: '',
      privacyUrl: '',
      termsOfUseUrl: '',
      partnerId: ''
    };
    await expect(validateExportConfig(appDir, valid)).resolves.toMatchObject({
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png']
    });

    const corruptImages = [
      ['truncated-signature.png', validPngBytes().subarray(0, 8)],
      ['truncated-body.png', validPngBytes().subarray(0, -4)]
    ] as const;
    for (const [fileName, bytes] of corruptImages) {
      await writeFile(path.join(assetsDir, fileName), bytes);
      await expect(
        validateExportConfig(appDir, { ...valid, catalogIconPath: '', screenshotPaths: [`assets/${fileName}`] })
      ).rejects.toThrow(/truncated|missing|invalid|corrupt/i);
    }

    const corruptGif = framedCorruptGifBytes();
    const corruptJpeg = framedCorruptJpegBytes();
    expect(corruptJpeg).toHaveLength(28);
    await writeFile(path.join(assetsDir, 'framed-corrupt.gif'), corruptGif);
    await writeFile(path.join(assetsDir, 'framed-corrupt.jpg'), corruptJpeg);
    for (const fileName of ['framed-corrupt.gif', 'framed-corrupt.jpg']) {
      await expect(
        validateExportConfig(appDir, { ...valid, catalogIconPath: '', screenshotPaths: [`assets/${fileName}`] })
      ).rejects.toThrow('package-local image must use PNG');
    }

    await writeFile(path.join(assetsDir, 'excessive.png'), pngWithDimensions(8193, 1));
    await expect(
      validateExportConfig(appDir, { ...valid, catalogIconPath: '', screenshotPaths: ['assets/excessive.png'] })
    ).rejects.toThrow('dimensions');
  });

  it('migrates a legacy saved description while retaining package catalog defaults', async () => {
    const appDir = await createFixture();
    const solutionPath = path.join(appDir, 'config', 'package-solution.json');
    const solution = JSON.parse(await readFile(solutionPath, 'utf8'));
    solution.solution.iconPath = 'assets/catalog-icon.png';
    solution.solution.metadata = {
      shortDescription: { default: 'Source short description' },
      longDescription: { default: 'Source long description' },
      screenshotPaths: ['assets/screenshot.png'],
      videoUrl: 'https://vimeo.com/123',
      categories: ['Productivity']
    };
    solution.solution.developer = {
      name: 'Source Org',
      websiteUrl: 'https://source.example.test/',
      privacyUrl: 'https://source.example.test/privacy',
      termsOfUseUrl: 'https://source.example.test/terms',
      mpnId: 'source-partner'
    };
    await writeJson(solutionPath, solution);
    await mkdir(path.join(appDir, '.spfx-kit'), { recursive: true });
    await writeJson(path.join(appDir, '.spfx-kit', 'export-config.json'), {
      appName: 'Legacy App',
      fileName: 'legacy.sppkg',
      description: 'Saved legacy description',
      appIcon: 'Page',
      version: '1.2.3',
      cdnUrl: ''
    });

    await expect(describeManagedAppExportConfig(appDir)).resolves.toMatchObject({
      description: 'Saved legacy description',
      longDescription: 'Source long description',
      catalogIconPath: 'assets/catalog-icon.png',
      screenshotPaths: ['assets/screenshot.png'],
      categories: ['Productivity'],
      developerName: 'Source Org'
    });
  });

  it('refuses to follow an app-local configuration directory outside the managed app', async () => {
    const appDir = await createFixture();
    const outsideDir = await makeTemporaryDirectory('spfx-export-config-outside-');
    await symlink(outsideDir, path.join(appDir, '.spfx-kit'), 'dir');

    await expect(
      updateManagedAppExportConfig(appDir, {
        appName: 'Fixture App',
        fileName: 'fixture.sppkg',
        description: '',
        appIcon: 'Page',
        version: '1.2.3',
        cdnUrl: ''
      })
    ).rejects.toThrow('must be a regular app-local directory');
  });
});

async function createFixture(): Promise<string> {
  const appDir = await makeTemporaryDirectory('spfx-export-config-');
  await Promise.all([
    mkdir(path.join(appDir, 'config'), { recursive: true }),
    mkdir(path.join(appDir, 'src', 'webparts', 'fixture'), { recursive: true }),
    mkdir(path.join(appDir, 'sharepoint', 'assets'), { recursive: true })
  ]);
  await Promise.all([
    writeJson(path.join(appDir, 'package.json'), {
      name: '@fixture/fixture-app-spfx',
      version: '1.2.3',
      private: true
    }),
    writeJson(path.join(appDir, 'config', 'package-solution.json'), {
      $schema: 'preserved-schema',
      solution: {
        name: 'Fixture App',
        version: '1.2.3.0',
        includeClientSideAssets: true
      },
      paths: { packageDir: 'sharepoint', zippedPackage: 'solution/fixture-app.sppkg' }
    }),
    writeJson(path.join(appDir, 'config', 'write-manifests.json'), {
      cdnBasePath: 'https://cdn.example.test/spfx/fixture/'
    }),
    writeJson(path.join(appDir, 'src', 'webparts', 'fixture', 'Fixture.manifest.json'), {
      componentType: 'WebPart',
      preconfiguredEntries: [
        {
          title: { default: 'Fixture web part' },
          description: { default: 'Fixture web part description' },
          officeFabricIconFontName: 'FixtureIcon'
        }
      ]
    }),
    writeFile(path.join(appDir, 'sharepoint', 'assets', 'catalog-icon.png'), validPngBytes()),
    writeFile(path.join(appDir, 'sharepoint', 'assets', 'screenshot.png'), validPngBytes()),
    writeFile(path.join(appDir, 'sharepoint', 'assets', 'not-an-image.png'), 'not an image')
  ]);
  return appDir;
}

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
