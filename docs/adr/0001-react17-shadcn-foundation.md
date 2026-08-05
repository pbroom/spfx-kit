# ADR-0001: React 17 shadcn foundation

- Status: Accepted for implementation; Phase 1 runtime gate unproven
- Date: 2026-08-05
- Scope: Phase 0 and Phase 1 foundation work
- Related roadmap: [`docs/shadcn-migration-roadmap.md`](../shadcn-migration-roadmap.md)

## Decision state

This ADR accepts the implementation contract. It does not record a successful
spike, build, package, browser run, or SharePoint validation. `@pbroom` is the
accountable owner and phase approver through
[spfx-kit#82](https://github.com/pbroom/spfx-kit/issues/82). The evidence below
controls Phase 1 exit, not whether Phase 1 may start after the separate Phase 0
gate completes.

## Context

SPFx Kit must be able to adopt selected shadcn source components without changing the host runtime, leaking framework CSS into the SharePoint page, or creating a toolchain-specific implementation that cannot survive standalone export. The repository currently supports Vite for the lab, Heft for current SPFx builds, and retained Gulp compatibility. Those paths need one source profile and one CSS compiler contract.

The foundation must preserve the roadmap rules that React and React DOM stay at `17.0.1`, production components compile into each app, Tailwind Preflight does not reach the page, portals use the owning document and owned style scope, and emitted artifacts—not source inspection—decide acceptance.

## Decision

### 1. Runtime and JSX baseline

- `react` and `react-dom` remain exactly `17.0.1` for the initial profile.
- Every supported install, build, package, standalone export, and browser surface must resolve one React runtime and one React DOM runtime. No profile dependency may introduce a second runtime.
- React 18/19-only APIs are outside this profile, including `createRoot` and imports from `react-dom/client`.
- Imported source is normalized to classic JSX before its accepted digest is recorded. The normalized source must compile through the repository's supported TypeScript/SPFx path without requiring the automatic JSX runtime or a `react/jsx-runtime` import. The profile records both the upstream source digest and the normalized source digest so normalization is reviewable and reproducible.
- Dependency resolution must not rely on forced peer overrides that conceal an incompatible React range.

These are target constraints, not claims that the selected upstream source already satisfies them.

Normalization must bind the `React` namespace in every JSX file, convert public
ref-bearing wrappers to `React.forwardRef` where React 17 requires it, resolve
icon placeholders to pinned Lucide imports, rewrite aliases to app-owned paths,
and record every transformation. Import-source-aware guards reject
`react-dom/client`, `createRoot`, `hydrateRoot`, React core `useId`,
`useInsertionEffect`, `useSyncExternalStore`, transition/deferred APIs,
`React.use` or named `use` from React, React 19 action/optimistic/form APIs,
automatic-JSX-only output, and forced or legacy peer resolution. The pinned
`use-sync-external-store` shim remains permitted; a bare symbol-name scan must
not reject a React-17-compatible dependency shim.

### 2. Exact initial source profile

The first proposed source profile is pinned as follows:

| Field                     | Required value                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Profile ID                | `spfx-react17-base-nova-v1`                                                         |
| shadcn preset             | `base-nova`                                                                         |
| shadcn CLI/source version | `4.16.1`                                                                            |
| shadcn source revision    | `cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4`                                          |
| Base UI version           | `1.6.0`                                                                             |
| React / React DOM         | `17.0.1` / `17.0.1`                                                                 |
| React types               | `@types/react@17.0.45`, `@types/react-dom@17.0.17`                                  |
| Class utilities           | `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.6.0`              |
| Icons                     | retain `lucide-react@1.25.0` until a separate profile update passes                 |
| TypeScript matrix         | `5.3.3` and `5.8.3`                                                                 |
| Excluded dependencies     | `cmdk@1.1.1`, `sonner@2.0.7`, Radix primitives, `react-aria-components`, and `vaul` |

The profile manifest must also pin:

- the exact source component allowlist;
- every direct production dependency and exact version;
- the lockfile-resolved production dependency closure and npm integrity for
  every package, including Base UI, `@base-ui/utils`, Floating UI, Babel runtime,
  and `use-sync-external-store`, without forcing transitive overrides;
- the upstream digest of every accepted source file;
- the digest of the normalization transform and each normalized source file;
- the exact Tailwind CLI version and CSS input digest;
- the generated CSS digest and scope digest;
- the generator version and profile schema version.

The tooling identity also records npm integrity
`sha512-XLFzfNNIUPlUlyheFEzj0H4Vnhi9nI0nl3Nfgg8HYXW1FkUVhVT1X+mgmOUW8aWL5SeG0A+yJIV5fm3Hr9MVkQ==`
for `shadcn@4.16.1`. Accepted registry payloads record raw and canonical-JSON
SHA-256 values in addition to final normalized-source digests because the
hosted registry response is not frozen merely by the Git tag.

Commit every accepted raw registry JSON payload next to its canonical form and
normalized output. Normal builds, standalone builds, and CI operate offline and
verify those committed bytes and digests. Network access is permitted only in
an explicit profile-update command and PR; a missing snapshot is a build
failure, not permission to refetch mutable registry input.

The initial logical catalog is Button, Input, Field, Textarea, Checkbox,
Switch, Select, Combobox, Toggle Group, Tabs, Accordion, Dropdown Menu, Dialog,
Sheet, Popover, Tooltip, Alert, Badge, and Spinner. Its resolved source closure
also includes Label, Separator, Input Group, Toggle, and utilities. Command,
toast, Drawer, calendar/date controls, and the owned color organism are outside
the first compatibility spike.

The machine allowlist uses exact registry identifiers, including
`toggle-group`, `dropdown-menu`, and `input-group`; prose display names never
become registry keys.

`cmdk@1.1.1` and `sonner@2.0.7` are excluded because their current peer ranges
require React 18/19. Radix, React Aria, and `vaul` are excluded to prevent mixed
primitive bases. Adding any excluded dependency requires a separate profile
update and compatibility evidence.

Base UI `1.6.0` is intentional: `1.7.0` was published one day before this audit,
while `1.6.0` is the announced stable Base UI-default baseline and already
exports the required subpaths. Moving that pin is a profile-update PR that must
repeat the complete React 17, source-normalization, toolchain, browser, and
artifact matrix; it is never a routine `latest` refresh.

Components are app-owned source. They compile into each SPFx app and must not create a production runtime dependency on `@spfx-kit/*`. A profile update is a reviewed source change: regenerate the complete profile, review normalized source and dependency changes, rerun all affected evidence, and update consumers atomically. Rollback reverts the complete profile generation rather than mixing files from two generations.

### 3. Deterministic identity, document, and portal ownership

Each SPFx root must provide a deterministic ID namespace. IDs derive from stable inputs supplied by the host, such as the component instance identity plus a local semantic key; random IDs, process-global counters, DOM-order counters, and hydration-order assumptions are not accepted.

Every component that reads or writes browser globals, creates an overlay, or portals content must accept the owning `targetDocument` and an owned `portalHost`. It must use the matching window/document for events, focus, selection, measurement, and cleanup. It must not hard-code the process-global `document`, `window`, or `document.body` as its production portal contract.

The portal host must carry the same UI-profile and CSS-scope attributes and semantic token values as the originating root. Acceptance covers focus return, Escape handling, outside interaction, scroll locking, stacking, nested overlays, and teardown for more than one web part instance on a page. Shadow-root support, if enabled by a consumer, follows the same explicit document/style-root contract and requires its own spike evidence.

### 4. One portable Tailwind compiler contract

Tailwind 4 CLI is the single Tailwind compiler for the supported Vite, Heft, and Gulp paths. The exact CLI version is part of the profile. Vite plugins, PostCSS plugins, and per-toolchain Tailwind pipelines must not become parallel compilers with different outputs.

The compiler contract is:

- one checked-in CSS entry owned by the profile;
- `source(none)` with explicit source registration for the exact app and vendored component paths;
- a complete, reviewable policy for dynamic utilities; runtime-built class fragments are rejected unless represented by an explicit finite source/safelist;
- no Tailwind Preflight;
- no upstream Base Nova universal or `body` base rules;
- the `skui` utility prefix;
- semantic tokens defined only on owned app roots and owned portal hosts;
- a deterministic post-processing step that scopes every emitted selector beneath a digest-derived `data-spfx-ui-scope` selector, rewrites theme-root selectors to the owned scope, and namespaces keyframes and their references;
- no generic page-level `:root`, `html`, `body`, universal reset, unscoped token, or unscoped keyframe output;
- one generated app-owned CSS artifact whose bytes and digest are identical for equivalent inputs across supported build paths.

The compatibility/compiler spike must either pin and integrity-hash
`tw-animate-css` as an accepted CSS input or normalize every selected component
to remove its animation utilities. Unpinned or implicitly fetched animation
CSS cannot enter the profile.

Digest scoping supplements the `skui` prefix: the prefix reduces utility collisions, while the scope prevents token, component-selector, animation, and accidental arbitrary-selector leakage. A selector audit must reject output outside the allowed scope.

### 5. Vite, Heft, Gulp, and standalone portability

The portable source boundary contains the profile manifest, committed raw and
canonical registry payloads, normalized component source, lockfile/integrity
closure, Tailwind input, compiler configuration, scoping transform, generated
CSS contract, and build integration needed by an exported app. It must not
depend on incidental workspace hoisting, a lab-only generated registry, or a
normal-build network fetch.

- Vite imports the generated CSS artifact and does not compile a second Tailwind output.
- Heft runs the same compiler before bundling and uses its targeted webpack integration for the one declared global CSS artifact.
- Retained Gulp apps invoke the same compiler before bundling and add that same declared global CSS artifact through their supported webpack customization.
- Sass remains available for app styles but is not a second route for generating the Tailwind artifact.
- The integration targets the declared generated file; it must not turn all CSS modules or all dependency CSS into page-global CSS.
- Standalone export includes the exact profile, normalized source, compiler inputs/configuration, dependency declarations, lockfile, integration adapter, and verification command required to reproduce the app's target artifacts outside the monorepo.

Heft and Gulp details are proposed seams. They require a representative canary build before acceptance; this ADR does not claim that either integration currently passes.

### 6. Independent implementation boundaries

Implementation should remain reviewable and reversible through independent PRs in this order:

1. Profile schema, exact pins, source allowlist, classic-JSX normalization, and React-runtime compatibility spike.
2. Deterministic Tailwind CLI compiler, `skui` prefix, no-Preflight input, digest scoping, and selector/keyframe audit.
3. Root provider contract for semantic tokens, deterministic IDs, `targetDocument`, and `portalHost`, with multi-instance and overlay tests.
4. Vite, Heft, and retained-Gulp adapters that consume the same generated CSS, plus standalone reproduction fixtures.
5. App generator/vendor workflow and complete-profile update/rollback checks.
6. Export closure, evidence, release-set, remote verification, and rollback governance implemented under ADR-0003.

No PR should combine a new component profile, a compiler redesign, all build-system adapters, and release operations. A later PR may depend on an earlier merged contract, but each boundary needs its own validation and rollback point.

## Required Phase 1 Exit Evidence

Before Phase 1 can complete, its spike must produce atomic pass/fail/blocked
evidence for:

- a clean exact-version install with a dependency graph proving one React `17.0.1` and one React DOM `17.0.1`;
- exact source and normalized-source digest verification for the allowlisted profile;
- TypeScript/classic-JSX compilation of the normalized source without React 18/19-only APIs or hidden peer overrides;
- Button, Field/Input, Checkbox, Tabs, Select, Combobox, Dialog, and Tooltip
  behavior on React 17, including DOM-valued `ref.current` assertions for
  controls and triggers, controlled/uncontrolled state, keyboard navigation,
  focus trap/return, Escape, tooltip focus, the real 1,940-option font workload,
  and no serious or critical Axe findings;
- Vite, Heft, and representative retained-Gulp builds using the same CSS compiler inputs and producing the expected scoped CSS digest;
- emitted-JS inspection for duplicate React runtimes, unexpected `react/jsx-runtime`, and production `@spfx-kit/*` runtime dependencies;
- emitted-CSS inspection proving no Preflight, generic root/page selectors, unscoped tokens, unscoped keyframes, or out-of-profile utilities;
- browser behavior for multiple roots and overlays, including two independently
  bundled app copies whose module-local counters restart, deterministic
  unmount/remount cycles, document-unique IDs, correct `aria-*`/label
  relationships, owning-document behavior, portal style parity, focus,
  keyboard, outside interaction, and teardown;
- standalone clean install and build outside the monorepo.

Evidence is governed by ADR-0003. A source scan, local compile, or local mock alone must not be summarized as complete foundation proof.

## Consequences

The profile is intentionally narrower than upstream shadcn. Pinning source and normalized digests creates maintenance work, and per-app source ownership duplicates compiled component code between independently shipped apps. In return, SPFx apps retain control of React compatibility, emitted CSS, runtime isolation, and rollback.

The single-compiler rule makes CSS output comparable across toolchains, while adapter-specific packaging remains visible and testable. Digest scoping may require transforms for otherwise valid upstream selectors or animations; such transforms become part of the pinned profile and cannot be silently changed.

## Unresolved approvals and blockers

- `@pbroom` owns the decision and implementation gate through spfx-kit#82; this is self-acceptance, not independent review.
- The exact Tailwind CLI, selector-parser, and any remaining transitive build-only pins must be recorded by the compatibility/compiler spike.
- React 17 and classic-JSX compatibility for the pinned shadcn/Base UI source profile is unproven until the spike runs.
- Base UI's React 17 fallback IDs are module-local counters; the cross-bundle app/instance ID-prefix contract is a blocking spike assertion.
- The retained-Gulp canary app and its acceptance fixture are not yet selected.
- Shadow-root support is optional and cannot be claimed without separate evidence.
- ADR-0003 manifest-v2, retention, and rollback policies must be accepted before release readiness can be claimed.
