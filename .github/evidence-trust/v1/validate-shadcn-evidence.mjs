import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Ajv from 'ajv';

const execFileAsync = promisify(execFile);
const EVIDENCE_DIRECTORY = path.join('docs', 'evidence', 'shadcn-migration');
const LEDGER_PATH = path.join(EVIDENCE_DIRECTORY, 'ledger.v1.jsonl');
const SCHEMA_PATH = path.join(EVIDENCE_DIRECTORY, 'schema.v1.json');
const TRUST_BASE_PATH = path.join(EVIDENCE_DIRECTORY, 'trust-base.v1.json');
const RELEASE_SET_DIRECTORY = path.join(EVIDENCE_DIRECTORY, 'release-sets');
const WORKFLOW_DIRECTORY = path.join('.github', 'workflows');
const TRUST_RUNTIME_DIRECTORY = path.join('.github', 'evidence-trust', 'v1');
const TRUST_RUNTIME_VALIDATOR_PATH = path.join(TRUST_RUNTIME_DIRECTORY, 'validate-shadcn-evidence.mjs');
const TRUST_RUNTIME_NODE_VERSION_PATH = path.join(TRUST_RUNTIME_DIRECTORY, 'node-version');
const TRUST_RUNTIME_NPM_CONFIG_PATH = path.join(TRUST_RUNTIME_DIRECTORY, '.npmrc');
const TRUST_RUNTIME_PACKAGE_JSON_PATH = path.join(TRUST_RUNTIME_DIRECTORY, 'package.json');
const TRUST_RUNTIME_PACKAGE_LOCK_PATH = path.join(TRUST_RUNTIME_DIRECTORY, 'package-lock.json');
const TRUST_RUNTIME_STATUS_PUBLISHER_PATH = path.join(TRUST_RUNTIME_DIRECTORY, 'publish-status.mjs');
const TRUST_STATUS_CONTEXT = 'spfx-kit/evidence-history-v1';
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_RELEASE_SET_COUNT = 1_000;
const PROTECTED_TREE_PATHS = Object.freeze([WORKFLOW_DIRECTORY, TRUST_RUNTIME_DIRECTORY]);
const TRUST_RUNTIME_FILE_PATHS = Object.freeze([
  TRUST_RUNTIME_NPM_CONFIG_PATH,
  TRUST_RUNTIME_NODE_VERSION_PATH,
  TRUST_RUNTIME_PACKAGE_JSON_PATH,
  TRUST_RUNTIME_PACKAGE_LOCK_PATH,
  TRUST_RUNTIME_STATUS_PUBLISHER_PATH,
  TRUST_RUNTIME_VALIDATOR_PATH
]);
const AJV_RUNTIME_PACKAGE_PATHS = Object.freeze([
  'node_modules/ajv',
  'node_modules/fast-deep-equal',
  'node_modules/fast-uri',
  'node_modules/json-schema-traverse',
  'node_modules/require-from-string'
]);

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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseJsonDocument(contents, label) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function assertExactObjectKeys(value, expectedKeys, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} must contain exactly: ${expected.join(', ')}.`
  );
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

async function listGitTreeEntries(rootDirectory, commitSha, relativeTreePath) {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-tree', '-r', '-z', commitSha, '--', normalizeRepositoryPath(relativeTreePath)],
    { cwd: rootDirectory, encoding: 'utf8', maxBuffer: MAX_EVIDENCE_BYTES + 1 }
  );
  const records = stdout.split('\0').filter(Boolean);
  return Promise.all(
    records.map(async (record) => {
      const match = /^([0-7]{6}) ([a-z]+) ([0-9a-f]+)\t([^\n]+)$/.exec(record);
      assert(match !== null, `Protected Git tree has an unsupported entry: ${record}.`);
      const [, mode, type, , relativePath] = match;
      assert(type === 'blob', `Protected Git tree entry ${relativePath} must be a blob, not ${type}.`);
      const contents = await readGitPath(rootDirectory, commitSha, relativePath);
      assert(contents !== undefined, `Protected Git tree entry ${relativePath} could not be read.`);
      return { mode, type, relativePath, contents };
    })
  );
}

async function listLocalTreeEntries(rootDirectory, relativeTreePath) {
  const entries = [];
  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(rootDirectory, relativeDirectory);
    let children;
    try {
      children = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(relativeDirectory, child.name);
      if (relativeDirectory === TRUST_RUNTIME_DIRECTORY && child.name === 'node_modules' && child.isDirectory()) {
        continue;
      }
      if (child.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      const absolutePath = path.join(rootDirectory, relativePath);
      const stats = await lstat(absolutePath);
      let mode;
      let contents;
      if (stats.isSymbolicLink()) {
        mode = '120000';
        contents = await readlink(absolutePath);
      } else {
        assert(stats.isFile(), `Protected local tree entry ${relativePath} must be a file.`);
        mode = stats.mode & 0o111 ? '100755' : '100644';
        contents = await readFile(absolutePath, 'utf8');
      }
      assertBlobSize(contents, relativePath);
      entries.push({ mode, type: 'blob', relativePath, contents });
    }
  }
  await visit(relativeTreePath);
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function readLocalFileEntry(rootDirectory, relativePath) {
  const absolutePath = path.join(rootDirectory, relativePath);
  try {
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      return { mode: '120000', type: 'blob', relativePath, contents: await readlink(absolutePath) };
    }
    assert(stats.isFile(), `${relativePath} must be a file.`);
    return {
      mode: stats.mode & 0o111 ? '100755' : '100644',
      type: 'blob',
      relativePath,
      contents: await readFile(absolutePath, 'utf8')
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function protectedTreeFingerprint(entries) {
  return sha256(
    canonicalJson(
      entries.map(({ mode, type, relativePath, contents }) => ({
        mode,
        type,
        path: normalizeRepositoryPath(relativePath),
        sha256: sha256(contents)
      }))
    )
  );
}

async function readTrustState(rootDirectory, commitSha) {
  const manifestEntries = commitSha
    ? await listGitTreeEntries(rootDirectory, commitSha, TRUST_BASE_PATH)
    : [await readLocalFileEntry(rootDirectory, TRUST_BASE_PATH)].filter(Boolean);
  if (manifestEntries.length === 0) {
    return undefined;
  }
  assert(manifestEntries.length === 1, `${TRUST_BASE_PATH} must resolve to exactly one file.`);

  const trees = {};
  for (const relativeTreePath of PROTECTED_TREE_PATHS) {
    trees[relativeTreePath] = commitSha
      ? await listGitTreeEntries(rootDirectory, commitSha, relativeTreePath)
      : await listLocalTreeEntries(rootDirectory, relativeTreePath);
  }
  const schemaEntries = commitSha
    ? await listGitTreeEntries(rootDirectory, commitSha, SCHEMA_PATH)
    : [await readLocalFileEntry(rootDirectory, SCHEMA_PATH)].filter(Boolean);
  assert(schemaEntries.length === 1, `${TRUST_BASE_PATH} requires exactly one ${SCHEMA_PATH} file.`);
  return { manifestEntry: manifestEntries[0], trees, schemaEntry: schemaEntries[0] };
}

function parseTrustManifest(contents) {
  const manifest = parseJsonDocument(contents, TRUST_BASE_PATH);
  assertExactObjectKeys(
    manifest,
    ['schemaVersion', 'kind', 'statusContext', 'protectedTrees', 'schema', 'runtime'],
    TRUST_BASE_PATH
  );
  assert(manifest.schemaVersion === 1, `${TRUST_BASE_PATH} must use schemaVersion 1.`);
  assert(manifest.kind === 'shadcn-evidence-trust-base', `${TRUST_BASE_PATH} has an unsupported kind.`);
  assert(manifest.statusContext === TRUST_STATUS_CONTEXT, `${TRUST_BASE_PATH} has an unexpected status context.`);
  assertExactObjectKeys(manifest.protectedTrees, PROTECTED_TREE_PATHS, `${TRUST_BASE_PATH} protectedTrees`);
  for (const relativeTreePath of PROTECTED_TREE_PATHS) {
    const record = manifest.protectedTrees[relativeTreePath];
    assertExactObjectKeys(record, ['entryCount', 'sha256'], `${TRUST_BASE_PATH} ${relativeTreePath}`);
    assert(Number.isSafeInteger(record.entryCount) && record.entryCount > 0, `${relativeTreePath} entryCount is invalid.`);
    assert(/^[a-f0-9]{64}$/.test(record.sha256), `${relativeTreePath} SHA-256 is invalid.`);
  }
  assertExactObjectKeys(manifest.schema, ['mode', 'sha256'], `${TRUST_BASE_PATH} schema`);
  assert(manifest.schema.mode === '100644', `${SCHEMA_PATH} must use mode 100644.`);
  assert(/^[a-f0-9]{64}$/.test(manifest.schema.sha256), `${SCHEMA_PATH} SHA-256 is invalid.`);
  assertExactObjectKeys(manifest.runtime, ['nodeVersion', 'npmVersion', 'packages'], `${TRUST_BASE_PATH} runtime`);
  assertExactObjectKeys(manifest.runtime.packages, AJV_RUNTIME_PACKAGE_PATHS, `${TRUST_BASE_PATH} runtime packages`);
  assert(/^\d+\.\d+\.\d+$/.test(manifest.runtime.nodeVersion), `${TRUST_BASE_PATH} Node version must be exact.`);
  assert(/^\d+\.\d+\.\d+$/.test(manifest.runtime.npmVersion), `${TRUST_BASE_PATH} npm version must be exact.`);
  for (const [packagePath, version] of Object.entries(manifest.runtime.packages)) {
    assert(/^\d+\.\d+\.\d+$/.test(version), `${TRUST_BASE_PATH} package ${packagePath} must use an exact version.`);
  }
  return manifest;
}

function runtimeTreeFileMap(entries) {
  return new Map(entries.map((entry) => [normalizeRepositoryPath(entry.relativePath), entry]));
}

function verifyTrustRuntimeTree(entries, manifest, label) {
  const actualPaths = entries.map((entry) => normalizeRepositoryPath(entry.relativePath)).sort();
  const expectedPaths = TRUST_RUNTIME_FILE_PATHS.map(normalizeRepositoryPath).sort();
  assert(
    actualPaths.length === expectedPaths.length && actualPaths.every((entry, index) => entry === expectedPaths[index]),
    `${label} trusted runtime tree must contain exactly: ${expectedPaths.join(', ')}.`
  );
  assert(
    entries.every((entry) => entry.mode === '100644'),
    `${label} trusted runtime files must use mode 100644.`
  );
  const files = runtimeTreeFileMap(entries);
  const contents = (relativePath) => files.get(normalizeRepositoryPath(relativePath)).contents;
  assert(
    contents(TRUST_RUNTIME_NODE_VERSION_PATH) === `${manifest.runtime.nodeVersion}\n`,
    `${label} trusted Node version file does not match ${TRUST_BASE_PATH}.`
  );
  assert(
    contents(TRUST_RUNTIME_NPM_CONFIG_PATH) ===
      'registry=https://registry.npmjs.org/\nengine-strict=true\nignore-scripts=true\naudit=false\nfund=false\n',
    `${label} trusted npm configuration is not the reviewed v1 configuration.`
  );

  const packageJson = parseJsonDocument(contents(TRUST_RUNTIME_PACKAGE_JSON_PATH), TRUST_RUNTIME_PACKAGE_JSON_PATH);
  assertExactObjectKeys(
    packageJson,
    ['name', 'version', 'private', 'type', 'packageManager', 'engines', 'dependencies'],
    TRUST_RUNTIME_PACKAGE_JSON_PATH
  );
  assert(
    packageJson.private === true && packageJson.type === 'module',
    `${TRUST_RUNTIME_PACKAGE_JSON_PATH} must be private ESM.`
  );
  assert(packageJson.packageManager === `npm@${manifest.runtime.npmVersion}`, 'Trusted packageManager pin is invalid.');
  assertExactObjectKeys(packageJson.engines, ['node', 'npm'], `${TRUST_RUNTIME_PACKAGE_JSON_PATH} engines`);
  assert(packageJson.engines.node === manifest.runtime.nodeVersion, 'Trusted Node engine pin is invalid.');
  assert(packageJson.engines.npm === manifest.runtime.npmVersion, 'Trusted npm engine pin is invalid.');
  assertExactObjectKeys(packageJson.dependencies, ['ajv'], `${TRUST_RUNTIME_PACKAGE_JSON_PATH} dependencies`);
  assert(packageJson.dependencies.ajv === manifest.runtime.packages['node_modules/ajv'], 'Trusted Ajv pin is invalid.');

  const packageLock = parseJsonDocument(contents(TRUST_RUNTIME_PACKAGE_LOCK_PATH), TRUST_RUNTIME_PACKAGE_LOCK_PATH);
  assert(packageLock.lockfileVersion === 3 && packageLock.requires === true, 'Trusted package lock format is invalid.');
  const expectedLockPaths = ['', ...AJV_RUNTIME_PACKAGE_PATHS].sort();
  const actualLockPaths = Object.keys(packageLock.packages ?? {}).sort();
  assert(
    actualLockPaths.length === expectedLockPaths.length &&
      actualLockPaths.every((packagePath, index) => packagePath === expectedLockPaths[index]),
    'Trusted package lock must contain only the reviewed Ajv runtime closure.'
  );
  const lockRoot = packageLock.packages[''];
  assertExactObjectKeys(lockRoot.dependencies, ['ajv'], 'Trusted package-lock root dependencies');
  assert(lockRoot.dependencies.ajv === manifest.runtime.packages['node_modules/ajv'], 'Trusted lock Ajv pin is invalid.');
  assert(lockRoot.engines.node === manifest.runtime.nodeVersion, 'Trusted lock Node engine pin is invalid.');
  assert(lockRoot.engines.npm === manifest.runtime.npmVersion, 'Trusted lock npm engine pin is invalid.');
  for (const packagePath of AJV_RUNTIME_PACKAGE_PATHS) {
    const packageRecord = packageLock.packages[packagePath];
    assert(packageRecord.link !== true, `Trusted runtime package ${packagePath} must not be a link.`);
    assert(
      packageRecord.version === manifest.runtime.packages[packagePath],
      `Trusted runtime package ${packagePath} version does not match ${TRUST_BASE_PATH}.`
    );
    assert(
      /^https:\/\/registry\.npmjs\.org\//.test(packageRecord.resolved ?? ''),
      `Trusted runtime package ${packagePath} must use the reviewed HTTPS registry.`
    );
    assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packageRecord.integrity ?? ''), `${packagePath} lacks SHA-512 integrity.`);
  }
}

function verifyTrustState(state, label) {
  const manifest = parseTrustManifest(state.manifestEntry.contents);
  assert(state.manifestEntry.mode === '100644', `${label} ${TRUST_BASE_PATH} must use mode 100644.`);
  for (const relativeTreePath of PROTECTED_TREE_PATHS) {
    const entries = state.trees[relativeTreePath];
    assert(
      entries.length === manifest.protectedTrees[relativeTreePath].entryCount,
      `${label} protected tree ${relativeTreePath} entry count differs.`
    );
    assert(
      protectedTreeFingerprint(entries) === manifest.protectedTrees[relativeTreePath].sha256,
      `${label} protected tree ${relativeTreePath} does not match ${TRUST_BASE_PATH}.`
    );
  }
  assert(state.schemaEntry.mode === manifest.schema.mode, `${label} ${SCHEMA_PATH} mode differs from ${TRUST_BASE_PATH}.`);
  assert(
    sha256(state.schemaEntry.contents) === manifest.schema.sha256,
    `${label} ${SCHEMA_PATH} differs from ${TRUST_BASE_PATH}.`
  );
  verifyTrustRuntimeTree(state.trees[TRUST_RUNTIME_DIRECTORY], manifest, label);
  return manifest;
}

async function verifyInstalledTrustRuntime(rootDirectory, manifest) {
  if (process.env.EVIDENCE_REQUIRE_ISOLATED_RUNTIME !== '1') {
    return;
  }
  assert(
    process.version === `v${manifest.runtime.nodeVersion}`,
    `Trusted validator requires Node ${manifest.runtime.nodeVersion}.`
  );
  assert(
    process.env.EVIDENCE_TRUST_NPM_VERSION === manifest.runtime.npmVersion,
    `Trusted validator requires npm ${manifest.runtime.npmVersion}.`
  );
  for (const packagePath of AJV_RUNTIME_PACKAGE_PATHS) {
    const packageManifestPath = path.join(rootDirectory, TRUST_RUNTIME_DIRECTORY, packagePath, 'package.json');
    let packageManifestContents;
    try {
      packageManifestContents = await readFile(packageManifestPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Installed trusted runtime package is missing: ${packagePath}.`, { cause: error });
      }
      throw error;
    }
    const packageManifest = parseJsonDocument(packageManifestContents, `${packagePath}/package.json`);
    assert(
      packageManifest.version === manifest.runtime.packages[packagePath],
      `Installed trusted runtime package ${packagePath} has version ${packageManifest.version}; expected ${manifest.runtime.packages[packagePath]}.`
    );
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

  const baseTrustState = await readTrustState(rootDirectory, baseCommit);
  if (baseTrustState !== undefined) {
    assert(candidate.trustState !== undefined, `Candidate deletes immutable ${TRUST_BASE_PATH}.`);
    assert(
      canonicalJson(candidate.trustState.manifestEntry) === canonicalJson(baseTrustState.manifestEntry),
      `${TRUST_BASE_PATH} differs from ${baseCommit}; v1 trust-base bytes are immutable.`
    );
    for (const relativeTreePath of PROTECTED_TREE_PATHS) {
      assert(
        canonicalJson(candidate.trustState.trees[relativeTreePath]) === canonicalJson(baseTrustState.trees[relativeTreePath]),
        `${relativeTreePath} differs from ${baseCommit}; v1 protected tree is immutable.`
      );
    }
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
  const localTrustState = await readTrustState(resolvedRoot);
  let baseCommit;
  let baseTrustState;
  let candidate;

  if (candidateRef) {
    assert(baseRef, '--candidate-ref requires --base-ref.');
    baseCommit = await resolveGitCommit(resolvedRoot, baseRef);
    baseTrustState = await readTrustState(resolvedRoot, baseCommit);
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
      releaseSetEntries: await listGitReleaseSetEntries(resolvedRoot, candidateCommit),
      trustState: await readTrustState(resolvedRoot, candidateCommit)
    };
  } else {
    baseCommit = baseRef ? await resolveGitCommit(resolvedRoot, baseRef) : undefined;
    baseTrustState = baseCommit ? await readTrustState(resolvedRoot, baseCommit) : undefined;
    candidate = {
      schemaContents: localSchemaContents,
      ledgerContents: await readFile(path.join(resolvedRoot, LEDGER_PATH), 'utf8'),
      releaseSetEntries: await listLocalReleaseSetEntries(resolvedRoot),
      trustState: localTrustState
    };
  }

  const trustedTrustState = baseTrustState ?? localTrustState;
  if (trustedTrustState !== undefined) {
    const trustedManifest = verifyTrustState(trustedTrustState, baseTrustState ? `Trusted base ${baseCommit}` : 'Working tree');
    assert(candidate.trustState !== undefined, `Candidate deletes immutable ${TRUST_BASE_PATH}.`);
    verifyTrustState(candidate.trustState, candidateRef ? `Candidate ${candidateRef}` : 'Working tree');

    if (baseTrustState !== undefined && candidateRef) {
      assert(localTrustState !== undefined, `Checked-out trusted base is missing ${TRUST_BASE_PATH}.`);
      assert(
        canonicalJson(localTrustState.manifestEntry) === canonicalJson(baseTrustState.manifestEntry),
        `Checked-out ${TRUST_BASE_PATH} does not match trusted base ${baseCommit}.`
      );
      for (const relativeTreePath of PROTECTED_TREE_PATHS) {
        assert(
          canonicalJson(localTrustState.trees[relativeTreePath]) === canonicalJson(baseTrustState.trees[relativeTreePath]),
          `Checked-out ${relativeTreePath} does not match trusted base ${baseCommit}.`
        );
      }
      verifyTrustState(localTrustState, `Checked-out trusted base ${baseCommit}`);
    }
    await verifyInstalledTrustRuntime(resolvedRoot, trustedManifest);
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

export async function runEvidenceCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
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
  runEvidenceCli().catch((error) => {
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
