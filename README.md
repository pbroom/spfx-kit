# SPFx Kit

SPFx Kit is a Turbo + npm workspaces monorepo for importing, authoring, previewing, validating, and shipping SharePoint Framework applications and web parts.

The default development surface is the local lab. The lab lets you work on SPFx web parts in a fast Vite preview before using the real SPFx gulp build, package, and hosted workbench path as the deployment gate.

## Lab Quickstart

Use Node `22.22.3`. This matches the SPFx `1.21.1` apps this kit is built
to manage and keeps validation inside the supported `>=22.14.0 <23.0.0`
engine range.

```sh
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite. By default the lab runs on:

```text
http://127.0.0.1:5173/
```

If that port is busy, choose another port without editing source:

```sh
SPFX_LAB_PORT=5174 npm run dev
```

`npm run dev` first runs `npm run sync:lab`, then starts `apps/lab`. The
sync step rebuilds the local, ignored
`apps/lab/src/generated/lab-registry.ts` file from every managed app under
`.spfx-kit/apps` that has a lab adapter at `.spfx-kit/lab/register.tsx` or the
legacy `src/lab/register.tsx` path.

A fresh public clone does not include any SPFx app projects. The lab still
starts, but the app list stays empty until you create or import a managed app
under `.spfx-kit/apps`.

## What The Lab Does

- Select any registered web part from the right-side panel.
- Preview SharePoint column widths: one column, two-third, one-half, one-third, and mobile.
- Toggle preview bounds so layout edges are visible.
- Switch light, dark, or custom section backgrounds.
- Edit registered property-pane controls against local props.
- Use local SharePoint and Graph fixtures from `@spfx-kit/spfx-lab-runtime`.
- Export selected apps from the lab drawer into single-bundle, CDN, or standalone package formats.

The lab is for fast local authoring and visual QA. Before deployment, still run the SPFx app build, ship, and validation commands for the target app.

## Workspace Layout

- `apps/lab` - Vite React lab, started by `npm run dev`.
- `packages/spfx-lab-runtime` - shared lab registry, fixtures, mock SPFx context, and property-pane contracts.
- `packages/spfx-tools` - import, create, export, lab sync, CDN sync, and SPFx validation CLIs.
- `.spfx-kit/apps/<slug>-spfx` - ignored local SPFx apps created or imported
  on your machine.

## GitHub Safety

The public repo is designed to ship the kit, not your SPFx app projects or app
data. Managed apps, exports, generated lab registry output, local app locks,
and SPFx build artifacts are ignored by default.

Before committing or pushing, run:

```sh
npm run guard:public
```

This fails if an SPFx app project, `.spfx-kit` data, generated registry file,
or app workspace entry is visible to Git.

## Daily Lab Workflow

Start or reuse the lab:

```sh
nvm use
npm run dev
```

Regenerate the lab registry after adding, importing, or moving adapters:

```sh
npm run sync:lab
```

Build the lab:

```sh
npm run build -- --filter @spfx-kit/lab
```

Validate an app for lab use:

```sh
npm run validate:spfx -- --app .spfx-kit/apps/<app-slug> --profile lab
```

Build or ship one SPFx app:

```sh
cd .spfx-kit/apps/<app-slug>
npm install
npm run build
npm run ship
```

## SPFx App Lifecycle

To import another team SPFx project as a managed copy:

```sh
npm run import:spfx -- --source https://github.com/example/team-webpart-spfx --name team-webpart-spfx
npm run sync:lab
npm run validate:spfx -- --app .spfx-kit/apps/team-webpart-spfx --profile lab
```

To create a new standalone-shaped SPFx app inside the lab:

```sh
npm run create:spfx -- --name team-divider --title "Team Divider" --webpart TeamDivider
npm run sync:lab
npm run validate:spfx -- --app .spfx-kit/apps/team-divider-spfx --profile lab
```

To export a managed app:

```sh
npm run export:spfx -- --app .spfx-kit/apps/<app-slug> --target single,cdn,standalone
```

The import tool excludes repository metadata, dependencies, build outputs, and
generated packages. If a source project contains a lockfile, it is preserved
under `.spfx-kit/original-package-lock.json` inside the imported app for audit
history. Because managed apps are ignored local projects, they can also
maintain their own app-local install and lockfile without changing the root
`package-lock.json`.

Managed apps keep portable lab metadata under `.spfx-kit/lab/register.tsx`.
The older `src/lab/register.tsx` location still works for compatibility, but
new imports and created apps use `.spfx-kit/lab`.

Exports are profile-specific:

- `single` produces an `.sppkg` with `includeClientSideAssets=true`.
- `cdn` produces an `.sppkg`, `release/`, and `cdn-handoff/` assets for `SPFX_KIT_CDN_BASE_URL`.
- `standalone` produces a clean standalone repo with root-level `config/`, `src/`, `sharepoint/`, `release/`, `cdn-handoff/`, `gulpfile.js`, `tsconfig.json`, `package.json`, `package-lock.json`, `CLAUDE.md`, and `.spfx-kit` import metadata.

Production SPFx app exports must not depend on `@spfx-kit/*` packages or top-level monorepo `packages/*` code. Lab-only helpers stay in this monorepo.

## Lab Adapter Checklist

Each app appears in the lab through a registration file:

```text
.spfx-kit/apps/<app-slug>/.spfx-kit/lab/register.tsx
```

A useful adapter should:

- Export `register(registry: LabWebPartRegistry): void`.
- Register a stable `id`, matching `appId`, title, description, defaults, controls, fixtures, and preview component.
- Use `LabRenderProps` so the preview receives current props, breakpoint, theme, fixtures, and mock SPFx context.
- Keep production web part code free of lab-only dependencies unless the dependency is already part of the app's production bundle.
- Include focused lab CSS next to the adapter when the preview needs local styling.

After editing an adapter, run:

```sh
npm run sync:lab
npm run build -- --filter @spfx-kit/lab
npm run validate:spfx -- --app .spfx-kit/apps/<app-slug> --profile lab
```

## Agent Utility Prompts And Skills

Copy one of these prompts into Codex, Claude, or another agent when you want it
to set up or operate the lab. You can also save each heading as a reusable
agent skill name and use the text block as the skill body. The prompts are
written to keep the agent on the real local surface instead of guessing from
generic SPFx docs.

### Start The Lab

```text
Work in this SPFx Kit repo.

Start or reuse the local lab without launching duplicate servers. Use Node 22
through `nvm use`, install dependencies only if needed, run `npm run dev`, and
report the exact localhost URL Vite prints.

If port 5173 is busy, inspect the listener first. If it is not this lab,
restart with `SPFX_LAB_PORT=5174 npm run dev`.

Verify the URL with an HTTP request before saying it is ready.
```

### Add Or Repair A Lab Adapter

```text
Make the selected SPFx app appear correctly in the SPFx Kit lab.

Inspect `.spfx-kit/apps/<app-slug>`, then add or repair
`.spfx-kit/lab/register.tsx`. Register realistic default props and controls
from the web part.

Keep lab-only helpers out of production code.

Run:
`npm run sync:lab`
`npm run build -- --filter @spfx-kit/lab`
`npm run validate:spfx -- --app .spfx-kit/apps/<app-slug> --profile lab`
```

### Import A Team SPFx App

```text
Import the requested SPFx app into this SPFx Kit workspace as an ignored
managed app.

Use:
`npm run import:spfx -- --source <source> --name <slug>`

Preserve source history under the app's `.spfx-kit/`, run
`npm run sync:lab`, then validate with:
`npm run validate:spfx -- --app .spfx-kit/apps/<slug>-spfx --profile lab`

Summarize any compatibility issues against Node 22 and SPFx 1.21.x.
```

### Create A New Web Part

```text
Create a new SPFx web part managed by SPFx Kit.

Use:
`npm run create:spfx -- --name <slug> --title "<title>" --webpart <PascalName>`

Sync the lab, make the generated adapter useful enough for visual iteration,
and validate the app with the lab profile.

Keep the app exportable as a standalone SPFx project.
```

### Operate The Lab For QA

```text
Use the running SPFx Kit lab to QA the selected web part.

Verify the browser is pointed at the current repo's Vite server. Exercise all
SharePoint breakpoints, light/dark/custom backgrounds, bounds overlay, and
property-pane controls.

Fix layout or registration issues in source, then rerun `npm run sync:lab` and
the smallest relevant build or validate command.
```

### Prepare An Export

```text
Prepare the selected SPFx app for export from SPFx Kit.

Validate the app first. Check `config/package-solution.json` and
`config/write-manifests.json`. Set `SPFX_KIT_CDN_BASE_URL` if a CDN package is
needed.

Run:
`npm run export:spfx -- --app .spfx-kit/apps/<app-slug> --target single,cdn,standalone`

Confirm the archive path plus generated target contents.
```

### Diagnose A Broken Lab

```text
Debug the SPFx Kit lab from the actual error.

Check Node with `node --version`, package scripts, generated registry output,
adapter imports under `.spfx-kit/lab/register.tsx`, and the Vite terminal
output.

Do not rewrite the lab blindly. Make the smallest fix, then verify with:
`npm run sync:lab`
`npm run build -- --filter @spfx-kit/lab`
the affected `npm run validate:spfx` command
```

## Runtime Notes

This workspace is pinned to Node `22.22.3` and npm `10.9.x` because the
deployment-target apps use SPFx `1.21.1` with an engine range of
`>=22.14.0 <23.0.0`. Use `nvm use` before SPFx validation.

SPFx apps are configured for CDN-hosted JavaScript bundles. Set
`SPFX_KIT_CDN_BASE_URL` and run
`npm run sync:cdn -- --app .spfx-kit/apps/<slug>` to update an app's
`cdnBasePath` and keep `.sppkg` files free of bundled client-side assets.
