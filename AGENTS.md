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
- In cloud agents, bind with `SPFX_LAB_HOST=0.0.0.0` so the preview is reachable.
- If port 5173 is busy, use `SPFX_LAB_PORT=5174 npm run dev`.
- Fresh clones include `examples/hello-card-spfx`; managed apps live under
  ignored `.spfx-kit/apps`.

### Do not

- Do not commit `.spfx-kit/` managed apps, exports, or generated
  `apps/lab/src/generated/lab-registry.ts`.
- Do not rewrite the lab blindly when debugging; sync, rebuild the smallest
  filter, and re-validate.
