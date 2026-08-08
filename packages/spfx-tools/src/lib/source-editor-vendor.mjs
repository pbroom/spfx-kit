import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_EDITOR_VENDOR_TARGETS = [
  'better-divider-spfx',
  'better-text-spfx',
  'better-list-spfx'
];

const SOURCE_EDITOR_COMMON_VENDOR_FILES = [
  {
    packageName: '@spfx-kit/source-editor-core',
    sourcePath: 'packages/source-editor-core/src/index.ts',
    packagePath: 'packages/source-editor-core/package.json',
    vendorPath: 'src/vendor/source-editor/sourceEditorCore.ts'
  },
  {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/src/SourceEditorField.tsx',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/SourceEditorField.tsx'
  },
  {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/spfx-monaco-webpack.cjs',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/spfx-monaco-webpack.cjs'
  }
];

const SOURCE_EDITOR_WORKSPACE_VENDOR_FILE = {
  packageName: '@spfx-kit/source-editor-react',
  sourcePath: 'packages/source-editor-react/src/SourceWorkspaceField.tsx',
  packagePath: 'packages/source-editor-react/package.json',
  vendorPath: 'src/vendor/source-editor/SourceWorkspaceField.tsx'
};

const SOURCE_EDITOR_MONACO_ADAPTERS = Object.freeze({
  full: {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/src/sourceEditorMonacoAdapter.full.ts',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/sourceEditorMonacoAdapter.ts'
  },
  'scss-only': {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/src/sourceEditorMonacoAdapter.scss-only.ts',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/sourceEditorMonacoAdapter.ts'
  }
});

export const SOURCE_EDITOR_CONSUMER_PROFILES = Object.freeze({
  'better-list-spfx': Object.freeze({
    key: 'full',
    profileId: 'source-editor-react17-base-nova-v1',
    languages: Object.freeze(['html', 'scss']),
    surfaces: Object.freeze([
      Object.freeze({ consumer: 'SourceEditorField', components: Object.freeze(['button', 'dropdown-menu']) }),
      Object.freeze({ consumer: 'SourceWorkspaceField', components: Object.freeze(['tabs']) })
    ])
  }),
  'better-divider-spfx': Object.freeze({
    key: 'scss-only',
    profileId: 'source-editor-scss-react17-base-nova-v1',
    languages: Object.freeze(['scss']),
    surfaces: Object.freeze([
      Object.freeze({ consumer: 'SourceEditorField', components: Object.freeze(['button', 'dropdown-menu']) })
    ])
  }),
  'better-text-spfx': Object.freeze({
    key: 'scss-only',
    profileId: 'source-editor-scss-react17-base-nova-v1',
    languages: Object.freeze(['scss']),
    surfaces: Object.freeze([
      Object.freeze({ consumer: 'SourceEditorField', components: Object.freeze(['button', 'dropdown-menu']) })
    ])
  })
});

export const SOURCE_EDITOR_VENDOR_FILES = Object.freeze([
  ...SOURCE_EDITOR_COMMON_VENDOR_FILES,
  SOURCE_EDITOR_WORKSPACE_VENDOR_FILE,
  SOURCE_EDITOR_MONACO_ADAPTERS.full
]);

export const LEGACY_SOURCE_EDITOR_VENDOR_PATH = 'src/vendor/source-editor-core/index.ts';
export const SOURCE_EDITOR_UI_PROFILE_MANIFEST_PATH = 'packages/source-editor-react/ui-profile.json';
export const SOURCE_EDITOR_UI_PROFILE_VENDOR_PATH = 'src/vendor/source-editor/ui-profile/manifest.json';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UI_PROFILE_FILE_PREFIX = 'src/vendor/source-editor/ui-profile/';
const SOURCE_EDITOR_UI_PROFILE_PAIRS = Object.freeze([
  {
    sourcePath: 'packages/ui-profile/compat-consumers/react17-base-ui-jsx.d.ts',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}compat/react17-base-ui-jsx.d.ts`,
    authority: { kind: 'compiler-input', path: 'compat-consumers/react17-base-ui-jsx.d.ts' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/button.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/button.tsx`,
    authority: { kind: 'registry-item', id: 'button', path: 'normalized/src/components/ui/button.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/dropdown-menu.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/dropdown-menu.tsx`,
    authority: {
      kind: 'registry-item',
      id: 'dropdown-menu',
      path: 'normalized/src/components/ui/dropdown-menu.tsx'
    }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/tabs.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/tabs.tsx`,
    authority: { kind: 'registry-item', id: 'tabs', path: 'normalized/src/components/ui/tabs.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/lib/spfx-theme.ts',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}lib/spfx-theme.ts`,
    authority: { kind: 'owned-output', path: 'normalized/src/lib/spfx-theme.ts' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/lib/ui-root.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}lib/ui-root.tsx`,
    authority: { kind: 'owned-output', path: 'normalized/src/lib/ui-root.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/lib/utils.ts',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}lib/utils.ts`,
    authority: { kind: 'registry-item', id: 'utils', path: 'normalized/src/lib/utils.ts' }
  },
  {
    sourcePath: 'packages/ui-profile/generated/tailwind-profile.css',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}tailwind-profile.css`,
    authority: { kind: 'css-artifact', path: 'generated/tailwind-profile.css' }
  }
]);

export function sourceEditorDigest(source) {
  return createHash('sha256').update(source).digest('hex');
}

export function createSourceEditorVendor(source, version, packageName = '@spfx-kit/source-editor-core') {
  const digest = sourceEditorDigest(source);
  return {
    digest,
    source: [
      `// Vendored from ${packageName}@${version}.`,
      `// Canonical source sha256: ${digest}`,
      '// Generated by `npm run sync:source-editor`; do not edit directly.',
      '',
      source
    ].join('\n')
  };
}

export function sourceEditorConsumerProfile(appName) {
  const profile = SOURCE_EDITOR_CONSUMER_PROFILES[appName];
  assert(profile, `Unsupported source editor vendor target: ${appName}`);
  return profile;
}

export function sourceEditorVendorFilesForTarget(appName) {
  const profile = sourceEditorConsumerProfile(appName);
  return Object.freeze([
    ...SOURCE_EDITOR_COMMON_VENDOR_FILES,
    SOURCE_EDITOR_MONACO_ADAPTERS[profile.key],
    ...(profile.key === 'full' ? [SOURCE_EDITOR_WORKSPACE_VENDOR_FILE] : [])
  ]);
}

export async function resolveSourceEditorUiProfile(rootDir, appName = 'better-list-spfx') {
  const consumerProfile = sourceEditorConsumerProfile(appName);
  const manifestFile = await readOwnedFile(rootDir, SOURCE_EDITOR_UI_PROFILE_MANIFEST_PATH, 'source editor UI profile');
  const manifest = parseManifest(manifestFile.source);
  const packageManifest = JSON.parse(
    (await readOwnedFile(rootDir, 'packages/source-editor-react/package.json', 'source editor package manifest')).source
  );
  assert(packageManifest.version === manifest.packageVersion, 'Source editor UI profile package version differs');

  const upstreamProfileFile = await readOwnedFile(rootDir, manifest.upstream.profilePath, 'upstream UI profile manifest');
  assertDigest(upstreamProfileFile.source, manifest.upstream.profileSha256, 'Upstream UI profile manifest');
  const upstreamProfile = JSON.parse(upstreamProfileFile.source);
  assert(upstreamProfile.profileId === manifest.upstream.profileId, 'Upstream UI profile identity differs');
  assert(
    upstreamProfile.provenanceSha256 === manifest.upstream.provenanceSha256,
    'Upstream UI profile provenance binding differs'
  );
  const provenanceFile = await readOwnedFile(rootDir, manifest.upstream.provenancePath, 'upstream UI profile provenance');
  assertDigest(provenanceFile.source, manifest.upstream.provenanceSha256, 'Upstream UI profile provenance');
  assertAuthoritativeProfilePairs(manifest.files, upstreamProfile);

  const closureFile = await readOwnedFile(
    rootDir,
    manifest.preparedBaseUi.dependencyClosurePath,
    'prepared Base UI dependency closure'
  );
  assertDigest(
    closureFile.source,
    manifest.preparedBaseUi.dependencyClosureSha256,
    'Prepared Base UI dependency closure'
  );
  assert(
    upstreamProfile.dependencyClosure?.sha256 === manifest.preparedBaseUi.dependencyClosureSha256,
    'Prepared Base UI dependency closure differs from the upstream profile'
  );

  const upstreamContracts = [
    upstreamProfile.baseUiIdOwnershipTransform,
    upstreamProfile.baseUiPopupLifecycleTransform,
    upstreamProfile.baseUiDeclarationTransform
  ];
  for (const [index, contract] of manifest.preparedBaseUi.contracts.entries()) {
    const contractFile = await readOwnedFile(rootDir, contract.path, `prepared Base UI contract ${contract.path}`);
    assertDigest(contractFile.source, contract.sha256, `Prepared Base UI contract ${contract.path}`);
    const upstreamContract = upstreamContracts[index];
    assert(
      upstreamContract?.path === path.posix.relative('packages/ui-profile', contract.path) &&
        upstreamContract.sha256 === contract.sha256,
      `Prepared Base UI contract ${contract.path} differs from the upstream profile`
    );
  }

  const selectedFiles = manifest.files.filter(
    (file) => consumerProfile.key === 'full' || !file.sourcePath.endsWith('/components/ui/tabs.tsx')
  );
  const files = [];
  for (const file of selectedFiles) {
    const resolved = await readOwnedFile(rootDir, file.sourcePath, `source editor UI profile file ${file.sourcePath}`);
    assertDigest(resolved.source, file.sha256, `Source editor UI profile file ${file.sourcePath}`);
    files.push({ ...file, source: resolved.source });
  }
  const cssFile = selectedFiles.find((file) => file.sourcePath.endsWith('/generated/tailwind-profile.css'));
  assert(cssFile, 'Source editor UI profile scoped CSS artifact is missing');
  const sourceFiles = [];
  for (const file of sourceEditorVendorFilesForTarget(appName)) {
    const resolved = await readOwnedFile(rootDir, file.sourcePath, `source editor profile file ${file.sourcePath}`);
    sourceFiles.push({
      sourcePath: file.sourcePath,
      vendorPath: file.vendorPath,
      sha256: sourceEditorDigest(resolved.source)
    });
  }
  const consumerManifest = {
    schemaVersion: 1,
    profileKind: consumerProfile.key,
    profileId: consumerProfile.profileId,
    packageVersion: manifest.packageVersion,
    languages: consumerProfile.languages,
    surfaces: consumerProfile.surfaces,
    sourceProfile: {
      path: SOURCE_EDITOR_UI_PROFILE_MANIFEST_PATH,
      sha256: sourceEditorDigest(manifestFile.source)
    },
    upstream: manifest.upstream,
    preparedBaseUi: manifest.preparedBaseUi,
    css: {
      mode: 'canonical-safe-superset',
      note: 'The exact manifest-verified scoped CSS is shared; JavaScript and Monaco graphs remain profile-specific.',
      sourcePath: cssFile.sourcePath,
      vendorPath: cssFile.vendorPath,
      sha256: cssFile.sha256,
      scopeValue: upstreamProfile.css.scopeValue,
      scopeSelector: upstreamProfile.css.scopeSelector
    },
    sourceFiles,
    files: selectedFiles
  };
  const consumerManifestSource = canonicalJson(consumerManifest);
  files.push({
    sourcePath: SOURCE_EDITOR_UI_PROFILE_MANIFEST_PATH,
    vendorPath: SOURCE_EDITOR_UI_PROFILE_VENDOR_PATH,
    sha256: sourceEditorDigest(consumerManifestSource),
    source: consumerManifestSource
  });

  return Object.freeze({ manifest: Object.freeze(consumerManifest), files: Object.freeze(files) });
}

function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, sortJson(value[key])])
  );
}

function parseManifest(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new Error('Source editor UI profile manifest is not valid JSON');
  }
  assertObjectKeys(manifest, [
    'files',
    'packageVersion',
    'preparedBaseUi',
    'profileId',
    'schemaVersion',
    'surfaces',
    'upstream'
  ]);
  assert(manifest.schemaVersion === 1, 'Source editor UI profile schema version differs');
  assert(manifest.profileId === 'source-editor-react17-base-nova-v1', 'Source editor UI profile identity differs');
  assert(typeof manifest.packageVersion === 'string' && manifest.packageVersion.length > 0, 'Package version is missing');

  assertObjectKeys(manifest.upstream, [
    'profileId',
    'profilePath',
    'profileSha256',
    'provenancePath',
    'provenanceSha256'
  ]);
  assert(manifest.upstream.profileId === 'spfx-react17-base-nova-v1', 'Upstream UI profile identity is unsupported');
  assertSha256(manifest.upstream.profileSha256, 'Upstream UI profile manifest');
  assertSha256(manifest.upstream.provenanceSha256, 'Upstream UI profile provenance');

  assert(Array.isArray(manifest.surfaces) && manifest.surfaces.length === 2, 'Source editor surface set differs');
  const expectedSurfaces = [
    { consumer: 'SourceEditorField', components: ['button', 'dropdown-menu'] },
    { consumer: 'SourceWorkspaceField', components: ['tabs'] }
  ];
  assert(JSON.stringify(manifest.surfaces) === JSON.stringify(expectedSurfaces), 'Source editor surface ownership differs');

  assertObjectKeys(manifest.preparedBaseUi, [
    'contracts',
    'dependencyClosurePath',
    'dependencyClosureSha256',
    'package',
    'version'
  ]);
  assert(
    manifest.preparedBaseUi.package === '@base-ui/react' && manifest.preparedBaseUi.version === '1.6.0',
    'Prepared Base UI identity differs'
  );
  assertSha256(manifest.preparedBaseUi.dependencyClosureSha256, 'Prepared Base UI dependency closure');
  assert(
    Array.isArray(manifest.preparedBaseUi.contracts) && manifest.preparedBaseUi.contracts.length === 3,
    'Prepared Base UI contract set differs'
  );
  for (const contract of manifest.preparedBaseUi.contracts) {
    assertObjectKeys(contract, ['path', 'sha256']);
    assertSha256(contract.sha256, `Prepared Base UI contract ${contract.path}`);
  }

  assert(
    Array.isArray(manifest.files) && manifest.files.length === SOURCE_EDITOR_UI_PROFILE_PAIRS.length,
    'Source editor UI profile file set differs'
  );
  const vendorPaths = new Set();
  for (const [index, file] of manifest.files.entries()) {
    assertObjectKeys(file, ['sha256', 'sourcePath', 'vendorPath']);
    assertSha256(file.sha256, `Source editor UI profile file ${file.sourcePath}`);
    const expectedPair = SOURCE_EDITOR_UI_PROFILE_PAIRS[index];
    assert(
      file.sourcePath === expectedPair.sourcePath && file.vendorPath === expectedPair.vendorPath,
      `Source editor UI profile canonical source/vendor pair differs at index ${index}`
    );
    assert(
      typeof file.vendorPath === 'string' && file.vendorPath.startsWith(UI_PROFILE_FILE_PREFIX),
      `Source editor UI profile vendor path is outside the owned directory: ${file.vendorPath}`
    );
    assert(
      path.posix.normalize(file.vendorPath) === file.vendorPath && !file.vendorPath.includes('/../'),
      `Source editor UI profile vendor path is not canonical: ${file.vendorPath}`
    );
    assert(!vendorPaths.has(file.vendorPath), `Duplicate source editor UI profile vendor path: ${file.vendorPath}`);
    vendorPaths.add(file.vendorPath);
  }
  const sortedVendorPaths = [...vendorPaths].sort((left, right) => left.localeCompare(right, 'en'));
  assert(
    manifest.files.every((file, index) => file.vendorPath === sortedVendorPaths[index]),
    'Source editor UI profile files are not deterministically ordered'
  );
  return manifest;
}

function assertAuthoritativeProfilePairs(files, upstreamProfile) {
  for (const [index, file] of files.entries()) {
    const pair = SOURCE_EDITOR_UI_PROFILE_PAIRS[index];
    const authority = authoritativeProfileEntry(upstreamProfile, pair.authority);
    assert(
      authority?.path === pair.authority.path && authority.sha256 === file.sha256,
      `Source editor UI profile file ${file.sourcePath} differs from the authoritative upstream profile`
    );
  }
}

function authoritativeProfileEntry(profile, authority) {
  if (authority.kind === 'registry-item') {
    const item = profile.items?.find((candidate) => candidate.id === authority.id);
    const matches = item?.normalized?.filter((entry) => entry.path === authority.path) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (authority.kind === 'owned-output') {
    const matches =
      profile.ownedSources?.map((entry) => entry.output).filter((entry) => entry.path === authority.path) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (authority.kind === 'compiler-input') {
    const matches = profile.compilerInputs?.filter((entry) => entry.path === authority.path) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  }
  if (authority.kind === 'css-artifact') return profile.css?.artifact;
  return undefined;
}

async function readOwnedFile(rootDir, relativePath, label) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, `${label} path is missing`);
  assert(!path.isAbsolute(relativePath), `${label} path must be repository-relative`);
  const resolvedRoot = await realpath(rootDir);
  const candidate = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, candidate);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} path escapes the repository`);
  const stats = await lstat(candidate);
  assert(stats.isFile() && !stats.isSymbolicLink(), `${label} must be a regular file`);
  const canonical = await realpath(candidate);
  const canonicalRelative = path.relative(resolvedRoot, canonical);
  assert(
    canonicalRelative && !canonicalRelative.startsWith('..') && !path.isAbsolute(canonicalRelative),
    `${label} resolves outside the repository`
  );
  return { source: await readFile(canonical, 'utf8') };
}

function assertObjectKeys(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Source editor UI profile shape is invalid');
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const sortedExpected = [...expected].sort((left, right) => left.localeCompare(right, 'en'));
  assert(JSON.stringify(actual) === JSON.stringify(sortedExpected), 'Source editor UI profile contains unexpected fields');
}

function assertSha256(value, label) {
  assert(SHA256_PATTERN.test(String(value || '')), `${label} digest is invalid`);
}

function assertDigest(source, expected, label) {
  assertSha256(expected, label);
  assert(sourceEditorDigest(source) === expected, `${label} digest differs`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
