# ADR-0004: Code Workbench V1-To-V2 Owned-Module Migration

Status: Accepted for implementation
Date: 2026-08-05
Accountability: A0, A6, A7
Tracking: [Phase 0](https://github.com/pbroom/spfx-kit/issues/81), [Phase 6](https://github.com/pbroom/spfx-kit/issues/84), [Phase 7](https://github.com/pbroom/spfx-kit/issues/85)
Rules: R1-R3, R6, R10-R12

## Context

Code Workbench V1 persists authored TSX, HTML, CSS, Sass, TypeScript, and
JavaScript without declaring its UI profile or module bindings. Its current
runtime exposes the full `@fluentui/react-components` namespace to authored
code. Removing that resolver immediately could make saved source fail, while
retaining it indefinitely would prevent completion of the Fluent migration.

## Decision

Introduce a V2 persisted-source envelope with:

- `version: 2`;
- the existing authored source fields preserved losslessly;
- an explicit immutable owned UI-profile ID and digest;
- an explicit, sorted module-binding list;
- optional migration provenance that records the V1 digest, migration tool
  version, classification, and diagnostics without storing private content in
  the public evidence ledger.

V2 new/default source may request React, ReactDOM, the owned UI module, and the
other separately approved non-Fluent modules only. The owned UI binding resolves
the source-owned profile compiled into the Lab. It is not a production runtime
dependency for exported SPFx applications.

The V1 reader remains lossless and read-only. Loading a V1 record must not
rewrite, discard, or save it as V2 without an explicit migration action. Before
transformation, V1 records or representative user-supplied fixtures are
classified as:

1. non-Fluent and directly upgradable;
2. deterministically codemoddable using an explicitly supported Fluent-symbol
   map; or
3. unsafe to rewrite automatically.

An unsafe record receives a visible diagnostic and a lossless export/recovery
path. It is not executed with a broader resolver, remotely uploaded, or copied
into public evidence merely to complete the migration.

The legacy Fluent resolver is permitted only for classified, pre-existing V1
records while Phase 6 is open. New or migrated records cannot request it. The
resolver, allow-list entry, Workbench UI imports, production dependency, and
emitted code must be removed before Phase 6 exits. Any supported V1 record that
still requires Fluent blocks Phase 6; it cannot become a continuing Phase 7
exception.

## Migration And Verification

The migration tool must be deterministic and idempotent. For every fixture it
records source and output digests, classification, diagnostics, requested
bindings, and whether user review is required. It must preserve unchanged tabs,
timestamps/authorship metadata where present, and the original recoverable V1
payload.

Acceptance requires fixtures for all three classifications, malformed and
oversize payloads, unknown imports, aliases, type-only imports, unsupported
Fluent symbols, repeat migration, serialize/deserialize round trips, and the
lossless recovery path. Supported V2 fixtures must compile and render on React
17.0.1 using one runtime and the exact owned profile digest.

Public evidence contains only public fixture revisions, digests, aggregate
classification results, and opaque private-evidence IDs. Authored private
source remains in its approved private boundary.

## Removal Sequence

1. Add the V2 schema, decoder, diagnostics, inventory command, and fixtures.
2. Add the owned UI binding and block Fluent imports in new/V2 source.
3. Run the inventory and deterministic migrations; provide recovery for unsafe
   records.
4. Remove the Fluent resolver and Workbench Fluent UI after all supported
   records pass.
5. Update the generator, Hello Card, standalone export, documentation, and
   canaries so new work never reintroduces the V1 dependency.

The removal deadline is Phase 6 exit, tracked by
[spfx-kit#84](https://github.com/pbroom/spfx-kit/issues/84). Phase 7 cannot
accept an extension.

## Authority Boundary

This ADR authorizes repository implementation and local/CI validation only. It
does not authorize inspecting private authored sources, merging, release,
deployment, CDN publication, App Catalog mutation, or SharePoint mutation.
