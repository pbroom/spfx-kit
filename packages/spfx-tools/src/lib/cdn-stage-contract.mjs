import {
  assertPortableAssetPath,
  normalizeCdnReleaseId,
  normalizeExactCdnBasePath,
  safeLocalPath
} from './cdn-stage-paths.mjs';

export function parseCdnStageManifestV1(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported or missing CDN stage manifest schemaVersion');
  }
  assertExactKeys('deployment manifest', value, [
    'schemaVersion',
    'generatedAt',
    'slug',
    'releaseLabel',
    'releaseId',
    'cdnBasePath',
    'immutablePrefix',
    'uploadRoot',
    'package',
    'manifests',
    'files',
    'proof'
  ]);

  const generatedAt = requireString(value.generatedAt, 'deployment manifest generatedAt');
  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime()) || generatedDate.toISOString() !== generatedAt) {
    throw new Error('CDN stage deployment manifest generatedAt must be an ISO-8601 UTC timestamp');
  }
  const slug = requireString(value.slug, 'deployment manifest slug');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) {
    throw new Error('CDN stage deployment manifest slug must be normalized');
  }
  const releaseLabel = requireString(value.releaseLabel, 'deployment manifest releaseLabel');
  if (!isImmutableReleaseId(releaseLabel)) {
    throw new Error('CDN stage deployment manifest releaseLabel must be normalized and immutable');
  }
  const releaseId = requireString(value.releaseId, 'deployment manifest releaseId');
  if (!isImmutableReleaseId(releaseId)) {
    throw new Error('CDN stage deployment manifest releaseId must be normalized and immutable');
  }
  const cdnBasePath = requireString(value.cdnBasePath, 'deployment manifest cdnBasePath');
  if (normalizeExactCdnBasePath(cdnBasePath) !== cdnBasePath) {
    throw new Error('CDN stage deployment manifest cdnBasePath must be normalized');
  }
  const expectedSuffix = `/${encodeURIComponent(slug)}/versions/${encodeURIComponent(releaseId)}/`;
  if (!new URL(cdnBasePath).pathname.endsWith(expectedSuffix)) {
    throw new Error('CDN stage deployment manifest base path must match its slug and releaseId');
  }
  requireExactValue(value.immutablePrefix, true, 'deployment manifest immutablePrefix');
  const uploadRoot = requireStagePath(value.uploadRoot, 'deployment manifest uploadRoot');
  requireExactValue(uploadRoot, 'upload', 'deployment manifest uploadRoot');

  const packageDescriptor = requireRecord(value.package, 'deployment manifest package');
  assertExactKeys('deployment manifest package', packageDescriptor, ['path', 'bytes', 'sha256']);
  const packageValue = {
    path: requireStagePath(packageDescriptor.path, 'deployment manifest package path'),
    bytes: requirePositiveInteger(packageDescriptor.bytes, 'deployment manifest package bytes'),
    sha256: requireSha256(packageDescriptor.sha256, 'deployment manifest package sha256')
  };
  requireExactValue(
    packageValue.path,
    `sharepoint/solution/${slug}.staging.cdn.sppkg`,
    'deployment manifest package path'
  );

  const manifests = requireRecord(value.manifests, 'deployment manifest manifests');
  assertExactKeys('deployment manifest manifests', manifests, [
    'root',
    'packageComponents',
    'generatedComponents',
    'referencedFiles'
  ]);
  const manifestValue = {
    root:
      manifests.root === null
        ? null
        : requireStagePath(manifests.root, 'deployment manifest manifests root'),
    packageComponents: requireStringArray(
      manifests.packageComponents,
      'deployment manifest packageComponents'
    ),
    generatedComponents: requireStringArray(
      manifests.generatedComponents,
      'deployment manifest generatedComponents',
      { allowEmpty: true }
    ),
    referencedFiles: requireNonNegativeInteger(
      manifests.referencedFiles,
      'deployment manifest referencedFiles'
    )
  };
  if (manifestValue.root !== null) {
    requireExactValue(manifestValue.root, 'manifests', 'deployment manifest manifests root');
  }

  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('CDN stage deployment manifest files must be a non-empty array');
  }
  const files = value.files.map((file, index) => parseFileDescriptor(file, index));

  const proof = requireRecord(value.proof, 'deployment manifest proof');
  assertExactKeys('deployment manifest proof', proof, [
    'localArtifact',
    'remoteCdn',
    'sharePointAppCatalog'
  ]);
  const proofValue = {
    localArtifact: requireExactValue(
      proof.localArtifact,
      'passed',
      'deployment manifest proof localArtifact'
    ),
    remoteCdn: requireExactValue(proof.remoteCdn, 'not-run', 'deployment manifest proof remoteCdn'),
    sharePointAppCatalog: requireExactValue(
      proof.sharePointAppCatalog,
      'not-run',
      'deployment manifest proof sharePointAppCatalog'
    )
  };

  return {
    schemaVersion: 1,
    generatedAt,
    slug,
    releaseLabel,
    releaseId,
    cdnBasePath,
    immutablePrefix: true,
    uploadRoot,
    package: packageValue,
    manifests: manifestValue,
    files,
    proof: proofValue
  };
}

function isImmutableReleaseId(value) {
  try {
    return normalizeCdnReleaseId(value) === value;
  } catch {
    return false;
  }
}

export function deterministicManifestCore(manifest) {
  const core = { ...manifest };
  delete core.generatedAt;
  return core;
}

function parseFileDescriptor(file, index) {
  const descriptor = requireRecord(file, `deployment manifest file ${index}`);
  assertExactKeys(`deployment manifest file ${index}`, descriptor, [
    'path',
    'url',
    'bytes',
    'sha256',
    'referencedBy'
  ]);
  const filePath = requireString(descriptor.path, `deployment manifest file ${index} path`);
  assertPortableAssetPath(filePath, `Deployment manifest file ${index} path`);
  return {
    path: filePath,
    url: requireString(descriptor.url, `deployment manifest file ${index} url`),
    bytes: requirePositiveInteger(descriptor.bytes, `deployment manifest file ${index} bytes`),
    sha256: requireSha256(descriptor.sha256, `deployment manifest file ${index} sha256`),
    referencedBy: requireStringArray(
      descriptor.referencedBy,
      `deployment manifest file ${index} referencedBy`,
      { allowEmpty: true }
    )
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new Error(`CDN stage ${label} must be an object`);
  }
  return value;
}

function assertExactKeys(label, value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(normalizedExpectedKeys)) {
    throw new Error(`CDN stage ${label} has unsupported or missing fields`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`CDN stage ${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value, label, { allowEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((entry) => typeof entry !== 'string' || !entry)
  ) {
    throw new Error(`CDN stage ${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`);
  }
  return [...value];
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`CDN stage ${label} must be a non-negative safe integer`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`CDN stage ${label} must be a positive safe integer`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`CDN stage ${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requireExactValue(value, expected, label) {
  if (value !== expected) {
    throw new Error(`CDN stage ${label} must be ${expected}`);
  }
  return value;
}

function requireStagePath(value, label) {
  const stagePath = requireString(value, label);
  safeLocalPath('/cdn-stage-contract', stagePath);
  return stagePath;
}
