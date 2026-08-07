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

  it('preserves a semicolon-terminated use-client directive before inserted imports', () => {
    const result = normalizeRegistrySource({
      source: '"use client";\n\nexport const Empty = () => <>empty</>\n',
      registrySourcePath: 'registry/base-nova/ui/empty.tsx'
    });

    expect(result.source).toMatch(/^"use client";\n\nimport \* as React from "react"\n/u);
  });

  it('preserves the complete directive prologue after triple-slash references', () => {
    const result = normalizeRegistrySource({
      source:
        '/// <reference types="react" />\n' +
        '"use strict";\n' +
        "'use client'\n" +
        '"custom profile directive";\n\n' +
        'export const Empty = () => <>empty</>\n',
      registrySourcePath: 'registry/base-nova/ui/empty.tsx'
    });

    expect(result.source).toMatch(
      /^\/\/\/ <reference types="react" \/>\n"use strict";\n'use client'\n"custom profile directive";\n\nimport \* as React from "react"\n/u
    );
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

  it('resolves chained local props aliases before normalizing ref-bearing wrappers', () => {
    const result = normalizeRegistrySource({
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'type PrimitiveProps = ButtonPrimitive.Props\n' +
        'type ProbeProps = PrimitiveProps\n' +
        'function Probe({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }\n' +
        'export { Probe }\n',
      registrySourcePath: 'registry/base-nova/ui/probe.tsx'
    });

    expect(result.source).toContain('const Probe = React.forwardRef<');
    expect(result.source).toContain('React.PropsWithoutRef<ProbeProps>');
  });

  it('resolves merged interface heritage before normalizing ref-bearing wrappers', () => {
    const result = normalizeRegistrySource({
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'interface ProbeProps extends ButtonPrimitive.Props {}\n' +
        'interface ProbeProps { disabled?: boolean }\n' +
        'function Probe({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }\n' +
        'export { Probe }\n',
      registrySourcePath: 'registry/base-nova/ui/probe.tsx'
    });

    expect(result.source).toContain('const Probe = React.forwardRef<');
    expect(result.source).toContain('React.PropsWithoutRef<ProbeProps>');
  });

  it('does not resolve qualified type names through same-named local aliases', () => {
    const result = normalizeRegistrySource({
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'type PrimitiveProps = ButtonPrimitive.Props\n' +
        'function Probe(props: Namespace.PrimitiveProps) { return <ButtonPrimitive {...props} /> }\n' +
        'export { Probe }\n',
      registrySourcePath: 'registry/base-nova/ui/probe.tsx'
    });

    expect(result.source).toContain('function Probe(props: Namespace.PrimitiveProps)');
    expect(result.source).not.toContain('React.forwardRef');
  });

  it('fails closed for identifier-parameter wrappers with direct or aliased ref-bearing props', () => {
    for (const [alias, propsType] of [
      ['', 'ButtonPrimitive.Props'],
      ['type ProbeProps = ButtonPrimitive.Props\n', 'ProbeProps']
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            alias +
            `function Probe(props: ${propsType}) { return <ButtonPrimitive {...props} /> }\n` +
            'export { Probe }\n',
          registrySourcePath: 'registry/base-nova/ui/probe.tsx'
        })
      ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
    }
  });

  it('fails closed for direct or aliased import-type ref-bearing props', () => {
    for (const [alias, propsType] of [
      ['', 'import("@base-ui/react/button").Button.Props'],
      ['type ProbeProps = import("@base-ui/react/button").Button.Props\n', 'ProbeProps']
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            alias +
            `function Probe(props: ${propsType}) { return <ButtonPrimitive {...props} /> }\n` +
            'export { Probe }\n',
          registrySourcePath: 'registry/base-nova/ui/probe.tsx'
        })
      ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
    }
  });

  it('fails closed for named React component-props helper imports and aliases', () => {
    for (const [reactImport, propsType] of [
      ['import type { ComponentProps } from "react"\n', 'ComponentProps<typeof ButtonPrimitive>'],
      ['import type { ComponentProps as PrimitiveProps } from "react"\n', 'PrimitiveProps<typeof ButtonPrimitive>']
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            reactImport +
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            `function Probe(props: ${propsType}) { return <ButtonPrimitive {...props} /> }\n` +
            'export { Probe }\n',
          registrySourcePath: 'registry/base-nova/ui/probe.tsx'
        })
      ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
    }
  });

  it('fails closed instead of reconstructing unsupported function declaration shapes', () => {
    for (const declaration of [
      'async function Probe({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }',
      'function* Probe({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }',
      'function Probe<T>({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }',
      'function Probe({ ...props }: ProbeProps, context: unknown) { return <ButtonPrimitive {...props} /> }',
      'function Probe({ ...props }: ProbeProps = {} as ProbeProps) { return <ButtonPrimitive {...props} /> }',
      'function Probe({ ...props }: ProbeProps): React.ReactElement\n' +
        'function Probe({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }'
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            'type ProbeProps = ButtonPrimitive.Props\n' +
            `${declaration}\nexport { Probe }\n`,
          registrySourcePath: 'registry/base-nova/ui/probe.tsx'
        })
      ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
    }
  });

  it('ignores TypeScript this parameters when inspecting ref-bearing props', () => {
    for (const [declaration, message] of [
      [
        'function Probe(this: void, props: ProbeProps) { return <ButtonPrimitive {...props} /> }; export { Probe }',
        'public ref-bearing wrapper Probe is not normalized with React.forwardRef'
      ],
      [
        'export const Probe = function (this: void, props: ProbeProps) { return <ButtonPrimitive {...props} /> }',
        'public ref-bearing function-expression wrapper Probe is not normalized with React.forwardRef'
      ]
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            'type ProbeProps = ButtonPrimitive.Props\n' +
            `${declaration}\n`,
          registrySourcePath: 'registry/base-nova/ui/probe.tsx'
        })
      ).toThrow(message);
    }
  });

  it('fails closed for exported arrow ref wrappers that the normalizer cannot safely rewrite', () => {
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'export const Probe = ({ ...props }: ButtonPrimitive.Props) => <ButtonPrimitive {...props} />\n'
      })
    ).toThrow('public ref-bearing arrow wrapper Probe is not normalized with React.forwardRef');
  });

  it('tracks renamed props bindings through normalization and fail-closed guards', () => {
    const normalized = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'export function Probe({ className, ...rest }: ButtonPrimitive.Props) { return <ButtonPrimitive className={className} {...rest} /> }\n'
    });
    expect(normalized.source).toContain('const Probe = React.forwardRef<');
    expect(normalized.source).toContain('ref={ref}');
    expect(normalized.source).toContain('{...rest}');

    const defaultNormalized = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'export default function DefaultProbe({ ...rest }: ButtonPrimitive.Props) { return <ButtonPrimitive {...rest} /> }\n'
    });
    expect(defaultNormalized.source).toContain('const DefaultProbe = React.forwardRef<');
    expect(defaultNormalized.source).toContain('export default DefaultProbe');

    const useRenderNormalized = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source:
        'import { useRender } from "@base-ui/react/use-render"\n' +
        'export function Probe({ ...rest }: useRender.ComponentProps<"button">) { return useRender({ props: rest }) }\n'
    });
    expect(useRenderNormalized.source).toContain('const Probe = React.forwardRef<');
    expect(useRenderNormalized.source).toContain('return useRender({ ref,');

    for (const [declaration, message] of [
      [
        'function Probe(rest: ButtonPrimitive.Props) { return <ButtonPrimitive {...rest} /> }; export { Probe }',
        'public ref-bearing wrapper Probe is not normalized with React.forwardRef'
      ],
      [
        'export const Probe = ({ ...rest }: ButtonPrimitive.Props) => <ButtonPrimitive {...rest} />',
        'public ref-bearing arrow wrapper Probe is not normalized with React.forwardRef'
      ],
      [
        'export const Probe = function ({ ...rest }: ButtonPrimitive.Props) { return <ButtonPrimitive {...rest} /> }',
        'public ref-bearing function-expression wrapper Probe is not normalized with React.forwardRef'
      ],
      [
        'export default function ({ ...rest }: ButtonPrimitive.Props) { return <ButtonPrimitive {...rest} /> }',
        'anonymous default-exported ref-bearing function wrapper is not normalized with React.forwardRef'
      ],
      [
        'export default ({ ...rest }: ButtonPrimitive.Props) => <ButtonPrimitive {...rest} />',
        'anonymous default-exported ref-bearing arrow wrapper is not normalized with React.forwardRef'
      ]
    ]) {
      expect(() =>
        normalizeRegistrySource({
          registrySourcePath: 'registry/base-nova/ui/probe.tsx',
          source: `import { Button as ButtonPrimitive } from "@base-ui/react/button"\n${declaration}\n`
        })
      ).toThrow(message);
    }

    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'export function Probe({ ...rest }: ButtonPrimitive.Props) {\n' +
          '  const example = "<ButtonPrimitive {...rest} />"\n' +
          '  function nested() { return <ButtonPrimitive {...rest} /> }\n' +
          '  return <div data-example={example} />\n' +
          '}\n'
      })
    ).not.toThrow();

    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'export function Probe({ ...rest }: ButtonPrimitive.Props) {\n' +
          '  return <><ButtonPrimitive {...rest} /><ButtonPrimitive {...rest} /></>\n' +
          '}\n'
      })
    ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');

    for (const body of [
      'if (fallback) { const rest = other; return <ButtonPrimitive {...rest} /> } return <div />',
      'try { return <div /> } catch (rest) { return <ButtonPrimitive {...rest} /> }',
      'for (const rest of [other]) { return <ButtonPrimitive {...rest} /> } return <div />',
      'switch (kind) { case "other": const rest = other; return <ButtonPrimitive {...rest} />; default: return <div /> }',
      'if (fallback) { const ref = internalRef; return <ButtonPrimitive ref={ref} {...rest} /> } return <div />',
      'return <ButtonPrimitive ref={internalRef} {...rest} />'
    ]) {
      expect(() =>
        normalizeRegistrySource({
          registrySourcePath: 'registry/base-nova/ui/probe.tsx',
          source:
            'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
            'declare const fallback: boolean\n' +
            'declare const kind: string\n' +
            'declare const other: ButtonPrimitive.Props\n' +
            'declare const internalRef: React.Ref<HTMLButtonElement>\n' +
            `export function Probe({ ...rest }: ButtonPrimitive.Props) { ${body} }\n`
        })
      ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
    }

    const alreadyForwarded = normalizeRegistrySource({
      registrySourcePath: 'registry/base-nova/ui/probe.tsx',
      source:
        'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
        'export function Probe({ ref, ...rest }: ButtonPrimitive.Props) { return <ButtonPrimitive ref={ref} {...rest} /> }\n'
    });
    expect(alreadyForwarded.source).toContain('function Probe({ ...rest }, ref)');
    expect(alreadyForwarded.source).toContain('ref={ref}');
  });

  it('fails closed for exported variable wrappers with aliased ref-bearing props', () => {
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'type ProbeProps = ButtonPrimitive.Props\n' +
          'export const Probe = ({ ...props }: ProbeProps) => <ButtonPrimitive {...props} />\n'
      })
    ).toThrow('public ref-bearing arrow wrapper Probe is not normalized with React.forwardRef');
  });

  it('fails closed for exported function-expression ref wrappers', () => {
    for (const declaration of [
      'export const Probe = function ({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> }',
      'const Probe = function NamedProbe({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> }; export { Probe }',
      'const Probe = function Probe({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> }; export { Probe }'
    ]) {
      expect(() =>
        normalizeRegistrySource({
          registrySourcePath: 'registry/base-nova/ui/probe.tsx',
          source: `import { Button as ButtonPrimitive } from "@base-ui/react/button"\n${declaration}\n`
        })
      ).toThrow('public ref-bearing function-expression wrapper Probe is not normalized with React.forwardRef');
    }
  });

  it('fails closed for overloaded wrappers with aliased ref-bearing props', () => {
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'type ProbeProps = ButtonPrimitive.Props\n' +
          'function Probe(props: ProbeProps): React.ReactElement\n' +
          'function Probe(props: ProbeProps) { return <ButtonPrimitive {...props} /> }\n' +
          'export { Probe }\n'
      })
    ).toThrow('public ref-bearing wrapper Probe is not normalized with React.forwardRef');
  });

  it('does not let nested shadow bindings mask exported variable wrappers', () => {
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'type ProbeProps = ButtonPrimitive.Props\n' +
          'export const Probe = ({ ...props }: ProbeProps) => {\n' +
          '  function helper() { const Probe = (value: string) => value; return Probe("nested") }\n' +
          '  helper()\n' +
          '  return <ButtonPrimitive {...props} />\n' +
          '}\n'
      })
    ).toThrow('public ref-bearing arrow wrapper Probe is not normalized with React.forwardRef');
  });

  it('fails closed for default-exported variable ref wrappers', () => {
    for (const [declaration, message] of [
      [
        'const Probe = ({ ...props }: ButtonPrimitive.Props) => <ButtonPrimitive {...props} />',
        'public ref-bearing arrow wrapper Probe is not normalized with React.forwardRef'
      ],
      [
        'const Probe = function NamedProbe({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> }',
        'public ref-bearing function-expression wrapper Probe is not normalized with React.forwardRef'
      ]
    ]) {
      expect(() =>
        normalizeRegistrySource({
          registrySourcePath: 'registry/base-nova/ui/probe.tsx',
          source: 'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' + `${declaration}\nexport default Probe\n`
        })
      ).toThrow(message);
    }
  });

  it('fails closed for anonymous default ref-bearing wrappers', () => {
    for (const [declaration, kind] of [
      ['export default function ({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> }', 'function'],
      [
        'type ProbeProps = ButtonPrimitive.Props\nexport default async function ({ ...props }: ProbeProps) { return <ButtonPrimitive {...props} /> }',
        'function'
      ],
      ['export default ({ ...props }: ButtonPrimitive.Props) => <ButtonPrimitive {...props} />', 'arrow'],
      [
        'export default (function Internal({ ...props }: ButtonPrimitive.Props) { return <ButtonPrimitive {...props} /> })',
        'function-expression'
      ],
      [
        'import { useRender } from "@base-ui/react/use-render"\nexport default function (props: useRender.ComponentProps<"button">) { return useRender({ props }) }',
        'function'
      ]
    ]) {
      expect(() =>
        normalizeRegistrySource({
          registrySourcePath: 'registry/base-nova/ui/probe.tsx',
          source: `import { Button as ButtonPrimitive } from "@base-ui/react/button"\n${declaration}\n`
        })
      ).toThrow(`anonymous default-exported ref-bearing ${kind} wrapper is not normalized with React.forwardRef`);
    }

    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'export default function ({ ...props }: { disabled?: boolean }) { return <ButtonPrimitive {...props} /> }\n'
      })
    ).not.toThrow();
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source:
          'import * as React from "react"\n' +
          'import { Button as ButtonPrimitive } from "@base-ui/react/button"\n' +
          'export default React.forwardRef<HTMLButtonElement, ButtonPrimitive.Props>(function Probe(props, ref) { return <ButtonPrimitive ref={ref} {...props} /> })\n'
      })
    ).not.toThrow();
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

  it('rewrites only actual icon placeholder JSX and preserves placeholder-looking text', () => {
    const placeholder = '<IconPlaceholder lucide="Search" />';
    const source =
      'import { IconPlaceholder } from "@/registry/base-nova/ui/icon-placeholder"\n' +
      `const single = '${placeholder}'\n` +
      `const double = "${placeholder.replaceAll('"', '\\"')}"\n` +
      `const template = \`${placeholder}\`\n` +
      `// ${placeholder}\n` +
      `/* ${placeholder} */\n` +
      'export const Icon = () => <IconPlaceholder lucide="Search" aria-label={single} />\n';

    const result = normalizeRegistrySource({
      source,
      registrySourcePath: 'registry/base-nova/ui/icon.tsx'
    });

    expect(result.source).toContain('import { Search } from "lucide-react"');
    expect(result.source).toContain(`const single = '${placeholder}'`);
    expect(result.source).toContain(`const double = "${placeholder.replaceAll('"', '\\"')}"`);
    expect(result.source).toContain(`const template = \`${placeholder}\``);
    expect(result.source).toContain(`// ${placeholder}`);
    expect(result.source).toContain(`/* ${placeholder} */`);
    expect(result.source).toContain('<Search aria-label={single} />');
  });

  it('ignores import-looking comments and fails closed for unsupported actual placeholders', () => {
    const commentOnly = normalizeRegistrySource({
      source:
        '// import { IconPlaceholder } from "@/registry/base-nova/ui/icon-placeholder"\n' +
        'export const text = "<IconPlaceholder lucide=\\"Search\\" />"\n',
      registrySourcePath: 'registry/base-nova/ui/icon.tsx'
    });
    expect(commentOnly.transformations).not.toContain('resolve-lucide-icon-placeholders');

    for (const placeholder of [
      '<IconPlaceholder lucide="Search"></IconPlaceholder>',
      '<IconPlaceholder lucide={iconName} />',
      '<IconPlaceholder lucide="Search" lucide="Check" />'
    ]) {
      expect(() =>
        normalizeRegistrySource({
          source:
            'import { IconPlaceholder } from "@/registry/base-nova/ui/icon-placeholder"\n' +
            `export const Icon = () => ${placeholder}\n`,
          registrySourcePath: 'registry/base-nova/ui/icon.tsx'
        })
      ).toThrow(/unresolved IconPlaceholder|does not declare a pinned Lucide icon/u);
    }
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
      'import Legacy = require("legacy-package/subpath")\n' +
      'export { helper } from "exported-package/subpath"\n' +
      'type Deferred = typeof import("type-expression-package/subpath")\n' +
      'const lazy = import("vite/client")\n' +
      'const loaded = require("@scope/runtime/subpath")\n' +
      'const resolved = require.resolve("resolved-package/entry")\n' +
      'import { local } from "./local"\n';
    expect(externalImports(source)).toEqual([
      '@base-ui/react',
      '@base-ui/utils',
      '@scope/runtime',
      'exported-package',
      'legacy-package',
      'resolved-package',
      'type-expression-package',
      'unscoped',
      'vite'
    ]);
  });

  it('ignores import-like comments and runtime strings when inventorying dependencies', () => {
    const source =
      '// import "comment-package"\n' +
      '/* export { helper } from "@comment/package" */\n' +
      'const fromText = \'from "runtime-package/subpath"\'\n' +
      'const importText = \'import("runtime-dynamic-package")\'\n' +
      'const requireText = \'require("@runtime/package")\'\n' +
      'const resolveText = \'require.resolve("runtime-resolved-package")\'\n' +
      'import "actual-package/subpath"\n';

    expect(externalImports(source)).toEqual(['actual-package']);
  });

  it('fails closed for computed dynamic dependencies', () => {
    expect(() => assertReact17Source('const module = import(name)\n', 'dynamic.ts')).toThrow('non-literal dynamic dependency');
    expect(() => assertReact17Source('const module = require(name)\n', 'require.ts')).toThrow('non-literal dynamic dependency');
  });

  it('rejects indirect CommonJS loaders before they can bypass the React 17 guard or dependency inventory', () => {
    const aliasedRequire = 'const load = require\nconst React = load("react")\nReact.useId()\n';
    const moduleRequire = 'const React = module.require("react")\nReact.useId()\n';

    for (const source of [aliasedRequire, moduleRequire]) {
      expect(() => assertReact17Source(source, 'indirect-commonjs.ts')).toThrow();
      expect(() => externalImports(source)).toThrow();
    }
    expect(() => assertReact17Source(aliasedRequire, 'aliased-require.ts')).toThrow(
      'indirect or unsupported require binding use is not accepted'
    );
    expect(() => assertReact17Source(moduleRequire, 'module-require.ts')).toThrow(
      'CommonJS global module is not accepted in generated ESM source'
    );
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

  it('ignores legacy icon references in comments and literal text', () => {
    const compatible =
      '// migrate Icons.Search\n' +
      '/* preserve Icons.Check */\n' +
      "const single = 'Icons.Search'\n" +
      'const note = "Icons.Search"\n' +
      'const template = `Icons.Check`\n' +
      'const keyed = { "Icons.Search": true }\n' +
      'export { single, note, template, keyed }\n';
    expect(() => assertReact17Source(compatible, 'legacy-icon-text.ts')).not.toThrow();
  });

  it('rejects actual legacy icon namespace accesses across supported syntax forms', () => {
    for (const source of [
      'export const Icon = Icons.Search\n',
      'export const Icon = Icons?.Search\n',
      'export const Icon = (Icons as any).Search\n',
      'export const Icon = Icons["Search"]\n',
      'export const Icon = () => <Icons.Search />\n',
      'export const note = `icon: ${Icons.Search}`\n',
      'export type Icon = Icons.Search\n'
    ]) {
      expect(() => assertReact17Source(source, 'legacy-icon-access.tsx')).toThrow(
        'unresolved alias or icon placeholder remains after normalization'
      );
    }
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
