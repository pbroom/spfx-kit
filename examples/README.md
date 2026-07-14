# SPFx Kit Examples

Committed, public-safe example apps that register into the lab so a fresh
clone has a working web part to preview. `npm run sync:lab` picks up any
`examples/<slug>-spfx` folder with a lab adapter, exactly like managed apps
under `.spfx-kit/apps`.

Examples are for previewing and as adapter templates. To edit, build, or
export one as your own app, import it into the ignored managed area first:

```sh
npm run import:spfx -- --source examples/hello-card-spfx --name hello-card
npm run sync:lab
```

The managed copy takes precedence over the committed example with the same
slug, so the lab will not register both.

`hello-card-spfx` also serves as the supported production canary. It keeps an
app-local lockfile, installs with `npm ci`, builds with Heft, and produces the
verified `.sppkg` artifact used by the root `npm run ship` and CI gates. It is
deliberately outside the root npm workspaces so the Microsoft Heft rig resolves
its project-local dependencies exactly as it does in a standalone deployment
repository.
