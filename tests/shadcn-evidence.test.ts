import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventKey, createProofSubjectId, validateShadcnEvidence } from '../scripts/validate-shadcn-evidence.mjs';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const schemaSource = path.join(process.cwd(), 'docs', 'evidence', 'shadcn-migration', 'schema.v1.json');
const schemaBytes = readFileSync(schemaSource, 'utf8');
const schemaSha256 = createHash('sha256').update(schemaBytes).digest('hex');
const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const shaC = 'c'.repeat(64);
const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);

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
      scriptPath: 'scripts/validate-shadcn-evidence.mjs',
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

  it('keeps the trusted workflow on base code and candidate Git data', async () => {
    const workflow = await readFile(path.join(process.cwd(), '.github', 'workflows', 'evidence-history.yml'), 'utf8');
    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('npm ci --ignore-scripts');
    expect(workflow).toContain('--candidate-ref "$CANDIDATE_SHA"');
    expect(workflow).not.toContain('ref: ${{ github.event.pull_request.head.sha }}');
  });
});
