import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateProfile } from './lib/generate-profile.mjs';
import { createGeneratedProfileStaging, withGeneratedProfileSession } from './lib/generation-transaction.mjs';
import { assertProfileGenerationProvenance } from './lib/profile-update-intake.mjs';
import { replaceGeneratedPaths } from './lib/replace-generated.mjs';

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
    generated = await generateProfile({
      packageRoot,
      rawRoot: path.join(packageRoot, 'snapshots', 'raw'),
      outputRoot: stagingRoot,
      provenance,
      provenanceBytes
    });
    await replaceGeneratedPaths({
      packageRoot,
      stagingRoot,
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
