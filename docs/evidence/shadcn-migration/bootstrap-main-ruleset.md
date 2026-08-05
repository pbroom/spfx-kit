# Evidence History Bootstrap On `main`

Status: Procedure accepted; merge, probe, and repository-setting actions unrun

Accountability: A0 / [spfx-kit#81](https://github.com/pbroom/spfx-kit/issues/81)

## Boundary

This runbook makes the Phase 0 trust transition explicit. It does not authorize
a merge, ruleset or branch-protection change, CDN or SharePoint operation,
release, deployment, or first evidence row. Each external mutation requires the
authority already defined by ADR-0003.

Read-only inspection on 2026-08-05 found no repository ruleset and no branch
protection on `main`. GitHub Actions defaults to read permission and cannot
approve pull requests. Re-read all three settings immediately before acting;
this snapshot is not a future instruction to replace or weaken them.

## Why the job check is insufficient

GitHub runs `pull_request_target` in the default-branch context and sets
`GITHUB_SHA` to the default-branch commit. Required status checks are keyed by
job/check context and do not distinguish workflow or event type. Therefore the
job check `Verify append-only evidence` is useful run evidence but is not the
candidate-head requirement.

The trusted workflow instead validates the exact event-provided PR head, fetches
it only as inert Git objects, and publishes versioned commit status
`spfx-kit/evidence-history-v1` to that exact SHA. Its only write permission is
`statuses: write`; candidate source, scripts, actions, dependencies, schemas,
and workflow configuration are never executed.

The reviewed v1 trust base freezes the complete `.github/workflows` tree and
the isolated `.github/evidence-trust/v1` tree by path, mode/type, and bytes. The
runtime uses Node `22.22.3`, npm `10.9.8`, lifecycle scripts disabled, and an
integrity-bearing lock containing only Ajv and its runtime closure. Candidate
workflow additions, shrinkwrap files, nearer tracked modules, symlinks, and mode
changes therefore fail instead of becoming a future spoof or resolver path.

## Authorized bootstrap sequence

1. Under explicit merge authority, merge roadmap PR #79 and governance PR #88
   through Graphite in stack order. Do not direct-merge the upstack PR.
2. Refresh `origin/main` and prove the merged default branch contains the exact
   reviewed workflow tree, v1 runtime tree, trust manifest, schema, empty
   ledger, and documentation. Record the resulting main commit; do not reuse
   pre-merge PR SHAs as the base proof.
3. Create a no-evidence probe PR from the new `main`. The probe must not edit
   the v1 schema, ledger, release sets, trust manifest, protected workflow tree,
   or protected runtime tree.
4. On the probe's exact head, verify all of the following through GitHub's API:
   the trusted run used the expected default-branch workflow commit; the fetched
   candidate SHA equals the PR head; commit status
   `spfx-kit/evidence-history-v1` exists on that head; its state is `success`;
   its target URL is that trusted run; the isolated install used the exact
   Node/npm versions and lock; and the run never checked out or executed
   candidate code.
5. Only after that status has succeeded in this repository, add one active
   ruleset scoped to `~DEFAULT_BRANCH`. Preserve any settings found during the
   fresh preflight. Require `spfx-kit/evidence-history-v1` from its observed
   GitHub App integration and require the branch to be current with its base.
   Do not add an unreviewed bypass, unresolved integration ID, or job-name-only
   requirement. Do not enable merge queue in this bootstrap; the trusted
   workflow has no `merge_group` contract.
6. Re-read the effective rules for `main` and open a second no-evidence probe.
   Prove the requirement is pending before the candidate-head status exists,
   succeeds only after the trusted run publishes it, and fails closed after a
   deliberately invalid append-only fixture. Also prove rejection of a rogue
   workflow addition and a protected-runtime shrinkwrap addition. Close the
   probes without merging unless their exact changes were separately approved.
7. Record the ruleset ID/version, effective-rule response, probe PR/head/run,
   candidate-head status, and negative-case result in issue #81. These bootstrap
   observations are not ledger rows.
8. Only a later PR may add the first release-set manifest and atomic evidence
   rows. Its base must already contain the active rule and trusted workflow. It
   must target `main` directly or be retargeted/restacked onto `main` after all
   downstack PRs merge, then earn a fresh candidate-head status.

## Residual boundary

GitHub documents that required status checks do not distinguish workflow or
event type and that actors with write access can create statuses. Freezing the
entire workflow tree prevents a candidate PR from adding a second GitHub Actions
publisher before it can pass v1, but GitHub Actions jobs still share one App
identity. In this personal repository, the owner is also the sole evidenced
approver; this is not independent review or a defense against a malicious owner
using repository administration, a ruleset bypass, or an out-of-band status
writer. A stronger adversarial boundary requires an independently controlled
GitHub App or organization-level required workflow and a separate approver.

## Versioned transition

Never edit the active v1 workflow/runtime tree or reuse its status context. Add
a v2 runtime and `spfx-kit/evidence-history-v2` alongside v1, validate all
retained v1 history, and use a narrowly authorized ruleset transition to probe
and require v2 while v1 remains required. Remove the v1 requirement only after
v2 is effective and its negative probe blocks. Preserve v1 schema, manifest,
runtime, and historical evidence bytes. If an independent status App becomes
available, use it for the new context and remove the shared-App assumption from
the newly reviewed trust boundary.

If any probe contradicts this runbook, keep Phase 0 open, leave the ledger
empty, and revise the mechanism before requiring or recording evidence.
