import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import * as prettierYaml from 'prettier/plugins/yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { publishPendingStatus, publishTerminalStatus } from '../.github/evidence-trust/v1/publish-status.mjs';
import { createEventKey, createProofSubjectId, validateShadcnEvidence } from '../scripts/validate-shadcn-evidence.mjs';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const schemaSource = path.join(process.cwd(), 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json');
const schemaBytes = readFileSync(schemaSource, 'utf8');
const schemaSha256 = createHash('sha256').update(schemaBytes).digest('hex');
const trustedFixturePaths = [
  path.join('.github', 'workflows', 'ci.yml'),
  path.join('.github', 'workflows', 'codex-review-fix.yml'),
  path.join('.github', 'workflows', 'evidence-history.yml'),
  path.join('.github', 'evidence-trust', 'v1', '.npmrc'),
  path.join('.github', 'evidence-trust', 'v1', 'node-version'),
  path.join('.github', 'evidence-trust', 'v1', 'package.json'),
  path.join('.github', 'evidence-trust', 'v1', 'package-lock.json'),
  path.join('.github', 'evidence-trust', 'v1', 'publish-status.mjs'),
  path.join('.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs'),
  path.join('docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json')
];
const trustedRuntimePackagePaths = [
  'node_modules/ajv',
  'node_modules/fast-deep-equal',
  'node_modules/fast-uri',
  'node_modules/json-schema-traverse',
  'node_modules/require-from-string'
];
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const shaC = 'c'.repeat(64);
const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);

const parseYaml = (
  prettierYaml as unknown as {
    __parsePrettierYamlConfig: (source: string) => unknown;
  }
).__parsePrettierYamlConfig;

const ids = {
  release: 'rs-1111111111111111',
  priorRelease: 'rs-2222222222222222',
  evidence: 'ev-1111111111111111',
  evidenceTwo: 'ev-2222222222222222',
  evidenceThree: 'ev-3333333333333333',
  evidenceFour: 'ev-4444444444444444',
  topology: 'top-1111111111111111',
  environment: 'env-1111111111111111',
  subject: 'sub-1111111111111111',
  application: 'app-1111111111111111',
  profile: 'prof-1111111111111111',
  package: 'art-1111111111111111',
  report: 'art-2222222222222222',
  singlePackage: 'art-4444444444444444',
  cdnPackage: 'art-5555555555555555',
  standaloneArchive: 'art-6666666666666666',
  stagingAssets: 'art-aaaaaaaaaaaaaaaa',
  resource: 'res-1111111111111111',
  resourceRelease: 'rel-1111111111111111',
  deployment: 'dep-1111111111111111',
  priorPackage: 'art-3333333333333333',
  priorSinglePackage: 'art-7777777777777777',
  priorCdnPackage: 'art-8888888888888888',
  priorStandaloneArchive: 'art-9999999999999999',
  priorStagingAssets: 'art-bbbbbbbbbbbbbbbb',
  priorResource: 'res-2222222222222222',
  priorResourceRelease: 'rel-2222222222222222',
  priorDeployment: 'dep-2222222222222222',
  authorization: 'auth-1111111111111111',
  operator: 'op-1111111111111111'
};

const resourceBinding = {
  resourceId: ids.resource,
  releaseId: ids.resourceRelease,
  manifestSha256: shaB
};
const deploymentIdentity = {
  deploymentId: ids.deployment,
  applicationId: ids.application,
  exportTarget: 'staging-cdn',
  packageArtifactId: ids.package,
  packageSha256: shaA,
  resourceBinding
};
const priorResourceBinding = {
  resourceId: ids.priorResource,
  releaseId: ids.priorResourceRelease,
  manifestSha256: shaC
};
const priorDeploymentIdentity = {
  deploymentId: ids.priorDeployment,
  applicationId: ids.application,
  exportTarget: 'staging-cdn',
  packageArtifactId: ids.priorPackage,
  packageSha256: shaC,
  resourceBinding: priorResourceBinding
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function releaseSet(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'release-set-manifest',
    releaseSetId: ids.release,
    releaseSetProfile: 'application-matrix',
    sourceRevisions: [{ kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitA }],
    uiProfiles: [{ profileId: ids.profile, sha256: shaA }],
    exportTargets: ['source', 'single', 'cdn', 'staging-cdn', 'standalone'],
    artifacts: [
      {
        artifactId: ids.package,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'staging-cdn',
        sha256: shaA
      },
      {
        artifactId: ids.report,
        applicationId: ids.application,
        artifactKind: 'report',
        exportTarget: 'staging-cdn',
        sha256: shaB
      },
      {
        artifactId: ids.singlePackage,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'single',
        sha256: shaA
      },
      {
        artifactId: ids.cdnPackage,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'cdn',
        sha256: shaB
      },
      {
        artifactId: ids.standaloneArchive,
        applicationId: ids.application,
        artifactKind: 'archive',
        exportTarget: 'standalone',
        sha256: shaC
      }
    ],
    resourceManifests: [resourceBinding],
    deployments: [deploymentIdentity],
    ...overrides
  };
}

function priorReleaseSet(overrides = {}) {
  return releaseSet({
    releaseSetId: ids.priorRelease,
    sourceRevisions: [{ kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitB }],
    artifacts: [
      {
        artifactId: ids.priorPackage,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'staging-cdn',
        sha256: shaC
      },
      {
        artifactId: ids.priorSinglePackage,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'single',
        sha256: shaC
      },
      {
        artifactId: ids.priorCdnPackage,
        applicationId: ids.application,
        artifactKind: 'package',
        exportTarget: 'cdn',
        sha256: shaC
      },
      {
        artifactId: ids.priorStandaloneArchive,
        applicationId: ids.application,
        artifactKind: 'archive',
        exportTarget: 'standalone',
        sha256: shaC
      }
    ],
    resourceManifests: [priorResourceBinding],
    deployments: [priorDeploymentIdentity],
    ...overrides
  });
}

function sourceOnlyReleaseSet(overrides = {}) {
  return releaseSet({
    releaseSetProfile: 'source-only',
    exportTargets: ['source'],
    artifacts: [],
    resourceManifests: [],
    deployments: [],
    ...overrides
  });
}

function sourceSubject() {
  const subject = {
    kind: 'source',
    sourceRevision: { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitA }
  };
  return { ...subject, subjectId: createProofSubjectId(subject) };
}

function artifactSubject(overrides = {}) {
  const subject = {
    kind: 'artifact',
    artifactId: ids.package,
    applicationId: ids.application,
    artifactKind: 'package',
    exportTarget: 'staging-cdn',
    sha256: shaA,
    ...overrides
  };
  return { ...subject, subjectId: createProofSubjectId(subject) };
}

function resourceSubject(overrides = {}) {
  const subject = {
    kind: 'resource',
    applicationId: ids.application,
    exportTarget: 'staging-cdn',
    packageArtifactId: ids.package,
    packageSha256: shaA,
    ...resourceBinding,
    ...overrides
  };
  return { ...subject, subjectId: createProofSubjectId(subject) };
}

function deploymentSubject(overrides = {}) {
  const subject = { kind: 'deployment', ...deploymentIdentity, ...overrides };
  return { ...subject, subjectId: createProofSubjectId(subject) };
}

function rollbackSubject(overrides = {}) {
  const subject = {
    kind: 'rollback',
    candidate: { releaseSetId: ids.release, ...deploymentIdentity },
    prior: { releaseSetId: ids.priorRelease, ...priorDeploymentIdentity },
    ...overrides
  };
  return { ...subject, subjectId: createProofSubjectId(subject) };
}

function proofEvent(overrides = {}) {
  const event = {
    schemaVersion: 1,
    kind: 'proof-event',
    evidenceId: ids.evidence,
    releaseSetId: ids.release,
    deploymentTopologyId: ids.topology,
    phaseSurface: 'phase-0',
    sourceRevision: { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitA },
    validator: {
      name: 'spfx-kit-shadcn-evidence',
      repository: 'pbroom/spfx-kit',
      commitSha: commitA,
      scriptPath: '.github/evidence-trust/v1/validate-shadcn-evidence.mjs',
      schemaSha256
    },
    exportTarget: 'source',
    environment: { class: 'local', opaqueId: ids.environment },
    proofSubject: sourceSubject(),
    proofEvent: 'local-validation',
    result: 'pass',
    publicEvidenceReference: { kind: 'repository-path', path: 'docs/evidence/report.md' },
    recordedUtc: '2026-08-05T00:00:00Z',
    accountabilityId: 'A0',
    ...overrides
  };
  return { ...event, eventKey: overrides.eventKey ?? createEventKey(event) };
}

function validEvent(proofEventName) {
  if (proofEventName === 'exact-head-ci') {
    return proofEvent({
      proofEvent: proofEventName,
      environment: { class: 'ci', opaqueId: ids.environment },
      prExactHead: { kind: 'public-git', repository: 'pbroom/spfx-kit', pullRequest: 81, commitSha: commitA }
    });
  }
  if (proofEventName === 'artifact-closure') {
    return proofEvent({ proofEvent: proofEventName, exportTarget: 'staging-cdn', proofSubject: artifactSubject() });
  }
  if (['remote-bytes', 'remote-headers'].includes(proofEventName)) {
    return proofEvent({
      proofEvent: proofEventName,
      exportTarget: 'staging-cdn',
      environment: { class: 'non-production', opaqueId: ids.environment },
      proofSubject: resourceSubject(),
      authorizationEvidenceId: ids.authorization,
      operatorEvidenceId: ids.operator
    });
  }
  if (['rollback-artifacts-retained', 'rollback-drill'].includes(proofEventName)) {
    return proofEvent({
      proofEvent: proofEventName,
      exportTarget: 'staging-cdn',
      environment: { class: 'non-production', opaqueId: ids.environment },
      proofSubject: rollbackSubject(),
      authorizationEvidenceId: ids.authorization,
      operatorEvidenceId: ids.operator
    });
  }
  if (proofEventName === 'local-mock-smoke') {
    return proofEvent({ proofEvent: proofEventName, exportTarget: 'staging-cdn', proofSubject: deploymentSubject() });
  }
  if (
    ['app-catalog-deployment', 'site-install-update', 'sharepoint-runtime', 'fallback-negative-case'].includes(proofEventName)
  ) {
    return proofEvent({
      proofEvent: proofEventName,
      exportTarget: 'staging-cdn',
      environment: { class: 'non-production', opaqueId: ids.environment },
      proofSubject: deploymentSubject(),
      authorizationEvidenceId: ids.authorization,
      operatorEvidenceId: ids.operator
    });
  }
  return proofEvent({ proofEvent: proofEventName });
}

async function createFixture({ manifests = [releaseSet(), priorReleaseSet()], events = [] } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-shadcn-evidence-'));
  temporaryDirectories.push(directory);
  const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
  const releaseSetDirectory = path.join(evidenceDirectory, 'release-sets');
  await mkdir(releaseSetDirectory, { recursive: true });
  await cp(schemaSource, path.join(evidenceDirectory, 'schema.v1.json'));
  await writeFile(
    path.join(evidenceDirectory, 'ledger.v1.jsonl'),
    events.length === 0 ? '' : `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
  );
  for (const manifest of manifests) {
    await writeFile(path.join(releaseSetDirectory, `${manifest.releaseSetId}.json`), `${JSON.stringify(manifest)}\n`);
  }
  return directory;
}

async function createTrustedFixture(options = {}) {
  const directory = await createFixture(options);
  await installTrustedFixturePaths(directory);
  return directory;
}

async function installTrustedFixturePaths(directory: string) {
  for (const relativePath of trustedFixturePaths) {
    const destination = path.join(directory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(process.cwd(), relativePath), destination);
  }
}

function canonicalFixtureJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalFixtureJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalFixtureJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function refreshFixtureTrustBindings(
  directory: string,
  { schema = false, protectedTrees = [] }: { schema?: boolean; protectedTrees?: string[] }
) {
  const trustManifestPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json');
  const trustManifest = JSON.parse(await readFile(trustManifestPath, 'utf8'));
  if (schema) {
    trustManifest.schema.sha256 = createHash('sha256')
      .update(await readFile(path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json')))
      .digest('hex');
  }
  for (const relativeTreePath of protectedTrees) {
    const entries = await Promise.all(
      trustedFixturePaths
        .filter((relativePath) => relativePath.startsWith(`${relativeTreePath}${path.sep}`))
        .sort()
        .map(async (relativePath) => ({
          mode: '100644',
          type: 'blob',
          path: relativePath.split(path.sep).join('/'),
          sha256: createHash('sha256')
            .update(await readFile(path.join(directory, relativePath)))
            .digest('hex')
        }))
    );
    trustManifest.protectedTrees[relativeTreePath] = {
      entryCount: entries.length,
      sha256: createHash('sha256').update(canonicalFixtureJson(entries)).digest('hex')
    };
  }
  await writeFile(trustManifestPath, `${JSON.stringify(trustManifest, null, 2)}\n`);
}

async function createInstalledTrustRuntime(directory: string, versionOverrides: Record<string, string> = {}) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json'), 'utf8')
  );
  for (const packagePath of trustedRuntimePackagePaths) {
    const destination = path.join(directory, '.github', 'evidence-trust', 'v1', packagePath, 'package.json');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      `${JSON.stringify({ name: path.basename(packagePath), version: versionOverrides[packagePath] ?? manifest.runtime.packages[packagePath] })}\n`
    );
  }
}

async function createExecutableTrustRuntimeSource(directory: string) {
  const sourceDirectory = path.join(directory, 'trusted-runtime-source');
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json'), 'utf8')
  );
  for (const packagePath of trustedRuntimePackagePaths) {
    const packageDirectory = path.join(sourceDirectory, packagePath);
    const packageManifest = {
      name: path.basename(packagePath),
      version: manifest.runtime.packages[packagePath],
      ...(packagePath === 'node_modules/ajv' ? { type: 'module', exports: './index.js' } : {})
    };
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(path.join(packageDirectory, 'package.json'), `${JSON.stringify(packageManifest)}\n`);
  }
  await writeFile(
    path.join(sourceDirectory, 'node_modules', 'ajv', 'index.js'),
    [
      'export default class Ajv {',
      '  compile() {}',
      '  getSchema() {',
      '    const validate = () => true;',
      '    validate.errors = [];',
      '    return validate;',
      '  }',
      '}',
      ''
    ].join('\n')
  );
  return sourceDirectory;
}

async function copyExecutableTrustRuntime(directory: string, sourceDirectory: string) {
  const runtimeDirectory = path.join(directory, '.github', 'evidence-trust', 'v1');
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json'), 'utf8')
  );
  for (const packagePath of trustedRuntimePackagePaths) {
    const source = path.join(sourceDirectory, packagePath);
    const installedPackage = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    const expectedVersion = manifest.runtime.packages[packagePath];
    if (installedPackage.version !== expectedVersion) {
      throw new Error(
        `Test runtime package ${packagePath} has version ${installedPackage.version}; expected trust-base version ${expectedVersion}.`
      );
    }
    await cp(source, path.join(runtimeDirectory, packagePath), { recursive: true });
  }
}

async function createHostileAjv(packageDirectory: string, label: string) {
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify({ name: 'ajv', version: '0.0.0-hostile', type: 'module', exports: './index.js' })}\n`
  );
  await writeFile(
    path.join(packageDirectory, 'index.js'),
    `throw new Error(${JSON.stringify(`hostile Ajv loaded from ${label}`)});\n`
  );
}

async function commitAll(directory, message) {
  await execFileAsync('git', ['add', '.'], { cwd: directory });
  await execFileAsync('git', ['commit', '--quiet', '-m', message], { cwd: directory });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: directory });
  return stdout.trim();
}

async function initializeGit(directory) {
  await execFileAsync('git', ['init', '--quiet'], { cwd: directory });
  await execFileAsync('git', ['config', 'user.name', 'Evidence Test'], { cwd: directory });
  await execFileAsync('git', ['config', 'user.email', 'evidence@example.test'], { cwd: directory });
}

const phaseZeroGovernanceEvents = [
  'baseline-inventory',
  'classification-acceptance',
  'accountability-acceptance',
  'decision-acceptance'
];

const proofEvents = [
  ...phaseZeroGovernanceEvents,
  'local-validation',
  'exact-head-ci',
  'local-mock-smoke',
  'artifact-closure',
  'remote-bytes',
  'remote-headers',
  'app-catalog-deployment',
  'site-install-update',
  'sharepoint-runtime',
  'fallback-negative-case',
  'rollback-artifacts-retained',
  'rollback-drill'
];

describe('shadcn migration evidence validator', () => {
  it.each(proofEvents)('accepts a correctly bound %s proof event', async (proofEventName) => {
    const manifests = phaseZeroGovernanceEvents.includes(proofEventName)
      ? [sourceOnlyReleaseSet(), priorReleaseSet()]
      : undefined;
    const directory = await createFixture({ events: [validEvent(proofEventName)], manifests });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toEqual({
      eventCount: 1,
      releaseSetCount: 2
    });
  });

  it.each(phaseZeroGovernanceEvents)('requires a source subject for the Phase 0 %s event', async (proofEventName) => {
    const event = proofEvent({
      proofEvent: proofEventName,
      exportTarget: 'staging-cdn',
      proofSubject: artifactSubject()
    });
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('requires a source proof subject');

    const wrongTarget = proofEvent({ proofEvent: proofEventName, exportTarget: 'staging-cdn' });
    const wrongTargetDirectory = await createFixture({ events: [wrongTarget] });
    await expect(validateShadcnEvidence({ rootDirectory: wrongTargetDirectory })).rejects.toThrow('requires exportTarget source');

    const applicationProfileDirectory = await createFixture({ events: [validEvent(proofEventName)] });
    await expect(validateShadcnEvidence({ rootDirectory: applicationProfileDirectory })).rejects.toThrow(
      'requires a source-only release set'
    );
  });

  it('keeps every required export-target artifact in one immutable release set', async () => {
    const completeReleaseSet = releaseSet();
    const requiredTargetArtifacts = completeReleaseSet.artifacts;
    const directory = await createFixture({ manifests: [completeReleaseSet, priorReleaseSet()] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toMatchObject({ releaseSetCount: 2 });

    await initializeGit(directory);
    const base = await commitAll(directory, 'complete release set');
    const changedArtifacts = requiredTargetArtifacts.map((artifact) =>
      artifact.exportTarget === 'single' ? { ...artifact, sha256: shaC } : artifact
    );
    const manifestPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'release-sets', `${ids.release}.json`);
    await writeFile(manifestPath, `${JSON.stringify({ ...completeReleaseSet, artifacts: changedArtifacts })}\n`);
    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).rejects.toThrow(
      'was edited; manifests are write-once'
    );
  });

  it('rejects incomplete or split application matrices and non-canonical source-only sets', async () => {
    const incompleteTargets = releaseSet({
      exportTargets: ['source', 'single', 'cdn', 'staging-cdn'],
      artifacts: releaseSet().artifacts.filter((artifact) => artifact.exportTarget !== 'standalone')
    });
    const incompleteDirectory = await createFixture({ manifests: [incompleteTargets, priorReleaseSet()] });
    await expect(validateShadcnEvidence({ rootDirectory: incompleteDirectory })).rejects.toThrow('does not match schema v1');

    const incompleteArtifacts = releaseSet({
      artifacts: releaseSet().artifacts.filter((artifact) => artifact.exportTarget !== 'standalone')
    });
    const artifactDirectory = await createFixture({ manifests: [incompleteArtifacts, priorReleaseSet()] });
    await expect(validateShadcnEvidence({ rootDirectory: artifactDirectory })).rejects.toThrow('does not match schema v1');

    const reportOnlyStandalone = releaseSet({
      artifacts: releaseSet().artifacts.map((artifact) =>
        artifact.exportTarget === 'standalone' ? { ...artifact, artifactKind: 'report' } : artifact
      )
    });
    const reportOnlyDirectory = await createFixture({ manifests: [reportOnlyStandalone, priorReleaseSet()] });
    await expect(validateShadcnEvidence({ rootDirectory: reportOnlyDirectory })).rejects.toThrow('does not match schema v1');

    const secondApplicationId = 'app-2222222222222222';
    const crossApplicationArtifacts = releaseSet().artifacts.map((artifact) =>
      ['single', 'cdn', 'standalone'].includes(artifact.exportTarget)
        ? { ...artifact, applicationId: secondApplicationId }
        : artifact
    );
    const crossApplicationDirectory = await createFixture({
      manifests: [releaseSet({ artifacts: crossApplicationArtifacts }), priorReleaseSet()]
    });
    await expect(validateShadcnEvidence({ rootDirectory: crossApplicationDirectory })).rejects.toThrow(
      `application ${ids.application} requires at least one non-report artifact for single`
    );

    const splitDirectory = await createFixture({
      manifests: [
        releaseSet({
          exportTargets: ['source', 'single', 'cdn'],
          artifacts: releaseSet().artifacts.filter((artifact) => ['single', 'cdn'].includes(artifact.exportTarget))
        }),
        priorReleaseSet({
          exportTargets: ['source', 'staging-cdn', 'standalone'],
          artifacts: priorReleaseSet().artifacts.filter((artifact) =>
            ['staging-cdn', 'standalone'].includes(artifact.exportTarget)
          )
        })
      ]
    });
    await expect(validateShadcnEvidence({ rootDirectory: splitDirectory })).rejects.toThrow('does not match schema v1');

    const expandedSourceOnly = sourceOnlyReleaseSet({ exportTargets: ['source', 'single'] });
    const sourceOnlyDirectory = await createFixture({ manifests: [expandedSourceOnly, priorReleaseSet()] });
    await expect(validateShadcnEvidence({ rootDirectory: sourceOnlyDirectory })).rejects.toThrow('does not match schema v1');
  });

  it('prevents non-source and rollback proof from bypassing application-matrix release sets', async () => {
    const artifactEvent = proofEvent({
      proofEvent: 'artifact-closure',
      exportTarget: 'source',
      proofSubject: artifactSubject({ exportTarget: 'source' })
    });
    const artifactDirectory = await createFixture({
      manifests: [sourceOnlyReleaseSet(), priorReleaseSet()],
      events: [artifactEvent]
    });
    await expect(validateShadcnEvidence({ rootDirectory: artifactDirectory })).rejects.toThrow(
      'requires an application-matrix release set'
    );

    const sourceOnlyPrior = sourceOnlyReleaseSet({
      releaseSetId: ids.priorRelease,
      sourceRevisions: [{ kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitB }]
    });
    const rollbackDirectory = await createFixture({
      manifests: [releaseSet(), sourceOnlyPrior],
      events: [validEvent('rollback-drill')]
    });
    await expect(validateShadcnEvidence({ rootDirectory: rollbackDirectory })).rejects.toThrow(
      'rollback prior requires an application-matrix release set'
    );
  });

  it('includes the typed subject ID in the deterministic event key', async () => {
    const event = proofEvent({ eventKey: 'rs-invalid::event-key' });
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('expected');
  });

  it('derives the subject ID from canonical identity and rejects arbitrary valid-looking IDs', async () => {
    const subject = sourceSubject();
    expect(subject.subjectId).toBe(createProofSubjectId({ ...subject, subjectId: ids.subject }));
    expect(subject.subjectId).toMatch(/^sub-[a-f0-9]{32}$/);

    const randomSubject = { ...subject, subjectId: ids.subject };
    const event = proofEvent({ proofSubject: randomSubject });
    event.eventKey = createEventKey(event);
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'proof subject ID is not the deterministic canonical ID'
    );
  });

  it('binds artifact, resource, deployment, and rollback subjects to exact release identities', async () => {
    const artifactDirectory = await createFixture({
      events: [proofEvent({ ...validEvent('artifact-closure'), proofSubject: artifactSubject({ sha256: shaC }) })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: artifactDirectory })).rejects.toThrow('artifact subject');

    const resourceDirectory = await createFixture({
      events: [validEvent('remote-bytes'), validEvent('remote-headers')]
    });
    const resourceLedger = path.join(resourceDirectory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await writeFile(
      resourceLedger,
      `${JSON.stringify(validEvent('remote-bytes'))}\n${JSON.stringify(
        proofEvent({
          ...validEvent('remote-headers'),
          evidenceId: ids.evidenceTwo,
          proofSubject: resourceSubject({ manifestSha256: shaC })
        })
      )}\n`
    );
    await expect(validateShadcnEvidence({ rootDirectory: resourceDirectory })).rejects.toThrow('resource identity absent');

    const deploymentDirectory = await createFixture({
      events: [proofEvent({ ...validEvent('sharepoint-runtime'), proofSubject: deploymentSubject({ packageSha256: shaC }) })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: deploymentDirectory })).rejects.toThrow('exact deployment identity');

    const rollbackDirectory = await createFixture({
      events: [
        proofEvent({
          ...validEvent('rollback-drill'),
          proofSubject: rollbackSubject({
            prior: { releaseSetId: ids.priorRelease, ...priorDeploymentIdentity, packageSha256: shaA }
          })
        })
      ]
    });
    await expect(validateShadcnEvidence({ rootDirectory: rollbackDirectory })).rejects.toThrow('exact deployment identity');
  });

  it('rejects a rollback whose different release-set IDs name the same deployed generation', async () => {
    const noOpPrior = priorReleaseSet({
      artifacts: releaseSet().artifacts,
      resourceManifests: releaseSet().resourceManifests,
      deployments: releaseSet().deployments
    });
    const noOpRollback = rollbackSubject({
      prior: { releaseSetId: ids.priorRelease, ...deploymentIdentity }
    });
    const event = proofEvent({ ...validEvent('rollback-drill'), proofSubject: noOpRollback });
    event.eventKey = createEventKey(event);
    const directory = await createFixture({ manifests: [releaseSet(), noOpPrior], events: [event] });

    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'rollback candidate and prior deployment generations must differ'
    );
  });

  it('does not allow a report digest to satisfy package proof', async () => {
    const event = proofEvent({
      ...validEvent('remote-bytes'),
      proofSubject: resourceSubject({ packageArtifactId: ids.report, packageSha256: shaB })
    });
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'package proof cannot be satisfied by report'
    );
  });

  it('does not allow artifact-closure proof to use a report subject', async () => {
    const event = proofEvent({
      ...validEvent('artifact-closure'),
      proofSubject: artifactSubject({ artifactId: ids.report, artifactKind: 'report', sha256: shaB })
    });
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'artifact closure cannot use a report subject'
    );
  });

  it('enforces target-aware resource and deployment bindings', async () => {
    const remoteSingle = proofEvent({
      ...validEvent('remote-bytes'),
      exportTarget: 'single',
      proofSubject: resourceSubject({ exportTarget: 'single' })
    });
    const remoteDirectory = await createFixture({
      manifests: [releaseSet(), priorReleaseSet()],
      events: [remoteSingle]
    });
    await expect(validateShadcnEvidence({ rootDirectory: remoteDirectory })).rejects.toThrow(
      'remote resource proof requires a cdn or staging-cdn target'
    );

    const singleArtifact = {
      artifactId: ids.package,
      applicationId: ids.application,
      artifactKind: 'package',
      exportTarget: 'single',
      sha256: shaA
    };
    const invalidSingleDeployment = { ...deploymentIdentity, exportTarget: 'single' };
    const replacementStagingArtifact = {
      artifactId: ids.stagingAssets,
      applicationId: ids.application,
      artifactKind: 'app-assets',
      exportTarget: 'staging-cdn',
      sha256: shaB
    };
    const singleArtifacts = [...releaseSet().artifacts.filter((artifact) => artifact.artifactId !== ids.package), singleArtifact];
    singleArtifacts.push(replacementStagingArtifact);
    const singleDirectory = await createFixture({
      manifests: [
        releaseSet({
          artifacts: singleArtifacts,
          deployments: [invalidSingleDeployment]
        }),
        priorReleaseSet()
      ]
    });
    await expect(validateShadcnEvidence({ rootDirectory: singleDirectory })).rejects.toThrow(
      'single/embedded target must not have a resource binding'
    );

    const cdnArtifact = { ...singleArtifact, exportTarget: 'cdn' };
    const cdnArtifacts = [
      ...releaseSet().artifacts.filter((artifact) => artifact.artifactId !== ids.package),
      replacementStagingArtifact,
      cdnArtifact
    ];
    const cdnDirectory = await createFixture({
      manifests: [
        releaseSet({
          artifacts: cdnArtifacts,
          deployments: [{ ...deploymentIdentity, exportTarget: 'cdn', resourceBinding: null }]
        }),
        priorReleaseSet()
      ]
    });
    await expect(validateShadcnEvidence({ rootDirectory: cdnDirectory })).rejects.toThrow(
      'cdn target requires an exact resource binding'
    );
  });

  it('allows single/embedded rollback without resources and requires matching rollback targets', async () => {
    const candidatePackage = {
      artifactId: ids.package,
      applicationId: ids.application,
      artifactKind: 'package',
      exportTarget: 'single',
      sha256: shaA
    };
    const candidateDeployment = {
      deploymentId: ids.deployment,
      applicationId: ids.application,
      exportTarget: 'single',
      packageArtifactId: ids.package,
      packageSha256: shaA,
      resourceBinding: null
    };
    const priorPackage = {
      artifactId: ids.priorPackage,
      applicationId: ids.application,
      artifactKind: 'package',
      exportTarget: 'single',
      sha256: shaC
    };
    const priorDeployment = {
      deploymentId: ids.priorDeployment,
      applicationId: ids.application,
      exportTarget: 'single',
      packageArtifactId: ids.priorPackage,
      packageSha256: shaC,
      resourceBinding: null
    };
    const candidateArtifacts = [
      ...releaseSet().artifacts.filter((artifact) => artifact.artifactId !== ids.package),
      {
        artifactId: ids.stagingAssets,
        applicationId: ids.application,
        artifactKind: 'app-assets',
        exportTarget: 'staging-cdn',
        sha256: shaB
      },
      candidatePackage
    ];
    const priorArtifacts = [
      ...priorReleaseSet().artifacts.filter((artifact) => artifact.artifactId !== ids.priorPackage),
      {
        artifactId: ids.priorStagingAssets,
        applicationId: ids.application,
        artifactKind: 'app-assets',
        exportTarget: 'staging-cdn',
        sha256: shaB
      },
      priorPackage
    ];
    const manifests = [
      releaseSet({
        artifacts: candidateArtifacts,
        resourceManifests: [],
        deployments: [candidateDeployment]
      }),
      priorReleaseSet({
        artifacts: priorArtifacts,
        resourceManifests: [],
        deployments: [priorDeployment]
      })
    ];
    const subjectIdentity = {
      kind: 'rollback',
      candidate: { releaseSetId: ids.release, ...candidateDeployment },
      prior: { releaseSetId: ids.priorRelease, ...priorDeployment }
    };
    const subject = { ...subjectIdentity, subjectId: createProofSubjectId(subjectIdentity) };
    const event = proofEvent({
      ...validEvent('rollback-drill'),
      exportTarget: 'single',
      proofSubject: subject
    });
    event.eventKey = createEventKey(event);
    const directory = await createFixture({ manifests, events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toMatchObject({ eventCount: 1 });

    const mismatchedSubjectIdentity = {
      ...subjectIdentity,
      prior: { releaseSetId: ids.priorRelease, ...priorDeployment, exportTarget: 'staging-cdn' }
    };
    const mismatchedSubject = {
      ...mismatchedSubjectIdentity,
      subjectId: createProofSubjectId(mismatchedSubjectIdentity)
    };
    const mismatchEvent = proofEvent({ ...event, proofSubject: mismatchedSubject });
    mismatchEvent.eventKey = createEventKey(mismatchEvent);
    const mismatchDirectory = await createFixture({ manifests, events: [mismatchEvent] });
    await expect(validateShadcnEvidence({ rootDirectory: mismatchDirectory })).rejects.toThrow(
      'rollback candidate and prior targets must match'
    );
  });

  it('requires validator identity and reconciles public PR exact heads', async () => {
    const missingValidator = proofEvent();
    delete missingValidator.validator;
    const validatorDirectory = await createFixture({ events: [missingValidator] });
    await expect(validateShadcnEvidence({ rootDirectory: validatorDirectory })).rejects.toThrow('required property');

    const wrongSchemaDirectory = await createFixture({
      events: [proofEvent({ validator: { ...proofEvent().validator, schemaSha256: shaA } })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: wrongSchemaDirectory })).rejects.toThrow('trusted schema v1');

    const missingHead = proofEvent({ proofEvent: 'exact-head-ci', environment: { class: 'ci', opaqueId: ids.environment } });
    const missingHeadDirectory = await createFixture({ events: [missingHead] });
    await expect(validateShadcnEvidence({ rootDirectory: missingHeadDirectory })).rejects.toThrow('requires prExactHead');

    const opaqueHead = validEvent('exact-head-ci');
    opaqueHead.prExactHead = { kind: 'private-opaque', exactHeadEvidenceId: 'priv-1111111111111111' };
    const opaqueHeadDirectory = await createFixture({ events: [opaqueHead] });
    await expect(validateShadcnEvidence({ rootDirectory: opaqueHeadDirectory })).rejects.toThrow(
      'public exact-head CI requires a public prExactHead'
    );

    const mismatchedHead = validEvent('exact-head-ci');
    mismatchedHead.prExactHead = { ...mismatchedHead.prExactHead, commitSha: commitB };
    const headDirectory = await createFixture({ events: [mismatchedHead] });
    await expect(validateShadcnEvidence({ rootDirectory: headDirectory })).rejects.toThrow('public PR exact head');

    const reconciledManifest = releaseSet({
      sourceRevisions: [
        { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitA },
        { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitB }
      ]
    });
    const sourceMismatchDirectory = await createFixture({
      manifests: [reconciledManifest, priorReleaseSet()],
      events: [mismatchedHead]
    });
    await expect(validateShadcnEvidence({ rootDirectory: sourceMismatchDirectory })).rejects.toThrow(
      'does not match sourceRevision'
    );
  });

  it.each([
    ['local-validation', 'production'],
    ['exact-head-ci', 'local'],
    ['local-mock-smoke', 'ci'],
    ['artifact-closure', 'production']
  ])('rejects a passing %s proof in an inapplicable %s environment', async (proofEventName, environmentClass) => {
    const event = validEvent(proofEventName);
    event.environment = { class: environmentClass, opaqueId: ids.environment };
    event.eventKey = createEventKey(event);
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('requires');
  });

  it.each([
    'remote-bytes',
    'remote-headers',
    'app-catalog-deployment',
    'site-install-update',
    'sharepoint-runtime',
    'fallback-negative-case',
    'rollback-artifacts-retained',
    'rollback-drill'
  ])('rejects an unauthorized or local operational %s pass', async (proofEventName) => {
    const event = validEvent(proofEventName);
    delete event.authorizationEvidenceId;
    event.environment = { class: 'local', opaqueId: ids.environment };
    event.eventKey = createEventKey(event);
    const directory = await createFixture({ events: [event] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('operational pass');
  });

  it('applies operational requirements only to pass results and keeps rollback drill non-production', async () => {
    const missingAuthorization = validEvent('sharepoint-runtime');
    delete missingAuthorization.authorizationEvidenceId;
    const authorizationDirectory = await createFixture({ events: [missingAuthorization] });
    await expect(validateShadcnEvidence({ rootDirectory: authorizationDirectory })).rejects.toThrow(
      'requires authorizationEvidenceId'
    );

    const missingOperator = validEvent('sharepoint-runtime');
    delete missingOperator.operatorEvidenceId;
    const operatorDirectory = await createFixture({ events: [missingOperator] });
    await expect(validateShadcnEvidence({ rootDirectory: operatorDirectory })).rejects.toThrow('requires operatorEvidenceId');

    const missingResource = validEvent('sharepoint-runtime');
    missingResource.proofSubject = deploymentSubject({ resourceBinding: null });
    missingResource.eventKey = createEventKey(missingResource);
    const resourceDirectory = await createFixture({ events: [missingResource] });
    await expect(validateShadcnEvidence({ rootDirectory: resourceDirectory })).rejects.toThrow(
      'staging-cdn target requires an exact resource binding'
    );

    const failedOperational = validEvent('sharepoint-runtime');
    failedOperational.result = 'fail';
    failedOperational.environment = { class: 'local', opaqueId: ids.environment };
    delete failedOperational.authorizationEvidenceId;
    delete failedOperational.operatorEvidenceId;
    failedOperational.eventKey = createEventKey(failedOperational);
    const failedDirectory = await createFixture({ events: [failedOperational] });
    await expect(validateShadcnEvidence({ rootDirectory: failedDirectory })).resolves.toMatchObject({ eventCount: 1 });

    const productionRollback = validEvent('rollback-drill');
    productionRollback.environment = { class: 'production', opaqueId: ids.environment };
    productionRollback.eventKey = createEventKey(productionRollback);
    const rollbackDirectory = await createFixture({ events: [productionRollback] });
    await expect(validateShadcnEvidence({ rootDirectory: rollbackDirectory })).rejects.toThrow('non-production only');
  });

  it('rejects semantic opaque IDs, unapproved repositories, and non-public URL references', async () => {
    const semanticIdDirectory = await createFixture({
      events: [proofEvent({ evidenceId: 'tenant-aaaaaaaaaaaaaaaa' })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: semanticIdDirectory })).rejects.toThrow('must match pattern');

    const privateRepoDirectory = await createFixture({
      events: [proofEvent({ sourceRevision: { kind: 'public-git', repository: 'private/secret', commitSha: commitA } })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: privateRepoDirectory })).rejects.toThrow('allowed values');

    for (const url of [
      'https://tenant.sharepoint.com/sites/private',
      'https://github.com/pbroom/private-repo/actions/runs/1',
      'https://github.com/pbroom/spfx-kit/actions/runs/1?token=secret'
    ]) {
      const directory = await createFixture({
        events: [proofEvent({ publicEvidenceReference: { kind: 'public-url', url } })]
      });
      await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('must match pattern');
    }
  });

  it('requires a normal linear correction to name its one current leaf', async () => {
    const first = proofEvent();
    const correction = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidence],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const directory = await createFixture({ events: [first, correction] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toMatchObject({ eventCount: 2 });

    delete correction.supersedesEvidenceIds;
    const invalidDirectory = await createFixture({ events: [first, correction] });
    await expect(validateShadcnEvidence({ rootDirectory: invalidDirectory })).rejects.toThrow(
      'must have exactly one current evidence leaf'
    );
  });

  it('bounds new evidence timestamps to trusted validation time plus five minutes', async () => {
    const acceptedTimestamp = new Date(Math.floor((Date.now() + 4 * 60 * 1_000) / 1_000) * 1_000)
      .toISOString()
      .replace('.000Z', 'Z');
    const acceptedDirectory = await createFixture({ events: [proofEvent({ recordedUtc: acceptedTimestamp })] });
    await expect(validateShadcnEvidence({ rootDirectory: acceptedDirectory })).resolves.toMatchObject({ eventCount: 1 });

    const rejectedTimestamp = new Date(Math.floor((Date.now() + 6 * 60 * 1_000) / 1_000) * 1_000)
      .toISOString()
      .replace('.000Z', 'Z');
    const rejectedDirectory = await createFixture({ events: [proofEvent({ recordedUtc: rejectedTimestamp })] });
    await expect(validateShadcnEvidence({ rootDirectory: rejectedDirectory })).rejects.toThrow(
      'recordedUtc exceeds the trusted validation time by more than five minutes'
    );

    const terminalDirectory = await createFixture({
      events: [proofEvent({ recordedUtc: '9999-12-31T23:59:59Z' })]
    });
    await expect(validateShadcnEvidence({ rootDirectory: terminalDirectory })).rejects.toThrow(
      'recordedUtc exceeds the trusted validation time by more than five minutes'
    );
  });

  it('does not retroactively apply the future-time bound to trusted base rows', async () => {
    const directory = await createFixture({ events: [proofEvent({ recordedUtc: '9999-12-31T23:59:59Z' })] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted historical evidence');

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).resolves.toMatchObject({
      eventCount: 1
    });
  });

  it('accepts a correction DAG whose branches share an already-superseded parent and then reconcile', async () => {
    const a = proofEvent();
    const b = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidence],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const c = proofEvent({
      evidenceId: ids.evidenceThree,
      supersedesEvidenceIds: [ids.evidence],
      recordedUtc: '2026-08-05T00:00:02Z'
    });
    const d = proofEvent({
      evidenceId: ids.evidenceFour,
      supersedesEvidenceIds: [ids.evidenceTwo, ids.evidenceThree],
      recordedUtc: '2026-08-05T00:00:03Z'
    });
    const directory = await createFixture({ events: [a, b, c, d] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toMatchObject({ eventCount: 4 });

    const unresolvedDirectory = await createFixture({ events: [a, b, c] });
    await expect(validateShadcnEvidence({ rootDirectory: unresolvedDirectory })).rejects.toThrow(
      'must have exactly one current evidence leaf; found 2'
    );

    const partialResolution = { ...d, supersedesEvidenceIds: [ids.evidenceTwo] };
    const partialDirectory = await createFixture({ events: [a, b, c, partialResolution] });
    await expect(validateShadcnEvidence({ rootDirectory: partialDirectory })).rejects.toThrow(
      'must have exactly one current evidence leaf; found 2'
    );
  });

  it('rejects missing, later, foreign, non-earlier, duplicate, empty, and singular correction IDs', async () => {
    const first = proofEvent();
    const missingCorrection = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidenceThree],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const missingDirectory = await createFixture({ events: [first, missingCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: missingDirectory })).rejects.toThrow('missing or later evidence row');

    const laterEvidence = proofEvent({
      evidenceId: ids.evidenceThree,
      recordedUtc: '2026-08-05T00:00:02Z'
    });
    const laterDirectory = await createFixture({ events: [first, missingCorrection, laterEvidence] });
    await expect(validateShadcnEvidence({ rootDirectory: laterDirectory })).rejects.toThrow('missing or later evidence row');

    const foreign = proofEvent({ phaseSurface: 'phase-1' });
    const foreignCorrection = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidence],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const foreignDirectory = await createFixture({ events: [foreign, foreignCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: foreignDirectory })).rejects.toThrow('different event key');

    const nonEarlierCorrection = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidence],
      recordedUtc: '2026-08-05T00:00:00Z'
    });
    const nonEarlierDirectory = await createFixture({ events: [first, nonEarlierCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: nonEarlierDirectory })).rejects.toThrow(
      'must be recorded after the evidence it supersedes'
    );

    const duplicateCorrection = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [ids.evidence, ids.evidence],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const duplicateDirectory = await createFixture({ events: [first, duplicateCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: duplicateDirectory })).rejects.toThrow('duplicate items');

    const emptyCorrection = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceIds: [],
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const emptyDirectory = await createFixture({ events: [first, emptyCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: emptyDirectory })).rejects.toThrow('fewer than 1 items');

    const singularCorrection = proofEvent({
      evidenceId: ids.evidenceFour,
      supersedesEvidenceId: ids.evidence,
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const singularDirectory = await createFixture({ events: [first, singularCorrection] });
    await expect(validateShadcnEvidence({ rootDirectory: singularDirectory })).rejects.toThrow(
      'must NOT have additional properties'
    );
  });

  it('rejects base ledger, release-set manifest, and schema edits', async () => {
    const directory = await createFixture({ events: [proofEvent()] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'base');
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');

    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), '');
    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).rejects.toThrow('edits or deletes rows');

    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), `${JSON.stringify(proofEvent())}\n`);
    await writeFile(path.join(evidenceDirectory, 'schema.v1.json'), `${schemaBytes}\n`);
    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).rejects.toThrow('v1 bytes are immutable');

    await writeFile(path.join(evidenceDirectory, 'schema.v1.json'), schemaBytes);
    const manifestPath = path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`);
    await writeFile(manifestPath, `${JSON.stringify(releaseSet({ uiProfiles: [] }))}\n`);
    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).rejects.toThrow(
      'was edited; manifests are write-once'
    );
  });

  it('rejects symlinked and executable working-tree ledgers', async () => {
    const symlinkDirectory = await createFixture();
    const symlinkLedgerPath = path.join(symlinkDirectory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await rm(symlinkLedgerPath);
    await symlink(path.join('release-sets', `${ids.release}.json`), symlinkLedgerPath);
    await expect(validateShadcnEvidence({ rootDirectory: symlinkDirectory })).rejects.toThrow(
      'ledger.v1.jsonl must use mode 100644'
    );

    const modeDirectory = await createFixture();
    const modeLedgerPath = path.join(modeDirectory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await chmod(modeLedgerPath, 0o755);
    await expect(validateShadcnEvidence({ rootDirectory: modeDirectory })).rejects.toThrow(
      'ledger.v1.jsonl must use mode 100644'
    );
  });

  it('rejects a symlinked working-tree ledger ancestor directory', async () => {
    const directory = await createFixture();
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    const outsideEvidenceDirectory = path.join(directory, 'outside-evidence');
    await cp(evidenceDirectory, outsideEvidenceDirectory, { recursive: true });
    await rm(evidenceDirectory, { recursive: true });
    await symlink(outsideEvidenceDirectory, evidenceDirectory);

    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'Local repository path ancestor docs/evidence/shadcn-migration must not be a symbolic link'
    );
  });

  it('rejects executable working-tree release-set manifests before parsing JSON', async () => {
    const directory = await createFixture();
    const manifestPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'release-sets', `${ids.release}.json`);
    await writeFile(manifestPath, 'not valid JSON\n');
    await chmod(manifestPath, 0o755);

    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      `Release-set manifests must use mode 100644: ${path.join(
        'docs',
        'evidence',
        'shadcn-migration',
        'release-sets',
        `${ids.release}.json`
      )}`
    );
  });

  it('rejects a symlinked working-tree release-set ancestor directory', async () => {
    const directory = await createFixture();
    const releaseSetDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'release-sets');
    const outsideReleaseSetDirectory = path.join(directory, 'outside-release-sets');
    await cp(releaseSetDirectory, outsideReleaseSetDirectory, { recursive: true });
    await rm(releaseSetDirectory, { recursive: true });
    await symlink(outsideReleaseSetDirectory, releaseSetDirectory);

    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow(
      'Local repository path ancestor docs/evidence/shadcn-migration/release-sets must not be a symbolic link'
    );
  });

  it('validates a candidate ref as inert data with the base validator and schema', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'base');
    const baseRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: base };
    const subject = { kind: 'source', sourceRevision: baseRevision };
    const event = proofEvent({
      sourceRevision: baseRevision,
      validator: { ...proofEvent().validator, commitSha: base },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) }
    });
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    await writeFile(
      path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`),
      `${JSON.stringify(releaseSet({ sourceRevisions: [baseRevision] }))}\n`
    );
    const ledgerPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await writeFile(ledgerPath, `${JSON.stringify(event)}\n`);
    const candidate = await commitAll(directory, 'candidate evidence');

    await expect(
      validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })
    ).resolves.toMatchObject({ eventCount: 1 });

    const schemaPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json');
    await writeFile(schemaPath, `${schemaBytes}\n`);
    const schemaCandidate = await commitAll(directory, 'candidate schema rewrite');
    await writeFile(schemaPath, schemaBytes);
    await expect(
      validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: schemaCandidate })
    ).rejects.toThrow('schema.v1.json differs from docs/evidence/shadcn-migration/trust-base.v1.json');
  });

  it('compares trusted schema Git blobs as raw bytes', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    const schemaPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    schema.title = `${schema.title} \uFFFD`;
    const trustedSchemaBytes = Buffer.from(`${JSON.stringify(schema, null, 2)}\n`);
    await writeFile(schemaPath, trustedSchemaBytes);
    await refreshFixtureTrustBindings(directory, { schema: true });
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted schema with replacement character');

    const replacementOffset = trustedSchemaBytes.indexOf(Buffer.from('\uFFFD'));
    expect(replacementOffset).toBeGreaterThanOrEqual(0);
    await writeFile(
      schemaPath,
      Buffer.concat([
        trustedSchemaBytes.subarray(0, replacementOffset),
        Buffer.from([0x80]),
        trustedSchemaBytes.subarray(replacementOffset + Buffer.byteLength('\uFFFD'))
      ])
    );
    const candidate = await commitAll(directory, 'replace trusted schema character with invalid byte');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'schema.v1.json differs from docs/evidence/shadcn-migration/trust-base.v1.json'
    );
  });

  it('rejects an oversized candidate schema from Git metadata before loading its blob', async () => {
    const directory = await createFixture({ manifests: [] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted schema base');
    const schemaPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json');
    await writeFile(schemaPath, Buffer.alloc(10 * 1024 * 1024 + 1, 0x61));
    const candidate = await commitAll(directory, 'oversized candidate schema');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'docs/evidence/shadcn-migration/schema.v1.json exceeds the evidence size limit'
    );
  });

  it('hashes protected Git tree contents as raw bytes', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    const workflowPath = path.join(directory, '.github', 'workflows', 'ci.yml');
    const trustedWorkflowBytes = Buffer.concat([await readFile(workflowPath), Buffer.from('\n# raw-byte marker: \uFFFD\n')]);
    await writeFile(workflowPath, trustedWorkflowBytes);
    await refreshFixtureTrustBindings(directory, { protectedTrees: [path.join('.github', 'workflows')] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted workflow with replacement character');

    const replacementOffset = trustedWorkflowBytes.indexOf(Buffer.from('\uFFFD'));
    expect(replacementOffset).toBeGreaterThanOrEqual(0);
    await writeFile(
      workflowPath,
      Buffer.concat([
        trustedWorkflowBytes.subarray(0, replacementOffset),
        Buffer.from([0x80]),
        trustedWorkflowBytes.subarray(replacementOffset + Buffer.byteLength('\uFFFD'))
      ])
    );
    const candidate = await commitAll(directory, 'replace trusted workflow character with invalid byte');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'protected tree .github/workflows does not match docs/evidence/shadcn-migration/trust-base.v1.json'
    );
  });

  it('rejects a non-UTF-8 trust manifest before JSON semantics', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    const trustManifestPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json');
    const trustManifestBytes = await readFile(trustManifestPath);
    const statusContextOffset = trustManifestBytes.indexOf(Buffer.from('spfx-kit/evidence-history-v1'));
    expect(statusContextOffset).toBeGreaterThanOrEqual(0);
    trustManifestBytes[statusContextOffset] = 0x80;
    await writeFile(trustManifestPath, trustManifestBytes);

    await expect(validateShadcnEvidence({ rootDirectory: directory })).rejects.toThrow('trust-base.v1.json is not valid UTF-8');
  });

  it('rejects a validator identity that is not an ancestor of the trusted base', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    await initializeGit(directory);
    const bootstrap = await commitAll(directory, 'trusted bootstrap');
    await writeFile(path.join(directory, 'sibling.txt'), 'sibling validator line\n');
    const siblingValidator = await commitAll(directory, 'sibling validator');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', bootstrap], { cwd: directory });
    await writeFile(path.join(directory, 'main.txt'), 'trusted base line\n');
    const base = await commitAll(directory, 'trusted base');
    const baseRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: base };
    const wrongValidatorRevision = {
      kind: 'public-git',
      repository: 'pbroom/spfx-kit',
      commitSha: siblingValidator
    };
    const subject = { kind: 'source', sourceRevision: baseRevision };
    const event = proofEvent({
      sourceRevision: baseRevision,
      validator: { ...proofEvent().validator, commitSha: siblingValidator },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) }
    });
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    await writeFile(
      path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`),
      `${JSON.stringify(releaseSet({ sourceRevisions: [baseRevision, wrongValidatorRevision] }))}\n`
    );
    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), `${JSON.stringify(event)}\n`);
    const candidate = await commitAll(directory, 'candidate evidence with wrong validator commit');

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      `must be an ancestor of trusted base ${base}`
    );
  });

  it('rejects an ancestor validator identity that predates the trust base', async () => {
    const directory = await createFixture({ manifests: [] });
    await initializeGit(directory);
    const preTrustValidator = await commitAll(directory, 'validator before trust-base bootstrap');
    await installTrustedFixturePaths(directory);
    const base = await commitAll(directory, 'trusted bootstrap');

    const baseRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: base };
    const preTrustValidatorRevision = {
      kind: 'public-git',
      repository: 'pbroom/spfx-kit',
      commitSha: preTrustValidator
    };
    const subject = { kind: 'source', sourceRevision: baseRevision };
    const event = proofEvent({
      sourceRevision: baseRevision,
      validator: { ...proofEvent().validator, commitSha: preTrustValidator },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) }
    });
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    await writeFile(
      path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`),
      `${JSON.stringify(sourceOnlyReleaseSet({ sourceRevisions: [baseRevision, preTrustValidatorRevision] }))}\n`
    );
    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), `${JSON.stringify(event)}\n`);
    const candidate = await commitAll(directory, 'candidate evidence with pre-trust validator identity');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      `validator commit ${preTrustValidator} does not contain docs/evidence/shadcn-migration/trust-base.v1.json`
    );
  });

  it('keeps a stable validator identity across an unrelated base advance and correction', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    await initializeGit(directory);
    const validatorCommit = await commitAll(directory, 'trusted validator bootstrap');
    const validatorRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: validatorCommit };
    const subject = { kind: 'source', sourceRevision: validatorRevision };
    const firstEvent = proofEvent({
      sourceRevision: validatorRevision,
      validator: { ...proofEvent().validator, commitSha: validatorCommit },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) }
    });
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    await writeFile(
      path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`),
      `${JSON.stringify(sourceOnlyReleaseSet({ sourceRevisions: [validatorRevision] }))}\n`
    );
    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), `${JSON.stringify(firstEvent)}\n`);
    await commitAll(directory, 'first release set and evidence row');

    await writeFile(path.join(directory, 'docs', 'unrelated.md'), 'unrelated main advance\n');
    const advancedBase = await commitAll(directory, 'unrelated main advance');
    const correction = proofEvent({
      evidenceId: ids.evidenceTwo,
      sourceRevision: validatorRevision,
      validator: { ...proofEvent().validator, commitSha: validatorCommit },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) },
      recordedUtc: '2026-08-05T00:00:01Z',
      supersedesEvidenceIds: [firstEvent.evidenceId]
    });
    await writeFile(
      path.join(evidenceDirectory, 'ledger.v1.jsonl'),
      `${JSON.stringify(firstEvent)}\n${JSON.stringify(correction)}\n`
    );
    const candidate = await commitAll(directory, 'correct evidence with stable validator');

    await expect(
      validateShadcnEvidence({ rootDirectory: directory, baseRef: advancedBase, candidateRef: candidate })
    ).resolves.toEqual({ eventCount: 2, releaseSetCount: 1 });
  });

  it('rejects an ancestor validator identity with different protected trust state', async () => {
    const directory = await createTrustedFixture({ manifests: [] });
    await initializeGit(directory);
    await commitAll(directory, 'trusted validator bootstrap');
    const validatorPath = path.join(directory, '.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs');
    const trustedValidatorBytes = await readFile(validatorPath, 'utf8');
    await writeFile(validatorPath, `${trustedValidatorBytes}\n// untrusted validator drift\n`);
    const driftedValidator = await commitAll(directory, 'drift validator trust state');
    await writeFile(validatorPath, trustedValidatorBytes);
    const base = await commitAll(directory, 'restore trusted validator state');

    const baseRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: base };
    const validatorRevision = { kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: driftedValidator };
    const subject = { kind: 'source', sourceRevision: baseRevision };
    const event = proofEvent({
      sourceRevision: baseRevision,
      validator: { ...proofEvent().validator, commitSha: driftedValidator },
      proofSubject: { ...subject, subjectId: createProofSubjectId(subject) }
    });
    const evidenceDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration');
    await writeFile(
      path.join(evidenceDirectory, 'release-sets', `${ids.release}.json`),
      `${JSON.stringify(releaseSet({ sourceRevisions: [baseRevision, validatorRevision] }))}\n`
    );
    await writeFile(path.join(evidenceDirectory, 'ledger.v1.jsonl'), `${JSON.stringify(event)}\n`);
    const candidate = await commitAll(directory, 'candidate evidence with drifted validator identity');

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'protected tree .github/evidence-trust/v1 differs from trusted base'
    );
  });

  it('rejects symlinked release-set manifests and candidate ledgers', async () => {
    const releaseSetDirectory = await createFixture();
    await initializeGit(releaseSetDirectory);
    const releaseSetBase = await commitAll(releaseSetDirectory, 'base');
    const releaseSetPath = path.join(
      releaseSetDirectory,
      'docs',
      'evidence',
      'shadcn-migration',
      'release-sets',
      `${ids.release}.json`
    );
    await rm(releaseSetPath);
    await symlink(`${ids.priorRelease}.json`, releaseSetPath);
    const releaseSetCandidate = await commitAll(releaseSetDirectory, 'symlink release set');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', releaseSetBase], { cwd: releaseSetDirectory });
    await expect(
      validateShadcnEvidence({
        rootDirectory: releaseSetDirectory,
        baseRef: releaseSetBase,
        candidateRef: releaseSetCandidate
      })
    ).rejects.toThrow('Release-set manifests must use mode 100644');

    const ledgerDirectory = await createFixture();
    await initializeGit(ledgerDirectory);
    const ledgerBase = await commitAll(ledgerDirectory, 'base');
    const ledgerPath = path.join(ledgerDirectory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await rm(ledgerPath);
    await symlink(path.join('release-sets', `${ids.release}.json`), ledgerPath);
    const ledgerCandidate = await commitAll(ledgerDirectory, 'symlink ledger');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', ledgerBase], { cwd: ledgerDirectory });
    await expect(
      validateShadcnEvidence({ rootDirectory: ledgerDirectory, baseRef: ledgerBase, candidateRef: ledgerCandidate })
    ).rejects.toThrow('ledger.v1.jsonl must use mode 100644');
  });

  it.each([
    ['edit', path.join('.github', 'workflows', 'evidence-history.yml')],
    ['delete', path.join('.github', 'workflows', 'evidence-history.yml')],
    ['edit', path.join('.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs')],
    ['delete', path.join('.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs')],
    ['edit', path.join('.github', 'evidence-trust', 'v1', 'package-lock.json')],
    ['delete', path.join('.github', 'evidence-trust', 'v1', 'package-lock.json')],
    ['edit', path.join('docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json')],
    ['delete', path.join('docs', 'evidence', 'shadcn-migration', 'trust-base.v1.json')],
    ['edit', path.join('.github', 'evidence-trust', 'v1', '.npmrc')],
    ['delete', path.join('.github', 'evidence-trust', 'v1', '.npmrc')]
  ] as const)('rejects a candidate that tries to %s immutable trust-base path %s', async (operation, relativePath) => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    const target = path.join(directory, relativePath);
    if (operation === 'edit') {
      await writeFile(target, `${await readFile(target, 'utf8')}\n`);
    } else {
      await rm(target);
    }
    const candidate = await commitAll(directory, `${operation} ${relativePath}`);
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      /trust-base|immutable|protected tree|requires/
    );
  });

  it.each([
    [path.join('.github', 'workflows', 'rogue-status.yml'), 'name: Rogue status\non: push\n'],
    [path.join('.github', 'evidence-trust', 'v1', 'npm-shrinkwrap.json'), '{}\n'],
    [path.join('.github', 'evidence-trust', 'v1', 'node_modules', 'ajv', 'index.js'), 'export default {};\n']
  ])('rejects a candidate addition inside protected tree path %s', async (relativePath, contents) => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    const target = path.join(directory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
    const candidate = await commitAll(directory, `add ${relativePath}`);
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      /protected tree|trust-base/
    );
  });

  it('rejects a protected-tree count mismatch before loading an oversized candidate blob', async () => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    const oversizedWorkflow = path.join(directory, '.github', 'workflows', 'oversized.yml');
    await writeFile(oversizedWorkflow, Buffer.alloc(10 * 1024 * 1024 + 1, 0x61));
    const candidate = await commitAll(directory, 'add oversized protected workflow');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      '.github/workflows protected tree entry count differs from trusted metadata'
    );
  });

  it('rejects the release-set entry count before loading an oversized candidate blob', async () => {
    const directory = await createFixture({ manifests: [] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'base without release sets');
    const releaseSetDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'release-sets');
    for (let index = 0; index <= 1_000; index += 1) {
      await writeFile(path.join(releaseSetDirectory, `candidate-${index.toString().padStart(4, '0')}.json`), '{}\n');
    }
    await writeFile(path.join(releaseSetDirectory, 'candidate-0000.json'), Buffer.alloc(10 * 1024 * 1024 + 1, 0x61));
    const candidate = await commitAll(directory, 'add too many candidate release sets');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'docs/evidence/shadcn-migration/release-sets exceeds the Git tree entry count limit'
    );
  });

  it('rejects aggregate candidate release-set bytes before loading manifest contents', async () => {
    const directory = await createFixture({ manifests: [] });
    await initializeGit(directory);
    const base = await commitAll(directory, 'base without release sets');
    const releaseSetDirectory = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'release-sets');
    await writeFile(path.join(releaseSetDirectory, 'candidate-a.json'), Buffer.alloc(6 * 1024 * 1024, 0x61));
    await writeFile(path.join(releaseSetDirectory, 'candidate-b.json'), Buffer.alloc(6 * 1024 * 1024, 0x62));
    const candidate = await commitAll(directory, 'add oversized aggregate release-set tree');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: directory });

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base, candidateRef: candidate })).rejects.toThrow(
      'docs/evidence/shadcn-migration/release-sets exceeds the Git tree byte limit'
    );
  });

  it('rejects mode and symlink changes in the protected runtime tree', async () => {
    const modeDirectory = await createTrustedFixture();
    await initializeGit(modeDirectory);
    const modeBase = await commitAll(modeDirectory, 'trusted base');
    const validatorPath = path.join(modeDirectory, '.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs');
    await chmod(validatorPath, 0o755);
    const modeCandidate = await commitAll(modeDirectory, 'make validator executable');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', modeBase], { cwd: modeDirectory });
    await expect(
      validateShadcnEvidence({ rootDirectory: modeDirectory, baseRef: modeBase, candidateRef: modeCandidate })
    ).rejects.toThrow(/protected tree|mode 100644/);

    const linkDirectory = await createTrustedFixture();
    await initializeGit(linkDirectory);
    const linkBase = await commitAll(linkDirectory, 'trusted base');
    const npmrcPath = path.join(linkDirectory, '.github', 'evidence-trust', 'v1', '.npmrc');
    await rm(npmrcPath);
    await symlink('node-version', npmrcPath);
    const linkCandidate = await commitAll(linkDirectory, 'replace npm config with symlink');
    await execFileAsync('git', ['checkout', '--quiet', '--detach', linkBase], { cwd: linkDirectory });
    await expect(
      validateShadcnEvidence({ rootDirectory: linkDirectory, baseRef: linkBase, candidateRef: linkCandidate })
    ).rejects.toThrow(/protected tree|mode 100644/);
  });

  it('allows unrelated root runtime files because the trusted install is isolated', async () => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    await writeFile(path.join(directory, '.nvmrc'), '99.0.0\n');
    await writeFile(path.join(directory, 'package.json'), '{"private":true}\n');
    await writeFile(path.join(directory, 'package-lock.json'), '{"lockfileVersion":3}\n');
    await writeFile(path.join(directory, 'npm-shrinkwrap.json'), '{"lockfileVersion":3}\n');

    await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).resolves.toMatchObject({
      eventCount: 0,
      releaseSetCount: 2
    });
  });

  it('resolves Ajv from the canonical isolated runtime despite hostile ancestor and NODE_PATH packages', async () => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    const runtimeSource = await createExecutableTrustRuntimeSource(directory);
    await copyExecutableTrustRuntime(directory, runtimeSource);

    const ancestorDirectories = [directory, path.join(directory, '.github'), path.join(directory, '.github', 'evidence-trust')];
    for (const [index, ancestorDirectory] of ancestorDirectories.entries()) {
      await mkdir(ancestorDirectory, { recursive: true });
      await writeFile(
        path.join(ancestorDirectory, 'package.json'),
        `${JSON.stringify({ name: `hostile-ancestor-${index}`, private: true, type: 'commonjs', dependencies: { ajv: '0.0.0-hostile' } })}\n`
      );
      await writeFile(path.join(ancestorDirectory, 'package-lock.json'), '{"lockfileVersion":3}\n');
      await writeFile(path.join(ancestorDirectory, 'npm-shrinkwrap.json'), '{"lockfileVersion":3}\n');
      await createHostileAjv(path.join(ancestorDirectory, 'node_modules', 'ajv'), `ancestor ${index}`);
    }

    const hostileNodePath = path.join(directory, 'hostile-node-path');
    await createHostileAjv(path.join(hostileNodePath, 'ajv'), 'NODE_PATH');

    const resolverHookPath = path.join(directory, 'observe-resolution.mjs');
    await writeFile(
      resolverHookPath,
      [
        'export async function resolve(specifier, context, nextResolve) {',
        '  const resolution = await nextResolve(specifier, context);',
        "  if (specifier === 'ajv') process.stderr.write(`AJV_RESOLVED=${resolution.url}\\n`);",
        '  return resolution;',
        '}',
        ''
      ].join('\n')
    );
    const registerHookPath = path.join(directory, 'register-resolution-hook.mjs');
    await writeFile(
      registerHookPath,
      `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(resolverHookPath).href)}, import.meta.url);\n`
    );

    const validatorPath = path.join(directory, '.github', 'evidence-trust', 'v1', 'validate-shadcn-evidence.mjs');
    const validatorRunnerPath = path.join(directory, 'run-canonical-validator.mjs');
    await writeFile(
      validatorRunnerPath,
      `import { runEvidenceCli } from ${JSON.stringify(pathToFileURL(validatorPath).href)};\nawait runEvidenceCli(process.argv.slice(2));\n`
    );
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', registerHookPath, validatorRunnerPath, '--root', directory, '--base-ref', base],
      {
        cwd: directory,
        env: { ...process.env, NODE_PATH: hostileNodePath }
      }
    );
    const expectedAjvUrl = pathToFileURL(
      await realpath(path.join(directory, '.github', 'evidence-trust', 'v1', 'node_modules', 'ajv', 'index.js'))
    ).href;

    expect(stdout).toBe('Validated 0 shadcn evidence event(s) and 2 release-set manifest(s).\n');
    expect(stderr).toContain(`AJV_RESOLVED=${expectedAjvUrl}\n`);
    expect(stderr).not.toContain('hostile Ajv loaded');
  });

  it('rejects an installed trusted package that differs from the locked runtime version', async () => {
    const directory = await createTrustedFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'trusted base');
    await createInstalledTrustRuntime(directory, { 'node_modules/fast-uri': '3.1.4' });
    const previousRequired = process.env.EVIDENCE_REQUIRE_ISOLATED_RUNTIME;
    const previousNpmVersion = process.env.EVIDENCE_TRUST_NPM_VERSION;
    process.env.EVIDENCE_REQUIRE_ISOLATED_RUNTIME = '1';
    process.env.EVIDENCE_TRUST_NPM_VERSION = '10.9.8';
    try {
      await expect(validateShadcnEvidence({ rootDirectory: directory, baseRef: base })).rejects.toThrow(
        'Installed trusted runtime package node_modules/fast-uri has version 3.1.4'
      );
    } finally {
      if (previousRequired === undefined) delete process.env.EVIDENCE_REQUIRE_ISOLATED_RUNTIME;
      else process.env.EVIDENCE_REQUIRE_ISOLATED_RUNTIME = previousRequired;
      if (previousNpmVersion === undefined) delete process.env.EVIDENCE_TRUST_NPM_VERSION;
      else process.env.EVIDENCE_TRUST_NPM_VERSION = previousNpmVersion;
    }
  });

  it('publishes pending and successful terminal statuses on the exact candidate SHA', async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    const fetchImpl = async (input: string | URL | Request, options: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, options });
      if (options.method === undefined) {
        return new Response(JSON.stringify({ head: { sha: commitA } }), { status: 200 });
      }
      return new Response('{}', { status: 201 });
    };
    const env = {
      GITHUB_API_URL: 'https://api.github.com',
      GITHUB_REPOSITORY: 'pbroom/spfx-kit',
      GITHUB_TOKEN: 'test-token',
      CANDIDATE_SHA: commitA,
      PR_NUMBER: '88',
      RUN_URL: 'https://github.com/pbroom/spfx-kit/actions/runs/123',
      VALIDATION_OUTCOME: 'success'
    };

    await expect(publishPendingStatus({ env, fetchImpl })).resolves.toMatchObject({ state: 'pending' });
    expect(JSON.parse(String(calls[0].options.body))).toMatchObject({
      state: 'pending',
      context: 'spfx-kit/evidence-history-v1'
    });
    calls.length = 0;

    await expect(publishTerminalStatus({ env, fetchImpl })).resolves.toMatchObject({ state: 'success' });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/pulls/88');
    expect(JSON.parse(String(calls[1].options.body))).toMatchObject({
      state: 'success',
      context: 'spfx-kit/evidence-history-v1'
    });
    expect(calls[1].url).toContain(`/statuses/${commitA}`);
  });

  it.each(['failure', 'cancelled', undefined])(
    'publishes a failing terminal status when validation outcome is %s',
    async (validationOutcome) => {
      const calls: Array<{ url: string; options: RequestInit }> = [];
      const fetchImpl = async (input: string | URL | Request, options: RequestInit = {}) => {
        calls.push({ url: String(input), options });
        if (options.method === undefined) {
          return new Response(JSON.stringify({ head: { sha: commitA } }), { status: 200 });
        }
        return new Response('{}', { status: 201 });
      };
      const env: Record<string, string> = {
        GITHUB_API_URL: 'https://api.github.com',
        GITHUB_REPOSITORY: 'pbroom/spfx-kit',
        GITHUB_TOKEN: 'test-token',
        CANDIDATE_SHA: commitA,
        PR_NUMBER: '88',
        RUN_URL: 'https://github.com/pbroom/spfx-kit/actions/runs/123'
      };
      if (validationOutcome !== undefined) env.VALIDATION_OUTCOME = validationOutcome;

      await expect(publishTerminalStatus({ env, fetchImpl })).rejects.toThrow('failure status published');
      expect(calls).toHaveLength(2);
      expect(JSON.parse(String(calls[1].options.body))).toMatchObject({
        state: 'failure',
        context: 'spfx-kit/evidence-history-v1'
      });
    }
  );

  it('does not publish a terminal status for a superseded candidate head', async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    const fetchImpl = async (input: string | URL | Request, options: RequestInit = {}) => {
      calls.push({ url: String(input), options });
      return new Response(JSON.stringify({ head: { sha: commitB } }), { status: 200 });
    };
    const env = {
      GITHUB_API_URL: 'https://api.github.com',
      GITHUB_REPOSITORY: 'pbroom/spfx-kit',
      GITHUB_TOKEN: 'test-token',
      CANDIDATE_SHA: commitA,
      PR_NUMBER: '88',
      RUN_URL: 'https://github.com/pbroom/spfx-kit/actions/runs/123',
      VALIDATION_OUTCOME: 'success'
    };

    await expect(publishTerminalStatus({ env, fetchImpl })).resolves.toMatchObject({ state: 'stale' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/pulls/88');
  });

  it('checks focused inventories in the checkout selected by --root', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'spfx-shadcn-root-checkout-'));
    temporaryDirectories.push(target);
    await execFileAsync('git', ['clone', '--quiet', '--shared', process.cwd(), target]);

    const targetInventoryPath = path.join(
      target,
      'docs',
      'evidence',
      'shadcn-migration',
      'workbench-v1-public-source-format-inventory.json'
    );
    const targetInventory = JSON.parse(await readFile(targetInventoryPath, 'utf8'));
    targetInventory.sourceRevision.commitSha = 'f'.repeat(40);
    await writeFile(targetInventoryPath, `${JSON.stringify(targetInventory, null, 2)}\n`);

    await expect(validateShadcnEvidence({ rootDirectory: target })).resolves.toMatchObject({
      eventCount: 0,
      releaseSetCount: 0
    });

    const wrapper = path.join(process.cwd(), 'scripts', 'check-shadcn-evidence.mjs');
    await expect(execFileAsync(process.execPath, [wrapper, '--root', target], { cwd: process.cwd() })).rejects.toThrow();
  });

  it('checks focused inventories from the candidate ref instead of the checked-out base', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'spfx-shadcn-candidate-checkout-'));
    temporaryDirectories.push(target);
    await execFileAsync('git', ['clone', '--quiet', '--shared', process.cwd(), target]);
    const { stdout: baseOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: target });
    const base = baseOutput.trim();

    const targetInventoryPath = path.join(
      target,
      'docs',
      'evidence',
      'shadcn-migration',
      'workbench-v1-public-source-format-inventory.json'
    );
    const targetInventory = JSON.parse(await readFile(targetInventoryPath, 'utf8'));
    targetInventory.sourceRevision.commitSha = 'f'.repeat(40);
    await writeFile(targetInventoryPath, `${JSON.stringify(targetInventory, null, 2)}\n`);
    await execFileAsync(
      'git',
      ['-c', 'user.name=Codex', '-c', 'user.email=codex@example.invalid', 'commit', '--quiet', '-am', 'corrupt inventory'],
      { cwd: target }
    );
    const { stdout: candidateOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: target });
    const candidate = candidateOutput.trim();
    await execFileAsync('git', ['checkout', '--quiet', '--detach', base], { cwd: target });
    await symlink(path.join(process.cwd(), 'node_modules'), path.join(target, 'node_modules'), 'dir');

    await expect(
      validateShadcnEvidence({ rootDirectory: target, baseRef: base, candidateRef: candidate })
    ).resolves.toMatchObject({ eventCount: 0, releaseSetCount: 0 });

    const wrapper = path.join(process.cwd(), 'scripts', 'check-shadcn-evidence.mjs');
    await expect(
      execFileAsync(process.execPath, [wrapper, '--root', target, '--base-ref', base, '--candidate-ref', candidate], {
        cwd: process.cwd()
      })
    ).rejects.toThrow();
  });

  it('structurally keeps the trusted workflow on base code and candidate Git data', async () => {
    const source = await readFile(path.join(process.cwd(), '.github', 'workflows', 'evidence-history.yml'), 'utf8');
    const workflow = parseYaml(source) as {
      on: Record<string, { branches: string[]; types: string[] }>;
      permissions: Record<string, string>;
      jobs: Record<
        string,
        {
          'runs-on': string;
          steps: Array<{
            name?: string;
            uses?: string;
            if?: string;
            env?: Record<string, string>;
            run?: string;
            with?: Record<string, string | number | boolean>;
          }>;
        }
      >;
    };

    expect(Object.keys(workflow.on)).toEqual(['pull_request_target']);
    expect(workflow.on.pull_request_target).toEqual({
      branches: ['main'],
      types: ['opened', 'synchronize', 'reopened', 'edited']
    });
    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'read', statuses: 'write' });

    const job = workflow.jobs['verify-history'];
    expect(job['runs-on']).toBe('ubuntu-24.04');
    const checkout = job.steps[0];
    expect(checkout.uses).toBe('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
    expect(checkout.with).toEqual({
      ref: '${{ github.event.pull_request.base.sha }}',
      'fetch-depth': 0,
      'persist-credentials': false
    });

    const setupNode = job.steps[1];
    expect(setupNode.uses).toBe('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(setupNode.with).toEqual({ 'node-version-file': '.github/evidence-trust/v1/node-version' });

    const steps = new Map(job.steps.filter((step) => step.name).map((step) => [step.name, step]));
    const pending = steps.get('Mark candidate history validation pending');
    expect(pending?.env?.CANDIDATE_SHA).toBe('${{ github.event.pull_request.head.sha }}');
    expect(pending?.run).toBe('node .github/evidence-trust/v1/publish-status.mjs pending');

    const install = steps.get('Install trusted validator dependencies');
    expect(install?.run).toContain('[[ "$(node --version)" == v22.22.3 ]]');
    expect(install?.run).toContain('[[ "$(npm --version)" == 10.9.8 ]]');
    expect(install?.run).toContain('npm ci --ignore-scripts --prefix .github/evidence-trust/v1');

    const fetchCandidate = steps.get('Fetch candidate as inert Git data');
    expect(fetchCandidate?.env).toEqual({
      EXPECTED_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}'
    });
    expect(fetchCandidate?.run).toContain('+refs/pull/${PR_NUMBER}/head:${candidate_ref}');
    expect(fetchCandidate?.run).toContain('[[ "$actual_sha" == "$EXPECTED_HEAD_SHA" ]]');

    const validate = steps.get('Validate candidate with trusted base code');
    expect(validate?.env).toEqual({
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      CANDIDATE_SHA: '${{ github.event.pull_request.head.sha }}',
      EVIDENCE_REQUIRE_ISOLATED_RUNTIME: '1',
      EVIDENCE_TRUST_NPM_VERSION: '10.9.8'
    });
    expect(validate?.run).toContain('node .github/evidence-trust/v1/validate-shadcn-evidence.mjs');
    expect(validate?.run).toContain('--candidate-ref "$CANDIDATE_SHA"');

    const terminal = steps.get('Publish candidate-head history status');
    expect(terminal?.if).toBe('${{ always() }}');
    expect(terminal?.env?.CANDIDATE_SHA).toBe('${{ github.event.pull_request.head.sha }}');
    expect(terminal?.env?.PR_NUMBER).toBe('${{ github.event.pull_request.number }}');
    expect(terminal?.env?.VALIDATION_OUTCOME).toBe('${{ steps.validate.outcome }}');
    expect(terminal?.run).toBe('node .github/evidence-trust/v1/publish-status.mjs terminal');
  });
});
