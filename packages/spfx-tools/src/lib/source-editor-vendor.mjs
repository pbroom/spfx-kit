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

const BETTER_TEXT_UI_BUILD_VENDOR_FILES = Object.freeze([
  {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/spfx-ui-profile-prepare.mjs',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/spfx-ui-profile-prepare.mjs'
  },
  {
    packageName: '@spfx-kit/source-editor-react',
    sourcePath: 'packages/source-editor-react/spfx-ui-profile-gulp.cjs',
    packagePath: 'packages/source-editor-react/package.json',
    vendorPath: 'src/vendor/source-editor/spfx-ui-profile-gulp.cjs'
  }
]);

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
      Object.freeze({ consumer: 'SourceEditorField', components: Object.freeze(['button', 'dropdown-menu']) }),
      Object.freeze({
        consumer: 'BetterTextPropertyPane',
        components: Object.freeze(['combobox', 'input', 'input-group', 'select', 'textarea'])
      })
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

const BETTER_TEXT_UI_PROFILE_PAIRS = Object.freeze([
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/combobox.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/combobox.tsx`,
    authority: { kind: 'registry-item', id: 'combobox', path: 'normalized/src/components/ui/combobox.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/input-group.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/input-group.tsx`,
    authority: { kind: 'registry-item', id: 'input-group', path: 'normalized/src/components/ui/input-group.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/input.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/input.tsx`,
    authority: { kind: 'registry-item', id: 'input', path: 'normalized/src/components/ui/input.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/select.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/select.tsx`,
    authority: { kind: 'registry-item', id: 'select', path: 'normalized/src/components/ui/select.tsx' }
  },
  {
    sourcePath: 'packages/ui-profile/normalized/src/components/ui/textarea.tsx',
    vendorPath: `${UI_PROFILE_FILE_PREFIX}components/ui/textarea.tsx`,
    authority: { kind: 'registry-item', id: 'textarea', path: 'normalized/src/components/ui/textarea.tsx' }
  }
]);

const UI_PROFILE_RUNTIME_CONTRACT_VENDOR_PATH = `${UI_PROFILE_FILE_PREFIX}profile-contract.ts`;

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
    ...(profile.key === 'full' ? [SOURCE_EDITOR_WORKSPACE_VENDOR_FILE] : []),
    ...(appName === 'better-text-spfx' ? BETTER_TEXT_UI_BUILD_VENDOR_FILES : [])
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

  const requestedComponents = new Set(consumerProfile.surfaces.flatMap((surface) => surface.components));
  const availablePairs = [
    ...SOURCE_EDITOR_UI_PROFILE_PAIRS,
    ...(appName === 'better-text-spfx' ? BETTER_TEXT_UI_PROFILE_PAIRS : [])
  ];
  const selectedPairs = availablePairs.filter(
    (pair) =>
      pair.authority.kind !== 'registry-item' ||
      !pair.sourcePath.includes('/components/ui/') ||
      requestedComponents.has(pair.authority.id)
  );
  const manifestFiles = new Map(manifest.files.map((file) => [file.sourcePath, file]));
  const selectedFiles = selectedPairs.map((pair) => {
    const declared = manifestFiles.get(pair.sourcePath);
    if (declared) return declared;
    const authority = authoritativeProfileEntry(upstreamProfile, pair.authority);
    assert(
      authority?.path === pair.authority.path && SHA256_PATTERN.test(authority.sha256),
      `Source editor UI profile file ${pair.sourcePath} is absent from the authoritative upstream profile`
    );
    return { sourcePath: pair.sourcePath, vendorPath: pair.vendorPath, sha256: authority.sha256 };
  });
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
    preparedBaseUi:
      appName === 'better-text-spfx'
        ? {
            ...manifest.preparedBaseUi,
            deliveryFiles: await resolvePreparedBaseUiDeliveryFiles(rootDir, manifest, files)
          }
        : manifest.preparedBaseUi,
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
  if (appName === 'better-text-spfx') {
    const runtimeContractSource = createRuntimeProfileContract(consumerManifest);
    consumerManifest.runtimeContract = {
      vendorPath: UI_PROFILE_RUNTIME_CONTRACT_VENDOR_PATH,
      sha256: sourceEditorDigest(runtimeContractSource)
    };
    files.push({
      sourcePath: 'generated:source-editor-ui-profile-contract',
      vendorPath: UI_PROFILE_RUNTIME_CONTRACT_VENDOR_PATH,
      sha256: consumerManifest.runtimeContract.sha256,
      source: runtimeContractSource
    });
  }
  const consumerManifestSource = canonicalJson(consumerManifest);
  files.push({
    sourcePath: SOURCE_EDITOR_UI_PROFILE_MANIFEST_PATH,
    vendorPath: SOURCE_EDITOR_UI_PROFILE_VENDOR_PATH,
    sha256: sourceEditorDigest(consumerManifestSource),
    source: consumerManifestSource
  });

  return Object.freeze({ manifest: Object.freeze(consumerManifest), files: Object.freeze(files) });
}

function createRuntimeProfileContract(manifest) {
  return [
    '// Generated by `npm run sync:source-editor`; do not edit directly.',
    `export const SPFX_UI_PROFILE_ID = ${JSON.stringify(manifest.profileId)} as const;`,
    `export const SPFX_UI_SCOPE_VALUE = ${JSON.stringify(manifest.css.scopeValue)} as const;`,
    `export const SPFX_UI_SCOPE_SELECTOR = ${JSON.stringify(manifest.css.scopeSelector)} as const;`,
    "export const SPFX_UI_SCOPE_ATTRIBUTE = 'data-spfx-ui-scope' as const;",
    ''
  ].join('\n');
}

async function resolvePreparedBaseUiDeliveryFiles(rootDir, manifest, outputFiles) {
  const delivery = [];
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
  const closureRelativePath = manifest.preparedBaseUi.dependencyClosurePath.replace(/^packages\/ui-profile\//u, '');
  const closureEntry = {
    sourcePath: manifest.preparedBaseUi.dependencyClosurePath,
    vendorPath: `${UI_PROFILE_FILE_PREFIX}${closureRelativePath}`,
    sha256: manifest.preparedBaseUi.dependencyClosureSha256,
    source: closureFile.source
  };
  outputFiles.push(closureEntry);
  delivery.push({
    sourcePath: closureEntry.sourcePath,
    vendorPath: closureEntry.vendorPath,
    sha256: closureEntry.sha256
  });
  for (const binding of manifest.preparedBaseUi.contracts) {
    const contractFile = await readOwnedFile(rootDir, binding.path, `prepared Base UI contract ${binding.path}`);
    assertDigest(contractFile.source, binding.sha256, `Prepared Base UI contract ${binding.path}`);
    const relativeContractPath = binding.path.replace(/^packages\/ui-profile\//u, '');
    const contractEntry = {
      sourcePath: binding.path,
      vendorPath: `${UI_PROFILE_FILE_PREFIX}${relativeContractPath}`,
      sha256: binding.sha256,
      source: contractFile.source
    };
    outputFiles.push(contractEntry);
    delivery.push({
      sourcePath: contractEntry.sourcePath,
      vendorPath: contractEntry.vendorPath,
      sha256: contractEntry.sha256
    });

    const contract = JSON.parse(contractFile.source);
    const fixtures = [];
    if (Array.isArray(contract.providerFiles)) {
      fixtures.push(...contract.providerFiles.map((file) => [file.sourcePath, file.sha256]));
    }
    if (Array.isArray(contract.files)) {
      for (const file of contract.files) {
        if (file.upstreamPath) fixtures.push([file.upstreamPath, file.upstreamSha256]);
        if (file.originalPath) fixtures.push([file.originalPath, file.originalSha256]);
        if (file.transformedPath) fixtures.push([file.transformedPath, file.transformedSha256]);
      }
    }
    for (const [profilePath, sha256] of fixtures) {
      const sourcePath = `packages/ui-profile/${profilePath}`;
      const fixture = await readOwnedFile(rootDir, sourcePath, `prepared Base UI fixture ${sourcePath}`);
      assertDigest(fixture.source, sha256, `Prepared Base UI fixture ${sourcePath}`);
      const entry = {
        sourcePath,
        vendorPath: `${UI_PROFILE_FILE_PREFIX}${profilePath}`,
        sha256,
        source: fixture.source
      };
      outputFiles.push(entry);
      delivery.push({ sourcePath: entry.sourcePath, vendorPath: entry.vendorPath, sha256: entry.sha256 });
    }
  }
  delivery.sort((left, right) => left.vendorPath.localeCompare(right.vendorPath, 'en'));
  return delivery;
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
