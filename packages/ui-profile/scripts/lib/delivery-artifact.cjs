'use strict';

const { createHash } = require('node:crypto');
const { lstatSync, readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveOwnedFile(packageRoot, relativePath, label) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, `${label} path is missing`);
  assert(!path.isAbsolute(relativePath), `${label} path must be relative to the UI profile`);
  const absolutePath = path.resolve(packageRoot, relativePath);
  const relative = path.relative(packageRoot, absolutePath);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} path escapes the UI profile`);
  return absolutePath;
}

function resolveUiProfileDeliveryArtifact({ packageRoot }) {
  const resolvedPackageRoot = realpathSync(packageRoot);
  const profilePath = path.join(resolvedPackageRoot, 'profile.json');
  const provenancePath = path.join(resolvedPackageRoot, 'provenance.json');
  for (const [filePath, label] of [
    [profilePath, 'UI profile manifest'],
    [provenancePath, 'UI profile provenance']
  ]) {
    const stats = lstatSync(filePath);
    assert(stats.isFile() && !stats.isSymbolicLink(), `${label} must be a regular file`);
  }
  const profileBytes = readFileSync(profilePath);
  const provenanceBytes = readFileSync(provenancePath);
  const profile = JSON.parse(profileBytes.toString('utf8'));
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));

  assert(typeof profile.profileId === 'string' && profile.profileId.length > 0, 'UI profile ID is missing');
  assert(profile.profileId === provenance.profileId, 'UI profile and provenance identities differ');
  assert(SHA256_PATTERN.test(String(profile.provenanceSha256 || '')), 'UI profile provenance digest is invalid');
  assert(profile.provenanceSha256 === sha256(provenanceBytes), 'UI profile provenance digest differs');

  const css = profile.css;
  assert(css && typeof css === 'object', 'UI profile CSS contract is missing');
  assert(SHA256_PATTERN.test(String(css.artifact?.sha256 || '')), 'UI profile CSS digest is invalid');
  assert(typeof css.scopeValue === 'string' && css.scopeValue.length > 0, 'UI profile CSS scope is missing');
  assert(css.scopeSelector === `[data-spfx-ui-scope="${css.scopeValue}"]`, 'UI profile CSS scope identity differs');

  const cssPath = resolveOwnedFile(resolvedPackageRoot, css.artifact?.path, 'UI profile CSS artifact');
  const cssStats = lstatSync(cssPath);
  assert(cssStats.isFile() && !cssStats.isSymbolicLink(), 'UI profile CSS artifact must be a regular file');
  const resolvedCssPath = realpathSync(cssPath);
  const resolvedCssRelative = path.relative(resolvedPackageRoot, resolvedCssPath);
  assert(
    resolvedCssRelative && !resolvedCssRelative.startsWith('..') && !path.isAbsolute(resolvedCssRelative),
    'UI profile CSS artifact resolves outside the UI profile'
  );
  const cssBytes = readFileSync(resolvedCssPath);
  assert(css.artifact.sha256 === sha256(cssBytes), 'UI profile CSS artifact digest differs');

  return Object.freeze({
    profileId: profile.profileId,
    profilePath,
    profileSha256: sha256(profileBytes),
    provenanceSha256: profile.provenanceSha256,
    cssPath: resolvedCssPath,
    cssRelativePath: css.artifact.path,
    cssSha256: css.artifact.sha256,
    scopeValue: css.scopeValue,
    scopeSelector: css.scopeSelector
  });
}

module.exports = { resolveUiProfileDeliveryArtifact };
