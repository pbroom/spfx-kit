import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import {
  normalizeRegistrySource,
  prefixTailwindClassCandidates,
  tailwindCompilerClosureSha256
} from '../packages/ui-profile/scripts/lib/profile.mjs';

const require = createRequire(import.meta.url);
const tailwindCli = path.join(path.dirname(require.resolve('@tailwindcss/cli/package.json')), 'dist', 'index.mjs');

describe('UI profile Tailwind prefix normalization', () => {
  it('places the prefix before variants, arbitrary selectors, groups, and containers', () => {
    const source = `
      import { cva } from "class-variance-authority"
      const variants = cva("group/menu @container/pane flex", {
        variants: {
          state: {
            open: "group-data-open/menu:bg-primary @md/pane:flex-row",
          },
        },
        defaultVariants: { state: "open" },
      })
      const value = <div className="hover:bg-primary data-[side=bottom]:slide-in-from-top-2 [&_svg]:size-4" />
    `;

    const result = prefixTailwindClassCandidates(source);

    expect(result.source).toContain('"skui:group/menu skui:@container/pane skui:flex"');
    expect(result.source).toContain('"skui:group-data-open/menu:bg-primary skui:@md/pane:flex-row"');
    expect(result.source).toContain(
      'className="skui:hover:bg-primary skui:data-[side=bottom]:slide-in-from-top-2 skui:[&_svg]:size-4"'
    );
    expect(result.source).toContain('defaultVariants: { state: "open" }');
  });

  it('removes shadcn configuration markers and retains owned static utilities', () => {
    const source = '<div className="cn-menu-target cn-menu-translucent cn-rtl-flip cn-font-heading no-scrollbar animate-spin" />';

    expect(prefixTailwindClassCandidates(source).source).toBe(
      '<div className="skui:font-heading skui:no-scrollbar skui:animate-spin" />'
    );
  });

  it('applies shadcn marker policy to the utility after Tailwind variants', () => {
    expect(
      prefixTailwindClassCandidates(
        '<div className="dark:cn-font-heading sm:cn-menu-target hover:font-medium [&:focus]:cn-font-heading" />'
      ).source
    ).toBe('<div className="skui:dark:font-heading skui:hover:font-medium skui:[&:focus]:font-heading" />');
    expect(() => prefixTailwindClassCandidates('<div className="hover:cn-future-marker" />')).toThrow(
      'unsupported shadcn class marker cn-future-marker'
    );
    expect(prefixTailwindClassCandidates('<div className="dark:cn-font-heading! sm:cn-menu-target!" />').source).toBe(
      '<div className="skui:dark:font-heading!" />'
    );
    expect(prefixTailwindClassCandidates('<div className="dark:!cn-font-heading !cn-menu-target" />').source).toBe(
      '<div className="skui:dark:!font-heading" />'
    );
    expect(() => prefixTailwindClassCandidates('<div className="hover:cn-future-marker!" />')).toThrow(
      'unsupported shadcn class marker cn-future-marker'
    );
    expect(() => prefixTailwindClassCandidates('<div className="hover:!cn-future-marker" />')).toThrow(
      'unsupported shadcn class marker cn-future-marker'
    );
    expect(() => prefixTailwindClassCandidates('<div className="dark:cn-font-heading/50" />')).toThrow(
      'shadcn class marker modifiers are not accepted for cn-font-heading'
    );
    expect(() => prefixTailwindClassCandidates('<div className="dark:cn-future-marker/50" />')).toThrow(
      'unsupported shadcn class marker cn-future-marker'
    );
    const once = prefixTailwindClassCandidates('<div className="skui:dark:cn-font-heading" />').source;
    expect(once).toBe('<div className="skui:dark:font-heading" />');
    expect(prefixTailwindClassCandidates(once)).toEqual({ source: once, transformed: false });
  });

  it('is idempotent for already-prefixed generated source', () => {
    const once = prefixTailwindClassCandidates('<div className="flex data-open:animate-in" />').source;
    const twice = prefixTailwindClassCandidates(once);

    expect(twice.source).toBe(once);
    expect(twice.transformed).toBe(false);
  });

  it('prefixes static conditional and logical class branches', () => {
    expect(prefixTailwindClassCandidates('<div className={active ? "flex" : "hidden"} />').source).toBe(
      '<div className={active ? "skui:flex" : "skui:hidden"} />'
    );
    expect(
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils";\nexport function Probe({ className }) { return <div className={cn(active && "flex", className)} /> }'
      ).source
    ).toContain('cn(active && "skui:flex", className)');
  });

  it('fails closed when a generated class branch is dynamic', () => {
    expect(() => prefixTailwindClassCandidates('<div className={getClass()} />')).toThrow(
      'dynamic class expressions are not accepted'
    );
    expect(() => prefixTailwindClassCandidates('<div className={flag ? "flex" : getClass()} />')).toThrow(
      'dynamic class expressions are not accepted'
    );
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; export function Probe({ className }) { return <div className={cn(flag && getClass(), className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; export function Probe({ className }) { return <div className={cn(flag || "flex", className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; const fallback = getClass(); export function Probe({ className }) { return <div className={cn(fallback, className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; let styles = cva("flex"); styles = () => getClass(); <div className={styles()} />'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; const styles = cva("flex"); export function Probe(styles) { return <div className={styles()} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe({ className }) { className = getClass(); return <div className={className} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');

    expect(
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; const className = "unrelated"; export function Probe({ className: rootClass }) { return <div className={cn("flex", rootClass)} /> }'
      ).source
    ).toContain('cn("skui:flex", rootClass)');
  });

  it('normalizes static consumer class defaults and rejects dynamic defaults', () => {
    expect(
      prefixTailwindClassCandidates('export function Probe({ className = "flex" }) { return <div className={className} /> }')
        .source
    ).toContain('className = "skui:flex"');
    expect(
      prefixTailwindClassCandidates(
        'export function Probe({ className: rootClass = "hidden" }) { return <div className={rootClass} /> }'
      ).source
    ).toContain('rootClass = "skui:hidden"');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe({ className = getClass() }) { return <div className={className} /> }')
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe({ className: rootClass = getClass() }) { return <div className={rootClass} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(
      prefixTailwindClassCandidates(
        'export function Probe({ className } = { className: "block" }) { return <div className={className} /> }'
      ).source
    ).toContain('{ className: "skui:block" }');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe({ className } = { className: getClass() }) { return <div className={className} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe({ className } = getProps()) { return <div className={className} /> }')
    ).toThrow('consumer className default must be a static object or class value');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe({ className } = { __proto__: { className: "flex" } }) { return <div className={className} /> }'
      )
    ).toThrow('consumer className default must be a static object or class value');
    expect(prefixTailwindClassCandidates('function helper({ className = getClass() }) { return null }').source).toBe(
      'function helper({ className = getClass() }) { return null }'
    );
  });

  it('does not trust bare parameters named className as consumer class strings', () => {
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; export function Probe(...className) { return <div className={cn(className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; export function Probe(className) { return <div className={cn(className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
  });

  it('normalizes cva factory class overrides and rejects ambiguous override sources', () => {
    const prefix = 'import { cva } from "class-variance-authority"; const styles = cva("flex"); ';

    expect(prefixTailwindClassCandidates(`${prefix}<div className={styles({ className: "hidden" })} />`).source).toContain(
      'styles({ className: "skui:hidden" })'
    );
    expect(prefixTailwindClassCandidates(`${prefix}<div className={styles({ class: "block" })} />`).source).toContain(
      'styles({ class: "skui:block" })'
    );
    expect(() => prefixTailwindClassCandidates(`${prefix}<div className={styles({ className: getClass() })} />`)).toThrow(
      'dynamic class expressions are not accepted'
    );
    expect(() => prefixTailwindClassCandidates(`${prefix}<div className={styles({ ...props })} />`)).toThrow(
      'cva factory props contain an ambiguous class source'
    );
    expect(() => prefixTailwindClassCandidates(`${prefix}<div className={styles(props)} />`)).toThrow(
      'cva factory props must be a single static object literal'
    );
    expect(() => prefixTailwindClassCandidates(`${prefix}<div className={styles({ [key]: "hidden" })} />`)).toThrow(
      'cva factory props contain an ambiguous class source'
    );
    expect(() =>
      prefixTailwindClassCandidates(`${prefix}<div className={styles({ "__proto__": { className: "hidden" } })} />`)
    ).toThrow('cva factory props contain an ambiguous class source');

    expect(
      prefixTailwindClassCandidates(
        `${prefix}export function Probe({ className, variant, size }) { return <div className={styles({ variant, size, className })} /> }`
      ).source
    ).toContain('styles({ variant, size, className })');
  });

  it('rejects unsupported imported cva access paths', () => {
    expect(() =>
      prefixTailwindClassCandidates('import * as CVA from "class-variance-authority"; export const styles = CVA.cva("flex")')
    ).toThrow('class-variance-authority namespace and default imports are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; const make = cva; export const styles = make("flex")'
      )
    ).toThrow('imported cva binding is used through an unsupported access path');
    expect(
      prefixTailwindClassCandidates(
        'import { cva as make } from "class-variance-authority"; export const styles = (make)("flex")'
      ).source
    ).toContain('(make)("skui:flex")');
    expect(
      prefixTailwindClassCandidates(
        'import type * as CVA from "class-variance-authority"; export type Props = CVA.VariantProps<() => string>'
      ).source
    ).toContain('import type * as CVA');
    expect(() =>
      prefixTailwindClassCandidates('import { cva } from "class-variance-authority"; export const bound = cva.bind(null)')
    ).toThrow('imported cva binding is used through an unsupported access path');
    expect(() => prefixTailwindClassCandidates('import { cva } from "class-variance-authority"; export { cva }')).toThrow(
      'imported cva binding cannot be re-exported'
    );
    expect(() => prefixTailwindClassCandidates('export { cva } from "class-variance-authority"')).toThrow(
      'class-variance-authority value re-exports are not accepted'
    );
    expect(() => prefixTailwindClassCandidates('export * as CVA from "class-variance-authority"')).toThrow(
      'class-variance-authority value re-exports are not accepted'
    );
    expect(
      prefixTailwindClassCandidates(
        'export type { VariantProps } from "class-variance-authority"; export type Props = { value: string }'
      ).source
    ).toContain('export type { VariantProps }');
    expect(() =>
      prefixTailwindClassCandidates('import CVA = require("class-variance-authority"); export const styles = CVA.cva("flex")')
    ).toThrow('class-variance-authority value ImportEquals declarations are not accepted');
    expect(() =>
      prefixTailwindClassCandidates('const { cva } = require("class-variance-authority"); export const styles = cva("flex")')
    ).toThrow('class-variance-authority require acquisition is not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'export async function styles() { const { cva } = await import("class-variance-authority"); return cva("flex") }'
      )
    ).toThrow('class-variance-authority dynamic-import acquisition is not accepted');
    expect(
      prefixTailwindClassCandidates(
        'import type CVA = require("class-variance-authority"); export type Props = CVA.VariantProps<() => string>'
      ).source
    ).toContain('import type CVA = require');
    expect(() =>
      prefixTailwindClassCandidates('import { cva } from "class-variance-authority"; export const leaked = eval("cva")')
    ).toThrow('direct eval with imported class helpers is not accepted');
  });

  it('normalizes explicit className values in object APIs', () => {
    expect(prefixTailwindClassCandidates('useRender({ props: { className: "flex" } })').source).toContain(
      'className: "skui:flex"'
    );
    expect(
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; export function Probe({ className }) { return mergeProps({ className: cn("flex", className) }, props) }'
      ).source
    ).toContain('className: cn("skui:flex", className)');
    expect(() => prefixTailwindClassCandidates('mergeProps({ className: getClass() }, props)')).toThrow(
      'dynamic class expressions are not accepted'
    );
    expect(() => prefixTailwindClassCandidates('mergeProps({ className: "flex", ...shared }, props)')).toThrow(
      'className object contains an ambiguous class source'
    );
    expect(() => prefixTailwindClassCandidates('mergeProps({ ["className"]: "flex" }, props)')).toThrow(
      'className object contains an ambiguous class source'
    );
    expect(() => prefixTailwindClassCandidates('mergeProps({ className() { return "flex" } }, props)')).toThrow(
      'className object contains an ambiguous class source'
    );
    expect(
      prefixTailwindClassCandidates('mergeProps({ className: "flex", onClick() {}, ["role"]: "button" }, props)').source
    ).toContain('className: "skui:flex"');
    expect(
      prefixTailwindClassCandidates('export function Probe({ className }) { return mergeProps({ className }, props) }').source
    ).toContain('mergeProps({ className }, props)');
  });

  it('fails closed for hidden class sources in imported Base UI prop APIs', () => {
    const mergeImport = 'import { mergeProps } from "@base-ui/react/merge-props"; ';
    const renderImport = 'import { useRender } from "@base-ui/react/use-render"; ';

    expect(() =>
      prefixTailwindClassCandidates(`${mergeImport}const key = "className"; mergeProps({ [key]: "flex" }, props)`)
    ).toThrow('class-bearing prop bag contains an ambiguous computed property');
    expect(() => prefixTailwindClassCandidates(`${mergeImport}mergeProps({ ...shared }, props)`)).toThrow(
      'class-bearing prop bag contains an ambiguous spread'
    );
    expect(() => prefixTailwindClassCandidates(`${renderImport}useRender({ props: { ...shared } })`)).toThrow(
      'class-bearing prop bag contains an ambiguous spread'
    );
    expect(() => prefixTailwindClassCandidates(`${renderImport}useRender({ ...options })`)).toThrow(
      'useRender options contain an ambiguous props source'
    );
    expect(() =>
      prefixTailwindClassCandidates(`${mergeImport}const mp = mergeProps; const key = "className"; mp({ [key]: "flex" }, props)`)
    ).toThrow('imported mergeProps binding is used through an unsupported access path');
    expect(() => prefixTailwindClassCandidates(`${mergeImport}mergeProps.call(null, { className: "flex" }, props)`)).toThrow(
      'imported mergeProps binding is used through an unsupported access path'
    );
    expect(() =>
      prefixTailwindClassCandidates(
        `${mergeImport}export function Probe(props) { const mp = eval("mergeProps"); return mp({ className: "flex" }, props) }`
      )
    ).toThrow('direct eval with imported class helpers is not accepted');
    expect(() => prefixTailwindClassCandidates(`${mergeImport}class Bridge extends mergeProps {}`)).toThrow(
      'imported mergeProps binding is used through an unsupported access path'
    );
    expect(() => prefixTailwindClassCandidates(`${renderImport}const render = useRender; render({ props })`)).toThrow(
      'imported useRender binding is used through an unsupported access path'
    );
    expect(() =>
      prefixTailwindClassCandidates(
        'import * as Merge from "@base-ui/react/merge-props"; Merge.mergeProps({ className: "flex" }, props)'
      )
    ).toThrow('@base-ui/react/merge-props namespace and default imports are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'const { mergeProps } = require("@base-ui/react/merge-props"); mergeProps({ className: "flex" }, props)'
      )
    ).toThrow('@base-ui/react/merge-props require acquisition is not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import Merge = require("@base-ui/react/merge-props"); Merge.mergeProps({ className: "flex" }, props)'
      )
    ).toThrow('@base-ui/react/merge-props value ImportEquals declarations are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'export { mergeProps } from "@base-ui/react/merge-props"; export { useRender } from "@base-ui/react/use-render"'
      )
    ).toThrow('@base-ui/react/merge-props value re-exports are not accepted');
    expect(() =>
      prefixTailwindClassCandidates('import { mergeProps } from "@base-ui/react/merge-props"; export { mergeProps }')
    ).toThrow('imported Base UI class helper binding cannot be re-exported');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { mergeProps as mp } from "@base-ui/react/merge-props"; const key = "className"; mp({ [key]: "flex" }, props)'
      )
    ).toThrow('class-bearing prop bag contains an ambiguous computed property');
    expect(
      prefixTailwindClassCandidates(
        `${mergeImport}export function Probe({ ...props }) { return mergeProps({ ...{ className: "flex" } }, props) }`
      ).source
    ).toContain('className: "skui:flex"');

    const badgeShape = `
      import { mergeProps } from "@base-ui/react/merge-props"
      import { useRender } from "@base-ui/react/use-render"
      import { cn } from "./lib/utils"
      export function Badge({ className, ...props }) {
        return useRender({
          props: mergeProps({ className: cn("flex", className) }, props),
        })
      }
    `;
    expect(prefixTailwindClassCandidates(badgeShape).source).toContain('className: cn("skui:flex", className)');
  });

  it('prefixes imported cn calls outside JSX and cva compound variants', () => {
    const source = `
      import { cn } from "./lib/utils"
      import { cva } from "class-variance-authority"
      const root = cn("flex")
      const variants = cva(["block", "items-center"], {
        compoundVariants: [{ intent: "primary", className: ["hover:bg-primary", "text-sm"] }],
      })
    `;

    const result = prefixTailwindClassCandidates(source).source;
    expect(result).toContain('cn("skui:flex")');
    expect(result).toContain('cva(["skui:block", "skui:items-center"]');
    expect(result).toContain('className: ["skui:hover:bg-primary", "skui:text-sm"]');
  });

  it('rejects unsupported imported cn acquisition and access paths', () => {
    expect(() => prefixTailwindClassCandidates('import { cn } from "./lib/utils"; const join = cn; join("flex")')).toThrow(
      'imported cn binding is used through an unsupported access path'
    );
    expect(() => prefixTailwindClassCandidates('const { cn } = require("./lib/utils"); cn("flex")')).toThrow(
      './lib/utils require acquisition is not accepted'
    );
    expect(() => prefixTailwindClassCandidates('import { cn } from "./lib/utils"; export { cn }')).toThrow(
      'imported cn binding cannot be re-exported'
    );
    expect(
      prefixTailwindClassCandidates('import type { ClassValue } from "./lib/utils"; export type Props = ClassValue').source
    ).toContain('import type { ClassValue }');
  });

  it('rejects ambiguous cva option and compound-variant properties', () => {
    const importedCva = 'import { cva } from "class-variance-authority"; ';

    expect(() => prefixTailwindClassCandidates(`${importedCva}cva("block", { ...sharedOptions })`)).toThrow(
      'cva options must use unique static properties'
    );
    expect(() =>
      prefixTailwindClassCandidates(`${importedCva}cva("block", { variants: {}, variants: { size: { sm: "flex" } } })`)
    ).toThrow('cva options must use unique static properties');
    expect(() =>
      prefixTailwindClassCandidates(`${importedCva}cva("block", { compoundVariants: [{ size: "sm", ...sharedVariant }] })`)
    ).toThrow('cva compoundVariants contain an ambiguous class source');
    expect(() => prefixTailwindClassCandidates(`${importedCva}cva("block", { [optionsKey]: sharedOptions })`)).toThrow(
      'cva options must use unique static properties'
    );
  });

  it('normalizes static JSX spread classes and rejects ambiguous spread sources', () => {
    expect(prefixTailwindClassCandidates('<div {...{ className: "flex", role: "group" }} />').source).toBe(
      '<div {...{ className: "skui:flex", role: "group" }} />'
    );
    expect(() => prefixTailwindClassCandidates('<div {...{ className: getClass() }} />')).toThrow(
      'dynamic class expressions are not accepted'
    );
    expect(() => prefixTailwindClassCandidates('<div {...{ ...sharedProps }} />')).toThrow(
      'JSX spread contains an ambiguous class source'
    );
    expect(() => prefixTailwindClassCandidates('<div {...sharedProps} />')).toThrow(
      'JSX spread must be a consumer prop bag or static object literal'
    );
    expect(prefixTailwindClassCandidates('export function Probe(props) { return <div {...props} /> }').source).toContain(
      '<div {...props} />'
    );
    expect(
      prefixTailwindClassCandidates('export function Probe({ className, ...rest }) { return <div {...rest} /> }').source
    ).toContain('<div {...rest} />');
    expect(
      prefixTailwindClassCandidates('export function Probe(props) { return <div data-id={props.id} {...props} /> }').source
    ).toContain('data-id={props.id} {...props}');
    expect(
      prefixTailwindClassCandidates(
        'export function Probe(props) { const { id } = props; const [first] = props; return <div data-id={id ?? first} {...props} /> }'
      ).source
    ).toContain('data-id={id ?? first} {...props}');
    expect(
      prefixTailwindClassCandidates(
        'export function Probe(props) { let id, first; ({ id } = props); [first] = props; return <div data-id={id ?? first} {...props} /> }'
      ).source
    ).toContain('data-id={id ?? first} {...props}');
    expect(
      prefixTailwindClassCandidates(
        'export function Probe(props) { return <><div {...(props)} /><div {...(props as Props)} /><div {...(props satisfies Props)} /></> }'
      ).source
    ).toContain('<div {...(props satisfies Props)} />');
    expect(
      prefixTailwindClassCandidates('export function Probe(props) { return <div {...{ ...(props as Props) }} /> }').source
    ).toContain('<div {...{ ...(props as Props) }} />');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { props = getProps(); return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props = { className: "flex" }) { return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { props.className = "flex"; return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { delete props.className; return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { mutate(props); return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { let alias; alias = props; return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { props.mutate(); return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { props["mutate"](); return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { props.mutate?.(); return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe(props) { const alias = props; alias.className = "flex"; return <div {...props} /> }'
      )
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe(props) { Object.assign(props, { className: "flex" }); return <div {...props} /> }'
      )
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates('export function Probe(props) { arguments[0].className = "flex"; return <div {...props} /> }')
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates(
        'export const Probe = (props) => { eval("props.className = \'flex\'"); return <div {...props} /> }'
      )
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
    expect(() =>
      prefixTailwindClassCandidates(
        'export const Probe = (props) => { ((eval))("props.className = \'flex\'"); return <div {...props} /> }'
      )
    ).toThrow('JSX spread must be a consumer prop bag or static object literal');
  });

  it('fails closed when a cva conditional or logical branch can produce a dynamic class', () => {
    const importedCva = 'import { cva } from "class-variance-authority"; ';

    expect(() => prefixTailwindClassCandidates(`${importedCva}cva(flag && getClass())`)).toThrow(
      'cva class values must be static strings or arrays'
    );
    expect(() => prefixTailwindClassCandidates(`${importedCva}cva(flag ? "flex" : getClass())`)).toThrow(
      'cva class values must be static strings or arrays'
    );
    expect(() =>
      prefixTailwindClassCandidates(`${importedCva}cva("flex", { variants: { size: { small: flag && getClass() } } })`)
    ).toThrow('cva class values must be static strings or arrays');

    expect(prefixTailwindClassCandidates(`${importedCva}cva(flag && "flex")`).source).toContain('cva(flag && "skui:flex")');
  });

  it('preserves safe literal quoting for arbitrary selectors', () => {
    expect(prefixTailwindClassCandidates(`<div className='[&[data-x="y"]]:flex' />`).source).toBe(
      `<div className='skui:[&[data-x="y"]]:flex' />`
    );
  });

  it('prefixes class selectors embedded in arbitrary variants', () => {
    const once = prefixTailwindClassCandidates(
      `<div className="[&>.sr-only]:w-auto [.border-b]:pb-2 [.border-t]:pt-2 [&>svg:not([class*='size-'])]:size-4" />`
    ).source;

    expect(once).toBe(
      `<div className="skui:[&>.skui\\:sr-only]:w-auto skui:[.skui\\:border-b]:pb-2 skui:[.skui\\:border-t]:pt-2 skui:[&>svg:not([class*='size-'])]:size-4" />`
    );
    expect(prefixTailwindClassCandidates(once)).toEqual({ source: once, transformed: false });

    expect(prefixTailwindClassCandidates('<div className="group-[.active]/card:block" />').source).toBe(
      '<div className="skui:group-[.skui\\:active]/card:block" />'
    );
    expect(prefixTailwindClassCandidates('<div className="supports-[background-image:url(icon.svg)]:block" />').source).toBe(
      '<div className="skui:supports-[background-image:url(icon.svg)]:block" />'
    );
    expect(
      prefixTailwindClassCandidates(
        `<div className="sr-only flex nth-[2n+1_of_.flex]:block [&>[class~='sr-only']]:w-auto [&>[class='flex']]:grid" />`
      ).source
    ).toBe(
      `<div className="skui:sr-only skui:flex skui:nth-[2n+1_of_.skui\\:flex]:block skui:[&>[class~='skui:sr-only']]:w-auto skui:[&>[class='skui:flex']]:grid" />`
    );
    expect(prefixTailwindClassCandidates('<div className="nth-last-[3_of_.flex]:hidden" />').source).toBe(
      '<div className="skui:nth-last-[3_of_.skui\\:flex]:hidden" />'
    );
  });

  it('does not trust callback destructuring as public component props', () => {
    expect(() =>
      prefixTailwindClassCandidates(
        'const entries = getEntries(); export function Probe() { return entries.map(({ className }) => <div className={className} />) }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    const callbackProps =
      'const entries = getEntries(); export function Probe() { return entries.map((props) => <div {...props} />) }';
    expect(() => prefixTailwindClassCandidates(callbackProps)).toThrow(
      'source-owned callback props cannot be used as a JSX prop bag'
    );
    expect(() =>
      normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: callbackProps })
    ).toThrow('source-owned callback props cannot be used as a JSX prop bag');
    const fakeMemo =
      'const helper = { memo(render) { return render(getProps()) } }; ' +
      'export const Probe = helper.memo(({ className }) => <div className={className} />)';
    expect(() => prefixTailwindClassCandidates(fakeMemo)).toThrow('dynamic class expressions are not accepted');
    expect(() => normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: fakeMemo })).toThrow(
      'dynamic class expressions are not accepted'
    );
    const shadowedMemo =
      'import { memo } from "react"; function wrap(memo) { ' +
      'return memo(({ className }) => <div className={className} />) }; export const Probe = wrap(helper)';
    expect(() => prefixTailwindClassCandidates(shadowedMemo)).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: shadowedMemo })
    ).toThrow('dynamic class expressions are not accepted');
    const shadowedNamespace =
      'import * as React from "react"; function seed() { const R = React }; const R = helper; ' +
      'export const Probe = R.memo(({ className }) => <div className={className} />)';
    expect(() => prefixTailwindClassCandidates(shadowedNamespace)).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: shadowedNamespace })
    ).toThrow('dynamic class expressions are not accepted');
    for (const mutatedReactWrapper of [
      'import React from "react"; const R: any = React; R.memo = (render) => render(getProps()); export const Probe = R.memo(({ className }) => <div className={className} />)',
      'import React from "react"; const R = React; (R as any)["forwardRef"] = (render) => render(getProps()); export const Probe = R.forwardRef(({ className }, ref) => <div ref={ref} className={className} />)',
      'import React from "react"; const R = React; const Alias = R; (R as any).memo = helper; export const Probe = Alias.memo(({ className }) => <div className={className} />)',
      'import { memo } from "react"; (memo as any) = helper; export const Probe = memo(({ className }) => <div className={className} />)'
    ]) {
      expect(() => prefixTailwindClassCandidates(mutatedReactWrapper)).toThrow('dynamic class expressions are not accepted');
      expect(() =>
        normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: mutatedReactWrapper })
      ).toThrow('dynamic class expressions are not accepted');
    }
    const immutableDefaultReactAlias =
      'import React from "react"; const R = React; export const Probe = R.memo(({ className }) => <div className={className} />)';
    expect(prefixTailwindClassCandidates(immutableDefaultReactAlias).source).toContain('className={className}');
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source: immutableDefaultReactAlias
      })
    ).not.toThrow();
    const unexportedAssignment =
      'let Probe; Probe = ({ className }) => <div className={className} />; ' +
      'export function Outer() { return Probe(getProps()) }';
    expect(() => prefixTailwindClassCandidates(unexportedAssignment)).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      normalizeRegistrySource({
        registrySourcePath: 'registry/base-nova/ui/probe.tsx',
        source: unexportedAssignment
      })
    ).toThrow('dynamic class expressions are not accepted');
    for (const unexportedDeclaration of [
      'function Probe({ className }) { return <div className={className} /> } export function Outer() { return Probe(window.getProps()) }',
      'const Probe = ({ className }) => <div className={className} />; export function Outer() { return Probe(window.getProps()) }',
      'export function Probe({ className }) { return <div className={className} /> } export function Outer() { return Probe(window.getProps()) }'
    ]) {
      expect(() => prefixTailwindClassCandidates(unexportedDeclaration)).toThrow('dynamic class expressions are not accepted');
      expect(() =>
        normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: unexportedDeclaration })
      ).toThrow('dynamic class expressions are not accepted');
    }
    expect(
      prefixTailwindClassCandidates(
        'function Probe({ className }) { return <div className={className} /> } export function Outer() { return <Probe /> }'
      ).source
    ).toContain('className={className}');
    expect(() =>
      prefixTailwindClassCandidates(
        'function Probe({ className }) { return <div className={className} /> } export function Outer() { return <><Probe />{Probe(window.getProps())}</> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    for (const escapedComponent of [
      'const Invoke = Probe; Invoke(window.getProps())',
      'const invoke = Probe; invoke(window.getProps())',
      'Probe.call(null, window.getProps())',
      'Probe.apply(null, [window.getProps()])',
      'window.items.map(Probe)',
      'eval("Probe")(window.getProps())'
    ]) {
      expect(() =>
        prefixTailwindClassCandidates(
          `function Probe({ className }) { return <div className={className} /> } export function Outer() { return <Probe /> } ${escapedComponent}`
        )
      ).toThrow('dynamic class expressions are not accepted');
    }
    expect(
      prefixTailwindClassCandidates('function Probe({ className }) { return <div className={className} /> } export default Probe')
        .source
    ).toContain('className={className}');
    for (const escapedWrapper of [
      'import { memo } from "react"; export const Probe = memo(function Inner({ className }) { if (window.recur) return Inner(window.getProps()); return <div className={className} /> })',
      'import * as React from "react"; export const Probe = React.memo(({ className }) => <div className={className} />); Probe.type(window.getProps())',
      'import * as React from "react"; export const Probe = React.forwardRef(({ className }, ref) => <div ref={ref} className={className} />); Probe.render(window.getProps(), null)',
      'import * as React from "react"; export const Parts = { Probe: React.memo(({ className }) => <div className={className} />), attack() { return this.Probe.type(window.getProps()) } }',
      'import * as React from "react"; export const Parts = { Probe: React.forwardRef(({ className }, ref) => <div ref={ref} className={className} />), attack() { return this.Probe.render(window.getProps(), null) } }',
      'import * as React from "react"; export default { Probe: React.memo(({ className }) => <div className={className} />), attack() { return this.Probe.type(window.getProps()) } }',
      'import * as React from "react"; export default { nested: { Probe: React.forwardRef(({ className }, ref) => <div ref={ref} className={className} />), attack() { return this.Probe.render(window.getProps(), null) } } }',
      'import * as React from "react"; export const Probe = React.memo(({ className }) => <div className={className} />); const { type: Invoke } = Probe; Invoke(window.getProps())',
      'import * as React from "react"; export const Probe = React.forwardRef(({ className }, ref) => <div ref={ref} className={className} />); const Alias = Probe; const { render: Invoke } = Alias; Invoke(window.getProps(), null)',
      'import * as React from "react"; export const Parts = { Probe: React.memo(({ className }) => <div className={className} />) }; const { Probe: { type: Invoke } } = Parts; Invoke(window.getProps())'
    ]) {
      expect(() => prefixTailwindClassCandidates(escapedWrapper)).toThrow('dynamic class expressions are not accepted');
      expect(() =>
        normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: escapedWrapper })
      ).toThrow('dynamic class expressions are not accepted');
    }
    for (const aliasInitializer of ['Inner', '(Inner)', 'Inner as C', 'Inner satisfies C', 'Inner!']) {
      const defaultAliasWrapper =
        'import * as React from "react"; const Inner = ({ className }) => <div className={className} />; ' +
        `type C = typeof Inner; const Alias = ${aliasInitializer}; export default React.memo(Alias)`;
      expect(prefixTailwindClassCandidates(defaultAliasWrapper).source).toContain('className={className}');
      expect(() =>
        normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: defaultAliasWrapper })
      ).not.toThrow();
    }
    const safeWrapperObject =
      'import * as React from "react"; export const Parts = { label: "safe", Probe: React.memo(({ className }) => <div className={className} />), describe() { return this.label } }';
    expect(prefixTailwindClassCandidates(safeWrapperObject).source).toContain('className={className}');
    expect(() =>
      normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: safeWrapperObject })
    ).not.toThrow();
    const safeNestedWrapperObject =
      'import * as React from "react"; export const Parts = { nested: { Probe: React.memo(({ className }) => <div className={className} />) }, other: { Probe: "safe" }, describe() { return this.other.Probe } }';
    expect(prefixTailwindClassCandidates(safeNestedWrapperObject).source).toContain('className={className}');
    expect(() =>
      normalizeRegistrySource({ registrySourcePath: 'registry/base-nova/ui/probe.tsx', source: safeNestedWrapperObject })
    ).not.toThrow();
    expect(
      prefixTailwindClassCandidates('export function Probe({ className }) { return <div className={className} /> }').source
    ).toContain('className={className}');
    for (const metadataAssignment of [
      'Probe.displayName = "Probe"',
      'Probe["displayName"] = "Probe"',
      'import * as PropTypes from "prop-types"; Probe.propTypes = { className: PropTypes.string, options: PropTypes.shape({ className: PropTypes.string }).isRequired }',
      'Probe.contextType = Context'
    ]) {
      expect(
        prefixTailwindClassCandidates(
          `export function Probe({ className }) { return <div className={className} /> } ${metadataAssignment}`
        ).source
      ).toContain('className={className}');
    }
    expect(
      prefixTailwindClassCandidates(
        'import * as React from "react"; export const Probe = React.forwardRef(function Probe({ className }, ref) { return <div ref={ref} className={className} /> }); Probe.displayName = "Probe"'
      ).source
    ).toContain('className={className}');
    expect(() =>
      prefixTailwindClassCandidates(
        'export function Probe({ className }) { return <div className={className} /> } Probe.defaultProps = { className: "flex" }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    for (const metadataInvocation of [
      'Probe.displayName()',
      'Probe["displayName"]?.()',
      'Probe.propTypes.call(null, window.getProps())',
      'new Probe.contextType()'
    ]) {
      expect(() =>
        prefixTailwindClassCandidates(
          `export function Probe({ className }) { return <div className={className} /> } ${metadataInvocation}`
        )
      ).toThrow('dynamic class expressions are not accepted');
    }
    for (const executableMetadata of [
      'Probe.propTypes = (() => { mount(React.createElement("div", { className: "flex" })); return {} })() as any',
      'Probe.propTypes = evil({ className: "flex" }) as any',
      'Probe.propTypes = (() => ({ className: getClass() })) as any',
      'Probe.propTypes = { validator: evil({ className: getClass() }) } as any',
      'Probe.propTypes = { get className() { return "flex" } } as any'
    ]) {
      expect(() =>
        prefixTailwindClassCandidates(
          `export function Probe({ className }) { return <div className={className} /> } ${executableMetadata}`
        )
      ).toThrow('dynamic class expressions are not accepted');
    }
    expect(prefixTailwindClassCandidates('export function Probe(props) { return <div {...props} /> }').source).toContain(
      '<div {...props} />'
    );
    expect(
      prefixTailwindClassCandidates(
        'import * as React from "react"; export const Probe = React.forwardRef(function Probe({ className }, ref) { return <div ref={ref} className={className} /> })'
      ).source
    ).toContain('className={className}');
  });

  it('rejects computed or concatenated profile-owned class strings', () => {
    expect(() => prefixTailwindClassCandidates('<div className={`flex ${size}`} />')).toThrow(
      'computed template class names are not accepted'
    );
    expect(() => prefixTailwindClassCandidates('<div className={"flex " + size} />')).toThrow(
      'concatenated class names are not accepted'
    );
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; const x = cva("flex", { variants: getVariants() })'
      )
    ).toThrow('cva variants must be a static object literal');
    expect(() =>
      prefixTailwindClassCandidates('import { cn } from "./lib/utils"; <div className={cn({ flex: active })} />')
    ).toThrow('cn object and array class maps are not accepted');
  });

  it('uses imported helper identity and rejects shadowed bindings', () => {
    expect(prefixTailwindClassCandidates('const cn = (value) => value; const result = cn("flex")').source).toContain(
      'cn("flex")'
    );
    expect(() =>
      prefixTailwindClassCandidates('import { cn } from "./lib/utils"; function render(cn) { return cn("flex") }')
    ).toThrow('imported class helper binding is shadowed: cn');
  });

  it('fails closed on unknown shadcn configuration markers', () => {
    expect(() => prefixTailwindClassCandidates('<div className="cn-future-marker flex" />')).toThrow(
      'unsupported shadcn class marker cn-future-marker'
    );
  });

  it('matches the pinned Tailwind 4 prefix grammar and ignores unprefixed candidates', () => {
    const css = execFileSync(
      process.execPath,
      [tailwindCli, '-i', 'tests/fixtures/ui-profile/tailwind-prefix-contract.css', '-o', '-', '--minify', '--silent'],
      { cwd: path.resolve('.'), encoding: 'utf8' }
    );

    expect(css).toContain('.skui\\:flex{display:flex}');
    expect(css).toContain('.skui\\:group-data-\\[state\\=open\\]\\/menu\\:bg-primary');
    expect(css).toContain('.skui\\:\\@container\\/pane');
    expect(css).toContain('@container pane (min-width:28rem)');
    expect(css).toContain('>.skui\\:sr-only');
    expect(css).toContain('.skui\\:border-b{');
    expect(css).toContain('.skui\\:border-t{');
    expect(css).not.toContain('>.sr-only');
    expect(css).not.toContain('.flex{');
  });

  it('binds the complete Tailwind compiler lock closure', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const provenance = JSON.parse(readFileSync('packages/ui-profile/provenance.json', 'utf8'));
    const roots = Object.keys(provenance.cssToolchain);
    const digest = tailwindCompilerClosureSha256(lock, roots);

    expect(digest).toBe(provenance.tailwindCompilerClosureSha256);

    const transitiveDrift = structuredClone(lock);
    transitiveDrift.packages['node_modules/magic-string'].version = '0.30.22';
    expect(tailwindCompilerClosureSha256(transitiveDrift, roots)).not.toBe(digest);

    const unrelatedDrift = structuredClone(lock);
    unrelatedDrift.packages['node_modules/not-in-the-tailwind-closure'] = {
      version: '1.0.0',
      integrity: 'sha512-unrelated'
    };
    expect(tailwindCompilerClosureSha256(unrelatedDrift, roots)).toBe(digest);
  });
});
