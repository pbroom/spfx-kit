# Codex review fix loop

This repository uses native Codex GitHub reviews for adversarial findings and a separate GitHub Actions workflow for guarded fixes. The workflow never merges a pull request.

## Trust boundaries

The loop separates four capabilities:

1. **Trusted intake** reads the submitted Codex review, live pull request, review threads, stack children, and the bot-owned status marker using the controller version pinned by `github.workflow_sha`. It accepts only a current, unresolved P0-P3 finding from `chatgpt-codex-connector` on the exact reviewed head of a same-repository, trusted-author, leaf pull request, and reserves the attempt before invoking Codex.
2. **Unprivileged generation** checks out that exact head without GitHub write credentials and runs the pinned official Codex Action as a dedicated unprivileged user. Pull-request-controlled AGENTS/exec-policy files are disabled, and no pull-request install or build scripts execute before the OpenAI credential is introduced; Codex can only leave a local patch.
3. **Secretless validation** applies and inspects the inert patch in fresh read-only jobs. Core, browser/CDN, and SPFx package gates run in parallel. The core sequence intentionally builds workspaces before `npm test`, so `@spfx-kit/source-editor-core` and the other workspace outputs exist.
4. **Minimal publication** downloads the exact validated patch, rechecks the live head, branch identity, trusted author, leaf-stack position, and unresolved review findings twice, commits without repository hooks, and pushes to the existing PR branch with an exact `--force-with-lease`. It runs no package or pull-request-controlled code. Its short-lived `GITHUB_TOKEN` is never exposed to Codex or stored in the cloud environment, and no merge API or merge command exists in the workflow.

Native Codex review is currently configured to run on every push, so a successful fix push starts the next review. A clean exact-head re-review marks the loop ready for human gates and resolves only the loop's previously fixed threads after GitHub marks them outdated. Human approval, checks, and repository protections remain authoritative.

Because pushes made by `GITHUB_TOKEN` do not normally start another Actions workflow, the publisher records a completed `Codex guarded validation` check on the exact new head and also attempts to dispatch `ci.yml`. An older Graphite branch may not yet contain `workflow_dispatch`; that optional dispatch failure is reported without mislabeling the already-published commit, while the exact pre-push validation check remains visible.

## Safeguards

- One serialized workflow per PR; later events wait instead of cancelling the active fixer.
- Review ID deduplication and a maximum of three accepted fixer attempts, reserved before any OpenAI call (failures cannot bypass the cap).
- Refusal of forks, drafts, stale review heads, untrusted authors, and non-leaf Graphite branches.
- At most 40 changed text files and 4,000 changed lines.
- No binaries, renames, copies, symlinks, submodules, or mode changes.
- No automated edits to `.github`, agent instructions, security/ownership policy, dependency manifests, lockfiles, npm/TypeScript/toolchain configuration, validation harnesses, or this controller.
- The patch bytes validated after all repository commands must exactly match the patch bytes generated before them; validation scripts cannot smuggle additional staged changes into the publisher.
- A persistent PR comment records the exact head, attempt count, workflow run, clean re-review state, and guarded outcome; duplicate state markers fail closed.
- A user push that races the publisher wins: both the API checks and the exact lease fail closed rather than overwrite it.
- No merge API, auto-merge permission, release, deployment, or Graphite restack operation exists in the workflow.

## One-time activation

The workflow file must first be merged to the default branch because GitHub loads `pull_request_review` workflows from the default branch.

Then create one repository Actions secret:

1. Open **GitHub → pbroom/spfx-kit → Settings → Secrets and variables → Actions**.
2. Add `OPENAI_API_KEY` using a dedicated OpenAI Platform project key with an appropriate usage limit.
3. Keep the repository Actions policy enabled. Write scopes are limited to the trusted status/thread controller and the final publisher; the repository currently has no branch rule that grants the workflow merge authority.

No PAT, `GH_TOKEN`, cloud environment secret, or paid-credit-overflow setting is required. The official action receives the OpenAI key through its protected proxy and runs Codex as an unprivileged user. See the [Codex GitHub Action documentation](https://learn.chatgpt.com/docs/github-action) and its [security guidance](https://github.com/openai/codex-action/blob/main/docs/security.md).

## Codex cloud environment correction

The GitHub mention worker is useful for interactive investigation, but it is not this loop's publisher. It currently has no authenticated `gh`/connector write tool during the agent phase, and its human-operated **Update branch** button is not an event-driven capability. Keep that environment secretless and keep agent internet access off.

Its original automatic setup selected unsupported Node/npm versions and installed child workspaces before the root. On August 5, 2026, the live environment was switched to this manual root-first setup:

```sh
task_nvm_dir="${NVM_DIR:-/root/.nvm}"
. "$task_nvm_dir/nvm.sh"
nvm install 22.22.3
nvm use 22.22.3
npm install --global npm@10.9.8
npm ci
npm install --include=optional --no-save
npm run build
```

The maintenance setup repeats `nvm use 22.22.3`, the two root installs, and `npm run build` after each branch checkout. Post-setup caching remains enabled, agent internet remains off, no environment variables or secrets were added, and the old cache was reset after saving the correction.

Do not add a GitHub PAT to this environment. Environment secrets are for setup and are removed before the agent phase; exposing a write token as a normal agent variable would weaken the boundary this workflow establishes.

## Observable proof case

PR #87, `feat(lab): expose CDN source and runtime links`, exposed the original failure:

- Codex reviewed head `479d10ce6d3d` and opened a current P2 thread.
- A GitHub mention task produced a plausible local commit (`73ce68f`) but could not publish it because `gh` was unauthenticated and no connector write tool was present.
- Its broad test attempt also encountered unresolved `@spfx-kit/source-editor-core` imports because the supported root-first setup/build prerequisite was not reliably established before tests.

The deterministic fixture in `tests/fixtures/codex-review-loop/` preserves that exact event, review ID, head, thread, path, and P2 finding. The controller tests prove it is accepted only while current and leaf, and that stale heads, forks, duplicate reviews, capped attempts, non-leaf stacks, and privileged patches fail closed.
