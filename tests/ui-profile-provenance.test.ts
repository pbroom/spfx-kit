import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { assertProfileGenerationProvenance } from '../packages/ui-profile/scripts/lib/profile-update-intake.mjs';

const packageRoot = path.resolve('packages/ui-profile');

async function canonicalProvenance() {
  return JSON.parse(await readFile(path.join(packageRoot, 'provenance.json'), 'utf8'));
}

describe('UI profile generation provenance', () => {
  it('accepts the checked-in provenance contract', async () => {
    await expect(
      assertProfileGenerationProvenance({ packageRoot, provenance: await canonicalProvenance() })
    ).resolves.toBeUndefined();
  });

  it('rejects a provenance normalizer digest that does not match the implementation bytes', async () => {
    const provenance = await canonicalProvenance();
    provenance.normalization.implementationSha256 = '0'.repeat(64);
    await expect(assertProfileGenerationProvenance({ packageRoot, provenance })).rejects.toThrow(
      'Normalization implementation digest differs'
    );
  });

  it.each([
    [
      'profile ID',
      (provenance: Record<string, unknown>) => {
        provenance.profileId = 'other-profile';
      }
    ],
    [
      'generator version',
      (provenance: Record<string, unknown>) => {
        provenance.generatorVersion = '0.0.0';
      }
    ],
    [
      'registry allowlist',
      (provenance: Record<string, unknown>) => {
        provenance.registryIds = [];
      }
    ]
  ])('rejects drifted %s before generation', async (_label, mutate) => {
    const provenance = await canonicalProvenance();
    mutate(provenance);
    await expect(assertProfileGenerationProvenance({ packageRoot, provenance })).rejects.toThrow(
      /Profile update provenance is invalid|Provenance identity|Registry allowlist/
    );
  });
});
