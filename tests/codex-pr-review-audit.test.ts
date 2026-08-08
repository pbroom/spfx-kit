import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link as createLink, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_KIND,
  AUDIT_PROOF_KIND,
  AuditIncompleteError,
  addIntegrity,
  auditRepository,
  canonicalJson,
  verifyAuditRecord,
  writeJsonAtomic
} from '../scripts/codex-pr-review-audit.mjs';
import {
  AUDIT_EVENT_KIND,
  appendCompleteAuditEvent,
  createAuditEvent,
  validateAuditEvent
} from '../scripts/codex-pr-review-audit-event.mjs';

const apiUrl = 'https://api.github.com';
const repository = 'pbroom/spfx-kit';
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const analyticsSlotOne = '2026-08-07T12:00:00.000Z';
const analyticsSlotTwo = '2026-08-08T00:00:00.000Z';
const analyticsSlotThree = '2026-08-08T12:00:00.000Z';
const analyticsSlotFour = '2026-08-09T00:00:00.000Z';

describe('Codex PR review audit', () => {
  it('exhaustively paginates, excludes drafts, sorts evidence, and emits a verifiable deterministic record', async () => {
    const firstHarness = githubFixture();
    const first = await auditRepository({
      repository,
      token: 'fixture-token',
      apiUrl,
      fetchImpl: firstHarness.fetch,
      runId: 'heartbeat-123',
      pageSize: 1,
      now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:02.000Z')
    });
    const second = await auditRepository({
      repository,
      token: 'fixture-token',
      apiUrl,
      fetchImpl: githubFixture().fetch,
      runId: 'heartbeat-123',
      pageSize: 1,
      now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:02.000Z')
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: AUDIT_KIND,
      schemaVersion: 1,
      status: 'complete',
      inventory: {
        stable: true,
        openCount: 2,
        draftCount: 1,
        count: 1,
        pullRequestNumbers: [7]
      },
      summary: {
        pullRequestCount: 1,
        reviewCount: 2,
        issueCommentCount: 2,
        reviewCommentCount: 3,
        reviewThreadCount: 2,
        reviewThreadCommentCount: 3,
        unresolvedNonOutdatedThreadCount: 1,
        currentTrustedCodexFindingCount: 1
      }
    });
    expect(first.pullRequests[0].reviews.values.map((review: any) => review.id)).toEqual([10, 20]);
    expect(first.pullRequests[0].reviewThreads.values.map((thread: any) => thread.id)).toEqual(['thread-a', 'thread-b']);
    expect(first.pullRequests[0].reviewThreads.values[1].comments.values.map((comment: any) => comment.id)).toEqual([
      '101',
      '102'
    ]);
    expect(first.integrity.digest).toMatch(/^[0-9a-f]{64}$/);

    const proof = verifyAuditRecord(first, {
      repository,
      expectedRunId: 'heartbeat-123',
      maxAgeSeconds: 300,
      now: new Date('2026-08-07T12:00:03.000Z')
    });
    expect(proof).toMatchObject({
      kind: AUDIT_PROOF_KIND,
      auditId: 'heartbeat-123',
      digest: first.integrity.digest,
      pullRequestCount: 1,
      currentTrustedCodexFindingCount: 1
    });
    const invalidRepositoryIdentity = structuredClone(first);
    invalidRepositoryIdentity.repository.nodeId = 123;
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidRepositoryIdentity), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/provenance/);
    const invalidPullRequestTimestamp = structuredClone(first);
    invalidPullRequestTimestamp.pullRequests[0].createdAt = 'not-a-timestamp';
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidPullRequestTimestamp), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/ineligible pull request/);
    const invalidPullRequestUrl = structuredClone(first);
    invalidPullRequestUrl.pullRequests[0].url = 'https://github.com/pbroom/spfx-kit/pull/999';
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidPullRequestUrl), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/ineligible pull request/);
    const invalidBaseRepository = structuredClone(first);
    invalidBaseRepository.pullRequests[0].base.repository = 'another/repository';
    invalidBaseRepository.inventory.openPullRequests[0].base.repository = 'another/repository';
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidBaseRepository), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/open-pull-request identity/);
    const invalidReviewCommit = structuredClone(first);
    invalidReviewCommit.pullRequests[0].reviews.values[0].commitId = 123;
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidReviewCommit), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review schema/);
    const ambiguousReviewId = structuredClone(first);
    ambiguousReviewId.pullRequests[0].reviews.values[1].id = String(ambiguousReviewId.pullRequests[0].reviews.values[0].id);
    expect(() =>
      verifyAuditRecord(addIntegrity(ambiguousReviewId), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review schema/);
    const duplicateReviewNodeId = structuredClone(first);
    duplicateReviewNodeId.pullRequests[0].reviews.values[1].nodeId =
      duplicateReviewNodeId.pullRequests[0].reviews.values[0].nodeId;
    expect(() =>
      verifyAuditRecord(addIntegrity(duplicateReviewNodeId), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review database and node identities/);
    for (const [field, value] of [
      ['id', '10'],
      ['nodeId', 'another-review-node'],
      ['commitId', 'c'.repeat(40)]
    ] as const) {
      const contradictoryThreadReview = structuredClone(first);
      contradictoryThreadReview.pullRequests[0].reviewThreads.values[1].comments.values[0].review[field] = value;
      expect(() =>
        verifyAuditRecord(addIntegrity(contradictoryThreadReview), {
          repository,
          expectedRunId: 'heartbeat-123',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z')
        })
      ).toThrow(/review database and node identities/);
    }
    const contradictoryRestReviewComment = structuredClone(first);
    contradictoryRestReviewComment.pullRequests[0].reviewComments.values.find(
      (comment: any) => comment.id === 101
    ).pullRequestReviewId = 10;
    expect(() =>
      verifyAuditRecord(addIntegrity(contradictoryRestReviewComment), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review database and node identities/);
    const contradictoryCommentNode = structuredClone(first);
    contradictoryCommentNode.pullRequests[0].reviewThreads.values[1].comments.values[0].nodeId = 'another-review-comment-node';
    expect(() =>
      verifyAuditRecord(addIntegrity(contradictoryCommentNode), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review database and node identities/);
    const duplicateCommentNode = structuredClone(first);
    const duplicateRestComment = duplicateCommentNode.pullRequests[0].reviewComments.values.find(
      (comment: any) => comment.id === 102
    );
    const duplicateGraphqlComment = duplicateCommentNode.pullRequests[0].reviewThreads.values[1].comments.values.find(
      (comment: any) => comment.id === '102'
    );
    duplicateRestComment.nodeId = 'review-comment-101';
    duplicateGraphqlComment.nodeId = 'review-comment-101';
    expect(() =>
      verifyAuditRecord(addIntegrity(duplicateCommentNode), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review database and node identities/);
    for (const rootMode of ['zero', 'multiple'] as const) {
      const ambiguousRoots = structuredClone(first);
      if (rootMode === 'zero') {
        for (const comment of ambiguousRoots.pullRequests[0].reviewComments.values.filter((comment: any) =>
          [100, 101].includes(comment.id)
        )) {
          comment.inReplyToId = 999;
        }
      } else {
        ambiguousRoots.pullRequests[0].reviewComments.values.find((comment: any) => comment.id === 102).inReplyToId = null;
      }
      expect(() =>
        verifyAuditRecord(addIntegrity(ambiguousRoots), {
          repository,
          expectedRunId: 'heartbeat-123',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z')
        })
      ).toThrow(/review database and node identities/);
    }
    const stringReviewCommentId = structuredClone(first);
    stringReviewCommentId.pullRequests[0].reviewComments.values[0].id = '100';
    expect(() =>
      verifyAuditRecord(addIntegrity(stringReviewCommentId), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/review-comment schema/);
    const reversedPullRequestTimestamps = structuredClone(first);
    reversedPullRequestTimestamps.pullRequests[0].createdAt = '2026-08-07T12:00:00Z';
    expect(() =>
      verifyAuditRecord(addIntegrity(reversedPullRequestTimestamps), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/ineligible pull request/);
    const equalPullRequestTimestamps = structuredClone(first);
    equalPullRequestTimestamps.pullRequests[0].createdAt = equalPullRequestTimestamps.pullRequests[0].updatedAt;
    expect(() =>
      verifyAuditRecord(addIntegrity(equalPullRequestTimestamps), {
        repository,
        expectedRunId: 'heartbeat-123',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).not.toThrow();
    const invalidRunId = structuredClone(first);
    invalidRunId.audit.id = 123;
    expect(() =>
      verifyAuditRecord(addIntegrity(invalidRunId), {
        repository,
        expectedRunId: 123 as any,
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).toThrow(/run ID/);
    expect(firstHarness.requests.every((request) => request.method === 'GET' || request.pathname === '/graphql')).toBe(true);
    expect(firstHarness.requests.every((request) => request.authorization === 'Bearer fixture-token')).toBe(true);

    const mixedCaseHarness = githubFixture();
    const mixedCaseRepository = await auditRepository({
      repository: 'PBROOM/SPFX-KIT',
      token: 'fixture-token',
      apiUrl,
      fetchImpl: (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/repos/PBROOM/SPFX-KIT') url.pathname = '/repos/pbroom/spfx-kit';
        return mixedCaseHarness.fetch(url, init);
      },
      runId: 'mixed-case-repository',
      pageSize: 1,
      now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:02.000Z')
    });
    expect(mixedCaseRepository).toMatchObject({
      status: 'complete',
      repository: { nameWithOwner: repository },
      pullRequests: [{ url: 'https://github.com/pbroom/spfx-kit/pull/7' }]
    });
    const caseOnlyBaseRepository = await auditWith(
      githubFixture({ baseRepositoryCaseVariant: true }),
      'case-only-base-repository'
    );
    expect(caseOnlyBaseRepository.pullRequests[0].base.repository).toBe('PBROOM/SPFX-KIT');
    expect(() =>
      verifyAuditRecord(caseOnlyBaseRepository, {
        repository,
        expectedRunId: 'case-only-base-repository',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).not.toThrow();
  });

  it('fails incomplete with PR and collection context when one inventory surface cannot be fetched', async () => {
    const harness = githubFixture({ failure: 'issue-comments-page-2' });
    await expect(
      auditRepository({
        repository,
        token: 'fixture-token',
        apiUrl,
        fetchImpl: harness.fetch,
        runId: 'heartbeat-failed',
        pageSize: 1,
        now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:01.000Z')
      })
    ).rejects.toSatisfy((error: AuditIncompleteError & { record?: any }) => {
      expect(error.record).toMatchObject({
        kind: AUDIT_KIND,
        status: 'incomplete',
        audit: { id: 'heartbeat-failed' },
        failure: { phase: 'collection', pullRequestNumber: 7, collection: 'issueComments', page: 2, status: 503 }
      });
      return true;
    });
  });

  it('fails incomplete when GitHub repository identity is not a string', async () => {
    await expect(auditWith(githubFixture({ numericRepositoryNodeId: true }), 'numeric-repository-node')).rejects.toSatisfy(
      (error: AuditIncompleteError & { record?: any }) => {
        expect(error.record).toMatchObject({
          status: 'incomplete',
          failure: { phase: 'repository' }
        });
        return true;
      }
    );
  });

  it('fails incomplete for malformed producer identities before emitting a complete audit', async () => {
    await expect(
      auditRepository({
        repository,
        token: 'fixture-token',
        apiUrl,
        fetchImpl: githubFixture().fetch,
        runId: 123 as any,
        now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:01.000Z')
      })
    ).rejects.toMatchObject({ record: { status: 'incomplete', audit: { id: '' }, failure: { phase: 'arguments' } } });
    await expect(auditWith(githubFixture({ mismatchedPullRequestUrl: true }), 'mismatched-url')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'detail', pullRequestNumber: 7 } }
    });
    await expect(auditWith(githubFixture({ duplicatePullRequestNodeId: true }), 'duplicate-pr-node')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'pullRequestNodeIds' } }
    });
    for (const [runId, options, pullRequestNumber] of [
      ['mismatched-base-repo', { mismatchedBaseRepository: true }, 7],
      ['mismatched-draft-base-repo', { mismatchedDraftBaseRepository: true }, 8]
    ] as const) {
      await expect(auditWith(githubFixture(options), runId)).rejects.toMatchObject({
        record: {
          status: 'incomplete',
          failure: { phase: 'inventory-before', collection: 'openPullRequests', pullRequestNumber }
        }
      });
    }
    await expect(auditWith(githubFixture({ markerReviewInvalidCommit: true }), 'invalid-review-commit')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviews' } }
    });
    for (const invalidReviewId of [0, -1, '20', true]) {
      await expect(
        auditWith(githubFixture({ markerReviewId: invalidReviewId }), `invalid-review-id-${invalidReviewId}`)
      ).rejects.toMatchObject({
        record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviews' } }
      });
    }
    await expect(auditWith(githubFixture({ duplicateReviewNodeId: true }), 'duplicate-review-node')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewIdentities' } }
    });
    await expect(
      auditWith(githubFixture({ duplicateReviewDatabaseIdAcrossPullRequests: true }), 'duplicate-review-database')
    ).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewIdentities' } }
    });
    for (const [runId, options] of [
      ['graphql-review-database-mismatch', { graphqlReviewDatabaseId: '10' }],
      ['graphql-review-node-mismatch', { graphqlReviewNodeId: 'another-review-node' }],
      ['graphql-review-commit-mismatch', { graphqlReviewCommitMismatch: true }],
      ['rest-review-comment-mismatch', { restReviewCommentReviewId: 10 }],
      ['graphql-comment-node-mismatch', { graphqlCommentNodeIdMismatch: true }],
      ['duplicate-review-comment-node', { duplicateReviewCommentNodeId: true }],
      ['zero-review-thread-roots', { ambiguousThreadRoots: 'zero' }],
      ['multiple-review-thread-roots', { ambiguousThreadRoots: 'multiple' }]
    ] as const) {
      await expect(auditWith(githubFixture(options), runId)).rejects.toMatchObject({
        record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewIdentities' } }
      });
    }
    await expect(
      auditWith(githubFixture({ restReviewCommentIdAsString: true }), 'rest-review-comment-id-string')
    ).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewComments' } }
    });
    await expect(
      auditWith(githubFixture({ invalidReviewCommentParent: true }), 'invalid-review-comment-parent')
    ).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewIdentities' } }
    });
    await expect(auditWith(githubFixture({ graphqlCommentIdAsNumber: true }), 'graphql-comment-id-number')).rejects.toMatchObject(
      {
        record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviewThreadComments' } }
      }
    );
    await expect(
      auditWith(githubFixture({ reversedPullRequestTimestamps: true }), 'reversed-pull-request-timestamps')
    ).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'pullRequestTimestamps' } }
    });
  });

  it('rejects GraphQL partial data and inventory drift instead of authorizing a partial audit', async () => {
    await expect(auditWith(githubFixture({ failure: 'graphql-partial' }), 'partial')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'graphql', collection: 'reviewThreads' } }
    });
    await expect(auditWith(githubFixture({ driftAfterInventory: true }), 'drift')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'inventory-middle' } }
    });
  });

  it('rejects evidence drift, malformed thread state, duplicate pages, and an untrusted API origin', async () => {
    await expect(auditWith(githubFixture({ evidenceDrift: true }), 'evidence-drift')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'evidence-after' } }
    });
    await expect(auditWith(githubFixture({ malformedThread: true }), 'malformed')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'graphql', collection: 'reviewThreads' } }
    });
    await expect(auditWith(githubFixture({ duplicateReview: true }), 'duplicate')).rejects.toMatchObject({
      record: { status: 'incomplete', failure: { phase: 'normalize', collection: 'reviews' } }
    });
    await expect(
      auditRepository({
        repository,
        token: 'fixture-token',
        apiUrl: 'http://api.github.com',
        fetchImpl: githubFixture().fetch,
        runId: 'wrong-origin'
      })
    ).rejects.toMatchObject({ record: { status: 'incomplete', failure: { phase: 'arguments' } } });
  });

  it('requires explicit authentication and rejects stale, mismatched, or tampered success records', async () => {
    await expect(
      auditRepository({
        repository,
        token: '',
        apiUrl,
        fetchImpl: githubFixture().fetch,
        runId: 'missing-auth'
      })
    ).rejects.toMatchObject({ record: { status: 'incomplete', failure: { phase: 'authentication' } } });

    const record = await auditWith(githubFixture(), 'verify-me');
    const verification = {
      repository,
      expectedRunId: 'verify-me',
      maxAgeSeconds: 300,
      now: new Date('2026-08-07T12:00:03.000Z')
    };
    expect(() => verifyAuditRecord(record, { ...verification, expectedRunId: 'another-heartbeat' })).toThrow(/run ID/);
    expect(() => verifyAuditRecord(record, { ...verification, repository: 'pbroom/another-repo' })).toThrow(/repository/);
    expect(() => verifyAuditRecord(record, { ...verification, now: new Date('2026-08-07T12:10:00.000Z') })).toThrow(/stale/);
    expect(() =>
      verifyAuditRecord({ ...record, summary: { ...record.summary, unresolvedThreadCount: 999 } }, verification)
    ).toThrow(/integrity/);

    const inventedFingerprint = `sha256:${'0'.repeat(64)}`;
    const internallyConsistentForgery = addIntegrity({
      ...record,
      inventory: {
        ...record.inventory,
        beforeFingerprint: inventedFingerprint,
        middleFingerprint: inventedFingerprint,
        afterFingerprint: inventedFingerprint
      }
    });
    expect(() => verifyAuditRecord(internallyConsistentForgery, verification)).toThrow(/fingerprint/);

    const mismatchedDetail = structuredClone(record);
    mismatchedDetail.pullRequests[0].head.oid = 'c'.repeat(40);
    expect(() => verifyAuditRecord(addIntegrity(mismatchedDetail), verification)).toThrow(/detail identity/);

    const mismatchedComments = structuredClone(record);
    mismatchedComments.pullRequests[0].reviewThreads.values[0].comments.values = [];
    mismatchedComments.pullRequests[0].reviewThreads.values[0].comments.count = 0;
    mismatchedComments.summary.reviewThreadCommentCount -= 1;
    expect(() => verifyAuditRecord(addIntegrity(mismatchedComments), verification)).toThrow(/membership/);

    const longAudit = await auditRepository({
      repository,
      token: 'fixture-token',
      apiUrl,
      fetchImpl: githubFixture().fetch,
      runId: 'long-audit',
      pageSize: 1,
      now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:10:00.000Z')
    });
    expect(() =>
      verifyAuditRecord(longAudit, {
        repository,
        expectedRunId: 'long-audit',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:10:01.000Z')
      })
    ).toThrow(/timestamps/);
  });

  it('records a schema-valid nullable GraphQL review relationship without classifying it as exact-head', async () => {
    const record = await auditWith(githubFixture({ nullableThreadReview: true }), 'nullable-review');
    const comment = record.pullRequests[0].reviewThreads.values[1].comments.values[0];
    expect(comment.review).toBeNull();
    expect(record.summary.currentTrustedCodexFindingCount).toBe(0);
    expect(() =>
      verifyAuditRecord(record, {
        repository,
        expectedRunId: 'nullable-review',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z')
      })
    ).not.toThrow();

    const reportedRecord = await auditWith(
      githubFixture({ nullableThreadReview: true, loopMarker: true }),
      'nullable-review-marker'
    );
    const event = createAuditEvent(
      reportedRecord,
      { auditId: reportedRecord.audit.id, digest: reportedRecord.integrity.digest },
      { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
    );
    expect(event.pullRequests[0].findings[1]).toMatchObject({
      origin: { reviewId: null, reviewedCommitOid: null },
      fixLink: { status: 'reported' }
    });
    expect(() => validateAuditEvent(event, null)).not.toThrow();
  });

  it('publishes each run artifact exclusively instead of replacing a prior file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-'));
    const filename = path.join(directory, 'heartbeat.json');
    try {
      await writeJsonAtomic(filename, { status: 'complete', value: 1 });
      await expect(writeJsonAtomic(filename, { status: 'complete', value: 2 })).rejects.toMatchObject({ code: 'EEXIST' });
      expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual({ status: 'complete', value: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('appends versioned complete-run analytics events with an immutable digest chain', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-events-'));
    const filename = path.join(directory, 'events.jsonl');
    const historicalSchemaFilename = path.join(directory, 'historical-schema-events.jsonl');
    const expected = JSON.parse(
      await readFile(new URL('./fixtures/codex-pr-review-audit/analytics-event-v1.expect.json', import.meta.url), 'utf8')
    );
    const instructionDigest = `sha256:${'1'.repeat(64)}`;
    try {
      const firstRecord = await auditWith(githubFixture({ loopMarker: true, pendingReview: true }), 'analytics-one');
      for (const rootMode of ['zero', 'multiple'] as const) {
        const ambiguousProjectorRecord = structuredClone(firstRecord);
        if (rootMode === 'zero') {
          for (const comment of ambiguousProjectorRecord.pullRequests[0].reviewComments.values.filter((comment: any) =>
            [100, 101].includes(comment.id)
          )) {
            comment.inReplyToId = 999;
          }
        } else {
          ambiguousProjectorRecord.pullRequests[0].reviewComments.values.find((comment: any) => comment.id === 102).inReplyToId =
            null;
        }
        const retainedAmbiguousRecord = addIntegrity(ambiguousProjectorRecord);
        expect(() =>
          createAuditEvent(
            retainedAmbiguousRecord,
            { auditId: retainedAmbiguousRecord.audit.id, digest: retainedAmbiguousRecord.integrity.digest },
            { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
          )
        ).toThrow(/exactly one paired REST root comment/);
      }
      const mismatchedProjectorRecord = structuredClone(firstRecord);
      mismatchedProjectorRecord.pullRequests[0].reviewThreads.values[1].comments.values[0].nodeId = 'another-review-comment-node';
      const retainedMismatchedProjectorRecord = addIntegrity(mismatchedProjectorRecord);
      expect(() =>
        createAuditEvent(
          retainedMismatchedProjectorRecord,
          {
            auditId: retainedMismatchedProjectorRecord.audit.id,
            digest: retainedMismatchedProjectorRecord.integrity.digest
          },
          { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
        )
      ).toThrow(/inconsistent paired REST and GraphQL comment identities/);
      const invalidParentRecord = structuredClone(firstRecord);
      invalidParentRecord.pullRequests[0].reviewComments.values.find((comment: any) => comment.id === 102).inReplyToId = 999;
      const retainedInvalidParentRecord = addIntegrity(invalidParentRecord);
      expect(() =>
        verifyAuditRecord(retainedInvalidParentRecord, {
          repository,
          expectedRunId: 'analytics-one',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z')
        })
      ).toThrow(/identities/);
      expect(() =>
        createAuditEvent(
          retainedInvalidParentRecord,
          { auditId: retainedInvalidParentRecord.audit.id, digest: retainedInvalidParentRecord.integrity.digest },
          { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
        )
      ).toThrow(/does not point to its paired REST root comment/);
      const invalidPendingReview = structuredClone(firstRecord);
      invalidPendingReview.pullRequests[0].reviews.values.find((review: any) => review.submittedAt === null).submittedAt = 1;
      expect(() =>
        verifyAuditRecord(addIntegrity(invalidPendingReview), {
          repository,
          expectedRunId: 'analytics-one',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z')
        })
      ).toThrow(/review schema/);
      const first = await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne),
        reviewerInstruction: { id: 'reviewer-v3', digest: instructionDigest }
      });
      expect(first).toMatchObject(expected);
      expect(first).toMatchObject({
        kind: AUDIT_EVENT_KIND,
        eventId: 'analytics-one:complete-snapshot',
        observedAt: firstRecord.audit.completedAt,
        instructions: {
          reviewer: { status: 'reported', id: 'reviewer-v3', digest: instructionDigest },
          fixer: { status: 'unknown', id: null, digest: null }
        },
        sampling: {
          cadence: 'twice_daily_fixed_utc',
          slotId: `twice-daily:${analyticsSlotOne}`,
          expectedAt: analyticsSlotOne,
          coverageState: 'complete',
          runnerVersion: 'fixture-runner-v1'
        },
        pullRequests: [
          {
            number: 7,
            head: { oid: head, refName: 'codex/audit', repository },
            base: { oid: base, refName: 'main', repository },
            reviewLoop: {
              number: 1,
              status: 'observed',
              exactHeadReviewSubmissionCount: 2,
              reviewSubmissionCount: 2
            },
            stack: { openGraphRole: 'isolated', parentCandidates: [], childCandidates: [], position: null },
            findingSummary: { priorityLabeledThreadRootCount: 1, unknownPriorityThreadRootCount: 1 }
          }
        ],
        causalAttribution: { status: 'not_claimed' },
        log: { previousEventDigest: null }
      });
      const retainedHistoricalProjectorV1 = JSON.parse(
        await readFile(new URL('./fixtures/codex-pr-review-audit/analytics-event-v1.canonical.json', import.meta.url), 'utf8')
      );
      expect(() => validateAuditEvent(retainedHistoricalProjectorV1, null)).not.toThrow();
      await writeFile(historicalSchemaFilename, `${canonicalJson(retainedHistoricalProjectorV1)}\n`, { mode: 0o600 });
      const historicalV1AttemptCap = structuredClone(retainedHistoricalProjectorV1);
      historicalV1AttemptCap.pullRequests[0].reviewLoop.number = 3;
      historicalV1AttemptCap.pullRequests[0].findings[1].fixLink.reports[0].attemptNumber = 3;
      historicalV1AttemptCap.summary.reviewLoopNumberTotal = 3;
      expect(() => validateAuditEvent(addIntegrity(historicalV1AttemptCap), null)).not.toThrow();
      historicalV1AttemptCap.pullRequests[0].reviewLoop.number = 4;
      historicalV1AttemptCap.pullRequests[0].findings[1].fixLink.reports[0].attemptNumber = 4;
      historicalV1AttemptCap.summary.reviewLoopNumberTotal = 4;
      expect(() => validateAuditEvent(addIntegrity(historicalV1AttemptCap), null)).toThrow(/schema/);
      for (const unsupportedSchemaVersion of [999, '1', { version: 1 }]) {
        const unsupportedSchema = structuredClone(retainedHistoricalProjectorV1);
        unsupportedSchema.schemaVersion = unsupportedSchemaVersion;
        expect(() => validateAuditEvent(addIntegrity(unsupportedSchema), null)).toThrow(/schema version is unsupported/);
      }

      const unsupportedProjector = structuredClone(retainedHistoricalProjectorV1);
      unsupportedProjector.provenance.projector.version = 999;
      expect(() => validateAuditEvent(addIntegrity(unsupportedProjector), null)).toThrow(/schema/);
      for (const manifestMutation of [
        (files: any[]) => files.slice(1),
        (files: any[]) => [...files, { path: 'scripts/future-projector-input.mjs', digest: `sha256:${'f'.repeat(64)}` }],
        (files: any[]) => [...files].reverse()
      ]) {
        const incompatibleManifest = structuredClone(retainedHistoricalProjectorV1);
        incompatibleManifest.provenance.projector.implementation.files = manifestMutation(
          incompatibleManifest.provenance.projector.implementation.files
        );
        incompatibleManifest.provenance.projector.implementation.digest = `sha256:${createHash('sha256')
          .update(canonicalJson(incompatibleManifest.provenance.projector.implementation.files))
          .digest('hex')}`;
        expect(() => validateAuditEvent(addIntegrity(incompatibleManifest), null)).toThrow(/schema/);
      }
      expect(first.pullRequests[0].findings.map((observation: any) => observation.fixLink.status)).toEqual([
        'unknown',
        'reported'
      ]);
      expect(first.pullRequests[0].findings).toMatchObject([
        {
          id: 'review-thread:thread-a',
          origin: { type: 'review_thread_root', commentId: '100' },
          severity: { status: 'unknown', value: null, validity: 'unknown' },
          source: { classification: { status: 'classified', value: 'github_user' }, reconciliation: 'matched' },
          resolution: { status: 'resolved', isOutdated: false, resolvedAt: null, resolvedAtStatus: 'unknown' },
          headRelationship: { status: 'classified', value: 'exact_head' }
        },
        {
          id: 'review-thread:thread-b',
          origin: { type: 'review_thread_root', commentId: '101' },
          severity: { status: 'classified', value: 'P2', validity: 'unknown' },
          source: { classification: { status: 'classified', value: 'codex' } },
          resolution: { status: 'unresolved', isOutdated: false, resolvedAt: null, resolvedAtStatus: 'not_applicable' },
          headRelationship: { status: 'classified', value: 'exact_head' },
          fixLink: {
            status: 'reported',
            commitOid: null,
            confidence: 'reported_not_verified',
            causalAttribution: 'not_assessed'
          }
        }
      ]);
      validateAuditEvent(first, null);
      const reportedFixLinkContradiction = structuredClone(first);
      reportedFixLinkContradiction.pullRequests[0].findings[1].fixLink.evidenceIds = [];
      expect(() => validateAuditEvent(addIntegrity(reportedFixLinkContradiction), null)).toThrow(/schema/);
      const reportedTimestampContradiction = structuredClone(first);
      reportedTimestampContradiction.pullRequests[0].findings[1].fixLink.reports[0].reportedAt = 0;
      expect(() => validateAuditEvent(addIntegrity(reportedTimestampContradiction), null)).toThrow(/schema/);
      const futureReportedTimestamp = structuredClone(first);
      futureReportedTimestamp.pullRequests[0].findings[1].fixLink.reports[0].reportedAt = '2026-08-07T12:00:02.001Z';
      expect(() => validateAuditEvent(addIntegrity(futureReportedTimestamp), null)).toThrow(/schema/);
      const reversedEventPullRequestTimestamps = structuredClone(first);
      reversedEventPullRequestTimestamps.pullRequests[0].createdAt = '2026-08-07T12:00:00Z';
      expect(() => validateAuditEvent(addIntegrity(reversedEventPullRequestTimestamps), null)).toThrow(/schema/);
      const equalEventPullRequestTimestamps = structuredClone(first);
      equalEventPullRequestTimestamps.pullRequests[0].createdAt = equalEventPullRequestTimestamps.pullRequests[0].updatedAt;
      expect(() => validateAuditEvent(addIntegrity(equalEventPullRequestTimestamps), null)).not.toThrow();
      const reportedMarkerContradiction = structuredClone(first);
      reportedMarkerContradiction.pullRequests[0].findings[1].fixLink.reports[0].sourceCommentId = 999;
      reportedMarkerContradiction.pullRequests[0].findings[1].fixLink.evidenceIds = ['999'];
      expect(() => validateAuditEvent(addIntegrity(reportedMarkerContradiction), null)).toThrow(/schema/);
      const reportedAttemptContradiction = structuredClone(first);
      reportedAttemptContradiction.pullRequests[0].findings[1].fixLink.reports[0].attemptNumber = 2;
      expect(() => validateAuditEvent(addIntegrity(reportedAttemptContradiction), null)).toThrow(/schema/);
      const reportedReviewContradiction = structuredClone(first);
      reportedReviewContradiction.pullRequests[0].findings[1].fixLink.reports[0].reviewId = '21';
      expect(() => validateAuditEvent(addIntegrity(reportedReviewContradiction), null)).toThrow(/pull-request schema/);
      const numericReportedReviewId = structuredClone(first);
      numericReportedReviewId.pullRequests[0].findings[1].origin.reviewId = null;
      numericReportedReviewId.pullRequests[0].findings[1].fixLink.reports[0].reviewId = 20;
      expect(() => validateAuditEvent(addIntegrity(numericReportedReviewId), null)).toThrow(/pull-request schema/);
      const reportedHeadContradiction = structuredClone(first);
      reportedHeadContradiction.pullRequests[0].findings[1].fixLink.reports[0].inputHeadOid = 'c'.repeat(40);
      expect(() => validateAuditEvent(addIntegrity(reportedHeadContradiction), null)).toThrow(/pull-request schema/);
      const reportedThreadContradiction = structuredClone(first);
      reportedThreadContradiction.pullRequests[0].findings[1].fixLink.reports[0].threadId = 'thread-a';
      expect(() => validateAuditEvent(addIntegrity(reportedThreadContradiction), null)).toThrow(/schema/);
      const reportedCleanContradiction = structuredClone(first);
      reportedCleanContradiction.pullRequests[0].findings[1].fixLink.reports[0].result = 'clean';
      expect(() => validateAuditEvent(addIntegrity(reportedCleanContradiction), null)).toThrow(/schema/);
      const duplicateRootCommentId = structuredClone(first);
      duplicateRootCommentId.pullRequests[0].findings[1].origin.commentId =
        duplicateRootCommentId.pullRequests[0].findings[0].origin.commentId;
      expect(() => validateAuditEvent(addIntegrity(duplicateRootCommentId), null)).toThrow(/root-comment identities/);
      const duplicateRootCommentNodeId = structuredClone(first);
      duplicateRootCommentNodeId.pullRequests[0].findings[1].origin.commentNodeId =
        duplicateRootCommentNodeId.pullRequests[0].findings[0].origin.commentNodeId;
      expect(() => validateAuditEvent(addIntegrity(duplicateRootCommentNodeId), null)).toThrow(/root-comment identities/);
      const reviewNodeContradiction = structuredClone(first);
      reviewNodeContradiction.pullRequests[0].findings[1].origin.reviewNodeId = 'another-review-node';
      expect(() => validateAuditEvent(addIntegrity(reviewNodeContradiction), null)).toThrow(/review identities/);
      const reviewCommitContradiction = structuredClone(first);
      reviewCommitContradiction.pullRequests[0].findings[0].origin.reviewedCommitOid = 'c'.repeat(40);
      reviewCommitContradiction.pullRequests[0].findings[0].headRelationship.value = 'stale_head';
      expect(() => validateAuditEvent(addIntegrity(reviewCommitContradiction), null)).toThrow(/review identities/);
      const reviewDatabaseContradiction = structuredClone(first);
      reviewDatabaseContradiction.pullRequests[0].findings[1].origin.reviewId = '21';
      expect(() => validateAuditEvent(addIntegrity(reviewDatabaseContradiction), null)).toThrow(/pull-request schema/);
      const reviewPresenceContradiction = structuredClone(first);
      reviewPresenceContradiction.pullRequests[0].findings[1].origin.reviewNodeId = null;
      expect(() => validateAuditEvent(addIntegrity(reviewPresenceContradiction), null)).toThrow(/pull-request schema/);
      const unsupportedHistoricalSource = structuredClone(first);
      unsupportedHistoricalSource.provenance.auditSchemaVersion = 2;
      expect(() => validateAuditEvent(addIntegrity(unsupportedHistoricalSource), null)).toThrow(/schema/);
      const coercedHistoricalSource = structuredClone(first);
      coercedHistoricalSource.provenance.auditSchemaVersion = '1';
      expect(() => validateAuditEvent(addIntegrity(coercedHistoricalSource), null)).toThrow(/schema/);
      const unsupportedHistoricalApi = structuredClone(first);
      unsupportedHistoricalApi.provenance.apiVersion = '2099-01-01';
      expect(() => validateAuditEvent(addIntegrity(unsupportedHistoricalApi), null)).toThrow(/schema/);
      const repositoryNodeContradiction = structuredClone(first);
      repositoryNodeContradiction.repository.nodeId = 123;
      expect(() => validateAuditEvent(addIntegrity(repositoryNodeContradiction), null)).toThrow(/schema/);
      const actorIdContradiction = structuredClone(first);
      actorIdContradiction.pullRequests[0].author.id = actorIdContradiction.provenance.authenticatedAs.id;
      expect(() => validateAuditEvent(addIntegrity(actorIdContradiction), null)).toThrow(/actor identities/);
      const actorLoginContradiction = structuredClone(first);
      actorLoginContradiction.pullRequests[0].author.login = actorLoginContradiction.provenance.authenticatedAs.login;
      expect(() => validateAuditEvent(addIntegrity(actorLoginContradiction), null)).toThrow(/actor identities/);
      const actorLoginCaseContradiction = structuredClone(first);
      actorLoginCaseContradiction.pullRequests[0].author = {
        id: 999,
        login: actorLoginCaseContradiction.provenance.authenticatedAs.login.toUpperCase(),
        type: actorLoginCaseContradiction.provenance.authenticatedAs.type
      };
      expect(() => validateAuditEvent(addIntegrity(actorLoginCaseContradiction), null)).toThrow(/actor identities/);
      const actorLoginCaseControl = structuredClone(first);
      actorLoginCaseControl.pullRequests[0].author = {
        ...actorLoginCaseControl.provenance.authenticatedAs,
        login: actorLoginCaseControl.provenance.authenticatedAs.login.toUpperCase()
      };
      expect(() => validateAuditEvent(addIntegrity(actorLoginCaseControl), null)).not.toThrow();
      const actorTypeContradiction = structuredClone(first);
      actorTypeContradiction.pullRequests[0].author = {
        ...actorTypeContradiction.provenance.authenticatedAs,
        type: 'Bot'
      };
      expect(() => validateAuditEvent(addIntegrity(actorTypeContradiction), null)).toThrow(/actor identities/);
      const actorLoginTypeContradiction = structuredClone(first);
      actorLoginTypeContradiction.pullRequests[0].author = {
        id: 999,
        login: actorLoginTypeContradiction.provenance.authenticatedAs.login,
        type: 'Bot'
      };
      expect(() => validateAuditEvent(addIntegrity(actorLoginTypeContradiction), null)).toThrow(/actor identities/);
      const findingActorContradiction = structuredClone(first);
      findingActorContradiction.provenance.authenticatedAs.id =
        findingActorContradiction.pullRequests[0].findings[0].source.actor.id;
      expect(() => validateAuditEvent(addIntegrity(findingActorContradiction), null)).toThrow(/actor identities/);
      const distinctBotActor = structuredClone(first);
      distinctBotActor.pullRequests[0].author = {
        id: 999,
        login: `${distinctBotActor.provenance.authenticatedAs.login}[bot]`,
        type: 'Bot'
      };
      expect(() => validateAuditEvent(addIntegrity(distinctBotActor), null)).not.toThrow();
      const runIdContradiction = structuredClone(first);
      runIdContradiction.run.id = 123;
      runIdContradiction.eventId = '123:complete-snapshot';
      runIdContradiction.provenance.auditId = 123;
      expect(() => validateAuditEvent(addIntegrity(runIdContradiction), null)).toThrow(/schema/);
      const maximumAuditDuration = structuredClone(first);
      maximumAuditDuration.run.completedAt = '2026-08-07T13:00:00.000Z';
      maximumAuditDuration.observedAt = maximumAuditDuration.run.completedAt;
      expect(() => validateAuditEvent(addIntegrity(maximumAuditDuration), null)).not.toThrow();
      const excessiveAuditDuration = structuredClone(first);
      excessiveAuditDuration.run.completedAt = '2026-08-07T13:00:00.001Z';
      excessiveAuditDuration.observedAt = excessiveAuditDuration.run.completedAt;
      expect(() => validateAuditEvent(addIntegrity(excessiveAuditDuration), null)).toThrow(/schema/);
      const pullRequestUrlContradiction = structuredClone(first);
      pullRequestUrlContradiction.pullRequests[0].url = 'https://github.com/pbroom/spfx-kit/pull/999';
      expect(() => validateAuditEvent(addIntegrity(pullRequestUrlContradiction), null)).toThrow(/pull-request schema/);
      const baseRepositoryContradiction = structuredClone(first);
      baseRepositoryContradiction.pullRequests[0].base.repository = 'another/repository';
      expect(() => validateAuditEvent(addIntegrity(baseRepositoryContradiction), null)).toThrow(/pull-request schema/);
      const baseRepositoryCaseControl = structuredClone(first);
      baseRepositoryCaseControl.pullRequests[0].base.repository = 'PBROOM/SPFX-KIT';
      expect(() => validateAuditEvent(addIntegrity(baseRepositoryCaseControl), null)).not.toThrow();

      const forkRecord = structuredClone(firstRecord);
      forkRecord.inventory.openPullRequests.push({
        number: 9,
        state: 'OPEN',
        isDraft: false,
        updatedAt: '2026-08-07T11:59:00.000Z',
        head: { oid: 'c'.repeat(40), refName: 'fork-feature', repository: 'contributor/spfx-kit' },
        base: { oid: head, refName: 'codex/audit', repository }
      });
      const forkEvent = createAuditEvent(
        forkRecord,
        { auditId: firstRecord.audit.id, digest: firstRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
      );
      expect(forkEvent.pullRequests[0].stack).toMatchObject({
        openGraphRole: 'isolated',
        childCandidates: []
      });
      const draftRecord = structuredClone(firstRecord);
      draftRecord.inventory.openPullRequests.push({
        number: 9,
        state: 'OPEN',
        isDraft: true,
        updatedAt: '2026-08-07T11:59:00.000Z',
        head: { oid: 'c'.repeat(40), refName: 'child-feature', repository },
        base: { oid: head, refName: 'codex/audit', repository }
      });
      const draftEvent = createAuditEvent(
        draftRecord,
        { auditId: firstRecord.audit.id, digest: firstRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
      );
      expect(draftEvent.pullRequests[0].stack).toMatchObject({
        openGraphRole: 'isolated',
        childCandidates: []
      });

      const twoPullRequestRecord = structuredClone(firstRecord);
      const childPullRequest = structuredClone(firstRecord.pullRequests[0]);
      childPullRequest.number = 9;
      childPullRequest.nodeId = 'pull-request-node-9';
      childPullRequest.url = 'https://github.com/pbroom/spfx-kit/pull/9';
      childPullRequest.title = 'Child pull request';
      childPullRequest.head = { oid: 'c'.repeat(40), refName: 'child-feature', repository };
      childPullRequest.base = { oid: head, refName: 'codex/audit', repository };
      for (const collectionName of ['reviews', 'issueComments', 'reviewComments', 'reviewThreads']) {
        childPullRequest[collectionName] = { ...childPullRequest[collectionName], count: 0, values: [] };
      }
      twoPullRequestRecord.pullRequests.push(childPullRequest);
      twoPullRequestRecord.inventory.openPullRequests.push({
        number: 9,
        state: 'OPEN',
        isDraft: false,
        updatedAt: childPullRequest.updatedAt,
        head: childPullRequest.head,
        base: childPullRequest.base
      });
      const twoPullRequestEvent = createAuditEvent(
        twoPullRequestRecord,
        { auditId: firstRecord.audit.id, digest: firstRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
      );
      expect(twoPullRequestEvent.pullRequests.map((pullRequest: any) => pullRequest.stack)).toMatchObject([
        { openGraphRole: 'root', childCandidates: [{ number: 9, isDraft: false }] },
        { openGraphRole: 'leaf', parentCandidates: [{ number: 7, isDraft: false }] }
      ]);
      validateAuditEvent(twoPullRequestEvent, null);
      const duplicateNodeIdEvent = structuredClone(twoPullRequestEvent);
      duplicateNodeIdEvent.pullRequests[1].nodeId = duplicateNodeIdEvent.pullRequests[0].nodeId;
      expect(() => validateAuditEvent(addIntegrity(duplicateNodeIdEvent), null)).toThrow(/node IDs/);
      const fabricatedStackEvent = structuredClone(twoPullRequestEvent);
      fabricatedStackEvent.pullRequests[0].stack.childCandidates[0].number = 999;
      expect(() => validateAuditEvent(addIntegrity(fabricatedStackEvent), null)).toThrow(/topology/);

      const duplicateThreadRecord = structuredClone(firstRecord);
      const duplicateThreadPullRequest = structuredClone(firstRecord.pullRequests[0]);
      duplicateThreadPullRequest.number = 9;
      duplicateThreadPullRequest.nodeId = 'pull-request-node-9';
      duplicateThreadPullRequest.url = 'https://github.com/pbroom/spfx-kit/pull/9';
      duplicateThreadRecord.pullRequests.push(duplicateThreadPullRequest);
      const duplicateThreadEvent = createAuditEvent(
        duplicateThreadRecord,
        { auditId: firstRecord.audit.id, digest: firstRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
      );
      expect(() => validateAuditEvent(duplicateThreadEvent, null)).toThrow(/globally unique/);

      const secondRecord = await auditWith(
        githubFixture(),
        'analytics-two',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename: historicalSchemaFilename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).resolves.toBeDefined();
      expect((await readFile(historicalSchemaFilename, 'utf8')).trim().split('\n')).toHaveLength(2);
      const second = await appendCompleteAuditEvent({
        filename,
        record: secondRecord,
        repository,
        expectedRunId: 'analytics-two',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo)
      });
      expect(second.log.previousEventDigest).toBe(first.integrity.digest);
      expect(second.pullRequests[0].reviewLoop).toMatchObject({
        number: null,
        status: 'unknown',
        reason: 'marker_absent'
      });
      const beforeDuplicate = await readFile(filename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/already contains or follows slot/);
      expect(await readFile(filename, 'utf8')).toBe(beforeDuplicate);
      expect(beforeDuplicate.trim().split('\n')).toHaveLength(2);

      const slotCollisionRecord = await auditWith(
        githubFixture(),
        'analytics-slot-collision',
        '2026-08-08T00:00:04.000Z',
        '2026-08-08T00:00:06.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: slotCollisionRecord,
          repository,
          expectedRunId: 'analytics-slot-collision',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:07.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/already contains or follows slot/);
      expect(await readFile(filename, 'utf8')).toBe(beforeDuplicate);

      const malformedMarkerRecord = await auditWith(
        githubFixture({ loopMarker: true, invalidLoopMarker: true }),
        'analytics-invalid-marker',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      const malformedMarkerEvent = await appendCompleteAuditEvent({
        filename,
        record: malformedMarkerRecord,
        repository,
        expectedRunId: 'analytics-invalid-marker',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotThree)
      });
      expect(malformedMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
        number: null,
        status: 'unknown',
        reason: 'marker_invalid'
      });
      expect(malformedMarkerEvent.pullRequests[0].findings.every((finding: any) => finding.fixLink.status === 'unknown')).toBe(
        true
      );
      const cleanThreadMarkerRecord = await auditWith(
        githubFixture({ loopMarker: true, cleanMarkerWithThreads: true }),
        'analytics-clean-thread-marker',
        '2026-08-08T12:00:04.000Z',
        '2026-08-08T12:00:06.000Z'
      );
      const cleanThreadMarkerEvent = createAuditEvent(
        cleanThreadMarkerRecord,
        { auditId: cleanThreadMarkerRecord.audit.id, digest: cleanThreadMarkerRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotThree), previousEventDigest: null }
      );
      expect(cleanThreadMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
        number: null,
        status: 'unknown',
        reason: 'marker_invalid'
      });
      expect(cleanThreadMarkerEvent.pullRequests[0].findings.every((finding: any) => finding.fixLink.status === 'unknown')).toBe(
        true
      );
      for (const [runId, option] of [
        ['analytics-marker-review-mismatch', { loopMarkerReviewMismatch: true }],
        ['analytics-marker-head-mismatch', { loopMarkerHeadMismatch: true }],
        ['analytics-marker-before-review', { loopMarkerBeforeReviewSubmission: true }]
      ] as const) {
        const contradictoryMarkerRecord = await auditWith(
          githubFixture({ loopMarker: true, ...option }),
          runId,
          '2026-08-08T12:00:04.000Z',
          '2026-08-08T12:00:06.000Z'
        );
        const contradictoryMarkerEvent = createAuditEvent(
          contradictoryMarkerRecord,
          { auditId: contradictoryMarkerRecord.audit.id, digest: contradictoryMarkerRecord.integrity.digest },
          { sampling: samplingFor(analyticsSlotThree), previousEventDigest: null }
        );
        expect(contradictoryMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
          number: null,
          status: 'unknown',
          reason: 'marker_invalid'
        });
        expect(
          contradictoryMarkerEvent.pullRequests[0].findings.every((finding: any) => finding.fixLink.status === 'unknown')
        ).toBe(true);
        expect(() => validateAuditEvent(contradictoryMarkerEvent, null)).not.toThrow();
      }
      for (const [runId, option] of [
        ['analytics-clean-review-mismatch', { loopMarkerReviewMismatch: true }],
        ['analytics-clean-head-mismatch', { loopMarkerHeadMismatch: true }],
        ['analytics-clean-before-review', { loopMarkerBeforeReviewSubmission: true }],
        ['analytics-clean-pending-review', { markerReviewPending: true }],
        ['analytics-clean-null-review-commit', { markerReviewNullCommit: true }]
      ] as const) {
        const contradictoryCleanRecord = await auditWith(
          githubFixture({ loopMarker: true, cleanMarker: true, ...option }),
          runId,
          '2026-08-08T12:00:04.000Z',
          '2026-08-08T12:00:06.000Z'
        );
        const contradictoryCleanEvent = createAuditEvent(
          contradictoryCleanRecord,
          { auditId: contradictoryCleanRecord.audit.id, digest: contradictoryCleanRecord.integrity.digest },
          { sampling: samplingFor(analyticsSlotThree), previousEventDigest: null }
        );
        expect(contradictoryCleanEvent.pullRequests[0].reviewLoop).toMatchObject({
          number: null,
          status: 'unknown',
          reason: 'marker_invalid'
        });
        expect(() => validateAuditEvent(contradictoryCleanEvent, null)).not.toThrow();
      }
      const duplicateMarkerRecord = await auditWith(
        githubFixture({ loopMarker: true, duplicateLoopMarkerBlocks: true }),
        'analytics-duplicate-marker',
        '2026-08-08T12:00:04.000Z',
        '2026-08-08T12:00:06.000Z'
      );
      const duplicateMarkerEvent = createAuditEvent(
        duplicateMarkerRecord,
        { auditId: duplicateMarkerRecord.audit.id, digest: duplicateMarkerRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotThree), previousEventDigest: null }
      );
      expect(duplicateMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
        number: null,
        status: 'unknown',
        reason: 'marker_invalid'
      });
      const validCleanMarkerRecord = await auditWith(
        githubFixture({ loopMarker: true, cleanMarker: true, loopMarkerAtReviewSubmission: true }),
        'analytics-valid-clean-marker',
        '2026-08-08T12:00:08.000Z',
        '2026-08-08T12:00:10.000Z'
      );
      const validCleanMarkerEvent = createAuditEvent(
        validCleanMarkerRecord,
        { auditId: validCleanMarkerRecord.audit.id, digest: validCleanMarkerRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotThree), previousEventDigest: null }
      );
      expect(validCleanMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
        number: 1,
        status: 'observed',
        reason: null
      });
      expect(validCleanMarkerEvent.pullRequests[0].findings.every((finding: any) => finding.fixLink.status === 'unknown')).toBe(
        true
      );
      for (const cleanMarker of [false, true]) {
        const futureMarkerRecord = await auditWith(
          githubFixture({ loopMarker: true, cleanMarker, loopMarkerAfterAuditCompletion: true }),
          `analytics-future-marker-${cleanMarker}`
        );
        const futureMarkerEvent = createAuditEvent(
          futureMarkerRecord,
          { auditId: futureMarkerRecord.audit.id, digest: futureMarkerRecord.integrity.digest },
          { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
        );
        expect(futureMarkerEvent.pullRequests[0].reviewLoop).toMatchObject({
          number: null,
          status: 'unknown',
          reason: 'marker_invalid'
        });
        expect(() => validateAuditEvent(futureMarkerEvent, null)).not.toThrow();
      }
      const completionBoundaryRecord = await auditWith(
        githubFixture({ loopMarker: true, loopMarkerAtAuditCompletion: true }),
        'analytics-completion-boundary'
      );
      const completionBoundaryEvent = createAuditEvent(
        completionBoundaryRecord,
        { auditId: completionBoundaryRecord.audit.id, digest: completionBoundaryRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
      );
      expect(completionBoundaryEvent.pullRequests[0].reviewLoop).toMatchObject({
        number: 1,
        status: 'observed',
        reason: null
      });

      const nullAuthorRecord = await auditWith(
        githubFixture({ nullPrAuthor: true }),
        'analytics-null-author',
        '2026-08-09T00:00:00.000Z',
        '2026-08-09T00:00:02.000Z'
      );
      const nullAuthorEvent = await appendCompleteAuditEvent({
        filename,
        record: nullAuthorRecord,
        repository,
        expectedRunId: 'analytics-null-author',
        maxAgeSeconds: 300,
        now: new Date('2026-08-09T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotFour)
      });
      expect(nullAuthorEvent.pullRequests[0].author).toBeNull();
      expect(nullAuthorEvent.unknowns).toContainEqual({ path: 'pullRequests.7.author', reason: 'actor_not_exposed' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('never appends analytics for an incomplete run and rejects a tampered prior chain', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-events-'));
    const filename = path.join(directory, 'events.jsonl');
    try {
      const record = await auditWith(githubFixture(), 'analytics-complete');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: { ...record, status: 'incomplete' },
          repository,
          expectedRunId: 'analytics-complete',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/status is not complete/);
      await expect(readFile(filename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const invalidSlotFilename = path.join(directory, 'invalid-slot.jsonl');
      await expect(
        appendCompleteAuditEvent({
          filename: invalidSlotFilename,
          record,
          repository,
          expectedRunId: 'analytics-complete',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor('2026-02-30T00:00:00.000Z')
        })
      ).rejects.toThrow(/valid 00:00 or 12:00 UTC slot/);
      await expect(readFile(invalidSlotFilename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      await appendCompleteAuditEvent({
        filename,
        record,
        repository,
        expectedRunId: 'analytics-complete',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const lines = (await readFile(filename, 'utf8')).trim().split('\n');
      const nextRecord = await auditWith(
        githubFixture(),
        'analytics-after-tamper',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );

      await writeFile(filename, ` ${lines[0]}\n`, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: nextRecord,
          repository,
          expectedRunId: 'analytics-after-tamper',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/not canonical JSON/);
      expect(await readFile(filename, 'utf8')).toBe(` ${lines[0]}\n`);

      await writeFile(filename, `${lines[0]}\n`, 'utf8');
      const semanticContradiction = JSON.parse(lines[0]);
      semanticContradiction.pullRequests[0].findings[1].headRelationship.value = 'stale_head';
      semanticContradiction.pullRequests[0].findingSummary.currentUnresolvedPriorityLabeledThreadRootCount = 0;
      semanticContradiction.summary.currentUnresolvedPriorityLabeledThreadRootCount = 0;
      await writeFile(filename, `${canonicalJson(addIntegrity(semanticContradiction))}\n`, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: nextRecord,
          repository,
          expectedRunId: 'analytics-after-tamper',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/schema/);
      expect((await readFile(filename, 'utf8')).trim().split('\n')).toHaveLength(1);

      await writeFile(filename, `${lines[0]}\n`, 'utf8');
      const causalContradiction = JSON.parse(lines[0]);
      causalContradiction.fixedBy = 'invented-causal-field';
      causalContradiction.causalAttribution.statement = 'Reviewer caused this fix.';
      await writeFile(filename, `${canonicalJson(addIntegrity(causalContradiction))}\n`, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: nextRecord,
          repository,
          expectedRunId: 'analytics-after-tamper',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/inconsistent|schema/);
      expect((await readFile(filename, 'utf8')).trim().split('\n')).toHaveLength(1);

      await writeFile(filename, `${lines[0]}\n`, 'utf8');
      const fixLinkContradiction = JSON.parse(lines[0]);
      fixLinkContradiction.pullRequests[0].findings[1].fixLink.evidenceIds = ['999'];
      await writeFile(filename, `${canonicalJson(addIntegrity(fixLinkContradiction))}\n`, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: nextRecord,
          repository,
          expectedRunId: 'analytics-after-tamper',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/schema/);

      await writeFile(filename, `${lines[0]}\n`, 'utf8');
      const timestampContradiction = JSON.parse(lines[0]);
      timestampContradiction.pullRequests[0].createdAt = 1;
      timestampContradiction.pullRequests[0].updatedAt = ['2026-08-07T11:50:00Z'];
      await writeFile(filename, `${canonicalJson(addIntegrity(timestampContradiction))}\n`, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: nextRecord,
          repository,
          expectedRunId: 'analytics-after-tamper',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/schema/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects an event-log symlink before reading its target', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-event-path-'));
    const filename = path.join(directory, 'events.jsonl');
    const target = path.join(directory, 'target.jsonl');
    const fifo = path.join(directory, 'events.fifo');
    const hardlink = path.join(directory, 'events-hardlink.jsonl');
    const hardlinkTarget = path.join(directory, 'hardlink-target.jsonl');
    try {
      await writeFile(target, '', 'utf8');
      await symlink(target, filename);
      const record = await auditWith(githubFixture(), 'analytics-symlink');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record,
          repository,
          expectedRunId: 'analytics-symlink',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toMatchObject({ code: 'ELOOP' });
      expect(await readFile(target, 'utf8')).toBe('');

      expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
      const fifoRecord = await auditWith(githubFixture(), 'analytics-fifo');
      await expect(
        appendCompleteAuditEvent({
          filename: fifo,
          record: fifoRecord,
          repository,
          expectedRunId: 'analytics-fifo',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/single-link regular file/);

      await writeFile(hardlinkTarget, '', { encoding: 'utf8', mode: 0o600 });
      await createLink(hardlinkTarget, hardlink);
      const hardlinkRecord = await auditWith(githubFixture(), 'analytics-hardlink');
      await expect(
        appendCompleteAuditEvent({
          filename: hardlink,
          record: hardlinkRecord,
          repository,
          expectedRunId: 'analytics-hardlink',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/single-link regular file/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rolls a short event append back to the exact validated bytes and permits a retry', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-short-write-'));
    const filename = path.join(directory, 'events.jsonl');
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-short-write-one');
      await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-short-write-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const before = await readFile(filename, 'utf8');
      const secondRecord = await auditWith(
        githubFixture(),
        'analytics-short-write-two',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-short-write-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo),
          appendWrite: (handle: any, payload: Buffer) => handle.write(payload.subarray(0, Math.floor(payload.length / 2)))
        })
      ).rejects.toThrow(/append was incomplete/);
      expect(await readFile(filename, 'utf8')).toBe(before);
      await expect(readFile(`${filename}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-short-write-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo),
          appendWrite: async (handle: any, payload: Buffer) => {
            await handle.write(payload.subarray(0, Math.floor(payload.length / 3)));
            throw new Error('injected append failure');
          }
        })
      ).rejects.toThrow(/injected append failure/);
      expect(await readFile(filename, 'utf8')).toBe(before);
      await appendCompleteAuditEvent({
        filename,
        record: secondRecord,
        repository,
        expectedRunId: 'analytics-short-write-two',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo)
      });
      expect((await readFile(filename, 'utf8')).trim().split('\n')).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('derives one append lock from the canonical parent behind path aliases', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-canonical-lock-'));
    const actualParent = path.join(directory, 'actual');
    const aliasParent = path.join(directory, 'alias');
    await mkdir(actualParent, { mode: 0o700 });
    await symlink(actualParent, aliasParent, 'dir');
    const actualFilename = path.join(actualParent, 'events.jsonl');
    const aliasFilename = path.join(aliasParent, 'events.jsonl');
    let releaseWrite = () => undefined;
    const holdWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let enteredWrite = () => undefined;
    const writeEntered = new Promise<void>((resolve) => {
      enteredWrite = resolve;
    });
    try {
      const record = await auditWith(githubFixture(), 'analytics-canonical-lock');
      const firstAppend = appendCompleteAuditEvent({
        filename: actualFilename,
        record,
        repository,
        expectedRunId: 'analytics-canonical-lock',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne),
        appendWrite: async (handle: any, payload: Buffer) => {
          enteredWrite();
          await holdWrite;
          return handle.write(payload);
        }
      });
      await writeEntered;
      try {
        await expect(
          appendCompleteAuditEvent({
            filename: aliasFilename,
            record,
            repository,
            expectedRunId: 'analytics-canonical-lock',
            maxAgeSeconds: 300,
            now: new Date('2026-08-07T12:00:03.000Z'),
            sampling: samplingFor(analyticsSlotOne)
          })
        ).rejects.toThrow(/within its lease/);
      } finally {
        releaseWrite();
      }
      await firstAppend;
      expect((await readFile(actualFilename, 'utf8')).trim().split('\n')).toHaveLength(1);
      await expect(readFile(`${aliasFilename}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      releaseWrite();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves the bidirectional pull-request identity mapping across event-log rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-pr-identity-'));
    const filename = path.join(directory, 'events.jsonl');
    const chronologyFilename = path.join(directory, 'chronology.jsonl');
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-pr-identity-one');
      const firstEvent = await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-pr-identity-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const firstBytes = await readFile(filename, 'utf8');
      await appendCompleteAuditEvent({
        filename: chronologyFilename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-pr-identity-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const secondRecord = await auditWith(
        githubFixture(),
        'analytics-pr-identity-two',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      for (const [runId, fixtureOptions] of [
        ['analytics-pr-created-at-changed', { pullRequestCreatedAt: '2026-08-02T00:00:00Z' }],
        ['analytics-pr-updated-at-regressed', { pullRequestUpdatedAt: '2026-08-07T11:58:59Z' }]
      ] as const) {
        const contradictoryChronologyRecord = await auditWith(
          githubFixture(fixtureOptions),
          runId,
          '2026-08-08T00:00:00.000Z',
          '2026-08-08T00:00:02.000Z'
        );
        await expect(
          appendCompleteAuditEvent({
            filename,
            record: contradictoryChronologyRecord,
            repository,
            expectedRunId: runId,
            maxAgeSeconds: 300,
            now: new Date('2026-08-08T00:00:03.000Z'),
            sampling: samplingFor(analyticsSlotTwo)
          })
        ).rejects.toThrow(/chronology changed/);
        expect(await readFile(filename, 'utf8')).toBe(firstBytes);
      }
      await expect(
        appendCompleteAuditEvent({
          filename: chronologyFilename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-pr-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).resolves.toBeDefined();
      const advancedChronologyRecord = await auditWith(
        githubFixture({ pullRequestUpdatedAt: '2026-08-08T12:00:00Z' }),
        'analytics-pr-chronology-advanced',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename: chronologyFilename,
          record: advancedChronologyRecord,
          repository,
          expectedRunId: 'analytics-pr-chronology-advanced',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotThree)
        })
      ).resolves.toBeDefined();
      const changedNodeRecord = structuredClone(secondRecord);
      changedNodeRecord.pullRequests[0].nodeId = 'another-pull-request-node';
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: addIntegrity(changedNodeRecord),
          repository,
          expectedRunId: 'analytics-pr-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(firstBytes);

      const secondEvent = createAuditEvent(
        secondRecord,
        { auditId: secondRecord.audit.id, digest: secondRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotTwo), previousEventDigest: firstEvent.integrity.digest }
      );
      secondEvent.pullRequests[0].number = 9;
      secondEvent.pullRequests[0].url = 'https://github.com/pbroom/spfx-kit/pull/9';
      secondEvent.unknowns = secondEvent.unknowns
        .map((unknown: any) => ({ ...unknown, path: unknown.path.replace('pullRequests.7.', 'pullRequests.9.') }))
        .sort((left: any, right: any) => left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason));
      const reusedNodeEvent = addIntegrity(secondEvent);
      validateAuditEvent(reusedNodeEvent, firstEvent.integrity.digest);
      await writeFile(filename, `${canonicalJson(firstEvent)}\n${canonicalJson(reusedNodeEvent)}\n`, 'utf8');
      const thirdRecord = await auditWith(
        githubFixture(),
        'analytics-pr-identity-three',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      const contradictoryBytes = await readFile(filename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: thirdRecord,
          repository,
          expectedRunId: 'analytics-pr-identity-three',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotThree)
        })
      ).rejects.toThrow(/identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(contradictoryBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves review-thread, pull-request, and root-comment identities across event-log rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-thread-identity-'));
    const filename = path.join(directory, 'events.jsonl');
    const reappearanceFilename = path.join(directory, 'reappearance.jsonl');
    const nullableReviewFilename = path.join(directory, 'nullable-review.jsonl');
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-thread-identity-one');
      const firstEvent = await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-thread-identity-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne),
        reviewerInstruction: { id: 'reviewer-v1', digest: `sha256:${'1'.repeat(64)}` }
      });
      const firstBytes = await readFile(filename, 'utf8');
      const secondRecord = await auditWith(
        githubFixture(),
        'analytics-thread-identity-two',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-thread-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo),
          reviewerInstruction: { id: 'reviewer-v1', digest: `sha256:${'2'.repeat(64)}` }
        })
      ).rejects.toThrow(/instruction identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(firstBytes);
      const changedRootRecord = structuredClone(secondRecord);
      const restRoot = changedRootRecord.pullRequests[0].reviewComments.values.find((comment: any) => comment.id === 100);
      restRoot.id = 99;
      restRoot.nodeId = 'review-comment-99';
      changedRootRecord.pullRequests[0].reviewComments.values.sort((left: any, right: any) => left.id - right.id);
      const graphqlRoot = changedRootRecord.pullRequests[0].reviewThreads.values.find((thread: any) => thread.id === 'thread-a')
        .comments.values[0];
      graphqlRoot.id = '99';
      graphqlRoot.nodeId = 'review-comment-99';
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: addIntegrity(changedRootRecord),
          repository,
          expectedRunId: 'analytics-thread-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/review-thread identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(firstBytes);

      const changedReviewRecord = await auditWith(
        githubFixture({ reviewCommitOid: 'c'.repeat(40) }),
        'analytics-thread-identity-two',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: changedReviewRecord,
          repository,
          expectedRunId: 'analytics-thread-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/review(?:-thread)? identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(firstBytes);

      const reusedRootRecord = structuredClone(secondRecord);
      reusedRootRecord.pullRequests[0].reviewThreads.values.find((thread: any) => thread.id === 'thread-a').id = 'thread-c';
      reusedRootRecord.pullRequests[0].reviewThreads.values.sort((left: any, right: any) => left.id.localeCompare(right.id));
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: addIntegrity(reusedRootRecord),
          repository,
          expectedRunId: 'analytics-thread-identity-two',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo)
        })
      ).rejects.toThrow(/review-thread identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(firstBytes);

      const movedThreadRecord = structuredClone(secondRecord);
      const originalPullRequest = movedThreadRecord.pullRequests[0];
      const movedPullRequest = structuredClone(originalPullRequest);
      movedPullRequest.number = 9;
      movedPullRequest.nodeId = 'pull-request-node-9';
      movedPullRequest.url = 'https://github.com/pbroom/spfx-kit/pull/9';
      movedPullRequest.title = 'Another pull request';
      movedPullRequest.head = { oid: 'c'.repeat(40), refName: 'another-feature', repository };
      movedPullRequest.base = { oid: base, refName: 'main', repository };
      originalPullRequest.reviews = { ...originalPullRequest.reviews, count: 0, values: [] };
      originalPullRequest.reviewComments = { ...originalPullRequest.reviewComments, count: 0, values: [] };
      originalPullRequest.reviewThreads = { ...originalPullRequest.reviewThreads, count: 0, values: [] };
      movedThreadRecord.pullRequests.push(movedPullRequest);
      const inventoryEntry = structuredClone(movedThreadRecord.inventory.openPullRequests[0]);
      inventoryEntry.number = 9;
      inventoryEntry.head = movedPullRequest.head;
      inventoryEntry.base = movedPullRequest.base;
      movedThreadRecord.inventory.openPullRequests.push(inventoryEntry);
      const movedThreadEvent = createAuditEvent(
        movedThreadRecord,
        { auditId: secondRecord.audit.id, digest: secondRecord.integrity.digest },
        { sampling: samplingFor(analyticsSlotTwo), previousEventDigest: firstEvent.integrity.digest }
      );
      validateAuditEvent(movedThreadEvent, firstEvent.integrity.digest);
      await writeFile(filename, `${canonicalJson(firstEvent)}\n${canonicalJson(movedThreadEvent)}\n`, 'utf8');
      const thirdRecord = await auditWith(
        githubFixture(),
        'analytics-thread-identity-three',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      const movedBytes = await readFile(filename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: thirdRecord,
          repository,
          expectedRunId: 'analytics-thread-identity-three',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotThree)
        })
      ).rejects.toThrow(/review-thread identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(movedBytes);

      await appendCompleteAuditEvent({
        filename: reappearanceFilename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-thread-identity-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const absentRecord = await auditWith(
        githubFixture({ noReviewThreads: true }),
        'analytics-thread-identity-absent',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename: reappearanceFilename,
        record: absentRecord,
        repository,
        expectedRunId: 'analytics-thread-identity-absent',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo)
      });
      await appendCompleteAuditEvent({
        filename: reappearanceFilename,
        record: thirdRecord,
        repository,
        expectedRunId: 'analytics-thread-identity-three',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotThree)
      });
      expect((await readFile(reappearanceFilename, 'utf8')).trim().split('\n')).toHaveLength(3);

      const nullableOne = await auditWith(githubFixture({ nullableThreadReview: true }), 'analytics-nullable-review-one');
      await appendCompleteAuditEvent({
        filename: nullableReviewFilename,
        record: nullableOne,
        repository,
        expectedRunId: 'analytics-nullable-review-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const knownReview = await auditWith(
        githubFixture(),
        'analytics-known-review',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename: nullableReviewFilename,
        record: knownReview,
        repository,
        expectedRunId: 'analytics-known-review',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo)
      });
      const nullableAgain = await auditWith(
        githubFixture({ nullableThreadReview: true }),
        'analytics-nullable-review-again',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename: nullableReviewFilename,
        record: nullableAgain,
        repository,
        expectedRunId: 'analytics-nullable-review-again',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotThree)
      });
      const conflictingReview = await auditWith(
        githubFixture({ reviewCommitOid: 'c'.repeat(40) }),
        'analytics-conflicting-review',
        '2026-08-09T00:00:00.000Z',
        '2026-08-09T00:00:02.000Z'
      );
      const nullableReviewBytes = await readFile(nullableReviewFilename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename: nullableReviewFilename,
          record: conflictingReview,
          repository,
          expectedRunId: 'analytics-conflicting-review',
          maxAgeSeconds: 300,
          now: new Date('2026-08-09T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotFour)
        })
      ).rejects.toThrow(/review(?:-thread)? identity mapping changed/);
      expect(await readFile(nullableReviewFilename, 'utf8')).toBe(nullableReviewBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves role-scoped instruction ID-to-digest mappings across event-log rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-instruction-identity-'));
    const filename = path.join(directory, 'events.jsonl');
    const sharedId = 'shared-instruction-v1';
    const reviewerDigest = `sha256:${'1'.repeat(64)}`;
    const fixerDigest = `sha256:${'2'.repeat(64)}`;
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-instruction-one');
      await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-instruction-one',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne),
        reviewerInstruction: { id: sharedId, digest: reviewerDigest },
        fixerInstruction: { id: sharedId, digest: fixerDigest }
      });

      const partialRecord = await auditWith(
        githubFixture(),
        'analytics-instruction-partial',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename,
        record: partialRecord,
        repository,
        expectedRunId: 'analytics-instruction-partial',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo),
        reviewerInstruction: { id: sharedId }
      });

      const matchingRecord = await auditWith(
        githubFixture(),
        'analytics-instruction-matching',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename,
        record: matchingRecord,
        repository,
        expectedRunId: 'analytics-instruction-matching',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotThree),
        reviewerInstruction: { id: sharedId, digest: reviewerDigest }
      });

      const conflictingRecord = await auditWith(
        githubFixture(),
        'analytics-instruction-conflicting',
        '2026-08-09T00:00:00.000Z',
        '2026-08-09T00:00:02.000Z'
      );
      const beforeConflict = await readFile(filename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: conflictingRecord,
          repository,
          expectedRunId: 'analytics-instruction-conflicting',
          maxAgeSeconds: 300,
          now: new Date('2026-08-09T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotFour),
          reviewerInstruction: { id: sharedId, digest: `sha256:${'3'.repeat(64)}` }
        })
      ).rejects.toThrow(/instruction identity mapping changed/);
      expect(await readFile(filename, 'utf8')).toBe(beforeConflict);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses the stable repository node ID as the append-only stream identity across observed repository renames', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-repository-rename-'));
    const filename = path.join(directory, 'events.jsonl');
    const renamedRepository = 'new-owner/new-name';
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-before-rename');
      await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-before-rename',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const renamedRecord = await auditForRepository(
        githubFixture({ repositoryFullName: renamedRepository }),
        renamedRepository,
        'analytics-after-rename',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      await appendCompleteAuditEvent({
        filename,
        record: renamedRecord,
        repository: renamedRepository,
        expectedRunId: 'analytics-after-rename',
        maxAgeSeconds: 300,
        now: new Date('2026-08-08T00:00:03.000Z'),
        sampling: samplingFor(analyticsSlotTwo)
      });
      const rows = (await readFile(filename, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows.map((event) => event.repository)).toEqual([
        { nameWithOwner: repository, nodeId: 'R_repo' },
        { nameWithOwner: renamedRepository, nodeId: 'R_repo' }
      ]);
      expect(rows.map((event) => event.pullRequests[0].url)).toEqual([
        'https://github.com/pbroom/spfx-kit/pull/7',
        'https://github.com/new-owner/new-name/pull/7'
      ]);

      const differentRepositoryRecord = await auditForRepository(
        githubFixture({ repositoryFullName: renamedRepository, repositoryNodeId: 'R_different' }),
        renamedRepository,
        'analytics-different-repository',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:02.000Z'
      );
      const beforeRejectedAppend = await readFile(filename, 'utf8');
      await expect(
        appendCompleteAuditEvent({
          filename,
          record: differentRepositoryRecord,
          repository: renamedRepository,
          expectedRunId: 'analytics-different-repository',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotThree)
        })
      ).rejects.toThrow(/another repository stream/);
      expect(await readFile(filename, 'utf8')).toBe(beforeRejectedAppend);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reconciles copied marker reports and bounds them by observed review submissions', async () => {
    const record = await auditWith(
      githubFixture({ loopMarker: true, loopMarkerMultipleThreads: true }),
      'analytics-report-copies'
    );
    const event = createAuditEvent(
      record,
      { auditId: record.audit.id, digest: record.integrity.digest },
      { sampling: samplingFor(analyticsSlotOne), previousEventDigest: null }
    );
    const reportedFindings = event.pullRequests[0].findings.filter((finding) => finding.fixLink.status === 'reported');
    expect(reportedFindings).toHaveLength(2);
    expect(new Set(reportedFindings.map((finding) => finding.fixLink.reports[0].threadId)).size).toBe(2);
    expect(() => validateAuditEvent(event, null)).not.toThrow();

    const divergentCopy = structuredClone(event);
    divergentCopy.pullRequests[0].findings.find(
      (finding) => finding.fixLink.status === 'reported' && finding.origin.nodeId === 'thread-b'
    ).fixLink.reports[0].result = 'accepted';
    expect(() => validateAuditEvent(addIntegrity(divergentCopy), null)).toThrow(/marker reports are inconsistent/);

    const impossibleSubmissionCount = structuredClone(event);
    impossibleSubmissionCount.pullRequests[0].reviewLoop.reviewSubmissionCount = 0;
    impossibleSubmissionCount.pullRequests[0].reviewLoop.exactHeadReviewSubmissionCount = 0;
    expect(() => validateAuditEvent(addIntegrity(impossibleSubmissionCount), null)).toThrow(/pull-request schema/);

    const impossibleExactHeadCount = structuredClone(event);
    impossibleExactHeadCount.pullRequests[0].reviewLoop.exactHeadReviewSubmissionCount = 0;
    expect(() => validateAuditEvent(addIntegrity(impossibleExactHeadCount), null)).toThrow(/pull-request schema/);
  });

  it('surfaces operation and append-lock cleanup failures together after restoring the event log', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-combined-failure-'));
    const filename = path.join(directory, 'events.jsonl');
    try {
      const firstRecord = await auditWith(githubFixture(), 'analytics-combined-failure-first');
      await appendCompleteAuditEvent({
        filename,
        record: firstRecord,
        repository,
        expectedRunId: 'analytics-combined-failure-first',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      const secondRecord = await auditWith(
        githubFixture(),
        'analytics-combined-failure-second',
        '2026-08-08T00:00:00.000Z',
        '2026-08-08T00:00:02.000Z'
      );
      const originalBytes = await readFile(filename, 'utf8');
      let combinedError;
      try {
        await appendCompleteAuditEvent({
          filename,
          record: secondRecord,
          repository,
          expectedRunId: 'analytics-combined-failure-second',
          maxAgeSeconds: 300,
          now: new Date('2026-08-08T00:00:03.000Z'),
          sampling: samplingFor(analyticsSlotTwo),
          appendWrite: async (handle: any, payload: Buffer) => {
            await handle.write(payload.subarray(0, 7));
            await unlink(`${filename}.lock`);
            throw 'injected primitive append operation failure';
          }
        });
      } catch (error) {
        combinedError = error;
      }
      expect(combinedError).toBeInstanceOf(AggregateError);
      expect(combinedError.message).toMatch(
        /injected primitive append operation failure.*lock cleanup failed.*manual lock recovery/
      );
      expect(combinedError.errors[0]).toBe('injected primitive append operation failure');
      expect(combinedError.errors[1].message).toMatch(/ENOENT/);
      expect(await readFile(filename, 'utf8')).toBe(originalBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('recovers only an expired same-host append lock whose recorded owner is dead', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-pr-audit-lock-'));
    const filename = path.join(directory, 'events.jsonl');
    const liveOwnerFilename = path.join(directory, 'live-owner.jsonl');
    const stagedOwnerFilename = path.join(directory, 'staged-owner.jsonl');
    const orphanOwnerFilename = path.join(directory, 'orphan-owner.jsonl');
    const malformedFilename = path.join(directory, 'malformed.jsonl');
    const noncanonicalOwnerFilename = path.join(directory, 'noncanonical-owner.jsonl');
    const interruptedRecoveryFilename = path.join(directory, 'interrupted-recovery.jsonl');
    const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
    const deadPid = child.pid;
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => resolve());
    });
    expect(deadPid).toBeTypeOf('number');
    const lockOwner = (pid: number) => ({
      acquiredAt: '2026-08-07T11:30:00.000Z',
      host: os.hostname(),
      kind: 'pbroom.spfx-kit.pr-review-audit-event-lock',
      ownerId: '00000000-0000-4000-8000-000000000001',
      pid,
      schemaVersion: 1
    });
    try {
      const record = await auditWith(githubFixture(), 'analytics-lock-recovery');
      const deadOwner = lockOwner(deadPid!);
      const deadOwnerFile = `${filename}.lock.${deadOwner.ownerId}.owner`;
      await writeFile(deadOwnerFile, `${canonicalJson(deadOwner)}\n`, { encoding: 'utf8', mode: 0o600 });
      await createLink(deadOwnerFile, `${filename}.lock`);
      const event = await appendCompleteAuditEvent({
        filename,
        record,
        repository,
        expectedRunId: 'analytics-lock-recovery',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      expect(event.run.id).toBe('analytics-lock-recovery');
      await expect(readFile(`${filename}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const stagedOwnerId = '00000000-0000-4000-8000-000000000002';
      const stagedOwner = { ...lockOwner(deadPid!), ownerId: stagedOwnerId };
      const stagedOwnerFile = `${stagedOwnerFilename}.lock.${stagedOwnerId}.owner`;
      await writeFile(stagedOwnerFile, `${canonicalJson(stagedOwner)}\n`, { encoding: 'utf8', mode: 0o600 });
      await createLink(stagedOwnerFile, `${stagedOwnerFilename}.lock`);
      const stagedOwnerRecord = await auditWith(githubFixture(), 'analytics-staged-lock-recovery');
      const recovered = await appendCompleteAuditEvent({
        filename: stagedOwnerFilename,
        record: stagedOwnerRecord,
        repository,
        expectedRunId: 'analytics-staged-lock-recovery',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      expect(recovered.run.id).toBe('analytics-staged-lock-recovery');
      await expect(readFile(stagedOwnerFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(`${orphanOwnerFilename}.lock.interrupted.owner`, '{"kind":', {
        encoding: 'utf8',
        mode: 0o600
      });
      const orphanOwnerRecord = await auditWith(githubFixture(), 'analytics-orphan-owner');
      const orphanIgnored = await appendCompleteAuditEvent({
        filename: orphanOwnerFilename,
        record: orphanOwnerRecord,
        repository,
        expectedRunId: 'analytics-orphan-owner',
        maxAgeSeconds: 300,
        now: new Date('2026-08-07T12:00:03.000Z'),
        sampling: samplingFor(analyticsSlotOne)
      });
      expect(orphanIgnored.run.id).toBe('analytics-orphan-owner');

      const malformedRecord = await auditWith(githubFixture(), 'analytics-malformed-lock');
      await writeFile(`${malformedFilename}.lock`, '{"kind":', { encoding: 'utf8', mode: 0o600 });
      await expect(
        appendCompleteAuditEvent({
          filename: malformedFilename,
          record: malformedRecord,
          repository,
          expectedRunId: 'analytics-malformed-lock',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/incomplete or invalid and cannot be reclaimed safely/);
      await expect(readFile(malformedFilename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const noncanonicalOwnerRecord = await auditWith(githubFixture(), 'analytics-noncanonical-owner');
      const uppercaseOwner = {
        ...lockOwner(deadPid!),
        ownerId: 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF'
      };
      const uppercaseOwnerFile = `${noncanonicalOwnerFilename}.lock.${uppercaseOwner.ownerId}.owner`;
      await writeFile(uppercaseOwnerFile, `${canonicalJson(uppercaseOwner)}\n`, { encoding: 'utf8', mode: 0o600 });
      await createLink(uppercaseOwnerFile, `${noncanonicalOwnerFilename}.lock`);
      await expect(
        appendCompleteAuditEvent({
          filename: noncanonicalOwnerFilename,
          record: noncanonicalOwnerRecord,
          repository,
          expectedRunId: 'analytics-noncanonical-owner',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/incomplete or invalid and cannot be reclaimed safely/);
      await expect(readFile(noncanonicalOwnerFilename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const interruptedRecoveryRecord = await auditWith(githubFixture(), 'analytics-interrupted-recovery');
      await writeFile(`${interruptedRecoveryFilename}.lock`, `${canonicalJson(lockOwner(deadPid!))}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
      await expect(
        appendCompleteAuditEvent({
          filename: interruptedRecoveryFilename,
          record: interruptedRecoveryRecord,
          repository,
          expectedRunId: 'analytics-interrupted-recovery',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/publication or recovery was interrupted/);
      await expect(readFile(interruptedRecoveryFilename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const liveOwnerRecord = await auditWith(githubFixture(), 'analytics-live-owner');
      const liveOwner = lockOwner(process.pid);
      const liveOwnerFile = `${liveOwnerFilename}.lock.${liveOwner.ownerId}.owner`;
      await writeFile(liveOwnerFile, `${canonicalJson(liveOwner)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
      await createLink(liveOwnerFile, `${liveOwnerFilename}.lock`);
      await expect(
        appendCompleteAuditEvent({
          filename: liveOwnerFilename,
          record: liveOwnerRecord,
          repository,
          expectedRunId: 'analytics-live-owner',
          maxAgeSeconds: 300,
          now: new Date('2026-08-07T12:00:03.000Z'),
          sampling: samplingFor(analyticsSlotOne)
        })
      ).rejects.toThrow(/lock owner is still alive/);
      await expect(readFile(liveOwnerFilename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function auditWith(
  harness: ReturnType<typeof githubFixture>,
  runId: string,
  startedAt = '2026-08-07T12:00:00.000Z',
  completedAt = '2026-08-07T12:00:02.000Z'
): Promise<any> {
  return auditRepository({
    repository,
    token: 'fixture-token',
    apiUrl,
    fetchImpl: harness.fetch,
    runId,
    pageSize: 1,
    now: sequenceClock(startedAt, completedAt)
  });
}

async function auditForRepository(
  harness: ReturnType<typeof githubFixture>,
  repositoryName: string,
  runId: string,
  startedAt: string,
  completedAt: string
): Promise<any> {
  return auditRepository({
    repository: repositoryName,
    token: 'fixture-token',
    apiUrl,
    fetchImpl: (input, init) => {
      const url = new URL(String(input));
      const repositoryPrefix = `/repos/${repositoryName}`;
      if (url.pathname.startsWith(repositoryPrefix)) {
        url.pathname = `/repos/${repository}${url.pathname.slice(repositoryPrefix.length)}`;
      }
      return harness.fetch(url, init);
    },
    runId,
    pageSize: 1,
    now: sequenceClock(startedAt, completedAt)
  });
}

function sequenceClock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function samplingFor(expectedAt: string): { slotId: string; expectedAt: string; runnerVersion: string } {
  return { slotId: `twice-daily:${expectedAt}`, expectedAt, runnerVersion: 'fixture-runner-v1' };
}

interface FixtureOptions {
  failure?: 'issue-comments-page-2' | 'graphql-partial';
  driftAfterInventory?: boolean;
  duplicateReview?: boolean;
  evidenceDrift?: boolean;
  malformedThread?: boolean;
  nullableThreadReview?: boolean;
  loopMarker?: boolean;
  invalidLoopMarker?: boolean;
  cleanMarkerWithThreads?: boolean;
  cleanMarker?: boolean;
  loopMarkerReviewMismatch?: boolean;
  loopMarkerHeadMismatch?: boolean;
  loopMarkerBeforeReviewSubmission?: boolean;
  loopMarkerAtReviewSubmission?: boolean;
  loopMarkerAfterAuditCompletion?: boolean;
  loopMarkerAtAuditCompletion?: boolean;
  loopMarkerMultipleThreads?: boolean;
  nullPrAuthor?: boolean;
  pendingReview?: boolean;
  numericRepositoryNodeId?: boolean;
  mismatchedPullRequestUrl?: boolean;
  duplicatePullRequestNodeId?: boolean;
  duplicateLoopMarkerBlocks?: boolean;
  mismatchedBaseRepository?: boolean;
  mismatchedDraftBaseRepository?: boolean;
  baseRepositoryCaseVariant?: boolean;
  markerReviewPending?: boolean;
  markerReviewNullCommit?: boolean;
  markerReviewInvalidCommit?: boolean;
  markerReviewId?: number | string | boolean;
  duplicateReviewNodeId?: boolean;
  duplicateReviewDatabaseIdAcrossPullRequests?: boolean;
  graphqlReviewNodeId?: string;
  graphqlReviewDatabaseId?: string;
  graphqlReviewCommitMismatch?: boolean;
  restReviewCommentReviewId?: number;
  ambiguousThreadRoots?: 'zero' | 'multiple';
  graphqlCommentNodeIdMismatch?: boolean;
  duplicateReviewCommentNodeId?: boolean;
  restReviewCommentIdAsString?: boolean;
  graphqlCommentIdAsNumber?: boolean;
  invalidReviewCommentParent?: boolean;
  reversedPullRequestTimestamps?: boolean;
  pullRequestCreatedAt?: string;
  pullRequestUpdatedAt?: string;
  repositoryFullName?: string;
  repositoryNodeId?: string;
  noReviewThreads?: boolean;
  reviewCommitOid?: string;
}

function githubFixture(options: FixtureOptions = {}) {
  const requests: Array<{ method: string; pathname: string; authorization: string }> = [];
  let detailRequests = 0;
  let inventoryFirstPageRequests = 0;
  const pullRequest = pullRequestFixture(false);
  const fixtureRepository = options.repositoryFullName || repository;
  pullRequest.html_url = `https://github.com/${fixtureRepository}/pull/7`;
  pullRequest.head.repo.full_name = fixtureRepository;
  pullRequest.base.repo.full_name = fixtureRepository;
  if (options.pullRequestCreatedAt) pullRequest.created_at = options.pullRequestCreatedAt;
  if (options.pullRequestUpdatedAt) pullRequest.updated_at = options.pullRequestUpdatedAt;
  if (options.nullPrAuthor) pullRequest.user = null;
  if (options.mismatchedPullRequestUrl) pullRequest.html_url = 'https://github.com/pbroom/spfx-kit/pull/999';
  if (options.mismatchedBaseRepository) pullRequest.base.repo.full_name = 'another/repository';
  if (options.baseRepositoryCaseVariant) pullRequest.base.repo.full_name = 'PBROOM/SPFX-KIT';
  if (options.reversedPullRequestTimestamps) pullRequest.created_at = '2026-08-07T12:00:00Z';
  const draft = pullRequestFixture(true);
  draft.number = 8;
  draft.head.repo.full_name = fixtureRepository;
  draft.base.repo.full_name = fixtureRepository;
  if (options.mismatchedDraftBaseRepository) draft.base.repo.full_name = 'another/repository';
  draft.node_id = options.duplicatePullRequestNodeId ? pullRequest.node_id : 'PR_draft';
  draft.html_url = `https://github.com/${fixtureRepository}/pull/8`;
  if (options.duplicatePullRequestNodeId) draft.draft = false;
  if (options.duplicateReviewDatabaseIdAcrossPullRequests) draft.draft = false;

  const fixtureReviewComment = (id: number) => {
    const comment = reviewCommentFixture(id, options.restReviewCommentReviewId);
    if (options.ambiguousThreadRoots === 'zero' && [100, 101].includes(id)) comment.in_reply_to_id = 999;
    if (options.ambiguousThreadRoots === 'multiple' && id === 102) comment.in_reply_to_id = null;
    if (options.duplicateReviewCommentNodeId && id === 102) comment.node_id = 'review-comment-101';
    if (options.restReviewCommentIdAsString && id === 101) comment.id = '101';
    if (options.invalidReviewCommentParent && id === 102) comment.in_reply_to_id = 999;
    return comment;
  };

  const fetch = async (input: string | URL, init: RequestInit = {}): Promise<any> => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    const headers = init.headers as Record<string, string>;
    requests.push({ method, pathname: url.pathname, authorization: headers.Authorization });

    if (url.pathname === '/user') return response({ id: 42, login: 'auditor', type: 'User' });
    if (url.pathname === '/repos/pbroom/spfx-kit' && !url.search) {
      return response({
        id: 1,
        node_id: options.numericRepositoryNodeId ? 123 : options.repositoryNodeId || 'R_repo',
        full_name: fixtureRepository
      });
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls' && url.searchParams.get('state') === 'open') {
      const page = Number(url.searchParams.get('page'));
      if (page === 1) {
        inventoryFirstPageRequests += 1;
        const current = structuredClone(pullRequest);
        if (options.driftAfterInventory && inventoryFirstPageRequests > 1) current.head.sha = 'c'.repeat(40);
        return response([current], {
          link: link('/repos/pbroom/spfx-kit/pulls?state=open&sort=created&direction=asc&per_page=1&page=2')
        });
      }
      return response([draft]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/7' && !url.pathname.endsWith('/comments')) {
      detailRequests += 1;
      const current = structuredClone(pullRequest);
      if (options.evidenceDrift && detailRequests > 1) current.mergeable_state = 'clean';
      return response(current);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/8' && !url.pathname.endsWith('/comments')) {
      return response(structuredClone(draft));
    }
    if (
      (options.duplicatePullRequestNodeId || options.duplicateReviewDatabaseIdAcrossPullRequests) &&
      url.pathname === '/repos/pbroom/spfx-kit/pulls/8/reviews'
    ) {
      return response(options.duplicateReviewDatabaseIdAcrossPullRequests ? [reviewFixture(20)] : []);
    }
    if (
      (options.duplicatePullRequestNodeId || options.duplicateReviewDatabaseIdAcrossPullRequests) &&
      url.pathname === '/repos/pbroom/spfx-kit/issues/8/comments'
    ) {
      return response([]);
    }
    if (
      (options.duplicatePullRequestNodeId || options.duplicateReviewDatabaseIdAcrossPullRequests) &&
      url.pathname === '/repos/pbroom/spfx-kit/pulls/8/comments'
    ) {
      return response([]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/7/reviews') {
      if (url.searchParams.get('page') === '1') {
        const markerReview = reviewFixture(20, options.markerReviewPending ? null : '2026-08-07T11:50:00Z');
        if (options.markerReviewId !== undefined) markerReview.id = options.markerReviewId;
        if (options.markerReviewNullCommit) markerReview.commit_id = null;
        if (options.markerReviewInvalidCommit) markerReview.commit_id = 123;
        if (options.reviewCommitOid) markerReview.commit_id = options.reviewCommitOid;
        return response([markerReview], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/reviews?per_page=1&page=2')
        });
      }
      if (options.pendingReview && url.searchParams.get('page') === '2') {
        return response([reviewFixture(options.duplicateReview ? 20 : 10)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/reviews?per_page=1&page=3')
        });
      }
      if (options.pendingReview) return response([reviewFixture(30, null)]);
      const laterReview = reviewFixture(options.duplicateReview ? 20 : 10);
      if (options.duplicateReviewNodeId) laterReview.node_id = 'review-20';
      return response([laterReview]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/issues/7/comments') {
      if (url.searchParams.get('page') === '1') {
        const marker = options.loopMarker
          ? loopStatusCommentFixture(
              options.invalidLoopMarker,
              options.cleanMarker || options.cleanMarkerWithThreads,
              options.cleanMarkerWithThreads,
              options.loopMarkerReviewMismatch,
              options.loopMarkerHeadMismatch,
              options.loopMarkerMultipleThreads,
              options.loopMarkerBeforeReviewSubmission,
              options.loopMarkerAtReviewSubmission,
              options.loopMarkerAfterAuditCompletion,
              options.loopMarkerAtAuditCompletion
            )
          : issueCommentFixture(40);
        if (options.duplicateLoopMarkerBlocks) marker.body = `${marker.body}\n${marker.body}`;
        return response([marker], {
          link: link('/repos/pbroom/spfx-kit/issues/7/comments?per_page=1&page=2')
        });
      }
      if (options.failure === 'issue-comments-page-2') return response({ message: 'unavailable' }, { status: 503 });
      return response([issueCommentFixture(30)]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/7/comments') {
      if (options.noReviewThreads) return response([]);
      if (url.searchParams.get('page') === '1') {
        return response([fixtureReviewComment(102)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/comments?per_page=1&page=2')
        });
      }
      if (url.searchParams.get('page') === '2') {
        return response([fixtureReviewComment(101)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/comments?per_page=1&page=3')
        });
      }
      return response([fixtureReviewComment(100)]);
    }
    if (url.pathname === '/graphql') {
      const body = JSON.parse(String(init.body));
      if (options.failure === 'graphql-partial') {
        return response({ data: { repository: null }, errors: [{ message: 'partial failure' }] });
      }
      if (body.query.includes('node(id: $threadId)')) {
        return response({
          data: {
            node: {
              id: 'thread-b',
              comments: {
                nodes: [
                  threadCommentFixture(
                    102,
                    'reply',
                    'someone-else',
                    false,
                    options.graphqlReviewCommitMismatch ? 'c'.repeat(40) : options.reviewCommitOid,
                    options.graphqlReviewNodeId,
                    options.graphqlReviewDatabaseId,
                    options.graphqlCommentNodeIdMismatch
                      ? 'mismatched-review-comment-102'
                      : options.duplicateReviewCommentNodeId
                        ? 'review-comment-101'
                        : undefined
                  )
                ],
                pageInfo: { hasNextPage: false, endCursor: null }
              }
            }
          }
        });
      }
      if (
        (options.duplicatePullRequestNodeId || options.duplicateReviewDatabaseIdAcrossPullRequests) &&
        body.variables.number === 8
      ) {
        return response({
          data: {
            repository: {
              pullRequest: {
                number: 8,
                reviewThreads: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          }
        });
      }
      if (options.noReviewThreads) {
        return response({
          data: {
            repository: {
              pullRequest: {
                number: 7,
                reviewThreads: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          }
        });
      }
      if (body.variables.after === null) {
        return response({
          data: {
            repository: {
              pullRequest: {
                number: 7,
                reviewThreads: {
                  nodes: [
                    threadFixture(
                      'thread-b',
                      options.malformedThread ? undefined : false,
                      false,
                      [
                        threadCommentFixture(
                          101,
                          '[P2] Current exact-head finding.',
                          'chatgpt-codex-connector[bot]',
                          options.nullableThreadReview,
                          options.graphqlReviewCommitMismatch ? 'c'.repeat(40) : options.reviewCommitOid,
                          options.graphqlReviewNodeId,
                          options.graphqlReviewDatabaseId,
                          options.graphqlCommentNodeIdMismatch ? 'mismatched-review-comment-101' : undefined,
                          options.graphqlCommentIdAsNumber ? 101 : undefined
                        )
                      ],
                      true
                    )
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'threads-1' }
                }
              }
            }
          }
        });
      }
      return response({
        data: {
          repository: {
            pullRequest: {
              number: 7,
              reviewThreads: {
                nodes: [
                  threadFixture(
                    'thread-a',
                    true,
                    false,
                    [
                      threadCommentFixture(
                        100,
                        'Resolved.',
                        'reviewer',
                        false,
                        options.graphqlReviewCommitMismatch ? 'c'.repeat(40) : options.reviewCommitOid,
                        options.graphqlReviewNodeId,
                        options.graphqlReviewDatabaseId,
                        options.graphqlCommentNodeIdMismatch ? 'mismatched-review-comment-100' : undefined
                      )
                    ],
                    false
                  )
                ],
                pageInfo: { hasNextPage: false, endCursor: null }
              }
            }
          }
        }
      });
    }
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  };

  return { fetch, requests };
}

function pullRequestFixture(draft: boolean): any {
  return {
    id: 7,
    node_id: 'PR_7',
    number: 7,
    html_url: 'https://github.com/pbroom/spfx-kit/pull/7',
    title: 'Audit reviews',
    state: 'open',
    draft,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-07T11:59:00Z',
    author_association: 'OWNER',
    user: { id: 1, login: 'author', type: 'User' },
    head: { sha: head, ref: 'codex/audit', repo: { full_name: repository } },
    base: { sha: base, ref: 'main', repo: { full_name: repository } },
    mergeable: null,
    mergeable_state: 'unknown',
    rebaseable: null
  };
}

function reviewFixture(id: number, submittedAt: string | null = '2026-08-07T11:50:00Z'): any {
  return {
    id,
    node_id: `review-${id}`,
    state: 'COMMENTED',
    body: `Review ${id}`,
    commit_id: head,
    submitted_at: submittedAt,
    author_association: 'NONE',
    user:
      id === 100
        ? { id: 3, login: 'reviewer', type: 'User' }
        : { id: 199175422, login: 'chatgpt-codex-connector[bot]', type: 'Bot' }
  };
}

function loopStatusCommentFixture(
  invalid = false,
  clean = false,
  cleanWithThreads = false,
  reviewMismatch = false,
  headMismatch = false,
  multipleThreads = false,
  beforeReviewSubmission = false,
  atReviewSubmission = false,
  afterAuditCompletion = false,
  atAuditCompletion = false
): any {
  const comment = issueCommentFixture(40);
  comment.user = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
  const state: any = {
    version: 1,
    attempts: 1,
    status: 'pushed',
    headSha: head,
    reviewId: 20,
    attempt: 1,
    runUrl: 'https://github.test/actions/runs/1',
    summary: 'Reported push; causal linkage not established.',
    processedReviews: [
      {
        reviewId: 20,
        headSha: head,
        attempt: 1,
        result: 'pushed',
        threadIds: ['thread-b'],
        at: '2026-08-07T11:55:00.000Z'
      }
    ]
  };
  if (clean) {
    state.status = 'ready_for_human';
    state.processedReviews[0].result = 'clean';
    if (!cleanWithThreads) delete state.processedReviews[0].threadIds;
  }
  if (invalid) {
    delete state.summary;
    state.unexpected = 'must be rejected';
  }
  if (reviewMismatch) state.processedReviews[0].reviewId = 21;
  if (headMismatch) state.processedReviews[0].headSha = 'c'.repeat(40);
  if (multipleThreads) state.processedReviews[0].threadIds = ['thread-a', 'thread-b'];
  if (beforeReviewSubmission) state.processedReviews[0].at = '2026-08-07T11:49:59.000Z';
  if (atReviewSubmission) state.processedReviews[0].at = '2026-08-07T11:50:00.000Z';
  if (afterAuditCompletion) state.processedReviews[0].at = '2026-08-07T12:00:02.001Z';
  if (atAuditCompletion) state.processedReviews[0].at = '2026-08-07T12:00:02.000Z';
  comment.body = `<!-- codex-review-fix-loop:v1
${JSON.stringify(state)}
-->`;
  return comment;
}

function issueCommentFixture(id: number): any {
  return {
    id,
    node_id: `issue-comment-${id}`,
    html_url: `https://github.test/comment/${id}`,
    body: `Issue comment ${id}`,
    created_at: '2026-08-07T11:50:00Z',
    updated_at: '2026-08-07T11:50:00Z',
    author_association: 'MEMBER',
    user: { id: 2, login: 'member', type: 'User' }
  };
}

function reviewCommentFixture(id: number, pullRequestReviewId = 20): any {
  return {
    id,
    node_id: `review-comment-${id}`,
    pull_request_review_id: pullRequestReviewId,
    in_reply_to_id: id === 102 ? 101 : null,
    html_url: `https://github.test/review-comment/${id}`,
    body: `Review comment ${id}`,
    path: 'src/value.ts',
    line: 3,
    start_line: null,
    side: 'RIGHT',
    start_side: null,
    commit_id: head,
    original_commit_id: head,
    created_at: '2026-08-07T11:50:00Z',
    updated_at: '2026-08-07T11:50:00Z',
    author_association: 'NONE',
    user:
      id === 100
        ? { id: 3, login: 'reviewer', type: 'User' }
        : { id: 199175422, login: 'chatgpt-codex-connector[bot]', type: 'Bot' }
  };
}

function threadFixture(id: string, isResolved: boolean | undefined, isOutdated: boolean, comments: any[], hasNextPage: boolean) {
  return {
    id,
    isResolved,
    isOutdated,
    path: 'src/value.ts',
    line: 3,
    startLine: null,
    diffSide: 'RIGHT',
    startDiffSide: null,
    comments: { nodes: comments, pageInfo: { hasNextPage, endCursor: hasNextPage ? 'comments-1' : null } }
  };
}

function threadCommentFixture(
  id: number,
  body: string,
  login: string,
  nullableReview = false,
  reviewCommitOid = head,
  reviewNodeId = 'review-20',
  reviewDatabaseId = '20',
  commentNodeId = `review-comment-${id}`,
  commentDatabaseId: string | number = String(id)
): any {
  return {
    id: commentNodeId,
    fullDatabaseId: commentDatabaseId,
    body,
    path: 'src/value.ts',
    line: 3,
    createdAt: '2026-08-07T11:50:00Z',
    updatedAt: '2026-08-07T11:50:00Z',
    author: { login },
    pullRequestReview: nullableReview
      ? null
      : { id: reviewNodeId, fullDatabaseId: reviewDatabaseId, commit: { oid: reviewCommitOid } }
  };
}

function link(relative: string): string {
  return `<${apiUrl}${relative}>; rel="next"`;
}

function response(data: unknown, options: { status?: number; link?: string } = {}): any {
  const status = options.status || 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'link' ? options.link || null : null) },
    json: async () => structuredClone(data),
    text: async () => JSON.stringify(data)
  };
}
