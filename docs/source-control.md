# Source Control And CI For Apps

SPFx Kit is a public monorepo that ships the kit, never your apps. Everything
under `/.spfx-kit/` is git-ignored and `npm run guard:public` (pre-commit hook
plus kit CI) fails if an app project ever becomes visible to the kit repo.
That design makes one pattern work cleanly for app source control: each app
under `.spfx-kit/apps/<slug>-spfx` is its own git repository, nested inside
the kit checkout. The nested `.git` directories are invisible to the public
repo, so you get real history, remotes, and CI per app with zero risk of
leaking app code.

There are two kinds of app repos, with different flows:

- **Managed apps** — repos you own. Created with `create:spfx`, pushed to
  your own (usually private) remote, released through the app repo's CI.
- **Third-party apps** — repos someone shared with you. Cloned with
  `clone:spfx` so you can run, test, debug, and modify their web part in the
  lab, then send feedback, a patch, or a pull request back.

Never use git submodules for apps: the submodule entry would be tracked by
the public kit repo, which breaks the `guard:public` safety model. The kit
repo's own CI (`.github/workflows/ci.yml`) stays kit-only — it can never see
apps, so app CI always lives in the app's own repo.

## Managed apps (repos you own)

### One-time setup

```sh
npm run create:spfx -- --name team-divider --title "Team Divider" --webpart TeamDivider
cd .spfx-kit/apps/team-divider-spfx
git init -b main
git add -A
git commit -m "Scaffold Team Divider SPFx web part"
git remote add origin git@github.com:your-org/team-divider-spfx.git
git push -u origin main
```

`create:spfx` (and `export:spfx --target standalone`) makes the app
repo-ready out of the box:

- `.github/workflows/ci.yml` — CI that builds, ships, and packages the app
  through its toolchain-aware `npm run ship` script and uploads the `.sppkg`
  artifact, plus a release job for `v*` tags.
- `.nvmrc` — pins Node `22.22.3` so CI and teammates use the same supported
  runtime.
- `.gitignore` — keeps `node_modules/`, `lib/`, `temp/`, release assets, and
  `.sppkg` files out of the app repo.

Commit the app's `.spfx-kit/lab/register.tsx` adapter and its lockfile. Any
teammate can then clone the app repo into their own kit checkout's
`.spfx-kit/apps/` and it registers into their lab after `npm run sync:lab`.

### Daily flow

Work in the lab as usual (`npm run dev`, `npm run sync:lab`,
`npm run validate:spfx -- --app .spfx-kit/apps/<slug> --profile lab`), then
commit and push from inside the app directory. The kit is the fast preview
surface; the app repo's CI runs `npm run ship`, which uses that app's detected
Heft or Gulp toolchain, as the merge gate.

### Releasing

```sh
npm run bump:spfx -- --app .spfx-kit/apps/team-divider-spfx --type minor
cd .spfx-kit/apps/team-divider-spfx
git commit -am "Bump to 0.2.0"
git tag v0.2.0
git push origin main --tags
```

`bump:spfx` keeps `package.json` and the `config/package-solution.json`
solution and feature versions in sync. The tag triggers the CI release job,
which attaches the exact build-job `.sppkg` artifact to a GitHub Release.
Deploying to a tenant (App Catalog upload, CDN asset sync via
`SPFX_KIT_CDN_BASE_URL` and `npm run sync:cdn`) stays a deliberate manual or
separately-credentialed step.

## Third-party apps (repos shared with you)

Use `clone:spfx` instead of `import:spfx` when you plan to send changes or
feedback back. It keeps the full git history and leaves the project pristine
— no `package.json` rename, no `tsconfig.json` rewrite — so your diffs
contain only your changes.

```sh
# With a fork you can push to (preferred when you have one):
npm run clone:spfx -- --source https://github.com/them/their-webpart --name their-webpart --fork git@github.com:you/their-webpart.git

# Without a fork (read-only access):
npm run clone:spfx -- --source https://github.com/them/their-webpart --name their-webpart

npm run sync:lab
npm run validate:spfx -- --app .spfx-kit/apps/their-webpart-spfx --profile lab
```

What `clone:spfx` does:

- Full `git clone` (history included) into `.spfx-kit/apps/<slug>-spfx`.
- With `--fork`, sets `origin` to your fork (where you push branches) and
  adds `upstream` pointing at their repo.
- Scaffolds a lab adapter at `.spfx-kit/lab/register.tsx` if the project does
  not have one, and records `.spfx-kit/clone.json` metadata.
- Appends `.spfx-kit/` to the clone's `.git/info/exclude`, so kit-generated
  files never show up in `git status` — your branches and patches stay free
  of kit files.

### Run, test, debug, modify

```sh
cd .spfx-kit/apps/their-webpart-spfx
npm install
git switch -c fix/column-overflow
# ...edit, then preview in the lab and gate with the real build:
npm run sync:lab            # from the kit root
npm run build               # from the app directory
```

### Sharing changes back

- **With a fork**: push the branch to `origin` (your fork) and open a pull
  request against `upstream`.

```sh
git push -u origin fix/column-overflow
```

- **Without push access anywhere**: send patches generated against their
  branch.

```sh
git fetch upstream 2>/dev/null || git fetch origin
git format-patch origin/main --stdout > ../their-webpart-fixes.patch
```

- **Feedback only**: nothing to do in git — your local branch, adapter, and
  `clone.json` stay local, and the clone can be deleted when you are done.

### When to use `import:spfx` instead

`import:spfx` makes a detached managed copy: it strips `.git`, renames the
package, and normalizes `tsconfig.json` for the kit workspace. Use it for
one-time adoption — when you are taking over an app permanently and its old
history and upstream no longer matter. Use `clone:spfx` for round-trip
collaboration.
