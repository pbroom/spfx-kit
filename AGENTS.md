# Agent notes for SPFx Kit

## Cursor Cloud specific instructions

### Runtime

- Use Node `22.22.3` and npm `10.9.x` (see `.nvmrc` / `packageManager`).
- Install with `npm ci && npm install --include=optional --no-save`.
  The second command installs Linux native bindings for Vite 8 / rolldown
  that a macOS-authored lockfile can omit (`npm/cli#4828`).
- Optional lab defaults live in `.env.example`. Secrets belong in the Cursor
  Secrets tab, not committed files.

### Daily commands

```sh
npm run sync:lab
npm run dev
npm run build
npm run lint
npm test
npm run guard:public
npm run test:security
```

### Lab

- Default URL: `http://127.0.0.1:5173/`
- Cloud previews need two externally reachable HTTPS forwarders: one for the
  Lab and one for the mock CDN. Start them with
  `SPFX_LAB_HOST=0.0.0.0 SPFX_KIT_MOCK_CDN_LAB_ORIGIN=https://<lab-host> SPFX_KIT_MOCK_CDN_PUBLIC_ORIGIN=https://<cdn-host> SPFX_KIT_MOCK_CDN_LISTEN_HOST=0.0.0.0 npm run dev`.
  The placeholder hosts must be the forwarders seen by the browser; do not use
  loopback values. The launcher fails closed if this configuration is incomplete.
- If port 5173 is busy, use `SPFX_LAB_PORT=5175 npm run dev`; port 5174 is
  reserved for the local mock CDN started by the same command.
- Fresh clones include `examples/hello-card-spfx`; managed apps live under
  ignored `.spfx-kit/apps`.

### Do not

- Do not commit `.spfx-kit/` managed apps, exports, or generated
  `apps/lab/src/generated/lab-registry.ts`.
- Do not rewrite the lab blindly when debugging; sync, rebuild the smallest
  filter, and re-validate.
