# Fluent UI To Shadcn Migration Roadmap

Last reviewed: 2026-08-05

Overall status: In progress — Phase 0 governance and exact source/artifact
baselines are implemented; trusted-history bootstrap and compatibility proof
remain open

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
applicable validation-matrix cell has a passing ledger row for the same release
set and exact artifact identities, and no blocking or expired exception
remains. That evidence includes repository gates, exact-head hosted CI,
emitted-package inspection, applicable CDN asset parity checks, and real modern
SharePoint-page validation without bundling another React or ReactDOM runtime.
No exception may authorize direct owned Fluent/Griffel application code at
completion.

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
| R9  | Keep licensed and private assets inside approved boundaries. Record licenses and provenance before copying or publishing an asset.                                                                                                                          | Opaque license/provenance evidence IDs and credential/LFS scan.              |
| R10 | A source scan does not prove Fluent removal, CDN completeness, or runtime parity. Inspect emitted JS/CSS, packages, response headers, and browser requests.                                                                                                 | Artifact inspection and browser trace.                                       |
| R11 | Keep the Better List editor implementation canonical. Regenerate or deterministically vendor downstream SCSS-only consumers; do not hand-edit generated copies.                                                                                             | Vendor-sync check and digest match.                                          |
| R12 | Mark a gate complete only when each required proof event has its own passing evidence-ledger row. Keep merge, remote bytes, response headers, SharePoint deployment, SharePoint runtime, and rollback proof distinct.                                       | Atomic ledger rows bound to one release set and exact artifact identities.   |
| R13 | Keep public tracking evidence safe. Store only a public-safe summary or opaque evidence ID here; keep private repository URLs, authenticated origins, licensed inventories, credentials, and protected source identifiers in their approved private system. | Evidence classification review and approved-system reference.                |
| R14 | Retaining a rollback artifact does not prove rollback. Before release acceptance, run an authorized non-production rollback drill against the exact retained package and resource bindings.                                                                 | Rollback-artifact row, separate rollback-drill row, and post-rollback trace. |

If a PR needs an exception, record the rule, reason, owner, expiry condition,
and removal issue before merge. An exception cannot silently redefine the goal.

## Tracking And Evidence Model

Delivery values:

- `planned`
- `in-progress`
- `submitted`
- `merged`
- `complete`
- `blocked`
- `deferred`

Evidence values:

- `pass`
- `fail`
- `blocked`
- `expired`

The absence of a ledger row means that the event has not run. Append a new row
to correct or repeat evidence; never overwrite history. A correction names one
or more earlier rows for the same event key in `Supersedes evidence IDs`. A
normal linear correction names its current leaf. Concurrent corrections may
independently name the same historical parent and create sibling leaves; a
conflict-resolution row names every current leaf so the completed append-only
graph returns to one current row.

Proof-event values:

- `baseline-inventory`
- `classification-acceptance`
- `accountability-acceptance`
- `decision-acceptance`
- `local-validation`
- `exact-head-ci`
- `local-mock-smoke`
- `artifact-closure`
- `remote-bytes`
- `remote-headers`
- `app-catalog-deployment`
- `site-install-update`
- `sharepoint-runtime`
- `fallback-negative-case`
- `rollback-artifacts-retained`
- `rollback-drill`

Each ledger row records one proof event. Phase 0 records each inventory,
classification, accountability assignment, and accepted decision as its own
`baseline-inventory`, `classification-acceptance`,
`accountability-acceptance`, or `decision-acceptance` row, scoped to the
specific criterion by phase/surface. These governance events bind the reviewed
source revision and public-safe repository evidence; they are not technical
`local-validation` results. No event implies another event. For example, a
SharePoint runtime pass does not prove exact remote bytes or response headers,
and a merged PR does not prove deployment. `local-mock-smoke` means only the
Lab/mock route passed. `remote-bytes` requires configured HTTPS exact-prefix
byte and checksum verification. `remote-headers` separately requires the
intended origin and header policy. `sharepoint-runtime` requires a real browser
loading the exact package and resource release on the target SharePoint origin.

### Evidence Ledger

| Evidence ID | Event key | Supersedes evidence IDs | Release set | Deployment topology ID | Phase/surface | Source revision | PR exact head | Export target | Package/archive SHA-256 | Deployment/resource-manifest SHA-256 | Environment class + opaque ID | Proof event | Result | Public evidence reference | Recorded UTC | Accountability |
| ----------- | --------- | ----------------------- | ----------- | ---------------------- | ------------- | --------------- | ------------- | ------------- | ----------------------- | ------------------------------------ | ----------------------------- | ----------- | ------ | ------------------------- | ------------ | -------------- |
| —           | —         | —                       | —           | —                      | —             | —               | —             | —             | —                       | —                                    | —                             | —           | —      | No evidence recorded      | —            | —              |

An immutable release-set manifest declares a trusted profile. `source-only`
contains exactly the `source` target and may bind source-subject governance or
technical proof, but cannot satisfy an application or delivery gate; Phase 0
governance proof requires this profile. `application-matrix` contains
`source`, `single`, `cdn`, `staging-cdn`, and `standalone`, with a bound artifact
for each deployable target. All four target outputs for one candidate therefore
share one set rather than becoming four partial sets. The manifest also groups
the exact public repository revisions or private revision evidence IDs, UI
profiles, packages, archives, and resource manifests that must work together.
Adding or removing a required target, or changing any source revision, profile,
package, archive, manifest, configuration identity, or target output rotates the
entire set. An environment does not: environment-specific rows share the release
set. A deployment topology ID groups the intended CDN origin, App Catalog,
tenant, and test site without exposing private identifiers.

Use `source`, `single`, `cdn`, `staging-cdn`, or `standalone` for the export
target. Record a literal repository/SHA and PR exact head only for public
sources. For private sources, record opaque revision and exact-head evidence
IDs backed by the approved private ledger. Use opaque IDs for private
environments and deployment topologies.

The event key is the stable combination of release set, topology, phase or
surface, export target, environment, and proof event. Its current result is the
unique leaf in the full correction graph for that key. Multiple leaves,
including concurrent sibling corrections from one historical parent, block
completion until one later row supersedes every current leaf. A phase reaches
`complete` only
when every required matrix cell has a current `pass` row for the same release
set and applicable topology, all of its code is merged, no current row is
failed, blocked, or expired, and it has no open blocker or expired exception.
Proof does not carry forward by similarity.

Use task boxes only for phase acceptance criteria. Check an item only when the
ledger contains the required atomic proof rows.

## Roadmap Summary

| Surface                                   | Rules                  | Delivery      | Required terminal events                          | Evidence IDs | Accountability                                                                  | Exception/blocker                        | Next gate                      |
| ----------------------------------------- | ---------------------- | ------------- | ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| Baseline and decisions                    | R1-R14                 | `in-progress` | Accepted baselines and ADRs                       | —            | A0 / [#81](https://github.com/pbroom/spfx-kit/issues/81)                        | Compatibility and artifact evidence open | Complete Phase 0 evidence      |
| React 17 UI and CSS foundation            | R1-R5, R7-R10, R12-R14 | `planned`     | Exact-head CI and canary artifact closure         | —            | A1 / [#82](https://github.com/pbroom/spfx-kit/issues/82)                        | Phase 0 gate incomplete                  | Phase 1 compatibility harness  |
| Canonical editor, Lab shell, and controls | R1-R14                 | `planned`     | Exact-head CI, vendor sync, and harness artifacts | —            | A2 / [#83](https://github.com/pbroom/spfx-kit/issues/83)                        | Phase 1 gate incomplete                  | Foundation accepted            |
| Better Text                               | R1-R14                 | `planned`     | CI, all app artifacts, and SharePoint runtime     | —            | A3 / [better-text#6](https://github.com/pbroom/better-text-spfx/issues/6)       | Phase 2 gate incomplete                  | Phase 2 accepted               |
| Better Divider                            | R1-R14                 | `planned`     | CI, all app artifacts, and SharePoint runtime     | —            | A4 / [better-divider#3](https://github.com/pbroom/better-divider-spfx/issues/3) | Phase 2 gate incomplete                  | Color-control evidence         |
| Better List                               | R1-R14                 | `planned`     | CI, all app artifacts, and SharePoint runtime     | —            | A5 / [better-list#59](https://github.com/pbroom/better-list-spfx/issues/59)     | Phase 2 gate incomplete                  | UI shell and portal contract   |
| Workbench, generator, and canary          | R1-R14                 | `planned`     | CI, persisted-source migration, export canaries   | —            | A6 / [#84](https://github.com/pbroom/spfx-kit/issues/84)                        | App phases incomplete                    | Owned module accepted          |
| Fluent removal and release acceptance     | R1-R14                 | `planned`     | Every required ledger event and rollback drill    | —            | A7 / [#85](https://github.com/pbroom/spfx-kit/issues/85)                        | All earlier phase evidence               | Explicit operational authority |

### Accountability Register

`@pbroom` is the only evidence-supported durable human identity and repository
administrator across the four public personal repositories. The same identity
therefore owns code and phase acceptance. This is self-acceptance, not an
independent GitHub review. Automated checks are evidence, not approvers.

No accountability entry authorizes an operational action. CDN publication,
App Catalog changes, site installation/update, SharePoint deployment, rollback,
merge, tag, and release each retain their explicit authority boundary.

| ID  | Phase | Repositories                                     | Accountable owner/team | Approver  | Tracking issue/ADR                                                                   | Due gate                  |
| --- | ----- | ------------------------------------------------ | ---------------------- | --------- | ------------------------------------------------------------------------------------ | ------------------------- |
| A0  | 0     | All in-scope repositories                        | `@pbroom`              | `@pbroom` | [spfx-kit#81](https://github.com/pbroom/spfx-kit/issues/81), ADR-0001–0004           | Before Phase 0 completion |
| A1  | 1     | SPFx Kit and fixture repositories                | `@pbroom`              | `@pbroom` | [spfx-kit#82](https://github.com/pbroom/spfx-kit/issues/82), ADR-0001, ADR-0003      | Before Phase 0 completion |
| A2  | 2     | SPFx Kit and all editor consumers                | `@pbroom`              | `@pbroom` | [spfx-kit#83](https://github.com/pbroom/spfx-kit/issues/83), ADR-0001, ADR-0002      | Before Phase 0 completion |
| A3  | 3     | Better Text and SPFx Kit                         | `@pbroom`              | `@pbroom` | [better-text#6](https://github.com/pbroom/better-text-spfx/issues/6), ADR-0002       | Before Phase 0 completion |
| A4  | 4     | Better Divider and SPFx Kit                      | `@pbroom`              | `@pbroom` | [better-divider#3](https://github.com/pbroom/better-divider-spfx/issues/3), ADR-0002 | Before Phase 0 completion |
| A5  | 5     | Better List and SPFx Kit                         | `@pbroom`              | `@pbroom` | [better-list#59](https://github.com/pbroom/better-list-spfx/issues/59), ADR-0002     | Before Phase 0 completion |
| A6  | 6     | SPFx Kit and supported persisted-source owners   | `@pbroom`              | `@pbroom` | [spfx-kit#84](https://github.com/pbroom/spfx-kit/issues/84), ADR-0004                | Before Phase 0 completion |
| A7  | 7     | All in-scope repositories and release operations | `@pbroom`              | `@pbroom` | [spfx-kit#85](https://github.com/pbroom/spfx-kit/issues/85), ADR-0003                | Before Phase 0 completion |

### Exception Register

| Rule | Reason | Owner | Approval | Expiry condition | Removal issue | State |
| ---- | ------ | ----- | -------- | ---------------- | ------------- | ----- |
| —    | —      | —     | —        | —                | —             | None  |

Do not publish coupling estimates as baselines. Phase 0 must record each count
with its exact repository SHA, inclusion/exclusion rules, reproducible command,
and opaque evidence ID where the repository is private.

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
- Inventory the Lab and Workbench Monaco runtime, including the current
  `https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs` default and its
  modules, CSS, workers, Codicon, and support assets. A2/A7 and issues #83/#85
  own removal to bundled/local assets or the complete shared-resource proof;
  never permit an implicit public-CDN fallback.
- Define the evidence-ledger storage and required terminal event matrix.
- Define the authorized non-production rollback-drill playbook.
- Inventory supported persisted Code Workbench sources and decide their owned
  module migration and compatibility policy.

Phase 0 ledger mapping:

- Repository heads and source, emitted-artifact, Workbench, font, and Monaco
  inventories require separate `baseline-inventory` rows for their scopes.
- Source, app-asset, app-CDN, and optional shared-resource classifications
  require `classification-acceptance` rows.
- A0-A7 assignments, approvers, issue/ADR links, risk owners, and removal owners
  require `accountability-acceptance` rows.
- Registry, rollback, color, font, Monaco delivery, Workbench compatibility,
  evidence-contract, and other ADR/policy decisions require
  `decision-acceptance` rows.

A criterion spanning more than one category requires every named event. For
example, the Monaco criterion requires its inventory, accountability, and
decision rows. The post-merge trust-bootstrap probes are external observations;
they do not substitute for these first post-bootstrap ledger rows.

Decision records:

- [ADR-0001](adr/0001-react17-shadcn-foundation.md) pins the proposed React 17
  shadcn/Base UI source profile, normalization, CSS isolation, and delivery
  architecture. Its compatibility and toolchain spikes remain blocking proof.
- [ADR-0002](adr/0002-owned-ui-asset-policy.md) accepts the source-owned color
  organism and preserves Better Text's existing Google Fonts behavior without
  adding a shared font dependency.
- [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md) defines
  atomic public/private evidence, release-set and topology binding, retention,
  and the separately authorized non-production rollback drill.
- [ADR-0004](adr/0004-workbench-v1-v2-migration.md) accepts the lossless V1
  reader, explicit V2 module/profile bindings, deterministic classification,
  and the Phase 6 Fluent-resolver removal deadline.

Tracking topology:

- Umbrella and Phase 0: [spfx-kit#81](https://github.com/pbroom/spfx-kit/issues/81)
- Foundation and editor/Lab: [spfx-kit#82](https://github.com/pbroom/spfx-kit/issues/82),
  [spfx-kit#83](https://github.com/pbroom/spfx-kit/issues/83)
- Applications: [better-text#6](https://github.com/pbroom/better-text-spfx/issues/6),
  [better-divider#3](https://github.com/pbroom/better-divider-spfx/issues/3),
  [better-list#59](https://github.com/pbroom/better-list-spfx/issues/59)
- Workbench/generator and final acceptance:
  [spfx-kit#84](https://github.com/pbroom/spfx-kit/issues/84),
  [spfx-kit#85](https://github.com/pbroom/spfx-kit/issues/85)

Bootstrap sequencing: the governance PR introduces the empty ledger and the
base-trusted history workflow, complete protected workflow tree, isolated v1
validator runtime, and trust manifest. It does not self-record immutable
evidence. The first release-set manifest and rows land only after that trust
base exists on the base branch, positive and negative probes prove its
`spfx-kit/evidence-history-v1` status is attached to the exact candidate head,
and that status is required on `main`.

Later trust-version changes follow the fail-closed cutover in
[`bootstrap-main-ruleset.md`](evidence/shadcn-migration/bootstrap-main-ruleset.md):
a named bypass actor is configured temporarily under an authorization limited
to the exact replacement SHA while v1 stays required, the bypass actor is
removed immediately, and v1 blocks ordinary merges during v2 probes. Repository
policy adds the proven v2 requirement before removing v1; a failed transition
restores the reviewed v1 tree through the same temporary named-actor mechanism
under a new exact-SHA authorization. Simultaneously green v1/v2 statuses are not
claimed.

Acceptance checklist:

- [ ] Each repository baseline is tied to a commit SHA.
- [ ] Direct-source and emitted-artifact inventories are recorded in
      [`baseline-source-2026-08-05.md`](evidence/shadcn-migration/baseline-source-2026-08-05.md)
      and
      [`baseline-artifacts-2026-08-05.md`](evidence/shadcn-migration/baseline-artifacts-2026-08-05.md).
- [ ] The source/app/shared-resource classification is accepted.
- [ ] The registry update and rollback process is accepted.
- [ ] The color-control and font-policy decisions are recorded or explicitly
      blocked with owners.
- [ ] The Lab/Workbench Monaco jsDelivr runtime has a named owner, complete
      closure inventory, and removal-or-proof gate; bundled/local delivery is
      the default and no implicit public-CDN fallback is allowed.
- [ ] Accountability rows A0-A7 name concrete people or teams, approvers, and
      issue/ADR IDs; no `Unassigned`, `Unlinked`, or generic role remains.
- [ ] Every open risk and exception links to a concrete accountable row and
      issue/ADR.
- [ ] The Workbench migration has a named owner, a removal issue, and an expiry
      no later than Phase 7 acceptance.
- [ ] The evidence ledger, terminal matrix, protected v1 validator contract,
      and rollback-drill procedure are accepted in repository governance.
- [ ] The v1 trust base is present on `main`, its positive and negative probes
      pass, and its candidate-head status is required by the effective ruleset.

Exit evidence: architecture decision records, inventory output, and linked
issues/PRs. No UI migration starts before this gate is complete.

## Phase 1 — React 17 UI, Styling, And Delivery Foundation

Outcome: produce a small, reviewed foundation that builds and behaves the same
way in the lab and SPFx production paths.

Included work:

- Curate Button, Input, Field, Textarea, Checkbox, Switch, Select, Combobox,
  Toggle Group, Tabs, Accordion, Dropdown Menu, Dialog, Sheet, Popover, Tooltip, Alert,
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
- [ ] Button/Input/Dialog-trigger refs resolve to DOM elements; controlled state,
      keyboard behavior, the 1,940-option font combobox, and Axe checks pass.
- [ ] Vite, Heft, and retained Gulp fixtures consume the same source and CSS
      contract.
- [ ] Production CSS contains expected prefixed selectors and no unscoped
      reset or generic `:root` token block.
- [ ] Portal, theme, deterministic-ID, focus-return, Escape, and teardown tests
      pass for multiple roots and two independently bundled app copies in one
      document, with unique IDs and correct label/ARIA relationships across
      deterministic remounts.
- [ ] A host-style lifecycle test proves mount, theme change, and unmount do not
      alter SharePoint-owned styles or nodes.
- [ ] `single`/embedded, `cdn`, `staging-cdn`, and `standalone` export/build
      paths contain or correctly reference the generated UI CSS and its full
      relative-asset closure from the same source revision.
- [ ] A clean standalone install/build outside the monorepo reproduces that CSS
      closure, and the staging upload tree and strict deployment manifest
      reconcile every generated CSS-relative asset.

Exit evidence: pinned profile manifest, focused compatibility suite, emitted
CSS report, SPFx canary package, and local browser record.

## Phase 2 — Canonical Editor, Lab Shell, And Generic Property Controls

Outcome: remove the shared editor dependency that blocks downstream apps, then
make the Lab the compatibility and parity harness while keeping managed app
adapters stable.

Included work:

- Migrate the canonical source editor's menu, tab, provider, and floating-layer
  chrome to the accepted owned UI source.
- Add `targetDocument`, portal-host, ID, style-root, focus, and teardown
  contracts for multiple owner documents.
- Remove direct Fluent imports and Fluent peer dependencies from the canonical
  source-editor package.
- Generate a full profile for Better List and deterministic SCSS-only profiles
  for Better Text and Better Divider. Exclude HTML language contributions and
  unrelated support assets from the SCSS-only emitted graphs.
- Regenerate every current consumer and enforce profile/version/digest drift in
  CI. Downstream apps must not hand-edit the generated sources.
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

- [ ] The canonical source-editor package has zero direct Fluent imports and no
      Fluent peer dependency.
- [ ] Editor menus, tabs, floating portals, target documents, focus, IDs, and
      teardown pass against React 17 and multiple owner documents.
- [ ] Better List's full profile and Better Text/Divider SCSS-only profiles are
      deterministic; vendor-sync and digest checks pass.
- [ ] SCSS-only production graphs contain no unused HTML language contribution.
- [ ] Lab shell and generic controls contain no direct Fluent imports.
- [ ] Better Text and Better Divider adapters need no visual-library imports.
- [ ] Large-option combobox, color, select, radio, editor, and grouped-control
      behavior matches the current contracts.
- [ ] Light, dark, custom section, mobile, and narrow property-pane tests pass.
- [ ] Managed previews receive no Tailwind reset or token leakage.
- [ ] Lab E2E and Axe gates pass on the exact submitted head.

Exit evidence: editor profile manifests and digests, vendor-sync results, Lab
screenshots/traces, accessibility report, test run, and exact PR head.

## Phase 3 — Better Text

Outcome: remove Better Text's direct Fluent dependency without conflating that
work with a rich-text-editor redesign.

Included work:

- Replace the two property-pane dropdowns and the large Google-font combobox.
- Replace the hard-coded light Fluent provider with the shared theme/UI root.
- Preserve the rich-text editor, value/onChange behavior, target metadata,
  target rename, shadow-root behavior, and authored CSS contracts.
- Consume the Phase 2-accepted SCSS-only editor profile; do not fork or
  first-migrate editor chrome in this phase.

Acceptance checklist:

- [ ] Direct Fluent imports are zero in owned Better Text production source.
- [ ] The recorded editor profile/version/digest matches the accepted Phase 2
      evidence.
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
  editor schema and the Phase 2-accepted SCSS-only profile before parity
  sign-off.

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
7. Consume the accepted full editor profile and reject divergent hand edits.

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

## Phase 6 — Code Workbench, Generator, And Canary

Outcome: remove remaining platform blockers and make new work start on the
accepted foundation.

Included work:

- Introduce a V2 persisted-source schema with an explicit owned UI-profile and
  module binding. Continue to decode V1 records without silently rewriting or
  discarding authored source.
- Inventory V1 sources as non-Fluent and directly upgradable, safely
  codemoddable from supported Fluent symbols, or unsafe to rewrite. Unsafe
  records require a visible diagnostic, lossless export/recovery, and
  owner-led migration.
- Allow the legacy Fluent resolver only for classified pre-existing V1 records
  while Phase 6 is in progress. New and migrated sources may request only the
  owned UI module.
- Remove the Fluent resolver, approved-module entry, Workbench UI imports, and
  production dependency before Phase 6 exits. An unresolved legacy source
  blocks the phase; it cannot become a continuing completion exception.
- Update `create:spfx`, the Hello Card canary, standalone export templates,
  examples, and golden-path tests to emit the accepted React 17 foundation.
- Keep app source and dependency boundaries intact for exported repositories.

Acceptance checklist:

- [ ] V1 fixtures are classified and migrate deterministically to V2 where safe;
      unsupported fixtures retain a lossless export/recovery path.
- [ ] New and migrated sources cannot request
      `@fluentui/react-components`.
- [ ] Every supported persisted-source fixture compiles and renders through the
      owned module or documented non-Fluent V1 reader.
- [ ] The Fluent approved-module entry/resolver, Workbench UI imports,
      production dependency, and emitted code are removed before phase exit.
- [ ] The named owner, removal issue, migration report, and expiry evidence are
      recorded; no Workbench deprecation exception remains.
- [ ] A newly generated app installs, builds, runs in the lab, ships, and exports
      without direct Fluent source.
- [ ] Web-part and extension-only canaries pass the full export matrix.
- [ ] The standalone export builds with only its own repository and lockfile.

Exit evidence: persisted-source inventory and V1-to-V2 fixtures, owned-module
digest, generator fixtures, canary artifacts, and compatibility notes.

## Phase 7 — Fluent Removal And Release Acceptance

Outcome: remove direct Fluent/Griffel coupling only after every replacement and
delivery path is proven.

Included work:

- Remove all direct Fluent component, icon, and Griffel dependencies from the
  Lab and owned application source. SPFx transitive Fluent packages may remain.
- Replace or retire Fluent-specific tests and documentation without weakening
  behavior coverage.
- Re-run clean builds and inspect emitted assets rather than relying on source
  searches.
- Run a SharePoint page matrix with native SharePoint UI and multiple migrated
  web parts mounted together.
- Record measured JavaScript, CSS, request-count, and cache results without
  assuming improvement.

Acceptance checklist:

- [ ] Source and emitted artifacts contain no direct owned Fluent/Griffel
      application code.
- [ ] Code Workbench exposes no Fluent approved module or legacy resolver, all
      supported persisted-source fixtures pass, and no exception authorizes
      direct Fluent/Griffel application code.
- [ ] Root and app exact-head CI is green.
- [ ] Root, workspace, app, and canary package manifests contain no direct
      Fluent component, Fluent icon, or Griffel dependency; lockfile and
      dependency-tree evidence proves every remaining Fluent package is
      reachable only through SPFx transitive ancestry.
- [ ] Embedded, app-CDN, staging-CDN, and standalone artifacts are reconciled
      to the same source revisions.
- [ ] Applicable `remote-bytes`, `remote-headers`,
      `app-catalog-deployment`, `site-install-update`, and
      `sharepoint-runtime` ledger rows pass for the same release set and
      applicable deployment topology.
- [ ] Exact rollback packages and resource bindings are retained and recorded.
- [ ] In an authorized non-production App Catalog and test site, operators
      verify the candidate, restore the prior supported `.sppkg` without
      changing immutable CDN bytes, verify its exact resource generation and
      browser runtime, then restore and verify the candidate. The ledger records
      both evidence sets, traces, operator, elapsed recovery time, and cached
      failure handling.
- [ ] Documentation and the tracker reflect the final supported state.

Exit evidence: final source/artifact scan, CI links, release manifests, browser
traces, performance measurements, and rollback-drill ledger rows.

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
reserved and unsupported. Keep the runtime namespace closed until the complete
production resource closure, provider-side deployment, and real browser
authentication/runtime path are proven. If approved private evidence
contributes to that proof, record only a public-safe summary or opaque evidence
ID under R13.

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
headers. It can earn only the `remote-bytes` event. Implement
`remote-headers` verification using an independently trusted SharePoint origin
and MIME/cache policy, then keep App Catalog deployment, site installation, and
real-browser events separate.

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
- Retain the previous supported package and its exact resource generation until
  the non-production rollback drill passes and the stated retention window
  ends.

## Cross-Repository Validation Matrix

Each implementation phase selects the relevant rows and records evidence in
the roadmap summary.

| Gate                                        | Lab                     | Better Text               | Better Divider            | Better List               | Generator/canary          |
| ------------------------------------------- | ----------------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| React 17 singleton and peer audit           | Required                | Required                  | Required                  | Required                  | Required                  |
| TypeScript, lint, and focused tests         | Required                | Required                  | Required                  | Required                  | Required                  |
| Full local repository gates                 | Required                | Required                  | Required                  | Required                  | Required                  |
| Role, keyboard, focus, Escape, and Axe      | Required                | Required                  | Required                  | Required                  | Required                  |
| Theme, portal, ID, and host-style lifecycle | Required                | Required                  | Required                  | Required                  | Required                  |
| Clean `single` artifact                     | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Clean `cdn` artifact                        | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Strict `staging-cdn` local proof            | Harness/canary required | Required                  | Required                  | Required                  | Required                  |
| Exact-prefix remote bytes and SHA-256       | Harness/canary required | Required before CDN claim | Required before CDN claim | Required before CDN claim | Required before CDN claim |
| Production-provider response headers        | Harness/canary required | Required before CDN claim | Required before CDN claim | Required before CDN claim | Required before CDN claim |
| Standalone clean install/build              | Not applicable          | Required                  | Required                  | Required                  | Required                  |
| Exact-head hosted CI                        | Required                | Required                  | Required                  | Required                  | Required                  |
| App Catalog deployment                      | Canary support          | Required before release   | Required before release   | Required before release   | Required before release   |
| Test-site install or update                 | Canary support          | Required before release   | Required before release   | Required before release   | Required before release   |
| Real SharePoint runtime and network trace   | Harness support         | Required                  | Required                  | Required                  | Required                  |
| Prior package/resource retention            | Not applicable          | Required before release   | Required before release   | Required before release   | Required before release   |
| Authorized non-production rollback drill    | Canary support          | Required before release   | Required before release   | Required before release   | Required before release   |

## Decision Log

| ID  | Status   | Decision                                                                                                                                       | Accountability | Recorded   | Evidence/ADR                                                                                                                                                                                                       | Revisit condition                                                          |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| D1  | Accepted | Keep React and ReactDOM at `17.0.1`.                                                                                                           | A1             | 2026-08-05 | SPFx matrix and `toolchain.md`                                                                                                                                                                                     | Microsoft's supported SPFx runtime changes.                                |
| D2  | Accepted | Use the pinned `spfx-react17-base-nova-v1` shadcn profile backed by Base UI `1.6.0`.                                                           | A1             | 2026-08-05 | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                             | Phase 1 compatibility spike fails or primitive support changes.            |
| D3  | Accepted | Distribute UI components as reviewed source with committed registry payloads and deterministic digests.                                        | A1             | 2026-08-05 | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                             | Standalone or drift enforcement cannot be proven.                          |
| D4  | Accepted | Compile generated UI CSS per app and keep it essential/app-owned.                                                                              | A1             | 2026-08-05 | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                             | CSS closure, isolation, or parity gates fail.                              |
| D5  | Accepted | Keep app-CDN and shared-resource contracts separate.                                                                                           | A7             | 2026-08-05 | Current app export contracts                                                                                                                                                                                       | One contract proves both lifecycles without weakening either validator.    |
| D6  | Accepted | Keep the `/shared/...` runtime namespace closed.                                                                                               | A7             | 2026-08-05 | Reserved mock route and validators                                                                                                                                                                                 | Production closure, provider deployment, and browser runtime are proven.   |
| D7  | Accepted | Keep Better List's source editor canonical.                                                                                                    | A2             | 2026-08-05 | Existing shared-editor architecture                                                                                                                                                                                | A separately approved replacement becomes canonical.                       |
| D8  | Accepted | Migrate the foundation, canonical editor/Lab, Better Text, Better Divider, Better List, then platform cleanup.                                 | A0             | 2026-08-05 | [Roadmap](shadcn-migration-roadmap.md), [#81](https://github.com/pbroom/spfx-kit/issues/81)                                                                                                                        | Phase dependencies or compatibility evidence require resequencing.         |
| D9  | Accepted | Remove the implicit Lab/Workbench jsDelivr Monaco default in favor of bundled/local assets unless the full shared-resource contract is proven. | A2/A7          | 2026-08-05 | [Roadmap](shadcn-migration-roadmap.md), [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#83](https://github.com/pbroom/spfx-kit/issues/83), [#85](https://github.com/pbroom/spfx-kit/issues/85) | A complete immutable resource closure and real-browser proof are accepted. |

## Risks And Blockers

| Risk or blocker                                                     | Accountability | State | Effect                                              | Required response                                                                                                 | Tracking issue/ADR                                                                                                                                                                                                                       | Due gate           |
| ------------------------------------------------------------------- | -------------- | ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A selected shadcn dependency requires React 18/19.                  | A1             | Open  | Breaks the SPFx runtime contract.                   | Reject or adapt the component source; never force the peer graph.                                                 | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                                                   | Phase 1 start      |
| Tailwind selectors are hashed as CSS Modules.                       | A1             | Open  | Literal component classes stop working.             | Use the targeted global-CSS contract and assert emitted selectors.                                                | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                                                   | Phase 1 acceptance |
| Preflight or tokens escape the owned root.                          | A1             | Open  | SharePoint or another web part changes appearance.  | Fail CSS and host-style lifecycle gates.                                                                          | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#82](https://github.com/pbroom/spfx-kit/issues/82)                                                                                                                                   | Phase 1 acceptance |
| A portal targets global `document.body` without scope.              | A1/A2          | Open  | Theme, focus, document ownership, or z-order fails. | Require the UI context's portal host.                                                                             | [ADR-0001](adr/0001-react17-shadcn-foundation.md), [#83](https://github.com/pbroom/spfx-kit/issues/83)                                                                                                                                   | Phase 2 acceptance |
| Better Divider/Better List color control lacks parity.              | A4/A5          | Open  | Blocks complete Fluent removal.                     | Implement and validate the accepted organism in Phase 2 before app adoption.                                      | [ADR-0002](adr/0002-owned-ui-asset-policy.md), [#83](https://github.com/pbroom/spfx-kit/issues/83), [divider#3](https://github.com/pbroom/better-divider-spfx/issues/3), [list#59](https://github.com/pbroom/better-list-spfx/issues/59) | Phase 2 acceptance |
| Ordinary `cdn` output contains stale assets.                        | A1/A7          | Open  | Mixed generations may pass a weak handoff.          | Clear generated sources and prefer strict staging proof.                                                          | [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#82](https://github.com/pbroom/spfx-kit/issues/82), [#85](https://github.com/pbroom/spfx-kit/issues/85)                                                               | Phase 1 acceptance |
| CSS-relative fonts/images or lazy chunks are absent.                | A1/A7          | Open  | Local manifest passes but production breaks.        | Add closure checks and real browser network proof.                                                                | [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#82](https://github.com/pbroom/spfx-kit/issues/82), [#85](https://github.com/pbroom/spfx-kit/issues/85)                                                               | Before CDN claim   |
| Lab/Workbench Monaco still loads from jsDelivr.                     | A2/A7          | Open  | Private, CSP, or offline use can fail.              | Remove the implicit public default or satisfy the full shared-resource proof; never retain a public-CDN fallback. | [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#83](https://github.com/pbroom/spfx-kit/issues/83), [#85](https://github.com/pbroom/spfx-kit/issues/85)                                                               | Phase 2 acceptance |
| Protected CDN verification works but browser auth fails.            | A7             | Open  | Server-side proof overstates runtime readiness.     | Prove the actual browser auth/CORS/CSP model before adoption.                                                     | [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#85](https://github.com/pbroom/spfx-kit/issues/85)                                                                                                                    | Before CDN claim   |
| A shared resource version is removed too early.                     | A7             | Open  | Deployed apps fail after rollback or cache expiry.  | Maintain reverse references and retention policy.                                                                 | [ADR-0003](adr/0003-evidence-release-and-rollback-governance.md), [#85](https://github.com/pbroom/spfx-kit/issues/85)                                                                                                                    | Before publication |
| Source scan reports zero Fluent imports while emitted code remains. | A3-A7          | Open  | False completion.                                   | Inspect production bundles, CSS, packages, and runtime requests.                                                  | [Phase 7 #85](https://github.com/pbroom/spfx-kit/issues/85)                                                                                                                                                                              | Phase 7 acceptance |

## Update Protocol

1. Refresh repository heads and relevant external documentation.
2. Update the roadmap row before implementation starts.
3. Work in an isolated branch/worktree and cite affected rule IDs in the PR.
4. Add or update phase tests with the implementation.
5. Append one public-safe ledger row per proof event. Bind it to the exact
   event key, release set, topology, artifact identities, environment class,
   accountability row, and superseded evidence. Keep private details in their
   approved system.
6. Check an acceptance item only after all of its required current ledger rows
   pass. A new revision or artifact requires new evidence.
7. Record exceptions and blockers explicitly. Do not convert them into silent
   scope changes.
8. Update `Last reviewed` and the progress count whenever a phase gate changes.
