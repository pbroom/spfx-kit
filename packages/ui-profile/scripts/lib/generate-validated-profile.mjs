import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { generateProfile } from './generate-profile.mjs';
import { assertGeneratedTreeClosure, pinnedTypeDirectiveNames } from './generated-tree-closure.mjs';
import { replaceGeneratedPaths } from './replace-generated.mjs';
import { assertGeneratedProfileCompiles } from './typecheck-generated-profile.mjs';

export async function generateValidatedProfile({
  packageRoot,
  rawRoot,
  outputRoot,
  provenance,
  provenanceBytes,
  generatedPaths,
  generationSession,
  replaceGenerated = replaceGeneratedPaths
}) {
  const generated = await generateProfile({ packageRoot, rawRoot, outputRoot, provenance, provenanceBytes });
  const profile = JSON.parse(await readFile(path.join(outputRoot, 'profile.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  await assertGeneratedTreeClosure({
    outputRoot,
    profile,
    allowedExternalPackages: Object.keys(provenance.directProductionDependencies),
    allowedTypeDirectives: pinnedTypeDirectiveNames(manifest.devDependencies)
  });
  await assertGeneratedProfileCompiles({ packageRoot, outputRoot });
  await replaceGenerated({
    packageRoot,
    stagingRoot: outputRoot,
    generatedPaths,
    generationSession
  });
  return generated;
}
