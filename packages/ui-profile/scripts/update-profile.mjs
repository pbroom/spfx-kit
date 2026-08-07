import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateValidatedProfile } from './lib/generate-validated-profile.mjs';
import { createGeneratedProfileStaging, withGeneratedProfileSession } from './lib/generation-transaction.mjs';
import { PROFILE_ID, canonicalJson } from './lib/profile.mjs';
import {
  assertProfileGenerationProvenance,
  bindVerifiedSnapshotsToProvenance,
  fetchValidatedProfileUpdateSnapshots
} from './lib/profile-update-intake.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--allow-network') {
  throw new Error('Profile updates require the explicit --allow-network flag');
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession) => {
  const provenancePath = path.join(packageRoot, 'provenance.json');
  const provenanceBytes = await readFile(provenancePath);
  const provenance = JSON.parse(provenanceBytes);

  await assertProfileGenerationProvenance({ packageRoot, provenance });

  const stagingRoot = await createGeneratedProfileStaging(generationSession);
  let generated;
  let operationFailure;
  try {
    await mkdir(path.join(stagingRoot, 'snapshots', 'raw'), { recursive: true });
    const snapshots = await fetchValidatedProfileUpdateSnapshots({
      packageRoot,
      provenance
    });
    for (const id of provenance.registryIds) {
      await writeFile(path.join(stagingRoot, 'snapshots', 'raw', `${id}.json`), snapshots.get(id));
    }
    const updatedProvenance = bindVerifiedSnapshotsToProvenance(provenance, snapshots);
    const updatedProvenanceBytes = Buffer.from(canonicalJson(updatedProvenance));
    await writeFile(path.join(stagingRoot, 'provenance.json'), updatedProvenanceBytes);

    generated = await generateValidatedProfile({
      packageRoot,
      rawRoot: path.join(stagingRoot, 'snapshots', 'raw'),
      outputRoot: stagingRoot,
      provenance: updatedProvenance,
      provenanceBytes: updatedProvenanceBytes,
      generatedPaths: ['snapshots', 'normalized', 'profile.json', 'provenance.json'],
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
    throw new AggregateError([operationFailure, cleanupFailure], 'Profile update and staging cleanup both failed');
  }
  if (operationFailure) throw operationFailure;
  if (cleanupFailure) throw cleanupFailure;
  console.log(`Updated ${PROFILE_ID}: ${generated.itemCount} registry payloads, ${generated.outputCount} normalized files`);
});
