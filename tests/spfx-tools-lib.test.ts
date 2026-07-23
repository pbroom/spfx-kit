import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { writeAppRepoFiles } from '../packages/spfx-tools/src/lib/app-repo-files.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { writeExportReadme } from '../packages/spfx-tools/src/lib/export/docs.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { parseArgs, required } from '../packages/spfx-tools/src/lib/args.mjs';
// @ts-expect-error plain .mjs module without type declarations
import {
  SOURCE_EDITOR_VENDOR_FILES,
  createSourceEditorVendor,
  sourceEditorDigest
} from '../packages/spfx-tools/src/lib/source-editor-vendor.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { appSlugFromDir, cdnBasePathForSlug, standalonePackageName } from '../packages/spfx-tools/src/lib/spfx.mjs';

describe('parseArgs', () => {
  it('parses flag and value pairs', () => {
    expect(parseArgs(['--app', 'x', '--json', '--target', 'single'])).toEqual({
      app: 'x',
      json: true,
      target: 'single'
    });
  });

  it('treats trailing flags as booleans', () => {
    expect(parseArgs(['--force'])).toEqual({ force: true });
  });
});

describe('source editor vendor', () => {
  it('produces a versioned, hash-checked standalone snapshot', () => {
    const canonical = 'export const language = "html";\n';
    const vendor = createSourceEditorVendor(canonical, '1.2.3', '@spfx-kit/source-editor-react');

    expect(SOURCE_EDITOR_VENDOR_FILES.map((file) => file.vendorPath)).toEqual([
      'src/vendor/source-editor/sourceEditorCore.ts',
      'src/vendor/source-editor/SourceEditorField.tsx',
      'src/vendor/source-editor/SourceWorkspaceField.tsx',
      'src/vendor/source-editor/spfx-monaco-webpack.cjs'
    ]);
    expect(vendor.digest).toBe(sourceEditorDigest(canonical));
    expect(vendor.source).toContain('Vendored from @spfx-kit/source-editor-react@1.2.3');
    expect(vendor.source).toContain(`Canonical source sha256: ${vendor.digest}`);
    expect(vendor.source.endsWith(canonical)).toBe(true);
  });
});

describe('required', () => {
  it('throws with usage when a value is missing', () => {
    expect(() => required({ json: true }, 'app', 'usage text')).toThrow('Missing required --app');
    expect(required({ app: 'x' }, 'app', 'usage')).toBe('x');
  });
});

describe('spfx helpers', () => {
  it('derives slugs and package names from app dirs', () => {
    expect(appSlugFromDir('/tmp/apps/team-divider-spfx')).toBe('team-divider-spfx');
    expect(standalonePackageName('/tmp/apps/team-divider-spfx')).toBe('team-divider-spfx');
    expect(standalonePackageName('/tmp/apps/team-divider')).toBe('team-divider-spfx');
  });

  it('builds per-app CDN base paths', () => {
    expect(cdnBasePathForSlug('team-spfx')).toBe('https://cdn.example.com/spfx/team-spfx/');
    expect(cdnBasePathForSlug('team-spfx', 'https://cdn.contoso.com/base///')).toBe('https://cdn.contoso.com/base/team-spfx/');
  });
});

describe('writeAppRepoFiles', () => {
  let appDir = '';

  afterEach(async () => {
    if (appDir) {
      await rm(appDir, { recursive: true, force: true });
      appDir = '';
    }
  });

  it('emits CI workflow, .nvmrc, and .gitignore for a fresh app', async () => {
    appDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-repo-files-'));
    const written = await writeAppRepoFiles(appDir);
    expect(written.sort()).toEqual(['.github/workflows/ci.yml', '.gitignore', '.nvmrc']);

    const workflow = await readFile(path.join(appDir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(workflow).toContain('npm run ship');
    expect(workflow).toContain('@spfx-kit/');
    expect(await readFile(path.join(appDir, '.nvmrc'), 'utf8')).toBe('22.22.3\n');
    expect(await readFile(path.join(appDir, '.gitignore'), 'utf8')).toContain('node_modules/');
  });

  it('never overwrites existing files', async () => {
    appDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-repo-files-'));
    await writeFile(path.join(appDir, '.nvmrc'), 'custom\n');
    const written = await writeAppRepoFiles(appDir);
    expect(written.sort()).toEqual(['.github/workflows/ci.yml', '.gitignore']);
    expect(await readFile(path.join(appDir, '.nvmrc'), 'utf8')).toBe('custom\n');

    expect(await writeAppRepoFiles(appDir)).toEqual([]);
  });
});

describe('writeExportReadme', () => {
  let exportDir = '';

  afterEach(async () => {
    if (exportDir) {
      await rm(exportDir, { recursive: true, force: true });
      exportDir = '';
    }
  });

  it('documents the configured package filename from the export target', async () => {
    exportDir = await mkdtemp(path.join(tmpdir(), 'spfx-kit-export-readme-'));
    const targetDir = path.join(exportDir, 'better-list-spfx-standalone');
    await writeExportReadme(exportDir, 'better-list-spfx', [
      {
        id: 'single',
        dir: targetDir,
        files: [
          { relativePath: 'README.md', size: '1 KB' },
          { relativePath: 'better-list.sppkg', size: '420 KB' }
        ]
      }
    ]);

    const readme = await readFile(path.join(exportDir, 'README.md'), 'utf8');
    expect(readme).toContain('upload `better-list.sppkg`');
    expect(readme).not.toContain('better-list-spfx-standalone.sppkg');
  });
});
