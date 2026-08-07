# Codex pull-request review audit gate

This local read-only gate gives the Codex Overseer a versioned, machine-verifiable inventory of every open, non-draft pull request before it reports that no action is required. It does not use or extend the secret-bearing GitHub fix workflow, and it has no GitHub mutation operation.

## Heartbeat contract

The heartbeat launcher, outside the model, generates a unique run ID and runs both commands in the same invocation:

```sh
set -euC
umask 077

: "${SPFX_KIT_AUDIT_RUN_ROOT:?set a runner-owned retained directory}"
run_id="$(uuidgen)"
run_dir="${SPFX_KIT_AUDIT_RUN_ROOT}/runs/${run_id}"
mkdir -p -m 700 "${SPFX_KIT_AUDIT_RUN_ROOT}/runs"
mkdir -m 700 "$run_dir"
audit_file="${run_dir}/audit.json"
failure_file="${run_dir}/audit.incomplete.json"
proof_file="${run_dir}/proof.json"

npm run audit:pr-reviews -- \
  --repo pbroom/spfx-kit \
  --run-id "$run_id" \
  --output "$audit_file" \
  --failure-output "$failure_file"

npm run audit:pr-reviews:verify -- \
  --repo pbroom/spfx-kit \
  --expect-run-id "$run_id" \
  --max-age-seconds 300 \
  --input "$audit_file" >"$proof_file"
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

## Append-only analytics event

`audit:pr-reviews:append-event` emits one compact JSON object and appends the same object as one JSONL record. It is a separate twice-daily retention job, not part of the ten-minute Overseer availability path. Its independent schema is:

- `kind: "pbroom.spfx-kit.pr-review-audit-event"`;
- `schemaVersion: 1`;
- `eventType: "complete_snapshot"`.

The event binds immutable `eventId`, primitive nonempty run ID, audit start/completion time, repository/node ID, source audit digest, fixed-UTC `slotId`/`expectedAt`, and runner version. The repository node ID is the longitudinal stream identity; each row's `nameWithOwner` is an observed alias, so a node-stable rename or transfer can continue the stream without claiming why the name changed. Schema v1 permits only `00:00` and `12:00` UTC anchors, derives `slotId` as `twice-daily:<expectedAt>`, requires the audit to start within 30 minutes after the anchor, and rejects duplicate or non-increasing slots before writing. Each PR includes its globally unique PR node ID, repository-and-number-bound GitHub URL, author, chronologically ordered observed creation/update timestamps, head/base repository/ref/OID, merge state, observed review-loop number, open-ref topology metadata, and one observation for every review-thread root. A root observation records stable thread/root IDs, origin classification, explicit-priority severity classification, source actor/classification reconciled across REST and GraphQL, observed resolution/outdated state, head relationship, and an explicit fix-link status. Summaries use the deliberately narrow names `priorityLabeledThreadRootCount` and `currentUnresolvedPriorityLabeledThreadRootCount`; they do not claim the roots are valid, actionable, or exhaustive. Review bodies and conversation comments may contain separate findings and remain available only in the retained source audit.

The review-loop `number` is deliberately narrow: it copies the cumulative reserved `attempts` value from exactly one API-attributed `github-actions[bot]` comment containing exactly one `codex-review-fix-loop:v1` block whose object keys, bounds, enums, IDs, OIDs, timestamps, URLs, summaries, and retained entries pass the projector's strict schema. Every retained entry, including `clean`, must identify an audited submitted review with the same reviewed commit and a report timestamp at or after that review's submission time; the retained processed-entry count cannot exceed the submitted-review count. A `clean` entry must omit thread IDs; every other retained processing result must carry a nonempty unique thread-ID list whose review ID and reviewed head agree with the retained GraphQL thread-root review identity whenever that relationship is exposed. Copies of one marker report projected under multiple referenced findings must agree on every source-entry field except the enclosing thread ID; distinct exact-head report groups cannot exceed the observed exact-head submission count. Missing, invalid, ambiguous, or internally contradictory markers produce `number: null` with `marker_absent`, `marker_invalid`, or `marker_ambiguous`; known zero is retained as zero. Review-submission counts include only API reviews with a non-null `submittedAt`; pending drafts are not submissions. These are within-snapshot identity and chronology checks, not claims that the fixer succeeded or that a reviewer caused a push.

Stack classification uses case-insensitive repository identity among the event's verified open non-draft PR set. Every exposed PR base repository must match the audited event repository; fork heads remain valid but do not create same-repository edges. The event records candidate `{number,isDraft:false}` edges and labels the open graph role `isolated`, `root`, `middle`, `leaf`, `ambiguous`, or `unknown`; every retained edge, role, and candidate is recomputed from the event PR identities during validation. Draft topology is deliberately not projected because schema v1 does not retain enough draft identity to validate it independently. This is not an authoritative Graphite stack. Graphite stack ID and position remain `null`. Reviewer and fixer instruction references are explicit `unknown` values unless the trusted runner supplies `--reviewer-instruction-id`, `--reviewer-instruction-digest`, `--fixer-instruction-id`, or `--fixer-instruction-digest`; digests use `sha256:<64 lowercase hex>`. A complete pair is `reported` with `runner_asserted` confidence, not independently observed or causally attached to historical findings.

Every event contains provenance, confidence, a sorted `unknowns` list, `causalAttribution.status: "not_claimed"`, and a composite SHA-256 manifest for the projector plus its audit, priority-classifier, and review-loop semantic dependencies. Review-thread IDs and root review-comment database/node IDs are each globally unique across the complete event; case-folded full GitHub logins (retaining any `[bot]` suffix), actor IDs/types, and review database/node/commit tuples must also remain mutually consistent within the snapshot while preserving API-null relationships. The complete source audit additionally reconciles every exposed GraphQL thread-comment review database/node/commit tuple and its paired REST inline comment to one same-PR REST review; nulls are preserved and do not conflict with a compatible known value from the other API, while known-known disagreements fail closed. Event-v1 validation uses immutable compatibility entries for source audit kind/schema/API provenance and for each retained projector version's exact ordered manifest path contract. A projector upgrade adds a new compatibility entry and never rewrites or derives an old entry from the current checkout, so later source/projector releases do not reinterpret or invalidate already-retained v1 rows. Retained manifest hashes remain self-consistent unkeyed provenance, not origin authentication. Event v1 pins the verifier's universal one-hour audit-duration ceiling; because the invocation-specific freshness limit is not retained, historical validation does not claim the usual five-minute limit was used. A priority label classifies text shape only; it does not establish finding validity. A strict status marker may contribute `fixLink.status: "reported"` records that quote its retained review/thread/attempt/result association; validation binds their evidence IDs, exact enclosing thread ID, exposed review ID and reviewed head, marker comment ID, ordered unique review IDs, non-clean result, and attempt bounds back to the observed parent loop. Those associations remain explicitly `reported_not_verified`: an input head or `pushed` result does not identify a causal fix commit. The marker's current top-level workflow URL is never attached to older retained entries. Without a retained per-thread report, fix linkage is unknown.

The JSONL appender:

- verifies the live audit's schema, digest, repository, exact run ID, completeness, and freshness before taking its lock;
- refuses incomplete or stale records;
- resolves the log's parent directory to its canonical identity before deriving the log and lock paths, so stable parent aliases cannot create independent locks for one log;
- exclusively locks the log, opens an existing log once with no-follow/nonblocking semantics, verifies the opened handle is a runner-owned mode-0600 single-link regular file before reading it, and uses that same descriptor for validation, append, sync, rollback, and post-append verification;
- rejects additional schema properties, requires every retained line to be its exact canonical JSON serialization, deep-validates every existing v1 record, derived summary, repository binding, slot/time ordering, and digest link, and rejects duplicate runs/source audits/slots before writing;
- preserves bidirectional PR-number/node-ID and review-thread/root-comment identity mappings plus each role's independently scoped reported instruction ID-to-digest mapping across the entire stream, including disappearance and later reappearance, and rejects a contradictory candidate before writing; partial instruction references establish no mapping, and the mapping records version consistency rather than causation;
- links each row to the preceding event digest and appends without rewriting prior bytes;
- proves and rolls back a catchable short/failed append to the exact pre-append bytes before releasing the lock; if rollback cannot be proved, it fails loudly for operator recovery;
- reports operation and lock-cleanup failures together when both occur, because a published lock may require manual recovery;
- fails on malformed JSON, blank/unterminated records, chain drift, or tampering.

The lock contains canonical owner, host, process, and acquisition-time metadata with a 15-minute lease. Metadata is written and synced to a unique owner file before an exclusive hard link publishes the common lock pathname, so interruption before publication leaves only a harmless orphan and can never expose an empty or truncated common lock. The owner link remains for the lock lifetime. A contender reclaims a published lock only after the lease expires, only on the same host, only when the recorded process is provably absent, and only after atomically removing that unique owner link to win recovery; competing recoverers fail closed. A live owner, another host, malformed metadata, an unexpired lease, an unrecognized link, or an interrupted recovery fails closed for manual inspection. Normal cleanup removes the common pathname before its unique owner link.

Incomplete audits never become analytics events. Absence of an event means **not observed**, never “no change”; an incomplete audit means **audit unavailable**, never zero findings or zero churn. The unkeyed chain detects ordinary edits, reordering, and partial appends, but cannot by itself detect deletion and re-hashing of the complete tail by a party that controls the file. Durable retention therefore belongs in runner-owned storage with an external tail anchor or WORM policy when that threat matters.

## Twice-daily retention and future backfill

This PR intentionally does not add a scheduler, historical GitHub crawl, database, or dashboard. A separate twice-daily runner should use two fixed UTC slots and invoke `audit`, `append-event`, then `verify` so the stored proof is the last freshness check. It must use runner-owned exclusive paths for the exact audit, proof, failure record, and event log. The append command additionally requires `--slot-id`, `--slot-expected-at`, and `--runner-version`; optional immutable instruction references use the flags above. An example append is:

```sh
npm run audit:pr-reviews:append-event -- \
  --repo pbroom/spfx-kit \
  --expect-run-id "$run_id" \
  --max-age-seconds 300 \
  --input "$audit_file" \
  --event-log "$SPFX_KIT_AUDIT_EVENT_LOG" \
  --slot-id "$slot_id" \
  --slot-expected-at "$slot_expected_at" \
  --runner-version "$runner_version"
```

The event represents only a verified complete slot. The outer scheduler must retain a separate versioned coverage envelope for incomplete attempts and close missed slots after their deadline; an absent process cannot record its own failure. Neither a retention failure nor event-log maintenance should block the independent ten-minute Overseer heartbeat. Pairwise churn is valid only between adjacent expected slots whose audits both verified. A gap may support a multi-slot net change, not an exact per-slot event count.

The event plus its retained source audit enable a later importer to compare stable PR, review, comment, and thread IDs and report observed head/base/merge transitions, newly observed or no-longer-observed identities, and thread resolution/outdated transitions. A bounded resolution interval may be reported only when the same stable thread identity is present in both adjacent verified slots. Absence is never evidence that a finding was deleted, resolved, fixed, closed, or merged. The retained source audit supplies bodies and complete review/comment ID collections for future reclassification without rewriting the original event. Backfill inputs are:

- original complete audit JSON and matching digest/proof;
- append-only analytics event and its preceding-chain digest;
- event slot ID/expected time, actual audit start/completion time, and the separate complete/incomplete/missing coverage envelope;
- runner/producer version and reviewer/fixer instruction references when known;
- an optional separately versioned Overseer decision bound to the same audit ID/digest.

A future importer must preserve original bytes, quarantine same-ID/different-digest conflicts, treat absent fields from older schemas as unknown rather than zero, and declare the first accepted complete event as `analyticsStartAt`. Historical imports use a distinct offline schema/digest validator; an expired record must never be passed through the live freshness verifier to authorize a current no-op. The importer must not recreate missed history from current GitHub state or claim exact activity between samples, why a branch changed, who fixed a finding, merge-versus-close outcomes, or causal relationships.

## Fail-closed behavior

Authentication failure, any HTTP or GraphQL error, a malformed response, missing repository/PR/thread data, any duplicate stable ID, inconsistent REST/GraphQL review identity anywhere in the source snapshot, impossible PR timestamp ordering, a repeated or missing pagination cursor, inventory drift, or evidence/merge-state drift between the two snapshots makes the run `incomplete` and exits nonzero.

An incomplete record is emitted as one JSON line and may be written to the unique `--failure-output` path for diagnosis. It is never written to `--output`, so a partial run cannot replace a success artifact. The verifier also requires the exact run ID, repository, supported schema, complete/stable state, matching digest, recomputed inventory fingerprint, reconciled inventory/collection counts, and start-to-decision age within the configured freshness limit. This combination prevents a leftover success file from authorizing the current heartbeat.

Tests use an injected deterministic GitHub transport rather than saved credentials or mutable live responses. The fixture harness covers multi-page inventories and collections, draft exclusion, nested thread pagination, stable ordering/digests, authentication failure, GraphQL partial errors, a mid-collection HTTP failure, inventory drift, stale records, wrong run/repository, digest tampering, chained analytics appends, duplicate runs, incomplete-run gating, and tampered history. The expected analytics v1 aggregate is stored at `tests/fixtures/codex-pr-review-audit/analytics-event-v1.expect.json`:

```sh
npm test -- --run tests/codex-pr-review-audit.test.ts
```

## Enforcement limits

When a trusted outer runner captures the result, the gate proves that a complete authenticated read finished over a stable bounded observation window and that the Overseer received evidence from that same heartbeat. GitHub does not provide a transactional snapshot, so state can change after completion. The unkeyed digest proves internal consistency and detects post-capture changes; by itself it does not prove GitHub provenance against a party that can invent and re-hash a whole record. The gate counts a narrow exact-head Codex signal for orientation, but it does not prove the model classified every comment correctly or that remediation is safe.

Repository code cannot stop a free-form automation that is allowed to skip the launcher or whose output is accepted without the audit proof. Mechanical enforcement therefore belongs in the outer heartbeat runner: audit and verify before model invocation, then reject an unsupported no-action result.

The audit never authorizes edits, thread resolution, review requests, pushes, restacks, merges, closes, or PR replacement. Autonomous remediation still requires a fresh trusted-reviewer and exact-head check, current-code validation, deduplication, an isolated clean worktree, verified stack ancestry, exact remote leases, relevant tests, current hosted checks, and separate write authority.
