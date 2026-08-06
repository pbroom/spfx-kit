import { describe, expect, it } from 'vitest';
import { CODEX_REVIEW_ACTOR_ID, currentFindings, parseRepository, validateHandoff } from '../scripts/codex-desktop-handoff.mjs';

const head = 'a'.repeat(40);
const repository = parseRepository('pbroom/spfx-kit');
const review = {
  id: 4,
  state: 'COMMENTED',
  commit_id: head,
  user: { login: 'chatgpt-codex-connector[bot]', id: CODEX_REVIEW_ACTOR_ID, type: 'Bot' }
};
const pullRequest = {
  number: 80,
  state: 'open',
  draft: false,
  author_association: 'OWNER',
  head: { sha: head, ref: 'codex/root', repo: { full_name: 'pbroom/spfx-kit' } }
};
const threads = [
  {
    id: 'thread-1',
    isResolved: false,
    isOutdated: false,
    path: 'apps/lab/a.ts',
    line: 3,
    comments: {
      nodes: [
        {
          databaseId: 9,
          body: '[P2] Fix this.',
          author: { login: 'chatgpt-codex-connector' },
          pullRequestReview: { databaseId: 4, commit: { oid: head } }
        }
      ]
    }
  }
];

describe('desktop Codex remediation handoff', () => {
  it('emits only a current exact-head trusted finding', () => {
    const findings = currentFindings(threads, 4, head);
    expect(validateHandoff({ repository, pullRequest, review, findings, expectedHead: head })).toMatchObject({
      prNumber: 80,
      reviewId: 4,
      headSha: head,
      findings
    });
  });
  it('rejects stale, resolved, or lookalike review input', () => {
    expect(currentFindings([{ ...threads[0], isResolved: true }], 4, head)).toEqual([]);
    expect(() =>
      validateHandoff({
        repository,
        pullRequest: { ...pullRequest, head: { ...pullRequest.head, sha: 'b'.repeat(40) } },
        review,
        findings: [{}],
        expectedHead: head
      })
    ).toThrow(/stale|untrusted/i);
    expect(() =>
      validateHandoff({
        repository,
        pullRequest,
        review: { ...review, user: { ...review.user, id: 1 } },
        findings: [{}],
        expectedHead: head
      })
    ).toThrow(/stale|untrusted/i);
  });
});
