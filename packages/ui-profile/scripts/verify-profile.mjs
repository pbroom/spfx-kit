import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { assertGeneratedTreeClosure, pinnedTypeDirectiveNames } from './lib/generated-tree-closure.mjs';
import { assertRegistryMetadataDependencies } from './lib/profile-update-intake.mjs';
import {
  GENERATOR_VERSION,
  NORMALIZATION_CONTRACT_VERSION,
  PROFILE_ID,
  PROFILE_SCHEMA_VERSION,
  REGISTRY_IDS,
  canonicalJson,
  externalImports,
  normalizeRegistrySource,
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

const expectedIds = [...REGISTRY_IDS];
const expectedCompilerInputPaths = [
  'compat-consumers/react17-base-ui-jsx.d.ts',
  'scripts/typecheck.mjs',
  'scripts/lib/generate-profile.mjs',
  'scripts/lib/profile-update-intake.mjs',
  'scripts/lib/typecheck-generated-profile.mjs',
  'scripts/lib/generate-validated-profile.mjs',
  'scripts/lib/generated-tree-closure.mjs',
  'scripts/prepare-base-ui.mjs',
  'scripts/transform-base-ui-select-value.mjs',
  'scripts/transform-base-ui-popup-lifecycle.mjs',
  'scripts/lib/preparation-lock.mjs',
  'tsconfig.base.json',
  'tsconfig.ts53.json',
  'tsconfig.ts58.json'
];

const expectedDirectDependencies = {
  '@base-ui/react': '1.6.0',
  'class-variance-authority': '0.7.1',
  clsx: '2.1.1',
  'lucide-react': '1.25.0',
  react: '17.0.1',
  'react-dom': '17.0.1',
  'tailwind-merge': '3.6.0'
};

const expectedDevDependencies = {
  ...expectedDirectDependencies,
  '@floating-ui/core': '1.7.5',
  '@floating-ui/dom': '1.7.6',
  '@floating-ui/react-dom': '2.1.8',
  '@floating-ui/utils': '0.2.11',
  '@types/react': '17.0.45',
  '@types/react-dom': '17.0.17',
  '@types/scheduler': '0.16.8',
  ajv: '8.20.0',
  shadcn: '4.16.1',
  typescript: '5.3.3',
  'typescript-5-8': 'npm:typescript@5.8.3'
};

const expectedScripts = {
  'profile:update:network': 'node ./scripts/update-profile.mjs --allow-network',
  'profile:regenerate': 'node ./scripts/regenerate-profile.mjs',
  'profile:verify': 'node ./scripts/verify-profile.mjs',
  'profile:verify:closure': 'node ./scripts/verify-dependency-closure.mjs',
  'profile:verify:base-ui':
    'node ./scripts/transform-base-ui-select-value.mjs --verify-fixtures && node ./scripts/transform-base-ui-popup-lifecycle.mjs --verify-fixtures',
  'profile:prepare:base-ui': 'node ./scripts/prepare-base-ui.mjs',
  'typecheck:ts53': 'node ./scripts/typecheck.mjs typescript 5.3.3 ./tsconfig.ts53.json',
  'typecheck:ts58': 'node ./scripts/typecheck.mjs typescript-5-8 5.8.3 ./tsconfig.ts58.json',
  typecheck: 'npm run profile:prepare:base-ui && npm run typecheck:ts53 && npm run typecheck:ts58',
  verify: 'npm run profile:verify && npm run profile:verify:base-ui && npm run profile:verify:closure'
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
  sha256(Buffer.from(canonicalJson(profileSchema))) === 'e36ae25449c7b917c44d578c33ed12d58cb0e299c2496001669aa3a69638d6d1',
  'profile.schema.json identity differs'
);
assert(
  sha256(Buffer.from(canonicalJson(provenanceSchema))) === '64b48f281eb52c98d8698a22749b09953c86458a8418f00b227c3ac1059f32ef',
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
assert(manifest.dependencies === undefined, 'Tooling-only package must not declare production dependencies');
for (const [name, version] of Object.entries(expectedDirectDependencies)) {
  assert(manifest.devDependencies[name] === version, `${name}: package development dependency differs`);
}
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
  assert(raw.name === item.id, `${item.id}: raw registry identity differs`);
  assert(canonicalJson(raw) === canonicalBytes.toString('utf8'), `${item.id}: canonical bytes are not reproducible`);
  assertExact(canonical, raw, `${item.id}: canonical JSON value`);

  assertRegistryMetadataDependencies(raw, {
    excludedDependencies: provenance.excludedDependencies,
    directProductionDependencies: provenance.directProductionDependencies
  });

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
      registrySourcePath: registryFile.path
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

assertExact(await filesUnder('snapshots/raw'), [...expectedRawPaths].sort(), 'Raw snapshot inventory');
assertExact(await filesUnder('snapshots/canonical'), [...expectedCanonicalPaths].sort(), 'Canonical snapshot inventory');
assertExact(await filesUnder('normalized'), [...expectedNormalizedPaths].sort(), 'Normalized source inventory');

assertExact(manifest.scripts, expectedScripts, 'Package scripts');

console.log(
  `Verified ${PROFILE_ID}: ${profile.items.length} registry payloads, ${expectedNormalizedPaths.size} normalized files`
);
