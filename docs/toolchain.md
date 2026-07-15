# SPFx Toolchain Decision

Last reviewed: 2026-07-13

## Decision

SPFx Kit creates new projects on the supported SPFx `1.23.2` baseline with
Node `22.22.3`, React `17.0.1`, TypeScript `5.8`, and Rush Stack Heft. Imported
Gulp projects remain supported as a compatibility path and keep their detected
toolchain during validation and export.

| Concern                   | Heft default                                  | Legacy Gulp compatibility                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------- |
| New projects              | Yes                                           | No                                          |
| Imported projects         | Detected and preserved                        | Detected and preserved                      |
| Build orchestration       | Config-driven Heft rig and plugins            | `gulpfile.js` and `@microsoft/sp-build-web` |
| Test and lint integration | Heft phases using Jest and ESLint             | Existing Gulp tasks                         |
| Customization             | Heft plugins or ejected webpack configuration | Existing Gulp tasks                         |
| Direction                 | Microsoft default from SPFx 1.22 onward       | Transition support for existing apps        |

Microsoft's [Heft-based toolchain guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/sharepoint-framework-toolchain-rushstack-heft)
makes Heft the strategic path for generated SPFx projects. Keeping Gulp
support is still necessary for real portfolios: an import should not silently
rewrite build behavior or require an unrelated migration before the app can be
previewed and packaged.

## Repository And App Boundary

The Vite lab and shared tooling use npm workspaces and Turbo. Deployable SPFx
apps do not join the root workspace dependency graph. Each app owns its
`package.json`, lockfile, local `node_modules`, Heft rig, and release artifact.

This boundary is deliberate. The current Microsoft Heft launcher selects the
project-local Heft installation, and the SPFx rig's base TypeScript paths are
relative to the app's local `node_modules`. Hoisting the canary through the root
npm workspace breaks those assumptions. The isolated app still participates in
the root workflow through explicit commands:

```sh
npm run ship:canary
npm run verify:sppkg -- --app examples/hello-card-spfx
```

The result is less implicit than a single workspace graph, but it matches the
shape of the standalone deployment repository and gives CI a reproducible
`npm ci` boundary.

## Release And Debug Gates

- `npm run ship` runs workspace release tasks and then builds the isolated
  Heft canary.
- `verify:sppkg` reads `config/package-solution.json`, resolves the exact
  `paths.zippedPackage` file, and validates its required package parts.
- Production dependency audits run separately for the root and canary locks.
- The hosted workbench is not a release gate. Microsoft has announced its
  retirement for December 1, 2026; use a modern SharePoint page and the
  [SPFx Debug Toolbar](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/debug-toolbar).

## SPFx CLI Watchlist

The new [`@microsoft/spfx-cli`](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/sharepoint-framework-cli)
has the right long-term shape: an open template system, decoupled template
versions, and support for custom sources. Microsoft currently labels its
documentation as pre-release and cautions production users to stay on the
supported setup path. Its published default templates also still target SPFx
`1.22.2` at this review date.

SPFx Kit therefore keeps its tested internal scaffold for production today.
Reassess the CLI when Microsoft removes the pre-release warning, its default
templates match the kit's supported SPFx baseline, and create/install/build/
package/export parity passes the same canary gates.

## Upgrade Checklist

When Microsoft publishes a new supported SPFx baseline:

1. Verify the Node, React, TypeScript, Heft, rig, and plugin matrix from the
   official release notes and generated project output.
2. Update the centralized defaults and committed canary together.
3. Regenerate both root and canary lockfiles with the pinned Node/npm runtime.
4. Run create, install, build, package, exact `.sppkg` verification, standalone
   export, browser, accessibility, and production audit gates.
5. Keep Gulp detection tests until the imported portfolio no longer needs the
   compatibility path.
