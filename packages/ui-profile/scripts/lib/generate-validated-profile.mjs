import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { generateProfile } from './generate-profile.mjs';
import { assertGeneratedTreeClosure } from './generated-tree-closure.mjs';
import { canonicalJson, pinnedTypeDirectiveNames, sha256 } from './profile.mjs';
import { replaceGeneratedPaths } from './replace-generated.mjs';
import { assertGeneratedProfileCompiles } from './typecheck-generated-profile.mjs';

const PROFILE_SCHEMA_SHA256 = '36537b93ad79b1cf20c67fee0c154231ff3405b0e369cf23889e722be2820d2d';

export async function assertGeneratedProfileSchema({ packageRoot, profile }) {
  const schema = JSON.parse(await readFile(path.join(packageRoot, 'profile.schema.json'), 'utf8'));
  if (sha256(Buffer.from(canonicalJson(schema))) !== PROFILE_SCHEMA_SHA256) {
    throw new Error('profile.schema.json identity differs');
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateProfile = ajv.compile(schema);
  if (!validateProfile(profile)) {
    throw new Error(`profile.json schema errors: ${ajv.errorsText(validateProfile.errors)}`);
  }
}

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
  await assertGeneratedProfileSchema({ packageRoot, profile });
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
