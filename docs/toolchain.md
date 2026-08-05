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

## App Catalog Metadata In Exports

The Lab's **App settings → App export config** can add optional listing
metadata to an exported SharePoint package. No listing field is required for
an internal package. During export, SPFx Kit applies the saved values to the
app's `config/package-solution.json`; the generated `.sppkg`, rather than the
Lab sidecar alone, contains the resulting metadata.

| App export setting           | Exported SPFx value                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| App name                     | `solution.name`; it also remains the primary web part title through the existing export overlay    |
| Short description            | `solution.metadata.shortDescription.default`                                                       |
| Long description             | `solution.metadata.longDescription.default`; SPFx supports HTML on the app About page              |
| Video URL                    | `solution.metadata.videoUrl`; only YouTube and Vimeo URLs are accepted                             |
| Screenshots                  | `solution.metadata.screenshotPaths`; at most five package-local PNGs or non-local HTTPS image URLs |
| App Catalog icon             | `solution.iconPath`; a package-local PNG path                                                      |
| Categories                   | `solution.metadata.categories`; at most three values from Microsoft's supported category list      |
| Developer / organization     | `solution.developer.name`                                                                          |
| Website                      | `solution.developer.websiteUrl`                                                                    |
| Privacy statement            | `solution.developer.privacyUrl`                                                                    |
| Terms of use                 | `solution.developer.termsOfUseUrl`                                                                 |
| Microsoft partner identifier | `solution.developer.mpnId`                                                                         |

The previous **Description** value is not discarded or moved to a new storage
key. Existing saved values are shown as **Short description** and also become
`solution.metadata.shortDescription.default`. The export continues to apply
that text to the app package description, feature description, and primary web
part description as before. The new long description is independent and
optional.

### Toolbox Icon Versus App Catalog Icon

These are different SharePoint surfaces and different manifest fields:

- **Toolbox icon** is the existing App Icon setting under its clearer label. It updates the primary web
  part manifest's `officeFabricIconFontName` or `iconImageUrl` and appears when
  an editor chooses a web part. Microsoft documents the rendered toolbox image
  as 40 by 28 pixels.
- **App Catalog icon** is a listing image packaged through
  `solution.iconPath`. It represents the solution on SharePoint's app listing
  and details surfaces. It does not change the web part toolbox icon.

See Microsoft's [web part icon
guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/basics/configure-web-part-icon)
and the current [`package-solution.json`
schema](https://developer.microsoft.com/json-schemas/spfx-build/package-solution.schema.json).

### Images And Paths

A local App Catalog icon or screenshot must be a PNG relative to `paths.packageDir`,
which is `sharepoint/` by default. For example, an app can keep
`sharepoint/images/catalog-icon.png` and save `images/catalog-icon.png` as its
catalog icon path. Absolute filesystem paths, path traversal, missing files,
unsupported image files, and duplicate packaged screenshot names are rejected.
SPFx Kit fully checks each package-local PNG's chunks and checksums and decodes
its bounded image data before accepting it. Package-local GIF and JPEG files
are rejected because container framing alone cannot prove that their LZW or
entropy-coded image data is renderable without adding another decoder runtime.

Screenshot URLs may instead be absolute, non-local HTTPS URLs. These references
are not downloaded or presented as locally decoded images. The SPFx
packager leaves those URLs external. It copies package-local screenshots into
the `.sppkg` and rewrites their metadata references to packaged filenames, so
these listing images remain package assets in both standalone and CDN export
flows. A CDN URL for the JavaScript bundles is not a substitute for a local
catalog image path.

Microsoft's schema permits up to five screenshots and describes the video as a
YouTube or Vimeo link, with a recommended length of 60–90 seconds. It does not
define stable image dimensions; SharePoint's current properties panel supplies
the applicable size guidance when an administrator manages the app. SPFx Kit
therefore validates supported image files and package safety without claiming
an undocumented pixel size. See Microsoft's [package metadata
example](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/get-started/serve-your-web-part-in-a-sharepoint-page#package-the-helloworld-web-part).

### Categories, Developer Details, And Localization

The package schema permits no more than three of these exact category values:

`Accounting + Finance`, `Collaboration`, `Content management`, `CRM`,
`Data + analytics`, `File managers`, `IT/admin`, `Legal + HR`,
`News + weather`, `Productivity`, `Project management`, `Reference`,
`Sales + marketing`, `Site Design`, `Social`, and
`Workflow & Process Management`.

Developer name, website, privacy statement, terms of use, and Microsoft
partner identifier remain individually optional in the Lab. Microsoft requires
valid developer details for Office Store or AppSource publication and
recommends them for internal apps as well. When any developer value is
exported, SPFx Kit emits the complete `solution.developer` object required by
the current package schema without inventing a partner identifier. See
Microsoft's [developer information
guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/sharepoint-framework-toolchain#update-developer-information).

SPFx supports locale-keyed short and long descriptions, `supportedLocales`,
and resource-backed package titles. The current App export config intentionally
edits only each description's `default` value. It preserves locale-specific
entries already maintained in the app's source, but it does not offer a partial
translation UI or generate `.resx` files. Configure localized values and
supported locales in the standalone app source until SPFx Kit can manage that
complete resource lifecycle.

### App Catalog Administrator Boundary

The package can supply the metadata above, but an App Catalog administrator can
edit or override listing properties after upload. Microsoft's current Apps
site allows administrators to change the name, description, images, category,
publisher, and support URL. Featured status, enabled state, licensing, and the
deployment choice also remain catalog administration decisions.

There is no dedicated SPFx `package-solution.json` field for publisher,
support URL, featured status, enabled state, or licensing. In particular,
`solution.developer.websiteUrl` is the developer's information website, not a
promise to populate SharePoint's separate Support URL property. Manage those
catalog-only values after upload rather than adding look-alike export fields.
See Microsoft's [custom app management
steps](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog#add-custom-apps)
and [SPFx management
guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/enterprise-guidance#management-capabilities-of-sharepoint-framework-solutions).

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
