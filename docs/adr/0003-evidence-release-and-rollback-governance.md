# ADR-0003: Evidence, release, and rollback governance

- Status: Accepted governance decision; operational proofs unrun
- Date: 2026-08-05
- Scope: Evidence ledger, distribution closure, immutable publication, and rollback proof
- Related roadmap: [`docs/shadcn-migration-roadmap.md`](../shadcn-migration-roadmap.md)

## Decision state

This ADR defines governance and acceptance semantics. It does not authorize a merge, release, upload, CDN publication, App Catalog operation, site installation, retention deletion, or rollback drill. It also does not create, select, or name a private repository or evidence service. Operational actions require the explicit authority described below.

`@pbroom` owns the repository decision and phase gate through
[spfx-kit#85](https://github.com/pbroom/spfx-kit/issues/85). This governance
decision is accepted for implementation. The public ledger's exact-head CI,
selection of a protected evidence location when protected proof is first
required, and authorization of a non-production rollback topology remain
separate implementation and operational gates. None is implied or reported as
passing by this ADR.

The bootstrap PR keeps the ledger empty. A base-trusted
`pull_request_target` check cannot protect the PR that first introduces its
workflow and validator. Its job also runs in the default-branch context rather
than on the candidate SHA. After this PR is merged, a probe PR must prove the
trusted workflow publishes terminal commit status
`spfx-kit/evidence-history-v1` on the exact verified candidate head. Only after
that candidate-head status is required by repository policy may a later stacked
PR add the first release-set manifest and evidence rows. Bootstrap validation is
reported as ordinary PR CI, not appended as self-attested immutable evidence.

## Context

SPFx Kit has four distinct export products: `single`, `cdn`, `staging-cdn`, and `standalone`. They can share one clean source revision while having different closure and verification requirements. A successful local build cannot prove remote bytes, headers, App Catalog deployment, SharePoint behavior, or recoverability.

The governance contract therefore needs to preserve exact artifact identity, distinguish each proof event, keep private operational data out of public records, prevent mixed or mutable resource generations, and require a real non-production restoration drill before rollback is described as proven.

## Decision

### 0. Base-anchored candidate-head gate

The stable required context is `spfx-kit/evidence-history-v1`, published on the
exact PR-head commit by a `pull_request_target` workflow that checks out and
executes only base code. The v1 trust base consists of:

- the complete `.github/workflows` Git tree, including entry paths, blob type,
  file mode, and bytes;
- the complete `.github/evidence-trust/v1` Git tree, containing the canonical
  validator, dependency-free status publisher, exact Node/npm configuration,
  and a minimal integrity-bearing Ajv lockfile;
- the exact `schema.v1.json` mode and bytes; and
- `trust-base.v1.json`, which binds those trees, the reserved context, and the
  expected runtime versions.

Once v1 is active on `main`, candidate additions, deletions, edits, symlinks, or
mode changes anywhere in either protected tree fail. The isolated runtime
prevents root `npm-shrinkwrap.json`, root dependency changes, or nearer tracked
modules from redirecting the trusted import. Root monorepo dependency files are
deliberately not frozen.

The trust manifest cannot authorize its own replacement because the base
validator compares candidate manifest and tree bytes directly with the trusted
base before accepting history. Bootstrap is the only unprotected introduction
and therefore requires the human review and post-merge probes in the bootstrap
runbook.

An active version is never mutated in place or assigned a reused status
context. A transition adds v2 beside v1, validates retained history, proves
positive and negative candidate-head probes, requires v2 alongside v1, and
removes the v1 requirement only after v2 is effective. Changing the frozen
workflow tree requires a narrowly authorized repository-policy transition, or
an independently controlled GitHub App that can own the status identity.

### 1. Atomic evidence rows

Evidence is append-only and atomic. One row records one proof event for one stable event key; it must not collapse local validation, artifact closure, remote verification, deployment, runtime behavior, and rollback into a single pass.

Allowed evidence results are `pass`, `fail`, `blocked`, and `expired`. Absence means not run, never pass. Corrections append a new row that explicitly supersedes the earlier row. For any event key, exactly one unsuperseded leaf may remain; conflicting leaves block the dependent gate.

The proof-event vocabulary is:

- `local-validation`
- `exact-head-ci`
- `local-mock-smoke`
- `artifact-closure`
- `remote-bytes`
- `remote-headers`
- `app-catalog-deployment`
- `site-install-update`
- `sharepoint-runtime`
- `fallback-negative-case`
- `rollback-artifacts-retained`
- `rollback-drill`

The event key is the stable combination of release-set ID, deployment-topology ID where applicable, phase or surface, export target, environment, and proof event. A row records the exact subject identity, validator version, timestamp, result, evidence references, and supersession reference. It may contain several observations from the same atomic event, but may not infer another proof event.

Examples of non-equivalence are governance rules:

- `local-mock-smoke` does not imply `remote-bytes`, `remote-headers`, deployment, or SharePoint runtime.
- `remote-bytes` does not imply correct MIME/cache/CORS/CSP headers.
- `remote-headers` does not imply App Catalog deployment or site installation.
- `app-catalog-deployment` does not imply browser runtime success.
- retained rollback artifacts do not imply a successful rollback drill.
- an exact-head CI pass does not imply that the released archive or remote prefix contains those bytes.

### 2. Public and protected evidence split

Public records may contain public repository revisions, release-set IDs, deployment-topology aliases, opaque evidence IDs, event type, result, timestamp, supersession, and a public-safe summary. They must not contain private origins, tenant/site/App Catalog identifiers, credentials, signed URLs, internal inventory, private source locations, or raw protected traces.

Protected details belong only in an approved private evidence system with appropriate access control and retention. Public evidence refers to them by opaque ID. This ADR defines that interface only: it does not approve, create, or name a private repository, service, bucket, or other system. Until an owner and security approver select one, protected-evidence-dependent gates remain blocked.

Secrets must never be evidence payloads. Evidence may record the credential family or authorization mechanism used, but not token, password, key, cookie, or signed query material.

### 3. Release-set and deployment-topology identity

A release set groups the exact identities that are intended to ship together:

- public source revisions or opaque protected-source revision evidence IDs;
- UI source-profile version and digest;
- package identities and final archive digests;
- app resource manifests and, where used, shared-resource manifest identities;
- export-target outputs and configuration identities;
- evidence-schema and validator versions needed to interpret the set.

Any change to a source revision, UI profile, dependency or package identity, archive, resource manifest, build input that affects output, or export-target output creates a new release set. Environment and deployment location do not change the release set.

A deployment-topology ID groups the CDN origin/configuration, App Catalog, tenant, site collection/test site, and relevant policy configuration used for an environment. Public records use an opaque topology ID; protected details stay in the approved private evidence system. Moving the same release set to a different topology creates new topology-dependent evidence, not a new release set.

Mixed generations are invalid. Every deployed package, app-resource prefix, shared-resource generation, and manifest must resolve to the exact identities recorded by one release set.

### 4. Export-target closure

Each target needs its own `artifact-closure` evidence:

| Target        | Required closure                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single`      | `includeClientSideAssets=true`; reopen the final SPPKG; enumerate `ClientSideAssets`; reconcile every app-owned entry JS, lazy JS, CSS, font, image, worker/WASM/support asset, and permitted runtime external; prove the package refers to no app CDN asset.                                                                                                 |
| `cdn`         | `includeClientSideAssets=false`; produce the SPPKG and one complete, matching resource tree at the configured base; clear exact generated output before regeneration; bind the final package to the resource-tree manifest and digest. Until strict manifest support exists, the target is a handoff/template product and cannot inherit `staging-cdn` proof. |
| `staging-cdn` | Produce a generated immutable prefix with canonical `upload/`, a strict manifest, local artifact proof, exact-prefix remote-byte verification, separate remote-header verification, App Catalog/site evidence, and SharePoint browser evidence. Local mock hosting is only `local-mock-smoke`.                                                                |
| `standalone`  | Include source, exact build/profile configuration, dependency declarations, lockfile, and all adapters needed to reproduce every declared target; prove a clean install and build outside the monorepo with no production runtime dependency on `@spfx-kit/*`.                                                                                                |

All closure walks start from emitted artifacts and their real references, not merely from source imports. They include CSS `url(...)` references, fonts, images, lazy chunks, dynamic imports, workers, WASM/support files, and the explicit source-map inclusion or exclusion policy. Web-part and extension-only fixtures are both required.

Output cleanup is part of determinism: clear only the target's exact generated release/assets, manifest, deploy, and temporary trees before regeneration, while preserving unrelated documentation and user files. A final archive hash is recorded after all packaging and verification mutations are complete.

### 5. Resource-manifest versions

Manifest v1 is the legacy staging-CDN format. Existing v1 readers and retained historical v1 artifacts remain supported as immutable records. A v1 manifest can prove only the exact paths, byte sizes, hashes, and dependency fields defined by that version. It must not be reinterpreted as complete CSS/resource closure, and a v1 artifact must not be rewritten in place to appear v2-compliant.

Manifest v2 is required for new release acceptance once the v2 writer/validator transition PR is adopted. V2 must bind:

- schema version and strict parser policy;
- release-set ID, source/build identity, UI-profile version/digest, and final package/archive digest;
- immutable app-resource base and generation identity;
- every file's canonical relative path, byte count, cryptographic digest, MIME expectation, role, and dependency edges;
- entry JS, lazy JS, CSS, CSS `url(...)` dependencies, fonts, images, workers, WASM/support files, and permitted runtime externals;
- explicit source-map policy and any intentionally omitted development-only files;
- deterministic ordering and rejection of unknown or duplicate paths and unsupported fields.

The v2 validator resolves the complete graph from all emitted entrypoints and requires every app-owned file to be reachable or explicitly classified by a narrow policy. It rejects missing references, undeclared extras, escaping paths, digest/size/MIME mismatches, duplicate canonical paths, mutable bases, and references to a different generation.

Shared resources use their own strict resource manifest at an immutable shared-resource path. An app v2 manifest binds the exact shared manifest identity and permitted external edges rather than copying shared files into the app manifest. Legacy v1 parsing remains available for historical verification, but new v1 output cannot satisfy a v2 release gate after the transition date approved by the release owner.

### 6. Immutable publication and retention

Published app and shared-resource generations are content-identified and immutable. No `latest` path, overwrite, mixed generation, or GitHub raw/runtime origin is accepted. Shared resources follow an immutable version path such as `/shared/<resource>/versions/v<releaseVersion>/`; app resources use the release set's immutable generated prefix.

Expected base URLs and digests come from trusted release configuration, not from an untrusted uploaded archive. Publication order is shared resources first, app resources second, and App Catalog package last, with each step requiring explicit operational authority and its own evidence.

Retention is reverse-reference based. A generation cannot be deleted while referenced by a deployed package, a supported prior package, a rollback set, an active investigation hold, or the approved retention window. At minimum, the candidate and the previously known-good package plus all of their exact app/shared resource generations remain available through the rollback window. Retention deletion requires a fresh reference scan, named operator, approved change, and atomic evidence.

A security revocation creates a coordinated new release, deny/revocation action, or approved emergency response. It never silently overwrites immutable bytes. Emergency policy, including whether rollback to a vulnerable generation is prohibited, must be recorded before deployment.

### 7. Real non-production rollback drill

`rollback-drill=pass` requires a real, authorized non-production App Catalog and test site. A local package swap, mock server, retained archive, written runbook, or dry run is insufficient.

Preconditions are:

- named accountable owner, approver, operator, and evidence owner;
- explicit authorization for the named non-production topology and change window;
- exact candidate and previously known-good SPPKG identities;
- retained, byte-verified candidate and prior app/shared resource generations;
- known installation/update path, abort conditions, recovery contacts, and cache/fallback observation plan;
- no planned mutation of either immutable CDN generation.

The drill must:

1. Deploy/install or update to the exact candidate package and verify its exact runtime resource generation in SharePoint.
2. Restore the exact prior SPPKG through the authorized App Catalog/site path without changing immutable CDN bytes.
3. Verify the prior package, prior app/shared generation, browser behavior, network requests, fallback/negative case, and cache behavior.
4. Restore the exact candidate package and verify its original generation and behavior again.
5. Record candidate and prior identities, topology ID, operator/approver, timestamps, elapsed recovery time, protected trace IDs, public-safe results, failures, and supersession relationships as distinct atomic events.

If authorization, exact retained bytes, prior identity, protected evidence storage, or restoration capability is missing, the event result is `blocked` or `fail` as appropriate—not pass. The operator must follow the approved abort/escalation path rather than improvising against production.

### 8. Operational authority

Repository changes may implement schemas, validators, deterministic local artifact generation, local mock smoke tests, read-only remote verification, and runbooks within the authority of their individual task and PR. They do not confer authority to publish or mutate an external system.

The following require explicit, separately recorded operational authority for the exact target and action:

- creating or selecting a protected evidence system;
- using protected credentials or reading protected operational inventory;
- uploading or deleting CDN resources;
- changing CDN headers, routing, retention, or access policy;
- uploading, deploying, replacing, or removing an App Catalog package;
- installing/updating/removing an app on a site;
- executing a rollback or rollback drill;
- deleting retained rollback generations;
- performing a production release or emergency revocation.

Approval must identify the release set, topology, environment, operator, allowed actions, time window, and abort boundary. Authority for one action or environment does not imply authority for another. This ADR itself grants none of them.

### 9. Independent implementation boundaries

Governance implementation should use independent PRs:

1. Atomic evidence schema, append/supersede validation, and public-safe projection.
2. Manifest-v2 schema, deterministic writer/reader, legacy-v1 reader policy, and transition fixtures.
3. Emitted asset-graph and embedded-SPPKG closure for `single`, including CSS/resource edges.
4. Strict `cdn` and `staging-cdn` resource closure, immutable prefix binding, exact-prefix remote bytes, and separate header verification.
5. `standalone` reproduction closure and clean outside-monorepo verification.
6. Release-set/topology reconciliation and cross-target mixed-generation rejection.
7. Retention/reverse-reference validation and the operator runbook; execute the real rollback drill only under a separate explicit authorization event.

Each PR must state which proof events it can produce. Tooling tests and local evidence cannot mark deployment- or rollback-dependent events as passed.

## Consequences

Release readiness becomes slower to assert but much harder to overstate. The evidence ledger will contain more rows, and manifest v2 requires a full emitted-resource graph rather than the current narrower legacy model. In exchange, failures can be localized to a specific artifact, topology, target, or operational step without invalidating unrelated evidence.

Immutable generation and reverse-reference retention consume more storage. They make rollback and audit possible without mutating the bytes a deployed package expects. Public/private projection adds administration but prevents public artifacts from becoming an inventory of protected infrastructure.

## Unresolved approvals and blockers

- `@pbroom` owns repository implementation and phase acceptance; a rollback-drill operator is named only by a later explicit operational authorization.
- No protected evidence system is approved or named by this ADR.
- Manifest-v2 schema details, transition date, validator versioning, and legacy-v1 support window still require their implementation PR and evidence.
- CDN MIME/cache/CORS/CSP policy and retained-generation window remain topology-specific operational inputs owned by `@pbroom` unless later reassigned.
- An authorized non-production App Catalog, test site, deployment topology, credentials, and change window are not yet available as evidence.
- No rollback pass is claimed until the full candidate-to-prior-to-candidate drill completes and its atomic evidence is recorded.
