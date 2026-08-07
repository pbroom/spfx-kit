import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { prefixTailwindClassCandidates, tailwindCompilerClosureSha256 } from '../packages/ui-profile/scripts/lib/profile.mjs';

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
        'import { cn } from "./lib/utils";\nfunction Probe({ className }) { return <div className={cn(active && "flex", className)} /> }'
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
        'import { cn } from "./lib/utils"; function Probe({ className }) { return <div className={cn(flag && getClass(), className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; function Probe({ className }) { return <div className={cn(flag || "flex", className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; const fallback = getClass(); function Probe({ className }) { return <div className={cn(fallback, className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; let styles = cva("flex"); styles = () => getClass(); <div className={styles()} />'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cva } from "class-variance-authority"; const styles = cva("flex"); function Probe(styles) { return <div className={styles()} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'function Probe({ className }) { className = getClass(); return <div className={className} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');

    expect(
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; const className = "unrelated"; function Probe({ className: rootClass }) { return <div className={cn("flex", rootClass)} /> }'
      ).source
    ).toContain('cn("skui:flex", rootClass)');
  });

  it('normalizes static consumer class defaults and rejects dynamic defaults', () => {
    expect(
      prefixTailwindClassCandidates('function Probe({ className = "flex" }) { return <div className={className} /> }').source
    ).toContain('className = "skui:flex"');
    expect(
      prefixTailwindClassCandidates(
        'function Probe({ className: rootClass = "hidden" }) { return <div className={rootClass} /> }'
      ).source
    ).toContain('rootClass = "skui:hidden"');
    expect(() =>
      prefixTailwindClassCandidates('function Probe({ className = getClass() }) { return <div className={className} /> }')
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'function Probe({ className: rootClass = getClass() }) { return <div className={rootClass} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(
      prefixTailwindClassCandidates(
        'function Probe({ className } = { className: "block" }) { return <div className={className} /> }'
      ).source
    ).toContain('{ className: "skui:block" }');
    expect(() =>
      prefixTailwindClassCandidates(
        'function Probe({ className } = { className: getClass() }) { return <div className={className} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates('function Probe({ className } = getProps()) { return <div className={className} /> }')
    ).toThrow('consumer className default must be a static object or class value');
    expect(() =>
      prefixTailwindClassCandidates(
        'function Probe({ className } = { __proto__: { className: "flex" } }) { return <div className={className} /> }'
      )
    ).toThrow('consumer className default must be a static object or class value');
    expect(prefixTailwindClassCandidates('function helper({ className = getClass() }) { return null }').source).toBe(
      'function helper({ className = getClass() }) { return null }'
    );
  });

  it('does not trust bare parameters named className as consumer class strings', () => {
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; function Probe(...className) { return <div className={cn(className)} /> }'
      )
    ).toThrow('dynamic class expressions are not accepted');
    expect(() =>
      prefixTailwindClassCandidates(
        'import { cn } from "./lib/utils"; function Probe(className) { return <div className={cn(className)} /> }'
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
        `${prefix}function Probe({ className, variant, size }) { return <div className={styles({ variant, size, className })} /> }`
      ).source
    ).toContain('styles({ variant, size, className })');
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
