import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tarballPath = process.argv[2];
const expectedSha1 = '2f485492e0ee822be13b1b45e3092922963737ae';
const expectedIntegrity = 'sha512-0WNThgC6CMWNXXBxTbaYYcunj08iB5rnx4/G56UOPeL9UVIUGGHA1GR0EWIh9Ebabj7NpCRawQ5b0hfN1jQmYQ==';

if (!tarballPath) {
  throw new Error('Usage: node scripts/generate-monaco-runtime-inventory.mjs <monaco-editor-0.53.0.tgz>');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function roleFor(relativePath) {
  if (relativePath === 'loader.js') return 'amd-loader';
  if (relativePath === 'editor/editor.main.js') return 'editor-main';
  if (relativePath === 'style.css') return 'stylesheet-with-embedded-support-assets';
  if (relativePath.startsWith('assets/') && relativePath.includes('worker')) return 'worker';
  if (relativePath.startsWith('nls.messages')) return 'localization';
  if (relativePath.includes('/monaco.contribution.js') || relativePath.includes('contribution.')) {
    return 'language-contribution';
  }
  return 'runtime-module';
}

function decodeEmbeddedAsset(css, mediaType) {
  const marker = `data:${mediaType};base64,`;
  const markerIndex = css.indexOf(marker);
  if (markerIndex < 0) return null;
  const encoded = css.slice(markerIndex + marker.length).split(/[)'"]/u, 1)[0];
  const bytes = Buffer.from(encoded, 'base64');
  return {
    mediaType,
    decodedBytes: bytes.length,
    decodedSha256: sha256(bytes)
  };
}

function cssUrlInventory(css) {
  const references = [...css.matchAll(/url\(([^)]+)\)/gu)].map((match) => match[1].replace(/^['"]|['"]$/gu, ''));
  return {
    total: references.length,
    dataUris: references.filter((reference) => reference.startsWith('data:')).length,
    relativeOrExternal: references.filter((reference) => !reference.startsWith('data:'))
  };
}

async function generateInventory(packageRoot) {
  const files = [];
  for (const absolute of (await walk(packageRoot)).sort()) {
    const bytes = await readFile(absolute);
    const metadata = await stat(absolute);
    const relativePath = path.relative(packageRoot, absolute).split(path.sep).join('/');
    files.push({
      path: relativePath,
      bytes: metadata.size,
      sha256: sha256(bytes),
      role: roleFor(relativePath)
    });
  }

  const styleBytes = await readFile(path.join(packageRoot, 'style.css'));
  const style = styleBytes.toString('utf8');
  const cssUrls = cssUrlInventory(style);
  const codicon = decodeEmbeddedAsset(style, 'font/ttf');
  const fontFilesInTree = files.filter((file) => /\.(?:otf|ttf|woff2?)$/iu.test(file.path)).map((file) => file.path);
  if (
    !codicon ||
    !style.includes('@font-face') ||
    !style.includes('font-family:codicon') ||
    cssUrls.total !== 5 ||
    cssUrls.dataUris !== 5 ||
    cssUrls.relativeOrExternal.length !== 0 ||
    fontFilesInTree.length !== 0
  ) {
    throw new Error('The Monaco CSS support-asset shape changed; review and update the inventory contract.');
  }
  const canonical = files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join('');
  const inventory = {
    schemaVersion: 1,
    kind: 'monaco-npm-min-vs-tree-inventory',
    evidenceBoundary:
      'Exact npm min/vs regular-file tree inventory only. It does not prove a runtime request closure, jsDelivr bytes or headers, browser requests, CSP, CORS, cache behavior, publication, deployment, fallback, retention, rollback, or shared-resource acceptance.',
    sourceRevision: {
      repository: 'pbroom/spfx-kit',
      commitSha: '90bde2f30fd9db4f524583c5cad84de1063c5f21'
    },
    package: {
      name: 'monaco-editor',
      version: '0.53.0',
      registryTarball: 'https://registry.npmjs.org/monaco-editor/-/monaco-editor-0.53.0.tgz',
      npmShasum: expectedSha1,
      npmIntegrity: expectedIntegrity,
      packageRoot: 'min/vs'
    },
    reproduction: {
      node: '22.22.3',
      commands: [
        'npm pack monaco-editor@0.53.0 --ignore-scripts --json',
        'node scripts/generate-monaco-runtime-inventory.mjs monaco-editor-0.53.0.tgz'
      ],
      provenanceVerification:
        'The generator verifies the tarball SHA-1, SHA-512 npm integrity, extracted package name, and extracted package version before inventorying min/vs.',
      canonicalTreeRecord: '<relative-path>\\0<byte-count>\\0<sha256>\\n, sorted by relative path'
    },
    runtimeBindings: [
      {
        consumer: 'code-workbench',
        sourcePath: 'apps/lab/src/components/PropertyPane.tsx',
        sourceLines: [53, 147, 160],
        loaderMode: 'amd-remote',
        baseUrlConsumed: true,
        behavior: 'Passes https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs to CodeWorkspaceEditor.'
      },
      {
        consumer: 'code-workbench',
        sourcePath: 'apps/lab/src/components/CodeWorkspaceEditor.tsx',
        sourceLines: [49, 58, 91, 95, 306, 315],
        loaderMode: 'amd-remote',
        baseUrlConsumed: true,
        configuredLanguages: ['typescript', 'html', 'css', 'scss', 'javascript'],
        behavior: 'Configures @monaco-editor/react loader paths.vs for the Lab Workbench AMD path.'
      },
      {
        consumer: 'source-editor',
        sourcePath: 'apps/lab/src/components/SourceEditor.tsx',
        sourceLines: [15, 16, 30, 32, 40, 51, 52, 68, 84, 87, 347, 352, 455, 460, 824, 850, 855, 864],
        loaderMode: 'esm-bundled-default-with-configurable-adapter',
        baseUrlConsumption: {
          defaultAdapter: false,
          customAdapter: 'caller-defined; may consume the configured URL'
        },
        defaultBaseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs',
        behavior:
          'MonacoSurface passes the configured baseUrl to adapter.load(baseUrl). The built-in adapter ignores it and imports bundled Monaco ESM, but a supported caller-supplied adapter can consume the default jsDelivr URL and request that remote tree.'
      }
    ],
    embeddedSupportAssets: {
      container: 'style.css',
      codicon,
      codiconFontDataUris: (style.match(/data:font\/ttf;base64/g) || []).length,
      pngDataUris: (style.match(/data:image\/png;base64/g) || []).length,
      svgDataUris: (style.match(/data:image\/svg\+xml;base64/g) || []).length,
      cssUrls,
      fontFaceFamily: style.includes('@font-face') && style.includes('font-family:codicon') ? 'codicon' : null,
      fontFilesInTree
    },
    requiredDisposition: {
      owners: ['A2', 'A7'],
      removalIssues: ['https://github.com/pbroom/spfx-kit/issues/83', 'https://github.com/pbroom/spfx-kit/issues/85'],
      default: 'bundled/local',
      publicCdnFallback: 'forbidden',
      sharedResourceGate:
        'A future shared runtime requires immutable complete bytes, headers, browser CSP/CORS/cache behavior, fallback, retention, and rollback evidence before use.'
    },
    proofStatus: {
      npmMinVsRegularFileTreeInventory: 'recorded',
      publicDelivery: 'not-run',
      runtime: 'not-run',
      fallback: 'not-run',
      rollback: 'not-run'
    },
    tree: {
      entryCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      canonicalSha256: sha256(canonical),
      files
    }
  };

  return `${JSON.stringify(inventory, null, 2)}\n`;
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'spfx-kit-monaco-inventory-'));

try {
  const tarball = await readFile(tarballPath);
  const actualSha1 = createHash('sha1').update(tarball).digest('hex');
  const actualIntegrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
  if (actualSha1 !== expectedSha1 || actualIntegrity !== expectedIntegrity) {
    throw new Error('The Monaco tarball does not match the pinned npm shasum and integrity.');
  }

  execFileSync('tar', ['-xzf', tarballPath, '-C', temporaryRoot]);
  const extractedPackageRoot = path.join(temporaryRoot, 'package');
  const metadata = JSON.parse(await readFile(path.join(extractedPackageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== 'monaco-editor' || metadata.version !== '0.53.0') {
    throw new Error(`Unexpected extracted package identity: ${metadata.name}@${metadata.version}`);
  }

  process.stdout.write(await generateInventory(path.join(extractedPackageRoot, 'min', 'vs')));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
