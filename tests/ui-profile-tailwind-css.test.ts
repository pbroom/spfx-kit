import { appendFile, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { compileTailwindCss, verifyTailwindCss } from '../packages/ui-profile/scripts/lib/compile-tailwind-css.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { auditScopedTailwindCss, scopeTailwindCss } from '../packages/ui-profile/scripts/lib/scope-tailwind-css.mjs';
// @ts-expect-error plain .mjs module without type declarations
import { canonicalJson } from '../packages/ui-profile/scripts/lib/profile.mjs';

const packageRoot = path.resolve('packages/ui-profile');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'spfx-ui-css-test-'));
  temporaryRoots.push(root);
  return root;
}

async function readContract() {
  const [profileBytes, provenanceBytes] = await Promise.all([
    readFile(path.join(packageRoot, 'profile.json')),
    readFile(path.join(packageRoot, 'provenance.json'))
  ]);
  return {
    profile: JSON.parse(profileBytes.toString('utf8')),
    provenance: JSON.parse(provenanceBytes.toString('utf8'))
  };
}

const rawFixture = String.raw`
  /* compiler comments and URLs must not survive: https://tailwindcss.com */
  @layer properties {
    * { --tw-erased: 0; }
  }
  @layer theme {
    :root, :host {
      --tw-origin: 0;
      --animate-enter: enter 150ms ease-out;
    }
  }
  @layer base {
    *, html, body { box-sizing: border-box; }
  }
  @layer utilities {
    .skui\:flex:hover, .skui\:block[data-state="open"] {
      transform: translateX(var(--tw-origin));
      animation: enter 150ms ease-out;
    }
    .skui\:block { container: pane / inline-size; }
    @media (min-width: 10rem) {
      @supports (display: grid) {
        @container pane (min-width: 8rem) {
          .skui\:hidden { display: none; }
        }
      }
    }
  }
  @property --tw-origin {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
  }
  @keyframes enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

describe('UI profile deterministic Tailwind CSS compiler', () => {
  it('scopes selectors, roots, properties, and keyframes without retaining global CSS', () => {
    const scopeValue = 'skui-0123456789abcdef';
    const result = scopeTailwindCss({
      rawCss: rawFixture,
      scopeValue,
      candidates: ['skui:flex', 'skui:block', 'skui:hidden']
    });

    expect(result.keyframeCount).toBe(1);
    expect(result.containerCount).toBe(1);
    expect(result.fallbackPropertyCount).toBe(2);
    expect(result.css).toContain(`[data-spfx-ui-scope="${scopeValue}"]`);
    expect(result.css).toContain(
      `@scope ([data-spfx-ui-scope="${scopeValue}"]) to ([data-spfx-ui-scope]:not([data-spfx-ui-scope="${scopeValue}"]))`
    );
    expect(result.css).toContain(`@keyframes ${scopeValue}-enter`);
    expect(result.css).toContain(`@container ${scopeValue}-container-pane`);
    expect(result.css).toContain(`animation: ${scopeValue}-enter 150ms ease-out`);
    expect(result.css).toContain(`--${scopeValue}-tw-origin`);
    expect(result.css).not.toMatch(/(?:^|[,{])\s*(?:\*|html|body|:root|:host)(?:\s|[,{])/u);
    expect(result.css).not.toContain('@layer base');
    expect(result.css).not.toContain('@layer properties');
    expect(result.css).not.toContain('@property');
    expect(result.css).not.toContain('--tw-');
    expect(result.css).not.toContain('https://');
  });

  it('emits both scope-root and descendant utility selectors', () => {
    const scopeValue = 'skui-0123456789abcdef';
    const scope = `[data-spfx-ui-scope="${scopeValue}"]`;
    const result = scopeTailwindCss({
      rawCss: String.raw`
        .skui\:flex, button.skui\:block, *.skui\:hidden { display: block }
        .parent .skui\:block { display: block }
      `,
      scopeValue,
      candidates: ['skui:flex', 'skui:block', 'skui:hidden'],
      allowedClasses: ['skui:flex', 'skui:block', 'skui:hidden', 'parent']
    });

    expect(result.css).toContain(`${scope} .skui\\:flex`);
    expect(result.css).toContain(`${scope}.skui\\:flex`);
    expect(result.css).toContain(`button${scope}.skui\\:block`);
    expect(result.css).toContain(`*${scope}.skui\\:hidden`);
    expect(result.css).toContain(`${scope}.parent .skui\\:block`);
    expect(result.css).not.toContain(`${scope}button`);
  });

  it('fails closed on unsafe selectors, missing candidates, and asset references', () => {
    expect(() =>
      scopeTailwindCss({
        rawCss: '@layer theme { .host :root { --color: red } }',
        scopeValue: 'skui-0123456789abcdef'
      })
    ).toThrow('Root selector must be the complete selector');

    expect(() =>
      scopeTailwindCss({
        rawCss: String.raw`.skui\:flex { display: flex }`,
        scopeValue: 'skui-0123456789abcdef',
        candidates: ['skui:flex', 'skui:hidden']
      })
    ).toThrow('Tailwind candidate did not emit a positive selector: skui:hidden');

    expect(() =>
      scopeTailwindCss({
        rawCss: String.raw`.skui\:flex { background-image: url("./asset.svg") }`,
        scopeValue: 'skui-0123456789abcdef',
        candidates: ['skui:flex']
      })
    ).toThrow('CSS asset function is not accepted: url');
  });

  it('rejects sibling escapes, global at-rules, escaped values, and unowned animations', () => {
    const scopeValue = 'skui-0123456789abcdef';
    for (const rawCss of [
      String.raw`:root + .skui\:flex { display: flex }`,
      String.raw`+ .skui\:flex { display: flex }`,
      String.raw`~ .skui\:flex { display: flex }`
    ]) {
      expect(() => scopeTailwindCss({ rawCss, scopeValue, candidates: ['skui:flex'] })).toThrow();
    }
    for (const rawCss of [
      String.raw`@IMPORT "./late.css"; .skui\:flex { display: flex }`,
      String.raw`@font-face { font-family: local-font; src: local(local-font) } .skui\:flex { display: flex }`,
      String.raw`.skui\:flex { background: image-set("./asset.svg" 1x) }`,
      String.raw`.skui\:flex { background: u\72l("//evil.invalid/pixel") }`,
      String.raw`.skui\:flex { --\000074w-leak: 1 }`,
      String.raw`.skui\:flex { content: "/Users/alice/private.css" }`,
      String.raw`.skui\:flex { --probe: /Users/alice/private.css }`,
      String.raw`.skui\:flex { animation: host-global 1s }`,
      String.raw`.skui\:flex { -webkit-animation: host-global 1s }`
    ]) {
      expect(() => scopeTailwindCss({ rawCss, scopeValue, candidates: ['skui:flex'] })).toThrow();
    }
  });

  it('rejects unexpected output classes and negative-only candidate coverage', () => {
    const scopeValue = 'skui-0123456789abcdef';
    expect(() =>
      scopeTailwindCss({
        rawCss: String.raw`.evil { display: flex }`,
        scopeValue,
        candidates: [],
        allowedClasses: []
      })
    ).toThrow('Unexpected emitted CSS class: evil');
    expect(() =>
      scopeTailwindCss({
        rawCss: String.raw`.other:not(.skui\:missing) { display: flex }`,
        scopeValue,
        candidates: ['skui:missing'],
        allowedClasses: ['other', 'skui:missing']
      })
    ).toThrow('Tailwind candidate did not emit a positive selector: skui:missing');
  });

  it('rewrites semantic properties in allowed at-rules and rejects unowned query state', () => {
    const scopeValue = 'skui-0123456789abcdef';
    const result = scopeTailwindCss({
      rawCss: String.raw`
        @supports (color: var(--foreground)) {
          @container style(--secondary: red) {
            .skui\:flex { display: flex }
          }
        }
      `,
      scopeValue,
      candidates: ['skui:flex']
    });
    expect(result.css).toContain('var(--spfx-ui-color-foreground)');
    expect(result.css).toContain('style(--spfx-ui-color-secondary: red)');
    expect(result.css).not.toContain('var(--foreground)');
    expect(() =>
      scopeTailwindCss({
        rawCss: String.raw`@supports (color: var(--host-global)) { .skui\:flex { display: flex } }`,
        scopeValue,
        candidates: ['skui:flex']
      })
    ).toThrow('Undefined custom property reference: --host-global');
  });

  it('lets matching scopes re-enter after a nested different-version boundary', () => {
    const scopeValue = 'skui-0123456789abcdef';
    const result = scopeTailwindCss({
      rawCss: String.raw`
        .skui\:flex { content: enter; font-family: enter; animation: enter 1s }
        @keyframes enter { from { opacity: 0 } to { opacity: 1 } }
      `,
      scopeValue,
      candidates: ['skui:flex']
    });
    expect(result.css).toContain('content: enter');
    expect(result.css).toContain('font-family: enter');
    expect(result.css).toContain(`animation: ${scopeValue}-enter 1s`);
    expect(result.css).toContain(
      `@scope ([data-spfx-ui-scope="${scopeValue}"]) to ([data-spfx-ui-scope]:not([data-spfx-ui-scope="${scopeValue}"]))`
    );
    expect(result.css).not.toContain(':not(:where(');
    expect(result.css).toContain(`[data-spfx-ui-scope="${scopeValue}"] .skui\\:flex`);
  });

  it('uses disjoint selector, property, and keyframe namespaces for two profile copies', () => {
    const first = scopeTailwindCss({
      rawCss: rawFixture,
      scopeValue: 'skui-0123456789abcdef',
      candidates: ['skui:flex', 'skui:block', 'skui:hidden']
    });
    const second = scopeTailwindCss({
      rawCss: rawFixture,
      scopeValue: 'skui-fedcba9876543210',
      candidates: ['skui:flex', 'skui:block', 'skui:hidden']
    });

    expect(first.css).not.toBe(second.css);
    expect(first.css).not.toContain('skui-fedcba9876543210');
    expect(second.css).not.toContain('skui-0123456789abcdef');
    expect(first.css).toContain('--skui-0123456789abcdef-tw-origin');
    expect(second.css).toContain('--skui-fedcba9876543210-tw-origin');
  });

  it('compiles only the TypeScript-AST candidate corpus, not Tailwind comment matches', async () => {
    const { provenance } = await readContract();
    const sourceRoot = await temporaryRoot();
    const outputRoot = await temporaryRoot();
    await cp(path.join(packageRoot, 'normalized'), path.join(sourceRoot, 'normalized'), { recursive: true });
    await appendFile(
      path.join(sourceRoot, 'normalized/src/components/ui/button.tsx'),
      '\n// skui:antialiased must not enter the compiler corpus\n'
    );

    const result = await compileTailwindCss({ packageRoot, sourceRoot, outputRoot, provenance });
    const css = await readFile(path.join(outputRoot, result.artifact.path), 'utf8');
    expect(result.candidateCount).toBe(609);
    expect(css).not.toContain(String.raw`.skui\:antialiased`);
  });

  it('reproduces the checked-in manifest and artifact from distinct temporary roots', async () => {
    const { profile, provenance } = await readContract();
    const [firstRoot, secondRoot] = await Promise.all([temporaryRoot(), temporaryRoot()]);
    const [first, second] = await Promise.all([
      compileTailwindCss({ packageRoot, outputRoot: firstRoot, provenance }),
      compileTailwindCss({ packageRoot, outputRoot: secondRoot, provenance })
    ]);
    const [firstBytes, secondBytes] = await Promise.all([
      readFile(path.join(firstRoot, first.artifact.path)),
      readFile(path.join(secondRoot, second.artifact.path))
    ]);

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalJson(first)).toBe(canonicalJson(profile.css));
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstBytes.equals(await readFile(path.join(packageRoot, profile.css.artifact.path)))).toBe(true);
    expect(first.candidateCount).toBeGreaterThan(500);
    expect(first.structuralMarkers.length).toBeGreaterThan(0);
    expect(first.conditionalClasses).toEqual(['skui:border-b', 'skui:border-t', 'skui:group', 'skui:peer', 'skui:sr-only']);
    expect(first.keyframeCount).toBeGreaterThan(0);
    expect(first.fallbackPropertyCount).toBeGreaterThan(0);
    const css = firstBytes.toString('utf8');
    expect(css).not.toContain(packageRoot);
    expect(css).not.toContain('@layer');
    expect(css).not.toContain('@property');
    expect(css).not.toContain('@container field-group');
    for (const property of ['--spacing', '--secondary', '--foreground', '--radius', '--radius-md']) {
      expect(css).not.toContain(`var(${property})`);
    }
  });

  it('routes the CSS convenience build through the atomic profile transaction', async () => {
    const source = await readFile(path.join(packageRoot, 'scripts/build-tailwind-css.mjs'), 'utf8');
    expect(source).toContain("await import('./regenerate-profile.mjs')");
    expect(source).not.toContain('compileTailwindCss');
  });

  it('provides component baseline invariants in an otherwise unstyled host', async () => {
    const { profile } = await readContract();
    const css = await readFile(path.join(packageRoot, profile.css.artifact.path), 'utf8');
    const window = new Window();
    const { document } = window;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const hostStyle = document.createElement('style');
    hostStyle.textContent =
      'button { margin: 9px; padding: 12px; font-family: Host Override; } fieldset { border: 5px solid red; padding: 12px; } p { margin: 12px; }';
    document.head.append(hostStyle);
    const root = document.createElement('div');
    root.setAttribute('data-spfx-ui-scope', profile.css.scopeValue);
    root.style.fontFamily = 'Owned Host Font';
    const box = document.createElement('div');
    const fieldset = document.createElement('fieldset');
    const paragraph = document.createElement('p');
    const button = document.createElement('button');
    root.append(box, fieldset, paragraph, button);
    document.body.append(root);

    expect(window.getComputedStyle(box).boxSizing).toBe('border-box');
    expect(window.getComputedStyle(fieldset).borderTopWidth).toBe('0px');
    expect(window.getComputedStyle(fieldset).paddingTop).toBe('0px');
    expect(window.getComputedStyle(paragraph).marginTop).toBe('0px');
    expect(window.getComputedStyle(button).fontFamily).toBe('inherit');
    expect(window.getComputedStyle(button).marginTop).toBe('0px');
    expect(window.getComputedStyle(button).paddingTop).toBe('0px');
    window.close();
  });

  it('verifies the committed artifact through the offline profile contract', async () => {
    const { profile, provenance } = await readContract();
    const result = await verifyTailwindCss({ packageRoot, profile, provenance });

    expect(result).toEqual(profile.css);
    expect(() =>
      auditScopedTailwindCss({
        css: `[data-spfx-ui-scope="${result.scopeValue}"] .skui\\:orphan { display: block }`,
        scopeValue: result.scopeValue,
        candidates: ['skui:missing']
      })
    ).toThrow('Selector lacks a nested-scope boundary');
  });
});
