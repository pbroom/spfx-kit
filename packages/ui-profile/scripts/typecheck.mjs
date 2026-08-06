import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [compilerPackage, project] = process.argv.slice(2);
if (!compilerPackage || !project) {
  throw new Error('Usage: typecheck.mjs <typescript-package> <tsconfig>');
}

const require = createRequire(import.meta.url);
const compiler = require.resolve(`${compilerPackage}/lib/tsc`);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const reactTypeRoot = path.join(packageRoot, 'node_modules', '@types', 'react');
const schedulerTypeRoot = path.join(packageRoot, 'node_modules', '@types', 'scheduler');
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
  throw new Error(`TypeScript ${compilerPackage} did not resolve the isolated profile React type root`);
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
