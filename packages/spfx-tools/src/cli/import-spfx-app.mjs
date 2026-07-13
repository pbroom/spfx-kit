#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, required } from '../lib/args.mjs';
import {
  copyManagedSpfxSource,
  exists,
  managedAppDir,
  normalizeManagedSpfxTsconfig,
  preserveOriginalLock,
  readJson,
  writeJson
} from '../lib/fs.mjs';
import { readSpfxSummary } from '../lib/spfx.mjs';
import { labAdapterTsconfig } from '../lib/spfx-support.mjs';

const usage = `Usage:
  import-spfx-app --source <git-url-or-path> --name <slug> [--ref <ref>] [--force]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = required(args, 'source', usage);
  const requestedName = required(args, 'name', usage);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(requestedName)) {
    throw new Error('--name must be a lowercase slug using letters, numbers, and hyphens.');
  }
  const slug = requestedName.endsWith('-spfx') ? requestedName : `${requestedName}-spfx`;

  const rootDir = process.cwd();
  const targetDir = managedAppDir(rootDir, slug);
  if ((await exists(targetDir)) && !args.force) {
    throw new Error(`Refusing to overwrite existing app: ${targetDir}. Pass --force to replace it.`);
  }

  const { sourceDir, cleanup } = await resolveSource(source, args.ref);
  try {
    if (!(await exists(path.join(sourceDir, 'package.json')))) {
      throw new Error(`No package.json found in source: ${sourceDir}`);
    }

    if (args.force) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await copyManagedSpfxSource(sourceDir, targetDir);
    const hadOriginalLock = await preserveOriginalLock(sourceDir, targetDir);

    const summary = await readSpfxSummary(targetDir);
    const packagePath = path.join(targetDir, 'package.json');
    const packageJson = await readJson(packagePath);
    packageJson.name = `@spfx-kit/${slug}`;
    packageJson.private = true;
    delete packageJson.exports;
    await writeJson(packagePath, packageJson);

    await writeJson(path.join(targetDir, '.spfx-kit', 'import.json'), {
      source,
      ref: args.ref || null,
      importedAt: new Date().toISOString(),
      originalLockfilePreserved: hadOriginalLock,
      ...summary
    });

    await scaffoldLabAdapter(targetDir, slug, packageJson.description || summary.originalPackageName);
    await normalizeManagedSpfxTsconfig(rootDir, targetDir);
    console.log(`Imported ${source} into ${path.relative(rootDir, targetDir).replace(/\\/g, '/')}`);
  } finally {
    await cleanup();
  }
}

async function resolveSource(source, ref) {
  if (/^(https?:|git@)/.test(source)) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-import-'));
    const clone = spawnSync('git', ['clone', '--depth=1', ...(ref ? ['--branch', ref] : []), source, tmp], {
      stdio: 'inherit'
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed for ${source}`);
    }
    return { sourceDir: tmp, cleanup: () => rm(tmp, { recursive: true, force: true }) };
  }

  return {
    sourceDir: path.resolve(source),
    cleanup: async () => undefined
  };
}

async function scaffoldLabAdapter(targetDir, slug, description) {
  const adapterPath = path.join(targetDir, '.spfx-kit', 'lab', 'register.tsx');
  await writeJson(path.join(targetDir, '.spfx-kit', 'lab', 'tsconfig.json'), labAdapterTsconfig());
  if (await exists(adapterPath)) {
    return;
  }

  const title = titleFromSlug(slug);
  const source = `import * as React from 'react';
import type { LabPropertyBag, LabWebPart, LabWebPartRegistry } from '@spfx-kit/spfx-lab-runtime';

export type ${toPascal(slug)}LabProps = LabPropertyBag & {
  title: string;
  description: string;
};

const defaultProps: ${toPascal(slug)}LabProps = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description || 'Imported SPFx web part')}
};

const Preview: React.FunctionComponent<{ props: ${toPascal(slug)}LabProps }> = ({ props }) => (
  <section style={{ fontFamily: '"Segoe UI", sans-serif', color: '#242424' }}>
    <h2 style={{ margin: 0, fontSize: 24 }}>{props.title}</h2>
    <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>{props.description}</p>
  </section>
);

const webPart: LabWebPart<${toPascal(slug)}LabProps> = {
  id: '${slug}:default',
  appId: '${slug}',
  title: '${title}',
  description: 'Imported SPFx web part adapter stub.',
  defaultProps,
  controls: [
    { type: 'text', name: 'title', label: 'Title' },
    { type: 'textarea', name: 'description', label: 'Description' }
  ],
  render: Preview
};

export function register(registry: LabWebPartRegistry): void {
  registry.register(webPart);
}
`;
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(adapterPath, source);
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function toPascal(slug) {
  return titleFromSlug(slug).replace(/[^A-Za-z0-9]/g, '') || 'ImportedSpfx';
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
