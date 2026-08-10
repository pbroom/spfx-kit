import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { assertGeneratedTreeClosure } from './lib/generated-tree-closure.mjs';
import { verifyTailwindCss } from './lib/compile-tailwind-css.mjs';
import { assertFetchedRegistryClosure } from './lib/profile-update-intake.mjs';
import {
  GENERATOR_VERSION,
  NORMALIZATION_CONTRACT_VERSION,
  PROFILE_ID,
  PROFILE_SCHEMA_VERSION,
  REGISTRY_IDS,
  assertTailwindCompilerClosure,
  canonicalJson,
  createRegistrySourceContext,
  externalImports,
  normalizeRegistrySource,
  pinnedTypeDirectiveNames,
  sha256
} from './lib/profile.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(packageRoot, relativePath), 'utf8'));
const profileBytes = await readFile(path.join(packageRoot, 'profile.json'));
const provenanceBytes = await readFile(path.join(packageRoot, 'provenance.json'));
const implementationBytes = await readFile(path.join(packageRoot, 'scripts', 'lib', 'profile.mjs'));
const profileSchemaBytes = await readFile(path.join(packageRoot, 'profile.schema.json'));
const provenanceSchemaBytes = await readFile(path.join(packageRoot, 'provenance.schema.json'));
const profile = JSON.parse(profileBytes);
const provenance = JSON.parse(provenanceBytes);
const profileSchema = JSON.parse(profileSchemaBytes);
const provenanceSchema = JSON.parse(provenanceSchemaBytes);
const manifest = await readJson('package.json');
const packageLock = JSON.parse(await readFile(path.resolve(packageRoot, '..', '..', 'package-lock.json'), 'utf8'));

const expectedIds = [...REGISTRY_IDS];
const expectedCompilerInputPaths = [
  'catalog.json',
  'catalog.schema.json',
  'snapshots/catalog/components.json',
  'scripts/lib/catalog.mjs',
  'scripts/verify-catalog.mjs',
  'scripts/update-catalog-profile.mjs',
  'scripts/update-dependency-closure.mjs',
  'compat-consumers/react17-base-ui-jsx.d.ts',
  'compat-consumers/typescript53-globals.d.ts',
  'compat-consumers/select-value.tsx',
  'compat/base-ui-1.6.0/id-ownership/contract.schema.json',
  'tailwind-profile.css',
  'scripts/build-tailwind-css.mjs',
  'scripts/verify-tailwind-css.mjs',
  'scripts/lib/compile-tailwind-css.mjs',
  'scripts/lib/scope-tailwind-css.mjs',
  'scripts/lib/block-network.mjs',
  'scripts/typecheck.mjs',
  'scripts/lib/generate-profile.mjs',
  'scripts/lib/profile-update-intake.mjs',
  'scripts/lib/shadcn-registry-worker.mjs',
  'scripts/lib/typecheck-generated-profile.mjs',
  'scripts/lib/generate-validated-profile.mjs',
  'scripts/lib/generation-transaction.mjs',
  'scripts/lib/replace-generated.mjs',
  'scripts/lib/generated-tree-closure.mjs',
  'scripts/verify-dependency-closure.mjs',
  'scripts/prepare-base-ui.mjs',
  'scripts/transform-base-ui-select-value.mjs',
  'scripts/transform-base-ui-popup-lifecycle.mjs',
  'scripts/transform-base-ui-id-ownership.mjs',
  'scripts/lib/preparation-lock.mjs',
  'tsconfig.base.json',
  'tsconfig.ts53.json',
  'tsconfig.ts58.json'
];

const expectedDirectDependencies = {
  '@base-ui/react': '1.6.0',
  'class-variance-authority': '0.7.1',
  clsx: '2.1.1',
  'date-fns': '4.4.0',
  'embla-carousel-react': '8.6.0',
  'input-otp': '1.4.2',
  'lucide-react': '1.25.0',
  react: '17.0.1',
  'react-day-picker': '10.0.1',
  'react-dom': '17.0.1',
  'react-is': '17.0.2',
  'react-redux': '8.1.3',
  recharts: '3.8.0',
  'tailwind-merge': '3.6.0'
};

const expectedRuntimeDependencies = Object.fromEntries(
  Object.entries(expectedDirectDependencies).filter(([name]) => name !== 'react' && name !== 'react-dom')
);

const expectedPeerDependencies = {
  react: '17.0.1',
  'react-dom': '17.0.1'
};

const expectedDevDependencies = {
  '@floating-ui/core': '1.7.5',
  '@floating-ui/dom': '1.7.6',
  '@floating-ui/react-dom': '2.1.8',
  '@floating-ui/utils': '0.2.11',
  '@tailwindcss/cli': '4.3.3',
  '@types/react': '17.0.45',
  '@types/react-dom': '17.0.17',
  '@types/scheduler': '0.16.8',
  ajv: '8.20.0',
  postcss: '8.5.19',
  'postcss-selector-parser': '7.1.4',
  'postcss-value-parser': '4.2.0',
  react: '17.0.1',
  'react-dom': '17.0.1',
  shadcn: '4.16.1',
  tailwindcss: '4.3.3',
  'tw-animate-css': '1.4.0',
  typescript: '5.3.3',
  'typescript-5-8': 'npm:typescript@5.8.3'
};

const expectedCssToolchain = {
  tailwindcss: {
    version: '4.3.3',
    integrity: 'sha512-gOhV3P7ufE62QDGg1zVaTgCR+EtPv92k2nIhVcVKcLmxT1sUBsQGhnZj175j+MqRt4zLF7ic+sCYjfhxMxj7YQ=='
  },
  '@tailwindcss/cli': {
    version: '4.3.3',
    integrity: 'sha512-ZvS/n1ZHOBKcVlhkt8l5NNr1EDXk1NboYO5CYDOs6NUmvT9z6bzkwsosaJftY57T/3gWNzWMJzIXLodZC8ssdw=='
  },
  postcss: {
    version: '8.5.19',
    integrity: 'sha512-Mz8SaolMd8nB+G13WkORcxQKHZ/NE4xXevtkJHVuG+guo9/wYKlIMTKAqGdEmYOXR2ijPjTYNHssizdaVSUNdQ=='
  },
  'postcss-selector-parser': {
    version: '7.1.4',
    integrity: 'sha512-HeP7D2wyhkR+XaK6v4W8oRF62Dsz4flyuczALJp61GckGm42u1saSSJ/0auvcBqxs3jMRFEcPK34At/0JBKdOg=='
  },
  'postcss-value-parser': {
    version: '4.2.0',
    integrity: 'sha512-1NNCs6uurfkVbeXG4S8JFT9t19m45ICnif8zWLd5oPSZ50QnwMfK+H3jv408d4jw/7Bttv5axS5IiHoLaVNHeQ=='
  },
  'tw-animate-css': {
    version: '1.4.0',
    integrity: 'sha512-7bziOlRqH0hJx80h/3mbicLW7o8qLsH5+RaLR2t+OHM3D0JlWGODQKQ4cxbK7WlvmUxpcj6Kgu6EKqjrGFe3QQ=='
  }
};

const expectedScripts = {
  'build:runtime':
    'npm run profile:prepare:base-ui && node ./scripts/clean-runtime.mjs && tsc -p ./tsconfig.build.json && node ./scripts/finalize-runtime-imports.mjs',
  'css:build': 'node ./scripts/build-tailwind-css.mjs',
  'css:verify': 'node ./scripts/verify-tailwind-css.mjs',
  'delivery:verify': 'node ./scripts/verify-delivery-artifact.mjs',
  'profile:update:network': 'node ./scripts/update-profile.mjs --allow-network',
  'profile:update:catalog:network': 'node ./scripts/update-catalog-profile.mjs --allow-network',
  'profile:update:closure': 'node ./scripts/update-dependency-closure.mjs --from-lockfile',
  'profile:regenerate': 'node ./scripts/regenerate-profile.mjs',
  'profile:verify': 'node ./scripts/verify-profile.mjs',
  'profile:verify:closure': 'node ./scripts/verify-dependency-closure.mjs',
  'profile:verify:base-ui':
    'node ./scripts/transform-base-ui-select-value.mjs --verify-fixtures && node ./scripts/transform-base-ui-popup-lifecycle.mjs --verify-fixtures && node ./scripts/transform-base-ui-id-ownership.mjs --verify-fixtures',
  'profile:prepare:base-ui': 'node ./scripts/prepare-base-ui.mjs',
  'typecheck:ts53': 'node ./scripts/typecheck.mjs typescript 5.3.3 ./tsconfig.ts53.json',
  'typecheck:ts58': 'node ./scripts/typecheck.mjs typescript-5-8 5.8.3 ./tsconfig.ts58.json',
  typecheck: 'npm run profile:prepare:base-ui && npm run typecheck:ts53 && npm run typecheck:ts58',
  'catalog:verify': 'node ./scripts/verify-catalog.mjs',
  verify: 'npm run catalog:verify && npm run profile:verify && npm run profile:verify:base-ui && npm run profile:verify:closure',
  build: 'npm run verify && npm run delivery:verify && npm run typecheck && npm run build:runtime',
  prepack: 'npm run build'
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExact(actual, expected, label) {
  assert(canonicalJson(actual) === canonicalJson(expected), `${label} differs from the pinned profile`);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateProfile = ajv.compile(profileSchema);
const validateProvenance = ajv.compile(provenanceSchema);
assert(
  sha256(Buffer.from(canonicalJson(profileSchema))) === '36537b93ad79b1cf20c67fee0c154231ff3405b0e369cf23889e722be2820d2d',
  'profile.schema.json identity differs'
);
assert(
  sha256(Buffer.from(canonicalJson(provenanceSchema))) === '7b452e40688c76bc6d2305a7a2b033e8d7f130824fa58e2590dc5471456d7575',
  'provenance.schema.json identity differs'
);
assert(validateProfile(profile), `profile.json schema errors: ${ajv.errorsText(validateProfile.errors)}`);
assert(validateProvenance(provenance), `provenance.json schema errors: ${ajv.errorsText(validateProvenance.errors)}`);

async function filesUnder(relativeDirectory) {
  const root = path.join(packageRoot, relativeDirectory);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(path.relative(packageRoot, absolute).replaceAll(path.sep, '/'));
      else
        throw new Error(
          `${relativeDirectory}: snapshot inventory contains a non-file entry ${path.relative(packageRoot, absolute)}`
        );
    }
  }
  await visit(root);
  return files.sort();
}

assert(profile.schemaVersion === PROFILE_SCHEMA_VERSION, 'Unexpected profile schema version');
assert(profile.generatorVersion === GENERATOR_VERSION, 'Unexpected profile generator version');
assert(profile.profileId === PROFILE_ID, 'Unexpected profile ID');
assert(profile.provenanceSha256 === sha256(provenanceBytes), 'Provenance digest differs');
assert(profile.normalizationImplementationSha256 === sha256(implementationBytes), 'Normalization implementation digest differs');
assert(
  provenance.normalization.implementationSha256 === sha256(implementationBytes),
  'Normalization provenance implementation digest differs'
);
assertExact(
  profile.compilerInputs.map((input) => input.path),
  expectedCompilerInputPaths,
  'Compiler input inventory'
);
for (const input of profile.compilerInputs) {
  assert(
    input.sha256 === sha256(await readFile(path.join(packageRoot, input.path))),
    `Compiler input digest differs for ${input.path}`
  );
}
assert(profile.dependencyClosure.path === 'dependency-closure.json', 'Dependency closure path differs');
assert(
  profile.dependencyClosure.sha256 === sha256(await readFile(path.join(packageRoot, profile.dependencyClosure.path))),
  'Dependency closure digest differs'
);
assert(
  profile.baseUiDeclarationTransform.path === 'compat/base-ui-1.6.0/select-value/contract.json',
  'Base UI declaration transform path differs'
);
assert(
  profile.baseUiDeclarationTransform.sha256 ===
    sha256(await readFile(path.join(packageRoot, profile.baseUiDeclarationTransform.path))),
  'Base UI declaration transform digest differs'
);
assert(
  profile.baseUiPopupLifecycleTransform.path === 'compat/base-ui-1.6.0/popup-lifecycle/contract.json',
  'Base UI popup lifecycle transform path differs'
);
assert(
  profile.baseUiPopupLifecycleTransform.sha256 ===
    sha256(await readFile(path.join(packageRoot, profile.baseUiPopupLifecycleTransform.path))),
  'Base UI popup lifecycle transform digest differs'
);
assert(
  profile.baseUiIdOwnershipTransform.path === 'compat/base-ui-1.6.0/id-ownership/contract.json',
  'Base UI ID ownership transform path differs'
);
assert(
  profile.baseUiIdOwnershipTransform.sha256 ===
    sha256(await readFile(path.join(packageRoot, profile.baseUiIdOwnershipTransform.path))),
  'Base UI ID ownership transform digest differs'
);
assert(Array.isArray(profile.ownedSources) && profile.ownedSources.length === 2, 'Owned host source inventory differs');
assertExact(
  profile.ownedSources.map(({ source, output }) => [source.path, output.path]),
  [
    ['owned/src/lib/spfx-theme.ts', 'normalized/src/lib/spfx-theme.ts'],
    ['owned/src/lib/ui-root.tsx', 'normalized/src/lib/ui-root.tsx']
  ],
  'Owned host source paths'
);
for (const ownedHostSource of profile.ownedSources) {
  assertExact(ownedHostSource.transformations, ['copy-owned-host-contract'], 'Owned host source transformations');
  const ownedHostSourceBytes = await readFile(path.join(packageRoot, ownedHostSource.source.path));
  const ownedHostOutputBytes = await readFile(path.join(packageRoot, ownedHostSource.output.path));
  assert(ownedHostSource.source.sha256 === sha256(ownedHostSourceBytes), 'Owned host source digest differs');
  assert(ownedHostSource.output.sha256 === sha256(ownedHostOutputBytes), 'Owned host output digest differs');
  assert(ownedHostOutputBytes.equals(ownedHostSourceBytes), 'Owned host output is not an exact source copy');
}
assert(provenance.profileId === PROFILE_ID, 'Provenance profile ID differs');
assert(provenance.registry.preset === 'base-nova', 'Registry preset differs');
assert(provenance.registry.cli.version === '4.16.1', 'shadcn version differs');
assert(
  provenance.registry.cli.integrity ===
    'sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==',
  'shadcn integrity differs'
);
assert(
  provenance.registry.toolSourceRevision === 'cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4',
  'shadcn tool source revision differs'
);
assert(provenance.registry.mutableHostedResponses === true, 'Hosted registry mutability must remain explicit');
assert(provenance.registry.hostedResponsesRevisionBound === false, 'Hosted registry responses must not claim revision binding');
assertExact(provenance.reactTypeContract, { '@types/react': '17.0.45', '@types/react-dom': '17.0.17' }, 'React type contract');
assert(provenance.normalization.contractVersion === NORMALIZATION_CONTRACT_VERSION, 'Normalization contract differs');
assertExact(
  provenance.normalization.configuration,
  { tailwindPrefix: 'skui', rtl: false, menuColor: null, fontHeadingMarker: 'font-heading' },
  'Normalization configuration'
);
assertExact(provenance.cssToolchain, expectedCssToolchain, 'CSS toolchain');
for (const [name, expected] of Object.entries(expectedCssToolchain)) {
  const locked = packageLock.packages?.[`node_modules/${name}`];
  assert(locked?.version === expected.version, `${name}: lockfile version differs from CSS toolchain provenance`);
  assert(locked?.integrity === expected.integrity, `${name}: lockfile integrity differs from CSS toolchain provenance`);
}
assertTailwindCompilerClosure(packageLock, provenance);
assertExact(
  provenance.dependencyResolutionPins,
  {
    '@floating-ui/core': '1.7.5',
    '@floating-ui/dom': '1.7.6',
    '@floating-ui/react-dom': '2.1.8',
    '@floating-ui/utils': '0.2.11'
  },
  'Floating UI resolution pins'
);
assertExact(provenance.registryIds, expectedIds, 'Registry allowlist');
assertExact(provenance.directProductionDependencies, expectedDirectDependencies, 'Provenance production dependencies');
assertExact(manifest.dependencies, expectedRuntimeDependencies, 'Package runtime dependencies');
assertExact(manifest.peerDependencies, expectedPeerDependencies, 'Package React peer dependencies');
assertExact(manifest.devDependencies, expectedDevDependencies, 'Package development dependencies');
assert(!manifest.overrides && !manifest.resolutions, 'Forced dependency overrides are not accepted');

assert(Array.isArray(profile.items) && profile.items.length === expectedIds.length, 'Profile must contain 24 items');
assertExact(
  profile.items.map((item) => item.id),
  expectedIds,
  'Profile item order and identity'
);

const expectedRawPaths = new Set();
const expectedCanonicalPaths = new Set();
const rawSnapshots = [];
const sourceContext = createRegistrySourceContext(
  (
    await Promise.all(
      profile.items.map(async (item) => {
        const raw = JSON.parse(await readFile(path.join(packageRoot, item.raw.path)));
        return raw.files;
      })
    )
  )
    .flat()
    .map((file) => ({ path: file.path, source: file.content }))
);
const allowedImports = new Set(Object.keys(expectedDirectDependencies));
const { emittedPaths: expectedNormalizedPaths } = await assertGeneratedTreeClosure({
  outputRoot: packageRoot,
  profile,
  allowedExternalPackages: allowedImports,
  allowedTypeDirectives: pinnedTypeDirectiveNames(manifest.devDependencies)
});
for (const item of profile.items) {
  const expectedRawPath = `snapshots/raw/${item.id}.json`;
  const expectedCanonicalPath = `snapshots/canonical/${item.id}.json`;
  assert(item.raw.path === expectedRawPath, `${item.id}: raw snapshot path differs`);
  assert(item.canonical.path === expectedCanonicalPath, `${item.id}: canonical snapshot path differs`);
  expectedRawPaths.add(expectedRawPath);
  expectedCanonicalPaths.add(expectedCanonicalPath);

  const rawBytes = await readFile(path.join(packageRoot, expectedRawPath));
  const canonicalBytes = await readFile(path.join(packageRoot, expectedCanonicalPath));
  assert(sha256(rawBytes) === item.raw.sha256, `${item.id}: raw snapshot digest differs`);
  assert(sha256(canonicalBytes) === item.canonical.sha256, `${item.id}: canonical snapshot digest differs`);
  assert(
    sha256(rawBytes) === provenance.registrySnapshots[item.id].rawSha256,
    `${item.id}: raw snapshot differs from provenance`
  );
  assert(
    sha256(canonicalBytes) === provenance.registrySnapshots[item.id].canonicalSha256,
    `${item.id}: canonical snapshot differs from provenance`
  );

  const raw = JSON.parse(rawBytes);
  const canonical = JSON.parse(canonicalBytes);
  rawSnapshots.push(raw);
  assert(raw.name === item.id, `${item.id}: raw registry identity differs`);
  assert(canonicalJson(raw) === canonicalBytes.toString('utf8'), `${item.id}: canonical bytes are not reproducible`);
  assertExact(canonical, raw, `${item.id}: canonical JSON value`);

  assert(Array.isArray(item.normalized) && item.normalized.length === raw.files.length, `${item.id}: source count differs`);
  for (const output of item.normalized) {
    const registryFile = raw.files.find((file) => file.path === output.registrySourcePath);
    assert(registryFile && typeof registryFile.content === 'string', `${item.id}: registry source is missing`);
    assert(
      sha256(Buffer.from(registryFile.content)) === output.upstreamSha256,
      `${item.id}: upstream source digest differs for ${output.registrySourcePath}`
    );
    const rerun = normalizeRegistrySource({
      source: registryFile.content,
      registrySourcePath: registryFile.path,
      sourceContext
    });
    assert(rerun.outputPath === output.path, `${item.id}: normalized output path differs`);
    assertExact(rerun.transformations, output.transformations, `${item.id}: transformations for ${output.path}`);
    const normalizedBytes = await readFile(path.join(packageRoot, output.path));
    assert(normalizedBytes.toString('utf8') === rerun.source, `${item.id}: normalized bytes are not reproducible`);
    assert(sha256(normalizedBytes) === output.sha256, `${item.id}: normalized digest differs for ${output.path}`);
    for (const importedPackage of externalImports(rerun.source)) {
      assert(allowedImports.has(importedPackage), `${output.path}: undeclared external import ${importedPackage}`);
    }
  }
}

assertFetchedRegistryClosure(rawSnapshots, provenance.registryIds, {
  excludedDependencies: provenance.excludedDependencies,
  directProductionDependencies: provenance.directProductionDependencies,
  registryDependencyTagResolutions: provenance.registryDependencyTagResolutions,
  allowedTypeDirectives: pinnedTypeDirectiveNames(manifest.devDependencies)
});

assertExact(await filesUnder('snapshots/raw'), [...expectedRawPaths].sort(), 'Raw snapshot inventory');
assertExact(await filesUnder('snapshots/canonical'), [...expectedCanonicalPaths].sort(), 'Canonical snapshot inventory');
assertExact(await filesUnder('normalized'), [...expectedNormalizedPaths].sort(), 'Normalized source inventory');

assertExact(manifest.scripts, expectedScripts, 'Package scripts');

await verifyTailwindCss({ packageRoot, profile, provenance });

console.log(
  `Verified ${PROFILE_ID}: ${profile.items.length} registry payloads, ${expectedNormalizedPaths.size} normalized files`
);
