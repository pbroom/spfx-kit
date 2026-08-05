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
  topology: 'top-1111111111111111',
  environment: 'env-1111111111111111',
  subject: 'sub-1111111111111111',
  application: 'app-1111111111111111',
  profile: 'prof-1111111111111111',
  package: 'art-1111111111111111',
  report: 'art-2222222222222222',
  resource: 'res-1111111111111111',
  resourceRelease: 'rel-1111111111111111',
  deployment: 'dep-1111111111111111',
  priorPackage: 'art-3333333333333333',
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
    sourceRevisions: [{ kind: 'public-git', repository: 'pbroom/spfx-kit', commitSha: commitA }],
    uiProfiles: [{ profileId: ids.profile, sha256: shaA }],
    exportTargets: ['source', 'staging-cdn'],
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
      }
    ],
    resourceManifests: [priorResourceBinding],
    deployments: [priorDeploymentIdentity],
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
  for (const relativePath of trustedFixturePaths) {
    const destination = path.join(directory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(process.cwd(), relativePath), destination);
  }
  return directory;
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

const proofEvents = [
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
    const directory = await createFixture({ events: [validEvent(proofEventName)] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toEqual({
      eventCount: 1,
      releaseSetCount: 2
    });
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
      manifests: [releaseSet({ exportTargets: ['source', 'single', 'staging-cdn'] }), priorReleaseSet()],
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
    const singleDirectory = await createFixture({
      manifests: [
        releaseSet({
          exportTargets: ['source', 'single'],
          artifacts: [singleArtifact],
          deployments: [invalidSingleDeployment]
        }),
        priorReleaseSet()
      ]
    });
    await expect(validateShadcnEvidence({ rootDirectory: singleDirectory })).rejects.toThrow(
      'single/embedded target must not have a resource binding'
    );

    const cdnArtifact = { ...singleArtifact, exportTarget: 'cdn' };
    const cdnDirectory = await createFixture({
      manifests: [
        releaseSet({
          exportTargets: ['source', 'cdn'],
          artifacts: [cdnArtifact],
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
    const manifests = [
      releaseSet({
        exportTargets: ['source', 'single'],
        artifacts: [candidatePackage],
        resourceManifests: [],
        deployments: [candidateDeployment]
      }),
      priorReleaseSet({
        exportTargets: ['source', 'single'],
        artifacts: [priorPackage],
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

  it('requires corrections to append a linear supersession chain', async () => {
    const first = proofEvent();
    const correction = proofEvent({
      evidenceId: ids.evidenceTwo,
      supersedesEvidenceId: ids.evidence,
      recordedUtc: '2026-08-05T00:00:01Z'
    });
    const directory = await createFixture({ events: [first, correction] });
    await expect(validateShadcnEvidence({ rootDirectory: directory })).resolves.toMatchObject({ eventCount: 2 });

    delete correction.supersedesEvidenceId;
    const invalidDirectory = await createFixture({ events: [first, correction] });
    await expect(validateShadcnEvidence({ rootDirectory: invalidDirectory })).rejects.toThrow('must supersede current evidence');
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

  it('validates a candidate ref as inert data with the base validator and schema', async () => {
    const directory = await createFixture();
    await initializeGit(directory);
    const base = await commitAll(directory, 'base');
    const ledgerPath = path.join(directory, 'docs', 'evidence', 'shadcn-migration', 'ledger.v1.jsonl');
    await writeFile(ledgerPath, `${JSON.stringify(proofEvent())}\n`);
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
    ).rejects.toThrow('v1 bytes are immutable');
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
      'fetch-depth': 1,
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
