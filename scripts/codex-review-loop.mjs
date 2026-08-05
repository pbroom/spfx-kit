#!/usr/bin/env node

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CODEX_REVIEW_ACTOR = 'chatgpt-codex-connector';
export const MAX_FIX_ATTEMPTS = 3;
export const MAX_PATCH_FILES = 40;
export const MAX_PATCH_LINES = 4_000;
export const STATUS_MARKER = 'codex-review-fix-loop:v1';

const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);
const DISALLOWED_PATCH_PATHS = [
  /^\.github\//,
  /^\.codex\//,
  /^\.nvmrc$/,
  /(?:^|\/)AGENTS(?:\.override)?\.md$/,
  /(?:^|\/)CODEOWNERS$/,
  /(?:^|\/)SECURITY\.md$/,
  /(?:^|\/)\.gitmodules$/,
  /(?:^|\/)\.npmrc$/,
  /(?:^|\/)package(?:-lock)?\.json$/,
  /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/,
  /^eslint\.config\.[^/]+$/,
  /^playwright\.config\.[^/]+$/,
  /^turbo\.json$/,
  /^vitest\.config\.[^/]+$/,
  /^scripts\/(?:git-hooks|tests)\//,
  /^scripts\/codex-review-loop\.mjs$/,
  /^tests\/codex-review-loop\.test\.ts$/
];

function fail(message) {
  throw new Error(message);
}

export function normalizeLogin(login) {
  return String(login || '')
    .trim()
    .replace(/\[bot\]$/i, '')
    .toLowerCase();
}

export function findingPriority(body) {
  const match = String(body || '').match(/(?:badge[^\n]*|\[|\b)P([0-3])(?:\b|[-\]])/i);
  return match ? `P${match[1]}` : undefined;
}

export function defaultLoopState() {
  return {
    version: 1,
    attempts: 0,
    status: 'idle',
    headSha: '',
    reviewId: 0,
    attempt: 0,
    runUrl: '',
    summary: 'Waiting for an actionable Codex review.',
    processedReviews: []
  };
}

export function parseLoopState(body) {
  const match = String(body || '').match(
    new RegExp(`<!-- ${STATUS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)\\n-->`)
  );
  if (!match) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed?.version !== 1 || !Number.isInteger(parsed.attempts) || !Array.isArray(parsed.processedReviews)) {
      return undefined;
    }
    return { ...defaultLoopState(), ...parsed };
  } catch {
    return undefined;
  }
}

function statusLabel(status) {
  return (
    {
      blocked: 'Blocked',
      failed: 'Failed',
      generating: 'Generating a fix',
      idle: 'Idle',
      no_patch: 'Needs human attention',
      pushed: 'Fix pushed; awaiting re-review',
      push_failed: 'Push stopped safely',
      ready_for_human: 'Codex clean; human gates remain',
      skipped: 'Skipped safely',
      validation_failed: 'Validation failed'
    }[status] || status
  );
}

export function renderLoopStatus(state) {
  const safe = { ...defaultLoopState(), ...state };
  const machine = JSON.stringify(safe);
  const head = safe.headSha ? `\`${safe.headSha.slice(0, 12)}\`` : 'n/a';
  const run = safe.runUrl ? `[workflow run](${safe.runUrl})` : 'n/a';
  return `<!-- ${STATUS_MARKER}\n${machine}\n-->
## Codex review fix loop

| State | Head | Fix attempts | Run |
| --- | --- | ---: | --- |
| ${statusLabel(safe.status)} | ${head} | ${safe.attempts}/${MAX_FIX_ATTEMPTS} | ${run} |

${safe.summary}

The loop never merges. It only fast-forwards the current same-repository leaf PR head after the generated patch passes the repository's build, test, browser, package, public, and security gates.
`;
}

export function selectActionableFindings(reviewThreads, reviewId, headSha) {
  const findings = [];
  for (const thread of reviewThreads || []) {
    if (thread?.isResolved || thread?.isOutdated) {
      continue;
    }
    const root = thread?.comments?.nodes?.[0];
    const priority = findingPriority(root?.body);
    const commentReviewId = Number(root?.pullRequestReview?.databaseId || 0);
    const commentCommit = root?.pullRequestReview?.commit?.oid || '';
    if (
      normalizeLogin(root?.author?.login) !== CODEX_REVIEW_ACTOR ||
      commentReviewId !== Number(reviewId) ||
      commentCommit !== headSha ||
      !priority
    ) {
      continue;
    }
    findings.push({
      threadId: thread.id,
      commentId: Number(root.databaseId),
      path: thread.path || root.path || '',
      line: Number(thread.line || root.line || 0),
      priority,
      body: root.body
    });
  }
  return findings;
}

export function decideIntake({ event, livePullRequest, findings, childPullRequests, state }) {
  const pr = event?.pull_request;
  const review = event?.review;
  const currentState = state || defaultLoopState();
  const headSha = pr?.head?.sha || '';
  const reviewId = Number(review?.id || 0);

  if (event?.action !== 'submitted' || String(review?.state || '').toLowerCase() !== 'commented') {
    return { shouldFix: false, reason: 'not_submitted_comment_review' };
  }
  if (normalizeLogin(review?.user?.login) !== CODEX_REVIEW_ACTOR) {
    return { shouldFix: false, reason: 'untrusted_review_actor' };
  }
  if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(String(pr?.author_association || '').toUpperCase())) {
    return { shouldFix: false, reason: 'untrusted_pr_author' };
  }
  if (pr?.draft || String(livePullRequest?.state || '').toLowerCase() !== 'open') {
    return { shouldFix: false, reason: 'pr_not_open_for_review' };
  }
  if (!pr?.head?.repo?.full_name || pr.head.repo.full_name !== event?.repository?.full_name) {
    return { shouldFix: false, reason: 'fork_pr' };
  }
  if (livePullRequest?.head?.repo?.full_name !== event.repository.full_name || livePullRequest?.head?.ref !== pr.head.ref) {
    return { shouldFix: false, reason: 'live_head_identity_changed' };
  }
  if (!headSha || livePullRequest.head.sha !== headSha || review?.commit_id !== headSha) {
    return { shouldFix: false, reason: 'stale_review_head' };
  }
  if ((childPullRequests || []).length > 0) {
    return { shouldFix: false, reason: 'non_leaf_stack_pr' };
  }
  if ((currentState.processedReviews || []).some((entry) => Number(entry.reviewId) === reviewId)) {
    return { shouldFix: false, reason: 'review_already_processed' };
  }
  if (!findings?.length) {
    return { shouldFix: false, reason: 'no_current_actionable_findings' };
  }
  if (currentState.attempts >= MAX_FIX_ATTEMPTS) {
    return { shouldFix: false, reason: 'attempt_cap_reached' };
  }
  return {
    shouldFix: true,
    reason: 'actionable_findings',
    attempt: currentState.attempts + 1,
    headSha,
    reviewId,
    findings
  };
}

export function validatePatchMetadata(entries, summaries = []) {
  if (!entries.length) {
    fail('Codex produced no patch.');
  }
  if (entries.length > MAX_PATCH_FILES) {
    fail(`Patch changes ${entries.length} files; the limit is ${MAX_PATCH_FILES}.`);
  }
  let totalLines = 0;
  for (const entry of entries) {
    const normalized = String(entry.path || '').replaceAll('\\', '/');
    if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
      fail(`Unsafe patch path: ${entry.path}`);
    }
    if (DISALLOWED_PATCH_PATHS.some((pattern) => pattern.test(normalized))) {
      fail(`Automated fixes may not change control-plane file: ${normalized}`);
    }
    if (entry.binary) {
      fail(`Automated fixes may not add or modify binary file: ${normalized}`);
    }
    totalLines += entry.additions + entry.deletions;
  }
  if (totalLines > MAX_PATCH_LINES) {
    fail(`Patch changes ${totalLines} lines; the limit is ${MAX_PATCH_LINES}.`);
  }
  for (const summary of summaries) {
    if (/\b(?:mode change|(?:create|delete) mode (?:100755|120000)|Subproject commit)\b/i.test(summary)) {
      fail(`Automated fixes may not change executable modes, symlinks, or submodules: ${summary}`);
    }
  }
  return { files: entries.length, lines: totalLines };
}

function runGit(repo, args, options = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: options.encoding || 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

export function inspectWorktree(repo) {
  const nameStatus = runGit(repo, ['diff', '--cached', '--name-status', '-z']);
  const numstat = runGit(repo, ['diff', '--cached', '--numstat', '-z']);
  const summaries = runGit(repo, ['diff', '--cached', '--summary'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const statuses = nameStatus.split('\0').filter(Boolean);
  const stats = numstat.split('\0').filter(Boolean);
  const entries = [];

  for (let index = 0; index < statuses.length; index += 2) {
    const status = statuses[index];
    const file = statuses[index + 1];
    if (!status || !file) {
      fail('Could not parse staged patch paths.');
    }
    if (/^[RC]/.test(status)) {
      fail(`Automated fixes may not rename or copy files: ${file}`);
    }
  }

  for (const record of stats) {
    const match = record.match(/^(\d+|-)\t(\d+|-)\t([\s\S]+)$/);
    if (!match) {
      fail(`Could not parse patch statistics: ${record}`);
    }
    const file = match[3];
    const fullPath = path.join(repo, file);
    const fileStats = existsSync(fullPath) ? lstatSync(fullPath) : undefined;
    entries.push({
      path: file,
      additions: match[1] === '-' ? 0 : Number(match[1]),
      deletions: match[2] === '-' ? 0 : Number(match[2]),
      binary: match[1] === '-' || match[2] === '-',
      symlink: fileStats?.isSymbolicLink() || false
    });
    if (fileStats?.isSymbolicLink()) {
      fail(`Automated fixes may not create or modify symlinks: ${file}`);
    }
  }
  return validatePatchMetadata(entries, summaries);
}

function apiBase() {
  return process.env.GITHUB_API_URL || 'https://api.github.com';
}

function repositoryName() {
  const value = process.env.GITHUB_REPOSITORY || '';
  const [owner, repo] = value.split('/');
  if (!owner || !repo) {
    fail('GITHUB_REPOSITORY must be owner/name.');
  }
  return { owner, repo, fullName: value };
}

async function githubRequest(endpoint, { method = 'GET', body } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    fail('GITHUB_TOKEN is required.');
  }
  const response = await fetch(`${apiBase()}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000);
    fail(`GitHub API ${method} ${endpoint} failed (${response.status}): ${detail}`);
  }
  return response.status === 204 ? undefined : response.json();
}

async function githubGraphql(query, variables) {
  const result = await githubRequest('/graphql', { method: 'POST', body: { query, variables } });
  if (result.errors?.length) {
    fail(`GitHub GraphQL failed: ${result.errors.map((entry) => entry.message).join('; ')}`);
  }
  return result.data;
}

async function issueComments(prNumber) {
  const { owner, repo } = repositoryName();
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`);
    comments.push(...batch);
    if (batch.length < 100) {
      return comments;
    }
  }
  fail('Issue comment pagination exceeded the guarded 1,000-comment limit.');
}

async function openChildPullRequests(owner, repo, headRef) {
  const children = await githubRequest(
    `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(headRef)}&per_page=100`
  );
  if (children.length === 100) {
    fail('Child pull-request pagination reached the guarded limit.');
  }
  return children;
}

function statusCommentFrom(comments) {
  const matches = [];
  for (const comment of comments || []) {
    if (normalizeLogin(comment?.user?.login) !== 'github-actions' || !String(comment.body || '').includes(STATUS_MARKER)) {
      continue;
    }
    const state = parseLoopState(comment.body);
    if (state) {
      matches.push({ id: comment.id, state });
    }
  }
  if (matches.length > 1) {
    fail('Multiple bot-owned loop status markers exist; refusing to reset deduplication or attempt state.');
  }
  if (matches.length === 1) {
    return matches[0];
  }
  return { id: undefined, state: defaultLoopState() };
}

async function upsertStatus(prNumber, commentId, state) {
  const { owner, repo } = repositoryName();
  const body = renderLoopStatus(state);
  if (commentId) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${commentId}`, { method: 'PATCH', body: { body } });
    return commentId;
  }
  const created = await githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body }
  });
  return created.id;
}

function runUrl() {
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY || '';
  const id = process.env.GITHUB_RUN_ID || '';
  return id ? `${server}/${repo}/actions/runs/${id}` : '';
}

async function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  await appendFile(process.env.GITHUB_OUTPUT, `${lines}\n`);
}

async function fetchReviewThreads(owner, repo, prNumber) {
  const data = await githubGraphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              id isResolved isOutdated path line
              comments(first: 50) {
                pageInfo { hasNextPage }
                nodes {
                  databaseId body path line
                  author { login }
                  pullRequestReview { databaseId commit { oid } }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo, number: prNumber }
  );
  const threads = data.repository.pullRequest.reviewThreads;
  if (threads.pageInfo.hasNextPage || threads.nodes.some((thread) => thread.comments.pageInfo.hasNextPage)) {
    fail('Review thread pagination exceeded the guarded intake limit.');
  }
  return threads.nodes;
}

async function resolvePreviouslyFixedThreads(reviewThreads, state) {
  const fixedThreadIds = new Set(
    (state.processedReviews || []).filter((entry) => entry.result === 'pushed').flatMap((entry) => entry.threadIds || [])
  );
  const resolvable = (reviewThreads || []).filter(
    (thread) => fixedThreadIds.has(thread.id) && thread.isOutdated && !thread.isResolved
  );
  for (const thread of resolvable) {
    await githubGraphql(
      `mutation($threadId: ID!) {
        resolveReviewThread(input: {threadId: $threadId}) {
          thread { id isResolved }
        }
      }`,
      { threadId: thread.id }
    );
  }
  return resolvable.length;
}

function summarizeReason(reason) {
  return (
    {
      attempt_cap_reached: `Stopped after ${MAX_FIX_ATTEMPTS} accepted fixer attempts. A human must inspect the remaining feedback.`,
      fork_pr: 'Skipped because automated writes are restricted to same-repository pull requests.',
      no_current_actionable_findings: 'No unresolved, current P0-P3 findings belonged to this exact Codex review and head.',
      live_head_identity_changed: 'Skipped because the live pull-request branch identity no longer matches the event.',
      non_leaf_stack_pr:
        'Skipped because another open PR is based on this branch. Fix the leaf first to avoid rewriting a Graphite stack.',
      pr_not_open_for_review: 'Skipped because the pull request is closed or draft.',
      review_already_processed: 'This exact Codex review event was already processed.',
      stale_review_head: 'Skipped because the reviewed commit is no longer the pull request head.',
      untrusted_pr_author: 'Skipped because the pull request author is not a trusted repository collaborator.',
      untrusted_review_actor: 'Skipped because the review was not submitted by the configured Codex connector.'
    }[reason] || 'The event did not qualify for an automated fix.'
  );
}

async function intake(args) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const { owner, repo } = repositoryName();
  const prNumber = Number(event.pull_request?.number || 0);
  if (!prNumber) {
    fail('Event does not contain a pull request number.');
  }
  const [livePullRequest, childPullRequests, comments, threads] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`),
    openChildPullRequests(owner, repo, event.pull_request.head.ref),
    issueComments(prNumber),
    fetchReviewThreads(owner, repo, prNumber)
  ]);
  const status = statusCommentFrom(comments);
  const findings = selectActionableFindings(threads, event.review.id, event.pull_request.head.sha);
  const decision = decideIntake({ event, livePullRequest, findings, childPullRequests, state: status.state });
  const output = {
    should_fix: decision.shouldFix ? 'true' : 'false',
    reason: decision.reason,
    pr_number: prNumber,
    head_sha: event.pull_request.head.sha,
    head_ref: event.pull_request.head.ref,
    review_id: Number(event.review.id),
    attempt: decision.attempt || status.state.attempts + 1,
    finding_count: findings.length
  };

  if (!decision.shouldFix) {
    if (decision.reason === 'no_current_actionable_findings') {
      const resolvedCount = await resolvePreviouslyFixedThreads(threads, status.state);
      const processedReviews = [
        ...(status.state.processedReviews || []).filter((entry) => Number(entry.reviewId) !== Number(event.review.id)),
        {
          reviewId: Number(event.review.id),
          headSha: event.pull_request.head.sha,
          attempt: status.state.attempts,
          result: 'clean',
          at: new Date().toISOString()
        }
      ].slice(-20);
      await upsertStatus(prNumber, status.id, {
        ...status.state,
        status: 'ready_for_human',
        headSha: event.pull_request.head.sha,
        reviewId: Number(event.review.id),
        attempt: status.state.attempts,
        runUrl: runUrl(),
        summary: `Codex submitted a current review with no unresolved P0-P3 findings.${
          resolvedCount
            ? ` Resolved ${resolvedCount} previously fixed, now-outdated Codex thread${resolvedCount === 1 ? '' : 's'}.`
            : ''
        } Human approval and all repository protections still apply.`,
        processedReviews
      });
      await writeOutputs(output);
      return output;
    }
    if (
      ['attempt_cap_reached', 'live_head_identity_changed', 'non_leaf_stack_pr', 'stale_review_head'].includes(decision.reason)
    ) {
      await upsertStatus(prNumber, status.id, {
        ...status.state,
        status: 'skipped',
        headSha: event.pull_request.head.sha,
        reviewId: Number(event.review.id),
        runUrl: runUrl(),
        summary: summarizeReason(decision.reason)
      });
    }
    await writeOutputs(output);
    return output;
  }

  const templatePath = requiredArgument(args, '--template');
  const promptOut = requiredArgument(args, '--prompt-out');
  const template = await readFile(templatePath, 'utf8');
  const findingText = findings
    .map(
      (finding, index) => `### Finding ${index + 1}: ${finding.priority} in ${finding.path}:${finding.line || '?'}

<review-finding>
${finding.body}
</review-finding>`
    )
    .join('\n\n');
  await writeFile(
    promptOut,
    `${template.trim()}\n\n## Fixed task identity\n\n- Pull request: #${prNumber}\n- Exact head: ${decision.headSha}\n- Review: ${decision.reviewId}\n- Attempt: ${decision.attempt}/${MAX_FIX_ATTEMPTS}\n\n## Untrusted review evidence\n\n${findingText}\n`
  );
  await upsertStatus(prNumber, status.id, {
    ...status.state,
    attempts: decision.attempt,
    status: 'generating',
    headSha: decision.headSha,
    reviewId: decision.reviewId,
    attempt: decision.attempt,
    runUrl: runUrl(),
    summary: `Generating a minimal patch for ${findings.length} current finding${findings.length === 1 ? '' : 's'} at the exact reviewed head. This reserved fix attempt ${decision.attempt}/${MAX_FIX_ATTEMPTS}.`,
    processedReviews: [
      ...(status.state.processedReviews || []).filter((entry) => Number(entry.reviewId) !== decision.reviewId),
      {
        reviewId: decision.reviewId,
        headSha: decision.headSha,
        attempt: decision.attempt,
        result: 'accepted',
        threadIds: findings.map((finding) => finding.threadId),
        at: new Date().toISOString()
      }
    ].slice(-20)
  });
  await writeOutputs(output);
  return output;
}

async function verifyHead(args) {
  const prNumber = Number(requiredArgument(args, '--pr'));
  const expected = requiredArgument(args, '--head');
  const expectedRef = requiredArgument(args, '--ref');
  const reviewId = Number(requiredArgument(args, '--review'));
  const { owner, repo } = repositoryName();
  const [live, childPullRequests, reviewThreads] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`),
    openChildPullRequests(owner, repo, expectedRef),
    fetchReviewThreads(owner, repo, prNumber)
  ]);
  const findings = selectActionableFindings(reviewThreads, reviewId, expected);
  if (
    live.state !== 'open' ||
    live.draft ||
    !TRUSTED_AUTHOR_ASSOCIATIONS.has(String(live.author_association || '').toUpperCase()) ||
    live.head?.repo?.full_name !== `${owner}/${repo}` ||
    live.head?.ref !== expectedRef ||
    live.head?.sha !== expected ||
    childPullRequests.length > 0 ||
    findings.length === 0
  ) {
    fail(`Pull request #${prNumber} is no longer the same exact eligible leaf head with current findings.`);
  }
  return live;
}

async function dispatchCi(args) {
  const ref = requiredArgument(args, '--ref');
  const { owner, repo } = repositoryName();
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/ci.yml/dispatches`, {
    method: 'POST',
    body: { ref }
  });
}

async function publishCheck(args) {
  const head = requiredArgument(args, '--head');
  const { owner, repo } = repositoryName();
  await githubRequest(`/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    body: {
      name: 'Codex guarded validation',
      head_sha: head,
      status: 'completed',
      conclusion: 'success',
      details_url: runUrl(),
      output: {
        title: 'Generated patch passed all guarded validation jobs',
        summary:
          'The exact patch now committed at this head passed the build-before-test core suite, Lab browser/CDN acceptance, SPFx canary packaging, public repository guard, and security gates before publication.'
      }
    }
  });
}

function resultStatus(environment) {
  if (environment.GENERATE_RESULT !== 'success') {
    return [
      'failed',
      'Patch generation did not complete. Confirm the `OPENAI_API_KEY` Actions secret exists and inspect the workflow run.'
    ];
  }
  if (environment.HAS_PATCH !== 'true') {
    return ['no_patch', 'Codex did not produce a bounded patch. A human should inspect the finding and the model output.'];
  }
  const validationResults = [environment.CORE_RESULT, environment.E2E_RESULT, environment.SPFX_RESULT];
  if (validationResults.some((value) => value !== 'success')) {
    return ['validation_failed', 'The generated patch was not pushed because one or more secretless validation jobs failed.'];
  }
  if (!environment.PUSHED_SHA) {
    return ['push_failed', 'The validated patch was not published. The head may have moved; no user commit was overwritten.'];
  }
  const followUps = [];
  if (environment.CHECK_RESULT !== 'success') {
    followUps.push('The exact-head validation check could not be recorded; inspect the workflow run.');
  }
  if (environment.CI_DISPATCH_RESULT !== 'success') {
    followUps.push(
      'The optional CI dispatch did not start (older stacked branches may not yet contain the manual trigger); the pre-push guarded suites still validated these exact patch bytes.'
    );
  }
  return [
    'pushed',
    `Pushed validated fix \`${environment.PUSHED_SHA.slice(0, 12)}\` with an exact-head lease. Native Codex review is configured to run again on this push.${followUps.length ? ` ${followUps.join(' ')}` : ' Exact-head validation was recorded and CI was dispatched.'}`
  ];
}

async function report() {
  const prNumber = Number(process.env.PR_NUMBER || 0);
  const reviewId = Number(process.env.REVIEW_ID || 0);
  const attempt = Number(process.env.ATTEMPT || 0);
  if (!prNumber || !reviewId || !attempt) {
    return;
  }
  const comments = await issueComments(prNumber);
  const status = statusCommentFrom(comments);
  const [result, summary] = resultStatus(process.env);
  const accepted = (status.state.processedReviews || []).find((entry) => Number(entry.reviewId) === reviewId);
  const processedReviews = [
    ...(status.state.processedReviews || []).filter((entry) => Number(entry.reviewId) !== reviewId),
    {
      ...accepted,
      reviewId,
      headSha: process.env.HEAD_SHA || '',
      attempt,
      result,
      at: new Date().toISOString()
    }
  ].slice(-20);
  await upsertStatus(prNumber, status.id, {
    ...status.state,
    attempts: Math.max(status.state.attempts, attempt),
    status: result,
    headSha: process.env.PUSHED_SHA || process.env.HEAD_SHA || '',
    reviewId,
    attempt,
    runUrl: runUrl(),
    summary,
    processedReviews
  });
}

function requiredArgument(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'intake') {
    await intake(args);
  } else if (command === 'inspect-worktree') {
    const result = inspectWorktree(requiredArgument(args, '--repo'));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (command === 'verify-head') {
    await verifyHead(args);
  } else if (command === 'dispatch-ci') {
    await dispatchCi(args);
  } else if (command === 'publish-check') {
    await publishCheck(args);
  } else if (command === 'report') {
    await report();
  } else {
    fail(`Unknown command: ${command || '(missing)'}`);
  }
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
