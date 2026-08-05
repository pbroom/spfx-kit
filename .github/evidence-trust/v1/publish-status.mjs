import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATUS_CONTEXT = 'spfx-kit/evidence-history-v1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(env, key) {
  const value = env[key];
  assert(typeof value === 'string' && value.length > 0, `${key} is required.`);
  return value;
}

function statusEnvironment(env) {
  const apiUrl = requiredEnvironment(env, 'GITHUB_API_URL');
  const repository = requiredEnvironment(env, 'GITHUB_REPOSITORY');
  const token = requiredEnvironment(env, 'GITHUB_TOKEN');
  const candidateSha = requiredEnvironment(env, 'CANDIDATE_SHA');
  const runUrl = requiredEnvironment(env, 'RUN_URL');
  assert(/^https:\/\/api\.github\.com$/.test(apiUrl), 'GITHUB_API_URL must be the public GitHub API origin.');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository), 'GITHUB_REPOSITORY is invalid.');
  assert(/^[0-9a-f]{40}$/.test(candidateSha), 'CANDIDATE_SHA must be a full lowercase commit SHA.');
  assert(/^https:\/\/github\.com\//.test(runUrl), 'RUN_URL must be a public GitHub run URL.');
  return { apiUrl, repository, token, candidateSha, runUrl };
}

async function githubRequest(fetchImpl, environment, apiPath, options = {}) {
  const response = await fetchImpl(`${environment.apiUrl}${apiPath}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${environment.token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...options.headers
    }
  });
  const responseText = await response.text();
  assert(response.ok, `GitHub API ${options.method ?? 'GET'} ${apiPath} failed with ${response.status}.`);
  return responseText.length === 0 ? undefined : JSON.parse(responseText);
}

async function postStatus(fetchImpl, environment, state, description) {
  return githubRequest(fetchImpl, environment, `/repos/${environment.repository}/statuses/${environment.candidateSha}`, {
    method: 'POST',
    body: JSON.stringify({ state, context: STATUS_CONTEXT, description, target_url: environment.runUrl })
  });
}

export async function publishPendingStatus({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const environment = statusEnvironment(env);
  await postStatus(fetchImpl, environment, 'pending', 'Trusted base validator is checking candidate Git data');
  return { state: 'pending', candidateSha: environment.candidateSha };
}

export async function publishTerminalStatus({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const environment = statusEnvironment(env);
  const pullRequestNumber = requiredEnvironment(env, 'PR_NUMBER');
  const validationOutcome = env.VALIDATION_OUTCOME?.length > 0 ? env.VALIDATION_OUTCOME : 'unavailable';
  assert(/^[1-9][0-9]*$/.test(pullRequestNumber), 'PR_NUMBER must be a positive integer.');
  const pullRequest = await githubRequest(fetchImpl, environment, `/repos/${environment.repository}/pulls/${pullRequestNumber}`);
  const currentHead = pullRequest?.head?.sha;
  assert(/^[0-9a-f]{40}$/.test(currentHead ?? ''), 'GitHub returned an invalid current PR head.');
  if (currentHead !== environment.candidateSha) {
    process.stdout.write(`Skipping stale status update for superseded head ${environment.candidateSha}\n`);
    return { state: 'stale', candidateSha: environment.candidateSha };
  }

  const success = validationOutcome === 'success';
  const state = success ? 'success' : 'failure';
  const description = success
    ? 'Trusted append-only evidence validation passed'
    : 'Trusted append-only evidence validation did not pass';
  await postStatus(fetchImpl, environment, state, description);
  assert(success, `Trusted validation outcome was ${validationOutcome}; failure status published.`);
  return { state, candidateSha: environment.candidateSha };
}

export async function runStatusCli(argv = process.argv.slice(2)) {
  assert(argv.length === 1, 'Usage: publish-status.mjs pending|terminal');
  if (argv[0] === 'pending') return publishPendingStatus();
  if (argv[0] === 'terminal') return publishTerminalStatus();
  throw new Error(`Unknown status command: ${argv[0]}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runStatusCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
