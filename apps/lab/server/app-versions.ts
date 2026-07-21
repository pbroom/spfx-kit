import { spawn } from 'node:child_process';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ManagedAppVersionOption {
  id: string;
  label: string;
}

export interface ManagedAppVersionInfo {
  autoUpdate: boolean;
  current: string;
  selected: string;
  options: ManagedAppVersionOption[];
  canAutoUpdate: boolean;
  canSelect: boolean;
  updateAvailable: boolean;
  source: 'clone' | 'import' | 'local';
  detail?: string;
}

interface CloneMetadata {
  fork?: unknown;
  source?: unknown;
  ref?: unknown;
  versionPolicy?: unknown;
  [key: string]: unknown;
}

interface RemoteVersion {
  id: string;
  label: string;
  ref: string;
  sha: string;
}

interface RemoteVersions {
  latest: RemoteVersion;
  tags: RemoteVersion[];
}

const remoteRefCache = new Map<string, { expiresAt: number; value: Promise<RemoteVersions> }>();
const remoteRefTtlMs = 30_000;
const appVersionUpdates = new Set<string>();

export async function describeManagedAppVersion(appDir: string): Promise<ManagedAppVersionInfo> {
  try {
    return await describeManagedAppVersionUnsafe(appDir);
  } catch (error) {
    return {
      current: 'Unknown',
      autoUpdate: false,
      selected: 'local',
      options: [{ id: 'local', label: 'Unavailable' }],
      canAutoUpdate: false,
      canSelect: false,
      updateAvailable: false,
      source: 'local',
      detail: error instanceof Error ? `Could not read version metadata: ${error.message}` : 'Could not read version metadata.'
    };
  }
}

async function describeManagedAppVersionUnsafe(appDir: string): Promise<ManagedAppVersionInfo> {
  const current = await readPackageVersion(appDir);
  const cloneMetadata = await readJsonIfPresent<CloneMetadata>(path.join(appDir, '.spfx-kit', 'clone.json'));
  if (!cloneMetadata) {
    const imported = await readJsonIfPresent(path.join(appDir, '.spfx-kit', 'import.json'));
    return {
      current,
      autoUpdate: false,
      selected: imported ? 'imported' : 'local',
      options: [{ id: imported ? 'imported' : 'local', label: imported ? 'Imported' : 'Local' }],
      canAutoUpdate: false,
      canSelect: false,
      updateAvailable: false,
      source: imported ? 'import' : 'local',
      detail: imported ? 'Imported snapshots are not changed automatically.' : 'This app has no tracked update source.'
    };
  }

  const source = await resolveCloneSource(appDir, cloneMetadata);
  if (!source || !(await isIndependentGitRepository(appDir))) {
    return {
      current,
      autoUpdate: false,
      selected: 'local',
      options: [{ id: 'local', label: 'Local' }],
      canAutoUpdate: false,
      canSelect: false,
      updateAvailable: false,
      source: 'local',
      detail: 'This app is not an independent Git clone.'
    };
  }

  try {
    const [remote, head, branch, dirty] = await Promise.all([
      readRemoteVersions(source),
      runGit(appDir, ['rev-parse', 'HEAD']),
      runGit(appDir, ['branch', '--show-current']),
      runGit(appDir, ['status', '--porcelain', '--untracked-files=all'])
    ]);
    const selected = selectedVersionId(cloneMetadata, remote);
    const selectedVersion = selected === 'latest' ? remote.latest : remote.tags.find((tag) => tag.id === selected);
    const expectedBranch = remote.latest.ref.replace(/^refs\/heads\//, '');
    const clean = dirty.length === 0;
    const onSafeCheckout = selected === 'current' ? !branch : branch === expectedBranch || (!branch && selected !== 'latest');
    const latestRelationship =
      selected === 'latest'
        ? await describeLatestRelationship(appDir, head, remote.latest.sha, source, remote.latest.ref)
        : 'not-applicable';
    const safeRelationship = latestRelationship !== 'ahead' && latestRelationship !== 'diverged';
    const canSelect = onSafeCheckout && safeRelationship;
    const currentLabel =
      typeof cloneMetadata.versionPolicy === 'string' && cloneMetadata.versionPolicy.startsWith('tag:')
        ? cloneMetadata.versionPolicy.slice(4)
        : String(cloneMetadata.ref || 'checkout');
    const options = [
      ...(selected === 'current' ? [{ id: 'current', label: `Current · ${currentLabel}` }] : []),
      { id: remote.latest.id, label: remote.latest.label },
      ...remote.tags.map(({ id, label }) => ({ id, label }))
    ];

    return {
      current,
      autoUpdate: cloneMetadata.autoUpdate === true,
      selected,
      options,
      canAutoUpdate: clean && canSelect,
      canSelect,
      updateAvailable:
        selected === 'latest' ? latestRelationship === 'behind' : Boolean(selectedVersion && head !== selectedVersion.sha),
      source: 'clone',
      ...(selected === 'current'
        ? {
            detail: branch
              ? `Version changes are paused on tracked ref ${String(cloneMetadata.ref || branch)}.`
              : 'The pinned version is no longer available. Choose Latest or another version.'
          }
        : !onSafeCheckout
          ? { detail: `Update paused on feature branch ${branch || 'unknown'}.` }
          : latestRelationship === 'ahead'
            ? { detail: 'Update paused because this branch has local commits ahead of Latest.' }
            : latestRelationship === 'diverged'
              ? { detail: 'Update paused because this branch has diverged from Latest.' }
              : !clean
                ? {
                    detail:
                      'Automatic updates are paused because this app has local changes. Manual version changes save them to a Git stash.'
                  }
                : selected === 'latest' && cloneMetadata.autoUpdate !== true
                  ? { detail: 'Select Latest to enable automatic updates.' }
                  : {})
    };
  } catch (error) {
    return {
      current,
      autoUpdate: false,
      selected: 'latest',
      options: [{ id: 'latest', label: 'Latest' }],
      canAutoUpdate: false,
      canSelect: false,
      updateAvailable: false,
      source: 'clone',
      detail: error instanceof Error ? `Could not check versions: ${error.message}` : 'Could not check versions.'
    };
  }
}

export async function selectManagedAppVersion(
  appDir: string,
  versionId: string
): Promise<{ label: string; version: string; stashedLocalChanges: boolean }> {
  const canonicalAppDir = await realpath(appDir);
  if (appVersionUpdates.has(canonicalAppDir)) {
    throw new Error('A version update is already running for this app.');
  }
  appVersionUpdates.add(canonicalAppDir);
  try {
    return await selectManagedAppVersionUnlocked(canonicalAppDir, versionId);
  } finally {
    appVersionUpdates.delete(canonicalAppDir);
  }
}

async function selectManagedAppVersionUnlocked(
  appDir: string,
  versionId: string
): Promise<{ label: string; version: string; stashedLocalChanges: boolean }> {
  const metadataPath = path.join(appDir, '.spfx-kit', 'clone.json');
  const metadata = await readJsonIfPresent<CloneMetadata>(metadataPath);
  const source = metadata ? await resolveCloneSource(appDir, metadata) : '';
  if (!metadata || !source || !(await isIndependentGitRepository(appDir))) {
    throw new Error('Only independently cloned Git apps can change versions.');
  }

  const [remote, dirty, branch, head] = await Promise.all([
    readRemoteVersions(source, true),
    runGit(appDir, ['status', '--porcelain', '--untracked-files=all']),
    runGit(appDir, ['branch', '--show-current']),
    runGit(appDir, ['rev-parse', 'HEAD'])
  ]);
  const previousSelection = selectedVersionId(metadata, remote);
  const expectedBranch = remote.latest.ref.replace(/^refs\/heads\//, '');
  if (branch && branch !== expectedBranch) {
    throw new Error(`This app is on feature branch ${branch}. Switch it back to ${expectedBranch} before changing versions.`);
  }
  if (!branch && previousSelection === 'latest') {
    throw new Error(`This app is on an unrecognized detached checkout. Switch it back to ${expectedBranch} first.`);
  }

  if (versionId === 'latest') {
    const relationship = await describeLatestRelationship(appDir, head, remote.latest.sha, source, remote.latest.ref);
    if (relationship === 'ahead' || relationship === 'diverged') {
      throw new Error(`This app's ${expectedBranch} branch is ${relationship} from Latest. Reconcile it in Git before updating.`);
    }
  }

  const requested = versionId === 'latest' ? remote.latest : remote.tags.find((tag) => tag.id === versionId);
  if (!requested) {
    throw new Error('That app version is no longer available. Refresh the list and try again.');
  }

  const stashRef = dirty ? await stashLocalChanges(appDir, versionId) : '';
  let checkoutChanged = false;
  try {
    if (versionId === 'latest') {
      const trackingRef = 'refs/remotes/spfx-kit/latest';
      await runGit(appDir, ['fetch', '--no-tags', source, `+${remote.latest.ref}:${trackingRef}`], 20_000);
      await assertFetchedVersion(appDir, trackingRef, requested.sha);
      if (!branch) {
        await runGit(appDir, ['switch', expectedBranch], 0);
        checkoutChanged = true;
      }
      await runGit(appDir, ['merge', '--ff-only', trackingRef], 0);
      checkoutChanged = true;
      await assertFetchedVersion(appDir, 'HEAD', requested.sha);
    } else {
      const tagName = requested.ref.replace(/^refs\/tags\//, '');
      const privateTagRef = `refs/spfx-kit/tags/${tagName}`;
      await runGit(appDir, ['fetch', '--force', '--no-tags', source, `+${requested.ref}:${privateTagRef}`], 20_000);
      await assertFetchedVersion(appDir, privateTagRef, requested.sha);
      await runGit(appDir, ['switch', '--detach', privateTagRef], 0);
      checkoutChanged = true;
    }

    await writeJsonAtomically(metadataPath, {
      ...metadata,
      versionPolicy: versionId,
      versionResolvedSha: requested.sha,
      autoUpdate: versionId === 'latest'
    });
  } catch (error) {
    if (checkoutChanged) {
      await restoreCheckout(appDir, branch, head).catch(() => undefined);
    }
    if (stashRef) {
      await restoreStashedChanges(appDir, stashRef).catch(() => undefined);
    }
    throw error;
  }
  return {
    label: requested.label,
    version: await readPackageVersion(appDir),
    stashedLocalChanges: Boolean(stashRef)
  };
}

export function sortVersionTags(tags: string[]): string[] {
  return tags.filter((tag) => /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)).sort(compareSemverTagsDescending);
}

function selectedVersionId(metadata: CloneMetadata, remote: RemoteVersions): string {
  const initialRef = typeof metadata.ref === 'string' ? metadata.ref.replace(/^refs\/(?:heads|tags)\//, '') : '';
  const initialTag = remote.tags.find((tag) => tag.ref.replace(/^refs\/tags\//, '') === initialRef)?.id;
  const latestBranch = remote.latest.ref.replace(/^refs\/heads\//, '');
  const migratedPolicy = initialTag || (!initialRef || initialRef === latestBranch ? 'latest' : 'current');
  const policy = typeof metadata.versionPolicy === 'string' ? metadata.versionPolicy : migratedPolicy;
  if (policy.startsWith('tag:') && !remote.tags.some((tag) => tag.id === policy)) {
    return 'current';
  }
  return policy === 'latest' || policy === 'current' || remote.tags.some((tag) => tag.id === policy) ? policy : migratedPolicy;
}

function compareSemverTagsDescending(left: string, right: string): number {
  const a = parseSemverTag(left);
  const b = parseSemverTag(right);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) {
      return b[key] - a[key];
    }
  }
  if (!a.prerelease && b.prerelease) return -1;
  if (a.prerelease && !b.prerelease) return 1;
  if (!a.prerelease && !b.prerelease) return 0;
  const aParts = a.prerelease!.split('.');
  const bParts = b.prerelease!.split('.');
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    if (aParts[index] === undefined) return -1;
    if (bParts[index] === undefined) return 1;
    if (aParts[index] === bParts[index]) continue;
    const aNumber = /^\d+$/.test(aParts[index]) ? Number(aParts[index]) : undefined;
    const bNumber = /^\d+$/.test(bParts[index]) ? Number(bParts[index]) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return bNumber - aNumber;
    if (aNumber !== undefined) return 1;
    if (bNumber !== undefined) return -1;
    return bParts[index].localeCompare(aParts[index]);
  }
  return 0;
}

function parseSemverTag(tag: string) {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/)!;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] || '' };
}

async function readRemoteVersions(source: string, bustCache = false): Promise<RemoteVersions> {
  const cached = remoteRefCache.get(source);
  if (!bustCache && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const value = loadRemoteVersions(source);
  remoteRefCache.set(source, { expiresAt: Date.now() + remoteRefTtlMs, value });
  try {
    return await value;
  } catch (error) {
    remoteRefCache.delete(source);
    throw error;
  }
}

async function loadRemoteVersions(source: string): Promise<RemoteVersions> {
  const output = await runGit(undefined, ['ls-remote', '--symref', source, 'HEAD', 'refs/tags/*'], 10_000);
  const lines = output.split('\n').filter(Boolean);
  const headRef = lines.find((line) => line.startsWith('ref: '))?.split(/\s+/)[1];
  const headSha = lines.find((line) => line.endsWith('\tHEAD') && !line.startsWith('ref: '))?.split(/\s+/)[0];
  if (!headRef || !headSha) {
    throw new Error('the remote default branch could not be resolved.');
  }

  const tagShas = new Map<string, string>();
  const peeledShas = new Map<string, string>();
  for (const line of lines) {
    const [sha, ref] = line.split(/\s+/);
    if (!sha || !ref?.startsWith('refs/tags/')) {
      continue;
    }
    if (ref.endsWith('^{}')) {
      peeledShas.set(ref.slice(0, -3), sha);
    } else {
      tagShas.set(ref, sha);
    }
  }
  const tagNames = sortVersionTags([...tagShas.keys()].map((ref) => ref.replace(/^refs\/tags\//, '')));
  return {
    latest: { id: 'latest', label: 'Latest', ref: headRef, sha: headSha },
    tags: tagNames.slice(0, 30).map((tag) => {
      const ref = `refs/tags/${tag}`;
      return { id: `tag:${tag}`, label: tag, ref, sha: peeledShas.get(ref) || tagShas.get(ref)! };
    })
  };
}

async function resolveCloneSource(appDir: string, metadata: CloneMetadata): Promise<string> {
  const preferredRemote = typeof metadata.fork === 'string' && metadata.fork.trim() ? 'upstream' : 'origin';
  try {
    return await runGit(appDir, ['remote', 'get-url', preferredRemote]);
  } catch {
    const source = typeof metadata.source === 'string' ? metadata.source.trim() : '';
    return source && !path.isAbsolute(source) && !/^(?:[a-z]+:|git@)/i.test(source) ? path.resolve(appDir, source) : source;
  }
}

async function describeLatestRelationship(
  appDir: string,
  currentSha: string,
  latestSha: string,
  source: string,
  latestRef: string
): Promise<'equal' | 'behind' | 'ahead' | 'diverged'> {
  if (currentSha === latestSha) {
    return 'equal';
  }
  if (!(await gitSucceeds(appDir, ['cat-file', '-e', `${latestSha}^{commit}`]))) {
    await runGit(appDir, ['fetch', '--no-tags', source, `+${latestRef}:refs/remotes/spfx-kit/watch`], 20_000);
  }
  if (await gitSucceeds(appDir, ['merge-base', '--is-ancestor', currentSha, latestSha])) {
    return 'behind';
  }
  if (await gitSucceeds(appDir, ['merge-base', '--is-ancestor', latestSha, currentSha])) {
    return 'ahead';
  }
  return 'diverged';
}

async function assertFetchedVersion(appDir: string, ref: string, expectedSha: string): Promise<void> {
  const actualSha = await runGit(appDir, ['rev-parse', `${ref}^{commit}`]);
  if (actualSha !== expectedSha) {
    throw new Error('The remote version changed while it was being fetched. Refresh the list and try again.');
  }
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function restoreCheckout(appDir: string, branch: string, sha: string): Promise<void> {
  if (branch) {
    await runGit(appDir, ['switch', branch], 0);
    await runGit(appDir, ['reset', '--hard', sha], 0);
    return;
  }
  await runGit(appDir, ['switch', '--detach', sha], 0);
}

async function stashLocalChanges(appDir: string, versionId: string): Promise<string> {
  const previousStash = await runGit(appDir, ['rev-parse', '--verify', '--quiet', 'refs/stash']).catch(() => '');
  await runGit(appDir, ['stash', 'push', '--include-untracked', '--message', `spfx-kit: before switching to ${versionId}`], 0);
  const stashRef = await runGit(appDir, ['rev-parse', '--verify', 'refs/stash']);
  if (!stashRef || stashRef === previousStash) {
    throw new Error('Local changes could not be saved before changing versions.');
  }
  return stashRef;
}

async function restoreStashedChanges(appDir: string, stashRef: string): Promise<void> {
  await runGit(appDir, ['stash', 'apply', '--index', stashRef], 0);
  const currentStash = await runGit(appDir, ['rev-parse', '--verify', 'refs/stash']);
  if (currentStash === stashRef) {
    await runGit(appDir, ['stash', 'drop', 'stash@{0}'], 0);
  }
}

async function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  try {
    await runGit(cwd, args);
    return true;
  } catch {
    return false;
  }
}

async function isIndependentGitRepository(appDir: string): Promise<boolean> {
  try {
    const [topLevel, resolvedAppDir] = await Promise.all([
      runGit(appDir, ['rev-parse', '--show-toplevel']).then((directory) => realpath(directory)),
      realpath(appDir)
    ]);
    return topLevel === resolvedAppDir;
  } catch {
    return false;
  }
}

async function readPackageVersion(appDir: string): Promise<string> {
  const packageJson = await readJsonIfPresent<{ version?: unknown }>(path.join(appDir, 'package.json'));
  return typeof packageJson?.version === 'string' ? packageJson.version : 'Unknown';
}

async function readJsonIfPresent<T = Record<string, unknown>>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function runGit(cwd: string | undefined, args: string[], timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timeout = timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Git operation timed out.'));
        }, timeoutMs)
      : undefined;

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `git ${args[0]} failed.`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}
