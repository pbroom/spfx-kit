import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateProfile } from './lib/generate-profile.mjs';
import { createGeneratedProfileStaging, withGeneratedProfileSession } from './lib/generation-transaction.mjs';
import { PROFILE_ID, PROFILE_SCHEMA_VERSION, assertRegistryIds } from './lib/profile.mjs';
import { fetchValidatedProfileUpdateSnapshots } from './lib/profile-update-intake.mjs';
import { replaceGeneratedPaths } from './lib/replace-generated.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--allow-network') {
  throw new Error('Profile updates require the explicit --allow-network flag');
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await withGeneratedProfileSession({ packageRoot, operation: 'update' }, async (generationSession) => {
  const provenancePath = path.join(packageRoot, 'provenance.json');
  const provenanceBytes = await readFile(provenancePath);
  const provenance = JSON.parse(provenanceBytes);

  if (provenance.profileId !== PROFILE_ID || provenance.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error('Provenance identity does not match the profile generator');
  }
  assertRegistryIds(provenance.registryIds);

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

    generated = await generateProfile({
      packageRoot,
      rawRoot: path.join(stagingRoot, 'snapshots', 'raw'),
      outputRoot: stagingRoot,
      provenance,
      provenanceBytes
    });

    await replaceGeneratedPaths({
      packageRoot,
      stagingRoot,
      generatedPaths: ['snapshots', 'normalized', 'profile.json'],
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
