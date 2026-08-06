import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateValidatedProfile } from './lib/generate-validated-profile.mjs';
import { createGeneratedProfileStaging, withGeneratedProfileSession } from './lib/generation-transaction.mjs';
import { assertProfileGenerationProvenance } from './lib/profile-update-intake.mjs';

if (process.argv.length !== 2) throw new Error('Offline profile regeneration does not accept arguments');

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await withGeneratedProfileSession({ packageRoot, operation: 'regenerate' }, async (generationSession) => {
  const provenanceBytes = await readFile(path.join(packageRoot, 'provenance.json'));
  const provenance = JSON.parse(provenanceBytes);
  await assertProfileGenerationProvenance({ packageRoot, provenance });
  const stagingRoot = await createGeneratedProfileStaging(generationSession);
  let generated;
  let operationFailure;
  try {
    generated = await generateValidatedProfile({
      packageRoot,
      rawRoot: path.join(packageRoot, 'snapshots', 'raw'),
      outputRoot: stagingRoot,
      provenance,
      provenanceBytes,
      generatedPaths: ['snapshots/canonical', 'normalized', 'profile.json'],
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
    throw new AggregateError([operationFailure, cleanupFailure], 'Profile regeneration and staging cleanup both failed');
  }
  if (operationFailure) throw operationFailure;
  if (cleanupFailure) throw cleanupFailure;
  console.log(`Regenerated ${provenance.profileId} offline: ${generated.itemCount} payloads, ${generated.outputCount} files`);
});
