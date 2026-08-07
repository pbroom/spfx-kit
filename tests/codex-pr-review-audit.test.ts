import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_KIND,
  AUDIT_PROOF_KIND,
  AuditIncompleteError,
  addIntegrity,
  auditRepository,
  verifyAuditRecord,
  writeJsonAtomic
} from '../scripts/codex-pr-review-audit.mjs';

const apiUrl = 'https://api.github.com';
const repository = 'pbroom/spfx-kit';
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);

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
    expect(firstHarness.requests.every((request) => request.method === 'GET' || request.pathname === '/graphql')).toBe(true);
    expect(firstHarness.requests.every((request) => request.authorization === 'Bearer fixture-token')).toBe(true);
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
});

async function auditWith(harness: ReturnType<typeof githubFixture>, runId: string): Promise<any> {
  return auditRepository({
    repository,
    token: 'fixture-token',
    apiUrl,
    fetchImpl: harness.fetch,
    runId,
    pageSize: 1,
    now: sequenceClock('2026-08-07T12:00:00.000Z', '2026-08-07T12:00:02.000Z')
  });
}

function sequenceClock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

interface FixtureOptions {
  failure?: 'issue-comments-page-2' | 'graphql-partial';
  driftAfterInventory?: boolean;
  duplicateReview?: boolean;
  evidenceDrift?: boolean;
  malformedThread?: boolean;
  nullableThreadReview?: boolean;
}

function githubFixture(options: FixtureOptions = {}) {
  const requests: Array<{ method: string; pathname: string; authorization: string }> = [];
  let detailRequests = 0;
  let inventoryFirstPageRequests = 0;
  const pullRequest = pullRequestFixture(false);
  const draft = pullRequestFixture(true);
  draft.number = 8;
  draft.node_id = 'PR_draft';
  draft.html_url = 'https://github.test/pbroom/spfx-kit/pull/8';

  const fetch = async (input: string | URL, init: RequestInit = {}): Promise<any> => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    const headers = init.headers as Record<string, string>;
    requests.push({ method, pathname: url.pathname, authorization: headers.Authorization });

    if (url.pathname === '/user') return response({ id: 42, login: 'auditor', type: 'User' });
    if (url.pathname === '/repos/pbroom/spfx-kit' && !url.search) {
      return response({ id: 1, node_id: 'R_repo', full_name: repository });
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
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/7/reviews') {
      if (url.searchParams.get('page') === '1') {
        return response([reviewFixture(20)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/reviews?per_page=1&page=2')
        });
      }
      return response([reviewFixture(options.duplicateReview ? 20 : 10)]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/issues/7/comments') {
      if (url.searchParams.get('page') === '1') {
        return response([issueCommentFixture(40)], {
          link: link('/repos/pbroom/spfx-kit/issues/7/comments?per_page=1&page=2')
        });
      }
      if (options.failure === 'issue-comments-page-2') return response({ message: 'unavailable' }, { status: 503 });
      return response([issueCommentFixture(30)]);
    }
    if (url.pathname === '/repos/pbroom/spfx-kit/pulls/7/comments') {
      if (url.searchParams.get('page') === '1') {
        return response([reviewCommentFixture(102)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/comments?per_page=1&page=2')
        });
      }
      if (url.searchParams.get('page') === '2') {
        return response([reviewCommentFixture(101)], {
          link: link('/repos/pbroom/spfx-kit/pulls/7/comments?per_page=1&page=3')
        });
      }
      return response([reviewCommentFixture(100)]);
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
                nodes: [threadCommentFixture(102, 'reply', 'someone-else')],
                pageInfo: { hasNextPage: false, endCursor: null }
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
                          options.nullableThreadReview
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
                nodes: [threadFixture('thread-a', true, false, [threadCommentFixture(100, 'Resolved.', 'reviewer')], false)],
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
    html_url: 'https://github.test/pbroom/spfx-kit/pull/7',
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

function reviewFixture(id: number): any {
  return {
    id,
    node_id: `review-${id}`,
    state: 'COMMENTED',
    body: `Review ${id}`,
    commit_id: head,
    submitted_at: '2026-08-07T11:50:00Z',
    author_association: 'NONE',
    user: { id: 199175422, login: 'chatgpt-codex-connector[bot]', type: 'Bot' }
  };
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

function reviewCommentFixture(id: number): any {
  return {
    id,
    node_id: `review-comment-${id}`,
    pull_request_review_id: 20,
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
    user: { id: 199175422, login: 'chatgpt-codex-connector[bot]', type: 'Bot' }
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

function threadCommentFixture(id: number, body: string, login: string, nullableReview = false): any {
  return {
    id: `review-comment-node-${id}`,
    fullDatabaseId: String(id),
    body,
    path: 'src/value.ts',
    line: 3,
    createdAt: '2026-08-07T11:50:00Z',
    updatedAt: '2026-08-07T11:50:00Z',
    author: { login },
    pullRequestReview: nullableReview ? null : { id: 'review-node-20', fullDatabaseId: '20', commit: { oid: head } }
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
