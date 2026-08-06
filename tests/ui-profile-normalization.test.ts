import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  assertReact17Source,
  assertRegistryIds,
  canonicalJson,
  externalImports,
  normalizeRegistrySource,
  outputPathForRegistrySource,
  REGISTRY_IDS,
  sha256
} from '../packages/ui-profile/scripts/lib/profile.mjs';
// @ts-expect-error plain .mjs workload fixture without type declarations
import { FONT_OPTION_COUNT, FONT_OPTIONS } from './fixtures/ui-profile/font-options.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface GuardFixture {
  name: string;
  source: string;
  message: string;
}

async function guardFixtures(): Promise<GuardFixture[]> {
  return JSON.parse(
    await readFile(path.join(repositoryRoot, 'tests/fixtures/ui-profile/react17-guard-cases.json'), 'utf8')
  ) as GuardFixture[];
}

describe('React 17 UI profile normalization', () => {
  it('uses reproducible SHA-256 and canonical JSON bytes', () => {
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(canonicalJson({ zebra: 1, alpha: { two: 2, one: 1 }, ordered: ['z', 'a'] })).toBe(
      '{\n' +
        '  "alpha": {\n' +
        '    "one": 1,\n' +
        '    "two": 2\n' +
        '  },\n' +
        '  "ordered": [\n' +
        '    "z",\n' +
        '    "a"\n' +
        '  ],\n' +
        '  "zebra": 1\n' +
        '}\n'
    );
  });

  it('maps only exact Base Nova source paths into the app-owned boundary', () => {
    expect(outputPathForRegistrySource('registry/base-nova/ui/button.tsx')).toBe('normalized/src/components/ui/button.tsx');
    expect(outputPathForRegistrySource('registry\\base-nova\\lib\\utils.ts')).toBe('normalized/src/lib/utils.ts');
    expect(() => outputPathForRegistrySource('../registry/base-nova/ui/button.tsx')).toThrow(
      'Unsupported Base Nova registry source path'
    );
    expect(() => outputPathForRegistrySource('registry/base-nova/ui/nested/button.tsx')).toThrow(
      'Unsupported Base Nova registry source path'
    );
    expect(() => outputPathForRegistrySource('registry/base-nova/ui/button.js')).toThrow(
      'Unsupported Base Nova registry source path'
    );
  });

  it('normalizes aliases, line endings, trailing bytes, and the classic React namespace deterministically', () => {
    const input = [
      'import { cn } from "@/registry/base-nova/lib/utils"',
      'import { Input } from "@/registry/base-nova/ui/input"',
      '',
      'export function Button() {',
      '  return <button className={cn("button")}><Input /></button>',
      '}',
      '',
      ''
    ].join('\r\n');

    const first = normalizeRegistrySource({
      source: input,
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });
    const second = normalizeRegistrySource({
      source: input,
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });

    expect(second).toEqual(first);
    expect(first.outputPath).toBe('normalized/src/components/ui/button.tsx');
    expect(first.source).toBe(
      'import * as React from "react"\n' +
        'import { cn } from "../../lib/utils"\n' +
        'import { Input } from "./input"\n\n' +
        'export function Button() {\n' +
        '  return <button className={cn("button")}><Input /></button>\n' +
        '}\n'
    );
    expect(first.transformations).toEqual(['normalize-line-endings', 'rewrite-app-owned-aliases', 'bind-react-namespace']);
  });

  it('rewrites app-owned aliases only in parsed module specifiers', () => {
    const result = normalizeRegistrySource({
      source:
        'import { cn } from "@/registry/base-nova/lib/utils"\n' +
        'import ButtonImport = require("@/registry/base-nova/ui/button")\n' +
        'export { Input } from "@/registry/base-nova/ui/input"\n' +
        'const lazy = import("@/registry/base-nova/ui/dialog")\n' +
        'const required = require("@/registry/base-nova/ui/field")\n' +
        'const resolved = require.resolve("@/registry/base-nova/ui/sheet")\n' +
        'type ButtonModule = typeof import("@/registry/base-nova/ui/button")\n' +
        'const registryLabel = "@/registry/base-nova/ui/input"\n' +
        '// @/registry/base-nova/ui/dialog is documentation, not a dependency\n' +
        'export { lazy, resolved, registryLabel }\n',
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });

    expect(result.source).toContain('from "../../lib/utils"');
    expect(result.source).toContain('require("./button")');
    expect(result.source).toContain('from "./input"');
    expect(result.source).toContain('import("./dialog")');
    expect(result.source).toContain('require("./field")');
    expect(result.source).toContain('require.resolve("./sheet")');
    expect(result.source).toContain('typeof import("./button")');
    expect(result.source).toContain('const registryLabel = "@/registry/base-nova/ui/input"');
    expect(result.source).toContain('// @/registry/base-nova/ui/dialog is documentation, not a dependency');
    expect(result.transformations).toContain('rewrite-app-owned-aliases');
  });

  it('pins the Combobox module subpath without rewriting comments or runtime strings', () => {
    const result = normalizeRegistrySource({
      source:
        'import { Combobox as ComboboxPrimitive } from "@base-ui/react"\n' +
        'const packageLabel = "@base-ui/react"\n' +
        '// Example: from "@base-ui/react"\n' +
        'export { ComboboxPrimitive, packageLabel }\n',
      registrySourcePath: 'registry/base-nova/ui/combobox.tsx'
    });

    expect(result.source).toContain('from "@base-ui/react/combobox"');
    expect(result.source).toContain('const packageLabel = "@base-ui/react"');
    expect(result.source).toContain('// Example: from "@base-ui/react"');
    expect(result.transformations).toContain('pin-base-ui-combobox-subpath');
  });

  it('binds the classic React namespace for fragments and normalizes declaration exports that forward refs', () => {
    const fragment = normalizeRegistrySource({
      source: 'export const Empty = () => <>empty</>\n',
      registrySourcePath: 'registry/base-nova/ui/empty.tsx'
    });
    expect(fragment.source).toContain('import * as React from "react"');
    expect(() => assertReact17Source('export const Empty = () => <>empty</>\n', 'fragment.tsx')).toThrow(
      'JSX source does not bind the React namespace'
    );

    const wrapper = normalizeRegistrySource({
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'export function Button({ ...props }: ButtonPrimitive.Props) {\n' +
        '  return <ButtonPrimitive {...props} />\n' +
        '}\n' +
        'export default function DefaultButton({ ...props }: ButtonPrimitive.Props) {\n' +
        '  return <ButtonPrimitive {...props} />\n' +
        '}\n',
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });
    expect(wrapper.source).toContain('const Button = React.forwardRef<');
    expect(wrapper.source).toContain('const DefaultButton = React.forwardRef<');
  });

  it('preserves an existing React namespace and accepts React 17 forwardRef plus pinned icons', () => {
    const source =
      'import * as React from "react"\n' +
      'import { Search } from "lucide-react"\n' +
      'export const Trigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(\n' +
      '  (props, ref) => <button {...props} ref={ref}><Search /></button>\n' +
      ')\n';
    const result = normalizeRegistrySource({
      source,
      registrySourcePath: 'registry/base-nova/ui/trigger.tsx'
    });

    expect(result.source.match(/import \* as React from "react"/g)).toHaveLength(1);
    expect(result.source).toContain('React.forwardRef<HTMLButtonElement');
    expect(externalImports(result.source)).toEqual(['lucide-react', 'react']);
  });

  it('converts exported Base UI wrappers to React 17 forwardRef exactly once', () => {
    const source =
      'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
      'function Button({ className, ...props }: ButtonPrimitive.Props) {\n' +
      '  return <ButtonPrimitive className={className} {...props} />\n' +
      '}\n' +
      'export { Button }\n';
    const first = normalizeRegistrySource({
      source,
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });
    const rerun = normalizeRegistrySource({
      source: first.source,
      registrySourcePath: 'registry/base-nova/ui/button.tsx'
    });

    expect(first.transformations).toContain('react17-forward-ref-public-wrappers');
    expect(first.source).toContain('const Button = React.forwardRef<');
    expect(first.source).toContain('HTMLButtonElement');
    expect(first.source).toContain('}, ref) {');
    expect(first.source).toContain('<ButtonPrimitive\n    ref={ref}');
    expect(rerun.source).toBe(first.source);
  });

  it('uses the Base UI 1.6 root DOM contract for Checkbox and Switch refs', () => {
    for (const [name, primitive] of [
      ['Checkbox', 'CheckboxPrimitive'],
      ['Switch', 'SwitchPrimitive']
    ]) {
      const result = normalizeRegistrySource({
        source:
          `import { ${name} as ${primitive} } from "@base-ui/react/${name.toLowerCase()}"\n` +
          `function ${name}({ ...props }: ${primitive}.Root.Props) {\n` +
          `  return <${primitive}.Root {...props} />\n` +
          '}\n' +
          `export { ${name} }\n`,
        registrySourcePath: `registry/base-nova/ui/${name.toLowerCase()}.tsx`
      });

      expect(result.source).toContain(`const ${name} = React.forwardRef<\n  HTMLElement,`);
      expect(result.source).not.toContain('React.forwardRef<\n  HTMLButtonElement,');
    }
  });

  it('rejects any registry identity outside the exact ordered allowlist', () => {
    expect(() => assertRegistryIds([...REGISTRY_IDS])).not.toThrow();
    expect(() => assertRegistryIds([...REGISTRY_IDS].reverse())).toThrow('Registry allowlist');
    expect(() => assertRegistryIds([...REGISTRY_IDS.slice(0, -1), '../escape'])).toThrow('Registry allowlist');
  });

  it('resolves icon placeholders to sorted pinned Lucide imports and rejects unpinned placeholders', () => {
    const source =
      'import { IconPlaceholder } from "@/registry/base-nova/ui/icon-placeholder"\n' +
      'export function Icons({ className, ...props }: React.ComponentProps<"svg">) {\n' +
      '  return <div><IconPlaceholder lucide="Search" tabler="IconSearch" data-slot="search" role="img" className={className} {...props} /><IconPlaceholder lucide="Check" /></div>\n' +
      '}\n';
    const result = normalizeRegistrySource({
      source,
      registrySourcePath: 'registry/base-nova/ui/icons.tsx'
    });

    expect(result.transformations).toContain('resolve-lucide-icon-placeholders');
    expect(result.source).toContain('import { Check, Search } from "lucide-react"');
    expect(result.source).toContain('<Search\n    ref={ref} data-slot="search" role="img" className={className} {...props} />');
    expect(result.source).toContain('<Check />');
    expect(result.source).not.toContain('IconPlaceholder');
    expect(result.source).not.toContain('tabler=');
    expect(externalImports(result.source)).toEqual(['lucide-react', 'react']);

    expect(() =>
      normalizeRegistrySource({
        source:
          'import { IconPlaceholder } from "@/registry/base-nova/ui/icon-placeholder"\n' +
          'export const Icon = () => <IconPlaceholder />\n',
        registrySourcePath: 'registry/base-nova/ui/icon.tsx'
      })
    ).toThrow('does not declare a pinned Lucide icon');
  });

  it('rejects hostile aliases, icon placeholders, automatic JSX, and React 18/19 APIs', async () => {
    for (const fixture of await guardFixtures()) {
      expect(
        () => assertReact17Source(fixture.source, `tests/fixtures/ui-profile/${fixture.name.replaceAll(' ', '-')}.tsx`),
        fixture.name
      ).toThrow(fixture.message);
    }
  });

  it('allows the React 17 use-sync-external-store shim without trusting React.useSyncExternalStore', () => {
    const compatible =
      'import { useSyncExternalStore } from "use-sync-external-store/shim"\n' + 'export { useSyncExternalStore }\n';
    expect(() => assertReact17Source(compatible, 'compatible.ts')).not.toThrow();
    expect(externalImports(compatible)).toEqual(['use-sync-external-store']);

    expect(() =>
      assertReact17Source('import { useSyncExternalStore } from "react"\nexport { useSyncExternalStore }\n', 'incompatible.ts')
    ).toThrow('useSyncExternalStore');
  });

  it('rejects forbidden React APIs in default-plus-named imports', () => {
    expect(() =>
      assertReact17Source('import React, { useId } from "react"\nexport { React, useId }\n', 'mixed-react.ts')
    ).toThrow('useId');
    expect(() =>
      assertReact17Source(
        'import ReactDOM, { createRoot } from "react-dom"\nexport { ReactDOM, createRoot }\n',
        'mixed-react-dom.ts'
      )
    ).toThrow('createRoot');
  });

  it('does not reject React-like symbol names imported from non-React modules', () => {
    const compatible =
      'import { startTransition, useId } from "./compatibility-layer"\n' +
      'import Runtime from "custom-renderer"\n' +
      'Runtime.createRoot(host)\n' +
      'export { startTransition, useId }\n';
    expect(() => assertReact17Source(compatible, 'compatible-symbols.ts')).not.toThrow();
    expect(externalImports(compatible)).toEqual(['custom-renderer']);
  });

  it('extracts package identities from scoped, subpath, side-effect, and type imports', () => {
    const source =
      'import type { Props } from "@base-ui/react/select"\n' +
      'import { mergeProps } from "@base-ui/utils/merge-props"\n' +
      'import "unscoped/theme.css"\n' +
      'const lazy = import("vite/client")\n' +
      'const loaded = require("@scope/runtime/subpath")\n' +
      'const resolved = require.resolve("resolved-package/entry")\n' +
      'import { local } from "./local"\n';
    expect(externalImports(source)).toEqual([
      '@base-ui/react',
      '@base-ui/utils',
      '@scope/runtime',
      'resolved-package',
      'unscoped',
      'vite'
    ]);
  });

  it('fails closed for computed dynamic dependencies', () => {
    expect(() => assertReact17Source('const module = import(name)\n', 'dynamic.ts')).toThrow('non-literal dynamic dependency');
    expect(() => assertReact17Source('const module = require(name)\n', 'require.ts')).toThrow('non-literal dynamic dependency');
  });

  it('rejects literal React 18 entrypoints and CommonJS React 18 APIs', () => {
    for (const source of [
      'const client = import("react-dom/client")\n',
      'const client = require.resolve("react-dom/client")\n',
      'const React = require("react")\nReact.useId()\n',
      'const { useId: makeId } = require("react")\nmakeId()\n',
      'require("react-dom").createRoot(host)\n'
    ]) {
      expect(() => assertReact17Source(source, 'commonjs.ts')).toThrow();
    }
  });

  it('rejects computed, optional, aliased, destructured, and parenthesized React 18 API access', () => {
    for (const source of [
      'import React from "react"\nReact["useId"]()\n',
      'import React from "react"\nReact?.useId()\n',
      'import React from "react"\nconst { useId = undefined } = React\n',
      'import React from "react"\nconst Runtime = React\nRuntime.useId()\n',
      'import React from "react"\nlet Runtime\nRuntime = React\nRuntime.useId()\n',
      'import React from "react"\nconst Runtime = { ...React }\n',
      'const React = await import("react")\nReact.useId()\n',
      '(require("react-dom")).createRoot(host)\n',
      'export { useId } from "react"\n'
    ]) {
      expect(() => assertReact17Source(source, 'adversarial.ts')).toThrow();
    }
    expect(() => assertReact17Source('import React from "react"\nReact[method]()\n', 'computed-namespace.ts')).toThrow(
      'computed react namespace access'
    );
  });

  it('ignores React-like text in comments and string literals', () => {
    const compatible =
      '// import { useId } from "react"\n' +
      'const examples = ["require(name)", "React.useId()", "react-dom/client"]\n' +
      'export { examples }\n';
    expect(() => assertReact17Source(compatible, 'comments-and-strings.ts')).not.toThrow();
  });
});

describe('synthetic 1,940-option cardinality fixture', () => {
  it('contains exactly 1,940 unique stable option identities, labels, and values', () => {
    expect(FONT_OPTION_COUNT).toBe(1_940);
    expect(FONT_OPTIONS).toHaveLength(1_940);
    expect(new Set(FONT_OPTIONS.map((option: { id: string }) => option.id)).size).toBe(1_940);
    expect(new Set(FONT_OPTIONS.map((option: { label: string }) => option.label)).size).toBe(1_940);
    expect(new Set(FONT_OPTIONS.map((option: { value: string }) => option.value)).size).toBe(1_940);
    expect(FONT_OPTIONS[0]).toEqual({ id: 'font-family-0001', label: 'Font Family 0001', value: 'Font Family 1' });
    expect(FONT_OPTIONS[1_939]).toEqual({
      id: 'font-family-1940',
      label: 'Font Family 1940',
      value: 'Font Family 1940'
    });
  });
});
