# ADR-0002: Owned Color Control And Font Asset Policy

Status: Accepted for implementation; runtime parity remains an evidence gate
Date: 2026-08-05
Accountability: A0, A2, A3, A4, A5
Tracking: [Phase 0](https://github.com/pbroom/spfx-kit/issues/81), [Phase 2](https://github.com/pbroom/spfx-kit/issues/83), [Better Text](https://github.com/pbroom/better-text-spfx/issues/6), [Better Divider](https://github.com/pbroom/better-divider-spfx/issues/3), [Better List](https://github.com/pbroom/better-list-spfx/issues/59)
Rules: R1-R6, R9-R13

## Context

Shadcn does not supply the two-dimensional color area, hue slider, text inputs,
and conversion behavior already used by Better Divider and Better List. Better
Text separately exposes a large Google Fonts catalog and loads the selected
family from the public Google Fonts stylesheet service. Neither concern should
be disguised as a primitive swap or silently promoted to a shared CDN.

## Decision

### Color control

Build one source-owned `ColorField` organism with the stable controlled
contract `{ value, onChange }`. Its canonical source belongs to the accepted
SPFx React 17 UI profile and is deterministically copied into each consumer;
production apps must not gain a runtime `@spfx-kit/*` dependency.

The organism will:

- reuse the existing HSV, HSL, RGB, and hex conversion behavior already present
  in Better Divider rather than introducing a new color-runtime dependency;
- own its color area, hue slider, preview, and validated text inputs while
  composing accepted Button, Field, Input, and Popover source;
- accept the UI-root `targetDocument`, `portalHost`, `idPrefix`, theme, and
  teardown contract instead of falling back to global `document.body`;
- provide pointer, keyboard, focus-return, Escape, high-contrast, and reduced-
  motion behavior with explicit accessible names and current-value reporting;
- preserve application value formats and callbacks at the adapter boundary;
- remain app-bundled with app-owned CSS. It is not a shared CDN resource.

A temporary Fluent color island may be used only during Phase 2 development.
It must be linked to the owning phase issue and cannot satisfy Phase 2, 4, 5,
or 7 acceptance.

The organism is accepted for use only after parity fixtures cover valid and
invalid hex, HSV/HSL round trips, pointer clamping, arrow-key changes, focus
return, owner-document portals, persistence, theme changes, and teardown on
React 17.0.1.

### Better Text fonts

The Fluent migration does not change Better Text's existing public Google
Fonts behavior. Phase 3 may preserve the current catalog and
`fonts.googleapis.com` stylesheet loading, including the browser's subsequent
font requests, but it must not add another font provider or make the shadcn UI
foundation depend on remote fonts.

The selected family remains authored content. System/theme fonts remain the
default and failure fallback. The app must continue to function when remote
font requests time out, fail, are blocked by CSP, or are unavailable. The
runtime-external inventory must identify the intended Google stylesheet/font
origins and distinguish them from app-owned build assets; it may not exempt a
missing app-owned font, icon, CSS file, or chunk from artifact closure.

Moving a font into an app CDN or shared-resource CDN is a separate decision. It
requires license and provenance evidence, exact CSS/font closure, immutable
paths, MIME/CORS/CSP/cache proof, fallback behavior, retention, measured multi-
app benefit, and real SharePoint browser evidence. No font bytes are copied,
published, or licensed by this ADR.

## Distribution And Drift

The canonical profile records the color organism's source digest, normalized
output digest, dependency pins, transformation version, and license/provenance
identifier. Consumer sync runs offline in normal builds and fails when checked
source differs. Upstream or organism changes arrive only through a reviewed
profile-update PR with regenerated fixtures and digests.

## Consequences

- Better Divider and Better List share behavior through reviewed source without
  sharing a runtime package or CSS origin.
- Better Text's migration stays bounded to its property-pane UI; its remote
  font policy is explicit and independently testable.
- No bundle-size or reliability improvement is claimed before emitted artifacts
  and browser traces measure it.
- Operational font/CDN changes remain outside this ADR's authority.
