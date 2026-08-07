import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { prefixTailwindClassCandidates } from '../packages/ui-profile/scripts/lib/profile.mjs';

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
      prefixTailwindClassCandidates('import { cn } from "./lib/utils";\n<div className={cn(active && "flex", fallback)} />')
        .source
    ).toBe('import { cn } from "./lib/utils";\n<div className={cn(active && "skui:flex", fallback)} />');
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
    expect(css).not.toContain('.flex{');
  });
});
