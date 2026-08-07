import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { generateProfile } from './generate-profile.mjs';
import { assertGeneratedTreeClosure, pinnedTypeDirectiveNames } from './generated-tree-closure.mjs';
import { canonicalJson, sha256 } from './profile.mjs';
import { replaceGeneratedPaths } from './replace-generated.mjs';
import { assertGeneratedProfileCompiles } from './typecheck-generated-profile.mjs';

const PROFILE_SCHEMA_SHA256 = 'e36ae25449c7b917c44d578c33ed12d58cb0e299c2496001669aa3a69638d6d1';

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
