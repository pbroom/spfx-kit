import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { auditScopedTailwindCss, scopeTailwindCss } from './scope-tailwind-css.mjs';
import { canonicalJson, sha256 } from './profile.mjs';

const execFileAsync = promisify(execFile);
const modulePackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const moduleRepositoryRoot = path.resolve(modulePackageRoot, '..', '..');
const requireFromRoot = createRequire(path.join(moduleRepositoryRoot, 'package.json'));
const ts = requireFromRoot('typescript');
const selectorParser = requireFromRoot('postcss-selector-parser');
const CSS_ENTRY_PATH = 'tailwind-profile.css';
const CSS_ARTIFACT_PATH = 'generated/tailwind-profile.css';
const COMPILER_PATH = 'scripts/lib/compile-tailwind-css.mjs';
const SCOPER_PATH = 'scripts/lib/scope-tailwind-css.mjs';
const ANIMATION_PACKAGE = 'tw-animate-css';
const ANIMATION_SOURCE_PATH = 'dist/tw-animate.css';
const SOURCE_DIRECTIVE = '@source "./normalized/src";';
const CANDIDATE_SOURCE_PATH = 'tailwind-candidates.txt';
const NETWORK_BLOCKER_PATH = 'scripts/lib/block-network.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`CSS source contains a non-file entry: ${absolute}`);
    }
  }
  await visit(root);
  return files.sort();
}

async function normalizedSourceInventory(sourceRoot) {
  const normalizedRoot = path.join(sourceRoot, 'normalized', 'src');
  const records = [];
  const candidates = new Set();
  for (const absolute of await filesUnder(normalizedRoot)) {
    if (!/\.(?:ts|tsx)$/u.test(absolute)) continue;
    const bytes = await readFile(absolute);
    const relative = path.relative(sourceRoot, absolute).replaceAll(path.sep, '/');
    records.push({ path: relative, sha256: sha256(bytes) });
    const sourceFile = ts.createSourceFile(relative, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const token of node.text.split(/\s+/u).filter(Boolean)) {
          if (token.startsWith('skui:')) candidates.add(token);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  assert(records.length > 0, 'CSS compiler found no normalized source files');
  assert(candidates.size > 0, 'CSS compiler found no prefixed Tailwind candidates');
  const sortedCandidates = [...candidates].sort();
  const structuralMarkers = sortedCandidates.filter((candidate) => /^skui:(?:group|peer)(?:\/[a-z0-9-]+)?$/u.test(candidate));
  const structuralMarkerSet = new Set(structuralMarkers);
  const emittingCandidates = sortedCandidates.filter((candidate) => !structuralMarkerSet.has(candidate));
  const conditionalClasses = [
    ...new Set(
      sortedCandidates.flatMap((candidate) => {
        const classes = [...candidate.matchAll(/\.((?:\\.|[_a-zA-Z])(?:\\.|[-_a-zA-Z0-9])*)/gu)].map((match) => {
          const node = selectorParser().astSync(`.${match[1]}`).nodes[0]?.first;
          assert(node?.type === 'class', `Conditional selector class is not statically parseable: ${match[0]}`);
          return node.value;
        });
        if (/^skui:group-/u.test(candidate)) classes.push('skui:group');
        if (/^skui:peer-/u.test(candidate)) classes.push('skui:peer');
        return classes;
      })
    )
  ].sort();
  return { records, candidates: sortedCandidates, structuralMarkers, emittingCandidates, conditionalClasses };
}

function repositoryRoot(packageRoot) {
  return path.resolve(packageRoot, '..', '..');
}

async function assertInstalledVersion(packageRoot, packageName, expectedVersion) {
  const installedRoot = path.join(repositoryRoot(packageRoot), 'node_modules', ...packageName.split('/'));
  const packageJson = JSON.parse(await readFile(path.join(installedRoot, 'package.json'), 'utf8'));
  assert(packageJson.name === packageName, `${packageName} resolved to an unexpected package`);
  assert(packageJson.version === expectedVersion, `${packageName} installed version differs from provenance`);
  return installedRoot;
}

async function assertCssToolchainResolution(packageRoot, provenance) {
  for (const packageName of ['tailwindcss', '@tailwindcss/cli', 'postcss', 'postcss-selector-parser', 'postcss-value-parser', 'tw-animate-css']) {
    await assertInstalledVersion(packageRoot, packageName, provenance.cssToolchain[packageName].version);
  }
  await assertInstalledVersion(packageRoot, 'typescript', provenance.typescriptMatrix[0]);
}

async function resolvedAnimationSource(packageRoot, provenance) {
  const installedRoot = await assertInstalledVersion(
    packageRoot,
    ANIMATION_PACKAGE,
    provenance.cssToolchain[ANIMATION_PACKAGE].version
  );
  return path.join(installedRoot, ANIMATION_SOURCE_PATH);
}

async function resolvedTailwindCli(packageRoot, provenance) {
  const installedRoot = await assertInstalledVersion(
    packageRoot,
    '@tailwindcss/cli',
    provenance.cssToolchain['@tailwindcss/cli'].version
  );
  return path.join(installedRoot, 'dist', 'index.mjs');
}

function compilerEntryBytes(entryBytes) {
  const entry = entryBytes.toString('utf8');
  assert(entry.split(SOURCE_DIRECTIVE).length === 2, 'Tailwind entry must contain one exact normalized source directive');
  return Buffer.from(entry.replace(SOURCE_DIRECTIVE, `@source "./${CANDIDATE_SOURCE_PATH}";`));
}

export async function cssCompilerInputRecord({ packageRoot, sourceRoot, provenance }) {
  await assertCssToolchainResolution(packageRoot, provenance);
  const entryBytes = await readFile(path.join(packageRoot, CSS_ENTRY_PATH));
  const animationBytes = await readFile(await resolvedAnimationSource(packageRoot, provenance));
  const compilerBytes = await readFile(path.join(packageRoot, COMPILER_PATH));
  const scoperBytes = await readFile(path.join(packageRoot, SCOPER_PATH));
  const networkBlockerBytes = await readFile(path.join(packageRoot, NETWORK_BLOCKER_PATH));
  const sourceInventory = await normalizedSourceInventory(sourceRoot);
  const toolchainSha256 = sha256(Buffer.from(canonicalJson(provenance.cssToolchain)));
  const scopeSeed = {
    profileId: provenance.profileId,
    entrySha256: sha256(entryBytes),
    animationSha256: sha256(animationBytes),
    compilerSha256: sha256(compilerBytes),
    scoperSha256: sha256(scoperBytes),
    networkBlockerSha256: sha256(networkBlockerBytes),
    toolchainSha256,
    normalizedSources: sourceInventory.records
  };
  const scopeSeedSha256 = createHash('sha256').update(canonicalJson(scopeSeed)).digest('hex');
  return {
    entryBytes,
    sourceInventory,
    scopeValue: `skui-${scopeSeedSha256.slice(0, 16)}`,
    scopeSeedSha256,
    manifest: {
      entry: { path: CSS_ENTRY_PATH, sha256: sha256(entryBytes) },
      animationSource: {
        package: ANIMATION_PACKAGE,
        version: provenance.cssToolchain[ANIMATION_PACKAGE].version,
        path: ANIMATION_SOURCE_PATH,
        sha256: sha256(animationBytes)
      },
      compiler: { path: COMPILER_PATH, sha256: sha256(compilerBytes) },
      scoper: { path: SCOPER_PATH, sha256: sha256(scoperBytes) },
      networkBlocker: { path: NETWORK_BLOCKER_PATH, sha256: sha256(networkBlockerBytes) },
      toolchainSha256,
      scopeSeedSha256,
      scopeValue: `skui-${scopeSeedSha256.slice(0, 16)}`,
      scopeSelector: `[data-spfx-ui-scope="skui-${scopeSeedSha256.slice(0, 16)}"]`
    }
  };
}

export async function compileTailwindCss({ packageRoot, sourceRoot = packageRoot, outputRoot = sourceRoot, provenance }) {
  const inputs = await cssCompilerInputRecord({ packageRoot, sourceRoot, provenance });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spfx-ui-css-'));
  const inputPath = path.join(temporaryRoot, CSS_ENTRY_PATH);
  const candidateSourcePath = path.join(temporaryRoot, CANDIDATE_SOURCE_PATH);
  const rawOutputPath = path.join(temporaryRoot, 'tailwind.raw.css');
  try {
    await symlink(
      path.join(repositoryRoot(packageRoot), 'node_modules'),
      path.join(temporaryRoot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await writeFile(inputPath, compilerEntryBytes(inputs.entryBytes));
    await writeFile(candidateSourcePath, `${inputs.sourceInventory.candidates.join('\n')}\n`);
    await execFileAsync(
      process.execPath,
      [
        '--import',
        path.join(packageRoot, NETWORK_BLOCKER_PATH),
        await resolvedTailwindCli(packageRoot, provenance),
        '-i',
        inputPath,
        '-o',
        rawOutputPath,
        '--minify',
        '--silent'
      ],
      { cwd: packageRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
    const rawCss = await readFile(rawOutputPath, 'utf8');
    const scoped = scopeTailwindCss({
      rawCss,
      scopeValue: inputs.scopeValue,
      candidates: inputs.sourceInventory.emittingCandidates,
      allowedClasses: [...inputs.sourceInventory.candidates, ...inputs.sourceInventory.conditionalClasses]
    });
    assert(!scoped.css.includes(packageRoot), 'Generated CSS contains the repository path');
    const artifactBytes = Buffer.from(scoped.css, 'utf8');
    const artifact = { path: CSS_ARTIFACT_PATH, sha256: sha256(artifactBytes) };
    await mkdir(path.join(outputRoot, path.dirname(CSS_ARTIFACT_PATH)), { recursive: true });
    await writeFile(path.join(outputRoot, CSS_ARTIFACT_PATH), artifactBytes);
    return {
      ...inputs.manifest,
      artifact,
      candidateCount: inputs.sourceInventory.candidates.length,
      structuralMarkers: inputs.sourceInventory.structuralMarkers,
      conditionalClasses: inputs.sourceInventory.conditionalClasses,
      keyframeCount: scoped.keyframeCount,
      containerCount: scoped.containerCount,
      fallbackPropertyCount: scoped.fallbackPropertyCount
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function verifyTailwindCss({ packageRoot, sourceRoot = packageRoot, profile, provenance }) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'spfx-ui-css-verify-'));
  try {
    const actual = await compileTailwindCss({ packageRoot, sourceRoot, outputRoot: temporaryRoot, provenance });
    assert(canonicalJson(actual) === canonicalJson(profile.css), 'Generated CSS manifest differs from profile.json');
    const expectedBytes = await readFile(path.join(packageRoot, profile.css.artifact.path));
    const actualBytes = await readFile(path.join(temporaryRoot, actual.artifact.path));
    assert(expectedBytes.equals(actualBytes), 'Generated CSS artifact is not reproducible');
    const sourceInventory = await normalizedSourceInventory(sourceRoot);
    auditScopedTailwindCss({
      css: expectedBytes.toString('utf8'),
      scopeValue: actual.scopeValue,
      candidates: sourceInventory.emittingCandidates,
      allowedClasses: [...sourceInventory.candidates, ...sourceInventory.conditionalClasses]
    });
    return actual;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
