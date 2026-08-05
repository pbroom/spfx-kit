import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Ajv from 'ajv';

const execFileAsync = promisify(execFile);
const EVIDENCE_DIRECTORY = path.join('docs', 'evidence', 'shadcn-migration');
const LEDGER_PATH = path.join(EVIDENCE_DIRECTORY, 'ledger.v1.jsonl');
const SCHEMA_PATH = path.join(EVIDENCE_DIRECTORY, 'schema.v1.json');
const RELEASE_SET_DIRECTORY = path.join(EVIDENCE_DIRECTORY, 'release-sets');
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_RELEASE_SET_COUNT = 1_000;

const SUBJECT_KIND_BY_EVENT = new Map([
  ['local-validation', 'source'],
  ['exact-head-ci', 'source'],
  ['local-mock-smoke', 'deployment'],
  ['artifact-closure', 'artifact'],
  ['remote-bytes', 'resource'],
  ['remote-headers', 'resource'],
  ['app-catalog-deployment', 'deployment'],
  ['site-install-update', 'deployment'],
  ['sharepoint-runtime', 'deployment'],
  ['fallback-negative-case', 'deployment'],
  ['rollback-artifacts-retained', 'rollback'],
  ['rollback-drill', 'rollback']
]);
const OPERATIONAL_EVENTS = new Set([
  'remote-bytes',
  'remote-headers',
  'app-catalog-deployment',
  'site-install-update',
  'sharepoint-runtime',
  'fallback-negative-case',
  'rollback-artifacts-retained',
  'rollback-drill'
]);

function formatAjvErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertBlobSize(contents, label) {
  assert(Buffer.byteLength(contents, 'utf8') <= MAX_EVIDENCE_BYTES, `${label} exceeds the evidence size limit.`);
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function normalizeRepositoryPath(value) {
  return value.split(path.sep).join('/');
}

function sourceRevisionKey(revision) {
  if (revision.kind === 'public-git') {
    return `public-git:${revision.repository}@${revision.commitSha}`;
  }
  return `private-opaque:${revision.revisionEvidenceId}`;
}

function resourceBindingKey(binding) {
  return binding === null ? 'none' : `${binding.resourceId}/${binding.releaseId}@${binding.manifestSha256}`;
}

function deploymentIdentityKey(deployment) {
  return [
    deployment.deploymentId,
    deployment.applicationId,
    deployment.exportTarget,
    deployment.packageArtifactId,
    deployment.packageSha256,
    resourceBindingKey(deployment.resourceBinding)
  ].join(':');
}

function rollbackReleaseIdentityKey(identity) {
  return `${identity.releaseSetId}:${deploymentIdentityKey(identity)}`;
}

function canonicalProofSubjectIdentity(subject) {
  if (subject.kind === 'source') {
    return `source:${sourceRevisionKey(subject.sourceRevision)}`;
  }
  if (subject.kind === 'artifact') {
    return [
      'artifact',
      subject.applicationId,
      subject.artifactId,
      subject.artifactKind,
      subject.exportTarget,
      subject.sha256
    ].join(':');
  }
  if (subject.kind === 'resource') {
    return [
      'resource',
      subject.applicationId,
      subject.packageArtifactId,
      subject.packageSha256,
      subject.exportTarget,
      resourceBindingKey(subject)
    ].join(':');
  }
  if (subject.kind === 'deployment') {
    return `deployment:${deploymentIdentityKey(subject)}`;
  }
  return `rollback:candidate=${rollbackReleaseIdentityKey(subject.candidate)}:prior=${rollbackReleaseIdentityKey(subject.prior)}`;
}

export function createProofSubjectId(subject) {
  return `sub-${sha256(canonicalProofSubjectIdentity(subject)).slice(0, 32)}`;
}

export function createEventKey(event) {
  return [
    event.releaseSetId,
    event.deploymentTopologyId,
    event.phaseSurface,
    event.exportTarget,
    `${event.environment.class}/${event.environment.opaqueId}`,
    event.proofEvent,
    event.proofSubject.subjectId
  ].join('::');
}

export function parseLedger(contents, validateProofEvent) {
  assertBlobSize(contents, 'Evidence ledger');
  if (contents.length === 0) {
    return [];
  }

  assert(contents.endsWith('\n'), 'Evidence ledger must end with a newline.');
  const lines = contents.slice(0, -1).split('\n');
  assert(
    lines.every((line) => line.trim().length > 0),
    'Evidence ledger must not contain blank rows.'
  );

  return lines.map((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`Evidence ledger row ${index + 1} is not valid JSON: ${error.message}`, { cause: error });
    }

    if (!validateProofEvent(event)) {
      throw new Error(`Evidence ledger row ${index + 1} does not match schema v1: ${formatAjvErrors(validateProofEvent.errors)}`);
    }
    return event;
  });
}

function findArtifact(releaseSet, artifactId) {
  return releaseSet.artifacts.find((artifact) => artifact.artifactId === artifactId);
}

function assertResourceBinding(releaseSet, binding, label) {
  assert(
    releaseSet.resourceManifests.some((candidate) => resourceBindingKey(candidate) === resourceBindingKey(binding)),
    `${label} references a resource identity absent from ${releaseSet.releaseSetId}.`
  );
}

function assertDeploymentTarget(identity, label) {
  if (identity.exportTarget === 'single') {
    assert(identity.resourceBinding === null, `${label} single/embedded target must not have a resource binding.`);
    return;
  }
  if (['cdn', 'staging-cdn'].includes(identity.exportTarget)) {
    assert(identity.resourceBinding !== null, `${label} ${identity.exportTarget} target requires an exact resource binding.`);
    return;
  }
  throw new Error(`${label} uses unsupported deployment target ${identity.exportTarget}.`);
}

function assertDeploymentIdentity(releaseSet, identity, label) {
  assertDeploymentTarget(identity, label);
  const deployment = releaseSet.deployments.find((candidate) => candidate.deploymentId === identity.deploymentId);
  assert(deployment, `${label} references deployment ${identity.deploymentId} absent from ${releaseSet.releaseSetId}.`);
  assert(
    deploymentIdentityKey(deployment) === deploymentIdentityKey(identity),
    `${label} does not match its exact deployment identity.`
  );

  const packageArtifact = findArtifact(releaseSet, identity.packageArtifactId);
  assert(packageArtifact, `${label} references a package artifact absent from ${releaseSet.releaseSetId}.`);
  assert(
    packageArtifact.artifactKind === 'package',
    `${label} package proof cannot be satisfied by ${packageArtifact.artifactKind}.`
  );
  assert(
    packageArtifact.applicationId === identity.applicationId &&
      packageArtifact.exportTarget === identity.exportTarget &&
      packageArtifact.sha256 === identity.packageSha256,
    `${label} package identity does not match its release-set artifact.`
  );
  if (identity.resourceBinding !== null) {
    assertResourceBinding(releaseSet, identity.resourceBinding, label);
  }
}

function assertSubjectBinding(event, releaseSet, releaseSets, row) {
  const subject = event.proofSubject;
  const expectedKind = SUBJECT_KIND_BY_EVENT.get(event.proofEvent);
  assert(subject.kind === expectedKind, `Evidence ledger row ${row} requires a ${expectedKind} proof subject.`);

  if (subject.kind === 'source') {
    assert(
      sourceRevisionKey(subject.sourceRevision) === sourceRevisionKey(event.sourceRevision),
      `Evidence ledger row ${row} source subject does not match sourceRevision.`
    );
  } else if (subject.kind === 'artifact') {
    assert(
      event.proofEvent !== 'artifact-closure' || subject.artifactKind !== 'report',
      `Evidence ledger row ${row} artifact closure cannot use a report subject.`
    );
    const artifact = findArtifact(releaseSet, subject.artifactId);
    assert(artifact, `Evidence ledger row ${row} references an artifact absent from ${event.releaseSetId}.`);
    assert(
      artifact.applicationId === subject.applicationId &&
        artifact.artifactKind === subject.artifactKind &&
        artifact.exportTarget === subject.exportTarget &&
        artifact.sha256 === subject.sha256,
      `Evidence ledger row ${row} artifact subject does not match its exact release-set artifact.`
    );
    assert(
      subject.exportTarget === event.exportTarget,
      `Evidence ledger row ${row} artifact target does not match exportTarget.`
    );
  } else if (subject.kind === 'resource') {
    assert(
      ['cdn', 'staging-cdn'].includes(subject.exportTarget),
      `Evidence ledger row ${row} remote resource proof requires a cdn or staging-cdn target.`
    );
    assertResourceBinding(releaseSet, subject, `Evidence ledger row ${row}`);
    const packageArtifact = findArtifact(releaseSet, subject.packageArtifactId);
    assert(packageArtifact, `Evidence ledger row ${row} resource subject package is absent.`);
    assert(packageArtifact.artifactKind === 'package', `Evidence ledger row ${row} package proof cannot be satisfied by report.`);
    assert(
      packageArtifact.applicationId === subject.applicationId &&
        packageArtifact.exportTarget === subject.exportTarget &&
        packageArtifact.sha256 === subject.packageSha256,
      `Evidence ledger row ${row} resource subject package identity does not match.`
    );
    assert(
      subject.exportTarget === event.exportTarget,
      `Evidence ledger row ${row} resource target does not match exportTarget.`
    );
  } else if (subject.kind === 'deployment') {
    assertDeploymentIdentity(releaseSet, subject, `Evidence ledger row ${row}`);
    assert(
      subject.exportTarget === event.exportTarget,
      `Evidence ledger row ${row} deployment target does not match exportTarget.`
    );
  } else {
    assert(
      subject.candidate.releaseSetId === event.releaseSetId,
      `Evidence ledger row ${row} rollback candidate must be the row's release set.`
    );
    assert(
      subject.prior.releaseSetId !== subject.candidate.releaseSetId,
      `Evidence ledger row ${row} rollback prior release must be distinct.`
    );
    assert(
      subject.candidate.applicationId === subject.prior.applicationId,
      `Evidence ledger row ${row} rollback applications do not match.`
    );
    assert(
      subject.candidate.exportTarget === event.exportTarget,
      `Evidence ledger row ${row} rollback target does not match exportTarget.`
    );
    assert(
      subject.prior.exportTarget === subject.candidate.exportTarget,
      `Evidence ledger row ${row} rollback candidate and prior targets must match.`
    );
    for (const [role, identity] of [
      ['candidate', subject.candidate],
      ['prior', subject.prior]
    ]) {
      const record = releaseSets.get(identity.releaseSetId);
      assert(record, `Evidence ledger row ${row} rollback ${role} release set is absent.`);
      assertDeploymentIdentity(record.manifest, identity, `Evidence ledger row ${row} rollback ${role}`);
    }
  }
}

function assertPassInvariants(event, row) {
  if (event.result !== 'pass') {
    return;
  }

  if (event.proofEvent === 'local-validation') {
    assert(
      ['local', 'ci'].includes(event.environment.class),
      `Evidence ledger row ${row} local validation requires local or CI.`
    );
  } else if (event.proofEvent === 'exact-head-ci') {
    assert(event.environment.class === 'ci', `Evidence ledger row ${row} exact-head CI requires a CI environment.`);
  } else if (event.proofEvent === 'local-mock-smoke') {
    assert(event.environment.class === 'local', `Evidence ledger row ${row} local mock smoke requires a local environment.`);
  } else if (event.proofEvent === 'artifact-closure') {
    assert(
      ['local', 'ci'].includes(event.environment.class),
      `Evidence ledger row ${row} artifact closure requires local or CI.`
    );
  }

  if (OPERATIONAL_EVENTS.has(event.proofEvent)) {
    assert(
      ['non-production', 'production'].includes(event.environment.class),
      `Evidence ledger row ${row} operational pass requires a non-production or production environment.`
    );
    assert(event.authorizationEvidenceId, `Evidence ledger row ${row} operational pass requires authorizationEvidenceId.`);
    assert(event.operatorEvidenceId, `Evidence ledger row ${row} operational pass requires operatorEvidenceId.`);
    assert(
      event.authorizationEvidenceId !== event.operatorEvidenceId,
      `Evidence ledger row ${row} authorization and operator evidence IDs must be distinct.`
    );
  }

  if (event.proofEvent === 'rollback-drill') {
    assert(
      event.environment.class === 'non-production',
      `Evidence ledger row ${row} rollback drill pass is non-production only.`
    );
  }
}

export function validateLedgerSemantics(events, releaseSets, trustedSchemaSha256) {
  const byEvidenceId = new Map();
  const currentByEventKey = new Map();
  const supersededIds = new Set();

  events.forEach((event, index) => {
    const row = index + 1;
    assert(!byEvidenceId.has(event.evidenceId), `Evidence ledger row ${row} repeats evidenceId ${event.evidenceId}.`);
    const releaseSetRecord = releaseSets.get(event.releaseSetId);
    assert(releaseSetRecord, `Evidence ledger row ${row} references missing release-set manifest ${event.releaseSetId}.`);
    const releaseSet = releaseSetRecord.manifest;
    assert(
      releaseSet.exportTargets.includes(event.exportTarget),
      `Evidence ledger row ${row} uses export target ${event.exportTarget}, which is absent from ${event.releaseSetId}.`
    );
    assert(
      releaseSet.sourceRevisions.some((revision) => sourceRevisionKey(revision) === sourceRevisionKey(event.sourceRevision)),
      `Evidence ledger row ${row} uses a source revision that is absent from ${event.releaseSetId}.`
    );
    assert(
      releaseSet.sourceRevisions.some(
        (revision) =>
          revision.kind === 'public-git' &&
          revision.repository === event.validator.repository &&
          revision.commitSha === event.validator.commitSha
      ),
      `Evidence ledger row ${row} validator identity is absent from ${event.releaseSetId}.`
    );
    assert(
      event.validator.schemaSha256 === trustedSchemaSha256,
      `Evidence ledger row ${row} validator schema digest does not match trusted schema v1.`
    );

    if (event.prExactHead?.kind === 'public-git') {
      assert(
        releaseSet.sourceRevisions.some(
          (revision) =>
            revision.kind === 'public-git' &&
            revision.repository === event.prExactHead.repository &&
            revision.commitSha === event.prExactHead.commitSha
        ),
        `Evidence ledger row ${row} public PR exact head is absent from ${event.releaseSetId}.`
      );
      assert(
        event.sourceRevision.kind === 'public-git' &&
          event.sourceRevision.repository === event.prExactHead.repository &&
          event.sourceRevision.commitSha === event.prExactHead.commitSha,
        `Evidence ledger row ${row} public PR exact head does not match sourceRevision.`
      );
    }
    if (event.proofEvent === 'exact-head-ci') {
      assert(event.prExactHead, `Evidence ledger row ${row} exact-head CI requires prExactHead.`);
    }

    assertSubjectBinding(event, releaseSet, releaseSets, row);
    assert(
      event.proofSubject.subjectId === createProofSubjectId(event.proofSubject),
      `Evidence ledger row ${row} proof subject ID is not the deterministic canonical ID.`
    );
    assertPassInvariants(event, row);

    const expectedEventKey = createEventKey(event);
    assert(
      event.eventKey === expectedEventKey,
      `Evidence ledger row ${row} has eventKey ${event.eventKey}; expected ${expectedEventKey}.`
    );
    const recordedDate = new Date(event.recordedUtc);
    assert(
      !Number.isNaN(recordedDate.valueOf()) && recordedDate.toISOString() === event.recordedUtc.replace('Z', '.000Z'),
      `Evidence ledger row ${row} has an invalid recordedUtc value.`
    );

    const currentEvidenceId = currentByEventKey.get(event.eventKey);
    if (currentEvidenceId === undefined) {
      assert(
        event.supersedesEvidenceId === undefined,
        `Evidence ledger row ${row} supersedes an event that is not the current row for ${event.eventKey}.`
      );
    } else {
      assert(
        event.supersedesEvidenceId === currentEvidenceId,
        `Evidence ledger row ${row} must supersede current evidence ${currentEvidenceId}.`
      );
    }

    if (event.supersedesEvidenceId !== undefined) {
      const prior = byEvidenceId.get(event.supersedesEvidenceId);
      assert(prior !== undefined, `Evidence ledger row ${row} supersedes a missing or later evidence row.`);
      assert(prior.eventKey === event.eventKey, `Evidence ledger row ${row} cannot supersede a different event key.`);
      assert(
        event.recordedUtc > prior.recordedUtc,
        `Evidence ledger row ${row} must be recorded after the evidence it supersedes.`
      );
      assert(
        !supersededIds.has(event.supersedesEvidenceId),
        `Evidence ledger row ${row} supersedes evidence that already has a correction.`
      );
      supersededIds.add(event.supersedesEvidenceId);
    }

    byEvidenceId.set(event.evidenceId, event);
    currentByEventKey.set(event.eventKey, event.evidenceId);
  });
}

async function listLocalReleaseSetEntries(rootDirectory) {
  const absoluteDirectory = path.join(rootDirectory, RELEASE_SET_DIRECTORY);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const unsupported = entries.filter((entry) => !entry.isFile() || !entry.name.endsWith('.json'));
  assert(
    unsupported.length === 0,
    `Release-set directory contains unsupported entries: ${unsupported.map((entry) => entry.name).join(', ')}.`
  );
  assert(entries.length <= MAX_RELEASE_SET_COUNT, 'Release-set directory exceeds the manifest count limit.');
  return Promise.all(
    entries
      .map((entry) => path.join(RELEASE_SET_DIRECTORY, entry.name))
      .sort()
      .map(async (relativePath) => ({
        relativePath,
        contents: await readFile(path.join(rootDirectory, relativePath), 'utf8')
      }))
  );
}

async function resolveGitCommit(rootDirectory, ref) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: rootDirectory,
      encoding: 'utf8'
    });
    return stdout.trim();
  } catch {
    throw new Error(`Evidence ref is not a commit: ${ref}.`);
  }
}

async function readGitPath(rootDirectory, commitSha, relativePath) {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${commitSha}:${normalizeRepositoryPath(relativePath)}`], {
      cwd: rootDirectory,
      encoding: 'utf8',
      maxBuffer: MAX_EVIDENCE_BYTES + 1
    });
    assertBlobSize(stdout, normalizeRepositoryPath(relativePath));
    return stdout;
  } catch (error) {
    if (error.code === 128) {
      return undefined;
    }
    throw error;
  }
}

async function listGitReleaseSetEntries(rootDirectory, commitSha) {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-tree', '-r', '-z', '--name-only', commitSha, '--', normalizeRepositoryPath(RELEASE_SET_DIRECTORY)],
    { cwd: rootDirectory, encoding: 'utf8', maxBuffer: MAX_EVIDENCE_BYTES + 1 }
  );
  const paths = stdout.split('\0').filter(Boolean).sort();
  assert(paths.length <= MAX_RELEASE_SET_COUNT, 'Release-set directory exceeds the manifest count limit.');
  const unsupported = paths.filter(
    (relativePath) =>
      path.posix.dirname(relativePath) !== normalizeRepositoryPath(RELEASE_SET_DIRECTORY) || !relativePath.endsWith('.json')
  );
  assert(unsupported.length === 0, `Release-set directory contains unsupported entries: ${unsupported.join(', ')}.`);
  return Promise.all(
    paths.map(async (relativePath) => ({
      relativePath,
      contents: await readGitPath(rootDirectory, commitSha, relativePath)
    }))
  );
}

function loadReleaseSets(entries, validateReleaseSetManifest) {
  const manifests = new Map();
  for (const { relativePath, contents } of entries) {
    assert(contents !== undefined, `${relativePath} could not be read.`);
    assertBlobSize(contents, relativePath);
    let manifest;
    try {
      manifest = JSON.parse(contents);
    } catch (error) {
      throw new Error(`${relativePath} is not valid JSON: ${error.message}`, { cause: error });
    }
    if (!validateReleaseSetManifest(manifest)) {
      throw new Error(`${relativePath} does not match schema v1: ${formatAjvErrors(validateReleaseSetManifest.errors)}`);
    }
    const expectedName = `${manifest.releaseSetId}.json`;
    assert(path.basename(relativePath) === expectedName, `${relativePath} must be named ${expectedName}.`);

    for (const [field, key] of [
      ['uiProfiles', 'profileId'],
      ['artifacts', 'artifactId'],
      ['deployments', 'deploymentId']
    ]) {
      const values = manifest[field].map((item) => item[key]);
      assert(new Set(values).size === values.length, `${relativePath} repeats ${key}.`);
    }
    const resourceKeys = manifest.resourceManifests.map(resourceBindingKey);
    assert(new Set(resourceKeys).size === resourceKeys.length, `${relativePath} repeats a resource identity.`);
    const sourceKeys = manifest.sourceRevisions.map(sourceRevisionKey);
    assert(new Set(sourceKeys).size === sourceKeys.length, `${relativePath} repeats a source revision.`);
    for (const artifact of manifest.artifacts) {
      assert(
        manifest.exportTargets.includes(artifact.exportTarget),
        `${relativePath} artifact target is absent from exportTargets.`
      );
    }
    for (const deployment of manifest.deployments) {
      assert(
        manifest.exportTargets.includes(deployment.exportTarget),
        `${relativePath} deployment target is absent from exportTargets.`
      );
      assertDeploymentIdentity(manifest, deployment, relativePath);
    }
    assert(!manifests.has(manifest.releaseSetId), `Duplicate releaseSetId ${manifest.releaseSetId}.`);
    manifests.set(manifest.releaseSetId, { relativePath, contents, manifest });
  }
  return manifests;
}

export async function verifyAppendOnlyHistory(rootDirectory, baseCommit, candidate) {
  if (!baseCommit) {
    return;
  }
  const baseLedger = await readGitPath(rootDirectory, baseCommit, LEDGER_PATH);
  if (baseLedger !== undefined) {
    assert(
      candidate.ledgerContents.startsWith(baseLedger),
      `Evidence ledger edits or deletes rows from ${baseCommit}; corrections must append a new row.`
    );
  }

  const baseSchema = await readGitPath(rootDirectory, baseCommit, SCHEMA_PATH);
  if (baseSchema !== undefined) {
    assert(candidate.schemaContents === baseSchema, `Evidence schema v1 differs from ${baseCommit}; v1 bytes are immutable.`);
  }

  const baseManifestEntries = await listGitReleaseSetEntries(rootDirectory, baseCommit);
  for (const baseManifest of baseManifestEntries) {
    const releaseSetId = path.basename(baseManifest.relativePath, '.json');
    const current = candidate.releaseSets.get(releaseSetId);
    assert(current !== undefined, `Release-set manifest ${baseManifest.relativePath} was deleted; manifests are write-once.`);
    assert(
      current.contents === baseManifest.contents,
      `Release-set manifest ${baseManifest.relativePath} was edited; manifests are write-once.`
    );
  }
}

export async function validateShadcnEvidence({ rootDirectory, baseRef, candidateRef } = {}) {
  const resolvedRoot = path.resolve(rootDirectory ?? process.cwd());
  const localSchemaContents = await readFile(path.join(resolvedRoot, SCHEMA_PATH), 'utf8');
  let baseCommit;
  let candidate;

  if (candidateRef) {
    assert(baseRef, '--candidate-ref requires --base-ref.');
    baseCommit = await resolveGitCommit(resolvedRoot, baseRef);
    const candidateCommit = await resolveGitCommit(resolvedRoot, candidateRef);
    const baseSchemaContents = await readGitPath(resolvedRoot, baseCommit, SCHEMA_PATH);
    assert(baseSchemaContents !== undefined, `Trusted base ${baseCommit} does not contain schema v1.`);
    assert(localSchemaContents === baseSchemaContents, 'Working tree schema is not the trusted base schema.');
    const candidateSchemaContents = await readGitPath(resolvedRoot, candidateCommit, SCHEMA_PATH);
    assert(candidateSchemaContents !== undefined, `Candidate ${candidateCommit} deletes schema v1.`);
    const candidateLedger = await readGitPath(resolvedRoot, candidateCommit, LEDGER_PATH);
    assert(candidateLedger !== undefined, `Candidate ${candidateCommit} deletes ledger v1.`);
    candidate = {
      schemaContents: candidateSchemaContents,
      ledgerContents: candidateLedger,
      releaseSetEntries: await listGitReleaseSetEntries(resolvedRoot, candidateCommit)
    };
  } else {
    baseCommit = baseRef ? await resolveGitCommit(resolvedRoot, baseRef) : undefined;
    candidate = {
      schemaContents: localSchemaContents,
      ledgerContents: await readFile(path.join(resolvedRoot, LEDGER_PATH), 'utf8'),
      releaseSetEntries: await listLocalReleaseSetEntries(resolvedRoot)
    };
  }

  if (baseCommit) {
    const immutableBaseSchema = await readGitPath(resolvedRoot, baseCommit, SCHEMA_PATH);
    if (immutableBaseSchema !== undefined) {
      assert(
        candidate.schemaContents === immutableBaseSchema,
        `Evidence schema v1 differs from ${baseCommit}; v1 bytes are immutable.`
      );
    }
  }

  const trustedSchemaContents = candidateRef ? await readGitPath(resolvedRoot, baseCommit, SCHEMA_PATH) : localSchemaContents;
  const schema = JSON.parse(trustedSchemaContents);
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.compile(schema);
  const validateProofEvent = ajv.getSchema(`${schema.$id}#/$defs/proofEvent`);
  const validateReleaseSetManifest = ajv.getSchema(`${schema.$id}#/$defs/releaseSetManifest`);
  assert(validateProofEvent !== undefined, 'Schema v1 does not expose $defs.proofEvent.');
  assert(validateReleaseSetManifest !== undefined, 'Schema v1 does not expose $defs.releaseSetManifest.');

  const releaseSets = loadReleaseSets(candidate.releaseSetEntries, validateReleaseSetManifest);
  const events = parseLedger(candidate.ledgerContents, validateProofEvent);
  validateLedgerSemantics(events, releaseSets, sha256(trustedSchemaContents));
  await verifyAppendOnlyHistory(resolvedRoot, baseCommit, { ...candidate, releaseSets });
  return { eventCount: events.length, releaseSetCount: releaseSets.size };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base-ref' || argument === '--candidate-ref' || argument === '--root') {
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), `${argument} requires a value.`);
      const key = argument === '--base-ref' ? 'baseRef' : argument === '--candidate-ref' ? 'candidateRef' : 'rootDirectory';
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.baseRef && process.env.EVIDENCE_BASE_REF) {
    options.baseRef = process.env.EVIDENCE_BASE_REF;
  }
  const result = await validateShadcnEvidence(options);
  process.stdout.write(
    `Validated ${result.eventCount} shadcn evidence event(s) and ${result.releaseSetCount} release-set manifest(s).\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export const evidencePaths = {
  directory: EVIDENCE_DIRECTORY,
  ledger: LEDGER_PATH,
  releaseSets: RELEASE_SET_DIRECTORY,
  schema: SCHEMA_PATH
};
