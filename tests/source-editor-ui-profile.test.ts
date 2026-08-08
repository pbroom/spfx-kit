import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs module without type declarations
import { resolveSourceEditorUiProfile, sourceEditorDigest } from '../packages/spfx-tools/src/lib/source-editor-vendor.mjs';

const repositoryRoot = path.resolve('.');
const temporaryDirectories: string[] = [];

describe('source editor UI profile', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('binds the first editor surfaces to exact React 17 profile sources and prepared Base UI closure', async () => {
    const resolved = await resolveSourceEditorUiProfile(repositoryRoot);

    expect(resolved.manifest.surfaces).toEqual([
      { consumer: 'SourceEditorField', components: ['button', 'dropdown-menu'] },
      { consumer: 'SourceWorkspaceField', components: ['tabs'] }
    ]);
    expect(resolved.manifest.preparedBaseUi).toMatchObject({
      package: '@base-ui/react',
      version: '1.6.0'
    });
    expect(resolved.files).toHaveLength(9);

    for (const file of resolved.files) {
      expect(file.vendorPath).toMatch(/^src\/vendor\/source-editor\/ui-profile\//u);
      expect(file.source).toBe(await readFile(path.join(repositoryRoot, file.sourcePath), 'utf8'));
    }

    const localMirrorPairs = [
      [
        'packages/ui-profile/normalized/src/components/ui/button.tsx',
        'packages/source-editor-react/src/ui-profile/components/ui/button.tsx'
      ],
      [
        'packages/ui-profile/normalized/src/components/ui/dropdown-menu.tsx',
        'packages/source-editor-react/src/ui-profile/components/ui/dropdown-menu.tsx'
      ],
      [
        'packages/ui-profile/normalized/src/components/ui/tabs.tsx',
        'packages/source-editor-react/src/ui-profile/components/ui/tabs.tsx'
      ],
      ['packages/ui-profile/normalized/src/lib/spfx-theme.ts', 'packages/source-editor-react/src/ui-profile/lib/spfx-theme.ts'],
      ['packages/ui-profile/normalized/src/lib/ui-root.tsx', 'packages/source-editor-react/src/ui-profile/lib/ui-root.tsx'],
      ['packages/ui-profile/normalized/src/lib/utils.ts', 'packages/source-editor-react/src/ui-profile/lib/utils.ts']
    ];
    for (const [authoritativePath, mirrorPath] of localMirrorPairs) {
      expect(await readFile(path.join(repositoryRoot, mirrorPath), 'utf8')).toBe(
        await readFile(path.join(repositoryRoot, authoritativePath), 'utf8')
      );
    }

    const componentSources = resolved.files
      .filter((file: { vendorPath: string }) => file.vendorPath.endsWith('.tsx'))
      .map((file: { source: string }) => file.source)
      .join('\n');
    expect(componentSources).toMatch(/import \* as React from ["']react["']/u);
    expect(componentSources).not.toContain('react/jsx-runtime');
    expect(componentSources).not.toContain('useId(');

    const sourceEditor = await readFile(
      path.join(repositoryRoot, 'packages/source-editor-react/src/SourceEditorField.tsx'),
      'utf8'
    );
    const packageManifest = JSON.parse(
      await readFile(path.join(repositoryRoot, 'packages/source-editor-react/package.json'), 'utf8')
    );
    expect(sourceEditor).not.toContain('@fluentui/react-components');
    expect(sourceEditor).not.toContain('.fui-');
    expect(packageManifest.peerDependencies).not.toHaveProperty('@fluentui/react-components');
    expect(packageManifest.devDependencies).not.toHaveProperty('@fluentui/react-components');
  });

  it('rejects source drift instead of refreshing a downstream snapshot', async () => {
    const fixture = await copyProfileFixture();
    const tabsPath = path.join(fixture, 'packages/ui-profile/normalized/src/components/ui/tabs.tsx');
    await writeFile(tabsPath, `${await readFile(tabsPath, 'utf8')}\n// drift\n`);

    await expect(resolveSourceEditorUiProfile(fixture)).rejects.toThrow(
      'Source editor UI profile file packages/ui-profile/normalized/src/components/ui/tabs.tsx digest differs'
    );
  });

  it('rejects arbitrary repo bytes even when their self-declared manifest digest is refreshed', async () => {
    const fixture = await copyProfileFixture();
    const tabsRelativePath = 'packages/ui-profile/normalized/src/components/ui/tabs.tsx';
    const tabsPath = path.join(fixture, tabsRelativePath);
    const arbitrarySource = `${await readFile(tabsPath, 'utf8')}\n// self-declared replacement\n`;
    await writeFile(tabsPath, arbitrarySource);
    const manifestPath = path.join(fixture, 'packages/source-editor-react/ui-profile.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const tabs = manifest.files.find((file: { sourcePath: string }) => file.sourcePath === tabsRelativePath);
    tabs.sha256 = sourceEditorDigest(arbitrarySource);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(resolveSourceEditorUiProfile(fixture)).rejects.toThrow(
      `Source editor UI profile file ${tabsRelativePath} differs from the authoritative upstream profile`
    );
  });

  it('rejects upstream manifest drift even when selected component bytes are unchanged', async () => {
    const fixture = await copyProfileFixture();
    const profilePath = path.join(fixture, 'packages/ui-profile/profile.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.generatorVersion = 'unreviewed';
    await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

    await expect(resolveSourceEditorUiProfile(fixture)).rejects.toThrow('Upstream UI profile manifest digest differs');
  });
});

async function copyProfileFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'source-editor-ui-profile-'));
  temporaryDirectories.push(fixture);
  const manifestPath = 'packages/source-editor-react/ui-profile.json';
  const manifest = JSON.parse(await readFile(path.join(repositoryRoot, manifestPath), 'utf8'));
  const copiedPaths = new Set<string>([
    manifestPath,
    'packages/source-editor-react/package.json',
    manifest.upstream.profilePath,
    manifest.upstream.provenancePath,
    manifest.preparedBaseUi.dependencyClosurePath,
    ...manifest.preparedBaseUi.contracts.map((contract: { path: string }) => contract.path),
    ...manifest.files.map((file: { sourcePath: string }) => file.sourcePath)
  ]);
  for (const relativePath of copiedPaths) {
    const target = path.join(fixture, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(repositoryRoot, relativePath)));
  }
  return fixture;
}
