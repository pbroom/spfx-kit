#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingPriority } from './codex-review-priority.mjs';

export const AUDIT_KIND = 'pbroom.spfx-kit.pr-review-audit';
export const AUDIT_SCHEMA_VERSION = 1;
export const AUDIT_API_VERSION = '2022-11-28';
export const AUDIT_PROOF_KIND = 'pbroom.spfx-kit.pr-review-audit-proof';
export const DEFAULT_MAX_AGE_SECONDS = 300;
export const AUDIT_SCHEMA_V1_MAX_AGE_SECONDS = 3_600;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGES = 10_000;
export const GITHUB_API_URL = 'https://api.github.com';

const CODEX_REVIEW_ACTOR = 'chatgpt-codex-connector';

export class AuditIncompleteError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AuditIncompleteError';
    this.details = details;
  }
}

function fail(message, details = {}) {
  throw new AuditIncompleteError(message, details);
}

export function parseRepository(value) {
  const match = String(value || '').match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) fail('--repo must be an owner/repository name.', { phase: 'arguments' });
  return { owner: match[1], repo: match[2], nameWithOwner: `${match[1]}/${match[2]}` };
}

function normalizeLogin(login) {
  return String(login || '')
    .trim()
    .replace(/\[bot\]$/i, '')
    .toLowerCase();
}

function sameRepositoryIdentity(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function digestableRecord(record) {
  return {
    ...record,
    integrity: {
      algorithm: 'sha256'
    }
  };
}

export function addIntegrity(record) {
  return {
    ...record,
    integrity: {
      algorithm: 'sha256',
      digest: sha256(canonicalJson(digestableRecord(record)))
    }
  };
}

function apiIdentity(value) {
  if (!value || !Number.isSafeInteger(Number(value.id)) || !String(value.login || '')) {
    fail('GitHub authentication response did not identify a user.', { phase: 'authentication' });
  }
  return {
    id: Number(value.id),
    login: String(value.login),
    type: String(value.type || '')
  };
}

function actor(value, context) {
  if (!value) return null;
  if (!Number.isSafeInteger(Number(value.id)) || !String(value.login || '') || !String(value.type || '')) {
    fail(`${context} actor identity was incomplete.`, { phase: 'normalize', collection: context });
  }
  return {
    id: Number(value.id),
    login: String(value.login),
    type: String(value.type)
  };
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function requireInteger(value, context) {
  if (!Number.isSafeInteger(Number(value))) {
    fail(`${context} integer was missing or invalid.`, { phase: 'normalize', collection: context });
  }
  return Number(value);
}

function requireString(value, context) {
  if (typeof value !== 'string' || !value) {
    fail(`${context} string was missing or invalid.`, { phase: 'normalize', collection: context });
  }
  return value;
}

function requireBody(value, context) {
  if (value !== null && typeof value !== 'string') {
    fail(`${context} body was missing or invalid.`, { phase: 'normalize', collection: context });
  }
  return value;
}

function requireTimestamp(value, context, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
    fail(`${context} timestamp was missing or invalid.`, { phase: 'normalize', collection: context });
  }
  return value;
}

function refIdentity(value, label) {
  if (!value || !/^[0-9a-f]{40}$/i.test(String(value.sha || '')) || !String(value.ref || '')) {
    fail(`Pull request ${label} identity was incomplete.`, { phase: 'normalize', collection: label });
  }
  return {
    oid: String(value.sha),
    refName: String(value.ref),
    repository: value.repo?.full_name ? String(value.repo.full_name) : null
  };
}

function inventoryEntry(value) {
  if (
    !value ||
    !Number.isSafeInteger(Number(value.number)) ||
    Number(value.number) < 1 ||
    typeof value.draft !== 'boolean' ||
    String(value.state || '').toLowerCase() !== 'open' ||
    typeof value.updated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.updated_at))
  ) {
    fail('Open pull-request inventory contained an invalid entry.', { phase: 'inventory' });
  }
  return {
    number: Number(value.number),
    state: 'OPEN',
    isDraft: value.draft,
    updatedAt: String(value.updated_at),
    head: refIdentity(value.head, 'head'),
    base: refIdentity(value.base, 'base')
  };
}

function inventoryFingerprint(entries) {
  return `sha256:${sha256(canonicalJson(entries))}`;
}

function ensureUnique(items, key, context) {
  const seen = new Map();
  for (const item of items) {
    const identifier = key(item);
    if (identifier === undefined || identifier === null || identifier === '') {
      fail(`${context} contained an item without an identifier.`, { phase: 'normalize', collection: context });
    }
    const encoded = canonicalJson(item);
    if (seen.has(identifier)) {
      fail(`${context} contained duplicate ${identifier}.`, {
        phase: 'normalize',
        collection: context
      });
    }
    seen.set(identifier, encoded);
  }
  return [...seen.values()].map((encoded) => JSON.parse(encoded));
}

function numericSort(items) {
  return items.sort((left, right) => Number(left.id) - Number(right.id));
}

function databaseIdSort(items) {
  return items.sort((left, right) => {
    const comparison = BigInt(left.id) - BigInt(right.id);
    return comparison < 0n ? -1 : comparison > 0n ? 1 : 0;
  });
}

function nodeSort(items) {
  return items.sort((left, right) => (String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0));
}

function parseLinkHeader(value, currentUrl, apiUrl) {
  if (!value) return undefined;
  const links = new Map();
  for (const part of value.split(',')) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (!match) fail('GitHub REST pagination returned an invalid Link header.', { phase: 'pagination' });
    links.set(match[2], match[1]);
  }
  const next = links.get('next');
  if (!next) return undefined;
  const resolved = new URL(next, currentUrl);
  const expected = new URL(apiUrl);
  const expectedPath = expected.pathname.replace(/\/$/, '');
  const hasExpectedPath = !expectedPath || resolved.pathname === expectedPath || resolved.pathname.startsWith(`${expectedPath}/`);
  if (resolved.origin !== expected.origin || !hasExpectedPath) {
    fail('GitHub REST pagination attempted to leave the configured API origin.', { phase: 'pagination' });
  }
  return resolved.toString();
}

function createGithubClient({ token, apiUrl, fetchImpl }) {
  let requestCount = 0;
  const baseUrl = String(apiUrl || GITHUB_API_URL).replace(/\/$/, '');
  if (baseUrl !== GITHUB_API_URL) {
    fail(`Audit API origin must be ${GITHUB_API_URL}.`, { phase: 'arguments' });
  }

  async function request(endpoint, { method = 'GET', body, context = {} } = {}) {
    if (method !== 'GET' && !(method === 'POST' && endpoint === '/graphql')) {
      fail(`Audit attempted disallowed GitHub API method ${method}.`, { phase: 'request', ...context });
    }
    const url = /^https?:\/\//.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`;
    requestCount += 1;
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': AUDIT_API_VERSION
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      fail(`GitHub API request failed before receiving a response: ${error instanceof Error ? error.message : error}`, {
        phase: 'request',
        endpoint: new URL(url).pathname,
        ...context
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response?.ok) {
      const detail = String(await response?.text().catch(() => '')).slice(0, 1_000);
      fail(`GitHub API ${method} ${new URL(url).pathname} failed (${response?.status ?? 'no status'}): ${detail}`, {
        phase: 'request',
        endpoint: new URL(url).pathname,
        status: response?.status ?? null,
        ...context
      });
    }
    let data;
    try {
      data = await response.json();
    } catch {
      fail(`GitHub API ${method} ${new URL(url).pathname} returned invalid JSON.`, {
        phase: 'response',
        endpoint: new URL(url).pathname,
        ...context
      });
    }
    return { data, headers: response.headers, url };
  }

  async function restPages(endpoint, context) {
    const values = [];
    const seenUrls = new Set();
    let next = endpoint;
    let pages = 0;
    while (next) {
      if (pages >= MAX_PAGES) fail('GitHub REST pagination exceeded its safety limit.', context);
      const absolute = /^https?:\/\//.test(next) ? next : `${baseUrl}${next}`;
      if (seenUrls.has(absolute)) fail('GitHub REST pagination repeated a page URL.', context);
      seenUrls.add(absolute);
      const response = await request(next, { context: { ...context, page: pages + 1 } });
      if (!Array.isArray(response.data)) {
        fail('GitHub REST collection response was not an array.', { ...context, page: pages + 1 });
      }
      values.push(...response.data);
      pages += 1;
      next = parseLinkHeader(response.headers?.get?.('link'), response.url, baseUrl);
    }
    return { values, pages };
  }

  async function graphql(query, variables, context) {
    const response = await request('/graphql', {
      method: 'POST',
      body: { query, variables },
      context
    });
    if (!response.data || typeof response.data !== 'object') {
      fail('GitHub GraphQL response was not an object.', { phase: 'graphql', ...context });
    }
    if (Array.isArray(response.data.errors) && response.data.errors.length > 0) {
      fail(`GitHub GraphQL returned errors: ${response.data.errors.map((entry) => entry.message).join('; ')}`, {
        phase: 'graphql',
        ...context
      });
    }
    if (!response.data.data || typeof response.data.data !== 'object') {
      fail('GitHub GraphQL response omitted data.', { phase: 'graphql', ...context });
    }
    return response.data.data;
  }

  return {
    graphql,
    request,
    restPages,
    requestCount: () => requestCount
  };
}

function collection(values, pages) {
  return { complete: true, count: values.length, pages, values };
}

function normalizeReview(value) {
  if (
    !value ||
    !String(value.node_id || '') ||
    !String(value.state || '') ||
    !Object.hasOwn(value, 'body') ||
    !Object.hasOwn(value, 'commit_id') ||
    !Object.hasOwn(value, 'submitted_at')
  ) {
    fail('Review response was incomplete.', { phase: 'normalize', collection: 'reviews' });
  }
  if (value.commit_id !== null && (typeof value.commit_id !== 'string' || !/^[0-9a-f]{40}$/i.test(value.commit_id))) {
    fail('Review commit identity was invalid.', { phase: 'normalize', collection: 'reviews' });
  }
  if (!Number.isSafeInteger(value.id) || value.id < 1) {
    fail('Review ID was invalid.', { phase: 'normalize', collection: 'reviews' });
  }
  const id = value.id;
  return {
    id,
    nodeId: requireString(value.node_id, 'review node id'),
    state: requireString(value.state, 'review state'),
    body: requireBody(value.body, 'review'),
    commitId: value.commit_id,
    submittedAt: requireTimestamp(value.submitted_at, 'review submittedAt', { nullable: true }),
    authorAssociation: String(value.author_association || ''),
    author: actor(value.user, 'review')
  };
}

function normalizeIssueComment(value) {
  if (!value || !Object.hasOwn(value, 'body')) {
    fail('Issue-comment response was incomplete.', { phase: 'normalize', collection: 'issueComments' });
  }
  return {
    id: requireInteger(value.id, 'issue comment id'),
    nodeId: requireString(value.node_id, 'issue comment node id'),
    url: requireString(value.html_url, 'issue comment URL'),
    body: requireBody(value.body, 'issue comment'),
    createdAt: requireTimestamp(value.created_at, 'issue comment createdAt'),
    updatedAt: requireTimestamp(value.updated_at, 'issue comment updatedAt'),
    authorAssociation: String(value.author_association || ''),
    author: actor(value.user, 'issue comment')
  };
}

function normalizeReviewComment(value) {
  if (!value || !Object.hasOwn(value, 'body')) {
    fail('Review-comment response was incomplete.', { phase: 'normalize', collection: 'reviewComments' });
  }
  return {
    id: requireInteger(value.id, 'review comment id'),
    nodeId: requireString(value.node_id, 'review comment node id'),
    pullRequestReviewId: requireInteger(value.pull_request_review_id, 'review comment review id'),
    inReplyToId: optionalInteger(value.in_reply_to_id),
    url: requireString(value.html_url, 'review comment URL'),
    body: requireBody(value.body, 'review comment'),
    path: requireString(value.path, 'review comment path'),
    line: optionalInteger(value.line),
    startLine: optionalInteger(value.start_line),
    side: value.side ? String(value.side) : null,
    startSide: value.start_side ? String(value.start_side) : null,
    commitId: requireString(value.commit_id, 'review comment commit id'),
    originalCommitId: requireString(value.original_commit_id, 'review comment original commit id'),
    createdAt: requireTimestamp(value.created_at, 'review comment createdAt'),
    updatedAt: requireTimestamp(value.updated_at, 'review comment updatedAt'),
    authorAssociation: String(value.author_association || ''),
    author: actor(value.user, 'review comment')
  };
}

function normalizeThreadComment(value) {
  if (!value || !/^\d+$/.test(String(value.fullDatabaseId || '')) || !Object.hasOwn(value, 'body')) {
    fail('Review-thread comment response was incomplete.', {
      phase: 'normalize',
      collection: 'reviewThreadComments'
    });
  }
  let review = null;
  if (value.pullRequestReview) {
    const reviewId = value.pullRequestReview.fullDatabaseId;
    if (reviewId !== null && reviewId !== undefined && !/^\d+$/.test(String(reviewId))) {
      fail('Review-thread comment review identity was invalid.', {
        phase: 'normalize',
        collection: 'reviewThreadComments'
      });
    }
    const commitId = value.pullRequestReview.commit?.oid;
    if (commitId !== null && commitId !== undefined && !/^[0-9a-f]{40}$/i.test(String(commitId))) {
      fail('Review-thread comment review commit was invalid.', {
        phase: 'normalize',
        collection: 'reviewThreadComments'
      });
    }
    review = {
      id: reviewId === null || reviewId === undefined ? null : String(reviewId),
      nodeId: requireString(value.pullRequestReview.id, 'review-thread comment review node id'),
      commitId: commitId === null || commitId === undefined ? null : String(commitId)
    };
  }
  return {
    id: String(value.fullDatabaseId),
    nodeId: requireString(value.id, 'review-thread comment node id'),
    body: requireBody(value.body, 'review-thread comment'),
    path: requireString(value.path, 'review-thread comment path'),
    line: optionalInteger(value.line),
    createdAt: requireTimestamp(value.createdAt, 'review-thread comment createdAt'),
    updatedAt: requireTimestamp(value.updatedAt, 'review-thread comment updatedAt'),
    author: value.author ? { login: requireString(value.author.login, 'review-thread comment author') } : null,
    review
  };
}

const THREAD_FIELDS = `
  id
  isResolved
  isOutdated
  path
  line
  startLine
  diffSide
  startDiffSide
  comments(first: $pageSize) {
    nodes {
      id
      fullDatabaseId
      body
      path
      line
      createdAt
      updatedAt
      author { login }
      pullRequestReview { id fullDatabaseId commit { oid } }
    }
    pageInfo { hasNextPage endCursor }
  }
`;

function validatePageInfo(pageInfo, context) {
  if (!pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
    fail('GitHub GraphQL pagination metadata was incomplete.', { phase: 'graphql', ...context });
  }
  if (pageInfo.hasNextPage && !String(pageInfo.endCursor || '')) {
    fail('GitHub GraphQL pagination omitted its next cursor.', { phase: 'pagination', ...context });
  }
}

async function fetchThreadComments(client, thread, pageSize, pullRequestNumber) {
  const comments = [...(thread.comments?.nodes || [])];
  let pageInfo = thread.comments?.pageInfo;
  let pages = 1;
  const seenCursors = new Set();
  validatePageInfo(pageInfo, {
    pullRequestNumber,
    collection: `reviewThread:${thread.id}:comments`,
    page: pages
  });
  while (pageInfo?.hasNextPage) {
    const cursor = pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      fail('Review-thread comment pagination did not advance.', {
        phase: 'pagination',
        pullRequestNumber,
        collection: `reviewThread:${thread.id}:comments`,
        page: pages
      });
    }
    if (pages >= MAX_PAGES) {
      fail('Review-thread comment pagination exceeded its safety limit.', {
        phase: 'pagination',
        pullRequestNumber,
        collection: `reviewThread:${thread.id}:comments`
      });
    }
    seenCursors.add(cursor);
    const data = await client.graphql(
      `query($threadId: ID!, $after: String, $pageSize: Int!) {
        node(id: $threadId) {
          ... on PullRequestReviewThread {
            id
            comments(first: $pageSize, after: $after) {
              nodes {
                id
                fullDatabaseId
                body
                path
                line
                createdAt
                updatedAt
                author { login }
                pullRequestReview { id fullDatabaseId commit { oid } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { threadId: thread.id, after: cursor, pageSize },
      { pullRequestNumber, collection: `reviewThread:${thread.id}:comments`, page: pages + 1 }
    );
    if (!data.node || data.node.id !== thread.id || !Array.isArray(data.node.comments?.nodes)) {
      fail('Review-thread comment page omitted the expected thread.', {
        phase: 'graphql',
        pullRequestNumber,
        collection: `reviewThread:${thread.id}:comments`,
        page: pages + 1
      });
    }
    comments.push(...data.node.comments.nodes);
    pageInfo = data.node.comments.pageInfo;
    pages += 1;
    validatePageInfo(pageInfo, {
      pullRequestNumber,
      collection: `reviewThread:${thread.id}:comments`,
      page: pages
    });
  }
  const normalized = databaseIdSort(
    ensureUnique(comments.map(normalizeThreadComment), (item) => item.id, `reviewThread:${thread.id}:comments`)
  );
  return collection(normalized, pages);
}

async function fetchReviewThreads(client, repository, pullRequestNumber, pageSize) {
  const threads = [];
  let cursor = null;
  let pages = 0;
  const seenCursors = new Set();
  while (true) {
    if (pages >= MAX_PAGES) {
      fail('Review-thread pagination exceeded its safety limit.', {
        phase: 'pagination',
        pullRequestNumber,
        collection: 'reviewThreads'
      });
    }
    const data = await client.graphql(
      `query($owner: String!, $repo: String!, $number: Int!, $after: String, $pageSize: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            number
            reviewThreads(first: $pageSize, after: $after) {
              nodes { ${THREAD_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      {
        owner: repository.owner,
        repo: repository.repo,
        number: pullRequestNumber,
        after: cursor,
        pageSize
      },
      { pullRequestNumber, collection: 'reviewThreads', page: pages + 1 }
    );
    const pullRequest = data.repository?.pullRequest;
    const connection = pullRequest?.reviewThreads;
    if (pullRequest?.number !== pullRequestNumber || !Array.isArray(connection?.nodes)) {
      fail('Review-thread page omitted the expected pull request.', {
        phase: 'graphql',
        pullRequestNumber,
        collection: 'reviewThreads',
        page: pages + 1
      });
    }
    validatePageInfo(connection.pageInfo, {
      pullRequestNumber,
      collection: 'reviewThreads',
      page: pages + 1
    });
    for (const thread of connection.nodes) {
      if (
        !thread?.id ||
        typeof thread.isResolved !== 'boolean' ||
        typeof thread.isOutdated !== 'boolean' ||
        typeof thread.path !== 'string' ||
        !Array.isArray(thread.comments?.nodes) ||
        !thread.comments?.pageInfo
      ) {
        fail('Review-thread response was incomplete.', {
          phase: 'graphql',
          pullRequestNumber,
          collection: 'reviewThreads',
          page: pages + 1
        });
      }
      threads.push({
        id: String(thread.id),
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        path: thread.path,
        line: optionalInteger(thread.line),
        startLine: optionalInteger(thread.startLine),
        diffSide: thread.diffSide ? String(thread.diffSide) : null,
        startDiffSide: thread.startDiffSide ? String(thread.startDiffSide) : null,
        comments: await fetchThreadComments(client, thread, pageSize, pullRequestNumber)
      });
    }
    pages += 1;
    if (!connection.pageInfo?.hasNextPage) break;
    const nextCursor = connection.pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      fail('Review-thread pagination did not advance.', {
        phase: 'pagination',
        pullRequestNumber,
        collection: 'reviewThreads',
        page: pages
      });
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return collection(nodeSort(ensureUnique(threads, (item) => item.id, 'reviewThreads')), pages);
}

function pullRequestRecord(detail, reviews, issueComments, reviewComments, reviewThreads) {
  if (
    !Object.hasOwn(detail, 'mergeable') ||
    !Object.hasOwn(detail, 'mergeable_state') ||
    !Object.hasOwn(detail, 'rebaseable') ||
    (detail.mergeable !== null && typeof detail.mergeable !== 'boolean') ||
    typeof detail.mergeable_state !== 'string' ||
    !detail.mergeable_state ||
    (detail.rebaseable !== null && typeof detail.rebaseable !== 'boolean')
  ) {
    fail('Pull-request merge state was incomplete.', { phase: 'normalize', collection: 'mergeState' });
  }
  const createdAt = requireTimestamp(detail.created_at, 'pull request createdAt');
  const updatedAt = requireTimestamp(detail.updated_at, 'pull request updatedAt');
  if (Date.parse(createdAt) > Date.parse(updatedAt)) {
    fail('Pull-request timestamps were inconsistent.', { phase: 'normalize', collection: 'pullRequestTimestamps' });
  }
  return {
    number: requireInteger(detail.number, 'pull request number'),
    nodeId: requireString(detail.node_id, 'pull request node id'),
    url: requireString(detail.html_url, 'pull request URL'),
    title: requireString(detail.title, 'pull request title'),
    state: String(detail.state || '').toUpperCase(),
    isDraft: Boolean(detail.draft),
    createdAt,
    updatedAt,
    authorAssociation: String(detail.author_association || ''),
    author: actor(detail.user, 'pull request'),
    head: refIdentity(detail.head, 'head'),
    base: refIdentity(detail.base, 'base'),
    merge: {
      mergeable: detail.mergeable,
      mergeableState: detail.mergeable_state.toUpperCase(),
      rebaseable: detail.rebaseable
    },
    reviews,
    issueComments,
    reviewComments,
    reviewThreads
  };
}

async function fetchInventory(client, repository, pageSize, phase) {
  const result = await client.restPages(
    `/repos/${repository.nameWithOwner}/pulls?state=open&sort=created&direction=asc&per_page=${pageSize}&page=1`,
    { phase, collection: 'openPullRequests' }
  );
  const entries = ensureUnique(result.values.map(inventoryEntry), (item) => item.number, 'openPullRequests').sort(
    (left, right) => left.number - right.number
  );
  for (const entry of entries) {
    if (entry.base.repository !== null && !sameRepositoryIdentity(entry.base.repository, repository.nameWithOwner)) {
      fail('Pull request base repository did not match the audited repository.', {
        phase,
        collection: 'openPullRequests',
        pullRequestNumber: entry.number
      });
    }
  }
  return { entries, pages: result.pages, fingerprint: inventoryFingerprint(entries) };
}

async function fetchPullRequest(client, repository, inventory, pageSize) {
  const pullRequestNumber = inventory.number;
  const detailResponse = await client.request(`/repos/${repository.nameWithOwner}/pulls/${pullRequestNumber}`, {
    context: { phase: 'detail', pullRequestNumber }
  });
  const detail = detailResponse.data;
  if (
    Number(detail?.number) !== pullRequestNumber ||
    String(detail?.state || '').toLowerCase() !== 'open' ||
    detail?.draft !== false
  ) {
    fail('Pull request changed state or draft status during audit.', { phase: 'detail', pullRequestNumber });
  }
  if (detail.html_url !== `https://github.com/${repository.nameWithOwner}/pull/${pullRequestNumber}`) {
    fail('Pull request URL did not match the repository and pull-request identity.', {
      phase: 'detail',
      pullRequestNumber
    });
  }
  const detailIdentity = inventoryEntry(detail);
  if (
    detailIdentity.base.repository !== null &&
    !sameRepositoryIdentity(detailIdentity.base.repository, repository.nameWithOwner)
  ) {
    fail('Pull request base repository did not match the audited repository.', {
      phase: 'detail',
      pullRequestNumber
    });
  }
  if (canonicalJson(detailIdentity) !== canonicalJson(inventory)) {
    fail('Pull request identity drifted after inventory.', { phase: 'detail', pullRequestNumber });
  }

  const reviewsPage = await client.restPages(
    `/repos/${repository.nameWithOwner}/pulls/${pullRequestNumber}/reviews?per_page=${pageSize}&page=1`,
    { phase: 'collection', pullRequestNumber, collection: 'reviews' }
  );
  const issueCommentsPage = await client.restPages(
    `/repos/${repository.nameWithOwner}/issues/${pullRequestNumber}/comments?per_page=${pageSize}&page=1`,
    { phase: 'collection', pullRequestNumber, collection: 'issueComments' }
  );
  const reviewCommentsPage = await client.restPages(
    `/repos/${repository.nameWithOwner}/pulls/${pullRequestNumber}/comments?per_page=${pageSize}&page=1`,
    { phase: 'collection', pullRequestNumber, collection: 'reviewComments' }
  );
  const reviewThreads = await fetchReviewThreads(client, repository, pullRequestNumber, pageSize);

  const reviews = collection(
    numericSort(ensureUnique(reviewsPage.values.map(normalizeReview), (item) => item.id, 'reviews')),
    reviewsPage.pages
  );
  const issueComments = collection(
    numericSort(ensureUnique(issueCommentsPage.values.map(normalizeIssueComment), (item) => item.id, 'issueComments')),
    issueCommentsPage.pages
  );
  const reviewComments = collection(
    numericSort(ensureUnique(reviewCommentsPage.values.map(normalizeReviewComment), (item) => item.id, 'reviewComments')),
    reviewCommentsPage.pages
  );
  const threadCommentIds = reviewThreads.values
    .flatMap((thread) => thread.comments.values.map((comment) => comment.id))
    .sort((left, right) => {
      const comparison = BigInt(left) - BigInt(right);
      return comparison < 0n ? -1 : comparison > 0n ? 1 : 0;
    });
  const reviewCommentIds = reviewComments.values.map((comment) => String(comment.id));
  if (canonicalJson(threadCommentIds) !== canonicalJson(reviewCommentIds)) {
    fail('Review-thread membership did not match the complete review/comment collections.', {
      phase: 'normalize',
      pullRequestNumber,
      collection: 'reviewThreadConsistency'
    });
  }
  return pullRequestRecord(detail, reviews, issueComments, reviewComments, reviewThreads);
}

async function fetchEvidenceSnapshot(client, repository, inventory, pageSize) {
  const pullRequests = [];
  for (const entry of inventory.filter((candidate) => !candidate.isDraft)) {
    pullRequests.push(await fetchPullRequest(client, repository, entry, pageSize));
  }
  return ensureUnique(pullRequests, (pullRequest) => pullRequest.nodeId, 'pullRequestNodeIds').sort(
    (left, right) => left.number - right.number
  );
}

function sourceReviewIdentitiesAreConsistent(pullRequests) {
  const byDatabaseId = new Map();
  const byNodeId = new Map();
  for (const pullRequest of pullRequests) {
    for (const review of pullRequest.reviews.values) {
      const databaseTuple = canonicalJson({ nodeId: review.nodeId, pullRequestNumber: pullRequest.number });
      const nodeTuple = canonicalJson({ databaseId: review.id, pullRequestNumber: pullRequest.number });
      if (
        (byDatabaseId.has(review.id) && byDatabaseId.get(review.id) !== databaseTuple) ||
        (byNodeId.has(review.nodeId) && byNodeId.get(review.nodeId) !== nodeTuple)
      ) {
        return false;
      }
      byDatabaseId.set(review.id, databaseTuple);
      byNodeId.set(review.nodeId, nodeTuple);
    }
    const reviewsByDatabaseId = new Map(pullRequest.reviews.values.map((review) => [review.id, review]));
    const reviewsByNodeId = new Map(pullRequest.reviews.values.map((review) => [review.nodeId, review]));
    const reviewCommentsById = new Map(pullRequest.reviewComments.values.map((comment) => [String(comment.id), comment]));
    if (pullRequest.reviewComments.values.some((comment) => !reviewsByDatabaseId.has(comment.pullRequestReviewId))) {
      return false;
    }
    for (const comment of pullRequest.reviewThreads.values.flatMap((thread) => thread.comments.values)) {
      if (comment.review === null) continue;
      const graphqlReview = comment.review;
      if (
        !graphqlReview ||
        typeof graphqlReview !== 'object' ||
        Array.isArray(graphqlReview) ||
        typeof graphqlReview.nodeId !== 'string' ||
        !graphqlReview.nodeId ||
        (graphqlReview.id !== null && typeof graphqlReview.id !== 'string') ||
        (graphqlReview.commitId !== null &&
          (typeof graphqlReview.commitId !== 'string' || !/^[0-9a-f]{40}$/i.test(graphqlReview.commitId)))
      ) {
        return false;
      }
      const reviewByNodeId = reviewsByNodeId.get(graphqlReview.nodeId);
      const reviewComment = reviewCommentsById.get(String(comment.id));
      let reviewByDatabaseId = reviewByNodeId;
      if (graphqlReview.id !== null) {
        if (!/^[1-9]\d*$/.test(graphqlReview.id) || !Number.isSafeInteger(Number(graphqlReview.id))) return false;
        reviewByDatabaseId = reviewsByDatabaseId.get(Number(graphqlReview.id));
      }
      if (
        !reviewByNodeId ||
        !reviewComment ||
        reviewsByDatabaseId.get(reviewComment.pullRequestReviewId) !== reviewByNodeId ||
        reviewByDatabaseId !== reviewByNodeId ||
        (graphqlReview.commitId !== null &&
          reviewByNodeId.commitId !== null &&
          reviewByNodeId.commitId.toLowerCase() !== graphqlReview.commitId.toLowerCase())
      ) {
        return false;
      }
    }
  }
  return true;
}

function requireConsistentSourceReviewIdentities(pullRequests) {
  if (!sourceReviewIdentitiesAreConsistent(pullRequests)) {
    fail('Review database and node identities were inconsistent across pull requests.', {
      phase: 'normalize',
      collection: 'reviewIdentities'
    });
  }
}

function auditSummary(pullRequests) {
  let reviewCount = 0;
  let issueCommentCount = 0;
  let reviewCommentCount = 0;
  let reviewThreadCount = 0;
  let reviewThreadCommentCount = 0;
  let unresolvedThreadCount = 0;
  let unresolvedNonOutdatedThreadCount = 0;
  let currentTrustedCodexFindingCount = 0;
  for (const pullRequest of pullRequests) {
    reviewCount += pullRequest.reviews.count;
    issueCommentCount += pullRequest.issueComments.count;
    reviewCommentCount += pullRequest.reviewComments.count;
    reviewThreadCount += pullRequest.reviewThreads.count;
    for (const thread of pullRequest.reviewThreads.values) {
      reviewThreadCommentCount += thread.comments.count;
      if (!thread.isResolved) unresolvedThreadCount += 1;
      if (!thread.isResolved && !thread.isOutdated) {
        unresolvedNonOutdatedThreadCount += 1;
        const root = thread.comments.values[0];
        if (
          root &&
          normalizeLogin(root.author?.login) === CODEX_REVIEW_ACTOR &&
          root.review?.commitId === pullRequest.head.oid &&
          findingPriority(root.body)
        ) {
          currentTrustedCodexFindingCount += 1;
        }
      }
    }
  }
  return {
    pullRequestCount: pullRequests.length,
    reviewCount,
    issueCommentCount,
    reviewCommentCount,
    reviewThreadCount,
    reviewThreadCommentCount,
    unresolvedThreadCount,
    unresolvedNonOutdatedThreadCount,
    currentTrustedCodexFindingCount
  };
}

function incompleteRecord({ repository, runId, startedAt, completedAt, client, error }) {
  const details = error instanceof AuditIncompleteError ? error.details : {};
  return {
    kind: AUDIT_KIND,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    status: 'incomplete',
    audit: {
      id: runId,
      startedAt,
      completedAt,
      apiVersion: AUDIT_API_VERSION,
      requestCount: client?.requestCount?.() ?? 0
    },
    repository: { nameWithOwner: repository?.nameWithOwner || '' },
    failure: {
      message: error instanceof Error ? error.message : String(error),
      phase: String(details.phase || 'unknown'),
      pullRequestNumber: optionalInteger(details.pullRequestNumber),
      collection: details.collection ? String(details.collection) : null,
      page: optionalInteger(details.page),
      status: optionalInteger(details.status)
    }
  };
}

export async function auditRepository({
  repository: repositoryValue,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  runId = randomUUID(),
  pageSize = DEFAULT_PAGE_SIZE
}) {
  const startedAt = now().toISOString();
  let repository;
  let client;
  try {
    repository = parseRepository(repositoryValue);
    if (!token) fail('GITHUB_TOKEN or GH_TOKEN is required; anonymous audits are forbidden.', { phase: 'authentication' });
    if (typeof fetchImpl !== 'function') fail('No fetch implementation is available.', { phase: 'arguments' });
    if (typeof runId !== 'string' || !runId.trim()) {
      fail('--run-id must be a nonempty string.', { phase: 'arguments' });
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      fail('Audit page size must be an integer from 1 to 100.', { phase: 'arguments' });
    }
    client = createGithubClient({ token, apiUrl, fetchImpl });
    const authenticatedAs = apiIdentity((await client.request('/user', { context: { phase: 'authentication' } })).data);
    const repositoryResponse = await client.request(`/repos/${repository.nameWithOwner}`, {
      context: { phase: 'repository' }
    });
    if (
      String(repositoryResponse.data?.full_name || '').toLowerCase() !== repository.nameWithOwner.toLowerCase() ||
      typeof repositoryResponse.data?.node_id !== 'string' ||
      repositoryResponse.data.node_id.length === 0
    ) {
      fail('GitHub repository response did not match --repo.', { phase: 'repository' });
    }
    repository = parseRepository(repositoryResponse.data.full_name);
    const before = await fetchInventory(client, repository, pageSize, 'inventory-before');
    const selected = before.entries.filter((entry) => !entry.isDraft);
    const firstSnapshot = await fetchEvidenceSnapshot(client, repository, before.entries, pageSize);
    requireConsistentSourceReviewIdentities(firstSnapshot);
    const middle = await fetchInventory(client, repository, pageSize, 'inventory-middle');
    if (before.fingerprint !== middle.fingerprint) {
      fail('Open pull-request inventory drifted during the first evidence snapshot.', { phase: 'inventory-middle' });
    }
    const pullRequests = await fetchEvidenceSnapshot(client, repository, middle.entries, pageSize);
    requireConsistentSourceReviewIdentities(pullRequests);
    const after = await fetchInventory(client, repository, pageSize, 'inventory-after');
    if (middle.fingerprint !== after.fingerprint) {
      fail('Open pull-request inventory drifted during audit.', { phase: 'inventory-after' });
    }
    if (canonicalJson(firstSnapshot) !== canonicalJson(pullRequests)) {
      fail('Pull-request review evidence or merge state drifted between complete snapshots.', {
        phase: 'evidence-after'
      });
    }
    const completedAt = now().toISOString();
    const record = addIntegrity({
      kind: AUDIT_KIND,
      schemaVersion: AUDIT_SCHEMA_VERSION,
      status: 'complete',
      audit: {
        id: runId,
        startedAt,
        completedAt,
        apiVersion: AUDIT_API_VERSION,
        authenticatedAs,
        requestCount: client.requestCount()
      },
      repository: {
        nameWithOwner: String(repositoryResponse.data.full_name),
        nodeId: repositoryResponse.data.node_id
      },
      inventory: {
        filter: { state: 'OPEN', draft: false },
        stable: true,
        beforeFingerprint: before.fingerprint,
        middleFingerprint: middle.fingerprint,
        afterFingerprint: after.fingerprint,
        beforePages: before.pages,
        middlePages: middle.pages,
        afterPages: after.pages,
        openCount: before.entries.length,
        draftCount: before.entries.filter((entry) => entry.isDraft).length,
        count: selected.length,
        pullRequestNumbers: selected.map((entry) => entry.number),
        openPullRequests: after.entries
      },
      pullRequests,
      summary: auditSummary(pullRequests)
    });
    return record;
  } catch (error) {
    const completedAt = now().toISOString();
    const incomplete = incompleteRecord({
      repository,
      runId: typeof runId === 'string' ? runId : '',
      startedAt,
      completedAt,
      client,
      error
    });
    const wrapped = error instanceof AuditIncompleteError ? error : new AuditIncompleteError(String(error));
    wrapped.record = incomplete;
    throw wrapped;
  }
}

function requiredString(value, message) {
  if (!value || typeof value !== 'string') throw new Error(message);
  return value;
}

function verifyCollection(value, label) {
  if (
    !value ||
    value.complete !== true ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    !Number.isSafeInteger(value.pages) ||
    value.pages < 1 ||
    !Array.isArray(value.values) ||
    value.values.length !== value.count
  ) {
    throw new Error(`Audit ${label} collection is incomplete or inconsistent.`);
  }
}

function isSortedUnique(items, key, compare) {
  const identifiers = items.map(key);
  return (
    identifiers.every((identifier) => identifier !== undefined && identifier !== null && identifier !== '') &&
    new Set(identifiers).size === identifiers.length &&
    identifiers.every((identifier, index) => index === 0 || compare(identifiers[index - 1], identifier) <= 0)
  );
}

export function verifyAuditRecord(record, { repository, expectedRunId, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS, now }) {
  const currentTime = now instanceof Date ? now : new Date(now || Date.now());
  if (!record || record.kind !== AUDIT_KIND || record.schemaVersion !== AUDIT_SCHEMA_VERSION) {
    throw new Error('Audit schema is missing or unsupported.');
  }
  if (record.status !== 'complete') throw new Error('Audit status is not complete.');
  if (record.repository?.nameWithOwner?.toLowerCase() !== parseRepository(repository).nameWithOwner.toLowerCase()) {
    throw new Error('Audit repository does not match the expected repository.');
  }
  if (
    typeof expectedRunId !== 'string' ||
    !expectedRunId.trim() ||
    typeof record.audit?.id !== 'string' ||
    !record.audit.id.trim() ||
    record.audit.id !== expectedRunId
  ) {
    throw new Error('Audit run ID does not match this heartbeat invocation.');
  }
  if (
    !record.audit?.authenticatedAs ||
    !Number.isSafeInteger(record.audit.authenticatedAs.id) ||
    !record.audit.authenticatedAs.login ||
    !Number.isSafeInteger(record.audit.requestCount) ||
    record.audit.requestCount < 4 ||
    record.audit.apiVersion !== AUDIT_API_VERSION ||
    typeof record.repository?.nodeId !== 'string' ||
    record.repository.nodeId.length === 0
  ) {
    throw new Error('Audit authentication or repository provenance is incomplete.');
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > AUDIT_SCHEMA_V1_MAX_AGE_SECONDS) {
    throw new Error('--max-age-seconds must be an integer from 1 to 3600.');
  }
  const startedAt = new Date(requiredString(record.audit?.startedAt, 'Audit startedAt is missing.'));
  const completedAt = new Date(requiredString(record.audit?.completedAt, 'Audit completedAt is missing.'));
  if (
    !Number.isFinite(startedAt.getTime()) ||
    !Number.isFinite(completedAt.getTime()) ||
    startedAt > completedAt ||
    completedAt.getTime() - startedAt.getTime() > maxAgeSeconds * 1_000 ||
    completedAt.getTime() > currentTime.getTime() + 5_000
  ) {
    throw new Error('Audit timestamps are invalid.');
  }
  if (currentTime.getTime() - startedAt.getTime() > maxAgeSeconds * 1_000) {
    throw new Error('Audit is stale.');
  }
  if (
    record.integrity?.algorithm !== 'sha256' ||
    !/^[0-9a-f]{64}$/.test(String(record.integrity?.digest || '')) ||
    record.integrity.digest !== sha256(canonicalJson(digestableRecord(record)))
  ) {
    throw new Error('Audit integrity digest is invalid.');
  }
  if (
    record.inventory?.stable !== true ||
    record.inventory?.filter?.state !== 'OPEN' ||
    record.inventory?.filter?.draft !== false ||
    record.inventory.beforeFingerprint !== record.inventory.middleFingerprint ||
    record.inventory.beforeFingerprint !== record.inventory.afterFingerprint ||
    !/^sha256:[0-9a-f]{64}$/.test(String(record.inventory.beforeFingerprint || '')) ||
    !Number.isSafeInteger(record.inventory?.count) ||
    !Number.isSafeInteger(record.inventory?.openCount) ||
    !Number.isSafeInteger(record.inventory?.draftCount) ||
    record.inventory.openCount !== record.inventory.count + record.inventory.draftCount ||
    !Number.isSafeInteger(record.inventory?.beforePages) ||
    record.inventory.beforePages < 1 ||
    !Number.isSafeInteger(record.inventory?.middlePages) ||
    record.inventory.middlePages < 1 ||
    !Number.isSafeInteger(record.inventory?.afterPages) ||
    record.inventory.afterPages < 1 ||
    !Array.isArray(record.inventory?.openPullRequests) ||
    record.inventory.openPullRequests.length !== record.inventory.openCount ||
    !Array.isArray(record.inventory?.pullRequestNumbers) ||
    !Array.isArray(record.pullRequests) ||
    record.inventory.count !== record.pullRequests.length ||
    record.inventory.count !== record.inventory.pullRequestNumbers.length
  ) {
    throw new Error('Audit inventory is incomplete or inconsistent.');
  }
  for (const entry of record.inventory.openPullRequests) {
    if (
      !Number.isSafeInteger(entry?.number) ||
      entry.number < 1 ||
      entry.state !== 'OPEN' ||
      typeof entry.isDraft !== 'boolean' ||
      typeof entry.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.updatedAt)) ||
      !/^[0-9a-f]{40}$/i.test(String(entry.head?.oid || '')) ||
      !String(entry.head?.refName || '') ||
      !/^[0-9a-f]{40}$/i.test(String(entry.base?.oid || '')) ||
      !String(entry.base?.refName || '') ||
      (entry.base.repository !== null && !sameRepositoryIdentity(entry.base.repository, record.repository.nameWithOwner))
    ) {
      throw new Error('Audit open-pull-request identity is invalid.');
    }
  }
  if (record.inventory.openPullRequests.filter((entry) => entry.isDraft).length !== record.inventory.draftCount) {
    throw new Error('Audit draft inventory count is inconsistent.');
  }
  const normalizedOpenInventory = ensureUnique(
    record.inventory.openPullRequests.map((entry) => ({
      number: requireInteger(entry.number, 'inventory pull request number'),
      state: entry.state,
      isDraft: entry.isDraft,
      updatedAt: entry.updatedAt,
      head: entry.head,
      base: entry.base
    })),
    (entry) => entry.number,
    'openPullRequests'
  ).sort((left, right) => left.number - right.number);
  if (
    canonicalJson(normalizedOpenInventory) !== canonicalJson(record.inventory.openPullRequests) ||
    inventoryFingerprint(normalizedOpenInventory) !== record.inventory.beforeFingerprint ||
    canonicalJson(normalizedOpenInventory.filter((entry) => !entry.isDraft).map((entry) => entry.number)) !==
      canonicalJson(record.inventory.pullRequestNumbers)
  ) {
    throw new Error('Audit inventory fingerprint does not match the captured identities.');
  }
  const numbers = record.pullRequests.map((pullRequest) => pullRequest.number);
  const nodeIds = record.pullRequests.map((pullRequest) => pullRequest.nodeId);
  if (
    canonicalJson(numbers) !== canonicalJson([...numbers].sort((left, right) => left - right)) ||
    new Set(numbers).size !== numbers.length ||
    canonicalJson(numbers) !== canonicalJson(record.inventory.pullRequestNumbers)
  ) {
    throw new Error('Audit pull-request inventory is not unique and deterministically ordered.');
  }
  if (nodeIds.some((nodeId) => typeof nodeId !== 'string' || !nodeId) || new Set(nodeIds).size !== nodeIds.length) {
    throw new Error('Audit pull-request node IDs are not globally unique.');
  }
  for (const pullRequest of record.pullRequests) {
    const inventoryIdentity = record.inventory.openPullRequests.find((entry) => entry.number === pullRequest.number);
    if (
      !Number.isSafeInteger(pullRequest.number) ||
      pullRequest.state !== 'OPEN' ||
      pullRequest.isDraft !== false ||
      pullRequest.url !== `https://github.com/${record.repository.nameWithOwner}/pull/${pullRequest.number}` ||
      typeof pullRequest.createdAt !== 'string' ||
      typeof pullRequest.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(pullRequest.createdAt)) ||
      !Number.isFinite(Date.parse(pullRequest.updatedAt)) ||
      Date.parse(pullRequest.createdAt) > Date.parse(pullRequest.updatedAt) ||
      !/^[0-9a-f]{40}$/i.test(String(pullRequest.head?.oid || '')) ||
      !pullRequest.head?.refName ||
      !/^[0-9a-f]{40}$/i.test(String(pullRequest.base?.oid || '')) ||
      !pullRequest.base?.refName ||
      (pullRequest.base.repository !== null &&
        !sameRepositoryIdentity(pullRequest.base.repository, record.repository.nameWithOwner)) ||
      !pullRequest.merge ||
      (pullRequest.merge.mergeable !== null && typeof pullRequest.merge.mergeable !== 'boolean') ||
      !String(pullRequest.merge.mergeableState || '') ||
      (pullRequest.merge.rebaseable !== null && typeof pullRequest.merge.rebaseable !== 'boolean')
    ) {
      throw new Error(`Audit contains ineligible pull request #${pullRequest.number}.`);
    }
    const detailIdentity = {
      number: pullRequest.number,
      state: pullRequest.state,
      isDraft: pullRequest.isDraft,
      updatedAt: pullRequest.updatedAt,
      head: pullRequest.head,
      base: pullRequest.base
    };
    if (!inventoryIdentity || canonicalJson(detailIdentity) !== canonicalJson(inventoryIdentity)) {
      throw new Error(`Audit detail identity for pull request #${pullRequest.number} does not match inventory.`);
    }
    verifyCollection(pullRequest.reviews, `#${pullRequest.number} reviews`);
    verifyCollection(pullRequest.issueComments, `#${pullRequest.number} issue comments`);
    verifyCollection(pullRequest.reviewComments, `#${pullRequest.number} review comments`);
    verifyCollection(pullRequest.reviewThreads, `#${pullRequest.number} review threads`);
    if (
      pullRequest.reviews.values.some(
        (review) =>
          !Number.isSafeInteger(review.id) ||
          review.id < 1 ||
          typeof review.nodeId !== 'string' ||
          !review.nodeId ||
          typeof review.state !== 'string' ||
          !review.state ||
          (review.commitId !== null && (typeof review.commitId !== 'string' || !/^[0-9a-f]{40}$/i.test(review.commitId))) ||
          (review.submittedAt !== null &&
            (typeof review.submittedAt !== 'string' || !Number.isFinite(Date.parse(review.submittedAt))))
      )
    ) {
      throw new Error(`Audit review schema for pull request #${pullRequest.number} is invalid.`);
    }
    if (
      !isSortedUnique(
        pullRequest.reviews.values,
        (item) => item.id,
        (left, right) => left - right
      ) ||
      !isSortedUnique(
        pullRequest.issueComments.values,
        (item) => item.id,
        (left, right) => left - right
      ) ||
      !isSortedUnique(
        pullRequest.reviewComments.values,
        (item) => item.id,
        (left, right) => left - right
      ) ||
      !isSortedUnique(
        pullRequest.reviewThreads.values,
        (item) => item.id,
        (left, right) => (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0)
      )
    ) {
      throw new Error(`Audit collections for pull request #${pullRequest.number} are not uniquely ordered.`);
    }
    for (const thread of pullRequest.reviewThreads.values) {
      verifyCollection(thread.comments, `#${pullRequest.number} thread ${thread.id} comments`);
      if (
        !thread.comments.values.every((comment) => /^\d+$/.test(String(comment.id))) ||
        !isSortedUnique(
          thread.comments.values,
          (item) => item.id,
          (left, right) => {
            const comparison = BigInt(left) - BigInt(right);
            return comparison < 0n ? -1 : comparison > 0n ? 1 : 0;
          }
        )
      ) {
        throw new Error(`Audit comments for pull request #${pullRequest.number} thread ${thread.id} are not ordered.`);
      }
    }
    const threadCommentIds = pullRequest.reviewThreads.values
      .flatMap((thread) => thread.comments.values.map((comment) => String(comment.id)))
      .sort((left, right) => {
        const comparison = BigInt(left) - BigInt(right);
        return comparison < 0n ? -1 : comparison > 0n ? 1 : 0;
      });
    const reviewCommentIds = pullRequest.reviewComments.values.map((comment) => String(comment.id));
    if (canonicalJson(threadCommentIds) !== canonicalJson(reviewCommentIds)) {
      throw new Error(`Audit review-thread membership for pull request #${pullRequest.number} is inconsistent.`);
    }
  }
  if (!sourceReviewIdentitiesAreConsistent(record.pullRequests)) {
    throw new Error('Audit review database and node identities are inconsistent across pull requests.');
  }
  if (canonicalJson(record.summary) !== canonicalJson(auditSummary(record.pullRequests))) {
    throw new Error('Audit summary does not match the inventory.');
  }
  const expiresAt = new Date(startedAt.getTime() + maxAgeSeconds * 1_000).toISOString();
  return {
    kind: AUDIT_PROOF_KIND,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    repository: record.repository.nameWithOwner,
    auditId: record.audit.id,
    digest: record.integrity.digest,
    completedAt: record.audit.completedAt,
    expiresAt,
    pullRequestCount: record.inventory.count,
    unresolvedNonOutdatedThreadCount: record.summary.unresolvedNonOutdatedThreadCount,
    currentTrustedCodexFindingCount: record.summary.currentTrustedCodexFindingCount
  };
}

export async function writeJsonAtomic(filename, value) {
  const resolved = path.resolve(filename);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await link(temporary, resolved);
    await unlink(temporary);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function option(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function requiredOption(args, flag) {
  const value = option(args, flag);
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required.`);
  return value;
}

async function runAudit(args) {
  const repository = requiredOption(args, '--repo');
  const runId = requiredOption(args, '--run-id');
  const output = option(args, '--output');
  const failureOutput = option(args, '--failure-output');
  try {
    const record = await auditRepository({
      repository,
      runId,
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      apiUrl: GITHUB_API_URL
    });
    if (output) await writeJsonAtomic(output, record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
  } catch (error) {
    const record = error?.record || {
      kind: AUDIT_KIND,
      schemaVersion: AUDIT_SCHEMA_VERSION,
      status: 'incomplete',
      failure: { message: error instanceof Error ? error.message : String(error) }
    };
    if (failureOutput) await writeJsonAtomic(failureOutput, record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
    process.stderr.write(`PR review audit incomplete: ${record.failure?.message || 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}

async function runVerify(args) {
  const filename = requiredOption(args, '--input');
  const repository = requiredOption(args, '--repo');
  const expectedRunId = requiredOption(args, '--expect-run-id');
  const maxAgeValue = option(args, '--max-age-seconds');
  const maxAgeSeconds = maxAgeValue === undefined ? DEFAULT_MAX_AGE_SECONDS : Number(maxAgeValue);
  const record = JSON.parse(await readFile(filename, 'utf8'));
  const proof = verifyAuditRecord(record, { repository, expectedRunId, maxAgeSeconds });
  process.stdout.write(`${JSON.stringify(proof)}\n`);
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === 'audit') return runAudit(args.slice(1));
  if (command === 'verify') return runVerify(args.slice(1));
  throw new Error('Usage: codex-pr-review-audit.mjs <audit|verify> [options]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
