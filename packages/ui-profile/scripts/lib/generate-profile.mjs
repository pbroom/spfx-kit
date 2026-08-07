import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  GENERATOR_VERSION,
  PROFILE_ID,
  PROFILE_SCHEMA_VERSION,
  assertRegistryIds,
  canonicalJson,
  normalizeRegistrySource,
  sha256
} from './profile.mjs';

const compilerInputPaths = [
  'compat-consumers/react17-base-ui-jsx.d.ts',
  'compat-consumers/select-value.tsx',
  'scripts/typecheck.mjs',
  'scripts/lib/generate-profile.mjs',
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

function dependencyName(specifier, label) {
  if (typeof specifier !== 'string' || specifier.length === 0) throw new Error(`${label} has an invalid dependency`);
  const match = specifier.startsWith('@')
    ? /^(@[^/]+\/[^@/]+)(?:@.+)?$/u.exec(specifier)
    : /^([^@/]+)(?:@.+)?$/u.exec(specifier);
  if (!match) throw new Error(`${label} has an unsupported dependency specifier: ${specifier}`);
  return match[1];
}

function isExcludedDependency(name, exclusions) {
  return exclusions.some((specifier) => {
    if (specifier.endsWith('/*')) return name.startsWith(specifier.slice(0, -1));
    return dependencyName(specifier, 'Profile exclusion') === name;
  });
}

function assertMetadataDependenciesAllowed(item, exclusions) {
  for (const field of ['dependencies', 'devDependencies']) {
    const dependencies = item[field] ?? [];
    if (!Array.isArray(dependencies)) throw new Error(`${item.name}: ${field} metadata is invalid`);
    for (const specifier of dependencies) {
      const name = dependencyName(specifier, `${item.name} ${field}`);
      if (isExcludedDependency(name, exclusions)) {
        throw new Error(`${item.name}: excluded metadata dependency ${name} is present`);
      }
    }
  }
}

export async function generateProfile({ packageRoot, rawRoot, outputRoot, provenance, provenanceBytes }) {
  assertRegistryIds(provenance.registryIds);
  await mkdir(path.join(outputRoot, 'snapshots', 'canonical'), { recursive: true });
  const implementationPath = path.join(packageRoot, 'scripts', 'lib', 'profile.mjs');
  const items = [];
  const outputPaths = new Set();

  for (const id of provenance.registryIds) {
    const rawRelative = `snapshots/raw/${id}.json`;
    const canonicalRelative = `snapshots/canonical/${id}.json`;
    const rawBytes = await readFile(path.join(rawRoot, `${id}.json`));
    const parsed = JSON.parse(rawBytes.toString('utf8'));
    if (parsed.name !== id || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error(`Registry snapshot for ${id} has an unexpected identity or no files`);
    }
    assertMetadataDependenciesAllowed(parsed, provenance.excludedDependencies ?? []);
    const canonicalBytes = Buffer.from(canonicalJson(parsed));
    await writeFile(path.join(outputRoot, canonicalRelative), canonicalBytes);

    const normalized = [];
    for (const file of parsed.files) {
      if (typeof file.path !== 'string' || typeof file.content !== 'string') {
        throw new Error(`${id}: every accepted registry file must contain a path and source bytes`);
      }
      const result = normalizeRegistrySource({ source: file.content, registrySourcePath: file.path });
      if (outputPaths.has(result.outputPath)) throw new Error(`${id}: duplicate normalized output ${result.outputPath}`);
      outputPaths.add(result.outputPath);
      const outputAbsolute = path.join(outputRoot, result.outputPath);
      await mkdir(path.dirname(outputAbsolute), { recursive: true });
      await writeFile(outputAbsolute, result.source);
      normalized.push({
        registrySourcePath: file.path,
        upstreamSha256: sha256(Buffer.from(file.content)),
        path: result.outputPath,
        sha256: sha256(Buffer.from(result.source)),
        transformations: result.transformations
      });
    }

    items.push({
      id,
      raw: { path: rawRelative, sha256: sha256(rawBytes) },
      canonical: { path: canonicalRelative, sha256: sha256(canonicalBytes) },
      normalized
    });
  }

  const profile = {
    $schema: './profile.schema.json',
    schemaVersion: PROFILE_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    profileId: PROFILE_ID,
    provenanceSha256: sha256(provenanceBytes),
    normalizationImplementationSha256: sha256(await readFile(implementationPath)),
    compilerInputs: await Promise.all(
      compilerInputPaths.map(async (inputPath) => ({
        path: inputPath,
        sha256: sha256(await readFile(path.join(packageRoot, inputPath)))
      }))
    ),
    dependencyClosure: {
      path: 'dependency-closure.json',
      sha256: sha256(await readFile(path.join(packageRoot, 'dependency-closure.json')))
    },
    baseUiDeclarationTransform: {
      path: 'compat/base-ui-1.6.0/select-value/contract.json',
      sha256: sha256(await readFile(path.join(packageRoot, 'compat', 'base-ui-1.6.0', 'select-value', 'contract.json')))
    },
    baseUiPopupLifecycleTransform: {
      path: 'compat/base-ui-1.6.0/popup-lifecycle/contract.json',
      sha256: sha256(await readFile(path.join(packageRoot, 'compat', 'base-ui-1.6.0', 'popup-lifecycle', 'contract.json')))
    },
    items
  };
  await writeFile(path.join(outputRoot, 'profile.json'), canonicalJson(profile));
  return { itemCount: items.length, outputCount: outputPaths.size };
}
