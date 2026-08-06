import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [compilerPackage, expectedVersion, project] = process.argv.slice(2);
if (!compilerPackage || !expectedVersion || !project) {
  throw new Error('Usage: typecheck.mjs <typescript-package> <expected-version> <tsconfig>');
}

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const pinnedSpecifiers = {
  typescript: '5.3.3',
  'typescript-5-8': 'npm:typescript@5.8.3'
};
if (
  pinnedSpecifiers[compilerPackage] !== (compilerPackage === 'typescript' ? expectedVersion : `npm:typescript@${expectedVersion}`)
) {
  throw new Error(`Unsupported compiler contract ${compilerPackage}@${expectedVersion}`);
}
const packageManifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
if (packageManifest.devDependencies?.[compilerPackage] !== pinnedSpecifiers[compilerPackage]) {
  throw new Error(`${compilerPackage}: package development dependency differs from the pinned compiler contract`);
}
const lock = JSON.parse(readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
const workspaceKey = 'packages/ui-profile';
const lockPackageKey = `node_modules/${compilerPackage}`;
if (lock.packages?.[workspaceKey]?.devDependencies?.[compilerPackage] !== pinnedSpecifiers[compilerPackage]) {
  throw new Error(`${compilerPackage}: lockfile workspace dependency differs from the pinned compiler contract`);
}
if (lock.packages?.[lockPackageKey]?.version !== expectedVersion) {
  throw new Error(`${compilerPackage}: lockfile package version differs from the pinned ${expectedVersion}`);
}
const compilerManifestPath = require.resolve(`${compilerPackage}/package.json`);
const compilerManifest = JSON.parse(readFileSync(compilerManifestPath, 'utf8'));
if (compilerManifest.name !== 'typescript' || compilerManifest.version !== expectedVersion) {
  throw new Error(
    `Resolved compiler package ${compilerManifest.name ?? 'unknown'}@${compilerManifest.version ?? 'unknown'} instead of pinned TypeScript ${expectedVersion}`
  );
}
const compilerRoot = realpathSync(path.dirname(compilerManifestPath));
const lockedCompilerRoot = realpathSync(path.join(repositoryRoot, lockPackageKey));
if (compilerRoot !== lockedCompilerRoot) {
  throw new Error(`${compilerPackage}: resolved compiler root differs from the lockfile package root`);
}
const compiler = require.resolve(`${compilerPackage}/lib/tsc`);
const relativeCompiler = path.relative(compilerRoot, realpathSync(compiler));
if (relativeCompiler.startsWith('..') || path.isAbsolute(relativeCompiler)) {
  throw new Error(`${compilerPackage}: compiler entrypoint escapes the pinned package root`);
}
const fileListing = spawnSync(process.execPath, [compiler, '-p', project, '--listFilesOnly'], {
  cwd: packageRoot,
  encoding: 'utf8'
});
if (fileListing.status !== 0) {
  process.stderr.write(fileListing.stdout ?? '');
  process.stderr.write(fileListing.stderr ?? '');
  process.exit(fileListing.status ?? 1);
}
const listedFiles = (fileListing.stdout ?? '')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((file) => path.resolve(file));
const reactTypeRoot = path.dirname(require.resolve('@types/react/package.json'));
const schedulerTypeRoot = path.dirname(require.resolve('@types/scheduler/package.json'));
const reactTypeFiles = listedFiles.filter((file) =>
  file.includes(`${path.sep}node_modules${path.sep}@types${path.sep}react${path.sep}`)
);
const schedulerTypeFiles = listedFiles.filter((file) =>
  file.includes(`${path.sep}node_modules${path.sep}@types${path.sep}scheduler${path.sep}`)
);
function isWithin(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
if (reactTypeFiles.length === 0 || reactTypeFiles.some((file) => !isWithin(reactTypeRoot, file))) {
  throw new Error(`TypeScript ${compilerPackage} did not resolve the pinned React 17 declaration root`);
}
if (
  !schedulerTypeFiles.some((file) => file === path.join(schedulerTypeRoot, 'tracing.d.ts')) ||
  schedulerTypeFiles.some((file) => !isWithin(schedulerTypeRoot, file))
) {
  throw new Error(`TypeScript ${compilerPackage} did not resolve the compatible scheduler/tracing type root`);
}
const child = spawn(process.execPath, [compiler, '-p', project, '--noEmit'], {
  cwd: packageRoot,
  stdio: 'inherit'
});

child.on('error', (error) => {
  throw error;
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
