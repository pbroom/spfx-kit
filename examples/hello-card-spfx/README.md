# Hello Card

Built-in SPFx Kit example: an SPFx 1.23.2 Heft web part with a lab adapter at
`.spfx-kit/lab/register.tsx`. It appears in the lab automatically after
`npm run sync:lab` so a fresh clone has something to preview.

This committed copy is reference material and the repository's production
package canary. Build and verify it from the repository root:

```sh
npm run ship:canary
npm run verify:sppkg -- --app examples/hello-card-spfx
```

To debug it on a real SharePoint page, set
`SPFX_SERVE_TENANT_DOMAIN=contoso.sharepoint.com/sites/team-a`, run `npm ci`
and `npm run serve` in this directory, then accept the prompt to load local
debug scripts. The modern page URL in `config/serve.json` activates the SPFx
Debug Toolbar; the hosted workbench is not part of this workflow.

To edit or export it as your own app, copy it into the ignored managed area
first (see `examples/README.md`).
