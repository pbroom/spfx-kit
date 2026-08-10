import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalogContract } from './lib/catalog.mjs';
import { generateValidatedProfile } from './lib/generate-validated-profile.mjs';
import { createGeneratedProfileStaging, withGeneratedProfileSession } from './lib/generation-transaction.mjs';
import { PROFILE_ID, canonicalJson, pinnedTypeDirectiveNames, sha256 } from './lib/profile.mjs';
import {
  assertProductionDependencyRoots,
  bindVerifiedSnapshotsToProvenance,
  fetchPinnedRegistrySnapshots
} from './lib/profile-update-intake.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--allow-network') {
  throw new Error('Catalog profile updates require the explicit --allow-network flag');
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession) => {
  const [currentBytes, manifestBytes, implementationBytes, { catalog, coverage }] = await Promise.all([
    readFile(path.join(packageRoot, 'provenance.json')),
    readFile(path.join(packageRoot, 'package.json')),
    readFile(path.join(packageRoot, 'scripts/lib/profile.mjs')),
    readCatalogContract(packageRoot)
  ]);
  const current = JSON.parse(currentBytes);
  const manifest = JSON.parse(manifestBytes);
  const directProductionDependencies = {
    ...manifest.dependencies,
    ...manifest.peerDependencies
  };
  assertProductionDependencyRoots(
    [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})],
    directProductionDependencies
  );
  const candidate = {
    ...current,
    profileId: catalog.profileId,
    registryIds: [...coverage.registryIds],
    registrySnapshots: {},
    registryDependencyTagResolutions: {
      'react-day-picker@latest': '10.0.1'
    },
    normalization: {
      ...current.normalization,
      implementationSha256: sha256(implementationBytes)
    },
    excludedDependencies: [
      'cmdk@1.1.1',
      '@shadcn/react@0.3.0',
      'react-resizable-panels@4.12.2',
      'sonner@2.0.8',
      '@radix-ui/*',
      'react-aria-components',
      'vaul'
    ],
    directProductionDependencies
  };

  const stagingRoot = await createGeneratedProfileStaging(generationSession);
  let generated;
  let operationFailure;
  try {
    await mkdir(path.join(stagingRoot, 'snapshots', 'raw'), { recursive: true });
    await mkdir(path.join(stagingRoot, 'snapshots', 'catalog'), { recursive: true });
    await copyFile(
      path.join(packageRoot, 'snapshots', 'catalog', 'components.json'),
      path.join(stagingRoot, 'snapshots', 'catalog', 'components.json')
    );
    const snapshots = await fetchPinnedRegistrySnapshots({
      packageRoot,
      registry: candidate.registry,
      registryIds: candidate.registryIds,
      dependencyPolicy: {
        excludedDependencies: candidate.excludedDependencies,
        directProductionDependencies,
        registryDependencyTagResolutions: candidate.registryDependencyTagResolutions,
        allowedTypeDirectives: pinnedTypeDirectiveNames(manifest.devDependencies)
      }
    });
    for (const id of candidate.registryIds) {
      await writeFile(path.join(stagingRoot, 'snapshots', 'raw', `${id}.json`), snapshots.get(id));
    }
    const updatedProvenance = bindVerifiedSnapshotsToProvenance(candidate, snapshots);
    const updatedProvenanceBytes = Buffer.from(canonicalJson(updatedProvenance));
    await writeFile(path.join(stagingRoot, 'provenance.json'), updatedProvenanceBytes);
    generated = await generateValidatedProfile({
      packageRoot,
      rawRoot: path.join(stagingRoot, 'snapshots', 'raw'),
      outputRoot: stagingRoot,
      provenance: updatedProvenance,
      provenanceBytes: updatedProvenanceBytes,
      generatedPaths: ['snapshots', 'normalized', 'generated', 'profile.json', 'provenance.json'],
      generationSession
    });
  } catch (error) {
    operationFailure = error;
  }
  let cleanupFailure;
  try {
    await rm(stagingRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupFailure = error;
  }
  if (operationFailure && cleanupFailure) {
    throw new AggregateError([operationFailure, cleanupFailure], 'Catalog update and staging cleanup both failed');
  }
  if (operationFailure) throw operationFailure;
  if (cleanupFailure) throw cleanupFailure;
  console.log(`Updated ${PROFILE_ID}: ${generated.itemCount} registry payloads, ${generated.outputCount} normalized files`);
});
