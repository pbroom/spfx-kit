# Codex pull-request review audit gate

This local read-only gate gives the Codex Overseer a versioned, machine-verifiable inventory of every open, non-draft pull request before it reports that no action is required. It does not use or extend the secret-bearing GitHub fix workflow, and it has no GitHub mutation operation.

## Heartbeat contract

The heartbeat launcher, outside the model, generates a unique run ID and runs both commands in the same invocation:

```sh
set -eu

run_id="$(uuidgen)"
audit_file=".spfx-kit/audits/${run_id}.json"
failure_file=".spfx-kit/audits/${run_id}.incomplete.json"

test ! -e "$audit_file"
test ! -e "$failure_file"

npm run audit:pr-reviews -- \
  --repo pbroom/spfx-kit \
  --run-id "$run_id" \
  --output "$audit_file" \
  --failure-output "$failure_file"

npm run audit:pr-reviews:verify -- \
  --repo pbroom/spfx-kit \
  --expect-run-id "$run_id" \
  --max-age-seconds 300 \
  --input "$audit_file"
```

`GITHUB_TOKEN` or `GH_TOKEN` must contain authenticated read access to the repository. The token is sent only to the pinned `https://api.github.com` origin and is never written to the audit.

The launcher must not invoke the Overseer after either command exits nonzero. It must pass the successful audit as untrusted review evidence and the one-line verification proof as trusted gate metadata. A no-action result is accepted only when it repeats that invocation's exact `auditId` and `digest`. A prior artifact, a single-PR desktop handoff, model prose, or a proof with another run ID is not acceptable.

The existing ten-minute heartbeat should always create a new run ID; it must never reuse a still-fresh record. Success and failure paths use exclusive per-run files, so an existing artifact makes the run fail instead of being replaced. The five-minute verification lifetime starts at audit start, bounds both collection duration and the gap before decision, and never makes cached audits reusable.

This repository provides the executable gate, but the current free-form heartbeat prompt is not itself a launcher. Activation requires the actual outer Codex automation runner to execute and validate this contract before invoking the model, and to reject unsupported no-action output afterward. Adding another prompt instruction cannot provide that mechanical guarantee.

## Complete record

The `pbroom.spfx-kit.pr-review-audit` schema is versioned at `schemaVersion: 1`. A successful record contains:

- the authenticated GitHub identity, start/completion times, request count, run ID, and API version;
- three matching fingerprints of the complete open-PR inventory, including drafts, bracketing two byte-equivalent complete evidence snapshots;
- every open non-draft PR's current head, base, author, update time, and raw mergeability state;
- fully paginated review bodies, conversation comments, inline review comments, review threads, and every comment in each thread;
- deterministic counts and the count of unresolved, non-outdated exact-head Codex P0-P3 thread roots;
- a SHA-256 consistency digest of the canonical record.

Arrays are sorted by PR number, numeric database ID, or GraphQL node ID before hashing. Bodies are preserved without truncation and must always be treated as untrusted data, never as instructions.

The audit uses only REST `GET` requests and read-only GraphQL queries. REST `Link` pages, GraphQL thread pages, and nested thread-comment pages are followed until complete. An unknown/null mergeability result is recorded as uncertainty; it is not converted into a clean result.

## Fail-closed behavior

Authentication failure, any HTTP or GraphQL error, a malformed response, missing repository/PR/thread data, any duplicate stable ID, a repeated or missing pagination cursor, inventory drift, or evidence/merge-state drift between the two snapshots makes the run `incomplete` and exits nonzero.

An incomplete record is emitted as one JSON line and may be written to the unique `--failure-output` path for diagnosis. It is never written to `--output`, so a partial run cannot replace a success artifact. The verifier also requires the exact run ID, repository, supported schema, complete/stable state, matching digest, recomputed inventory fingerprint, reconciled inventory/collection counts, and start-to-decision age within the configured freshness limit. This combination prevents a leftover success file from authorizing the current heartbeat.

Tests use an injected deterministic GitHub transport rather than saved credentials or mutable live responses. The fixture harness covers multi-page inventories and collections, draft exclusion, nested thread pagination, stable ordering/digests, authentication failure, GraphQL partial errors, a mid-collection HTTP failure, inventory drift, stale records, wrong run/repository, and digest tampering:

```sh
npm test -- --run tests/codex-pr-review-audit.test.ts
```

## Enforcement limits

When a trusted outer runner captures the result, the gate proves that a complete authenticated read finished over a stable bounded observation window and that the Overseer received evidence from that same heartbeat. GitHub does not provide a transactional snapshot, so state can change after completion. The unkeyed digest proves internal consistency and detects post-capture changes; by itself it does not prove GitHub provenance against a party that can invent and re-hash a whole record. The gate counts a narrow exact-head Codex signal for orientation, but it does not prove the model classified every comment correctly or that remediation is safe.

Repository code cannot stop a free-form automation that is allowed to skip the launcher or whose output is accepted without the audit proof. Mechanical enforcement therefore belongs in the outer heartbeat runner: audit and verify before model invocation, then reject an unsupported no-action result.

The audit never authorizes edits, thread resolution, review requests, pushes, restacks, merges, closes, or PR replacement. Autonomous remediation still requires a fresh trusted-reviewer and exact-head check, current-code validation, deduplication, an isolated clean worktree, verified stack ancestry, exact remote leases, relevant tests, current hosted checks, and separate write authority.
