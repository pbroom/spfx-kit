# Fluent UI To Shadcn Migration Roadmap

Last reviewed: 2026-08-05

Overall status: Proposed

Progress: 0 of 8 phase gates complete

## Goal

Replace direct Fluent UI and Griffel usage in the SPFx Kit lab, Better Text,
Better Divider, and Better List with a pinned, reviewed, source-owned shadcn
component foundation that remains compatible with SPFx's exact React 17.0.1
runtime.

Preserve SharePoint theme, document, portal, ID, accessibility,
authored-content, standalone-package, and CDN-package contracts. Keep essential
UI code and styling app-owned. Cross-app CDN resources must be independently
versioned, bound to provenance and checksums, proven in a real browser under
the intended authentication, CORS, CSP, and cache model, retained while any
deployed app refers to them, and able to fail without breaking essential UI.

The migration is complete only when all eight phase gates are complete, every
applicable tracker row reaches its required delivery, validation, and CDN state
on one recorded source revision, and no blocking or expired exception remains.
That evidence includes repository gates, exact-head hosted CI, emitted-package
inspection, applicable CDN asset parity checks, and real modern SharePoint-page
validation without bundling another React or ReactDOM runtime.

See the [SPFx toolchain decision](toolchain.md),
[app source control and CDN proof](source-control.md), and the
[root quality gates](../README.md#quality-gates) for existing repository
contracts.

## Scope And Non-Goals

In scope:

- A curated shadcn source profile backed by Base UI and tested on React 17.
- Shared semantic tokens, SharePoint theme mapping, ID rules, and portal
  ownership.
- A deterministic UI CSS build that works in Vite, Heft, and retained Gulp
  projects.
- The lab shell and generic property controls.
- The shipped Better Text, Better Divider, and Better List UI surfaces.
- The canonical source editor, Code Workbench compatibility surface, app
  generator, and canary.
- Embedded, app-CDN, staging-CDN, standalone, and optional shared-resource
  delivery contracts.

Not in scope without a separate decision:

- Upgrading SPFx or React beyond Microsoft's supported matrix.
- Replacing Better Text's existing native rich-text editor only to make it look
  like shadcn.
- Rewriting Better Divider's rendered separator, which is already plain DOM.
- Sharing React, ReactDOM, Base UI, application component JavaScript, or an
  emitted Better List webpack chunk through a CDN.
- Claiming bundle-size or transfer savings before clean production builds and
  browser network traces prove them.
- Publishing to a CDN, deploying to SharePoint, merging, tagging, or releasing
  as an implied part of a migration PR.

## Non-Negotiable Rules

Every implementation PR must cite the rule IDs it affects and attach the
required evidence.

| ID  | Rule                                                                                                                                                                                                                                                        | Required evidence                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| R1  | React and ReactDOM remain exactly `17.0.1` until the SPFx compatibility matrix changes. Do not use `createRoot`, `react-dom/client`, React 18/19-only APIs, forced peer resolution, or a second runtime.                                                    | Lockfile review, `npm ls react react-dom`, emitted-bundle inspection.        |
| R2  | Pin the shadcn preset, primitive base, CLI/source revision, dependencies, and component digests. Review generated source before adoption or update.                                                                                                         | Registry/profile manifest, source diff, compatibility tests.                 |
| R3  | Compile source-owned components into each app. Production apps must remain standalone and must not gain runtime dependencies on `@spfx-kit/*`.                                                                                                              | Standalone export install/build and production dependency scan.              |
| R4  | Do not apply Tailwind Preflight or generic token variables to the SharePoint page. Prefix utilities and scope tokens and base rules to an owned UI root.                                                                                                    | Emitted CSS scan and host-style regression.                                  |
| R5  | Every overlay accepts the owning `Document` and an owned portal host. The portal host receives the same tokens and style scope as the app root.                                                                                                             | Portal tests plus SharePoint focus, Escape, scroll, and z-order evidence.    |
| R6  | Preserve stable authored-content classes, variables, persisted IDs, icon values, templates, and app contracts unless a separately approved breaking migration exists.                                                                                       | Contract tests and before/after fixtures.                                    |
| R7  | Treat `single`, `cdn`, `staging-cdn`, and `standalone` as different products. Validate each one from the same clean source revision.                                                                                                                        | Package/export matrix with artifact identities.                              |
| R8  | Use immutable release paths. Never publish or fall back to `latest`, overwrite an existing release, mix generations, or use GitHub as a browser runtime origin.                                                                                             | Manifest policy tests and exact-prefix verification.                         |
| R9  | Keep licensed and private assets inside approved boundaries. Record licenses and provenance before copying or publishing an asset.                                                                                                                          | License inventory, provenance record, credential/LFS scan.                   |
| R10 | A source scan does not prove Fluent removal, CDN completeness, or runtime parity. Inspect emitted JS/CSS, packages, response headers, and browser requests.                                                                                                 | Artifact inspection and browser trace.                                       |
| R11 | Keep the Better List editor implementation canonical. Regenerate or deterministically vendor downstream SCSS-only consumers; do not hand-edit generated copies.                                                                                             | Vendor-sync check and digest match.                                          |
| R12 | Mark a gate complete only when its evidence is recorded. Keep merge, remote CDN proof, SharePoint deployment, and SharePoint runtime proof as distinct states.                                                                                              | Tracker row with commit, PR, commands, artifact manifest, or browser record. |
| R13 | Keep public tracking evidence safe. Store only a public-safe summary or opaque evidence ID here; keep private repository URLs, authenticated origins, licensed inventories, credentials, and protected source identifiers in their approved private system. | Evidence classification review and approved-system reference.                |

If a PR needs an exception, record the rule, reason, owner, expiry condition,
and removal issue before merge. An exception cannot silently redefine the goal.

## Status Model

Delivery values:

- `planned`
- `in-progress`
- `submitted`
- `merged`
- `blocked`
- `deferred`

Validation values:

- `not-run`
- `local`
- `exact-head-ci`
- `sharepoint-verified`

CDN proof values:

- `not-applicable`
- `not-run`
- `local-mock-smoke`
- `artifact-verified`
- `remote-verified`
- `runtime-verified`

These values are not interchangeable proof shortcuts. Record each proof event
against the same commit, package, manifest digest, and resource release.
`local-mock-smoke` means only the lab/mock route passed. `remote-verified`
requires configured HTTPS exact-prefix byte and header verification.
`runtime-verified` requires a real browser loading the intended CDN resources
on the target SharePoint origin. Preserve the separate evidence records even
when the summary shows only the highest reached state.

Use task boxes only for phase acceptance criteria. Check an item only when the
tracker contains a commit, PR, command result, artifact manifest, or browser
record that proves it.

## Roadmap Summary

| Surface                                   | Rules           | Delivery  | Validation | CDN proof        | Evidence ID | Exception/blocker | Next gate                       |
| ----------------------------------------- | --------------- | --------- | ---------- | ---------------- | ----------- | ----------------- | ------------------------------- |
| Baseline and decisions                    | R1-R3, R7-R13   | `planned` | `not-run`  | `not-applicable` | —           | —                 | Phase 0 inventory               |
| React 17 UI and CSS foundation            | R1-R5, R7-R10   | `planned` | `not-run`  | `not-run`        | —           | —                 | Phase 1 compatibility harness   |
| Lab shell and generic controls            | R1-R6, R10, R12 | `planned` | `not-run`  | `not-run`        | —           | —                 | Foundation accepted             |
| Better Text                               | R1-R10, R12-R13 | `planned` | `not-run`  | `not-run`        | —           | —                 | Lab primitives accepted         |
| Better Divider                            | R1-R10, R12-R13 | `planned` | `not-run`  | `not-run`        | —           | —                 | Color-control decision          |
| Better List                               | R1-R13          | `planned` | `not-run`  | `not-run`        | —           | —                 | UI shell and portal contract    |
| Editors, Workbench, generator, and canary | R1-R5, R7-R13   | `planned` | `not-run`  | `not-run`        | —           | —                 | Canonical source profile stable |
| Fluent removal and release acceptance     | R1-R13          | `planned` | `not-run`  | `not-run`        | —           | —                 | All earlier phase evidence      |

### Exception Register

| Rule | Reason | Owner | Approval | Expiry condition | Removal issue | State |
| ---- | ------ | ----- | -------- | ---------------- | ------------- | ----- |
| —    | —      | —     | —        | —                | —             | None  |

Preliminary coupling estimates recorded on 2026-08-05; they are not baseline
evidence until each is attached to a repository commit and reproducible
command:

- The lab has seven direct Fluent TSX consumers, 46 distinct Fluent symbols,
  and about 150 Fluent JSX instances.
- Better Text has one direct Fluent file and five imported symbols. Its main
  rich-text editor is custom/native.
- Better Divider has one direct Fluent file and 11 imported symbols. Its
  composed color picker is the main replacement gap.
- Better List has 18 direct non-test Fluent files, 259 Fluent JSX instances,
  162 Griffel style slots, 90 Fluent token references, and 59 distinct Fluent
  icons.

Refresh these counts before using them as completion evidence.

## Phase 0 — Baseline And Foundation Decisions

Outcome: establish current evidence, ownership, and decisions before adding UI
source or build machinery.

Included work:

- Record exact repository heads, SPFx versions, React versions, toolchains,
  direct Fluent imports, emitted Fluent/Griffel assets, and current package
  modes.
- Classify every planned foundation artifact as source, app asset, app-CDN
  asset, or optional shared resource.
- Select and pin the shadcn preset and Base UI snapshot.
- Decide how the canonical registry/profile is distributed and how downstream
  digest drift fails CI.
- Decide the owned color-control organism before scheduling Better Divider and
  Better List color fields.
- Record the public Google Fonts behavior in Better Text as a separate asset
  policy decision. Do not add another font origin by default.

Acceptance checklist:

- [ ] Each repository baseline is tied to a commit SHA.
- [ ] Direct-source and emitted-artifact inventories are recorded.
- [ ] The source/app/shared-resource classification is accepted.
- [ ] The registry update and rollback process is accepted.
- [ ] The color-control and font-policy decisions are recorded or explicitly
      blocked with owners.

Exit evidence: architecture decision records, inventory output, and linked
issues/PRs. No UI migration starts before this gate is complete.

## Phase 1 — React 17 UI, Styling, And Delivery Foundation

Outcome: produce a small, reviewed foundation that builds and behaves the same
way in the lab and SPFx production paths.

Included work:

- Curate Button, Input, Field, Textarea, Checkbox, Switch, Select, Combobox,
  Toggle Group, Tabs, Accordion, Menu, Dialog, Sheet, Popover, Tooltip, Alert,
  Badge, and Spinner as needed. Do not assume optional shadcn dependencies such
  as toast libraries support React 17.
- Compile and render every selected primitive against React 17.0.1, the
  supported TypeScript range, classic JSX, and the real SPFx webpack path.
- Add a deterministic UI CSS command that runs before lab, build, ship, and all
  export modes. Tailwind must emit final CSS separately from Sass.
- Disable Preflight, prefix utilities, reject runtime-built class names unless
  safelisted, and scan all vendored component sources.
- Add the SharePoint `IReadonlyTheme` to semantic-token adapter.
- Add owned UI-root, ID-prefix, `targetDocument`, portal-host, and teardown
  contracts.
- Route generated CSS through a targeted global-CSS rule or the imported SPFx
  component graph without CSS Modules hashing literal utility selectors.

Acceptance checklist:

- [ ] A clean install resolves one React/ReactDOM 17.0.1 runtime.
- [ ] Representative primitives typecheck, build, render, and unmount in React
      17 without forced peers.
- [ ] Vite, Heft, and retained Gulp fixtures consume the same source and CSS
      contract.
- [ ] Production CSS contains expected prefixed selectors and no unscoped
      reset or generic `:root` token block.
- [ ] Portal, theme, deterministic-ID, focus-return, Escape, and teardown tests
      pass for multiple roots in one document.
- [ ] A host-style lifecycle test proves mount, theme change, and unmount do not
      alter SharePoint-owned styles or nodes.
- [ ] Embedded and app-CDN builds both contain the generated UI CSS and its
      relative assets.

Exit evidence: pinned profile manifest, focused compatibility suite, emitted
CSS report, SPFx canary package, and local browser record.

## Phase 2 — Lab Shell And Generic Property Controls

Outcome: make the lab the compatibility and parity harness while keeping
managed app adapters stable.

Included work:

- Replace the lab `FluentProvider`, buttons, fields, tabs, dialogs, side panels,
  menus, badges, and tooltips. Use Sheet for side panels rather than a bottom
  Drawer interaction.
- Preserve the framework-neutral property-control contracts and migrate the
  central control renderer one control type at a time.
- Build and test the owned color-control organism.
- Give the lab chrome a scoped root and themed portal host without styling
  managed previews.
- Keep the lab on React 17 so Vite's deduplicated runtime matches SPFx.
- Replace `.fui-*` test selectors with owned semantic hooks while retaining
  role-based accessibility assertions.
- Keep Better List as a temporary nested Fluent island until its custom lab
  property pane adopts the production UI shell.

Acceptance checklist:

- [ ] Lab shell and generic controls contain no direct Fluent imports.
- [ ] Better Text and Better Divider adapters need no visual-library imports.
- [ ] Large-option combobox, color, select, radio, editor, and grouped-control
      behavior matches the current contracts.
- [ ] Light, dark, custom section, mobile, and narrow property-pane tests pass.
- [ ] Managed previews receive no Tailwind reset or token leakage.
- [ ] Lab E2E and Axe gates pass on the exact submitted head.

Exit evidence: lab screenshots/traces, accessibility report, test run, and PR
head.

## Phase 3 — Better Text

Outcome: remove Better Text's direct Fluent dependency without conflating that
work with a rich-text-editor redesign.

Included work:

- Replace the two property-pane dropdowns and the large Google-font combobox.
- Replace the hard-coded light Fluent provider with the shared theme/UI root.
- Preserve the rich-text editor, value/onChange behavior, target metadata,
  target rename, shadow-root behavior, and authored CSS contracts.
- Adopt the canonical SCSS-only source editor through deterministic vendoring.

Acceptance checklist:

- [ ] Direct Fluent imports are zero in owned Better Text production source.
- [ ] Font combobox keyboard, filtering, selection, and persistence behavior is
      covered.
- [ ] Shadow-root styling and portal targeting work in SharePoint.
- [ ] Clean build, tests, ship, package inspection, and all export profiles pass.
- [ ] Actual SharePoint property-pane behavior and theme changes are verified.

Exit evidence: Better Text commit/PR, artifact manifests, package inspection,
and SharePoint browser record.

## Phase 4 — Better Divider

Outcome: remove Better Divider's direct Fluent dependency while preserving its
plain rendered divider and the `ColorField { value, onChange }` contract.

Included work:

- Replace the property-pane UI root, inputs, buttons, popover, and simple
  controls.
- Replace the Fluent color area, hue slider, and inputs with the accepted owned
  color-control organism. A temporary Fluent island must have an explicit
  removal issue and cannot count as phase completion.
- Replace `IdPrefixProvider` with the shared deterministic-ID contract.
- Normalize the lab's legacy `cssEditor` declaration to the canonical source
  editor schema before parity sign-off.

Acceptance checklist:

- [ ] Direct Fluent imports are zero in owned Better Divider production source.
- [ ] Color input, HSV/HSL conversion, pointer, keyboard, focus, popover, and
      persistence behavior is covered.
- [ ] Shadow-root styling and portal targeting work in SharePoint.
- [ ] Clean build, tests, ship, package inspection, and all export profiles pass.
- [ ] Actual SharePoint property-pane behavior and theme changes are verified.

Exit evidence: Better Divider commit/PR, color-control accessibility evidence,
artifact manifests, and SharePoint browser record.

## Phase 5 — Better List

Outcome: replace Better List's Fluent/Griffel application shell and component
surfaces without losing its host-isolation, authored-content, or authoring
contracts.

Included work:

1. Replace the Fluent/Griffel renderer with an app UI root that owns semantic
   tokens, the target document, the portal host, and overlay layers.
2. Migrate `BetterListView` while preserving props, HTML template slots,
   persisted icon values, and stable `.better-list__*` and `--better-list-*`
   contracts.
3. Migrate basic property-pane controls and sections.
4. Migrate Tab Builder and Item Property Builder as composed organisms while
   retaining `dnd-kit`.
5. Migrate nested menus, dialogs, icon/image/color authoring, drag overlays,
   sorting, filtering, and listbox behavior.
6. Replace the separate lab property-pane implementation with production
   organisms and the same UI root.

Acceptance checklist:

- [ ] Viewer and production property-pane roots use the same UI shell contract.
- [ ] Stable authored-content selectors, variables, templates, and icon values
      remain compatible.
- [ ] Nested overlay, drag-and-drop, scroll lock, focus return, Escape, and
      owner-document behavior passes in the lab and SharePoint.
- [ ] Mount, theme change, and unmount preserve host CSSOM and DOM nodes.
- [ ] Direct Fluent, Fluent icon, and Griffel imports are zero in owned Better
      List production source.
- [ ] Clean build, complete test suite, ship, standalone/CDN parity, and actual
      SharePoint multi-web-part validation pass.

Exit evidence: phased Better List PRs, contract-test results, exact emitted
assets, artifact manifests, and SharePoint browser/network records.

## Phase 6 — Editors, Code Workbench, Generator, And Canary

Outcome: remove remaining platform blockers and make new work start on the
accepted foundation.

Included work:

- Migrate the canonical source editor's menu/tab/provider chrome upstream, then
  regenerate Better List, Better Text, and Better Divider consumers.
- Add `targetDocument`, portal-host, ID, and style-root contracts to floating
  editor surfaces before changing their primitives.
- Introduce a versioned owned UI module for Code Workbench. Keep the existing
  Fluent approved module during a documented deprecation window so persisted
  sources do not break.
- Update `create:spfx`, the Hello Card canary, standalone export templates,
  examples, and golden-path tests to emit the accepted React 17 foundation.
- Keep app source and dependency boundaries intact for exported repositories.

Acceptance checklist:

- [ ] Source-editor vendor sync and digest checks pass in all consumers.
- [ ] Code Workbench migration and deprecation behavior is tested with persisted
      sources.
- [ ] A newly generated app installs, builds, runs in the lab, ships, and exports
      without direct Fluent source.
- [ ] Web-part and extension-only canaries pass the full export matrix.
- [ ] The standalone export builds with only its own repository and lockfile.

Exit evidence: canonical editor release/source digest, generator fixtures,
canary artifacts, and compatibility notes.

## Phase 7 — Fluent Removal And Release Acceptance

Outcome: remove direct Fluent/Griffel coupling only after every replacement and
delivery path is proven.

Included work:

- Remove direct Fluent component, icon, and Griffel dependencies that are no
  longer used. SPFx transitive Fluent packages may remain.
- Replace or retire Fluent-specific tests and documentation without weakening
  behavior coverage.
- Re-run clean builds and inspect emitted assets rather than relying on source
  searches.
- Run a SharePoint page matrix with native SharePoint UI and multiple migrated
  web parts mounted together.
- Record measured JavaScript, CSS, request-count, and cache results without
  assuming improvement.

Acceptance checklist:

- [ ] Source and emitted artifacts contain no unintended direct Fluent/Griffel
      application code.
- [ ] Root and app exact-head CI is green.
- [ ] Embedded, app-CDN, staging-CDN, and standalone artifacts are reconciled
      to the same source revisions.
- [ ] Remote CDN and real SharePoint runtime proof is recorded where applicable.
- [ ] Rollback packages and retained resource versions are identified.
- [ ] Documentation and the tracker reflect the final supported state.

Exit evidence: final source/artifact scan, CI links, release manifests, browser
traces, performance measurements, and rollback record.

## CDN And Shared Resource Foundations

### Keep App CDN And Shared CDN Separate

Target state: the app CDN contains the entry bundle, Base UI implementation,
shadcn source output, generated UI CSS, lazy chunks, and app-owned assets. A
materialized production app-CDN or `staging-cdn` `.sppkg` points to one exact
immutable app release; the ordinary `cdn` target remains a configurable
handoff/template until that binding is materialized and verified.

Proposed contract: the shared resource CDN contains only independently released
resources such as an eventual Monaco closure, a proven multi-app icon-data
catalog, or an authorized shared font family. Each resource has its own
compatibility, manifest, loader, fallback, and retention contract.

The current `/shared/<resource>/versions/<release>/` mock-CDN namespace is
reserved and unsupported. Shared Foundation already validates staging-source,
Monaco, and brand-resource inputs. Keep the runtime namespace closed until the
complete production resource closure, provider-side deployment, and real
browser authentication/runtime path are proven.

### Resource Placement

| Resource                                          | Default placement                        | Foundation rule                                                                                       |
| ------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| React and ReactDOM                                | SPFx-provided runtime                    | Never bundle or CDN-share another copy.                                                               |
| Shadcn component source                           | Versioned source/deterministic vendoring | Compile into each app; review upstream updates as source diffs.                                       |
| Base UI implementation                            | App bundle                               | Pin and test each primitive on React 17.                                                              |
| Theme, ID, document, and portal adapters          | App bundle                               | Keep local because they are small compatibility contracts.                                            |
| Generated UI CSS                                  | App asset                                | Include in embedded and app-CDN outputs; core controls must not depend on shared CSS.                 |
| Small control icons                               | App-local inline/tree-shaken source      | Do not add a shared icon runtime.                                                                     |
| Better List icon catalog data                     | App asset; optional shared data later    | Require a second consumer and measured benefit before promotion.                                      |
| Monaco modules, CSS, workers, and Codicon         | Bundled/local by default                 | Shared runtime remains opt-in until complete browser closure is proven.                               |
| Fonts                                             | App-owned by default                     | Require multi-app use, license proof, immutable CSS/font closure, and browser proof before sharing.   |
| App renderer CSS, templates, and app-owned images | App asset                                | Preserve application and authored-content ownership; inventory separately governed runtime externals. |
| GitHub/private registry source                    | Build/staging input only                 | Never use GitHub as the browser runtime origin.                                                       |

### SPFx Build And Export Matrix

| Target        | Required UI asset behavior                                                                                          | Proof                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single`      | `includeClientSideAssets=true`; all required app-owned JS, CSS, fonts, images, and chunks are embedded.             | Reopen `.sppkg`, reconcile `ClientSideAssets` with the required closure, and verify the permitted-runtime-externals inventory.                                 |
| `cdn`         | `includeClientSideAssets=false`; package and complete matching asset tree use the configured app CDN base.          | Treat as a template/handoff until it has a strict checksummed deployment manifest. Clear stale generated sources before assembly.                              |
| `staging-cdn` | Use one generated immutable prefix and canonical `upload/` tree.                                                    | Strict deployment manifest, local verification, current exact-prefix remote byte verification, implemented header verification, then SharePoint browser proof. |
| `standalone`  | Export source, local build contract, lockfile, UI profile metadata, and all files needed to reproduce every target. | Clean install/build outside the monorepo with no production `@spfx-kit/*` dependency.                                                                          |

The UI CSS build must integrate with standard SPFx outputs such as imported
component assets, `release/assets`, and `temp/deploy`. Do not create a parallel
deployment directory unless the exporter and all validators adopt it.

### App-CDN Gates

- Clear `release/assets`, `release/manifests`, and `temp/deploy` before every
  external-assets build while preserving non-generated siblings.
- Reconcile packaged and generated SPFx manifests with the exact upload tree.
- When an app uses a shared release, introduce either deployment-manifest v2 or
  a separate resource-dependency manifest bound to the v1 manifest SHA-256.
  Record the resource ID, exact release, immutable manifest URL and digest,
  compatibility profile, and fallback. Add strict parser, deterministic-core,
  verifier, compatibility, migration, and unknown-field regression tests;
  shared files remain outside the v1 app manifest's `files` collection.
- Add a `permittedRuntimeExternals` inventory for user-supplied image URLs,
  separately governed fonts, or other intentional runtime dependencies. Do not
  let this inventory exempt app-owned build assets from closure checks.
- Obtain the expected CDN base URL, release identity, and manifest digest from
  trusted deployment configuration, not from the package or fetched manifest.
  Derive every asset URL from that base and reject redirects, embedded
  credentials, query strings, fragments, mutable aliases, and path escape.
- Extend closure checks beyond `scriptResources` to CSS `url(...)`, fonts,
  images, source-map policy, lazy chunks, workers, and runtime support assets.
- Inspect the embedded package for the same closure; a readable `.sppkg` alone
  is not proof that every asset was embedded.
- Reopen final archives, validate their paths and contents, and publish their
  SHA-256 with the download response or handoff metadata.
- Extend lab CDN proof beyond JavaScript registration. Load styles in the
  contained UI/portal environment and assert computed styles, font and image
  loads, focus behavior, and teardown.
- Exercise complete web-part and extension-only fixtures. Optional web-part
  manifests must not become a hidden requirement.

### Shared-Resource Contract

Every shared-resource release must use an immutable path such as
`/shared/<resource>/versions/v<releaseVersion>/` and include a strict manifest
with:

- Resource ID, release version, build identity, source revision, and safe
  opaque provenance/license identifiers and digests. Keep rights evidence and
  protected source paths outside the deployable tree.
- Every file's portable path, byte count, SHA-256, and expected MIME type.
- The complete resource closure, including CSS, fonts, images, workers, WASM,
  support assets, and an explicit source-map publication policy.
- Supported React/SPFx/browser profile where relevant.
- Loader contract, fallback behavior, and proof state.
- Retention and revocation policy metadata.

The immutable manifest records artifact-local proof only. Remote and browser
attestations are separate records keyed by its digest so publication never
requires mutating the release.

The expected base URL, release identity, and manifest digest come from trusted
deployment configuration. Derive asset URLs from that base and reject
redirects, credentials, query strings, fragments, mutable aliases, and path
escape. Compatibility profiles live in the immutable resource manifest; exact
consumer bindings live in each app manifest, while reverse references live in
a separate deployment/retention registry that can change as consumers deploy.

Never overwrite a release. Publish and verify shared resources first, then
app-CDN assets. With explicit deployment authority, deploy the referencing
`.sppkg` separately to the SharePoint App Catalog last. Before SharePoint
validation, purge or wait out cached 404, sign-in, and other failure responses.
Rollback is likewise an authorized App Catalog operation: restore the prior
package while retaining both resource generations.

### Authentication, Headers, And Browser Proof

Deployment-time verification can attach an Authorization header. Native
browser script, stylesheet, font, and worker requests usually cannot attach an
arbitrary header. Prove the production browser authentication model before an
essential resource moves to the shared CDN.

Remote and browser gates must check:

- Exact allowed SharePoint origins and credential behavior. Never combine
  credentialed requests with `Access-Control-Allow-Origin: *`; prove an exact
  `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, and
  `Vary: Origin` where cookies are required.
- Cookie `Secure` and `SameSite` behavior, including third-party-cookie
  restrictions on the actual SharePoint origins.
- Redirect behavior and rejection of sign-in HTML in place of an asset.
- Correct `Content-Type`, `X-Content-Type-Options: nosniff`, CORS, approved
  immutable cache headers, and tenant-safe cache keys.
- CSP requirements for `script-src`, `style-src`, `font-src`, `connect-src`,
  `worker-src`, and any measured `blob:` use.
- Real worker creation, stylesheet application, font use, lazy chunk loading,
  and portal styling—not only successful GET requests.

The current exact-prefix remote verifier proves status, bytes, and SHA-256 but
does not send a browser `Origin` or inspect MIME, CORS, cache, or `nosniff`
headers. It cannot by itself earn `remote-verified`. Implement header
verification using an independently trusted SharePoint origin and MIME/cache
policy, then keep the real-browser gate separate.

Remote SHA verification proves deployment fidelity, not browser-time
integrity. For fetched JSON/data, verify bytes before parsing. For executable
resources, require proof of the CSP-compatible fetch/hash/execute mechanism
before claiming runtime integrity. Otherwise state that SHA-256 is
deployment-time assurance only and that runtime trust relies on TLS, immutable
publication, access control, and deployment verification. Apply the same
distinction to CSS-relative fonts and other native subresource requests.

### Failure And Retention Rules

- Essential controls work without the shared-resource CDN.
- Monaco retains its bundled/local runtime and textarea fallback until the
  remote path proves full parity.
- Optional icon catalogs retain an embedded minimal set or clear fallback.
- Shared brand fonts fall back to an approved system stack.
- Name and test each fallback against timeout, 401/403/404, redirect-to-HTML,
  wrong MIME, checksum mismatch, CORS/CSP rejection, and worker-start failure.
- Do not fall back to a public CDN, mutable alias, or another release
  generation.
- The deployment owner maintains the reverse-reference registry and stated
  grace period. Remove a version only after deployed-site/App Catalog
  references, supported packages, and retained rollback packages are all
  clear. Security revocation creates a new resource and app release or
  explicitly denies the compromised version; denial requires coordinated
  consumer fallback/update evidence and never replaces bytes in place.

## Cross-Repository Validation Matrix

Each implementation phase selects the relevant rows and records evidence in
the roadmap summary.

| Gate                                           | Lab                     | Better Text               | Better Divider            | Better List               | Generator/canary          |
| ---------------------------------------------- | ----------------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| React 17 singleton and peer audit              | Required                | Required                  | Required                  | Required                  | Required                  |
| TypeScript, lint, and focused tests            | Required                | Required                  | Required                  | Required                  | Required                  |
| Full local repository gates                    | Required                | Required                  | Required                  | Required                  | Required                  |
| Role, keyboard, focus, Escape, and Axe         | Required                | Required                  | Required                  | Required                  | Required                  |
| Theme, portal, ID, and host-style lifecycle    | Required                | Required                  | Required                  | Required                  | Required                  |
| Clean `single` artifact                        | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Clean `cdn` artifact                           | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Strict `staging-cdn` local proof               | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Exact-prefix remote byte/header proof          | Resource work only      | Required before CDN claim | Required before CDN claim | Required before CDN claim | Required before CDN claim |
| Standalone clean install/build                 | Not applicable          | Required                  | Required                  | Required                  | Required                  |
| Exact-head hosted CI                           | Required                | Required                  | Required                  | Required                  | Required                  |
| Real SharePoint page and browser network trace | Harness support         | Required                  | Required                  | Required                  | Required                  |
| Rollback and retained-resource record          | Not applicable          | Required before release   | Required before release   | Required before release   | Required before release   |

## Decision Log

| ID  | Status   | Decision                                                                                     | Owner               | Recorded   | Source/ADR                          | Revisit condition                                                        |
| --- | -------- | -------------------------------------------------------------------------------------------- | ------------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------ |
| D1  | Accepted | Keep React and ReactDOM at `17.0.1`.                                                         | Platform maintainer | 2026-08-05 | SPFx matrix and `toolchain.md`      | Microsoft's supported SPFx runtime changes.                              |
| D2  | Proposed | Use a pinned shadcn profile backed by Base UI.                                               | UI foundation owner | 2026-08-05 | Phase 0 ADR required                | Compatibility spike fails or primitive support changes.                  |
| D3  | Proposed | Distribute UI components as reviewed source with deterministic digests.                      | UI foundation owner | 2026-08-05 | Phase 0 ADR required                | Standalone or drift enforcement cannot be proven.                        |
| D4  | Proposed | Compile generated UI CSS per app and keep it essential/app-owned.                            | Build owner         | 2026-08-05 | Phase 1 build ADR required          | CSS closure, isolation, or parity gates fail.                            |
| D5  | Accepted | Keep app-CDN and shared-resource contracts separate.                                         | Release owner       | 2026-08-05 | Current app export contracts        | One contract proves both lifecycles without weakening either validator.  |
| D6  | Accepted | Keep the `/shared/...` runtime namespace closed.                                             | Release owner       | 2026-08-05 | Reserved mock route and validators  | Production closure, provider deployment, and browser runtime are proven. |
| D7  | Accepted | Keep Better List's source editor canonical.                                                  | Editor owner        | 2026-08-05 | Existing shared-editor architecture | A separately approved replacement becomes canonical.                     |
| D8  | Proposed | Migrate the lab foundation, Better Text, Better Divider, Better List, then platform cleanup. | Program owner       | 2026-08-05 | This roadmap                        | Phase dependencies or compatibility evidence require resequencing.       |

## Risks And Blockers

| Risk or blocker                                                     | Owner               | State | Effect                                              | Required response                                                  | Evidence/issue | Review by          |
| ------------------------------------------------------------------- | ------------------- | ----- | --------------------------------------------------- | ------------------------------------------------------------------ | -------------- | ------------------ |
| A selected shadcn dependency requires React 18/19.                  | UI foundation owner | Open  | Breaks the SPFx runtime contract.                   | Reject or adapt the component source; never force the peer graph.  | Phase 1 issue  | Phase 1 start      |
| Tailwind selectors are hashed as CSS Modules.                       | Build owner         | Open  | Literal component classes stop working.             | Use the targeted global-CSS contract and assert emitted selectors. | Phase 1 issue  | Phase 1 acceptance |
| Preflight or tokens escape the owned root.                          | UI foundation owner | Open  | SharePoint or another web part changes appearance.  | Fail CSS and host-style lifecycle gates.                           | Phase 1 issue  | Phase 1 acceptance |
| A portal targets global `document.body` without scope.              | UI foundation owner | Open  | Theme, focus, document ownership, or z-order fails. | Require the UI context's portal host.                              | Phase 1 issue  | Phase 1 acceptance |
| Better Divider/Better List color control lacks parity.              | App owners          | Open  | Blocks complete Fluent removal.                     | Land and validate the owned color organism first.                  | Phase 0 issue  | Phase 0 acceptance |
| Ordinary `cdn` output contains stale assets.                        | Build owner         | Open  | Mixed generations may pass a weak handoff.          | Clear generated sources and prefer strict staging proof.           | Phase 1 issue  | Phase 1 acceptance |
| CSS-relative fonts/images or lazy chunks are absent.                | Build owner         | Open  | Local manifest passes but production breaks.        | Add closure checks and real browser network proof.                 | CDN issue      | Before CDN claim   |
| Protected CDN verification works but browser auth fails.            | Release owner       | Open  | Server-side proof overstates runtime readiness.     | Prove the actual browser auth/CORS/CSP model before adoption.      | CDN issue      | Before CDN claim   |
| A shared resource version is removed too early.                     | Release owner       | Open  | Deployed apps fail after rollback or cache expiry.  | Maintain reverse references and retention policy.                  | Retention ADR  | Before publication |
| Source scan reports zero Fluent imports while emitted code remains. | App owners          | Open  | False completion.                                   | Inspect production bundles, CSS, packages, and runtime requests.   | Phase 7 issue  | Phase 7 acceptance |

## Update Protocol

1. Refresh repository heads and relevant external documentation.
2. Update the roadmap row before implementation starts.
3. Work in an isolated branch/worktree and cite affected rule IDs in the PR.
4. Add or update phase tests with the implementation.
5. Record a public-safe summary or opaque evidence ID for local commands,
   commit SHA, PR, exact-head CI, artifact manifest, and browser evidence as
   each proof state is reached. Keep private details in their approved system.
6. Check an acceptance item only after its evidence exists.
7. Record exceptions and blockers explicitly. Do not convert them into silent
   scope changes.
8. Update `Last reviewed` and the progress count whenever a phase gate changes.
