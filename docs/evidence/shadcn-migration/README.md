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
- `bootstrap-main-ruleset.md` defines the guarded post-merge probe and required
  candidate-head status procedure; it grants no merge or settings authority.
- `trust-base.v1.json` binds the reviewed workflow tree, isolated validator
  runtime tree, schema, status context, and exact Node/npm/Ajv closure. After
  bootstrap, its bytes and every protected tree entry are immutable under v1.
- `release-sets/<releaseSetId>.json` is a write-once release-set manifest. Its
  filename must exactly match `releaseSetId`.

Never edit or delete a ledger row. A correction appends a row with the same
`eventKey` and names the current row in `supersedesEvidenceId`. Corrections form
one linear chain. Release-set manifests are also immutable: any source, UI
profile, application, export target, artifact, deployment, resource manifest,
or digest change requires a new generated `releaseSetId` and file.

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

Every row identifies the public validator repository, exact validator commit,
script path, and immutable schema digest. A public PR exact head must match both
the row's source revision and a release-set source revision.
`exact-head-ci` always requires `prExactHead`.

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

1. checks out the exact base commit;
2. asserts Node `22.22.3` and npm `10.9.8`, then installs only the isolated
   `.github/evidence-trust/v1` dependency closure from its integrity-bearing
   base lockfile with lifecycle scripts disabled;
3. fetches and verifies the event's PR-head SHA without checking it out; and
4. executes the base validator and base schema with `--candidate-ref`, reading
   candidate protected trees, schema, ledger, and manifests only through Git
   object commands; and
5. uses the dependency-free, protected status publisher to write pending and
   terminal state to that exact candidate SHA.

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

An active v1 workflow, runtime tree, schema, or trust manifest is never edited
in place. A change adds a parallel v2 runtime and a new
`spfx-kit/evidence-history-v2` context, proves positive and negative probes,
requires v2 alongside v1, and removes the v1 requirement only after v2 is
effective. The retained v1 bytes remain available to validate historical
evidence. Because GitHub Actions shares one App identity across workflows, this
transition requires a narrowly authorized repository-policy change unless an
independently controlled status App is introduced.

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
