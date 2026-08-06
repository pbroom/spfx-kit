# Shadcn Migration Public Evidence

This directory is the public, machine-checked evidence index for the migration.
It records exact proof identities and public-safe references, not private
operational details or claims inferred from another proof event.

```sh
npm run evidence:check
npm run evidence:check -- --base-ref origin/main
```

The validator never generates evidence, IDs, fixtures, or timestamps. The
operator records values from the proof that actually ran.

## Files and immutable history

- `schema.v1.json` defines proof events and release-set manifests. Its exact v1
  bytes are immutable after the bootstrap merge. A future schema requires a new
  versioned file and an explicitly reviewed validator transition.
- `ledger.v1.jsonl` contains one complete JSON object and one atomic proof event
  per line. It starts empty because absence means a proof has not run.
- `baseline-source-2026-08-05.md` is an initial exact-commit source inventory;
  it does not claim emitted-artifact or operational proof.
- `baseline-artifacts-2026-08-05.md` records clean exact-head local builds and
  emitted-package identities; it does not claim hosted, remote, SharePoint, or
  rollback proof.
- `monaco-0.53.0-min-vs-inventory.json` records the exact npm-package `min/vs`
  regular-file tree used to bound the Monaco decision. It enumerates modules,
  workers, CSS, embedded support assets, byte counts, and digests, but is not a
  runtime request graph and does not claim CDN or browser delivery proof.
- `workbench-v1-public-source-format-inventory.json` records the public V1 format,
  default source digest, generic property-bag bridge, approved modules, and
  tracked prefixed-envelope search. No concrete `codeWorkspace` registration
  exists in the pinned public source, no persisted population is inferred,
  private authored records were not inspected or counted, and V2 compatibility
  remains unproven.
- `bootstrap-main-ruleset.md` defines the guarded post-merge probe and required
  candidate-head status procedure; it grants no merge or settings authority.
- `trust-base.v1.json` binds the reviewed workflow tree, isolated validator
  runtime tree, schema, status context, and exact Node/npm/Ajv closure. After
  bootstrap, its bytes and every protected tree entry are immutable under v1.
- `release-sets/<releaseSetId>.json` is a write-once release-set manifest. Its
  filename must exactly match `releaseSetId`.

Never edit or delete a ledger row. A correction appends a row with the same
`eventKey` and names one or more earlier rows in the non-empty, unique
`supersedesEvidenceIds` array. A normal linear correction names one current
leaf. The append-only graph may branch by having two corrections name the same
earlier parent. Referencing a shared parent that is no longer a leaf is valid;
each referenced ID is removed only if it is currently a leaf, and the new row
becomes a leaf. A conflict-resolution row therefore names every current
conflicting leaf. Missing, later, and foreign-key IDs are invalid, and exactly
one current leaf must remain for every event key after the full ledger is read.

A release set contains the complete matrix of required export-target artifacts
that is intended to work together from one clean source identity. The
`single`, `cdn`, `staging-cdn`, and `standalone` artifacts remain distinct and
each subject and event retains its own `exportTarget`, but all required targets
for one candidate belong to the same immutable manifest. Adding or removing a
required target—or changing any source, UI profile, application, target
artifact, deployment, resource manifest, configuration identity, or digest—
rotates the whole set to a new generated `releaseSetId` and file. Environment
and deployment-topology changes create new evidence rows, not a new release
set.

`releaseSetProfile` makes that closure machine-checkable:

- `source-only` has exactly `exportTargets: ["source"]`, no resource manifests
  or deployments, and is required for the four Phase 0 governance events.
- `application-matrix` has exactly `source`, `single`, `cdn`, `staging-cdn`,
  and `standalone` in canonical order. For every `applicationId` represented by
  its artifacts, it contains at least one non-report artifact bound to each of
  the four deployable targets. Coverage is evaluated independently per
  application; artifacts from different applications cannot combine to satisfy
  one application's matrix. A report records proof metadata; it cannot satisfy
  target-output coverage. Splitting those targets across release sets is
  invalid.

Artifact, resource, deployment, and rollback subjects require an
`application-matrix` release set. Both candidate and prior rollback identities
must use that profile. Source-subject technical events may bind either profile
when their actual proof scope permits it.

The deterministic event key includes the typed proof subject:

```text
<releaseSetId>::<deploymentTopologyId>::<phaseSurface>::<exportTarget>::<environment.class>/<environment.opaqueId>::<proofEvent>::<proofSubject.subjectId>
```

`proofSubject.subjectId` is not operator-selected. Build the canonical identity
for the complete typed subject and derive
`sub-${sha256(canonicalIdentity).slice(0, 32)}`. The validator exports
`createProofSubjectId(subject)` for producers and rejects arbitrary IDs even
when they otherwise match the opaque-ID syntax. This makes the event key stable
for the exact proof subject and prevents one identity from being relabeled.

## Exact proof subjects

Every row has exactly one typed `proofSubject`:

- `source` binds one source revision.
- `artifact` binds an exact application ID, artifact ID and kind, export target,
  and SHA-256 from the release set.
- `resource` binds an exact package artifact plus resource ID, resource release,
  and manifest SHA-256.
- `deployment` binds an exact deployment, application, package artifact,
  export target, package SHA-256, and applicable resource identity.
- `rollback` binds distinct candidate and prior release sets with each exact
  deployment, application, package, resource release, and digest.

The Phase 0 governance events `baseline-inventory`,
`classification-acceptance`, `accountability-acceptance`, and
`decision-acceptance` always use a `source` subject, `exportTarget: source`, and
a public-safe reference to the reviewed record. They are separate acceptance
facts and do not stand in for technical `local-validation` proof.

A report digest cannot satisfy package proof. `remote-bytes` and
`remote-headers` use resource subjects; deployment/runtime events use deployment
subjects; rollback events use rollback subjects. No proof event implies any
other event. `artifact-closure` cannot use an `artifactKind: report` subject;
it must bind the exact non-report artifact kind whose closure was inspected.

Delivery bindings are target-aware. Remote-resource proof is valid only for
`cdn` or `staging-cdn`. A `single` deployment is the embedded delivery mode and
must have `resourceBinding: null`; `cdn` and `staging-cdn` deployments must bind
an exact resource ID, release ID, and manifest digest. Other export targets are
not deployment subjects.

Rollback keeps the candidate and prior on the same export target. A
single/embedded rollback binds both exact packages and uses `null` resource
bindings for both releases. A `cdn` or `staging-cdn` rollback binds the exact
package and resource identity for both releases. Cross-target rollback rows are
invalid; record separate proof for an explicitly approved topology transition.
Different release-set, deployment, or package-artifact IDs alone do not prove a
rollback: candidate and prior must identify materially different deployment
generations. Their package digest or exact resource binding must differ. For
`single`, whose resource bindings are `null`, this requires different package
digests; for `cdn` and `staging-cdn`, the package digest, resource ID, resource
release, or resource-manifest digest must differ.

Every row identifies the public validator repository, exact validator commit,
script path, and immutable schema digest. For an appended row, that validator
commit must be an ancestor of the trusted base and carry the same v1 trust-base,
schema, protected workflow tree, and protected validator-runtime tree as the
trusted base. Its exact public revision must also be present in the immutable
release set. This stable trust identity can therefore remain unchanged when an
unrelated commit advances `main`; it is neither the candidate head nor the
moving base tip. A public PR exact head must match both the row's source revision
and a release-set source revision.
`exact-head-ci` always requires `prExactHead`.

The trusted validator captures its start time before reading the candidate. A
newly appended row may set `recordedUtc` no later than five minutes after that
trusted start time. The bound applies only to rows appended beyond the trusted
base ledger, so historical rows that were already accepted remain valid; normal
timestamp syntax and supersession ordering still apply to every row.

Passing operational events require a `non-production` or `production`
environment, distinct opaque `authorizationEvidenceId` and
`operatorEvidenceId`, and exact package/resource identities. A passing
`rollback-drill` is non-production only and binds both candidate and prior
identities. Failed, blocked, and expired rows may record an attempted event
without implying operational authorization.

## Public boundary

Opaque values use a nonsemantic generated prefix plus 16–64 lowercase hex
characters, for example `env-4f8c...`; never encode a tenant, customer, site,
person, origin, or licensed asset name in an ID. Only these repositories may be
recorded as `public-git`:

- `pbroom/spfx-kit`
- `pbroom/better-text-spfx`
- `pbroom/better-divider-spfx`
- `pbroom/better-list-spfx`

Prefer `repository-path` for public evidence. `public-url` accepts only an
explicit issue, pull request, commit, workflow run/job, or commit-pinned blob in
one of those four public GitHub repositories. Query strings, fragments, other
hosts, and other repositories fail validation.

For private repositories, pull requests, protected environments, App Catalogs,
tenants, sites, storage origins, licensed inventories, and operators, use only
generated opaque evidence IDs backed by the approved private system. Never put
private URLs, tenant/site names, CDN origins, account names, credentials,
tokens, query strings, protected source identifiers, or licensed inventories
here.

## Trusted history check

Regular CI validates candidate schema and semantics, but candidate-controlled
code cannot establish append-only trust. `.github/workflows/evidence-history.yml`
therefore uses `pull_request_target` solely for the narrow history check. It:

1. checks out the exact base commit with its full ancestry, so historical stable
   validator identities can be resolved and ancestry-checked;
2. asserts Node `22.22.3` and npm `10.9.8`, then installs only the isolated
   `.github/evidence-trust/v1` dependency closure from its integrity-bearing
   base lockfile with lifecycle scripts disabled;
3. fetches and verifies the event's PR-head SHA without checking it out; and
4. executes the base validator and base schema with `--candidate-ref`, reading
   candidate protected trees, schema, ledger, and manifests only through Git
   object commands; and
5. uses the dependency-free, protected status publisher to write pending and
   terminal state to that exact candidate SHA.

Before loading candidate Git blobs, the validator parses the complete tree
metadata and enforces the expected path/type/mode contract, a 1,000-entry limit,
a 10 MiB per-blob limit, and a 10 MiB aggregate limit. Only after those checks
pass does it load blobs sequentially and verify each returned byte count against
the advertised tree size. A candidate therefore cannot force unbounded parallel
blob reads or defer size rejection until after the tree has been buffered.

It never executes candidate JavaScript, package scripts, actions, schemas, or
configuration. The entire `.github/workflows` tree and the exact
`.github/evidence-trust/v1` tree are base-anchored: candidate additions,
deletions, edits, symlinks, or mode changes fail. This prevents a candidate from
adding another GitHub Actions workflow that publishes the reserved v1 context,
or redirecting npm/Node resolution through a shrinkwrap or nearer
`node_modules`. Root `.nvmrc`, `package.json`, and lockfiles remain outside this
closure and may evolve independently.

The trusted workflow has `contents: read` plus the narrow `statuses: write`
permission needed to publish `spfx-kit/evidence-history-v1` on the exact
verified PR-head SHA. The status is set to failure from an `always()` step when
trusted validation does not finish successfully. Require that candidate-head
status—not the `pull_request_target` job check—after the bootstrap merge.

This distinction is mandatory because `pull_request_target` executes in the
default-branch context and its `GITHUB_SHA` is the default-branch commit. The
workflow verifies `github.event.pull_request.head.sha`, fetches that exact
commit only as inert Git data, and publishes the terminal status to that same
SHA. Follow [`bootstrap-main-ruleset.md`](bootstrap-main-ruleset.md) and prove
the behavior on a post-merge probe PR before activating a requirement.

This pull request introduces the trusted workflow, so the workflow cannot
protect its own bootstrap: `pull_request_target` executes only workflows already
present on the default branch. Do not claim the trusted job ran for this PR.
Merge the empty-ledger bootstrap under human review, require the stable
candidate-head status, and only then accept evidence rows.

For every ordinary merge, the effective ruleset requires a version-specific
candidate-head status produced by the exact default-branch trust root; candidate
code never selects that context or publisher. Because v1 freezes the complete
workflow tree, a replacement workflow tree cannot be simultaneously green under
v1. A future v2 transition therefore temporarily configures one named bypass
actor under an explicit authorization limited to the reviewed exact SHA, merges
only that trust-root replacement while the v1 requirement remains configured,
and removes the bypass actor immediately. V1 then remains required and
deliberately blocks every ordinary merge while positive and negative v2 probes
establish `spfx-kit/evidence-history-v2` on exact candidate heads.

Add the observed v2 context and integration to the ruleset before removing the
v1 requirement; at no point may the ruleset have zero trusted evidence
requirements. If v2 cannot pass its probes, use the same temporary named-actor
mechanism under a new exact-SHA authorization to restore the reviewed v1
workflow tree, remove the bypass actor immediately, and prove v1 effective
again. Preserve the v1 schema, trust manifest, runtime, and historical evidence
bytes so v2 can validate retained history. Because GitHub Actions shares one App
identity across workflows, this transition remains an administrator-authorized
trust transfer unless an independently controlled status App is introduced.

## Runtime and delivery boundaries

This ledger does not relax the migration architecture:

- React and ReactDOM remain SPFx-provided at exactly `17.0.1`; never bundle or
  CDN-share another runtime.
- Base UI implementation and essential generated UI CSS remain app-owned.
- App-CDN and optional shared-resource CDN releases are separate contracts.
  Local mock evidence is not remote-byte, remote-header, deployment, or
  SharePoint runtime evidence.
- The shared-resource runtime namespace remains closed until its independent
  manifest, deployment, browser, fallback, retention, and rollback gates pass.
- Private repositories and licensed assets remain in approved boundaries; only
  public-safe references cross into this repository.

Schema validity establishes record shape and history integrity. It does not
establish that a proof is truthful, current, authorized, or sufficient for a
migration gate; reviewers must inspect the referenced evidence and required
terminal-event matrix.
