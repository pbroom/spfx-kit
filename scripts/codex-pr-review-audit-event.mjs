#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { link, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_SCHEMA_V1_MAX_AGE_SECONDS,
  DEFAULT_MAX_AGE_SECONDS,
  addIntegrity,
  canonicalJson,
  verifyAuditRecord
} from './codex-pr-review-audit.mjs';
import { findingPriority } from './codex-review-priority.mjs';
import { parseLoopState, STATUS_MARKER } from './codex-review-loop.mjs';

const EVENT_SCHEMA_V1 = Object.freeze({
  kind: 'pbroom.spfx-kit.pr-review-audit-event',
  schemaVersion: 1,
  eventType: 'complete_snapshot',
  classifierId: 'spfx-kit-review-observation-v1',
  classifierVersion: 1,
  slotWindowMilliseconds: 30 * 60 * 1_000,
  maxAuditDurationMilliseconds: AUDIT_SCHEMA_V1_MAX_AGE_SECONDS * 1_000,
  maxFixAttempts: 3
});
export const AUDIT_EVENT_KIND = EVENT_SCHEMA_V1.kind;
export const AUDIT_EVENT_SCHEMA_VERSION = EVENT_SCHEMA_V1.schemaVersion;
export const AUDIT_EVENT_TYPE = EVENT_SCHEMA_V1.eventType;
export const AUDIT_EVENT_CLASSIFIER_ID = EVENT_SCHEMA_V1.classifierId;
export const AUDIT_EVENT_PROJECTOR_VERSION = 1;

const SOURCE_ORDER = ['codex', 'greptile', 'graphite', 'github_user', 'other_automation', 'unknown'];
const ORIGIN_ORDER = ['review_thread_root'];
const CLASSIFICATION_ORDER = ['classified', 'unknown'];
const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3', 'unknown'];
const GREPTILE_ACTORS = new Set(['greptile-apps', 'greptileai']);
const GRAPHITE_ACTORS = new Set(['graphite', 'graphite-app']);
const GITHUB_ACTIONS_ACTOR_ID = 41_898_282;
const CODEX_ACTOR_ID = 199_175_422;
const LOOP_STATUSES_V1 = new Set([
  'blocked',
  'failed',
  'generating',
  'idle',
  'no_patch',
  'pushed',
  'push_failed',
  'ready_for_human',
  'skipped',
  'validation_failed'
]);
const LOOP_RESULTS_V1 = new Set(['accepted', 'clean', 'failed', 'no_patch', 'pushed', 'push_failed', 'validation_failed']);
const LOCK_KIND = 'pbroom.spfx-kit.pr-review-audit-event-lock';
const LOCK_SCHEMA_VERSION = 1;
const LOCK_LEASE_MILLISECONDS = 15 * 60 * 1_000;
const LOOP_STATE_KEYS = [
  'attempt',
  'attempts',
  'headSha',
  'processedReviews',
  'reviewId',
  'runUrl',
  'status',
  'summary',
  'version'
];
const PROCESSED_REVIEW_KEYS = ['at', 'attempt', 'headSha', 'result', 'reviewId'];
const PROCESSED_REVIEW_WITH_THREADS_KEYS = [...PROCESSED_REVIEW_KEYS, 'threadIds'];
const SOURCE_AUDIT_COMPATIBILITY = new Map([
  [
    1,
    [
      {
        kind: 'pbroom.spfx-kit.pr-review-audit',
        schemaVersion: 1,
        apiVersions: new Set(['2022-11-28'])
      }
    ]
  ]
]);

function sha256Prefixed(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const PROJECTOR_V1_IMPLEMENTATION_PATHS = Object.freeze([
  'scripts/codex-pr-review-audit-event.mjs',
  'scripts/codex-pr-review-audit.mjs',
  'scripts/codex-review-loop.mjs',
  'scripts/codex-review-priority.mjs'
]);
const PROJECTOR_V1_COMPATIBILITY = new Map([
  [
    1,
    {
      id: 'codex-pr-review-audit-event',
      manifestKind: 'sha256-manifest',
      manifestPaths: PROJECTOR_V1_IMPLEMENTATION_PATHS
    }
  ]
]);
const PROJECTOR_COMPATIBILITY = new Map([[EVENT_SCHEMA_V1.schemaVersion, PROJECTOR_V1_COMPATIBILITY]]);
const EVENT_SCHEMA_COMPATIBILITY = new Map([
  [
    EVENT_SCHEMA_V1.schemaVersion,
    {
      schema: EVENT_SCHEMA_V1,
      validate: validateAuditEventV1,
      streamView: eventStreamViewV1
    }
  ]
]);
const PROJECTOR_LOCAL_FILES = new Map([
  ['scripts/codex-pr-review-audit-event.mjs', fileURLToPath(import.meta.url)],
  ['scripts/codex-pr-review-audit.mjs', fileURLToPath(new URL('./codex-pr-review-audit.mjs', import.meta.url))],
  ['scripts/codex-review-loop.mjs', fileURLToPath(new URL('./codex-review-loop.mjs', import.meta.url))],
  ['scripts/codex-review-priority.mjs', fileURLToPath(new URL('./codex-review-priority.mjs', import.meta.url))]
]);
const CURRENT_PROJECTOR_COMPATIBILITY =
  PROJECTOR_COMPATIBILITY.get(AUDIT_EVENT_SCHEMA_VERSION)?.get(AUDIT_EVENT_PROJECTOR_VERSION);
if (!CURRENT_PROJECTOR_COMPATIBILITY) throw new Error('Current audit-event projector version has no compatibility entry.');
const PROJECTOR_IMPLEMENTATION_FILES = CURRENT_PROJECTOR_COMPATIBILITY.manifestPaths.map((filename) => ({
  path: filename,
  digest: sha256Prefixed(readFileSync(PROJECTOR_LOCAL_FILES.get(filename)))
}));
const PROJECTOR_IMPLEMENTATION_DIGEST = sha256Prefixed(canonicalJson(PROJECTOR_IMPLEMENTATION_FILES));

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedLogin(value) {
  return String(value || '')
    .trim()
    .replace(/\[bot\]$/i, '')
    .toLowerCase();
}

function classifySource(author) {
  const login = normalizedLogin(author?.login);
  const actorType = String(author?.type || '').toLowerCase();
  const automationActor = actorType === 'bot' || actorType === 'app';
  let value = 'unknown';
  let confidence = 'unknown';
  if (login === 'chatgpt-codex-connector' && author?.id === CODEX_ACTOR_ID && automationActor) {
    value = 'codex';
    confidence = 'high';
  } else if (GREPTILE_ACTORS.has(login) && automationActor) {
    value = 'greptile';
    confidence = 'medium';
  } else if (GRAPHITE_ACTORS.has(login) && automationActor) {
    value = 'graphite';
    confidence = 'medium';
  } else if (actorType === 'user') {
    value = 'github_user';
    confidence = 'medium';
  } else if (automationActor) {
    value = 'other_automation';
    confidence = 'medium';
  }
  return {
    actor: author
      ? {
          id: Number.isSafeInteger(author.id) ? author.id : null,
          login: author.login || null,
          type: author.type || null
        }
      : { id: null, login: null, type: null },
    classification: {
      status: value === 'unknown' ? 'unknown' : 'classified',
      value,
      confidence,
      method: 'actor-login-and-type-v1'
    }
  };
}

function sourceObservation(restAuthor, graphqlAuthor) {
  const source = classifySource(restAuthor);
  const restLogin = normalizedLogin(restAuthor?.login);
  const graphqlLogin = normalizedLogin(graphqlAuthor?.login);
  if (restLogin && graphqlLogin && restLogin !== graphqlLogin) {
    return {
      actor: source.actor,
      graphqlLogin: graphqlAuthor.login,
      reconciliation: 'mismatch',
      classification: {
        status: 'unknown',
        value: 'unknown',
        confidence: 'unknown',
        method: 'rest-graphql-actor-reconciliation-v1'
      }
    };
  }
  return {
    ...source,
    graphqlLogin: graphqlAuthor?.login || null,
    reconciliation: restLogin && graphqlLogin ? 'matched' : 'single_surface',
    classification: {
      ...source.classification,
      method: 'rest-review-comment-actor-v1'
    }
  };
}

function severityClassification(body) {
  const severity = findingPriority(body);
  return {
    status: severity ? 'classified' : 'unknown',
    value: severity || null,
    confidence: severity ? 'high' : 'unknown',
    method: 'explicit-priority-label-v1',
    validity: 'unknown',
    validityReason: 'not_assessed'
  };
}

function unknownFixLink(reason) {
  return {
    status: 'unknown',
    commitOid: null,
    pullRequestNumber: null,
    evidenceIds: [],
    confidence: 'unknown',
    causalAttribution: 'not_assessed',
    reason
  };
}

function validLoopState(state) {
  if (
    !exactKeys(state, LOOP_STATE_KEYS) ||
    state.version !== 1 ||
    !Number.isSafeInteger(state.attempts) ||
    state.attempts < 0 ||
    state.attempts > EVENT_SCHEMA_V1.maxFixAttempts ||
    typeof state.status !== 'string' ||
    !LOOP_STATUSES_V1.has(state.status) ||
    typeof state.headSha !== 'string' ||
    (state.headSha !== '' && !/^[0-9a-f]{40}$/i.test(state.headSha)) ||
    !Number.isSafeInteger(state.reviewId) ||
    state.reviewId < 0 ||
    !Number.isSafeInteger(state.attempt) ||
    state.attempt < 0 ||
    state.attempt > state.attempts ||
    typeof state.runUrl !== 'string' ||
    state.runUrl.length > 2_048 ||
    (state.runUrl !== '' && !/^https:\/\/[^\s]+$/.test(state.runUrl)) ||
    typeof state.summary !== 'string' ||
    state.summary.length < 1 ||
    state.summary.length > 4_096 ||
    !Array.isArray(state.processedReviews) ||
    state.processedReviews.length > 20
  ) {
    return false;
  }
  const reviewIds = new Set();
  for (const entry of state.processedReviews) {
    if (
      !exactKeys(entry, entry?.threadIds === undefined ? PROCESSED_REVIEW_KEYS : PROCESSED_REVIEW_WITH_THREADS_KEYS) ||
      !Number.isSafeInteger(entry.reviewId) ||
      entry.reviewId < 1 ||
      typeof entry.headSha !== 'string' ||
      !/^[0-9a-f]{40}$/i.test(entry.headSha) ||
      !Number.isSafeInteger(entry.attempt) ||
      entry.attempt < 0 ||
      entry.attempt > state.attempts ||
      typeof entry.result !== 'string' ||
      !LOOP_RESULTS_V1.has(entry.result) ||
      !canonicalTimestamp(entry.at) ||
      (entry.result === 'clean' && entry.threadIds !== undefined) ||
      (entry.result !== 'clean' &&
        (!Array.isArray(entry.threadIds) ||
          entry.threadIds.length === 0 ||
          entry.threadIds.some((threadId) => typeof threadId !== 'string' || !threadId) ||
          new Set(entry.threadIds).size !== entry.threadIds.length)) ||
      reviewIds.has(entry.reviewId)
    ) {
      return false;
    }
    reviewIds.add(entry.reviewId);
  }
  return true;
}

function rawLoopState(body) {
  const escapedMarker = STATUS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = String(body || '');
  const openingPattern = new RegExp(`<!-- ${escapedMarker}`, 'g');
  if ([...text.matchAll(openingPattern)].length !== 1) return null;
  const match = text.match(new RegExp(`<!-- ${escapedMarker}\\n([\\s\\S]*?)\\n-->`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function threadRootPair(pullRequest, thread) {
  const comments = thread.comments.values.map((comment) => ({
    graphql: comment,
    rest: pullRequest.reviewComments.values.find((candidate) => String(candidate.id) === String(comment.id)) || null
  }));
  if (comments.some((comment) => !comment.rest || comment.graphql.nodeId !== comment.rest.nodeId)) {
    throw new Error(`Review thread ${thread.id} has inconsistent paired REST and GraphQL comment identities.`);
  }
  const rootCandidates = comments.filter((comment) => comment.rest?.inReplyToId === null);
  if (rootCandidates.length !== 1) {
    throw new Error(`Review thread ${thread.id} does not have exactly one paired REST root comment.`);
  }
  if (comments.some((comment) => comment.rest.inReplyToId !== null && comment.rest.inReplyToId !== rootCandidates[0].rest.id)) {
    throw new Error(`Review thread ${thread.id} contains a reply that does not point to its paired REST root comment.`);
  }
  return rootCandidates[0];
}

function loopStateMatchesThreadIdentities(state, pullRequest, observedAt) {
  const threads = new Map(pullRequest.reviewThreads.values.map((thread) => [thread.id, thread]));
  const reviews = new Map(pullRequest.reviews.values.map((review) => [review.id, review]));
  for (const entry of state.processedReviews) {
    const auditedReview = reviews.get(entry.reviewId);
    if (
      !auditedReview ||
      auditedReview.submittedAt === null ||
      typeof auditedReview.commitId !== 'string' ||
      auditedReview.commitId.toLowerCase() !== entry.headSha.toLowerCase() ||
      Date.parse(entry.at) < Date.parse(auditedReview.submittedAt) ||
      Date.parse(entry.at) > Date.parse(observedAt)
    ) {
      return false;
    }
    if (!Array.isArray(entry.threadIds)) continue;
    for (const threadId of entry.threadIds) {
      const thread = threads.get(threadId);
      if (!thread) return false;
      const review = threadRootPair(pullRequest, thread).graphql?.review;
      if (
        (review?.id !== null && review?.id !== undefined && String(entry.reviewId) !== String(review.id)) ||
        (review?.commitId && entry.headSha !== review.commitId)
      ) {
        return false;
      }
    }
  }
  return true;
}

function loopContext(pullRequest, observedAt) {
  const markerComments = pullRequest.issueComments.values.filter(
    (comment) =>
      normalizedLogin(comment.author?.login) === 'github-actions' &&
      comment.author?.id === GITHUB_ACTIONS_ACTOR_ID &&
      String(comment.author?.type || '').toLowerCase() === 'bot' &&
      comment.body?.includes(STATUS_MARKER)
  );
  if (markerComments.length === 0) {
    return { state: null, comment: null, status: 'unknown', reason: 'marker_absent' };
  }
  if (markerComments.length !== 1) {
    return { state: null, comment: null, status: 'unknown', reason: 'marker_ambiguous' };
  }
  const state = parseLoopState(markerComments[0].body);
  const rawState = rawLoopState(markerComments[0].body);
  if (!state || !validLoopState(rawState) || !loopStateMatchesThreadIdentities(rawState, pullRequest, observedAt)) {
    return { state: null, comment: markerComments[0], status: 'unknown', reason: 'marker_invalid' };
  }
  return { state: rawState, comment: markerComments[0], status: 'observed', reason: null };
}

function fixLinkForThread(thread, context) {
  if (!context.state) return unknownFixLink(context.reason);
  const reports = context.state.processedReviews
    .filter((entry) => Array.isArray(entry?.threadIds) && entry.threadIds.includes(thread.id))
    .map((entry) => ({
      relation: 'status_marker_reports_processing',
      threadId: thread.id,
      sourceCommentId: context.comment.id,
      reviewId: Number.isSafeInteger(Number(entry.reviewId)) ? String(entry.reviewId) : null,
      inputHeadOid: /^[0-9a-f]{40}$/i.test(String(entry.headSha || '')) ? String(entry.headSha) : null,
      attemptNumber: Number.isSafeInteger(Number(entry.attempt)) ? Number(entry.attempt) : null,
      result: entry.result ? String(entry.result) : null,
      reportedAt: Number.isFinite(Date.parse(entry.at)) ? String(entry.at) : null,
      workflowRunUrl: null,
      workflowRunUrlReason: 'not_recorded_per_processed_review'
    }))
    .sort(
      (left, right) =>
        (left.attemptNumber ?? Number.MAX_SAFE_INTEGER) - (right.attemptNumber ?? Number.MAX_SAFE_INTEGER) ||
        compareText(left.reviewId || '', right.reviewId || '')
    );
  if (reports.length === 0) return unknownFixLink('status_marker_has_no_matching_thread_report');
  return {
    status: 'reported',
    commitOid: null,
    pullRequestNumber: null,
    evidenceIds: reports.map((report) => String(report.sourceCommentId)),
    reports,
    confidence: 'reported_not_verified',
    causalAttribution: 'not_assessed',
    reason: null
  };
}

function threadObservation(pullRequest, thread, context) {
  const rootPair = threadRootPair(pullRequest, thread);
  const root = rootPair.graphql;
  const restComment = rootPair.rest;
  return {
    id: `review-thread:${thread.id}`,
    origin: {
      type: 'review_thread_root',
      classificationStatus: 'classified',
      nodeId: thread.id,
      commentId: root?.id || null,
      commentNodeId: root?.nodeId || null,
      reviewId: root?.review?.id || null,
      reviewNodeId: root?.review?.nodeId || null,
      reviewedCommitOid: root?.review?.commitId || null,
      path: thread.path || null,
      line: thread.line,
      provenance: ['audit.pullRequests.reviewThreads', 'audit.pullRequests.reviewComments']
    },
    severity: severityClassification(root?.body),
    source: sourceObservation(restComment?.author, root?.author),
    resolution: {
      status: thread.isResolved ? 'resolved' : 'unresolved',
      isOutdated: thread.isOutdated,
      resolvedAt: null,
      resolvedAtStatus: thread.isResolved ? 'unknown' : 'not_applicable',
      confidence: 'high',
      provenance: ['github.reviewThread.isResolved', 'github.reviewThread.isOutdated']
    },
    headRelationship: {
      status: root?.review?.commitId ? 'classified' : 'unknown',
      value: root?.review?.commitId ? (root.review.commitId === pullRequest.head.oid ? 'exact_head' : 'stale_head') : null,
      confidence: root?.review?.commitId ? 'high' : 'unknown'
    },
    fixLink: fixLinkForThread(thread, context)
  };
}

function findingObservations(pullRequest, context) {
  return pullRequest.reviewThreads.values
    .map((thread) => threadObservation(pullRequest, thread, context))
    .sort((left, right) => compareText(left.id, right.id));
}

function countBy(values, keys, selector) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) {
    const key = selector(value);
    counts[key in counts ? key : 'unknown'] += 1;
  }
  return counts;
}

function findingSummary(observations) {
  return {
    threadRootObservationCount: observations.length,
    priorityLabeledThreadRootCount: observations.filter((entry) => entry.severity.status === 'classified').length,
    unknownPriorityThreadRootCount: observations.filter((entry) => entry.severity.status === 'unknown').length,
    currentUnresolvedPriorityLabeledThreadRootCount: observations.filter(
      (entry) =>
        entry.severity.status === 'classified' &&
        entry.resolution.status === 'unresolved' &&
        entry.resolution.isOutdated === false &&
        entry.headRelationship.value === 'exact_head'
    ).length,
    bySeverity: countBy(observations, SEVERITY_ORDER, (entry) => entry.severity.value || 'unknown'),
    bySource: countBy(observations, SOURCE_ORDER, (entry) => entry.source.classification.value),
    byOrigin: countBy(observations, ORIGIN_ORDER, (entry) => entry.origin.type),
    byClassificationStatus: countBy(observations, CLASSIFICATION_ORDER, (entry) => entry.severity.status)
  };
}

function reviewLoop(pullRequest, context) {
  const submittedReviews = pullRequest.reviews.values.filter((review) => review.submittedAt !== null);
  return {
    number: context.state?.attempts ?? null,
    status: context.status,
    reason: context.reason,
    definition: 'codex-review-fix-loop-v1-reserved-attempts',
    exactHeadReviewSubmissionCount: submittedReviews.filter((review) => review.commitId === pullRequest.head.oid).length,
    reviewSubmissionCount: submittedReviews.length,
    statusMarkerCommentId: context.comment?.id || null,
    statusMarkerState: context.state?.status || null,
    retainedProcessedReviewCount: context.state?.processedReviews.length ?? null,
    confidence: context.state ? 'api_attributed_strict_schema' : 'unknown',
    provenance: context.state ? ['audit.pullRequests.issueComments.codex-review-fix-loop:v1'] : [],
    causalAttribution: 'not_assessed'
  };
}

function stackMetadata(pullRequest, openPullRequests) {
  if (
    !pullRequest.head.repository ||
    !pullRequest.base.repository ||
    !sameRepositoryIdentity(pullRequest.head.repository, pullRequest.base.repository)
  ) {
    return {
      classificationStatus: 'unknown',
      parentCandidates: [],
      childCandidates: [],
      openGraphRole: 'unknown',
      stackId: null,
      position: null,
      confidence: 'unknown',
      method: 'same-repository-open-pr-ref-topology-v1',
      provenance: ['audit.inventory.openPullRequests'],
      causalAttribution: 'not_assessed',
      reason:
        pullRequest.head.repository && pullRequest.base.repository
          ? 'pull_request_cross_repository'
          : 'pull_request_repository_identity_unknown'
    };
  }
  const parents = openPullRequests.filter(
    (candidate) =>
      candidate.number !== pullRequest.number &&
      candidate.isDraft === false &&
      candidate.head.repository !== null &&
      candidate.base.repository !== null &&
      sameRepositoryIdentity(candidate.head.repository, candidate.base.repository) &&
      sameRepositoryIdentity(candidate.head.repository, pullRequest.base.repository) &&
      candidate.head.refName === pullRequest.base.refName
  );
  const children = openPullRequests.filter(
    (candidate) =>
      candidate.number !== pullRequest.number &&
      candidate.isDraft === false &&
      candidate.head.repository !== null &&
      candidate.base.repository !== null &&
      sameRepositoryIdentity(candidate.head.repository, candidate.base.repository) &&
      sameRepositoryIdentity(candidate.head.repository, pullRequest.head.repository) &&
      sameRepositoryIdentity(candidate.base.repository, pullRequest.head.repository) &&
      candidate.base.refName === pullRequest.head.refName
  );
  const ambiguous = parents.length > 1 || children.length > 1;
  const openGraphRole = ambiguous
    ? 'ambiguous'
    : parents.length === 0 && children.length === 0
      ? 'isolated'
      : parents.length === 0
        ? 'root'
        : children.length === 0
          ? 'leaf'
          : 'middle';
  return {
    classificationStatus: ambiguous ? 'unknown' : 'classified',
    parentCandidates: parents.map((candidate) => ({ number: candidate.number, isDraft: candidate.isDraft })),
    childCandidates: children.map((candidate) => ({ number: candidate.number, isDraft: candidate.isDraft })),
    openGraphRole,
    stackId: null,
    position: null,
    confidence: ambiguous ? 'unknown' : 'deterministic_observed_open_graph',
    method: 'same-repository-open-pr-ref-topology-v1',
    provenance: ['audit.inventory.openPullRequests'],
    causalAttribution: 'not_assessed',
    reason: ambiguous ? 'multiple_open_ref_candidates' : null
  };
}

function instructionReference(reference = {}) {
  const id = reference.id ? String(reference.id) : null;
  const digest = reference.digest ? String(reference.digest) : null;
  if (digest && !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error('Instruction digest must use sha256:<64 lowercase hex characters>.');
  }
  return {
    status: id || digest ? (id && digest ? 'reported' : 'partial') : 'unknown',
    id,
    digest,
    confidence: id && digest ? 'runner_asserted' : 'unknown',
    provenance: id || digest ? ['trusted-runner-argument'] : [],
    reason: id && digest ? null : id || digest ? 'instruction_reference_incomplete' : 'instruction_reference_not_supplied'
  };
}

function samplingMetadata(sampling = {}) {
  const slotId = String(sampling.slotId || '');
  const expectedAt = String(sampling.expectedAt || '');
  const runnerVersion = String(sampling.runnerVersion || '');
  if (!/^\d{4}-\d{2}-\d{2}T(?:00|12):00:00\.000Z$/.test(expectedAt) || !canonicalTimestamp(expectedAt)) {
    throw new Error('Analytics expectedAt must be a valid 00:00 or 12:00 UTC slot.');
  }
  if (slotId !== `twice-daily:${expectedAt}`) {
    throw new Error('Analytics slot ID must be derived from expectedAt.');
  }
  if (!runnerVersion || runnerVersion.length > 128) {
    throw new Error('Analytics runner version must be a nonempty value of at most 128 characters.');
  }
  return {
    cadence: 'twice_daily_fixed_utc',
    slotId,
    expectedAt,
    coverageState: 'complete',
    runnerVersion
  };
}

function eventPullRequest(pullRequest, record) {
  const context = loopContext(pullRequest, record.audit.completedAt);
  const observations = findingObservations(pullRequest, context);
  return {
    number: pullRequest.number,
    nodeId: pullRequest.nodeId,
    url: pullRequest.url,
    state: pullRequest.state,
    isDraft: pullRequest.isDraft,
    title: pullRequest.title,
    createdAt: pullRequest.createdAt,
    updatedAt: pullRequest.updatedAt,
    authorAssociation: pullRequest.authorAssociation,
    author: pullRequest.author,
    head: pullRequest.head,
    base: pullRequest.base,
    merge: pullRequest.merge,
    reviewLoop: reviewLoop(pullRequest, context),
    stack: stackMetadata(pullRequest, record.inventory.openPullRequests),
    findings: observations,
    findingSummary: findingSummary(observations)
  };
}

function eventUnknowns(pullRequests, instructions) {
  const unknowns = [];
  for (const [name, reference] of Object.entries(instructions)) {
    if (reference.status !== 'reported') {
      unknowns.push({ path: `instructions.${name}`, reason: 'instruction_version_not_fully_supplied' });
    }
  }
  for (const pullRequest of pullRequests) {
    if (pullRequest.author === null) {
      unknowns.push({ path: `pullRequests.${pullRequest.number}.author`, reason: 'actor_not_exposed' });
    }
    if (pullRequest.stack.classificationStatus === 'unknown') {
      unknowns.push({
        path: `pullRequests.${pullRequest.number}.stack.openGraphRole`,
        reason: pullRequest.stack.reason
      });
    }
    if (pullRequest.stack.stackId === null) {
      unknowns.push({ path: `pullRequests.${pullRequest.number}.stack.stackId`, reason: 'graphite_metadata_not_fetched' });
    }
    if (pullRequest.stack.position === null) {
      unknowns.push({ path: `pullRequests.${pullRequest.number}.stack.position`, reason: 'complete_stack_not_observed' });
    }
    if (pullRequest.reviewLoop.status === 'unknown') {
      unknowns.push({
        path: `pullRequests.${pullRequest.number}.reviewLoop.number`,
        reason: pullRequest.reviewLoop.reason
      });
    }
    for (const observation of pullRequest.findings) {
      if (observation.severity.status === 'unknown') {
        unknowns.push({ path: `findings.${observation.id}.severity`, reason: 'no_explicit_priority_label' });
      }
      if (observation.source.classification.status === 'unknown') {
        unknowns.push({ path: `findings.${observation.id}.source`, reason: 'actor_identity_not_reconciled' });
      }
      if (observation.headRelationship.status === 'unknown') {
        unknowns.push({ path: `findings.${observation.id}.headRelationship`, reason: 'review_commit_not_exposed' });
      }
      if (observation.resolution.status === 'resolved' && observation.resolution.resolvedAt === null) {
        unknowns.push({
          path: `findings.${observation.id}.resolution.resolvedAt`,
          reason: 'timestamp_not_exposed'
        });
      }
      if (observation.fixLink.status === 'unknown') {
        unknowns.push({ path: `findings.${observation.id}.fixLink`, reason: observation.fixLink.reason });
      } else if (observation.fixLink.commitOid === null) {
        unknowns.push({ path: `findings.${observation.id}.fixLink.commitOid`, reason: 'output_commit_not_recorded' });
      }
    }
  }
  return unknowns.sort((left, right) => compareText(left.path, right.path) || compareText(left.reason, right.reason));
}

function aggregateSummary(pullRequests) {
  const observations = pullRequests.flatMap((pullRequest) => pullRequest.findings);
  const reviewLoops = pullRequests.map((pullRequest) => pullRequest.reviewLoop.number);
  return {
    pullRequestCount: pullRequests.length,
    reviewLoopKnownCount: reviewLoops.filter((value) => value !== null).length,
    reviewLoopUnknownCount: reviewLoops.filter((value) => value === null).length,
    reviewLoopNumberTotal: reviewLoops.some((value) => value === null)
      ? null
      : reviewLoops.reduce((total, value) => total + value, 0),
    ...findingSummary(observations)
  };
}

export function createAuditEvent(record, proof, options = {}) {
  if (proof.auditId !== record.audit.id || proof.digest !== record.integrity.digest) {
    throw new Error('Audit proof does not match the supplied audit snapshot.');
  }
  const instructions = {
    reviewer: instructionReference(options.reviewerInstruction),
    fixer: instructionReference(options.fixerInstruction)
  };
  const sampling = samplingMetadata(options.sampling);
  const pullRequests = record.pullRequests.map((pullRequest) => eventPullRequest(pullRequest, record));
  return addIntegrity({
    kind: AUDIT_EVENT_KIND,
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    eventType: AUDIT_EVENT_TYPE,
    eventId: `${record.audit.id}:complete-snapshot`,
    observedAt: record.audit.completedAt,
    run: {
      id: record.audit.id,
      startedAt: record.audit.startedAt,
      completedAt: record.audit.completedAt
    },
    repository: record.repository,
    sampling,
    instructions,
    pullRequests,
    summary: aggregateSummary(pullRequests),
    provenance: {
      auditKind: record.kind,
      auditSchemaVersion: record.schemaVersion,
      auditId: record.audit.id,
      auditDigest: record.integrity.digest,
      authenticatedAs: record.audit.authenticatedAs,
      apiVersion: record.audit.apiVersion,
      classifier: { id: AUDIT_EVENT_CLASSIFIER_ID, version: 1 },
      projector: {
        id: CURRENT_PROJECTOR_COMPATIBILITY.id,
        version: AUDIT_EVENT_PROJECTOR_VERSION,
        implementation: {
          kind: CURRENT_PROJECTOR_COMPATIBILITY.manifestKind,
          digest: PROJECTOR_IMPLEMENTATION_DIGEST,
          files: PROJECTOR_IMPLEMENTATION_FILES
        }
      },
      collectionStatus: 'complete'
    },
    confidence: {
      completeness: 'high',
      currentness: 'bounded_observation_window',
      causalAttribution: 'not_assessed',
      attestation: 'self_consistent_unkeyed_not_origin_authentication'
    },
    causalAttribution: {
      status: 'not_claimed',
      statement: 'This event records observed associations only and does not attribute reviews, resolutions, or fixes causally.'
    },
    unknowns: eventUnknowns(pullRequests, instructions),
    log: {
      previousEventDigest: options.previousEventDigest || null
    }
  });
}

function canonicalTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort())
  );
}

function exactStringArray(value, expected) {
  return Array.isArray(value) && canonicalJson(value) === canonicalJson(expected);
}

function supportedSourceAudit(event) {
  const supported = SOURCE_AUDIT_COMPATIBILITY.get(event.schemaVersion);
  if (
    !Array.isArray(supported) ||
    typeof event.provenance?.auditKind !== 'string' ||
    !Number.isSafeInteger(event.provenance?.auditSchemaVersion) ||
    typeof event.provenance?.apiVersion !== 'string'
  ) {
    return false;
  }
  return supported.some(
    (source) =>
      source.kind === event.provenance.auditKind &&
      source.schemaVersion === event.provenance.auditSchemaVersion &&
      source.apiVersions.has(event.provenance.apiVersion)
  );
}

function lockTime(value) {
  const current = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  if (!Number.isFinite(current.getTime())) throw new Error('Audit analytics event lock clock is invalid.');
  return current;
}

function validLockOwner(owner) {
  return (
    exactKeys(owner, ['acquiredAt', 'host', 'kind', 'ownerId', 'pid', 'schemaVersion']) &&
    owner.kind === LOCK_KIND &&
    owner.schemaVersion === LOCK_SCHEMA_VERSION &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    typeof owner.host === 'string' &&
    owner.host.length > 0 &&
    owner.host.length <= 255 &&
    canonicalTimestamp(owner.acquiredAt) &&
    typeof owner.ownerId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner.ownerId)
  );
}

async function inspectAppendLock(lockFile) {
  const handle = await open(lockFile, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const identity = await handle.stat();
    if (
      !identity.isFile() ||
      ![1, 2].includes(identity.nlink) ||
      (identity.mode & 0o777) !== 0o600 ||
      (typeof process.getuid === 'function' && identity.uid !== process.getuid())
    ) {
      throw new Error('Audit analytics event lock must be a runner-owned mode-0600 regular file.');
    }
    const raw = await handle.readFile('utf8');
    return { identity, raw };
  } finally {
    await handle.close();
  }
}

function appendLockOwner(snapshot) {
  if (!snapshot.raw.endsWith('\n') || snapshot.raw.slice(0, -1).includes('\n')) return null;
  let owner;
  try {
    owner = JSON.parse(snapshot.raw.slice(0, -1));
  } catch {
    return null;
  }
  return validLockOwner(owner) && snapshot.raw === `${canonicalJson(owner)}\n` ? owner : null;
}

async function appendLockOwnerFile(lockFile, snapshot, owner) {
  if (snapshot.identity.nlink !== 2) {
    throw new Error('Audit analytics event lock publication or recovery was interrupted.');
  }
  const ownerFile = `${lockFile}.${owner.ownerId}.owner`;
  const ownerIdentity = await lstat(ownerFile).catch(() => null);
  if (!ownerIdentity?.isFile() || ownerIdentity.dev !== snapshot.identity.dev || ownerIdentity.ino !== snapshot.identity.ino) {
    throw new Error('Audit analytics event lock has an unrecognized hard-link alias.');
  }
  return ownerFile;
}

function lockOwnerIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

async function unlinkUnchangedLock(lockFile, expected, owner) {
  const current = await lstat(lockFile);
  if (current.dev !== expected.identity.dev || current.ino !== expected.identity.ino) {
    throw new Error('Audit analytics event lock identity changed before recovery.');
  }
  const confirmed = await inspectAppendLock(lockFile);
  if (
    confirmed.identity.dev !== expected.identity.dev ||
    confirmed.identity.ino !== expected.identity.ino ||
    confirmed.raw !== expected.raw
  ) {
    throw new Error('Audit analytics event lock changed before recovery.');
  }
  const ownerFile = await appendLockOwnerFile(lockFile, confirmed, owner);
  await unlink(ownerFile);
  const elected = await inspectAppendLock(lockFile);
  if (
    elected.identity.dev !== expected.identity.dev ||
    elected.identity.ino !== expected.identity.ino ||
    elected.identity.nlink !== 1 ||
    elected.raw !== expected.raw
  ) {
    throw new Error('Audit analytics event lock changed after recovery election.');
  }
  const finalIdentity = await lstat(lockFile);
  if (finalIdentity.dev !== expected.identity.dev || finalIdentity.ino !== expected.identity.ino) {
    throw new Error('Audit analytics event lock identity changed before recovery.');
  }
  await unlink(lockFile);
}

async function createAppendLock(lockFile, now) {
  const owner = {
    acquiredAt: lockTime(now).toISOString(),
    host: hostname(),
    kind: LOCK_KIND,
    ownerId: randomUUID(),
    pid: process.pid,
    schemaVersion: LOCK_SCHEMA_VERSION
  };
  const ownerFile = `${lockFile}.${owner.ownerId}.owner`;
  const handle = await open(ownerFile, 'wx', 0o600);
  let identity;
  let published = false;
  try {
    identity = await handle.stat();
    const payload = Buffer.from(`${canonicalJson(owner)}\n`, 'utf8');
    const { bytesWritten } = await handle.write(payload);
    if (bytesWritten !== payload.length) throw new Error('Audit analytics event lock metadata write was incomplete.');
    await handle.sync();
    await link(ownerFile, lockFile);
    published = true;
    const confirmed = await inspectAppendLock(lockFile);
    if (
      confirmed.identity.dev !== identity.dev ||
      confirmed.identity.ino !== identity.ino ||
      confirmed.identity.nlink !== 2 ||
      confirmed.raw !== payload.toString('utf8')
    ) {
      throw new Error('Audit analytics event lock identity changed during acquisition.');
    }
    return { handle, identity, ownerFile };
  } catch (error) {
    await handle.close().catch(() => undefined);
    if (identity && published) {
      const current = await lstat(lockFile).catch(() => null);
      if (current && current.dev === identity.dev && current.ino === identity.ino) {
        await unlink(lockFile).catch(() => undefined);
      }
    }
    const ownerIdentity = await lstat(ownerFile).catch(() => null);
    if (identity && ownerIdentity?.dev === identity.dev && ownerIdentity.ino === identity.ino) {
      await unlink(ownerFile).catch(() => undefined);
    }
    throw error;
  }
}

async function acquireAppendLock(lockFile, now, leaseMilliseconds) {
  if (!Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1) {
    throw new Error('Audit analytics event lock lease must be a positive integer.');
  }
  try {
    return await createAppendLock(lockFile, now);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const existing = await inspectAppendLock(lockFile);
  const owner = appendLockOwner(existing);
  if (!owner) {
    throw new Error('Audit analytics event lock metadata is incomplete or invalid and cannot be reclaimed safely.');
  }
  await appendLockOwnerFile(lockFile, existing, owner);
  const age = lockTime(now).getTime() - Date.parse(owner.acquiredAt);
  if (age < leaseMilliseconds) {
    throw new Error('Audit analytics event append lock is still within its lease.');
  }
  if (owner && owner.host !== hostname()) {
    throw new Error('Audit analytics event append lock belongs to another host and cannot be reclaimed safely.');
  }
  if (owner && lockOwnerIsAlive(owner.pid)) {
    throw new Error('Audit analytics event append lock owner is still alive.');
  }
  await unlinkUnchangedLock(lockFile, existing, owner);
  try {
    return await createAppendLock(lockFile, now);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('Audit analytics event append lock was acquired by another writer during recovery.', {
        cause: error
      });
    }
    throw error;
  }
}

function validActor(actor) {
  return (
    exactKeys(actor, ['id', 'login', 'type']) &&
    Number.isSafeInteger(actor.id) &&
    actor.id > 0 &&
    typeof actor.login === 'string' &&
    actor.login.length > 0 &&
    typeof actor.type === 'string' &&
    actor.type.length > 0
  );
}

function validOptionalActor(actor) {
  return (
    exactKeys(actor, ['id', 'login', 'type']) &&
    ((actor.id === null && actor.login === null && actor.type === null) || validActor(actor))
  );
}

function validRefIdentity(reference) {
  return (
    exactKeys(reference, ['oid', 'refName', 'repository']) &&
    /^[0-9a-f]{40}$/i.test(String(reference.oid || '')) &&
    typeof reference.refName === 'string' &&
    reference.refName.length > 0 &&
    (reference.repository === null || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(reference.repository))
  );
}

function validPullRequestUrl(value, repository, number) {
  return value === `https://github.com/${repository.nameWithOwner}/pull/${number}`;
}

function sameRepositoryIdentity(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
}

function validMergeState(merge) {
  return (
    exactKeys(merge, ['mergeable', 'mergeableState', 'rebaseable']) &&
    (merge.mergeable === null || typeof merge.mergeable === 'boolean') &&
    typeof merge.mergeableState === 'string' &&
    merge.mergeableState.length > 0 &&
    (merge.rebaseable === null || typeof merge.rebaseable === 'boolean')
  );
}

function validInstructionReference(reference) {
  return (
    exactKeys(reference, ['status', 'id', 'digest', 'confidence', 'provenance', 'reason']) &&
    ['reported', 'partial', 'unknown'].includes(reference.status) &&
    (reference.id === null || typeof reference.id === 'string') &&
    (reference.digest === null || /^sha256:[0-9a-f]{64}$/.test(reference.digest)) &&
    ((reference.status === 'reported' &&
      Boolean(reference.id) &&
      Boolean(reference.digest) &&
      reference.confidence === 'runner_asserted' &&
      reference.reason === null &&
      exactStringArray(reference.provenance, ['trusted-runner-argument'])) ||
      (reference.status === 'partial' &&
        Boolean(reference.id || reference.digest) &&
        !(reference.id && reference.digest) &&
        reference.confidence === 'unknown' &&
        reference.reason === 'instruction_reference_incomplete' &&
        exactStringArray(reference.provenance, ['trusted-runner-argument'])) ||
      (reference.status === 'unknown' &&
        reference.id === null &&
        reference.digest === null &&
        reference.confidence === 'unknown' &&
        reference.reason === 'instruction_reference_not_supplied' &&
        exactStringArray(reference.provenance, [])))
  );
}

function validStackCandidate(candidate) {
  return (
    exactKeys(candidate, ['number', 'isDraft']) &&
    Number.isSafeInteger(candidate.number) &&
    candidate.number > 0 &&
    typeof candidate.isDraft === 'boolean'
  );
}

function validFinding(finding, pullRequest, observedAt, schema) {
  const severityKnown = finding?.severity?.status === 'classified';
  const sourceKnown = finding?.source?.classification?.status === 'classified';
  const headKnown = finding?.headRelationship?.status === 'classified';
  const resolutionKnown = ['resolved', 'unresolved'].includes(finding?.resolution?.status);
  const fixReported = finding?.fixLink?.status === 'reported';
  const expectedHeadRelationship = finding?.origin?.reviewedCommitOid
    ? {
        status: 'classified',
        value: finding.origin.reviewedCommitOid === pullRequest.head.oid ? 'exact_head' : 'stale_head',
        confidence: 'high'
      }
    : { status: 'unknown', value: null, confidence: 'unknown' };
  const expectedSource = sourceObservation(
    finding?.source?.actor,
    finding?.source?.graphqlLogin ? { login: finding.source.graphqlLogin } : null
  );
  const reports = Array.isArray(finding?.fixLink?.reports) ? finding.fixLink.reports : [];
  const reportReviewIds = reports.map((report) => report.reviewId);
  const reportsValid =
    reports.length > 0 &&
    reports.length <= pullRequest.reviewLoop.retainedProcessedReviewCount &&
    new Set(reportReviewIds).size === reportReviewIds.length &&
    reports.every(
      (report) =>
        exactKeys(report, [
          'relation',
          'threadId',
          'sourceCommentId',
          'reviewId',
          'inputHeadOid',
          'attemptNumber',
          'result',
          'reportedAt',
          'workflowRunUrl',
          'workflowRunUrlReason'
        ]) &&
        report?.relation === 'status_marker_reports_processing' &&
        typeof report.threadId === 'string' &&
        report.threadId === finding.origin.nodeId &&
        Number.isSafeInteger(report.sourceCommentId) &&
        pullRequest.reviewLoop.status === 'observed' &&
        report.sourceCommentId === pullRequest.reviewLoop.statusMarkerCommentId &&
        typeof report.reviewId === 'string' &&
        /^[1-9]\d*$/.test(report.reviewId) &&
        Number.isSafeInteger(Number(report.reviewId)) &&
        (finding.origin.reviewId === null || report.reviewId === finding.origin.reviewId) &&
        /^[0-9a-f]{40}$/i.test(report.inputHeadOid) &&
        (finding.origin.reviewedCommitOid === null || report.inputHeadOid === finding.origin.reviewedCommitOid) &&
        Number.isSafeInteger(report.attemptNumber) &&
        report.attemptNumber >= 0 &&
        report.attemptNumber <= pullRequest.reviewLoop.number &&
        report.attemptNumber <= schema.maxFixAttempts &&
        LOOP_RESULTS_V1.has(report.result) &&
        report.result !== 'clean' &&
        typeof report.reportedAt === 'string' &&
        canonicalTimestamp(report.reportedAt) &&
        Date.parse(report.reportedAt) <= Date.parse(observedAt) &&
        report.workflowRunUrl === null &&
        report.workflowRunUrlReason === 'not_recorded_per_processed_review'
    ) &&
    reports.every(
      (report, index) =>
        index === 0 ||
        reports[index - 1].attemptNumber < report.attemptNumber ||
        (reports[index - 1].attemptNumber === report.attemptNumber &&
          compareText(reports[index - 1].reviewId, report.reviewId) < 0)
    );
  const expectedEvidenceIds =
    fixReported && Array.isArray(finding?.fixLink?.reports)
      ? finding.fixLink.reports.map((report) => String(report.sourceCommentId))
      : [];
  return (
    exactKeys(finding, ['id', 'origin', 'severity', 'source', 'resolution', 'headRelationship', 'fixLink']) &&
    /^review-thread:.+/.test(finding.id) &&
    exactKeys(finding.origin, [
      'type',
      'classificationStatus',
      'nodeId',
      'commentId',
      'commentNodeId',
      'reviewId',
      'reviewNodeId',
      'reviewedCommitOid',
      'path',
      'line',
      'provenance'
    ]) &&
    finding.origin?.type === 'review_thread_root' &&
    finding.origin.classificationStatus === 'classified' &&
    typeof finding.origin.nodeId === 'string' &&
    finding.id === `review-thread:${finding.origin.nodeId}` &&
    typeof finding.origin.commentId === 'string' &&
    /^\d+$/.test(finding.origin.commentId) &&
    typeof finding.origin.commentNodeId === 'string' &&
    finding.origin.commentNodeId.length > 0 &&
    (finding.origin.reviewId === null || /^\d+$/.test(finding.origin.reviewId)) &&
    (finding.origin.reviewNodeId === null ||
      (typeof finding.origin.reviewNodeId === 'string' && finding.origin.reviewNodeId.length > 0)) &&
    (finding.origin.reviewNodeId !== null || (finding.origin.reviewId === null && finding.origin.reviewedCommitOid === null)) &&
    (finding.origin.reviewedCommitOid === null || /^[0-9a-f]{40}$/i.test(finding.origin.reviewedCommitOid)) &&
    typeof finding.origin.path === 'string' &&
    (finding.origin.line === null || Number.isSafeInteger(finding.origin.line)) &&
    exactStringArray(finding.origin.provenance, ['audit.pullRequests.reviewThreads', 'audit.pullRequests.reviewComments']) &&
    exactKeys(finding.severity, ['status', 'value', 'confidence', 'method', 'validity', 'validityReason']) &&
    (severityKnown || finding.severity?.status === 'unknown') &&
    (severityKnown ? ['P0', 'P1', 'P2', 'P3'].includes(finding.severity.value) : finding.severity.value === null) &&
    finding.severity.confidence === (severityKnown ? 'high' : 'unknown') &&
    finding.severity.method === 'explicit-priority-label-v1' &&
    finding.severity.validity === 'unknown' &&
    finding.severity.validityReason === 'not_assessed' &&
    exactKeys(finding.source, ['actor', 'graphqlLogin', 'reconciliation', 'classification']) &&
    validOptionalActor(finding.source.actor) &&
    (finding.source.graphqlLogin === null || typeof finding.source.graphqlLogin === 'string') &&
    exactKeys(finding.source.classification, ['status', 'value', 'confidence', 'method']) &&
    (sourceKnown || finding.source?.classification?.status === 'unknown') &&
    SOURCE_ORDER.includes(finding.source?.classification?.value) &&
    (sourceKnown ? finding.source.classification.value !== 'unknown' : finding.source.classification.value === 'unknown') &&
    (sourceKnown
      ? ['high', 'medium'].includes(finding.source.classification.confidence)
      : finding.source.classification.confidence === 'unknown') &&
    ['matched', 'single_surface', 'mismatch'].includes(finding.source?.reconciliation) &&
    ['rest-review-comment-actor-v1', 'rest-graphql-actor-reconciliation-v1'].includes(finding.source.classification.method) &&
    canonicalJson(finding.source) === canonicalJson(expectedSource) &&
    exactKeys(finding.resolution, ['status', 'isOutdated', 'resolvedAt', 'resolvedAtStatus', 'confidence', 'provenance']) &&
    resolutionKnown &&
    typeof finding.resolution.isOutdated === 'boolean' &&
    finding.resolution.resolvedAt === null &&
    finding.resolution.resolvedAtStatus === (finding.resolution.status === 'resolved' ? 'unknown' : 'not_applicable') &&
    finding.resolution.confidence === 'high' &&
    exactStringArray(finding.resolution.provenance, ['github.reviewThread.isResolved', 'github.reviewThread.isOutdated']) &&
    exactKeys(finding.headRelationship, ['status', 'value', 'confidence']) &&
    (headKnown || finding.headRelationship?.status === 'unknown') &&
    (headKnown
      ? ['exact_head', 'stale_head'].includes(finding.headRelationship.value)
      : finding.headRelationship.value === null) &&
    (headKnown
      ? /^[0-9a-f]{40}$/i.test(String(finding.origin.reviewedCommitOid || ''))
      : finding.origin.reviewedCommitOid === null) &&
    finding.headRelationship.confidence === (headKnown ? 'high' : 'unknown') &&
    canonicalJson(finding.headRelationship) === canonicalJson(expectedHeadRelationship) &&
    (fixReported || finding.fixLink?.status === 'unknown') &&
    exactKeys(
      finding.fixLink,
      fixReported
        ? ['status', 'commitOid', 'pullRequestNumber', 'evidenceIds', 'reports', 'confidence', 'causalAttribution', 'reason']
        : ['status', 'commitOid', 'pullRequestNumber', 'evidenceIds', 'confidence', 'causalAttribution', 'reason']
    ) &&
    finding.fixLink.commitOid === null &&
    finding.fixLink.pullRequestNumber === null &&
    Array.isArray(finding.fixLink.evidenceIds) &&
    finding.fixLink.evidenceIds.every((id) => /^\d+$/.test(id)) &&
    canonicalJson(finding.fixLink.evidenceIds) === canonicalJson(expectedEvidenceIds) &&
    finding.fixLink.causalAttribution === 'not_assessed' &&
    (fixReported
      ? reportsValid && finding.fixLink.confidence === 'reported_not_verified' && finding.fixLink.reason === null
      : finding.fixLink.confidence === 'unknown' &&
        typeof finding.fixLink.reason === 'string' &&
        !Object.hasOwn(finding.fixLink, 'reports'))
  );
}

function validEventPullRequest(pullRequest, repository, observedAt, schema) {
  const findings = pullRequest?.findings;
  const findingIds = Array.isArray(findings) ? findings.map((finding) => finding.id) : [];
  const candidateLists = [pullRequest?.stack?.parentCandidates, pullRequest?.stack?.childCandidates];
  const reviewLoopObserved = pullRequest?.reviewLoop?.status === 'observed';
  const stackKnown = pullRequest?.stack?.classificationStatus === 'classified';
  const reportGroups = collectFixReportGroups(pullRequest);
  const exactHeadReportGroupCount = reportGroups
    ? [...reportGroups.values()].filter(
        (report) =>
          typeof report.inputHeadOid === 'string' && report.inputHeadOid.toLowerCase() === pullRequest?.head?.oid?.toLowerCase()
      ).length
    : -1;
  return (
    exactKeys(pullRequest, [
      'number',
      'nodeId',
      'url',
      'state',
      'isDraft',
      'title',
      'createdAt',
      'updatedAt',
      'authorAssociation',
      'author',
      'head',
      'base',
      'merge',
      'reviewLoop',
      'stack',
      'findings',
      'findingSummary'
    ]) &&
    Number.isSafeInteger(pullRequest.number) &&
    pullRequest.number > 0 &&
    typeof pullRequest.nodeId === 'string' &&
    pullRequest.nodeId.length > 0 &&
    validPullRequestUrl(pullRequest.url, repository, pullRequest.number) &&
    pullRequest.state === 'OPEN' &&
    pullRequest.isDraft === false &&
    typeof pullRequest.title === 'string' &&
    typeof pullRequest.createdAt === 'string' &&
    typeof pullRequest.updatedAt === 'string' &&
    Number.isFinite(Date.parse(pullRequest.createdAt)) &&
    Number.isFinite(Date.parse(pullRequest.updatedAt)) &&
    Date.parse(pullRequest.createdAt) <= Date.parse(pullRequest.updatedAt) &&
    typeof pullRequest.authorAssociation === 'string' &&
    (pullRequest.author === null || validActor(pullRequest.author)) &&
    validRefIdentity(pullRequest.head) &&
    validRefIdentity(pullRequest.base) &&
    (pullRequest.base.repository === null || sameRepositoryIdentity(pullRequest.base.repository, repository.nameWithOwner)) &&
    validMergeState(pullRequest.merge) &&
    exactKeys(pullRequest.reviewLoop, [
      'number',
      'status',
      'reason',
      'definition',
      'exactHeadReviewSubmissionCount',
      'reviewSubmissionCount',
      'statusMarkerCommentId',
      'statusMarkerState',
      'retainedProcessedReviewCount',
      'confidence',
      'provenance',
      'causalAttribution'
    ]) &&
    ((reviewLoopObserved &&
      Number.isSafeInteger(pullRequest.reviewLoop.number) &&
      pullRequest.reviewLoop.number >= 0 &&
      pullRequest.reviewLoop.number <= schema.maxFixAttempts &&
      pullRequest.reviewLoop.reason === null) ||
      (pullRequest.reviewLoop?.status === 'unknown' &&
        pullRequest.reviewLoop.number === null &&
        ['marker_absent', 'marker_ambiguous', 'marker_invalid'].includes(pullRequest.reviewLoop.reason))) &&
    pullRequest.reviewLoop?.definition === 'codex-review-fix-loop-v1-reserved-attempts' &&
    Number.isSafeInteger(pullRequest.reviewLoop.exactHeadReviewSubmissionCount) &&
    Number.isSafeInteger(pullRequest.reviewLoop.reviewSubmissionCount) &&
    pullRequest.reviewLoop.exactHeadReviewSubmissionCount >= 0 &&
    pullRequest.reviewLoop.exactHeadReviewSubmissionCount <= pullRequest.reviewLoop.reviewSubmissionCount &&
    (pullRequest.reviewLoop.statusMarkerCommentId === null ||
      (Number.isSafeInteger(pullRequest.reviewLoop.statusMarkerCommentId) && pullRequest.reviewLoop.statusMarkerCommentId > 0)) &&
    (reviewLoopObserved
      ? LOOP_STATUSES_V1.has(pullRequest.reviewLoop.statusMarkerState) &&
        Number.isSafeInteger(pullRequest.reviewLoop.statusMarkerCommentId) &&
        pullRequest.reviewLoop.statusMarkerCommentId > 0 &&
        Number.isSafeInteger(pullRequest.reviewLoop.retainedProcessedReviewCount) &&
        pullRequest.reviewLoop.retainedProcessedReviewCount >= 0 &&
        pullRequest.reviewLoop.retainedProcessedReviewCount <= 20 &&
        reportGroups !== null &&
        pullRequest.reviewLoop.retainedProcessedReviewCount <= pullRequest.reviewLoop.reviewSubmissionCount &&
        reportGroups.size <= pullRequest.reviewLoop.retainedProcessedReviewCount &&
        reportGroups.size <= pullRequest.reviewLoop.reviewSubmissionCount &&
        exactHeadReportGroupCount <= pullRequest.reviewLoop.exactHeadReviewSubmissionCount &&
        pullRequest.reviewLoop.confidence === 'api_attributed_strict_schema' &&
        exactStringArray(pullRequest.reviewLoop.provenance, ['audit.pullRequests.issueComments.codex-review-fix-loop:v1'])
      : pullRequest.reviewLoop.statusMarkerState === null &&
        pullRequest.reviewLoop.retainedProcessedReviewCount === null &&
        pullRequest.reviewLoop.confidence === 'unknown' &&
        exactStringArray(pullRequest.reviewLoop.provenance, [])) &&
    pullRequest.reviewLoop.causalAttribution === 'not_assessed' &&
    exactKeys(pullRequest.stack, [
      'classificationStatus',
      'parentCandidates',
      'childCandidates',
      'openGraphRole',
      'stackId',
      'position',
      'confidence',
      'method',
      'provenance',
      'causalAttribution',
      'reason'
    ]) &&
    ['classified', 'unknown'].includes(pullRequest.stack.classificationStatus) &&
    ['isolated', 'root', 'middle', 'leaf', 'ambiguous', 'unknown'].includes(pullRequest.stack.openGraphRole) &&
    candidateLists.every(
      (candidates) =>
        Array.isArray(candidates) &&
        candidates.every(validStackCandidate) &&
        candidates.every((candidate, index) => index === 0 || candidates[index - 1].number < candidate.number)
    ) &&
    pullRequest.stack.stackId === null &&
    pullRequest.stack.position === null &&
    pullRequest.stack.method === 'same-repository-open-pr-ref-topology-v1' &&
    exactStringArray(pullRequest.stack.provenance, ['audit.inventory.openPullRequests']) &&
    pullRequest.stack.causalAttribution === 'not_assessed' &&
    (stackKnown
      ? ['isolated', 'root', 'middle', 'leaf'].includes(pullRequest.stack.openGraphRole) &&
        pullRequest.stack.confidence === 'deterministic_observed_open_graph' &&
        pullRequest.stack.reason === null &&
        ((pullRequest.stack.openGraphRole === 'isolated' &&
          pullRequest.stack.parentCandidates.length === 0 &&
          pullRequest.stack.childCandidates.length === 0) ||
          (pullRequest.stack.openGraphRole === 'root' &&
            pullRequest.stack.parentCandidates.length === 0 &&
            pullRequest.stack.childCandidates.length > 0) ||
          (pullRequest.stack.openGraphRole === 'leaf' &&
            pullRequest.stack.parentCandidates.length > 0 &&
            pullRequest.stack.childCandidates.length === 0) ||
          (pullRequest.stack.openGraphRole === 'middle' &&
            pullRequest.stack.parentCandidates.length > 0 &&
            pullRequest.stack.childCandidates.length > 0))
      : ['ambiguous', 'unknown'].includes(pullRequest.stack.openGraphRole) &&
        pullRequest.stack.confidence === 'unknown' &&
        typeof pullRequest.stack.reason === 'string') &&
    candidateLists.flat().every((candidate) => candidate.number !== pullRequest.number) &&
    Array.isArray(findings) &&
    findings.every((finding) => validFinding(finding, pullRequest, observedAt, schema)) &&
    findingIds.every((id, index) => index === 0 || compareText(findingIds[index - 1], id) < 0) &&
    canonicalJson(pullRequest.findingSummary) === canonicalJson(findingSummary(findings))
  );
}

function validProjectorImplementation(implementation, compatibility) {
  return (
    exactKeys(implementation, ['kind', 'digest', 'files']) &&
    implementation.kind === compatibility.manifestKind &&
    /^sha256:[0-9a-f]{64}$/.test(String(implementation.digest || '')) &&
    Array.isArray(implementation.files) &&
    implementation.files.every((entry) => exactKeys(entry, ['path', 'digest']) && /^sha256:[0-9a-f]{64}$/.test(entry.digest)) &&
    canonicalJson(implementation.files.map((entry) => entry.path)) === canonicalJson(compatibility.manifestPaths) &&
    implementation.digest === sha256Prefixed(canonicalJson(implementation.files))
  );
}

export function validateAuditEvent(event, expectedPreviousDigest) {
  const compatibility = EVENT_SCHEMA_COMPATIBILITY.get(event?.schemaVersion);
  if (!compatibility || !Number.isSafeInteger(event?.schemaVersion)) {
    throw new Error('Audit analytics event schema version is unsupported.');
  }
  return compatibility.validate(event, expectedPreviousDigest, compatibility.schema);
}

function eventStreamView(event) {
  const compatibility = EVENT_SCHEMA_COMPATIBILITY.get(event?.schemaVersion);
  if (!compatibility || !Number.isSafeInteger(event?.schemaVersion)) {
    throw new Error('Audit analytics event schema version is unsupported.');
  }
  return compatibility.streamView(event);
}

function eventStreamViewV1(event) {
  return {
    repository: event.repository,
    runId: event.run.id,
    eventId: event.eventId,
    auditDigest: event.provenance.auditDigest,
    slotId: event.sampling.slotId,
    expectedAt: event.sampling.expectedAt,
    previousEventDigest: event.log.previousEventDigest,
    integrityDigest: event.integrity.digest,
    pullRequests: event.pullRequests,
    instructions: event.instructions
  };
}

function validateAuditEventV1(event, expectedPreviousDigest, schema = EVENT_SCHEMA_V1) {
  const projectorCompatibility = PROJECTOR_COMPATIBILITY.get(schema.schemaVersion)?.get(event?.provenance?.projector?.version);
  const expectedSlotId = `twice-daily:${event?.sampling?.expectedAt}`;
  const expectedAtMilliseconds = Date.parse(event?.sampling?.expectedAt);
  const startedAtMilliseconds = Date.parse(event?.run?.startedAt);
  if (
    !exactKeys(event, [
      'kind',
      'schemaVersion',
      'eventType',
      'eventId',
      'observedAt',
      'run',
      'repository',
      'sampling',
      'instructions',
      'pullRequests',
      'summary',
      'provenance',
      'confidence',
      'causalAttribution',
      'unknowns',
      'log',
      'integrity'
    ]) ||
    event.kind !== schema.kind ||
    event.schemaVersion !== schema.schemaVersion ||
    event.eventType !== schema.eventType ||
    event.eventId !== `${event.run?.id}:complete-snapshot` ||
    typeof event.run?.id !== 'string' ||
    event.run.id.length === 0 ||
    !exactKeys(event.run, ['id', 'startedAt', 'completedAt']) ||
    event.observedAt !== event.run?.completedAt ||
    !canonicalTimestamp(event.run?.startedAt) ||
    !canonicalTimestamp(event.run?.completedAt) ||
    Date.parse(event.run.startedAt) > Date.parse(event.run.completedAt) ||
    Date.parse(event.run.completedAt) - Date.parse(event.run.startedAt) > schema.maxAuditDurationMilliseconds ||
    !exactKeys(event.repository, ['nameWithOwner', 'nodeId']) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(event.repository.nameWithOwner || '')) ||
    typeof event.repository.nodeId !== 'string' ||
    event.repository.nodeId.length === 0 ||
    !exactKeys(event.sampling, ['cadence', 'slotId', 'expectedAt', 'coverageState', 'runnerVersion']) ||
    event.sampling?.cadence !== 'twice_daily_fixed_utc' ||
    event.sampling.slotId !== expectedSlotId ||
    !/^\d{4}-\d{2}-\d{2}T(?:00|12):00:00\.000Z$/.test(String(event.sampling?.expectedAt || '')) ||
    !canonicalTimestamp(event.sampling.expectedAt) ||
    startedAtMilliseconds < expectedAtMilliseconds ||
    startedAtMilliseconds > expectedAtMilliseconds + schema.slotWindowMilliseconds ||
    event.sampling?.coverageState !== 'complete' ||
    typeof event.sampling?.runnerVersion !== 'string' ||
    !event.sampling.runnerVersion ||
    event.sampling.runnerVersion.length > 128 ||
    !exactKeys(event.instructions, ['reviewer', 'fixer']) ||
    !validInstructionReference(event.instructions?.reviewer) ||
    !validInstructionReference(event.instructions?.fixer) ||
    !Array.isArray(event.pullRequests) ||
    !Array.isArray(event.unknowns) ||
    !event.unknowns.every(
      (entry) =>
        exactKeys(entry, ['path', 'reason']) &&
        typeof entry.path === 'string' &&
        entry.path.length > 0 &&
        typeof entry.reason === 'string' &&
        entry.reason.length > 0
    ) ||
    !exactKeys(event.provenance, [
      'auditKind',
      'auditSchemaVersion',
      'auditId',
      'auditDigest',
      'authenticatedAs',
      'apiVersion',
      'classifier',
      'projector',
      'collectionStatus'
    ]) ||
    event.provenance?.collectionStatus !== 'complete' ||
    !supportedSourceAudit(event) ||
    event.provenance?.auditId !== event.run.id ||
    !/^[0-9a-f]{64}$/.test(String(event.provenance?.auditDigest || '')) ||
    !validActor(event.provenance.authenticatedAs) ||
    !exactKeys(event.provenance.classifier, ['id', 'version']) ||
    event.provenance?.classifier?.id !== schema.classifierId ||
    event.provenance?.classifier?.version !== schema.classifierVersion ||
    !exactKeys(event.provenance.projector, ['id', 'version', 'implementation']) ||
    !projectorCompatibility ||
    event.provenance?.projector?.id !== projectorCompatibility.id ||
    !validProjectorImplementation(event.provenance.projector.implementation, projectorCompatibility) ||
    !exactKeys(event.confidence, ['completeness', 'currentness', 'causalAttribution', 'attestation']) ||
    event.confidence.completeness !== 'high' ||
    event.confidence.currentness !== 'bounded_observation_window' ||
    event.confidence.causalAttribution !== 'not_assessed' ||
    event.confidence?.attestation !== 'self_consistent_unkeyed_not_origin_authentication' ||
    !exactKeys(event.causalAttribution, ['status', 'statement']) ||
    event.causalAttribution?.status !== 'not_claimed' ||
    event.causalAttribution.statement !==
      'This event records observed associations only and does not attribute reviews, resolutions, or fixes causally.' ||
    !exactKeys(event.log, ['previousEventDigest']) ||
    event.log?.previousEventDigest !== expectedPreviousDigest ||
    !exactKeys(event.integrity, ['algorithm', 'digest']) ||
    event.integrity?.algorithm !== 'sha256' ||
    !/^[0-9a-f]{64}$/.test(String(event.integrity?.digest || ''))
  ) {
    throw new Error('Audit analytics event schema or append-chain metadata is invalid.');
  }
  const recomputed = addIntegrity(event);
  if (event.integrity.digest !== recomputed.integrity.digest) {
    throw new Error('Audit analytics event integrity digest is invalid.');
  }
  const numbers = event.pullRequests.map((pullRequest) => pullRequest.number);
  const nodeIds = event.pullRequests.map((pullRequest) => pullRequest.nodeId);
  if (
    numbers.some((number) => !Number.isSafeInteger(number) || number < 1) ||
    canonicalJson(numbers) !== canonicalJson([...numbers].sort((left, right) => left - right)) ||
    new Set(numbers).size !== numbers.length
  ) {
    throw new Error('Audit analytics event pull requests are not uniquely ordered.');
  }
  if (nodeIds.some((nodeId) => typeof nodeId !== 'string' || !nodeId) || new Set(nodeIds).size !== nodeIds.length) {
    throw new Error('Audit analytics event pull-request node IDs are not globally unique.');
  }
  if (
    !event.pullRequests.every((pullRequest) => validEventPullRequest(pullRequest, event.repository, event.observedAt, schema))
  ) {
    throw new Error('Audit analytics event pull-request schema is invalid.');
  }
  validateActorIdentityMappings(event);
  const findingIds = event.pullRequests.flatMap((pullRequest) => pullRequest.findings.map((finding) => finding.id));
  const rootCommentIds = event.pullRequests.flatMap((pullRequest) =>
    pullRequest.findings.map((finding) => finding.origin.commentId)
  );
  const rootCommentNodeIds = event.pullRequests.flatMap((pullRequest) =>
    pullRequest.findings.map((finding) => finding.origin.commentNodeId)
  );
  if (new Set(findingIds).size !== findingIds.length) {
    throw new Error('Audit analytics event review-thread observations are not globally unique.');
  }
  if (new Set(rootCommentIds).size !== rootCommentIds.length || new Set(rootCommentNodeIds).size !== rootCommentNodeIds.length) {
    throw new Error('Audit analytics event root-comment identities are not globally unique.');
  }
  validateReviewIdentityMappings(event.pullRequests);
  validateFixReportMappings(event.pullRequests);
  if (
    !event.pullRequests.every(
      (pullRequest) => canonicalJson(pullRequest.stack) === canonicalJson(stackMetadata(pullRequest, event.pullRequests))
    )
  ) {
    throw new Error('Audit analytics event stack topology is inconsistent with its pull-request inventory.');
  }
  if (canonicalJson(event.summary) !== canonicalJson(aggregateSummary(event.pullRequests))) {
    throw new Error('Audit analytics event summary is inconsistent.');
  }
  if (canonicalJson(event.unknowns) !== canonicalJson(eventUnknowns(event.pullRequests, event.instructions))) {
    throw new Error('Audit analytics event unknown-state index is inconsistent.');
  }
  return event;
}

function validateReviewIdentityMappings(pullRequests) {
  const byDatabaseId = new Map();
  const byNodeId = new Map();
  for (const finding of pullRequests.flatMap((pullRequest) => pullRequest.findings)) {
    const { reviewId, reviewNodeId, reviewedCommitOid } = finding.origin;
    if (reviewNodeId === null) continue;
    const databaseTuple = canonicalJson({ reviewNodeId, reviewedCommitOid });
    const nodeTuple = canonicalJson({ reviewId, reviewedCommitOid });
    if (reviewId !== null && byDatabaseId.has(reviewId) && byDatabaseId.get(reviewId) !== databaseTuple) {
      throw new Error('Audit analytics event review identities are inconsistent across findings.');
    }
    if (byNodeId.has(reviewNodeId) && byNodeId.get(reviewNodeId) !== nodeTuple) {
      throw new Error('Audit analytics event review identities are inconsistent across findings.');
    }
    if (reviewId !== null) byDatabaseId.set(reviewId, databaseTuple);
    byNodeId.set(reviewNodeId, nodeTuple);
  }
}

function fixReportSourceEntry(report) {
  const sourceEntry = { ...report };
  delete sourceEntry.threadId;
  return sourceEntry;
}

function collectFixReportGroups(pullRequest) {
  const groups = new Map();
  for (const finding of pullRequest?.findings || []) {
    for (const report of finding?.fixLink?.reports || []) {
      if (!/^[1-9]\d*$/.test(String(report.reviewId || '')) || !Number.isSafeInteger(Number(report.reviewId))) {
        return null;
      }
      const key = `${report.sourceCommentId}\0${report.reviewId}`;
      const sourceEntry = fixReportSourceEntry(report);
      if (!groups.has(key)) groups.set(key, sourceEntry);
    }
  }
  return groups;
}

function validateFixReportMappings(pullRequests) {
  for (const pullRequest of pullRequests) {
    const groups = new Map();
    for (const finding of pullRequest.findings) {
      for (const report of finding.fixLink.reports || []) {
        const key = `${report.sourceCommentId}\0${report.reviewId}`;
        const sourceEntry = canonicalJson(fixReportSourceEntry(report));
        if (groups.has(key) && groups.get(key) !== sourceEntry) {
          throw new Error('Audit analytics event marker reports are inconsistent across referenced findings.');
        }
        groups.set(key, sourceEntry);
      }
    }
  }
}

function validateActorIdentityMappings(event) {
  const actorById = new Map();
  const actorByLogin = new Map();
  const actors = [
    event.provenance.authenticatedAs,
    ...event.pullRequests.map((pullRequest) => pullRequest.author),
    ...event.pullRequests.flatMap((pullRequest) => pullRequest.findings.map((finding) => finding.source.actor))
  ].filter((actor) => actor?.id !== null && actor?.id !== undefined);
  for (const actor of actors) {
    const login = actor.login.toLowerCase();
    const type = actor.type;
    const byId = canonicalJson({ login, type });
    const byLogin = canonicalJson({ id: actor.id, type });
    if (
      (actorById.has(actor.id) && actorById.get(actor.id) !== byId) ||
      (actorByLogin.has(login) && actorByLogin.get(login) !== byLogin)
    ) {
      throw new Error('Audit analytics event actor identities are inconsistent across observations.');
    }
    actorById.set(actor.id, byId);
    actorByLogin.set(login, byLogin);
  }
}

async function validateEventLogHandle(handle) {
  const metadata = await handle.stat();
  if (
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o777) !== 0o600 ||
    (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
  ) {
    throw new Error('Audit analytics event log must be a runner-owned mode-0600 single-link regular file.');
  }
  return metadata;
}

async function readEventLogHandle(handle) {
  const before = await validateEventLogHandle(handle);
  if (!Number.isSafeInteger(before.size) || before.size < 0) {
    throw new Error('Audit analytics event log size is invalid.');
  }
  const buffer = Buffer.alloc(before.size);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) throw new Error('Audit analytics event log read was incomplete.');
    offset += bytesRead;
  }
  const after = await validateEventLogHandle(handle);
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
    throw new Error('Audit analytics event log changed while it was being read.');
  }
  return buffer.toString('utf8');
}

async function openExistingEventLog(filename) {
  let handle;
  try {
    handle = await open(
      filename,
      constants.O_RDWR | constants.O_APPEND | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0)
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const identity = await validateEventLogHandle(handle);
    return { handle, identity };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

function parseEventLog(raw, repositoryIdentity) {
  if (raw && !raw.endsWith('\n')) throw new Error('Audit analytics event log has an unterminated final record.');
  const lines = raw ? raw.slice(0, -1).split('\n') : [];
  if (lines.some((line) => !line.trim())) throw new Error('Audit analytics event log contains a blank record.');
  const events = [];
  const runIds = new Set();
  const sourceDigests = new Set();
  const slotIds = new Set();
  const expectedSlots = new Set();
  let previousDigest = null;
  let previousExpectedAt = null;
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`Audit analytics event log record ${index + 1} is invalid JSON.`);
    }
    if (line !== canonicalJson(event)) {
      throw new Error(`Audit analytics event log record ${index + 1} is not canonical JSON.`);
    }
    validateAuditEvent(event, previousDigest);
    const view = eventStreamView(event);
    if (view.repository.nodeId !== repositoryIdentity.nodeId) {
      throw new Error(`Audit analytics event log record ${index + 1} belongs to another repository stream.`);
    }
    if (
      runIds.has(view.runId) ||
      sourceDigests.has(view.auditDigest) ||
      slotIds.has(view.slotId) ||
      expectedSlots.has(view.expectedAt) ||
      (previousExpectedAt !== null && view.expectedAt <= previousExpectedAt)
    ) {
      throw new Error(`Audit analytics event log record ${index + 1} duplicates or reorders an analytics slot.`);
    }
    runIds.add(view.runId);
    sourceDigests.add(view.auditDigest);
    slotIds.add(view.slotId);
    expectedSlots.add(view.expectedAt);
    events.push(event);
    previousDigest = view.integrityDigest;
    previousExpectedAt = view.expectedAt;
  }
  validatePullRequestIdentityStream(events);
  validateReviewThreadIdentityStream(events);
  validateInstructionIdentityStream(events);
  return events;
}

function validatePullRequestIdentityStream(events) {
  const nodeIdByNumber = new Map();
  const numberByNodeId = new Map();
  const chronologyByNodeId = new Map();
  for (const rawEvent of events) {
    const event = eventStreamView(rawEvent);
    for (const pullRequest of event.pullRequests) {
      if (
        (nodeIdByNumber.has(pullRequest.number) && nodeIdByNumber.get(pullRequest.number) !== pullRequest.nodeId) ||
        (numberByNodeId.has(pullRequest.nodeId) && numberByNodeId.get(pullRequest.nodeId) !== pullRequest.number)
      ) {
        throw new Error('Audit analytics event log pull-request identity mapping changed across records.');
      }
      nodeIdByNumber.set(pullRequest.number, pullRequest.nodeId);
      numberByNodeId.set(pullRequest.nodeId, pullRequest.number);
      const previousChronology = chronologyByNodeId.get(pullRequest.nodeId);
      if (
        previousChronology &&
        (previousChronology.createdAt !== pullRequest.createdAt ||
          Date.parse(pullRequest.updatedAt) < Date.parse(previousChronology.updatedAt))
      ) {
        throw new Error('Audit analytics event log pull-request chronology changed across records.');
      }
      chronologyByNodeId.set(pullRequest.nodeId, {
        createdAt: pullRequest.createdAt,
        updatedAt: pullRequest.updatedAt
      });
    }
  }
}

function validateReviewThreadIdentityStream(events) {
  const observationByThreadId = new Map();
  const threadIdByRootCommentId = new Map();
  const threadIdByRootCommentNodeId = new Map();
  const knownReviewByThreadId = new Map();
  const knownReviewByDatabaseId = new Map();
  const knownReviewByNodeId = new Map();
  for (const rawEvent of events) {
    const event = eventStreamView(rawEvent);
    for (const pullRequest of event.pullRequests) {
      for (const finding of pullRequest.findings) {
        const observation = {
          pullRequestNumber: pullRequest.number,
          pullRequestNodeId: pullRequest.nodeId,
          rootCommentId: finding.origin.commentId,
          rootCommentNodeId: finding.origin.commentNodeId
        };
        const previousObservation = observationByThreadId.get(finding.origin.nodeId);
        if (
          (previousObservation && canonicalJson(previousObservation) !== canonicalJson(observation)) ||
          (threadIdByRootCommentId.has(observation.rootCommentId) &&
            threadIdByRootCommentId.get(observation.rootCommentId) !== finding.origin.nodeId) ||
          (threadIdByRootCommentNodeId.has(observation.rootCommentNodeId) &&
            threadIdByRootCommentNodeId.get(observation.rootCommentNodeId) !== finding.origin.nodeId)
        ) {
          throw new Error('Audit analytics event log review-thread identity mapping changed across records.');
        }
        observationByThreadId.set(finding.origin.nodeId, observation);
        threadIdByRootCommentId.set(observation.rootCommentId, finding.origin.nodeId);
        threadIdByRootCommentNodeId.set(observation.rootCommentNodeId, finding.origin.nodeId);

        const review = {
          reviewId: finding.origin.reviewId,
          reviewNodeId: finding.origin.reviewNodeId,
          reviewedCommitOid: finding.origin.reviewedCommitOid
        };
        reconcileKnownIdentity(
          knownReviewByThreadId,
          finding.origin.nodeId,
          review,
          'Audit analytics event log review-thread identity mapping changed across records.'
        );

        if (review.reviewId !== null) {
          reconcileKnownIdentity(
            knownReviewByDatabaseId,
            review.reviewId,
            {
              pullRequestNodeId: pullRequest.nodeId,
              reviewNodeId: review.reviewNodeId,
              reviewedCommitOid: review.reviewedCommitOid
            },
            'Audit analytics event log review identity mapping changed across records.'
          );
        }
        if (review.reviewNodeId !== null) {
          reconcileKnownIdentity(
            knownReviewByNodeId,
            review.reviewNodeId,
            {
              pullRequestNodeId: pullRequest.nodeId,
              reviewId: review.reviewId,
              reviewedCommitOid: review.reviewedCommitOid
            },
            'Audit analytics event log review identity mapping changed across records.'
          );
        }
      }
    }
  }
}

function reconcileKnownIdentity(map, key, candidate, errorMessage) {
  const known = map.get(key) || {};
  for (const [field, value] of Object.entries(candidate)) {
    if (known[field] !== undefined && value !== null && known[field] !== value) throw new Error(errorMessage);
    if (value !== null) known[field] = value;
  }
  map.set(key, known);
}

function validateInstructionIdentityStream(events) {
  const digestByRoleAndId = new Map();
  for (const rawEvent of events) {
    const event = eventStreamView(rawEvent);
    for (const role of ['reviewer', 'fixer']) {
      const instruction = event.instructions[role];
      if (instruction.id === null || instruction.digest === null) continue;
      const key = `${role}\0${instruction.id}`;
      if (digestByRoleAndId.has(key) && digestByRoleAndId.get(key) !== instruction.digest) {
        throw new Error('Audit analytics event log instruction identity mapping changed across records.');
      }
      digestByRoleAndId.set(key, instruction.digest);
    }
  }
}

export async function appendCompleteAuditEvent({
  filename,
  record,
  repository,
  expectedRunId,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  now,
  sampling,
  reviewerInstruction,
  fixerInstruction,
  lockLeaseMilliseconds = LOCK_LEASE_MILLISECONDS,
  appendWrite = (handle, payload) => handle.write(payload)
}) {
  verifyAuditRecord(record, { repository, expectedRunId, maxAgeSeconds, now });
  if (typeof appendWrite !== 'function') throw new Error('Audit analytics append writer is invalid.');
  const requested = path.resolve(filename);
  await mkdir(path.dirname(requested), { recursive: true });
  const resolved = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  const lockFile = `${resolved}.lock`;
  let lockHandle;
  let lockIdentity;
  let lockOwnerFile;
  let operationError;
  let appendedEvent;
  try {
    const lock = await acquireAppendLock(lockFile, now, lockLeaseMilliseconds);
    lockHandle = lock.handle;
    lockIdentity = lock.identity;
    lockOwnerFile = lock.ownerFile;
    const existingLog = await openExistingEventLog(resolved);
    let logHandle = existingLog?.handle || null;
    let logIdentity = existingLog?.identity || null;
    let created = false;
    let appendStarted = false;
    let preAppendSize = null;
    let preAppendRaw = null;
    let appendPayload = null;
    try {
      preAppendRaw = logHandle ? await readEventLogHandle(logHandle) : '';
      const events = parseEventLog(preAppendRaw, record.repository);
      const previousEventDigest = events.length > 0 ? eventStreamView(events.at(-1)).integrityDigest : null;
      const proof = verifyAuditRecord(record, {
        repository,
        expectedRunId,
        maxAgeSeconds,
        now: now || new Date()
      });
      const event = createAuditEvent(record, proof, {
        sampling,
        reviewerInstruction,
        fixerInstruction,
        previousEventDigest
      });
      validateAuditEvent(event, previousEventDigest);
      validatePullRequestIdentityStream([...events, event]);
      validateReviewThreadIdentityStream([...events, event]);
      validateInstructionIdentityStream([...events, event]);
      const eventView = eventStreamView(event);
      if (
        events.some((existing) => {
          const existingView = eventStreamView(existing);
          return (
            existingView.runId === eventView.runId ||
            existingView.eventId === eventView.eventId ||
            existingView.auditDigest === eventView.auditDigest ||
            existingView.slotId === eventView.slotId ||
            existingView.expectedAt === eventView.expectedAt
          );
        }) ||
        (events.length > 0 && eventStreamView(events.at(-1)).expectedAt >= eventView.expectedAt)
      ) {
        throw new Error(`Audit analytics event log already contains or follows slot ${eventView.slotId}.`);
      }
      if (!logHandle) {
        try {
          logHandle = await open(
            resolved,
            constants.O_RDWR |
              constants.O_APPEND |
              constants.O_CREAT |
              constants.O_EXCL |
              (constants.O_NOFOLLOW || 0) |
              (constants.O_NONBLOCK || 0),
            0o600
          );
        } catch (error) {
          if (error?.code === 'EEXIST') {
            throw new Error('Audit analytics event log appeared after the locked absence check.', { cause: error });
          }
          throw error;
        }
        created = true;
        logIdentity = await validateEventLogHandle(logHandle);
      }
      const preAppendIdentity = await validateEventLogHandle(logHandle);
      if (preAppendIdentity.dev !== logIdentity.dev || preAppendIdentity.ino !== logIdentity.ino) {
        throw new Error('Audit analytics event log identity changed before append.');
      }
      preAppendSize = preAppendIdentity.size;
      if (preAppendSize !== Buffer.byteLength(preAppendRaw, 'utf8')) {
        throw new Error('Audit analytics event log size did not match its validated bytes.');
      }
      appendPayload = Buffer.from(`${canonicalJson(event)}\n`, 'utf8');
      appendStarted = true;
      const { bytesWritten } = await appendWrite(logHandle, appendPayload);
      if (bytesWritten !== appendPayload.length) throw new Error('Audit analytics event append was incomplete.');
      await logHandle.sync();
      if (created) {
        const parentHandle = await open(path.dirname(resolved), 'r');
        try {
          await parentHandle.sync();
        } finally {
          await parentHandle.close();
        }
      }
      const appendedEvents = parseEventLog(await readEventLogHandle(logHandle), record.repository);
      const tail = appendedEvents.at(-1);
      const tailView = tail ? eventStreamView(tail) : null;
      if (tailView?.eventId !== eventView.eventId || tailView?.integrityDigest !== eventView.integrityDigest) {
        throw new Error('Audit analytics event was not the validated final append.');
      }
      const finalIdentity = await lstat(resolved);
      if (finalIdentity.dev !== logIdentity.dev || finalIdentity.ino !== logIdentity.ino) {
        throw new Error('Audit analytics event log pathname changed before append verification completed.');
      }
      appendedEvent = event;
    } catch (error) {
      if (
        appendStarted &&
        logHandle &&
        Number.isSafeInteger(preAppendSize) &&
        preAppendSize >= 0 &&
        typeof preAppendRaw === 'string' &&
        Buffer.isBuffer(appendPayload)
      ) {
        try {
          const current = await validateEventLogHandle(logHandle);
          if (
            current.dev !== logIdentity.dev ||
            current.ino !== logIdentity.ino ||
            current.size < preAppendSize ||
            current.size > preAppendSize + appendPayload.length
          ) {
            throw new Error('event-log identity or size changed outside the intended append', { cause: error });
          }
          const appendedByteCount = current.size - preAppendSize;
          const appendedBytes = Buffer.alloc(appendedByteCount);
          let appendedOffset = 0;
          while (appendedOffset < appendedByteCount) {
            const { bytesRead } = await logHandle.read(
              appendedBytes,
              appendedOffset,
              appendedByteCount - appendedOffset,
              preAppendSize + appendedOffset
            );
            if (bytesRead === 0) {
              throw new Error('event-log rollback could not read the appended suffix', { cause: error });
            }
            appendedOffset += bytesRead;
          }
          if (!appendedBytes.equals(appendPayload.subarray(0, appendedByteCount))) {
            throw new Error('event-log suffix was not the intended payload prefix', { cause: error });
          }
          const currentPath = await lstat(resolved);
          if (currentPath.dev !== logIdentity.dev || currentPath.ino !== logIdentity.ino) {
            throw new Error('event-log pathname changed before rollback', { cause: error });
          }
          await logHandle.truncate(preAppendSize);
          await logHandle.sync();
          const restoredRaw = await readEventLogHandle(logHandle);
          if (restoredRaw !== preAppendRaw) {
            throw new Error('event-log bytes were not restored exactly', { cause: error });
          }
          parseEventLog(restoredRaw, record.repository);
        } catch (rollbackError) {
          throw new Error(
            `Audit analytics event append failed (${error instanceof Error ? error.message : String(error)}) and rollback was incomplete: ${rollbackError.message}`,
            { cause: rollbackError }
          );
        }
      }
      throw error;
    } finally {
      await logHandle?.close();
    }
  } catch (error) {
    operationError = error;
  }
  let cleanupError;
  try {
    await lockHandle?.close();
    if (lockHandle) {
      const currentLock = await lstat(lockFile);
      if (currentLock.dev !== lockIdentity.dev || currentLock.ino !== lockIdentity.ino) {
        throw new Error('Audit analytics event lock identity changed before cleanup.');
      }
      const currentOwner = await lstat(lockOwnerFile);
      if (
        currentOwner.dev !== lockIdentity.dev ||
        currentOwner.ino !== lockIdentity.ino ||
        currentLock.nlink !== 2 ||
        currentOwner.nlink !== 2
      ) {
        throw new Error('Audit analytics event lock owner link changed before cleanup.');
      }
      await unlink(lockFile);
      const remainingOwner = await lstat(lockOwnerFile);
      if (remainingOwner.dev !== lockIdentity.dev || remainingOwner.ino !== lockIdentity.ino || remainingOwner.nlink !== 1) {
        throw new Error('Audit analytics event lock owner link changed during cleanup.');
      }
      await unlink(lockOwnerFile);
    }
  } catch (error) {
    cleanupError = error;
  }
  if (operationError && cleanupError) {
    const operationMessage = operationError instanceof Error ? operationError.message : String(operationError);
    const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    throw new AggregateError(
      [operationError, cleanupError],
      `Audit analytics event operation failed (${operationMessage}) and lock cleanup failed (${cleanupMessage}); manual lock recovery may be required.`
    );
  }
  if (operationError) throw operationError;
  if (cleanupError) throw new Error(`Audit event appended but lock cleanup failed: ${cleanupError.message}`);
  return appendedEvent;
}

function option(args, flag) {
  const indexes = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length > 1) throw new Error(`${flag} may be supplied only once.`);
  if (indexes.length === 0) return undefined;
  const value = args[indexes[0] + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function requiredOption(args, flag) {
  const value = option(args, flag);
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required.`);
  return value;
}

function instructionOptions(args, prefix) {
  return {
    id: option(args, `--${prefix}-instruction-id`),
    digest: option(args, `--${prefix}-instruction-digest`)
  };
}

async function runAppend(args) {
  const allowedFlags = new Set([
    '--input',
    '--event-log',
    '--repo',
    '--expect-run-id',
    '--max-age-seconds',
    '--slot-id',
    '--slot-expected-at',
    '--runner-version',
    '--reviewer-instruction-id',
    '--reviewer-instruction-digest',
    '--fixer-instruction-id',
    '--fixer-instruction-digest'
  ]);
  if (args.length % 2 !== 0 || args.some((value, index) => index % 2 === 0 && !allowedFlags.has(value))) {
    throw new Error('Audit analytics append arguments contain an unknown flag or missing value.');
  }
  const filename = requiredOption(args, '--input');
  const eventLog = requiredOption(args, '--event-log');
  const repository = requiredOption(args, '--repo');
  const expectedRunId = requiredOption(args, '--expect-run-id');
  const maxAgeValue = option(args, '--max-age-seconds');
  const maxAgeSeconds = maxAgeValue === undefined ? DEFAULT_MAX_AGE_SECONDS : Number(maxAgeValue);
  const record = JSON.parse(await readFile(filename, 'utf8'));
  const event = await appendCompleteAuditEvent({
    filename: eventLog,
    record,
    repository,
    expectedRunId,
    maxAgeSeconds,
    sampling: {
      slotId: requiredOption(args, '--slot-id'),
      expectedAt: requiredOption(args, '--slot-expected-at'),
      runnerVersion: requiredOption(args, '--runner-version')
    },
    reviewerInstruction: instructionOptions(args, 'reviewer'),
    fixerInstruction: instructionOptions(args, 'fixer')
  });
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export async function main(args = process.argv.slice(2)) {
  if (args[0] === 'append') return runAppend(args.slice(1));
  throw new Error('Usage: codex-pr-review-audit-event.mjs append [options]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
