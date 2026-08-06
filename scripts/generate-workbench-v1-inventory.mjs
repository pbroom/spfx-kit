import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repository = 'pbroom/spfx-kit';
const revision = '90bde2f30fd9db4f524583c5cad84de1063c5f21';
const runtimePath = 'packages/code-workbench-runtime/src/index.ts';
const propertyPanePath = 'apps/lab/src/components/PropertyPane.tsx';
const editorPath = 'apps/lab/src/components/CodeWorkspaceEditor.tsx';
const controlContractPath = 'packages/spfx-lab-runtime/src/index.ts';
const lockPath = 'package-lock.json';

function gitShow(sourcePath) {
  return execFileSync('git', ['show', `${revision}:${sourcePath}`], { encoding: 'utf8' });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function extractTemplate(source, name) {
  const match = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;').exec(source);
  if (!match) {
    throw new Error(`Unable to extract ${name} from ${runtimePath} at ${revision}.`);
  }
  return match[1];
}

function requireText(source, expected, sourcePath) {
  if (!source.includes(expected)) {
    throw new Error(`Expected text is missing from ${sourcePath} at ${revision}: ${expected}`);
  }
}

function requireExactList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: expected ${expected.join(', ')}; found ${actual.join(', ')}`);
  }
}

const runtime = gitShow(runtimePath);
const propertyPane = gitShow(propertyPanePath);
const editor = gitShow(editorPath);
const controlContract = gitShow(controlContractPath);
const lockSource = gitShow(lockPath);
const lock = JSON.parse(lockSource);
const lockedLzString = lock.packages['node_modules/lz-string'];
if (lockedLzString?.version !== '1.5.0') {
  throw new Error(`Unexpected lock-resolved lz-string version: ${lockedLzString?.version}`);
}

const prefix = 'spfx-code-workbench:v1:';
const approvedModules = [
  'react',
  'react-dom',
  '@fluentui/react-components',
  '@tanstack/react-query',
  '@tanstack/react-table',
  'zod',
  'zustand'
];
const declaredTypeRequiredFields = ['version', 'mode', 'tsx', 'html', 'css', 'scss', 'ts', 'js'];
const optionalFields = ['updatedAt', 'updatedBy'];
const modes = ['auto', 'react', 'html'];

for (const expected of [
  `export const CODE_WORKBENCH_SOURCE_PREFIX = '${prefix}';`,
  'export const CODE_WORKBENCH_RAW_WARN_BYTES = 150 * 1024;',
  'export const CODE_WORKBENCH_RAW_BLOCK_BYTES = 350 * 1024;',
  'LZString.compressToEncodedURIComponent(raw)',
  'LZString.decompressFromEncodedURIComponent(encoded)',
  'return normalizeCodeWorkbenchSource({ ...fallback, ...JSON.parse(raw) });',
  'return normalizeCodeWorkbenchSource({ ...fallback, ...JSON.parse(value) });'
]) {
  requireText(runtime, expected, runtimePath);
}

const approvedModuleBlock = /export const approvedCodeWorkspaceModuleNames:[^=]+\[([\s\S]*?)\];/u.exec(editor);
if (!approvedModuleBlock) throw new Error(`Unable to parse approved modules from ${editorPath}.`);
const parsedApprovedModules = [...approvedModuleBlock[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]);
requireExactList(parsedApprovedModules, approvedModules, 'Approved Workbench module list');

const modeDeclaration = /export type CodeWorkbenchMode = ([^;]+);/u.exec(runtime);
if (!modeDeclaration) throw new Error(`Unable to parse CodeWorkbenchMode from ${runtimePath}.`);
const parsedModes = [...modeDeclaration[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]);
requireExactList(parsedModes, modes, 'Workbench modes');

const sourceInterface = /export interface CodeWorkbenchSourceV1 \{([\s\S]*?)\n\}/u.exec(runtime);
if (!sourceInterface) throw new Error(`Unable to parse CodeWorkbenchSourceV1 from ${runtimePath}.`);
const parsedFields = [...sourceInterface[1].matchAll(/^\s+([A-Za-z][A-Za-z0-9]*)(\?)?:/gmu)];
requireExactList(
  parsedFields.filter((match) => !match[2]).map((match) => match[1]),
  declaredTypeRequiredFields,
  'CodeWorkbenchSourceV1 required type fields'
);
requireExactList(
  parsedFields.filter((match) => Boolean(match[2])).map((match) => match[1]),
  optionalFields,
  'CodeWorkbenchSourceV1 optional type fields'
);

requireText(propertyPane, "control.type === 'codeWorkspace'", propertyPanePath);
requireText(propertyPane, 'deserializeCodeWorkbenchSource(', propertyPanePath);
requireText(propertyPane, 'serializeCodeWorkbenchSource(nextSource)', propertyPanePath);
requireText(controlContract, "type: 'codeWorkspace';", controlContractPath);

const defaultSource = {
  version: 1,
  mode: 'react',
  tsx: extractTemplate(runtime, 'DEFAULT_TSX'),
  html: '',
  css: extractTemplate(runtime, 'DEFAULT_CSS'),
  scss: '',
  ts: '',
  js: ''
};
const defaultRaw = JSON.stringify(defaultSource);
const prefixMatches = execFileSync('git', ['grep', '-l', prefix, revision, '--', ':!docs/**', ':!package-lock.json'], {
  encoding: 'utf8'
})
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((match) => match.replace(`${revision}:`, ''));

if (prefixMatches.length !== 1 || prefixMatches[0] !== runtimePath) {
  throw new Error(`Expected only the format definition to contain ${prefix}; found ${prefixMatches.join(', ')}`);
}

const controlRegistrationMatches = execFileSync(
  'git',
  ['grep', '-l', '-E', 'type:[[:space:]]*[\'\\"]codeWorkspace[\'\\"]', revision, '--', ':!docs/**'],
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((match) => match.replace(`${revision}:`, ''));
if (controlRegistrationMatches.length !== 1 || controlRegistrationMatches[0] !== controlContractPath) {
  throw new Error(`Concrete codeWorkspace registration search changed: ${controlRegistrationMatches.join(', ')}`);
}

const inventory = {
  schemaVersion: 1,
  kind: 'code-workbench-v1-public-source-format-inventory',
  evidenceBoundary:
    'Public source-format and prefixed-envelope search only. No persisted population is inferred. No tenant, site, App Catalog, managed-app, user-authored, private, licensed, browser-runtime, migration, deployment, or rollback data was inspected.',
  sourceRevision: {
    repository,
    commitSha: revision
  },
  reproduction: {
    node: '22.22.3',
    command: 'node scripts/generate-workbench-v1-inventory.mjs',
    method:
      'Read the four source files from the pinned Git revision, parse and assert the public type, mode, module, and consumer bindings, derive the normalized default, and search tracked non-document files for prefixed V1 envelopes and concrete control registrations.'
  },
  sourceFiles: [
    {
      path: runtimePath,
      sha256: sha256(runtime),
      lines: {
        format: [4, 17],
        prefixAndLimits: [69, 71],
        defaultAndNormalization: [73, 124],
        serialization: [126, 144],
        deserialization: [146, 172]
      }
    },
    {
      path: propertyPanePath,
      sha256: sha256(propertyPane),
      lines: { propertyBagBridge: [146, 168] }
    },
    {
      path: editorPath,
      sha256: sha256(editor),
      lines: { approvedModules: [66, 85] }
    },
    {
      path: controlContractPath,
      sha256: sha256(controlContract),
      lines: { controlDiscriminant: [134, 140] }
    },
    {
      path: lockPath,
      sha256: sha256(lockSource),
      dependency: 'lz-string@1.5.0'
    }
  ],
  persistenceFormat: {
    version: 1,
    prefix,
    modes,
    declaredTypeRequiredFields,
    optionalFields,
    serializationLibrary: 'lz-string@1.5.0',
    encoding: 'LZString.compressToEncodedURIComponent(JSON.stringify(normalizedSource))',
    acceptedInputs: ['prefixed-compressed-v1-envelope', 'unprefixed-raw-json'],
    runtimeObjectValidation:
      'Parseable objects are not structurally validated. Missing known fields are defaulted, unknown fields are dropped, invalid modes become react, and every normalized result has version 1.',
    parseOrDecompressionFailureBehavior: 'Return a newly constructed normalized V1 HTML error fallback.',
    inputVersionValidation:
      'No input version discriminator is rejected; normalization always emits version 1. This is an inventory fact, not V2 compatibility.',
    rawWarningBytes: 153600,
    rawBlockBytes: 358400,
    rawByteEncoding: 'UTF-8',
    thresholdComparison: 'strictly-greater-than',
    blockedWriteBehavior: 'PropertyPane retains the prior property-bag value when serialization is blocked.'
  },
  persistenceBoundary: {
    carrier: 'The generic LabPropertyBag value selected by a codeWorkspace control name.',
    trackedConcreteControlRegistrationCount: 0,
    genericControlTypeDefinitionSearchMatches: controlRegistrationMatches,
    publicTrackedPrefixedSerializedEnvelopeCount: 0,
    publicTrackedPrefixSearchMatches: prefixMatches,
    unprefixedRawJsonFixtureInventory: 'not-established-by-prefix-search',
    populationInference: 'none',
    privatePopulationInspection: 'not-performed',
    privatePopulationCount: null
  },
  normalizedDefault: {
    rawUtf8Bytes: Buffer.byteLength(defaultRaw, 'utf8'),
    rawSha256: sha256(defaultRaw),
    source: defaultSource
  },
  approvedRuntimeModules: approvedModules,
  accountability: {
    owner: 'A6',
    decision: 'docs/adr/0004-workbench-v1-v2-migration.md',
    removalIssue: 'https://github.com/pbroom/spfx-kit/issues/84',
    removalDeadline: 'Phase 6 exit before Phase 7 rollout'
  },
  proofStatus: {
    publicFormatInventory: 'recorded',
    publicPrefixedEnvelopeSearch: 'recorded-empty',
    persistedPopulationInventory: 'not-run',
    privatePopulationInventory: 'not-run',
    v2Compatibility: 'not-run',
    runtime: 'not-run',
    migration: 'not-run',
    rollback: 'not-run'
  }
};

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
