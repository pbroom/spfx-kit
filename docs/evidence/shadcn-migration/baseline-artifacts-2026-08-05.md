# Phase 0 Emitted-Artifact Baseline — 2026-08-05

Status: Exact-head build and emitted-package inventory complete; no operational
or release proof claimed
Accountability: A0 / [spfx-kit#81](https://github.com/pbroom/spfx-kit/issues/81)

## Evidence boundary

This baseline records reproducible local builds and emitted bytes at the exact
source revisions in
[`baseline-source-2026-08-05.md`](baseline-source-2026-08-05.md). It is an
inventory, not an immutable ledger event. It does not establish exact-head
hosted CI for a migration release set, CDN publication, remote bytes or
headers, App Catalog deployment, site installation, SharePoint runtime,
browser behavior, or rollback. No release, deployment, upload, or external
mutation was performed.

All product builds used Node `22.22.3` and npm `10.9.8` from clean isolated
worktrees. Final SPPKG files were reopened with `unzip -t`; emitted JavaScript,
CSS, fonts, copied resources, component manifests, and loader bindings were
inspected directly. Hashes are SHA-256.

## Summary

| Surface                 | Exact source                               | Local validation                                                  | Primary emitted result                                                |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| SPFx Kit Lab and canary | `90bde2f30fd9db4f524583c5cad84de1063c5f21` | Build 6/6; 242 tests; ship and SPPKG verifier pass                | Lab dist `8,011,125` B; canary SPPKG `22,962` B                       |
| Better Text             | `2dc7d97b932b96cd655f0b6d9187d844b0a783dc` | 4 core + 17 Jest tests; build/ship pass                           | External-assets SPPKG `3,990` B with zero client assets               |
| Better Divider          | `ca247e0498eea2bba57005f33fb11582c0196d02` | Typecheck/webpack, build, and ship pass                           | Embedded SPPKG `4,919,678` B with 128 client assets                   |
| Better List             | `a8776ef895fb14609419f695fc819b2aeef09f8a` | 305 Jest assertions; 44/44 release tests; build/ship/release pass | Ship, standalone, and CDN-template packages; 71-asset release payload |

## SPFx Kit Lab and canary

The exact-head Lab production build emitted 23 files totaling `8,011,125`
bytes: `7,725,200` bytes of JavaScript, `195,106` bytes of CSS, and a `90,184`
byte font. One shared React core chunk was emitted. ReactDOM is in the Lab's
`dist-*` application chunk; no second React core or renderer was evident in the
emitted graph.

The baseline still contains substantial owned Fluent/Griffel code: 1,492
Fluent runtime marker occurrences, 487 unique, across three chunks. The Code
Workspace chunk alone contains 1,020 marker occurrences. These are emitted
facts; the direct-import source counts are not used as a substitute.

The Hello Card single/embedded canary emitted:

| Artifact           |  Bytes | SHA-256                                                            |
| ------------------ | -----: | ------------------------------------------------------------------ |
| `hello-card.sppkg` | 22,962 | `153e8717e12f6883bb899069785a6f6e8cb8286ad84ca83fa904ea49471398c6` |
| Main bundle        | 48,894 | `9f40238b1151573680b474486066359178a0b93df563c0ae53024c84254a3beb` |

The SPFx component manifest externalizes React and ReactDOM at `17.0.1`; the
bundle retains React's JSX runtime plus owned Fluent/Griffel implementation.
Only the single/embedded canary was produced for this snapshot. CDN,
staging-CDN, and standalone canary closure remain Phase 1 evidence work.

## Better Text and Better Divider

| Artifact                              | Package bytes | SPPKG entries | Embedded client assets | SHA-256                                                            |
| ------------------------------------- | ------------: | ------------: | ---------------------: | ------------------------------------------------------------------ |
| Better Text `better-text.sppkg`       |         3,990 |             8 |                      0 | `32bcd653dd69ea07852ef6742aeaf451133951778dd03c32cc7bbd77262cc982` |
| Better Divider `better-divider.sppkg` |     4,919,678 |           139 |                    128 | `1182f5cb8d3749be0d39d97fa3898663aad0aae4bef8626c7c311f42951ef67a` |

Both AMD entries externalize `react` and `react-dom`, and both manifests bind
them to SPFx component version `17.0.1`; neither artifact contains a second
full React renderer. Both main bundles retain React 17 JSX-runtime and
scheduler code and directly bundle Fluent v9 and Griffel runtime/style
machinery. No standalone application CSS is emitted: owned and Fluent styles
are injected by JavaScript, so the migration changes artifact shape as well as
imports.

| Surface        | Main JS bytes / SHA-256                                                      | Monaco chunk bytes | Top-level runtime closure |
| -------------- | ---------------------------------------------------------------------------- | -----------------: | ------------------------: |
| Better Text    | 414,376 / `2221b62c634301e0542454cfbb983b1eadb57a2bc227c0e6197143cd5cd852ff` |          3,930,675 |                 4,478,792 |
| Better Divider | 285,841 / `f4fd919cd093a3e478391bccdc407b3e3dc6d8b8f6a1da57b732b82af2b7502d` |          3,930,675 |                 4,350,257 |

Both release trees also copy the same complete Monaco `min/vs` distribution:
121 files and `15,700,863` uncompressed bytes, including a `7,011,550` byte
TypeScript worker and `308,989` byte `editor.main.css`. The compiled runtime
references the hashed ESM Monaco/SCSS closure and codicon font, not this raw
tree. Neither app configures `MonacoEnvironment`, `getWorker`, or
`getWorkerUrl`; the redundant raw worker tree is therefore not wired into this
emitted runtime.

Better Text has a material delivery gap: `includeClientSideAssets=false`, its
loader points to `https://cdn.example.com/spfx/better-text-spfx/`, the Azure
deployment configuration is blank, and CI publishes the SPPKG without the
external asset tree. Its package is structurally valid but not independently
runnable from repository delivery output.

Better Divider is self-contained. Its source release manifest names an Azure
Edge base, but packaging with `includeClientSideAssets=true` rewrites the
installed binding to `HTTPS://SPCLIENTSIDEASSETLIBRARY/`. All 128 packaged
client assets are byte-identical to `release/assets`; the external base is not
the installed package's active runtime binding.

For both apps, the generated component dependency audit reports
`asyncChunks: {}` despite three emitted async chunks, so it is not a complete
deployment-closure manifest. `npm run ship` also deletes tracked
`release/README.md` in a disposable worktree; no original worktree was changed.

## Better List

The exact-head build produced three valid packages:

| Variant                  |     Bytes | SPPKG entries | Embedded client assets | SHA-256                                                            |
| ------------------------ | --------: | ------------: | ---------------------: | ------------------------------------------------------------------ |
| Ship `better-list.sppkg` | 2,457,918 |            85 |                     71 | `300b199b0ae4b4535131cbfa526306c79aede440a25dcfc7cbb1c50913344aec` |
| `standalone.sppkg`       | 2,458,361 |            85 |                     71 | `f8d90d20aed624f758a87b83f48b917f56c9a4e65a6985cc3cbfd631ff865d3a` |
| `cdn-template.sppkg`     |     4,402 |            10 |                      0 | `18bae9398af0c4a7f9aa431109419bb0b9eae49d2581a5b6ea3c0071eef8db6c` |

The release `cdn-assets` directory contains 71 flat files totaling `9,321,316`
raw bytes (`2,429,571` bytes at gzip level 9). Its filenames and SHA-256 values
are byte-identical to the standalone package's `ClientSideAssets`: no file is
missing, extra, or mismatched. The standalone base is the SPFx client-side
asset library placeholder. The CDN template deliberately retains the
`https://cdn.invalid/better-list-spfx/` sentinel and is a handoff template, not
a deployable remote generation.

All three component manifests bind React and ReactDOM to SPFx `17.0.1` with no
second loader resource. Major release-payload weights are:

| Resource group                | Raw bytes | gzip-9 bytes |
| ----------------------------- | --------: | -----------: |
| Monaco                        | 3,931,434 |      994,463 |
| Canonical release main bundle |   994,338 |      276,407 |
| Fluent outline icon catalogs  | 2,483,446 |      564,423 |
| Fluent color icon catalogs    |   401,531 |       74,750 |
| Solar icon catalogs           | 1,169,705 |      279,079 |
| Fonts                         |   284,696 |      222,125 |

The canonical release main bundle is
`better-list_370eac4438143468044b.js`, SHA-256
`f211489e982abd8fff24a01ca5ddd0a2d36c5a70356651930d74f22eb2d7714a`.
It contains 139 unique `fui-*` class literals (502 occurrences), 439 unique
Fluent token literals (1,642 occurrences), and two Griffel
`data-make-styles-bucket` markers. Iconify's renderer is also in the main
bundle, separately from the generated icon catalogs. Production source maps or
stats are not emitted, so no exact Fluent/Griffel byte weight is claimed.
Across the full core output, including non-catalog/non-Monaco lazy and strings
chunks, the totals are 147 unique `fui-*` literals (510 occurrences), 439
unique Fluent token literals (1,749 occurrences), two Griffel markers, and
three Iconify marker occurrences.

The ship verifier accepted shared-foundation Monaco profile `0.1.0` at source
`ae736c6004b3fb3f12d87c73ea04cae16e2652e6`, Monaco `0.55.1`, bundled Monaco
CSS, flat payload shape, and bundled EB Garamond. The direct ship and temporary
release build share 63 byte-identical assets but rename or rehash eight
build-context-sensitive main, lazy, and Monaco files; their raw payloads differ
by one byte. Each package is internally closed, and the standalone and
CDN-template release variants use one exactly matching 71-file release payload.

The canonical prepared handoff archives are:

| Archive                                 |     Bytes | SHA-256                                                            |
| --------------------------------------- | --------: | ------------------------------------------------------------------ |
| `better-list-spfx-standalone-0.2.3.zip` | 9,363,059 | `0b679d8f36147f31c56722d7916b16b8ca1e6aea6d5616d0a4b810c3fa1abf93` |
| `better-list-spfx-cdn-kit-0.2.3.zip`    | 9,384,510 | `3131620694bb1915291e08fd4f54e34e12372758892d327804db5494b0770660` |

Their stored canonical standalone SPPKG and CDN template are respectively
`9,361,592` bytes / `857378f976ee5eb383825d0cb6aa8cac12f03f9a4f477648ab7af0c29520fb86`
and `8,662` bytes /
`d2a89109118ef779e319e89c815938a21566ef3af94088257b558d8f145ec823`.
`release:verify` materialized the template only to a temporary sentinel base;
it did not publish or deploy it.

## Reproduction outline

From clean isolated worktrees at the exact revisions:

```sh
source /Users/peterbroomfield/.nvm/nvm.sh
nvm exec 22.22.3 npm ci --no-audit --no-fund
nvm exec 22.22.3 npm install --include=optional --no-save --no-audit --no-fund

nvm exec 22.22.3 npm test
nvm exec 22.22.3 npm run build
nvm exec 22.22.3 npm run ship

unzip -t <artifact>.sppkg
unzip -q <artifact>.sppkg -d <inspection-directory>
shasum -a 256 <artifact>.sppkg <emitted-assets>
```

SPFx Kit additionally used its six-package filtered build, canary SPPKG
verifier, and Lab dist inventory. Better List additionally ran
`npm test -- --clean`, `npm run test:release`, and `npm run release:build`, then
reconciled CDN asset paths and hashes against the embedded standalone package.
The individual clean worktrees and exact command logs are disposable audit
inputs; the source revisions and artifact identities above are the durable
public baseline.

## Consequences for implementation

- Preserve SPFx's one React/ReactDOM `17.0.1` runtime; migration work must not
  replace the external binding or add a renderer.
- Generated UI CSS becomes an explicit app artifact and must be proven in each
  embedded and CDN closure; today most Fluent styling is injected from JS.
- Better Text's placeholder CDN and missing publication closure must not be
  normalized into a passing CDN baseline.
- Remove or justify duplicated raw Monaco workers before describing a shared
  Monaco resource as a size win; measure the final browser request graph.
- Better List's large icon catalogs and the current Fluent/Griffel runtime are
  concrete emitted-removal targets. Source-import removal alone cannot close
  the migration gate.
- Treat each export variant as a separate product. A valid SPPKG or matching
  local asset tree is not remote, SharePoint, browser, or rollback proof.
