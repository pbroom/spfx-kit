import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingPriority } from './codex-review-priority.mjs';

export const CODEX_REVIEW_ACTOR = 'chatgpt-codex-connector';
export const CODEX_REVIEW_ACTOR_ID = 199175422;

const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);

export function parseRepository(value) {
  const match = String(value || '').match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error('--repo must be an owner/repository name.');
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

export function priority(body) {
  return findingPriority(body);
}

export function currentFindings(threads, reviewId, headSha) {
  return (threads || [])
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .map((thread) => ({ thread, comment: thread.comments?.nodes?.[0] }))
    .filter(({ comment }) => {
      return (
        comment &&
        priority(comment.body) &&
        String(comment.author?.login || '').replace(/\[bot\]$/i, '') === CODEX_REVIEW_ACTOR &&
        Number(comment.pullRequestReview?.databaseId) === reviewId &&
        comment.pullRequestReview?.commit?.oid === headSha
      );
    })
    .map(({ thread, comment }) => ({
      threadId: thread.id,
      commentId: Number(comment.databaseId),
      path: thread.path || comment.path || '',
      line: Number(thread.line || comment.line || 0),
      priority: priority(comment.body),
      body: comment.body
    }));
}

export function validateHandoff({ repository, pullRequest, review, findings, expectedHead }) {
  if (
    pullRequest?.state !== 'open' ||
    pullRequest?.draft ||
    pullRequest?.head?.repo?.full_name !== repository.fullName ||
    pullRequest?.head?.sha !== expectedHead ||
    !TRUSTED_AUTHOR_ASSOCIATIONS.has(String(pullRequest?.author_association || '').toUpperCase()) ||
    String(review?.state || '').toLowerCase() !== 'commented' ||
    review?.commit_id !== expectedHead ||
    String(review?.user?.login || '').replace(/\[bot\]$/i, '') !== CODEX_REVIEW_ACTOR ||
    Number(review?.user?.id) !== CODEX_REVIEW_ACTOR_ID ||
    review?.user?.type !== 'Bot' ||
    !findings.length
  ) {
    throw new Error('Review is stale, untrusted, or no longer has current actionable Codex P0-P3 findings.');
  }
  return {
    prNumber: Number(pullRequest.number),
    reviewId: Number(review.id),
    headSha: expectedHead,
    headRef: pullRequest.head.ref,
    findings
  };
}

function required(args, flag) {
  const value = args[args.indexOf(flag) + 1];
  if (!value) throw new Error(`${flag} is required.`);
  return value;
}

async function request(repository, endpoint) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!response.ok) throw new Error(`GitHub API ${endpoint} failed (${response.status}).`);
  return response.json();
}

async function reviewThreads(repository, prNumber) {
  const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{id isResolved isOutdated path line comments(first:50){pageInfo{hasNextPage} nodes{databaseId body path line author{login} pullRequestReview{databaseId commit{oid}}}}}}}}}`;
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ query, variables: { owner: repository.owner, repo: repository.repo, number: prNumber } })
  });
  if (!response.ok) throw new Error(`GitHub GraphQL review-thread request failed (${response.status}).`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(`GitHub GraphQL failed: ${result.errors.map((entry) => entry.message).join('; ')}`);
  const threads = result.data.repository.pullRequest.reviewThreads;
  if (threads.pageInfo.hasNextPage || threads.nodes.some((thread) => thread.comments.pageInfo.hasNextPage)) {
    throw new Error('Review-thread pagination exceeded the 100-thread/50-comment safety limit.');
  }
  return threads.nodes;
}

async function main() {
  const args = process.argv.slice(2);
  const repository = parseRepository(required(args, '--repo'));
  const prNumber = Number(required(args, '--pr'));
  const reviewId = Number(required(args, '--review'));
  const headSha = required(args, '--head');
  if (!Number.isSafeInteger(prNumber) || !Number.isSafeInteger(reviewId) || !/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error('--pr and --review must be positive integers and --head must be a 40-character SHA.');
  }
  const [pullRequest, review, threads] = await Promise.all([
    request(repository, `/repos/${repository.fullName}/pulls/${prNumber}`),
    request(repository, `/repos/${repository.fullName}/pulls/${prNumber}/reviews/${reviewId}`),
    reviewThreads(repository, prNumber)
  ]);
  const findings = currentFindings(threads, reviewId, headSha);
  process.stdout.write(
    `${JSON.stringify(validateHandoff({ repository, pullRequest, review, findings, expectedHead: headSha }))}\n`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
