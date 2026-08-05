# Phase 0 Source Baseline — 2026-08-05

Status: Exact-head source inventory complete; emitted inventory is recorded in
[`baseline-artifacts-2026-08-05.md`](baseline-artifacts-2026-08-05.md)
Accountability: A0 / [spfx-kit#81](https://github.com/pbroom/spfx-kit/issues/81)

## Evidence Boundary

This document records tracked source at exact public commits. It does not prove
installed dependency closure, emitted JavaScript/CSS, SPPKG contents, export
closure, CDN bytes or headers, SharePoint deployment, or browser behavior.
Those claims require separate atomic ledger rows.

The owned-source scans include tracked TypeScript/TSX under each repository's
production and Lab source roots. They exclude tests/specs, generated Lab
registry source, package locks, managed `.spfx-kit/apps`, dependencies, build
and release output, and documentation. Vendored source, generator-emitted
source, and declared/transitive dependencies are reported separately.

## Exact Revisions

| Repository                   | Default branch commit                      |
| ---------------------------- | ------------------------------------------ |
| `pbroom/spfx-kit`            | `90bde2f30fd9db4f524583c5cad84de1063c5f21` |
| `pbroom/better-text-spfx`    | `2dc7d97b932b96cd655f0b6d9187d844b0a783dc` |
| `pbroom/better-divider-spfx` | `ca247e0498eea2bba57005f33fb11582c0196d02` |
| `pbroom/better-list-spfx`    | `a8776ef895fb14609419f695fc819b2aeef09f8a` |

Verify any revision with:

```sh
git -C <repo> cat-file -e '<sha>^{commit}'
git -C <repo> show -s --format='%H %aI %s' <sha>
```

## SPFx Kit

Exact revision: `90bde2f30fd9db4f524583c5cad84de1063c5f21`

Runtime and toolchain:

- Node `22.22.3`; npm `10.9.8`.
- Generated SPFx profile `1.23.2`, React/ReactDOM `17.0.1`, React types
  `17.0.45` / `17.0.17`, and generated TypeScript `~5.8.0`.
- Lab/package TypeScript `5.3.3`, Vite `8.1.5`, Heft `1.2.17`.
- Lab uses classic JSX, `ReactDOM.render`, and Vite React/ReactDOM deduplication.

Direct owned Fluent/Griffel source:

- 15 executable Fluent import declarations across 12 tracked non-test files:
  12 in nine Lab files, two in the canonical source-editor package, and one in
  the Hello Card canary. Direct owned Griffel imports are zero.
- Generator templates contain one additional Fluent import declaration in the
  production source they emit.
- The Lab imports 50 unique Fluent bindings; the canonical editor imports ten.
- Code Workbench additionally allowlists and exposes the complete
  `@fluentui/react-components` namespace to authored V1 source.
- `@spfx-kit/source-editor-react` declares Fluent as a peer and constrains React
  and ReactDOM to `>=17 <18`.

Export/source surfaces:

- CLI targets: `single`, `cdn`, `staging-cdn`, and `standalone`.
- Lab export surfaces: `single`, `cdn`, and `standalone`; Lab preview modes are
  `standalone` and `cdn`.
- `single` enables embedded client-side assets; `cdn` and `staging-cdn` use
  external assets; `standalone` emits a portable source repository.
- No emitted archive or target-closure statement is accepted from this source
  inventory.

Reproduce the direct-import inventory:

```sh
sha=90bde2f30fd9db4f524583c5cad84de1063c5f21
git -C <spfx-kit> grep -n -E \
  "from ['\"](@fluentui/|@griffel/)|import ['\"](@fluentui/|@griffel/)|require\\(['\"](@fluentui/|@griffel/)" \
  "$sha" -- \
  'apps/**' 'packages/**' 'examples/**' \
  ':(exclude)**/*.test.*' ':(exclude)**/*.spec.*' \
  ':(exclude)**/__tests__/**' ':(exclude)**/generated/**' \
  ':(exclude)**/dist/**' ':(exclude)**/lib/**' \
  ':(exclude)**/release/**' ':(exclude)**/package-lock.json'
```

## Better Text

Exact revision: `2dc7d97b932b96cd655f0b6d9187d844b0a783dc`

- SPFx `1.21.1`, React/ReactDOM `17.0.1`, React types `17.0.45` /
  `17.0.17`, TypeScript `5.3.3`, Node `22.22.3`, Fluent `9.74.1`.
- One owned production Fluent import site:
  `BetterTextPropertyPane.tsx`, importing Combobox, Dropdown, FluentProvider,
  Option, and `webLightTheme`.
- Direct owned Griffel imports, Lab Fluent/Griffel imports, and vendored-editor
  Fluent/Griffel imports are zero.
- The Lab adapter uses semantic `select`, `combobox`, `number`, and
  `sourceEditor` controls and reuses production Text behavior.
- Standalone export metadata is present. The app source configuration sets
  `includeClientSideAssets=false` and names a placeholder CDN base.
- Existing Google Fonts stylesheet/font requests are runtime externals governed
  by ADR-0002, not app-owned artifact closure.

## Better Divider

Exact revision: `ca247e0498eea2bba57005f33fb11582c0196d02`

- SPFx `1.21.1`, React/ReactDOM `17.0.1`, React types `17.0.45` /
  `17.0.17`, TypeScript `5.3.3`, Node `22.22.3`, Fluent `9.74.1`.
- One owned production Fluent import site:
  `BetterDividerPropertyPane.tsx`, importing Button, ColorArea, ColorPicker,
  ColorSlider, FluentProvider, IdPrefixProvider, Input, Popover,
  PopoverSurface, PopoverTrigger, and `webLightTheme`.
- Direct owned Griffel imports, Lab Fluent/Griffel imports, and vendored-editor
  Fluent/Griffel imports are zero.
- The Lab adapter uses semantic controls but still declares legacy `cssEditor`
  instead of the canonical `sourceEditor` discriminator.
- Standalone export metadata is present and `includeClientSideAssets=true`.
  The active CDN config and handoff documentation name different bases; later
  artifact evidence must bind the intended target rather than infer it.

Reproduce Better Text or Divider's production/Lab/vendor scans:

```sh
git -C <repo> grep -nE \
  "from ['\"]@(fluentui|griffel)/|require\\(['\"]@(fluentui|griffel)/" \
  <sha> -- \
  ':(glob)src/**/*.ts' ':(glob)src/**/*.tsx' \
  ':(exclude,glob)src/**/*.test.ts' \
  ':(exclude,glob)src/**/*.test.tsx' \
  ':(exclude,glob)src/**/*.spec.ts' \
  ':(exclude,glob)src/**/*.spec.tsx' \
  ':(exclude,glob)src/vendor/**'

git -C <repo> grep -nE \
  "from ['\"]@(fluentui|griffel)/|require\\(['\"]@(fluentui|griffel)/" \
  <sha> -- ':(glob).spfx-kit/lab/**/*.ts' ':(glob).spfx-kit/lab/**/*.tsx'
```

## Editor Vendoring Baseline

Better Text and Better Divider both record generated source-editor provenance at
`@spfx-kit/source-editor-react@0.1.0` and core provenance at
`@spfx-kit/source-editor-core@0.1.0`, but neither exact-head package exposes the
claimed sync script. Their `sourceEditorCore.ts` bytes match while their
`SourceEditorField.tsx` files have drifted. ADR-0001 and rule R11 require a
canonical profile plus deterministic consumer digest checks; this source fact
does not itself prove a current canonical build.

## Better List

Exact revision: `a8776ef895fb14609419f695fc819b2aeef09f8a`

- Better List `0.2.3`, SPFx `1.23.2`, React/ReactDOM `17.0.1`, React types
  `17.0.45` / `17.0.17`, TypeScript `~5.8.0`, Heft `1.2.17`, and Node
  `22.22.3`.
- In 43 owned non-test production TypeScript files, 14 files import 163 Fluent
  component symbol occurrences (67 unique); ten files import 75 Fluent icon
  occurrences (59 unique). Direct `@griffel/react`, Fluent v8, and
  `office-ui-fabric-react` imports are zero.
- The production renderer still consumes Griffel renderer/ID/provider symbols
  through the Fluent barrel. The Lab separately imports Griffel's
  `RendererProvider`; direct-import counts do not prove Griffel removal.
- Vendor editor source contains two Fluent component importers with ten unique
  symbols. Lab source contains two Fluent component importers, one Fluent icon
  importer, and one direct Griffel importer.
- `includeClientSideAssets=true` is the canonical package configuration. Source
  also defines an embedded `standalone.sppkg` variant and a CDN-template package
  plus `cdn-assets/`; no generated package was inspected here.
- The vendored editor headers point to the SPFx Kit `0.1.0` source packages and
  say not to edit directly, but this exact package has no `sync:source-editor`
  script. The optional shared Monaco adapter is a separate vendored contract;
  bundled Monaco remains the documented default.

Authored-content compatibility includes the stable `.better-list` and
`.better-list__*` selector surface, row aliases, and these production variables:

```text
--better-list-heading
--better-list-accent
--better-list-surface
--better-list-text
--better-list-muted
--better-list-border
--better-list-link
--better-list-focus
--better-list-columns
```

The corresponding `--better-list-host-*` inputs remain host bridges. Lab-only
`--better-list-lab-*` variables are not part of the production authored
contract.

Reproduce the exact source snapshot and selector union:

```sh
sha=a8776ef895fb14609419f695fc819b2aeef09f8a
git -C <better-list> archive --format=tar --output=<snapshot.tar> "$sha"

rg -o --no-filename 'better-list__[a-z0-9_-]+' \
  src/shared/betterListStyles.ts \
  src/webparts/betterList/components/BetterListView.tsx \
  src/webparts/betterList/BetterList.manifest.json | sort -u
```

Import counts use the TypeScript AST over the archived exact commit. The count
set includes `src/**/*.{ts,tsx}` and excludes tests, `src/test/**`,
`src/vendor/**`, and generated source; vendor and Lab sets are reported
separately. Each named, default, or namespace import specifier is one occurrence
and aliases count by original imported name.

## Follow-on evidence work

The companion emitted-artifact baseline records clean installs, production
builds, package identities, and current Fluent/Griffel/asset closure. Phase 1
must still produce all four export targets from one migration release set and
record them as separate proof events. Neither source counts nor this baseline
satisfies hosted CI, CDN, SharePoint runtime, or rollback gates.
