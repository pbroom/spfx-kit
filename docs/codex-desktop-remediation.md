# Desktop remediation handoff

Use this local, read-only handoff when a Codex review finds an actionable issue on any pull request in a Graphite stack. It does not rely on a GitHub Actions workflow or change GitHub state.

The desktop publisher starts by revalidating the live review rather than trusting a notification or comment:

```sh
GITHUB_TOKEN=... node scripts/codex-desktop-handoff.mjs \
  --repo pbroom/spfx-kit --pr 80 --review 123 --head <40-character-sha>
```

The command refuses a closed, draft, forked, moved, untrusted, clean, or stale review. On success it emits only the pull-request identity, exact head/ref, and current unresolved Codex P0-P3 findings. A desktop Codex task can use that output to make the smallest patch in an isolated worktree, run the repository validation suite, and then perform the already-approved controlled Graphite restack.

The desktop publisher must re-fetch every stack head immediately before publication, use exact `--force-with-lease` values for all affected refs and `git push --atomic`, abort on a non-linear stack, changed head, or rebase conflict, request fresh reviews after the push, and resolve only the now-outdated threads it fixed. It never merges a pull request.
