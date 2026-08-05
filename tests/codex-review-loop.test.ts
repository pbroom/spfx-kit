import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_FIX_ATTEMPTS,
  decideIntake,
  defaultLoopState,
  findingPriority,
  inspectWorktree,
  normalizeLogin,
  parseLoopState,
  renderLoopStatus,
  selectActionableFindings,
  validatePatchMetadata
} from '../scripts/codex-review-loop.mjs';

const fixtureRoot = path.join(import.meta.dirname, 'fixtures', 'codex-review-loop');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Codex review fix-loop intake', () => {
  it('accepts the observed PR #87 P2 review only at its exact current leaf head', async () => {
    const event = await fixture('pr87-submitted-review.json');
    const threads = await fixture('pr87-review-threads.json');
    const findings = selectActionableFindings(threads, event.review.id, event.pull_request.head.sha);

    expect(findings).toEqual([
      expect.objectContaining({
        threadId: 'PRRT_kwDOTKm-F86WvxLA',
        commentId: 3722936525,
        priority: 'P2',
        path: 'apps/lab/src/components/LocalCdnBucketDialog.tsx',
        line: 104
      })
    ]);
    expect(
      decideIntake({
        event,
        livePullRequest: {
          state: 'open',
          head: {
            sha: event.pull_request.head.sha,
            ref: event.pull_request.head.ref,
            repo: { full_name: event.pull_request.head.repo.full_name }
          }
        },
        findings,
        childPullRequests: [],
        state: defaultLoopState()
      })
    ).toMatchObject({ shouldFix: true, reason: 'actionable_findings', attempt: 1, reviewId: 4867398051 });
  });

  it.each([
    ['stale review head', (input: IntakeFixture) => (input.livePullRequest.head.sha = 'a'.repeat(40)), 'stale_review_head'],
    [
      'changed live branch identity',
      (input: IntakeFixture) => (input.livePullRequest.head.ref = 'other-branch'),
      'live_head_identity_changed'
    ],
    ['fork PR', (input: IntakeFixture) => (input.event.pull_request.head.repo.full_name = 'someone/fork'), 'fork_pr'],
    ['non-leaf stack PR', (input: IntakeFixture) => input.childPullRequests.push({ number: 88 }), 'non_leaf_stack_pr'],
    ['attempt cap', (input: IntakeFixture) => (input.state.attempts = MAX_FIX_ATTEMPTS), 'attempt_cap_reached'],
    [
      'duplicate review',
      (input: IntakeFixture) => input.state.processedReviews.push({ reviewId: input.event.review.id }),
      'review_already_processed'
    ]
  ])('rejects a %s without changing the PR', async (_label, mutate, reason) => {
    const input = await intakeFixture();
    mutate(input);
    expect(decideIntake(input)).toEqual({ shouldFix: false, reason });
  });

  it('ignores resolved, outdated, wrong-review, wrong-head, non-Codex, and unprioritized threads', async () => {
    const event = await fixture('pr87-submitted-review.json');
    const [observed] = await fixture('pr87-review-threads.json');
    const variants = [
      { ...observed, isResolved: true },
      { ...observed, isOutdated: true },
      withRoot(observed, { pullRequestReview: { ...root(observed).pullRequestReview, databaseId: 123 } }),
      withRoot(observed, {
        pullRequestReview: { ...root(observed).pullRequestReview, commit: { oid: 'b'.repeat(40) } }
      }),
      withRoot(observed, { author: { login: 'someone-else' } }),
      withRoot(observed, { body: 'This has no actionable priority marker.' })
    ];
    expect(selectActionableFindings(variants, event.review.id, event.pull_request.head.sha)).toEqual([]);
  });

  it('accepts a clean current re-review as terminal even after the fix-attempt cap', async () => {
    const input = await intakeFixture();
    input.findings = [];
    input.state.attempts = MAX_FIX_ATTEMPTS;
    expect(decideIntake(input)).toEqual({ shouldFix: false, reason: 'no_current_actionable_findings' });
  });
});

describe('Codex review fix-loop status', () => {
  it('round-trips its bot-owned state marker while keeping the summary visible', () => {
    const state = {
      ...defaultLoopState(),
      attempts: 1,
      attempt: 2,
      status: 'generating',
      headSha: '479d10ce6d3ddd187f20ac59e44de4d37fe8a72b',
      reviewId: 4867398051,
      runUrl: 'https://github.com/pbroom/spfx-kit/actions/runs/123',
      summary: 'Generating one exact-head patch.'
    };
    const body = renderLoopStatus(state);
    expect(parseLoopState(body)).toEqual(state);
    expect(body).toContain('Fix attempts');
    expect(body).toContain('1/3');
    expect(body).toContain('The loop never merges.');
  });

  it('normalizes the connector actor and recognizes P0-P3 badge text', () => {
    expect(normalizeLogin('chatgpt-codex-connector[bot]')).toBe('chatgpt-codex-connector');
    expect(findingPriority('![P2 Badge](https://example.test/P2-yellow)')).toBe('P2');
    expect(findingPriority('[P0] critical')).toBe('P0');
    expect(findingPriority('ordinary comment')).toBeUndefined();
  });
});

describe('Codex review patch boundary', () => {
  it('accepts a small source-and-test patch', () => {
    expect(
      validatePatchMetadata([
        { path: 'apps/lab/server/apps-api.ts', additions: 12, deletions: 2, binary: false },
        { path: 'tests/local-cdn-admin-api.test.ts', additions: 18, deletions: 0, binary: false }
      ])
    ).toEqual({ files: 2, lines: 32 });
  });

  it.each([
    ['workflow', '.github/workflows/ci.yml', false],
    ['agent instructions', 'AGENTS.md', false],
    ['dependency lockfile', 'package-lock.json', false],
    ['binary', 'apps/lab/public/payload.bin', true],
    ['controller', 'scripts/codex-review-loop.mjs', false]
  ])('rejects a %s change', (_label, file, binary) => {
    expect(() => validatePatchMetadata([{ path: file, additions: 1, deletions: 0, binary }])).toThrow(/may not/);
  });

  it('inspects the actual staged git diff, not model-reported paths', async () => {
    const repo = await temporaryGitRepository();
    await writeFile(path.join(repo, 'src', 'value.ts'), 'export const value = 2;\n');
    await writeFile(path.join(repo, 'tests', 'value.test.ts'), 'expect(2).toBe(2);\n');
    git(repo, ['add', 'src/value.ts', 'tests/value.test.ts']);

    expect(inspectWorktree(repo)).toEqual({ files: 2, lines: 3 });
  });

  it('preserves byte-identical patch content across fresh indexed application', async () => {
    const repo = await temporaryGitRepository();
    const addedTest = path.join(repo, 'tests', 'value.test.ts');
    await writeFile(path.join(repo, 'src', 'value.ts'), 'export const value = 2;\n');
    await writeFile(addedTest, 'expect(2).toBe(2);\n');
    git(repo, ['add', '-N', '.']);
    const generated = gitOutput(repo, ['diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--', '.']);

    git(repo, ['reset', '--hard', '--quiet', 'HEAD']);
    await rm(addedTest, { force: true });
    execFileSync('git', ['apply', '--index', '--binary', '-'], {
      cwd: repo,
      input: generated,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    const validated = gitOutput(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--', '.']);

    expect(validated).toBe(generated);
  });

  it('rejects executable mode changes observed from git', () => {
    expect(() =>
      validatePatchMetadata(
        [{ path: 'scripts/example.mjs', additions: 1, deletions: 0, binary: false }],
        ['create mode 100755 scripts/example.mjs']
      )
    ).toThrow(/mode/);
  });
});

interface IntakeFixture {
  event: any;
  livePullRequest: { state: string; head: { sha: string; ref: string; repo: { full_name: string } } };
  findings: any[];
  childPullRequests: Array<{ number: number }>;
  state: ReturnType<typeof defaultLoopState>;
}

async function intakeFixture(): Promise<IntakeFixture> {
  const event = await fixture('pr87-submitted-review.json');
  const threads = await fixture('pr87-review-threads.json');
  return {
    event,
    livePullRequest: {
      state: 'open',
      head: {
        sha: event.pull_request.head.sha,
        ref: event.pull_request.head.ref,
        repo: { full_name: event.pull_request.head.repo.full_name }
      }
    },
    findings: selectActionableFindings(threads, event.review.id, event.pull_request.head.sha),
    childPullRequests: [],
    state: defaultLoopState()
  };
}

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));
}

function root(thread: any): any {
  return thread.comments.nodes[0];
}

function withRoot(thread: any, changes: Record<string, unknown>): any {
  return { ...thread, comments: { nodes: [{ ...root(thread), ...changes }] } };
}

async function temporaryGitRepository(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'spfx-kit-review-loop-'));
  temporaryDirectories.push(repo);
  await mkdir(path.join(repo, 'src'));
  await mkdir(path.join(repo, 'tests'));
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.name', 'Review Loop Test']);
  git(repo, ['config', 'user.email', 'review-loop@example.test']);
  await writeFile(path.join(repo, 'src', 'value.ts'), 'export const value = 1;\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '--quiet', '-m', 'fixture']);
  return repo;
}

function git(repo: string, args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
}

function gitOutput(repo: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}
