import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs module without type declarations
import {
  assertCatalogSnapshot,
  deriveCatalogCoverage,
  readCatalogContract
} from '../packages/ui-profile/scripts/lib/catalog.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { verifyCatalogPackage } from '../packages/ui-profile/scripts/verify-catalog.mjs';

const packageRoot = path.resolve('packages/ui-profile');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('official shadcn component catalog coverage', () => {
  it('classifies every one of the 64 official entries exactly once', async () => {
    const { catalog, snapshot, coverage } = await readCatalogContract(packageRoot);

    expect(snapshot.componentIds).toHaveLength(64);
    expect(coverage.catalogComponentIds).toHaveLength(64);
    expect(coverage.includedComponentIds).toHaveLength(57);
    expect(coverage.excludedComponentIds).toHaveLength(4);
    expect(coverage.documentedCompositionIds).toHaveLength(3);
    expect(coverage.supportRegistryIds).toEqual(['utils', 'use-mobile']);
    expect(coverage.registryIds).toEqual([...coverage.includedComponentIds, 'utils', 'use-mobile']);
    expect(catalog.counts).toEqual({
      catalog: 64,
      included: 57,
      excluded: 4,
      documentedCompositions: 3
    });
  });

  it('rejects missing, overlapping, and unbound catalog classifications', async () => {
    const { catalog } = await readCatalogContract(packageRoot);

    const missing = clone(catalog);
    missing.includedComponentIds.pop();
    expect(() => deriveCatalogCoverage(missing)).toThrow('Included component count differs');

    const overlapping = clone(catalog);
    overlapping.supportRegistryIds.push(overlapping.includedComponentIds[0]);
    expect(() => deriveCatalogCoverage(overlapping)).toThrow('also classified as a catalog component');

    const unbound = clone(catalog);
    unbound.excludedComponents[0].divergenceId = 'missing-divergence';
    expect(() => deriveCatalogCoverage(unbound)).toThrow('references an unknown divergence');
  });

  it('rejects official snapshot omissions, additions, and category-order drift', async () => {
    const { catalog, snapshot, coverage } = await readCatalogContract(packageRoot);

    const omitted = clone(snapshot);
    omitted.componentIds.pop();
    expect(() => assertCatalogSnapshot(catalog, omitted, coverage)).toThrow('exactly 64 entries');

    const unknown = clone(snapshot);
    unknown.componentIds[0] = 'unknown-component';
    expect(() => assertCatalogSnapshot(catalog, unknown, coverage)).toThrow('unclassified component');

    const reordered = clone(snapshot);
    [reordered.componentIds[0], reordered.componentIds[1]] = [reordered.componentIds[1], reordered.componentIds[0]];
    expect(() => assertCatalogSnapshot(catalog, reordered, coverage)).toThrow(
      'Included component order differs from the official catalog snapshot'
    );
  });

  it('binds public exports and every generated registry inventory to the catalog authority', async () => {
    await expect(verifyCatalogPackage({ packageRoot })).resolves.toEqual({
      catalog: 64,
      included: 57,
      excluded: 4,
      documentedCompositions: 3,
      registry: 59,
      public: 57
    });
  });

  it('locks every official default source byte and its normalized output against silent drift', async () => {
    const { coverage } = await readCatalogContract(packageRoot);
    const profile = JSON.parse(await readFile(path.join(packageRoot, 'profile.json'), 'utf8')) as {
      compilerInputs: Array<{ path: string }>;
      items: Array<{
        id: string;
        normalized: Array<{ path: string; sha256: string }>;
      }>;
    };

    for (const id of coverage.registryIds) {
      const [raw, canonical] = await Promise.all([
        readFile(path.join(packageRoot, 'snapshots', 'raw', `${id}.json`), 'utf8').then(JSON.parse),
        readFile(path.join(packageRoot, 'snapshots', 'canonical', `${id}.json`), 'utf8').then(JSON.parse)
      ]);
      expect(canonical, `${id}: canonical registry value`).toEqual(raw);

      const item = profile.items.find((candidate) => candidate.id === id);
      expect(item, `${id}: profile item`).toBeDefined();
      for (const output of item?.normalized ?? []) {
        const bytes = await readFile(path.join(packageRoot, output.path));
        expect(sha256(bytes), `${id}: ${output.path}`).toBe(output.sha256);
      }
    }

    expect(profile.compilerInputs.map((input) => input.path)).toEqual(
      expect.arrayContaining([
        'catalog.json',
        'snapshots/catalog/components.json',
        'scripts/lib/scope-tailwind-css.mjs',
        'tailwind-profile.css'
      ])
    );
  });

  it('records every host-sensitive catalog adaptation in the generated profile', async () => {
    const profile = JSON.parse(await readFile(path.join(packageRoot, 'profile.json'), 'utf8')) as {
      items: Array<{
        id: string;
        normalized: Array<{ transformations: string[] }>;
      }>;
    };
    const transformationsFor = (id: string) =>
      profile.items.find((item) => item.id === id)?.normalized.flatMap((output) => output.transformations) ?? [];

    expect(transformationsFor('chart')).toContain('bind-chart-to-owned-host');
    expect(transformationsFor('sidebar')).toContain('bind-sidebar-to-owned-host');
    expect(transformationsFor('toast')).toContain('bind-toast-to-owned-host');
    expect(transformationsFor('navigation-menu')).toEqual(
      expect.arrayContaining(['bind-navigation-menu-to-owned-host', 'route-portals-through-owned-host'])
    );
    for (const id of ['alert-dialog', 'context-menu', 'drawer', 'hover-card']) {
      expect(transformationsFor(id), id).toContain('route-portals-through-owned-host');
    }
  });
});
