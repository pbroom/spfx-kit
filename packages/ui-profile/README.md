# React 17 Base Nova source profile

`@spfx-kit/ui-profile` is a private, tooling-only workspace. It records the
reviewed `spfx-react17-base-nova-v1` registry inputs and the deterministic
normalization needed by the first ADR-0001 implementation boundary.

Normal builds and verification are offline. They read the committed raw,
canonical, and normalized snapshots and fail when a snapshot is missing or its
digest changes. The only network-capable command is explicit:

```sh
npm --workspace @spfx-kit/ui-profile run profile:update:network
```

That command is for reviewed profile-update PRs. It refreshes all 24 registry
items as one staged batch; it is not a fallback for a missing local file. The
hosted responses are explicitly mutable and are not represented as outputs of
the recorded shadcn tool-source revision. Before intake, the command verifies
the exact installed `shadcn@4.16.1` version and lockfile integrity, then requires
each captured raw response to have the same parsed value returned by the pinned
package API. Reviewable raw, canonical, and normalized digests bind the accepted
component inputs.

Network update and offline regeneration both acquire the same
`.profile-generation-lock` before reading provenance or snapshots. The lock is
held through generation, replacement, staging cleanup, and settlement, so an
offline regeneration cannot publish output derived from snapshots that a
concurrent update replaced. Before the first generated-path rename, replacement
atomically journals the exact target inventory, old and staged tree digests,
and owned staging/backup paths. A terminated process is recovered on the next
run to one digest-exact old or complete new collection; ambiguous bytes or
path-injected metadata are preserved and fail closed. Do not manually remove a
journaled generation lock, staging directory, or backup. Hard-kill regression
tests cover every backup, install, commit, cleanup, and journal boundary.

All workspace package requirements are development-only, so production installs
add no profile dependency surface. The profile still records the exact direct
production dependencies and transitive closure that its reviewed sources would
eventually require. The normalized sources are evidence inputs, not a production
package export.

The repository host and strict profile compiler share the same
`@types/react@17.0.45` and `@types/react-dom@17.0.17` declaration contract, with
`@types/scheduler@0.16.8` pinned for its compatible tracing declaration. Base UI
1.6.0 uses the newer `React.JSX` namespace, so a profile-only type bridge maps
its two referenced members, `Element` and `IntrinsicElements`, to their global
React 17 equivalents. Both TypeScript matrix runs list and reject React or
scheduler type files outside their lockfile-resolved roots. This narrow bridge
does not alter the Lab, Workbench, or SPFx runtime. The profile ID plus its
manifest and provenance digests identifies an exact generation.
This workspace does not wire components into an app, compile CSS, implement
portal ownership, or establish browser, package, or standalone-export proof.
Its public 1,940-option Combobox fixture proves exact-scale cardinality and
basic DOM behavior only; it does not claim the real-font workload required for
the final ADR-0001 Phase 1 exit.

## Offline checks

```sh
npm --workspace @spfx-kit/ui-profile run verify
npm --workspace @spfx-kit/ui-profile run profile:verify:closure
npm --workspace @spfx-kit/ui-profile run typecheck
```

The Base UI 1.6.0 `SelectValue` declaration compatibility transform and the
upstream-derived popup lifecycle correction are kept as exact, digest-bound
contracts. The lifecycle correction backports the merged implementation from
[`mui/base-ui#5387`](https://github.com/mui/base-ui/issues/5387) without changing
the pinned dependency version. `profile:prepare:base-ui` applies both only to
a generated, ignored copy of an already-installed, byte-for-byte recognized
Base UI 1.6.0 package. It never mutates `node_modules`, downloads dependencies,
or accepts unknown declaration or runtime bytes.

Preparation serializes access with `.prepared/.base-ui-prepare-lock/owner.json`.
It releases only a matching owner token. A live owner fails fast; stale or
unreadable metadata fails closed. Acquisition fully initializes a unique
temporary lock directory, then atomically renames that nonempty directory into
place. A contender cannot observe missing or partial owner metadata and cleans
only its own temporary directory. Owner metadata is schema-validated before
liveness checks or mutation.

Before the first prepared-to-backup rename, preparation atomically adds a
token-bound transaction journal recording the prepared, backup, and unique
staging paths plus whether a prepared copy existed. On restart, that journal is
resolved before any backup deletion or new staging. Pre-move and backup-only
states restore the prior copy; prepared-plus-backup and completed states keep
the promoted copy only after validation. Ambiguous states preserve every path
and fail closed. Recovery validates the package identity and every transformed
declaration/runtime file against paths and SHA-256 digests derived directly
from the committed compatibility contracts.

Do not manually delete a journaled lock, backup, or staging directory. After
verifying that its recorded `prepare-base-ui.mjs` process is gone, rerun the
command and let journal recovery complete. Recovery first atomically installs a
fully initialized `recovery-claim/` directory inside the existing lock, then
re-reads the owner journal. Claim acquisition revalidates the exact outer lock
directory, owner token, and transaction before inspecting, quarantining, or
publishing a claim. A live claim blocks a second recoverer; a stale claim is
atomically quarantined and replaced without removing the journal. Temporary and
failed published claims are cleaned only when their owner and claim tokens still
match the same outer lock directory, so path reuse cannot poison a replacement
owner. The outer lock remains in place throughout recovery, each filesystem
mutation rechecks the owner and claim tokens, and final release verifies both
tokens.
For a stale lock without a transaction journal, inspect the lock and nearby
prepared paths before removing only that lock directory. Promotion, cleanup,
recovery, and lock-settlement errors are aggregated; unsafe recovery retains
the journal and owned lock.
